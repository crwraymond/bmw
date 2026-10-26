import {
  type DB,
  type Doc,
  type Line,
  type Item,
  type Party,
  type Kind,
  type Payment,
  uid,
  qty,
  labels,
} from "./types";
import {
  audit,
  balance,
  isReturn,
  linesOf,
  newDoc,
  newLine,
  partyKind,
  saveDoc,
  saveItem,
  saveParty,
  singleSupplier,
  stock,
  paid,
  returnedValue,
  withStoreDefaults,
} from "./domain";
import { downPaymentFor, recalculate } from "./revisions";
import { validateSerialChanges } from "./serialInventory";
import { parseCSV, csvNumber, headerKey, type CSVRow } from "./csv";

export type ImportTarget = "items" | "customer" | Kind | "payments";
export type ImportMode = "upsert" | "replace";
export const targets: ImportTarget[] = [
  "items",
  "customer",
  "customer_order",
  "supplier_order",
  "purchase",
  "sale",
  "sale_return",
  "purchase_return",
  "payments",
];
export const importLabel = (t: ImportTarget) =>
  t === "items"
    ? "Barang"
    : t === "customer"
      ? "Customer"
      : t === "payments"
        ? "Pembayaran"
        : labels[t];
const masterHeaders = {
  items: [
    "Kode",
    "Nama",
    "Satuan",
    "Isi",
    "Harga beli",
    "Harga jual",
    "Stok awal",
    "Nilai stok awal",
    "Stok minimum",
    "Aktif",
    "Stok tersedia",
    "Nilai stok tersedia",
  ],
  customer: [
    "Kode",
    "Nama",
    "Alamat",
    "Kota",
    "Telepon",
    "Fax",
    "Saldo awal",
    "Aktif",
    "Saldo berjalan",
  ],
};
const docHeaders = [
  "Nomor",
  "Tanggal",
  "Status",
  "Kode customer",
  "Kode barang",
  "Nama barang",
  "Satuan",
  "Qty",
  "Harga",
  "Jenis diskon produk",
  "Diskon produk",
  "Diskon total",
  "Uang muka",
  "SN",
  "Catatan",
  "Nomor order",
  "Nomor transaksi asal",
  "Kode barang asal",
  "Urutan",
  "Data invoice",
  "Total baris",
  "HPP baris",
  "Total",
];
const paymentHeaders = [
  "Nomor",
  "Tanggal",
  "Arah",
  "Kode customer",
  "Nominal",
  "Status",
  "Catatan",
  "Nomor tagihan",
  "Alokasi",
  "Nomor invoice uang muka",
];
export const importHeaders = (t: ImportTarget) => [
  "Jenis data",
  ...(t === "items" || t === "customer"
    ? masterHeaders[t]
    : t === "payments"
      ? paymentHeaders
      : docHeaders),
];
const snapshotKeys = [
  "serialTracking",
  "partyName",
  "partyAddress",
  "partyPhone",
  "terms",
  "issuerName",
  "issuerAddress",
  "issuerPhone",
  "bank",
  "beneficiary",
  "account",
  "bankBranch",
  "bankCode",
  "country",
  "warranty",
  "signature",
  "logo",
  "partnerLogo",
  "createdAt",
  "cancelReason",
] as const;
const norm = (v: string) => v.trim().toLowerCase();
const numberOf = (db: DB, id: string) =>
  db.documents.find((d) => d.id === id)?.number || "";
