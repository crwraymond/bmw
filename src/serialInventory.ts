import type { DB, Doc, Line } from "./types";
import { serialValues } from "./serials";
export const serialKey = (value: string) =>
  value.trim().toLocaleUpperCase("id");
export const serialList = (value: string) =>
  serialValues(value)
    .map((s) => s.trim())
    .filter(Boolean);
const movement = (doc: Doc) =>
  ["purchase", "sale", "purchase_return", "sale_return"].includes(doc.kind);
const incoming = (doc: Doc) => ["purchase", "sale_return"].includes(doc.kind);
const ordered = (db: DB) =>
  db.documents
    .filter((d) => d.status === "final" && movement(d))
    .sort((a, b) => a.date.localeCompare(b.date) || a.seq - b.seq);
type Unit = {
  value: string;
  available: boolean;
  kind: Doc["kind"];
  lineId: string;
};
type Position = {
  quantity: number;
  units: Map<string, Unit>;
  tracked: boolean;
};
function positions(db: DB) {
  return new Map(
    db.items.map((i) => [
      i.id,
      {
        quantity: i.openingQty,
        units: new Map<string, Unit>(),
        tracked: false,
      },
    ]),
  );
}
function apply(doc: Doc, line: Line, state: Position) {
  const names = serialList(line.serials).slice(0, Math.floor(line.qty));
  const keys = new Set(names.map(serialKey));
  if (!incoming(doc)) {
    const available = [...state.units.values()].filter((s) => s.available);
    const anonymous = Math.max(0, state.quantity - available.length);
    const namedAvailable = names.filter(
      (s) => state.units.get(serialKey(s))?.available,
    ).length;
    // A legacy movement may omit which tracked units left. Hide ambiguous SNs
    // rather than inventing an identity for the units still physically present.
    if (line.qty - namedAvailable > anonymous + 0.00001)
      for (const [key, unit] of state.units)
        if (unit.available && !keys.has(key)) unit.available = false;
  }
  for (const value of names)
    state.units.set(serialKey(value), {
      value,
      available: incoming(doc),
      kind: doc.kind,
      lineId: line.id,
    });
  if (incoming(doc) && names.length) state.tracked = true;
  state.quantity =
    Math.round((state.quantity + (incoming(doc) ? 1 : -1) * line.qty) * 1000) /
    1000;
}
function requireValue(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
function validate(db: DB, doc: Doc, line: Line, state: Position) {
  const names = serialList(line.serials),
    keys = names.map(serialKey),
    label = `SN ${line.name}`;
  requireValue(
    new Set(keys).size === keys.length,
    `${label}: nomor duplikat dalam satu barang.`,
  );
  requireValue(
    names.length <= Math.floor(line.qty),
    `${label}: jumlah serial number melebihi Qty. Hapus SN di luar Qty.`,
  );
  if (doc.kind.endsWith("_return")) {
    const origin = db.lines.find((l) => l.id === line.refLineId);
    const originKeys = new Set(
      serialList(origin?.serials ?? "").map(serialKey),
    );
    for (const key of keys)
      requireValue(
        originKeys.has(key),
        `${label}: nomor tidak ada pada transaksi asal.`,
      );
    if (
      origin?.serials.trim() &&
      serialList(origin.serials).length === origin.qty
    )
      requireValue(
        names.length === line.qty,
        `${label}: pilih serial number yang diretur sesuai Qty.`,
      );
    for (const other of db.documents.filter(
      (d) =>
        d.status === "final" &&
        d.kind === doc.kind &&
        d.refId === doc.refId &&
        d.id !== doc.id &&
        (d.date < doc.date || (d.date === doc.date && d.seq < doc.seq)),
    ))
      for (const row of db.lines.filter(
        (l) => l.docId === other.id && l.refLineId === line.refLineId,
      ))
        requireValue(
          !serialList(row.serials).some((s) => keys.includes(serialKey(s))),
          `${label}: nomor sudah diretur.`,
        );
  }
  if (doc.kind === "purchase") {
    for (const key of keys) {
      const previous = state.units.get(key);
      requireValue(
        !previous ||
          (!previous.available && previous.kind === "purchase_return"),
        `${label}: nomor sudah pernah diterima dan belum diretur ke pemasok.`,
      );
    }
  } else if (doc.kind === "sale_return") {
    for (const key of keys)
      requireValue(
        !state.units.get(key)?.available,
        `${label}: nomor sudah ada di stok.`,
      );
  } else {
    const available = [...state.units.values()].filter(
      (s) => s.available,
    ).length;
    const anonymous = Math.max(0, state.quantity - available);
    let tracked = 0;
    for (const key of keys) {
      const unit = state.units.get(key);
      if (unit) {
        requireValue(
          unit.available,
          `${label}: nomor sudah terjual atau tidak tersedia.`,
        );
        tracked++;
      }
    }
    requireValue(
      !state.tracked || line.qty - tracked <= anonymous + 0.00001,
      `${label}: pilih serial number stok yang tersedia sesuai Qty.`,
    );
  }
}
export function validateSerialTimeline(db: DB) {
  const states = positions(db);
  for (const doc of ordered(db)) {
    requireValue(
      doc.serialTracking === undefined ||
        doc.serialTracking === "" ||
        doc.serialTracking === "v1",
      "Versi pelacakan SN tidak didukung.",
    );
    for (const line of db.lines.filter((l) => l.docId === doc.id)) {
      const state = states.get(line.itemId);
      if (!state) continue;
      if (doc.serialTracking === "v1") validate(db, doc, line, state);
      apply(doc, line, state);
    }
  }
}
export function availableSerials(
  db: DB,
  itemId: string,
  at: Doc,
): { values: string[]; tracked: boolean } {
  const state = positions(db).get(itemId);
  if (!state) return { values: [], tracked: false };
  const seq = db.documents.find((d) => d.id === at.id)?.seq || Infinity;
  const docs = ordered(db).filter((d) => d.id !== at.id);
  const before = (d: Doc) =>
    d.date < at.date || (d.date === at.date && d.seq < seq);
  for (const doc of docs.filter(before))
    for (const line of db.lines.filter(
      (l) => l.docId === doc.id && l.itemId === itemId,
    ))
      apply(doc, line, state);
  const values = [...state.units.entries()]
    .filter(([key, s]) => {
      if (!s.available) return false;
      // Keep units reserved by a later sale unless an intervening incoming
      // movement makes that same identity available again.
      const next = docs
        .filter((d) => !before(d))
        .find((d) =>
          db.lines.some(
            (l) =>
              l.docId === d.id &&
              l.itemId === itemId &&
              serialList(l.serials).some((v) => serialKey(v) === key),
          ),
        );
      return !next || incoming(next);
    })
    .map(([, s]) => s.value)
    .sort((a, b) => a.localeCompare(b));
  return { values, tracked: state.tracked };
}
export function serialErrors(
  db: DB,
  doc: Doc,
  lines: Line[],
): Map<string, string> {
  const errors = new Map<string, string>();
  if (!movement(doc) || doc.serialTracking !== "v1") return errors;
  const seq =
    db.documents.find((d) => d.id === doc.id)?.seq ||
    Math.max(0, ...db.documents.map((d) => d.seq)) + 1;
  const candidate = {
    ...doc,
    status: "final" as const,
    seq,
    serialTracking: "v1",
  };
  const work = {
    ...db,
    documents: [...db.documents.filter((d) => d.id !== doc.id), candidate],
    lines: [...db.lines.filter((l) => l.docId !== doc.id), ...lines],
  };
  const states = positions(work);
  for (const d of ordered(work))
    for (const l of work.lines.filter((l) => l.docId === d.id)) {
      const state = states.get(l.itemId);
      if (!state) continue;
      if (d.id === doc.id)
        try {
          validate(work, d, l, state);
        } catch (e) {
          errors.set(l.id, e instanceof Error ? e.message : String(e));
        }
      apply(d, l, state);
    }
  return errors;
}

export function validateSerialChanges(before: DB, after: DB) {
  for (const old of ordered(before)) {
    for (const line of before.lines.filter((l) => l.docId === old.id)) {
      const current = after.documents.find(
        (d) => d.id === old.id && d.status === "final",
      );
      const replacement = current
        ? after.lines.find(
            (l) => l.docId === old.id && l.itemId === line.itemId,
          )
        : undefined;
      const retained = new Set(
        serialList(replacement?.serials ?? "").map(serialKey),
      );
      for (const value of serialList(line.serials)) {
        const key = serialKey(value);
        if (retained.has(key)) continue;
        const dependent = after.lines.find(
          (l) =>
            l.itemId === line.itemId &&
            l.docId !== old.id &&
            serialList(l.serials).some((s) => serialKey(s) === key) &&
            after.documents.some(
              (d) =>
                d.id === l.docId &&
                d.status === "final" &&
                (l.refLineId === line.id ||
                  (incoming(old) &&
                    !incoming(d) &&
                    (d.date > old.date ||
                      (d.date === old.date && d.seq > old.seq)))),
            ),
        );
        requireValue(
          !dependent,
          `SN ${value} masih dipakai pada transaksi lain. Ubah atau hapus transaksi terkait terlebih dahulu.`,
        );
      }
    }
  }
}
