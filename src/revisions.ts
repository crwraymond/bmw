import {
  type DB,
  type Doc,
  type Line,
  type Payment,
  type Item,
  type Party,
  uid,
  today,
} from "./types";
import {
  activeDocs,
  audit,
  isOrder,
  linesOf,
  paid,
  returnedValue,
  saveDoc,
  saveItem,
  saveParty,
  validateDB,
  cancelDoc,
} from "./domain";
import { validateSerialChanges } from "./serialInventory";
function requireValue(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
const amount = (n: number) => Number.isSafeInteger(n) && n >= 0 && n <= 1e12;
function validDate(date: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    date <= today() &&
    !Number.isNaN(Date.parse(date)) &&
    new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date
  );
}
export function downPaymentFor(db: DB, doc: Doc) {
  return db.payments.find(
    (p) =>
      p.status === "final" &&
      (p.sourceDocId === doc.id ||
        (!p.sourceDocId &&
          p.partyId === doc.partyId &&
          p.amount === doc.downPayment &&
          p.notes === `Uang muka ${doc.number}` &&
          db.allocations.filter((a) => a.paymentId === p.id).length === 1 &&
          db.allocations.some(
            (a) =>
              a.paymentId === p.id &&
              a.docId === doc.id &&
              a.amount === p.amount,
          ))),
  );
}
function validateSettlements(db: DB) {
  const payments = db.payments.filter((p) => p.status === "final");
  const allocated = new Map<string, number>();
  const unallocated = new Map<string, number>();
  for (const p of payments) {
    const party = db.parties.find((x) => x.id === p.partyId);
    requireValue(
      party && p.direction === (party.kind === "customer" ? "in" : "out"),
      `Pihak pembayaran ${p.number} tidak sesuai.`,
    );
    requireValue(
      p.number.trim() && amount(p.amount) && p.amount > 0 && validDate(p.date),
      `Nomor, tanggal, atau nominal pembayaran ${p.number} tidak valid.`,
    );
    requireValue(
      !db.payments.some(
        (x) =>
          x.id !== p.id && x.number.toLowerCase() === p.number.toLowerCase(),
      ),
      "Nomor pembayaran sudah digunakan.",
    );
    const allocations = db.allocations.filter((a) => a.paymentId === p.id);
    requireValue(
      new Set(allocations.map((a) => a.docId)).size === allocations.length,
      "Alokasi dokumen ganda.",
    );
    let used = 0;
    for (const a of allocations) {
      const doc = db.documents.find((d) => d.id === a.docId);
      requireValue(
        doc?.status === "final" &&
          doc.partyId === p.partyId &&
          doc.kind === (p.direction === "in" ? "sale" : "purchase"),
        `Alokasi ${p.number} tidak sesuai dengan nota/faktur. Ubah pihak atau alokasinya terlebih dahulu.`,
      );
      requireValue(
        amount(a.amount) && p.date >= doc.date,
        `Nominal atau tanggal alokasi ${p.number} tidak valid.`,
      );
      used += a.amount;
      allocated.set(doc.id, (allocated.get(doc.id) || 0) + a.amount);
    }
    requireValue(
      used <= p.amount,
      `Alokasi ${p.number} melebihi nominal pembayaran.`,
    );
    unallocated.set(
      p.partyId,
      (unallocated.get(p.partyId) || 0) + p.amount - used,
    );
    if (p.sourceDocId) {
      const source = db.documents.find((d) => d.id === p.sourceDocId);
      requireValue(
        source?.status === "final" &&
          source.kind === "sale" &&
          allocations.length === 1 &&
          allocations[0].docId === source.id &&
          used === p.amount &&
          source.downPayment === p.amount,
        `Uang muka ${p.number} tidak sesuai dengan invoice.`,
      );
    }
  }
  for (const [id, total] of allocated) {
    const doc = db.documents.find((d) => d.id === id)!;
    requireValue(
      total <= doc.total,
      `Pembayaran teralokasi pada ${doc.number} melebihi total baru. Ubah nominal atau alokasi pembayaran terlebih dahulu.`,
    );
  }
  for (const [id, total] of unallocated) {
    const party = db.parties.find((p) => p.id === id)!;
    requireValue(
      total <= Math.max(0, party.openingBalance),
      `Pembayaran saldo awal ${party.name} melebihi saldo awal baru.`,
    );
  }
}
export function recalculate(seed: DB, changedId = ""): DB {
  const work = structuredClone(seed);
  const finals = activeDocs(seed);
  const activeIds = new Set(finals.map((d) => d.id));
  work.documents = work.documents.filter((d) => !activeIds.has(d.id));
  work.lines = work.lines.filter((l) => !activeIds.has(l.docId));
  // Historical transactions remain editable after a master is deactivated.
  work.items = work.items.map((i) => ({ ...i, active: true }));
  work.parties = work.parties.map((p) => ({ ...p, active: true }));
  const ordered = [
    ...finals.filter((d) => isOrder(d.kind)).sort((a, b) => a.seq - b.seq),
    ...finals
      .filter((d) => !isOrder(d.kind))
      .sort((a, b) => a.date.localeCompare(b.date) || a.seq - b.seq),
  ];
  for (const original of ordered) {
    try {
      saveDoc(
        work,
        { ...original, downPayment: 0 },
        linesOf(seed, original.id),
        true,
      );
      const saved = work.documents.find((d) => d.id === original.id)!;
      saved.downPayment = original.downPayment;
      requireValue(
        amount(saved.downPayment || 0) && saved.downPayment <= saved.total,
        "Uang muka melebihi total dokumen baru.",
      );
      if (original.id !== changedId) {
        saved.partyName = original.partyName;
        saved.partyAddress = original.partyAddress;
        saved.partyPhone = original.partyPhone;
      }
    } catch (e) {
      throw new Error(
        `${original.number}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
  const computed = new Map(work.documents.map((d) => [d.id, d]));
  work.documents = seed.documents.map((d) => computed.get(d.id)!);
  work.items = structuredClone(seed.items);
  work.parties = work.parties.map((p) => ({
    ...p,
    active: seed.parties.find((x) => x.id === p.id)?.active ?? p.active,
  }));
  work.audit = structuredClone(seed.audit);
  validateSettlements(work);
  validateDB(work);
  return work;
}
export function reviseDocument(db: DB, input: Doc, inputLines: Line[]) {
  const old = db.documents.find((d) => d.id === input.id);
  requireValue(
    old?.status === "final" && old.kind === input.kind,
    "Hanya dokumen final aktif yang dapat diedit.",
  );
  const work = structuredClone(db);
  const updated = {
    ...input,
    status: "final" as const,
    seq: old.seq,
    createdAt: old.createdAt,
  };
  work.documents = work.documents.map((d) => (d.id === old.id ? updated : d));
  work.lines = [
    ...work.lines.filter((l) => l.docId !== old.id),
    ...inputLines.map((l) => ({ ...l, docId: old.id })),
  ];
  const dp = downPaymentFor(db, old);
  if (dp) {
    const payment = work.payments.find((p) => p.id === dp.id)!;
    if (!updated.downPayment) payment.status = "cancelled";
    else {
      payment.amount = updated.downPayment;
      if (updated.date !== old.date && payment.date === old.date)
        payment.date = updated.date;
      payment.partyId = updated.partyId;
      payment.sourceDocId = updated.id;
      if (payment.notes === `Uang muka ${old.number}`)
        payment.notes = `Uang muka ${updated.number}`;
      work.allocations = work.allocations.map((a) =>
        a.paymentId === dp.id ? { ...a, amount: updated.downPayment } : a,
      );
    }
  } else if (
    updated.downPayment !== old.downPayment &&
    updated.downPayment > 0
  ) {
    const id = uid();
    work.payments.push({
      id,
      number: `DP/${updated.number}/${id.slice(0, 8)}`,
      date: updated.date,
      partyId: updated.partyId,
      direction: "in",
      amount: updated.downPayment,
      notes: `Uang muka ${updated.number}`,
      status: "final",
      sourceDocId: updated.id,
    });
    work.allocations.push({
      id: uid(),
      paymentId: id,
      docId: updated.id,
      amount: updated.downPayment,
    });
  }
  validateSerialChanges(db, work);
  const result = recalculate(work, old.id);
  audit(
    result,
    "Ubah dokumen",
    updated.number,
    JSON.stringify({
      id: old.id,
      sebelumnya: {
        total: old.total,
        qty: linesOf(db, old.id).map((l) => ({
          item: l.code,
          qty: l.qty,
          harga: l.price,
        })),
      },
      sesudah: {
        total: result.documents.find((d) => d.id === old.id)!.total,
        qty: inputLines.map((l) => ({
          item: l.code,
          qty: l.qty,
          harga: l.price,
        })),
      },
    }),
  );
  Object.assign(db, result);
}
export function revisePayment(
  db: DB,
  input: Payment,
  allocations: { docId: string; amount: number }[],
) {
  const old = db.payments.find((p) => p.id === input.id);
  requireValue(
    old?.status === "final",
    "Hanya pembayaran aktif yang dapat diedit.",
  );
  const work = structuredClone(db);
  const originalAllocations = db.allocations.filter(
    (a) => a.paymentId === old.id,
  );
  for (const allocation of allocations) {
    const doc = db.documents.find((d) => d.id === allocation.docId);
    requireValue(doc, "Tagihan tidak ditemukan.");
    const previous =
      originalAllocations.find((a) => a.docId === allocation.docId)?.amount ||
      0;
    const room = Math.max(
      0,
      doc.total - returnedValue(db, doc.id) - paid(db, doc.id) + previous,
    );
    requireValue(
      allocation.amount <= Math.max(previous, room),
      `Alokasi pada ${doc.number} melebihi sisa tagihan.`,
    );
  }
  const source = db.documents.find((d) => downPaymentFor(db, d)?.id === old.id);
  const payment = {
    ...input,
    status: "final" as const,
    sourceDocId: source?.id || old.sourceDocId || "",
  };
  if (source)
    work.documents.find((d) => d.id === source.id)!.downPayment =
      payment.amount;
  work.payments = work.payments.map((p) => (p.id === old.id ? payment : p));
  work.allocations = [
    ...work.allocations.filter((a) => a.paymentId !== old.id),
    ...allocations
      .filter((a) => a.amount > 0)
      .map((a) => ({
        id: originalAllocations.find((x) => x.docId === a.docId)?.id || uid(),
        paymentId: old.id,
        ...a,
      })),
  ];
  validateSettlements(work);
  validateDB(work);
  audit(
    work,
    "Ubah pembayaran",
    payment.number,
    JSON.stringify({
      id: old.id,
      sebelum: old.amount,
      sesudah: payment.amount,
    }),
  );
  Object.assign(db, work);
}
// Interactive catalog changes cannot introduce stock. Historical CSV/backup
// imports keep using the lower-level master/replay paths to preserve balances.
export function saveCatalogItem(db: DB, item: Item) {
  const old = db.items.find((i) => i.id === item.id);
  requireValue(
    item.openingQty === (old?.openingQty ?? 0) &&
      item.openingCost === (old?.openingCost ?? 0),
    "Stok tidak dapat diisi atau diubah melalui data barang. Catat pembelian untuk menambah stok.",
  );
  if (old) reviseItem(db, item);
  else saveItem(db, item);
}
export function deleteMaster(db: DB, kind: "items" | "customer", id: string) {
  if (kind === "items") {
    const item = db.items.find((i) => i.id === id);
    requireValue(item, "Barang tidak ditemukan.");
    requireValue(
      !db.lines.some((l) => l.itemId === id),
      "Barang masih dipakai pada dokumen. Hapus dokumen terkait dahulu, atau nonaktifkan barang.",
    );
    db.items = db.items.filter((i) => i.id !== id);
    audit(db, "Hapus barang", item.code, item.name);
  } else {
    const party = db.parties.find((p) => p.id === id && p.kind === "customer");
    requireValue(party, "Customer tidak ditemukan.");
    requireValue(
      !db.documents.some((d) => d.partyId === id) &&
        !db.payments.some((p) => p.partyId === id),
      "Customer masih dipakai pada dokumen/pembayaran. Hapus data terkait dahulu, atau nonaktifkan customer.",
    );
    db.parties = db.parties.filter((p) => p.id !== id);
    audit(db, "Hapus customer", party.code, party.name);
  }
}
export function deleteDocument(db: DB, id: string) {
  const work = structuredClone(db),
    doc = work.documents.find((d) => d.id === id);
  requireValue(doc, "Dokumen tidak ditemukan.");
  requireValue(
    !work.documents.some((d) => d.refId === id || d.orderId === id),
    "Dokumen masih dirujuk order/retur/transaksi lain. Hapus dokumen turunan terlebih dahulu.",
  );
  requireValue(
    !work.allocations.some((a) => a.docId === id) &&
      !work.payments.some((p) => p.sourceDocId === id),
    "Dokumen masih memiliki pembayaran terkait. Hapus pembayaran tersebut terlebih dahulu.",
  );
  if (doc.status === "final") cancelDoc(work, id, "Hapus dokumen salah input");
  work.documents = work.documents.filter((d) => d.id !== id);
  work.lines = work.lines.filter((l) => l.docId !== id);
  validateDB(work);
  audit(work, "Hapus dokumen", doc.number, doc.kind);
  Object.assign(db, work);
}
export function deletePayment(db: DB, id: string) {
  const work = structuredClone(db),
    payment = work.payments.find((p) => p.id === id);
  requireValue(payment, "Pembayaran tidak ditemukan.");
  const source = work.documents.find(
    (d) => d.id === payment.sourceDocId || downPaymentFor(work, d)?.id === id,
  );
  if (
    source &&
    !work.payments.some(
      (p) => p.id !== id && p.status === "final" && p.sourceDocId === source.id,
    )
  )
    source.downPayment = 0;
  work.payments = work.payments.filter((p) => p.id !== id);
  work.allocations = work.allocations.filter((a) => a.paymentId !== id);
  validateDB(work);
  audit(work, "Hapus pembayaran", payment.number, String(payment.amount));
  Object.assign(db, work);
}
export function reviseItem(db: DB, item: Item) {
  const work = structuredClone(db);
  const validation = { ...work, lines: [], audit: [] };
  saveItem(validation, item);
  work.items = validation.items;
  const result = recalculate(work);
  audit(
    result,
    "Ubah barang",
    item.code,
    "Data barang dan nilai persediaan diperbarui.",
  );
  Object.assign(db, result);
}
export function reviseParty(db: DB, party: Party) {
  const work = structuredClone(db);
  const validation = { ...work, documents: [], payments: [], audit: [] };
  saveParty(validation, party);
  work.parties = validation.parties;
  validateSettlements(work);
  validateDB(work);
  audit(work, "Ubah kontak", party.code, "Data kontak diperbarui.");
  Object.assign(db, work);
}