function paymentSource(db: DB, p: Payment) {
  if (p.sourceDocId) return p.sourceDocId;
  const allocations = db.allocations.filter((a) => a.paymentId === p.id);
  if (allocations.length !== 1) return "";
  const d = db.documents.find((d) => d.id === allocations[0].docId);
  return d?.kind === "sale" &&
    d.partyId === p.partyId &&
    d.downPayment === p.amount &&
    allocations[0].amount === p.amount &&
    p.notes.split("\n")[0] === `Uang muka ${d.number}`
    ? d.id
    : "";
}
export function exportData(db: DB, target: ImportTarget, ids?: string[]) {
  const include = (id: string) => !ids || ids.includes(id);
  let rows: (string | number)[][];
  if (target === "items")
    rows = db.items
      .filter((i) => include(i.id))
      .map((i) => [
        i.code,
        i.name,
        i.unit,
        i.pack,
        qty(i.buyPrice),
        qty(i.sellPrice),
        qty(i.openingQty),
        qty(i.openingCost),
        qty(i.minStock),
        i.active ? "ya" : "tidak",
        qty(stock(db, i.id).qty),
        qty(stock(db, i.id).value),
      ]);
  else if (target === "customer")
    rows = db.parties
      .filter((p) => p.kind === "customer" && include(p.id))
      .map((p) => [
        p.code,
        p.name,
        p.address,
        p.city,
        p.phone,
        p.fax,
        qty(p.openingBalance),
        p.active ? "ya" : "tidak",
        qty(balance(db, p.id)),
      ]);
  else if (target === "payments")
    rows = db.payments
      .filter((p) => include(p.id))
      .flatMap((p) => {
        const allocations = db.allocations.filter((a) => a.paymentId === p.id);
        const source = paymentSource(db, p);
        return (allocations.length ? allocations : [null]).map((a) => [
          p.number,
          p.date,
          p.direction,
          db.parties.find((x) => x.id === p.partyId && x.kind === "customer")
            ?.code || "",
          qty(p.amount),
          p.status,
          p.notes,
          a ? numberOf(db, a.docId) : "",
          a ? qty(a.amount) : "",
          numberOf(db, source),
        ]);
      });
  else
    rows = db.documents
      .filter((d) => d.kind === target && include(d.id))
      .flatMap((d) =>
        linesOf(db, d.id).map((l, index) => [
          d.number,
          d.date,
          d.status,
          db.parties.find((p) => p.id === d.partyId && p.kind === "customer")
            ?.code || "",
          db.items.find((i) => i.id === l.itemId)?.code || l.code,
          l.name,
          l.unit,
          qty(l.qty),
          qty(l.price),
          l.discountType || "amount",
          qty(l.discountValue || 0),
          qty(d.discount),
          qty(d.downPayment),
          l.serials,
          d.notes,
          numberOf(db, d.orderId),
          numberOf(db, d.refId),
          db.lines.find((x) => x.id === l.refLineId)?.code || "",
          String(d.seq),
          index === 0
            ? JSON.stringify(
                Object.fromEntries(snapshotKeys.map((k) => [k, d[k]])),
              )
            : "",
          qty(l.total),
          qty(l.cost),
          qty(d.total),
        ]),
      );
  return {
    headers: importHeaders(target),
    rows: rows.map((r) => [target, ...r]),
  };
}

