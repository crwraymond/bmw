import {
  invoiceDefaults,
  isMitraIdentity,
  invoiceProfile,
} from "./invoiceDefaults";
import {
  type DB,
  type Doc,
  type Kind,
  type Line,
  type Item,
  type Party,
  type Payment,
  uid,
  today,
  emptyDB,
} from "./types";
import { defaultLogo } from "./branding";
import { validateSerialTimeline } from "./serialInventory";
function check(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
const finite = (v: number) => Number.isFinite(v) && Math.abs(v) <= 1e12;
const amount = (v: number) => finite(v) && Number.isInteger(v) && v >= 0;
const quantity = (v: number) =>
  finite(v) && v >= 0 && Math.abs(v * 1000 - Math.round(v * 1000)) < 0.0001;
export const roundQ = (v: number) => Math.round(v * 1000) / 1000;
export const lineGross = (line: Line) => Math.round(line.qty * line.price);
export const lineDiscount = (line: Line) =>
  Math.round(
    line.discountType === "percent"
      ? (lineGross(line) * (line.discountValue ?? 0)) / 100
      : line.qty * (line.discountValue ?? 0),
  );
export const lineNet = (line: Line) => lineGross(line) - lineDiscount(line);
function validLineDiscount(line: Line) {
  const type = line.discountType ?? "amount";
  const value = line.discountValue ?? 0;
  return (
    (line.discountType === undefined ||
      ["amount", "percent"].includes(line.discountType)) &&
    (line.discountValue === undefined ||
      typeof line.discountValue === "number") &&
    (type === "percent"
      ? finite(value) &&
        value >= 0 &&
        value <= 100 &&
        Math.abs(value * 100 - Math.round(value * 100)) < 0.0001
      : amount(value) && value <= line.price)
  );
}
export function withLineDiscountDefaults(db: DB): DB {
  return {
    ...db,
    lines: db.lines.map((line) => ({
      ...line,
      discountType:
        line.discountType === undefined ? "amount" : line.discountType,
      discountValue: line.discountValue === undefined ? 0 : line.discountValue,
    })),
  };
}
export function singleSupplier(db: DB): Party {
  return (
    db.parties.find((p) => p.kind === "supplier" && p.active) ||
    db.parties.find((p) => p.kind === "supplier") || {
      id: "single-supplier",
      kind: "supplier",
      code: "SUPPLIER",
      name: "Pemasok",
      address: "",
      city: "",
      phone: "",
      fax: "",
      openingBalance: 0,
      active: true,
    }
  );
}
export function withStoreDefaults(db: DB): DB {
  const supplier = singleSupplier(db);
  const settings = db.settings.map((original) => {
    const s =
      original.brandingVersion === 1
        ? { ...original }
        : {
            ...original,
            logo: original.logo || defaultLogo,
            brandingVersion: 1,
          };
    if (s.invoiceDefaultsVersion !== 1 && isMitraIdentity(s.name)) {
      for (const key of Object.keys(
        invoiceDefaults,
      ) as (keyof typeof invoiceDefaults)[]) {
        if (
          key !== "name" &&
          (!s[key] ||
            (key === "terms" && s[key] === "Pembayaran sesuai kesepakatan."))
        )
          s[key] = invoiceDefaults[key];
      }
    }
    // Text defaults apply to every store identity, once. Never copy bank/account details.
    if (s.invoiceTextDefaultsVersion !== 1) {
      for (const key of ["warranty", "terms", "country"] as const) {
        if (!s[key]?.trim()) s[key] = invoiceDefaults[key];
      }
      if (!s.signature?.trim()) s.signature = s.invoiceIssuer || s.name;
    }
    return {
      ...s,
      invoiceIssuer:
        s.invoiceIssuer ??
        (isMitraIdentity(s.name) ? invoiceDefaults.name : s.name),
      invoiceDefaultsVersion: 1,
      invoiceTextDefaultsVersion: 1,
    };
  });
  const profile = settings[0];
  const documents = db.documents.map((original) => {
    if (original.invoiceDefaultsVersion === 1) return original;
    const doc = { ...original, invoiceDefaultsVersion: 1 };
    if (!isMitraIdentity(doc.issuerName)) return doc;
    const source = isMitraIdentity(profile.name)
      ? profile
      : { ...invoiceDefaults, invoiceIssuer: invoiceDefaults.name };
    if (["Mitra Ecobike", "Toko Offline"].includes(doc.issuerName))
      doc.issuerName = source.invoiceIssuer || source.name;
    const fields = {
      issuerName: "name",
      issuerAddress: "address",
      issuerPhone: "phone",
      bank: "bank",
      beneficiary: "beneficiary",
      account: "account",
      bankBranch: "bankBranch",
      bankCode: "bankCode",
      country: "country",
      warranty: "warranty",
      terms: "terms",
      signature: "signature",
      logo: "logo",
      partnerLogo: "partnerLogo",
    } as const;
    for (const key of Object.keys(fields) as (keyof typeof fields)[]) {
      if (
        !doc[key] ||
        (key === "terms" && doc[key] === "Pembayaran sesuai kesepakatan.")
      )
        doc[key] = source[fields[key]];
    }
    return doc;
  });
  return {
    ...withLineDiscountDefaults(db),
    settings,
    // Keep every row a string so mixed legacy/current CSV columns roundtrip.
    documents: documents.map((doc) => ({
      ...doc,
      serialTracking: doc.serialTracking ?? "",
    })),
    payments: db.payments.map((p) => ({
      ...p,
      sourceDocId: p.sourceDocId || "",
    })),
    parties: db.parties.some((p) => p.id === supplier.id)
      ? db.parties.map((p) =>
          p.id === supplier.id ? { ...p, active: true } : p,
        )
      : [...db.parties, supplier],
  };
}
export const isOrder = (k: Kind) => k.endsWith("_order");
export const isReturn = (k: Kind) => k.endsWith("_return");
export const partyKind = (k: Kind) =>
  ["sale", "customer_order", "sale_return"].includes(k)
    ? "customer"
    : "supplier";
export const linesOf = (db: DB, id: string) =>
  db.lines.filter((l) => l.docId === id);
export const activeDocs = (db: DB) =>
  db.documents.filter((d) => d.status === "final");
export function audit(db: DB, action: string, entity: string, detail = "") {
  db.audit.push({
    id: uid(),
    time: new Date().toISOString(),
    action,
    entity,
    detail,
  });
}
export function stock(db: DB, itemId: string, until = "9999-12-31") {
  const item = db.items.find((i) => i.id === itemId);
  let units = item?.openingQty || 0;
  let value = item?.openingCost || 0;
  for (const doc of activeDocs(db)
    .filter((d) => d.date <= until)
    .sort((a, b) => a.seq - b.seq)) {
    if (isOrder(doc.kind)) continue;
    const sign = ["purchase", "sale_return"].includes(doc.kind) ? 1 : -1;
    for (const line of linesOf(db, doc.id).filter((l) => l.itemId === itemId)) {
      units += sign * line.qty;
      value += sign * line.cost;
    }
  }
  return {
    qty: roundQ(units),
    value: Math.round(value),
    average: units > 0 ? value / units : 0,
  };
}
export const inventoryCapital = (db: DB) =>
  db.items.reduce((total, item) => total + stock(db, item.id).value, 0);
export const totalCapital = (db: DB) =>
  db.items.reduce((total, item) => total + item.openingCost, 0) +
  activeDocs(db).reduce(
    (total, doc) =>
      total +
      (doc.kind === "purchase"
        ? doc.total
        : doc.kind === "purchase_return"
          ? -doc.total
          : 0),
    0,
  );
export function saleStockLimit(db: DB, doc: Doc, itemId: string) {
  const original = db.documents.find(
    (d) => d.id === doc.id && d.kind === "sale" && d.status === "final",
  );
  if (!original) return Math.max(0, stock(db, itemId).qty);

  // Match revision replay: remove the original sale, then reserve enough stock
  // at its edited date and every later movement. Later receipts cannot fund it.
  const ordered = [
    ...activeDocs(db).filter((d) => d.id !== doc.id && !isOrder(d.kind)),
    { ...doc, seq: original.seq },
  ].sort((a, b) => a.date.localeCompare(b.date) || a.seq - b.seq);
  let available = db.items.find((i) => i.id === itemId)?.openingQty ?? 0;
  let limit = Infinity;
  let afterSale = false;
  for (const movement of ordered) {
    if (movement.id === doc.id) {
      afterSale = true;
    } else {
      const sign = ["purchase", "sale_return"].includes(movement.kind) ? 1 : -1;
      for (const line of linesOf(db, movement.id)) {
        if (line.itemId === itemId)
          available = roundQ(available + sign * line.qty);
      }
    }
    if (afterSale) limit = Math.min(limit, available);
  }
  return Math.max(0, roundQ(limit));
}
export function returned(db: DB, lineId: string, exclude = "") {
  return db.lines
    .filter(
      (l) =>
        l.refLineId === lineId &&
        l.docId !== exclude &&
        db.documents.some((d) => d.id === l.docId && d.status === "final"),
    )
    .reduce((a, l) => a + l.qty, 0);
}
export function fulfilled(db: DB, orderId: string, itemId: string) {
  return activeDocs(db)
    .filter((d) => d.orderId === orderId)
    .flatMap((d) => linesOf(db, d.id))
    .filter((l) => l.itemId === itemId)
    .reduce((a, l) => a + l.qty, 0);
}
export function orderRemaining(db: DB, doc: Doc) {
  return linesOf(db, doc.id).reduce(
    (a, l) => a + roundQ(l.qty - fulfilled(db, doc.id, l.itemId)),
    0,
  );
}
export function paid(db: DB, docId: string) {
  return db.allocations
    .filter(
      (a) =>
        a.docId === docId &&
        db.payments.some((p) => p.id === a.paymentId && p.status === "final"),
    )
    .reduce((a, b) => a + b.amount, 0);
}
export function returnedValue(db: DB, docId: string) {
  return activeDocs(db)
    .filter((d) => d.refId === docId)
    .reduce((a, d) => a + d.total, 0);
}
export function due(db: DB, docId: string) {
  const d = db.documents.find((x) => x.id === docId);
  return d && d.status === "final"
    ? d.total - returnedValue(db, docId) - paid(db, docId)
    : 0;
}
export function balance(db: DB, partyId: string, until = "9999-12-31") {
  const party = db.parties.find((p) => p.id === partyId);
  return (
    (party?.openingBalance || 0) +
    activeDocs(db)
      .filter(
        (d) => d.partyId === partyId && d.date <= until && !isOrder(d.kind),
      )
      .reduce((a, d) => a + (isReturn(d.kind) ? -d.total : d.total), 0) -
    db.payments
      .filter(
        (p) => p.partyId === partyId && p.status === "final" && p.date <= until,
      )
      .reduce((a, p) => a + p.amount, 0)
  );
}
export function nextNumber(db: DB, kind: Kind | "payment") {
  const prefix = {
    sale: "INV",
    purchase: "BELI",
    customer_order: "OC",
    supplier_order: "OP",
    sale_return: "RJ",
    purchase_return: "RB",
    payment: "PAY",
  }[kind];
  const n =
    kind === "payment"
      ? db.payments.length + 1
      : db.documents.filter((d) => d.kind === kind).length + 1;
  return `${prefix}/${today().slice(0, 4)}/${String(n).padStart(5, "0")}`;
}
export function newDoc(db: DB, kind: Kind): Doc {
  const s = db.settings[0];
  return {
    serialTracking: "v1",
    id: uid(),
    kind,
    status: "draft",
    number: nextNumber(db, kind),
    date: today(),
    seq: 0,
    partyId: partyKind(kind) === "supplier" ? singleSupplier(db).id : "",
    partyName: "",
    partyAddress: "",
    partyPhone: "",
    orderId: "",
    refId: "",
    discount: 0,
    downPayment: 0,
    total: 0,
    notes: "",
    ...invoiceProfile(s),
    createdAt: new Date().toISOString(),
    cancelReason: "",
  };
}
export function newLine(
  db: DB,
  docId: string,
  itemId: string,
  kind: Kind,
): Line {
  const i = db.items.find((i) => i.id === itemId)!;
  return {
    id: uid(),
    docId,
    itemId,
    code: i.code,
    name: i.name,
    unit: i.unit,
    qty: 1,
    price: partyKind(kind) === "customer" ? i.sellPrice : i.buyPrice,
    discountType: "amount",
    discountValue: 0,
    total: 0,
    cost: 0,
    refLineId: "",
    serials: "",
  };
}
export function saveItem(db: DB, item: Item) {
  check(
    item.code.trim() && item.name.trim() && item.unit.trim(),
    "Kode, nama, dan satuan barang wajib diisi.",
  );
  check(
    !db.items.some(
      (i) =>
        i.id !== item.id &&
        i.code.toLowerCase() === item.code.trim().toLowerCase(),
    ),
    "Kode barang sudah digunakan.",
  );
  check(
    [item.buyPrice, item.sellPrice, item.openingCost].every(amount) &&
      quantity(item.openingQty) &&
      quantity(item.minStock),
    "Harga, stok awal, dan batas minimum harus valid. Harga dalam Rupiah bulat, qty maksimal 3 desimal.",
  );
  check(
    item.openingQty > 0 || item.openingCost === 0,
    "Nilai stok awal harus nol bila stok awal nol.",
  );
  const old = db.items.find((i) => i.id === item.id);
  if (old && db.lines.some((l) => l.itemId === item.id))
    check(
      old.openingQty === item.openingQty &&
        old.openingCost === item.openingCost,
      "Stok awal terkunci karena barang sudah dipakai. Gunakan pembelian/retur untuk mutasi.",
    );
  const value = { ...item, code: item.code.trim(), name: item.name.trim() };
  db.items = old
    ? db.items.map((i) => (i.id === item.id ? value : i))
    : [...db.items, value];
  audit(db, old ? "Ubah barang" : "Tambah barang", item.code, item.name);
}
export function saveParty(db: DB, party: Party) {
  check(party.code.trim() && party.name.trim(), "Kode dan nama wajib diisi.");
  check(
    !db.parties.some(
      (p) =>
        p.id !== party.id &&
        p.kind === party.kind &&
        p.code.toLowerCase() === party.code.trim().toLowerCase(),
    ),
    "Kode sudah digunakan.",
  );
  check(
    finite(party.openingBalance) && Number.isInteger(party.openingBalance),
    "Saldo awal harus berupa Rupiah bulat.",
  );
  const old = db.parties.find((p) => p.id === party.id);
  if (
    old &&
    (db.documents.some((d) => d.partyId === party.id) ||
      db.payments.some((p) => p.partyId === party.id))
  )
    check(
      old.openingBalance === party.openingBalance,
      "Saldo awal terkunci karena sudah ada dokumen terkait.",
    );
  db.parties = old
    ? db.parties.map((p) => (p.id === party.id ? { ...party } : p))
    : [...db.parties, { ...party }];
  audit(db, old ? "Ubah kontak" : "Tambah kontak", party.code, party.name);
}
function validateHeader(db: DB, doc: Doc) {
  check(doc.number.trim(), "Nomor dokumen wajib diisi.");
  check(
    !db.documents.some(
      (d) =>
        d.id !== doc.id &&
        d.kind === doc.kind &&
        d.number.toLowerCase() === doc.number.trim().toLowerCase(),
    ),
    "Nomor dokumen sudah digunakan.",
  );
  check(
    /^\d{4}-\d{2}-\d{2}$/.test(doc.date) &&
      !Number.isNaN(Date.parse(doc.date)) &&
      new Date(`${doc.date}T12:00:00Z`).toISOString().slice(0, 10) === doc.date,
    "Tanggal tidak valid.",
  );
  check(doc.date <= today(), "Tanggal dokumen tidak boleh di masa depan.");
  check(
    db.parties.some(
      (p) => p.id === doc.partyId && p.kind === partyKind(doc.kind) && p.active,
    ),
    "Pilih customer/pemasok aktif.",
  );
}
export function saveDoc(
  db: DB,
  input: Doc,
  inputLines: Line[],
  final: boolean,
) {
  const doc = { ...input };
  const supplier = singleSupplier(db);
  let parties = db.parties;
  if (
    partyKind(doc.kind) === "supplier" &&
    (!doc.partyId || doc.partyId === supplier.id)
  ) {
    doc.partyId = supplier.id;
    parties = db.parties.some((p) => p.id === supplier.id)
      ? db.parties.map((p) =>
          p.id === supplier.id ? { ...p, active: true } : p,
        )
      : [...db.parties, supplier];
  }
  let lines = inputLines.map((l) => ({ ...l, docId: doc.id }));
  const old = db.documents.find((d) => d.id === doc.id);
  check(
    !old || old.status === "draft",
    "Dokumen final tidak dapat ditimpa. Batalkan dengan alasan lalu buat pengganti.",
  );
  validateHeader({ ...db, parties }, doc);
  check(
    amount(doc.discount),
    "Diskon harus nominal Rupiah bulat yang tidak negatif.",
  );
  check(lines.length > 0, "Tambahkan minimal satu barang.");
  check(
    new Set(lines.map((l) => l.itemId)).size === lines.length,
    "Gabungkan barang yang sama menjadi satu baris.",
  );
  for (const l of lines) {
    check(
      db.items.some((i) => i.id === l.itemId && i.active),
      "Ada barang yang tidak aktif/tidak ditemukan.",
    );
    check(
      quantity(l.qty) && l.qty > 0 && amount(l.price),
      "Qty harus positif (maksimal 3 desimal) dan harga Rupiah bulat.",
    );
    check(
      validLineDiscount(l),
      "Diskon produk harus 0–100% (maksimal 2 desimal) atau Rupiah per unit yang tidak melebihi harga.",
    );
    l.discountType ??= "amount";
    l.discountValue ??= 0;
    l.total = lineNet(l);
    l.cost = 0;
  }
  const subtotal = lines.reduce((a, l) => a + l.total, 0);
  check(doc.discount <= subtotal, "Diskon melebihi subtotal.");
  check(
    !isReturn(doc.kind) || doc.discount === 0,
    "Diskon retur mengikuti transaksi asal.",
  );
  doc.total = subtotal - doc.discount;
  const p = parties.find((p) => p.id === doc.partyId)!;
  doc.partyName = p.name;
  doc.partyAddress = [p.address, p.city].filter(Boolean).join(", ");
  doc.partyPhone = p.phone;
  if (final) {
    const last = activeDocs(db)
      .filter((d) => !isOrder(d.kind))
      .sort((a, b) => b.seq - a.seq)[0];
    if (!isOrder(doc.kind) && last)
      check(
        doc.date >= last.date,
        "Tanggal transaksi tidak boleh mendahului transaksi stok terakhir. Ini menjaga HPP historis.",
      );
    if (doc.orderId) {
      const order = db.documents.find((d) => d.id === doc.orderId);
      check(
        order?.status === "final" &&
          order.partyId === doc.partyId &&
          order.kind ===
            (doc.kind === "sale" ? "customer_order" : "supplier_order"),
        "Order tidak sesuai dengan transaksi.",
      );
      for (const l of lines) {
        const o = linesOf(db, order.id).find((x) => x.itemId === l.itemId);
        check(
          o && roundQ(fulfilled(db, order.id, l.itemId) + l.qty) <= o.qty,
          "Jumlah melebihi sisa order.",
        );
      }
    }
    if (isReturn(doc.kind)) {
      const parent = db.documents.find((d) => d.id === doc.refId);
      check(
        parent?.status === "final" &&
          parent.kind === (doc.kind === "sale_return" ? "sale" : "purchase") &&
          parent.partyId === doc.partyId,
        "Transaksi asal retur tidak valid.",
      );
      check(
        doc.date >= parent.date,
        "Tanggal retur mendahului transaksi asal.",
      );
      lines = lines.map((l) => {
        const origin = linesOf(db, parent.id).find(
          (o) => o.id === l.refLineId && o.itemId === l.itemId,
        );
        check(origin, "Baris retur harus mengacu barang pada transaksi asal.");
        const done = returned(db, origin.id, doc.id);
        check(
          roundQ(done + l.qty) <= origin.qty,
          "Jumlah retur melebihi barang yang dapat diretur.",
        );
        const credit =
          Math.round((origin.total * (done + l.qty)) / origin.qty) -
          Math.round((origin.total * done) / origin.qty);
        const cost =
          doc.kind === "sale_return"
            ? Math.round((origin.cost * (done + l.qty)) / origin.qty) -
              Math.round((origin.cost * done) / origin.qty)
            : Math.round(stock(db, l.itemId).average * l.qty);
        return {
          ...l,
          price: origin.price,
          discountType: origin.discountType ?? "amount",
          discountValue: origin.discountValue ?? 0,
          total: credit,
          cost,
        };
      });
      doc.total = lines.reduce((a, l) => a + l.total, 0);
    } else if (doc.kind === "purchase" || doc.kind === "sale") {
      let allocated = 0;
      let gross = 0;
      lines = lines.map((l) => {
        gross += l.total;
        const target = Math.round((doc.discount * gross) / (subtotal || 1));
        const part = target - allocated;
        allocated = target;
        return {
          ...l,
          total: l.total - part,
          cost:
            doc.kind === "purchase"
              ? l.total - part
              : Math.round(stock(db, l.itemId).average * l.qty),
        };
      });
    }
    for (const l of lines)
      if (["sale", "purchase_return"].includes(doc.kind))
        check(stock(db, l.itemId).qty >= l.qty, `Stok ${l.name} tidak cukup.`);
    doc.status = "final";
    doc.seq = Math.max(0, ...db.documents.map((d) => d.seq)) + 1;
  } else doc.status = "draft";
  check(
    amount(doc.downPayment || 0),
    "Uang muka harus Rupiah bulat yang tidak negatif.",
  );
  check(
    (doc.downPayment || 0) <= doc.total,
    "Uang muka melebihi total dokumen.",
  );
  check(
    doc.kind === "sale" || !doc.downPayment,
    "Uang muka hanya dicatat otomatis pada penjualan.",
  );
  if (final)
    validateSerialTimeline({
      ...db,
      documents: [...db.documents.filter((d) => d.id !== doc.id), doc],
      lines: [...db.lines.filter((l) => l.docId !== doc.id), ...lines],
    });
  db.parties = parties;
  db.documents = old
    ? db.documents.map((d) => (d.id === doc.id ? doc : d))
    : [...db.documents, doc];
  db.lines = [...db.lines.filter((l) => l.docId !== doc.id), ...lines];
  if (final && doc.kind === "sale" && doc.downPayment > 0)
    savePayment(
      db,
      {
        id: uid(),
        number: nextNumber(db, "payment"),
        date: doc.date,
        partyId: doc.partyId,
        amount: doc.downPayment,
        direction: "in",
        notes: `Uang muka ${doc.number}`,
        sourceDocId: doc.id,
        status: "final",
      },
      [{ docId: doc.id, amount: doc.downPayment }],
    );
  audit(db, final ? "Sahkan dokumen" : "Simpan draf", doc.number, doc.kind);
}
export function removeDraft(db: DB, id: string) {
  const d = db.documents.find((d) => d.id === id);
  check(d?.status === "draft", "Hanya draf yang dapat dihapus.");
  db.documents = db.documents.filter((x) => x.id !== id);
  db.lines = db.lines.filter((x) => x.docId !== id);
  audit(db, "Hapus draf", d.number);
}
export function cancelDoc(db: DB, id: string, reason: string) {
  const d = db.documents.find((d) => d.id === id);
  check(d?.status === "final", "Dokumen tidak aktif.");
  check(reason.trim().length >= 3, "Tuliskan alasan pembatalan.");
  check(
    !activeDocs(db).some((x) => x.refId === id || x.orderId === id),
    "Batalkan dokumen turunan lebih dahulu.",
  );
  check(paid(db, id) === 0, "Batalkan pembayaran terkait lebih dahulu.");
  if (!isOrder(d.kind)) {
    const itemIds = linesOf(db, id).map((l) => l.itemId);
    check(
      !activeDocs(db).some(
        (x) =>
          !isOrder(x.kind) &&
          x.seq > d.seq &&
          linesOf(db, x.id).some((l) => itemIds.includes(l.itemId)),
      ),
      "Ada mutasi barang sesudah dokumen ini. Batalkan mutasi terbaru terlebih dahulu untuk menjaga HPP.",
    );
  }
  d.status = "cancelled";
  d.cancelReason = reason.trim();
  audit(db, "Batalkan dokumen", d.number, reason);
}
export function savePayment(
  db: DB,
  input: Payment,
  allocations: { docId: string; amount: number }[],
) {
  const p = { ...input, sourceDocId: input.sourceDocId || "" };
  const party = db.parties.find((x) => x.id === p.partyId);
  check(party?.active, "Pilih customer/pemasok aktif.");
  check(
    p.direction === (party.kind === "customer" ? "in" : "out"),
    "Arah pembayaran tidak sesuai pihak.",
  );
  check(
    amount(p.amount) && p.amount > 0,
    "Nominal pembayaran harus positif dalam Rupiah bulat.",
  );
  check(
    p.date <= today() &&
      /^\d{4}-\d{2}-\d{2}$/.test(p.date) &&
      !Number.isNaN(Date.parse(p.date)) &&
      new Date(`${p.date}T12:00:00Z`).toISOString().slice(0, 10) === p.date,
    "Tanggal pembayaran tidak valid.",
  );
  check(
    !db.payments.some((x) => x.number.toLowerCase() === p.number.toLowerCase()),
    "Nomor pembayaran sudah digunakan.",
  );
  check(
    new Set(allocations.map((a) => a.docId)).size === allocations.length,
    "Alokasi dokumen ganda.",
  );
  let used = 0;
  for (const a of allocations) {
    const doc = db.documents.find((d) => d.id === a.docId);
    check(
      doc?.status === "final" &&
        doc.partyId === p.partyId &&
        doc.kind === (party.kind === "customer" ? "sale" : "purchase"),
      "Alokasi tagihan tidak valid.",
    );
    check(p.date >= doc.date, "Tanggal pembayaran mendahului tagihan.");
    check(
      amount(a.amount) && a.amount <= Math.max(0, due(db, a.docId)),
      "Alokasi melebihi sisa tagihan.",
    );
    used += a.amount;
  }
  check(used <= p.amount, "Jumlah alokasi melebihi pembayaran.");
  const unapplied = db.payments
    .filter((x) => x.partyId === p.partyId && x.status === "final")
    .reduce(
      (sum, x) =>
        sum +
        x.amount -
        db.allocations
          .filter((a) => a.paymentId === x.id)
          .reduce((s, a) => s + a.amount, 0),
      0,
    );
  check(
    p.amount - used <= Math.max(0, party.openingBalance - unapplied),
    "Bagian tanpa alokasi hanya boleh melunasi sisa saldo awal. Alokasikan pembayaran ke tagihan.",
  );
  db.payments.push(p);
  for (const a of allocations.filter((a) => a.amount > 0))
    db.allocations.push({ id: uid(), paymentId: p.id, ...a });
  audit(db, "Catat pembayaran", p.number, String(p.amount));
}
export function settleInvoice(db: DB, docId: string) {
  const doc = db.documents.find((d) => d.id === docId);
  check(
    doc?.status === "final" && ["sale", "purchase"].includes(doc.kind),
    "Pilih tagihan penjualan atau pembelian yang aktif.",
  );
  const remaining = due(db, doc.id);
  check(remaining > 0, "Tagihan sudah lunas atau memiliki saldo kredit.");
  savePayment(
    db,
    {
      id: uid(),
      number: nextNumber(db, "payment"),
      date: today(),
      partyId: doc.partyId,
      direction: doc.kind === "sale" ? "in" : "out",
      amount: remaining,
      notes: `Pelunasan ${doc.number}`,
      status: "final",
    },
    [{ docId: doc.id, amount: remaining }],
  );
}
export function cancelPayment(db: DB, id: string, reason: string) {
  const p = db.payments.find((p) => p.id === id);
  check(
    p?.status === "final" && reason.trim().length >= 3,
    "Pembayaran tidak aktif atau alasan belum diisi.",
  );
  p.status = "cancelled";
  p.notes = [p.notes, `Dibatalkan: ${reason}`].filter(Boolean).join("\n");
  audit(db, "Batalkan pembayaran", p.number, reason);
}
export function validateDB(value: unknown): asserts value is DB {
  check(value && typeof value === "object", "Format data tidak valid.");
  const db = value as DB;
  check(
    db.schema === 1 && Number.isInteger(db.revision) && db.revision >= 0,
    "Versi data tidak didukung.",
  );
  const keys = Object.keys(emptyDB()).filter(
    (k) => !["schema", "revision"].includes(k),
  ) as (keyof DB)[];
  for (const k of keys) {
    const rows = db[k];
    check(Array.isArray(rows), `Tabel ${k} tidak valid.`);
    const ids = new Set<string>();
    for (const row of rows as { id: string }[]) {
      check(
        typeof row.id === "string" && row.id && !ids.has(row.id),
        `ID ganda/tidak valid pada ${k}.`,
      );
      ids.add(row.id);
    }
  }
  check(
    db.settings.length === 1 && typeof db.settings[0].name === "string",
    "Profil toko tidak valid.",
  );
  for (const i of db.items) {
    check(
      [i.buyPrice, i.sellPrice, i.openingCost].every(amount) &&
        quantity(i.openingQty),
      "Data harga/stok awal tidak valid.",
    );
    const s = stock(db, i.id);
    check(s.qty >= 0 && s.value >= -1, `Stok/nilai ${i.name} tidak konsisten.`);
  }
  for (const d of db.documents) {
    check(
      [
        "sale",
        "purchase",
        "customer_order",
        "supplier_order",
        "sale_return",
        "purchase_return",
      ].includes(d.kind) && ["draft", "final", "cancelled"].includes(d.status),
      "Jenis/status dokumen tidak valid.",
    );
    check(
      db.parties.some((p) => p.id === d.partyId) && amount(d.total),
      "Relasi/total dokumen tidak valid.",
    );
    const ls = linesOf(db, d.id);
    check(
      ls.length > 0 &&
        ls.every(
          (l) =>
            db.items.some((i) => i.id === l.itemId) &&
            quantity(l.qty) &&
            l.qty > 0 &&
            amount(l.price) &&
            validLineDiscount(l) &&
            amount(l.cost) &&
            amount(l.total),
        ),
      "Baris dokumen tidak valid.",
    );
    if (d.status === "final")
      check(
        d.total ===
          ls.reduce((s, l) => s + l.total, 0) -
            (isOrder(d.kind) ? d.discount : 0),
        "Total dokumen berbeda dari detail.",
      );
  }
  check(
    db.lines.every((l) => db.documents.some((d) => d.id === l.docId)),
    "Baris dokumen tanpa header.",
  );
  for (const a of db.allocations)
    check(
      db.payments.some((p) => p.id === a.paymentId) &&
        db.documents.some((d) => d.id === a.docId) &&
        amount(a.amount),
      "Relasi alokasi tidak valid.",
    );
  for (const p of db.payments)
    check(
      db.parties.some((x) => x.id === p.partyId) &&
        amount(p.amount) &&
        ["final", "cancelled"].includes(p.status) &&
        db.allocations
          .filter((a) => a.paymentId === p.id)
          .reduce((s, a) => s + a.amount, 0) <= p.amount,
      "Data pembayaran tidak valid.",
    );
  validateSerialTimeline(db);
}
export function metrics(db: DB, from: string, to: string) {
  const ds = activeDocs(db).filter((d) => d.date >= from && d.date <= to);
  const sales = ds.filter((d) => d.kind === "sale");
  const returns = ds.filter((d) => d.kind === "sale_return");
  const revenue =
    sales.reduce((s, d) => s + d.total, 0) -
    returns.reduce((s, d) => s + d.total, 0);
  const cogs = [...sales, ...returns].reduce(
    (s, d) =>
      s +
      (d.kind === "sale" ? 1 : -1) *
        linesOf(db, d.id).reduce((n, l) => n + l.cost, 0),
    0,
  );
  return {
    revenue,
    profit: revenue - cogs,
    cogs,
    count: sales.length,
    average: sales.length
      ? Math.round(sales.reduce((s, d) => s + d.total, 0) / sales.length)
      : 0,
    purchases:
      ds.filter((d) => d.kind === "purchase").reduce((s, d) => s + d.total, 0) -
      ds
        .filter((d) => d.kind === "purchase_return")
        .reduce((s, d) => s + d.total, 0),
    received: db.payments
      .filter(
        (p) =>
          p.status === "final" &&
          p.direction === "in" &&
          p.date >= from &&
          p.date <= to,
      )
      .reduce((s, p) => s + p.amount, 0),
  };
}

export function refreshInvoiceProfile(db: DB, docId: string) {
  const doc = db.documents.find((d) => d.id === docId);
  check(doc, "Dokumen tidak ditemukan.");
  Object.assign(doc, invoiceProfile(db.settings[0]));
  audit(
    db,
    "Perbarui profil invoice",
    doc.number,
    "Logo, penerbit, rekening, garansi, dan syarat diperbarui dari Pengaturan.",
  );
}