function requireValue(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
const get = (r: CSVRow, name: string) => r.cells[headerKey(name)];
const text = (r: CSVRow, name: string, fallback = "") =>
  get(r, name) === undefined ? fallback : get(r, name)!.trim();
const num = (r: CSVRow, name: string, fallback = 0, signed = false) =>
  get(r, name) === undefined
    ? fallback
    : csvNumber(text(r, name), name, signed);
function active(r: CSVRow, fallback: boolean) {
  const v = text(r, "Aktif", fallback ? "ya" : "tidak").toLowerCase();
  requireValue(
    ["ya", "tidak", "true", "false", "1", "0", "aktif", "nonaktif"].includes(v),
    "Aktif harus ya atau tidak.",
  );
  return ["ya", "true", "1", "aktif"].includes(v);
}
function status(r: CSVRow, fallback: string, payment = false) {
  const v = text(r, "Status", fallback).toLowerCase();
  const mapped =
    ({ draf: "draft", dibatalkan: "cancelled" } as Record<string, string>)[v] ||
    v;
  requireValue(
    (payment
      ? ["final", "cancelled"]
      : ["draft", "final", "cancelled"]
    ).includes(mapped),
    "Status tidak valid.",
  );
  return mapped as Doc["status"];
}
function group(rows: CSVRow[], key: string) {
  const result = new Map<string, CSVRow[]>();
  for (const row of rows) {
    const value = norm(text(row, key));
    requireValue(value, `Baris ${row.line}: ${key} wajib diisi.`);
    result.set(value, [...(result.get(value) || []), row]);
  }
  return [...result.values()];
}
function consistent(rows: CSVRow[], names: string[]) {
  for (const name of names)
    requireValue(
      rows.every((r) => text(r, name) === text(rows[0], name)),
      `${name} berbeda pada nomor yang sama.`,
    );
}
export type ImportFile = {
  target: ImportTarget;
  text: string;
  empty?: boolean;
};
export type ImportChange = {
  target: ImportTarget;
  key: string;
  action: "Tambah" | "Perbarui" | "Hapus" | "Nonaktifkan";
};
export interface ImportPlan {
  db: DB;
  revision: number;
  changes: ImportChange[];
  warnings: string[];
  records: number;
}
export function detectImportTarget(content: string): ImportTarget {
  const parsed = parseCSV(content);
  const type = text(
    parsed.rows[0] || { line: 1, cells: {} },
    "Jenis data",
  ) as ImportTarget;
  requireValue(
    targets.includes(type),
    "File gabungan harus berasal dari Ekspor CSV terbaru (kolom Jenis data). Template kosong dipakai dari halaman data terkait.",
  );
  return type;
}
export function prepareImport(
  current: DB,
  files: ImportFile[],
  mode: ImportMode,
): ImportPlan {
  requireValue(files.length > 0, "Pilih minimal satu CSV.");
  requireValue(mode === "upsert" || mode === "replace", "Pilih mode impor.");
  requireValue(
    new Set(files.map((f) => f.target)).size === files.length,
    "Hanya satu file per jenis data dalam sekali impor.",
  );
  const work = withStoreDefaults(structuredClone(current));
  const changes: ImportChange[] = [],
    warnings: string[] = [],
    errors: string[] = [];
  const parsed = files.map((f) => {
    requireValue(targets.includes(f.target), "Jenis data tidak didukung.");
    const data = parseCSV(f.text);
    const required =
      f.target === "items"
        ? ["Kode", "Nama", "Satuan"]
        : f.target === "customer"
          ? ["Kode", "Nama"]
          : f.target === "payments"
            ? [
                "Nomor",
                "Tanggal",
                "Arah",
                "Nominal",
                "Nomor tagihan",
                "Alokasi",
              ]
            : ["Nomor", "Tanggal", "Kode barang", "Qty", "Harga"];
    for (const name of required)
      requireValue(
        data.headers.includes(headerKey(name)),
        `${importLabel(f.target)}: kolom ${name} wajib ada. Gunakan template atau ekspor CSV terbaru.`,
      );
    if (f.target === "items")
      requireValue(
        !data.headers.includes("stok") || data.headers.includes("stok awal"),
        "Kolom Stok dari ekspor lama adalah stok berjalan. Gunakan ekspor terbaru dengan Stok awal agar stok tidak terhitung dua kali.",
      );
    if (f.target === "customer")
      requireValue(
        !data.headers.includes("saldo") || data.headers.includes("saldo awal"),
        "Kolom Saldo dari ekspor lama adalah saldo berjalan. Gunakan ekspor terbaru dengan Saldo awal.",
      );
    const unknown = data.headers.filter(
      (h) => !importHeaders(f.target).map(headerKey).includes(h),
    );
    if (unknown.length)
      warnings.push(
        `${importLabel(f.target)}: kolom diabaikan: ${unknown.join(", ")}.`,
      );
    for (const r of data.rows)
      requireValue(
        !text(r, "Jenis data") || text(r, "Jenis data") === f.target,
        `Baris ${r.line}: Jenis data tidak cocok dengan ${importLabel(f.target)}.`,
      );
    requireValue(
      data.rows.length > 0 || f.empty,
      "File tidak berisi data. Untuk mengganti seluruh jenis data menjadi kosong, gunakan Ekspor semua data dari Pengaturan.",
    );
    return { target: f.target, ...data };
  });
  const attempt = (target: ImportTarget, row: CSVRow, fn: () => void) => {
    try {
      fn();
    } catch (e) {
      errors.push(
        `${importLabel(target)}, baris ${row.line}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  };
  const replaceChange = (target: ImportTarget, key: string, found: boolean) =>
    changes.push({ target, key, action: found ? "Perbarui" : "Tambah" });
  const itemUsed = (id: string) => work.lines.some((l) => l.itemId === id);
  const partyUsed = (id: string) =>
    work.documents.some((d) => d.partyId === id) ||
    work.payments.some((p) => p.partyId === id);
  // Masters are merged first so a multi-file import can resolve newly supplied codes.
  for (const file of parsed.filter(
    (f) => f.target === "items" || f.target === "customer",
  )) {
    const seen = new Set<string>();
    for (const r of file.rows)
      attempt(file.target, r, () => {
        const code = text(r, "Kode");
        requireValue(
          code && !seen.has(norm(code)),
          "Kode kosong atau ganda dalam file.",
        );
        seen.add(norm(code));
        if (file.target === "items") {
          const old = work.items.find((i) => norm(i.code) === norm(code));
          const i: Item = {
            id: old?.id || uid(),
            code,
            name: text(r, "Nama"),
            unit: text(r, "Satuan"),
            pack: text(r, "Isi", old?.pack),
            buyPrice: num(r, "Harga beli", old?.buyPrice),
            sellPrice: num(r, "Harga jual", old?.sellPrice),
            openingQty: num(r, "Stok awal", old?.openingQty),
            openingCost: num(r, "Nilai stok awal", old?.openingCost),
            minStock: num(r, "Stok minimum", old?.minStock),
            active: active(r, old?.active ?? true),
          };
          const validation = { ...work, lines: [], audit: [] };
          saveItem(validation, i);
          work.items = validation.items;
          replaceChange(file.target, code, !!old);
        } else {
          const old = work.parties.find(
            (p) => p.kind === "customer" && norm(p.code) === norm(code),
          );
          const p: Party = {
            id: old?.id || uid(),
            kind: "customer",
            code,
            name: text(r, "Nama"),
            address: text(r, "Alamat", old?.address),
            city: text(r, "Kota", old?.city),
            phone: text(r, "Telepon", old?.phone),
            fax: text(r, "Fax", old?.fax),
            openingBalance: num(r, "Saldo awal", old?.openingBalance, true),
            active: active(r, old?.active ?? true),
          };
          const validation = {
            ...work,
            documents: [],
            payments: [],
            audit: [],
          };
          saveParty(validation, p);
          work.parties = validation.parties;
          replaceChange(file.target, code, !!old);
        }
      });
    if (mode === "replace") {
      if (file.target === "items")
        work.items = work.items.filter((i) => {
          if (seen.has(norm(i.code))) return true;
          const used = itemUsed(i.id);
          changes.push({
            target: file.target,
            key: i.code,
            action: used ? "Nonaktifkan" : "Hapus",
          });
          if (used) i.active = false;
          return used;
        });
      else
        work.parties = work.parties.filter((p) => {
          if (p.kind !== "customer" || seen.has(norm(p.code))) return true;
          const used = partyUsed(p.id);
          changes.push({
            target: file.target,
            key: p.code,
            action: used ? "Nonaktifkan" : "Hapus",
          });
          if (used) p.active = false;
          return used;
        });
    }
  }
  const pending: { target: Kind; rows: CSVRow[]; doc: Doc; old?: Doc }[] = [];
  for (const file of parsed.filter(
    (f) =>
      f.target !== "items" &&
      f.target !== "customer" &&
      f.target !== "payments",
  )) {
    const kind = file.target as Kind,
      retained = new Set<string>();
    for (const rows of group(file.rows, "Nomor"))
      attempt(kind, rows[0], () => {
        consistent(rows, [
          "Tanggal",
          "Status",
          "Kode customer",
          "Diskon total",
          "Uang muka",
          "Catatan",
          "Nomor order",
          "Nomor transaksi asal",
          "Urutan",
        ]);
        const r = rows[0],
          number = text(r, "Nomor"),
          old = work.documents.find(
            (d) => d.kind === kind && norm(d.number) === norm(number),
          );
        const party =
          partyKind(kind) === "supplier"
            ? old
              ? work.parties.find((p) => p.id === old.partyId)
              : singleSupplier(work)
            : work.parties.find(
                (p) =>
                  p.kind === "customer" &&
                  norm(p.code) === norm(text(r, "Kode customer")),
              );
        requireValue(
          party,
          "Kode customer tidak ditemukan. Impor customer terlebih dahulu.",
        );
        const d: Doc = {
          ...(old || newDoc(work, kind)),
          serialTracking: old?.serialTracking,
          number,
          date: text(r, "Tanggal"),
          status: status(r, old?.status || "final"),
          partyId: party.id,
          discount: num(r, "Diskon total", old?.discount),
          downPayment: num(r, "Uang muka", old?.downPayment),
          notes: text(r, "Catatan", old?.notes),
          seq:
            old?.seq ||
            num(
              r,
              "Urutan",
              Math.max(0, ...work.documents.map((x) => x.seq)) + 1,
            ),
        };
        if (!old || old.partyId !== party.id) {
          d.partyName = party.name;
          d.partyAddress = [party.address, party.city]
            .filter(Boolean)
            .join(", ");
          d.partyPhone = party.phone;
        }
        const profileRows = rows.filter((r) => text(r, "Data invoice"));
        requireValue(
          profileRows.length <= 1,
          "Data invoice cukup diisi pada baris pertama per nomor.",
        );
        if (profileRows.length) {
          const profile: unknown = JSON.parse(
            text(profileRows[0], "Data invoice"),
          );
          requireValue(
            profile && typeof profile === "object" && !Array.isArray(profile),
            "Data invoice harus objek JSON.",
          );
          for (const key of snapshotKeys)
            if (key in profile) {
              const value = (profile as Record<string, unknown>)[key];
              requireValue(
                typeof value === "string",
                `Data invoice ${key} harus teks.`,
              );
              d[key] = value;
            }
          for (const key of ["logo", "partnerLogo"] as const)
            requireValue(
              !d[key] ||
                /^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(
                  d[key],
                ),
              "Logo invoice harus berupa gambar PNG/JPEG/WebP tertanam.",
            );
        }
        retained.add(d.id);
        work.documents = old
          ? work.documents.map((x) => (x.id === d.id ? d : x))
          : [...work.documents, d];
        pending.push({ target: kind, rows, doc: d, old });
        replaceChange(kind, number, !!old);
      });
    if (mode === "replace") {
      const removed = work.documents.filter(
        (d) => d.kind === kind && !retained.has(d.id),
      );
      const ids = new Set(removed.map((d) => d.id));
      removed.forEach((d) =>
        changes.push({ target: kind, key: d.number, action: "Hapus" }),
      );
      work.documents = work.documents.filter((d) => !ids.has(d.id));
      work.lines = work.lines.filter((l) => !ids.has(l.docId));
    }
  }
  // All headers now exist; resolve order/return relationships and preserve line IDs.
  for (const p of pending)
    attempt(p.target, p.rows[0], () => {
      const { doc: d, rows, old } = p,
        r = rows[0];
      const resolve = (name: string, kind: Kind, fallback: string) => {
        if (get(r, name) === undefined) return fallback;
        const number = text(r, name);
        if (!number) return "";
        const found = work.documents.find(
          (x) => x.kind === kind && norm(x.number) === norm(number),
        );
        requireValue(
          found,
          `${name} ${number} tidak ditemukan. Sertakan file transaksi asal.`,
        );
        return found.id;
      };
      d.orderId = resolve(
        "Nomor order",
        d.kind === "sale" ? "customer_order" : "supplier_order",
        d.orderId,
      );
      d.refId = resolve(
        "Nomor transaksi asal",
        d.kind === "sale_return" ? "sale" : "purchase",
        d.refId,
      );
      const lines: Line[] = rows.map((r) => {
        const i = work.items.find(
          (i) => norm(i.code) === norm(text(r, "Kode barang")),
        );
        requireValue(i, `Baris ${r.line}: kode barang tidak ditemukan.`);
        const previous = old
          ? linesOf(current, old.id).find((l) => l.itemId === i.id)
          : undefined;
        const rawType = text(
          r,
          "Jenis diskon produk",
          previous?.discountType || "amount",
        );
        const discountType =
          rawType === "%"
            ? "percent"
            : rawType === "Rp/unit"
              ? "amount"
              : rawType;
        requireValue(
          discountType === "amount" || discountType === "percent",
          "Jenis diskon produk harus amount (Rp/unit) atau percent (%).",
        );
        let refLineId = previous?.refLineId || "";
        if (isReturn(d.kind) && d.refId) {
          const code = text(r, "Kode barang asal", i.code);
          const origin = linesOf(work, d.refId).find(
            (l) => norm(l.code) === norm(code) && l.itemId === i.id,
          );
          // Imported parents' lines may still be pending; resolved again below.
          refLineId = origin?.id || "";
        }
        return {
          ...(previous || newLine(work, d.id, i.id, d.kind)),
          docId: d.id,
          itemId: i.id,
          code: i.code,
          name: text(r, "Nama barang", previous?.name || i.name),
          unit: text(r, "Satuan", previous?.unit || i.unit),
          qty: num(r, "Qty"),
          price: num(r, "Harga"),
          discountType,
          discountValue: num(r, "Diskon produk", previous?.discountValue),
          serials: text(r, "SN", previous?.serials),
          refLineId,
          total: num(r, "Total baris", previous?.total),
          cost: num(r, "HPP baris", previous?.cost),
        };
      });
      const validation = structuredClone(work);
      validation.documents = validation.documents.filter((x) => x.id !== d.id);
      validation.lines = validation.lines.filter((x) => x.docId !== d.id);
      validation.items.forEach((i) => (i.active = true));
      validation.parties.forEach((p) => (p.active = true));
      saveDoc(validation, { ...d, status: "draft" }, lines, false);
      if (d.status !== "final") {
        d.total =
          d.status === "cancelled"
            ? num(
                r,
                "Total",
                validation.documents.find((x) => x.id === d.id)!.total,
              )
            : validation.documents.find((x) => x.id === d.id)!.total;
        for (const [index, l] of lines.entries())
          if (get(rows[index], "Total baris") === undefined)
            l.total = linesOf(validation, d.id)[index].total;
      }
      work.lines = [...work.lines.filter((l) => l.docId !== d.id), ...lines];
    });
  for (const p of pending.filter((p) => isReturn(p.doc.kind)))
    attempt(p.target, p.rows[0], () => {
      if (!p.doc.refId && p.doc.status !== "final") return;
      for (const [index, l] of linesOf(work, p.doc.id).entries()) {
        const origin = linesOf(work, p.doc.refId).find(
          (x) =>
            x.itemId === l.itemId &&
            norm(x.code) ===
              norm(text(p.rows[index], "Kode barang asal", l.code)),
        );
        requireValue(origin, "Barang asal retur tidak ditemukan.");
        l.refLineId = origin.id;
      }
    });
  const paymentFile = parsed.find((f) => f.target === "payments"),
    importedPayments = new Set<string>();
  if (paymentFile) {
    for (const rows of group(paymentFile.rows, "Nomor"))
      attempt("payments", rows[0], () => {
        consistent(rows, [
          "Tanggal",
          "Arah",
          "Kode customer",
          "Nominal",
          "Status",
          "Catatan",
          "Nomor invoice uang muka",
        ]);
        const r = rows[0],
          number = text(r, "Nomor"),
          old = work.payments.find((p) => norm(p.number) === norm(number)),
          direction = text(r, "Arah", old?.direction || "in");
        requireValue(
          direction === "in" || direction === "out",
          "Arah harus in atau out.",
        );
        const party =
          direction === "out"
            ? old
              ? work.parties.find((p) => p.id === old.partyId)
              : singleSupplier(work)
            : work.parties.find(
                (p) =>
                  p.kind === "customer" &&
                  norm(p.code) === norm(text(r, "Kode customer")),
              );
        requireValue(party, "Kode customer pembayaran tidak ditemukan.");
        const sourceNumber = text(
            r,
            "Nomor invoice uang muka",
            old?.sourceDocId ? numberOf(work, old.sourceDocId) : "",
          ),
          source = sourceNumber
            ? work.documents.find(
                (d) =>
                  d.kind === "sale" && norm(d.number) === norm(sourceNumber),
              )
            : undefined;
        requireValue(
          !sourceNumber || source,
          "Invoice uang muka tidak ditemukan.",
        );
        const p: Payment = {
          id: old?.id || uid(),
          number,
          date: text(r, "Tanggal"),
          direction,
          partyId: party.id,
          amount: num(r, "Nominal"),
          notes: text(r, "Catatan", old?.notes),
          status: status(r, old?.status || "final", true) as Payment["status"],
          sourceDocId: source?.id || "",
        };
        const allocations = rows
          .filter((r) => text(r, "Nomor tagihan"))
          .map((r) => {
            const d = work.documents.find(
              (d) =>
                d.kind === (direction === "in" ? "sale" : "purchase") &&
                norm(d.number) === norm(text(r, "Nomor tagihan")),
            );
            requireValue(
              d,
              "Nomor tagihan tidak ditemukan. Impor transaksi terlebih dahulu.",
            );
            return {
              id:
                work.allocations.find(
                  (a) => a.paymentId === p.id && a.docId === d.id,
                )?.id || uid(),
              paymentId: p.id,
              docId: d.id,
              amount: num(r, "Alokasi"),
            };
          });
        requireValue(
          rows.every(
            (r) => text(r, "Nomor tagihan") || num(r, "Alokasi") === 0,
          ),
          "Alokasi tanpa nomor tagihan.",
        );
        requireValue(
          new Set(allocations.map((a) => a.docId)).size === allocations.length,
          "Nomor tagihan ganda dalam pembayaran.",
        );
        requireValue(
          rows.length === allocations.length || rows.length === 1,
          "Gunakan satu baris per alokasi; tanpa alokasi cukup satu baris.",
        );
        requireValue(
          p.number && Number.isInteger(p.amount) && p.amount > 0,
          "Nomor dan nominal pembayaran wajib valid.",
        );
        requireValue(
          /^\d{4}-\d{2}-\d{2}$/.test(p.date) &&
            new Date(`${p.date}T12:00:00Z`).toISOString().slice(0, 10) ===
              p.date,
          "Tanggal pembayaran tidak valid.",
        );
        importedPayments.add(p.id);
        work.payments = old
          ? work.payments.map((x) => (x.id === p.id ? p : x))
          : [...work.payments, p];
        work.allocations = [
          ...work.allocations.filter((a) => a.paymentId !== p.id),
          ...allocations,
        ];
        replaceChange("payments", number, !!old);
      });
    if (mode === "replace") {
      work.payments
        .filter((p) => !importedPayments.has(p.id))
        .forEach((p) =>
          changes.push({ target: "payments", key: p.number, action: "Hapus" }),
        );
      work.payments = work.payments.filter((p) => importedPayments.has(p.id));
      work.allocations = work.allocations.filter((a) =>
        importedPayments.has(a.paymentId),
      );
    }
  }
  // Link legacy down payments before reconciling; explicit payment CSV wins only when consistent.
  for (const original of current.payments) {
    const source = paymentSource(current, original),
      copy = work.payments.find((p) => p.id === original.id);
    if (source && copy && !importedPayments.has(copy.id))
      copy.sourceDocId = source;
  }
  for (const d of work.documents.filter((d) => d.kind === "sale")) {
    const linked = work.payments.filter(
      (p) => p.sourceDocId === d.id && p.status === "final",
    );
    requireValue(linked.length <= 1, `${d.number}: uang muka ganda.`);
    const importedDoc = pending.some((p) => p.doc.id === d.id),
      old = current.documents.find((x) => x.id === d.id);
    const explicit = linked.find((p) => importedPayments.has(p.id));
    if (explicit) {
      requireValue(
        !importedDoc || d.downPayment === explicit.amount,
        `${d.number}: uang muka transaksi berbeda dari pembayaran CSV.`,
      );
      if (!importedDoc) d.downPayment = explicit.amount;
    } else if (importedDoc) {
      const p = linked[0];
      if (p) {
        if (d.status !== "final" || !d.downPayment) p.status = "cancelled";
        else {
          p.amount = d.downPayment;
          p.partyId = d.partyId;
          if (old && old.date !== d.date && p.date === old.date)
            p.date = d.date;
          work.allocations
            .filter((a) => a.paymentId === p.id)
            .forEach((a) => (a.amount = p.amount));
        }
      } else if (d.status === "final" && d.downPayment > 0) {
        const cancelledDP = work.payments.some(
          (p) =>
            p.sourceDocId === d.id &&
            p.status === "cancelled" &&
            p.amount === d.downPayment,
        );
        if (cancelledDP && (!old || old.downPayment === d.downPayment))
          continue;
        // A supplied payment file must contain every DP for its imported invoice, avoiding duplicates.
        requireValue(
          !paymentFile,
          `${d.number}: pembayaran uang muka tidak ada di file pembayaran.`,
        );
        const id = uid();
        work.payments.push({
          id,
          number: `DP/${d.number}/${id.slice(0, 8)}`,
          date: d.date,
          partyId: d.partyId,
          direction: "in",
          amount: d.downPayment,
          notes: `Uang muka ${d.number}`,
          status: "final",
          sourceDocId: d.id,
        });
        work.allocations.push({
          id: uid(),
          paymentId: id,
          docId: d.id,
          amount: d.downPayment,
        });
      }
    } else if (
      paymentFile &&
      old &&
      downPaymentFor(current, old) &&
      !linked.length
    )
      d.downPayment = 0;
  }
  if (errors.length)
    throw new Error(
      errors.slice(0, 30).join("\n") +
        (errors.length > 30
          ? `\n… dan ${errors.length - 30} kesalahan lain.`
          : ""),
    );
  // Replace removes a master when all its former references are also replaced away.
  for (const change of changes.filter((c) => c.action === "Nonaktifkan")) {
    if (change.target === "items") {
      const item = work.items.find((i) => i.code === change.key);
      if (item && !itemUsed(item.id)) {
        work.items = work.items.filter((i) => i.id !== item.id);
        change.action = "Hapus";
      }
    } else if (change.target === "customer") {
      const party = work.parties.find(
        (p) => p.kind === "customer" && p.code === change.key,
      );
      if (party && !partyUsed(party.id)) {
        work.parties = work.parties.filter((p) => p.id !== party.id);
        change.action = "Hapus";
      }
    }
  }
  for (const d of work.documents) {
    requireValue(
      !d.orderId || work.documents.some((x) => x.id === d.orderId),
      `${d.number}: order masih dirujuk. Sertakan order dalam file Replace.`,
    );
    requireValue(
      !d.refId || work.documents.some((x) => x.id === d.refId),
      `${d.number}: transaksi asal masih dirujuk. Sertakan transaksi asal dalam file Replace.`,
    );
  }
  for (const p of work.payments)
    requireValue(
      !p.sourceDocId || work.documents.some((d) => d.id === p.sourceDocId),
      `${p.number}: invoice uang muka masih dirujuk. Sertakan invoice dalam file Replace.`,
    );
  for (const a of work.allocations)
    requireValue(
      work.documents.some((d) => d.id === a.docId),
      "Transaksi masih dirujuk oleh pembayaran. Sertakan transaksi dalam file Replace.",
    );
  validateSerialChanges(current, work);
  const result = recalculate(work);
  for (const d of result.documents.filter(
    (d) => d.status === "final" && ["sale", "purchase"].includes(d.kind),
  )) {
    if (current.documents.some((old) => old.id === d.id)) {
      const before = paid(current, d.id),
        after = paid(result, d.id);
      requireValue(
        after <= before ||
          after <= Math.max(0, d.total - returnedValue(result, d.id)),
        `${d.number}: alokasi baru melebihi sisa tagihan setelah retur.`,
      );
    }
  }
  audit(
    result,
    "Impor CSV",
    files.map((f) => importLabel(f.target)).join(", "),
    JSON.stringify({ mode, records: changes.length }),
  );
  return {
    db: result,
    revision: current.revision,
    changes,
    warnings,
    records: parsed.reduce((s, f) => s + f.rows.length, 0),
  };
}
export function applyImport(db: DB, plan: ImportPlan) {
  requireValue(
    db.revision === plan.revision,
    "Data berubah setelah pratinjau. Periksa ulang file sebelum mengimpor.",
  );
  Object.assign(db, structuredClone(plan.db));
}
