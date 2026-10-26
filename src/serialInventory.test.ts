import { describe, it, expect } from "vitest";
import { emptyDB, uid, type DB, type Kind } from "./types";
import {
  newDoc,
  newLine,
  saveItem,
  saveParty,
  saveDoc,
  linesOf,
  stock,
  cancelDoc,
  validateDB,
  withStoreDefaults,
} from "./domain";
import { availableSerials, validateSerialTimeline } from "./serialInventory";
import { reviseDocument, deleteDocument } from "./revisions";
function setup(openingQty = 0) {
  const db = emptyDB(),
    item = {
      id: uid(),
      code: "001",
      name: "Baterai",
      unit: "pcs",
      pack: "",
      buyPrice: 100,
      sellPrice: 200,
      openingQty,
      openingCost: openingQty * 100,
      minStock: 0,
      active: true,
    };
  saveItem(db, item);
  saveParty(db, {
    id: uid(),
    kind: "customer",
    code: "C01",
    name: "Customer",
    address: "",
    city: "",
    phone: "",
    fax: "",
    openingBalance: 0,
    active: true,
  });
  return { db, item };
}
function post(
  db: DB,
  kind: Kind,
  qty: number,
  serials: string,
  refId = "",
  draft = false,
) {
  const doc = newDoc(db, kind);
  if (["sale", "sale_return"].includes(kind))
    doc.partyId = db.parties.find((p) => p.kind === "customer")!.id;
  doc.refId = refId;
  const original = refId ? linesOf(db, refId)[0] : undefined;
  const line = {
    ...newLine(db, doc.id, db.items[0].id, kind),
    qty,
    serials,
    refLineId: original?.id || "",
  };
  saveDoc(db, doc, [line], !draft);
  return db.documents.find((d) => d.id === doc.id)!;
}
const options = (db: DB) =>
  availableSerials(db, db.items[0].id, newDoc(db, "sale")).values;
describe("inventaris serial number", () => {
  it("SN pembelian tersedia, pilihan penjualan mengurangi stok identitas tanpa mengubah format invoice", () => {
    const { db } = setup();
    post(db, "purchase", 3, "SN-001\nSN-002\nSN-003");
    expect(options(db)).toEqual(["SN-001", "SN-002", "SN-003"]);
    const sale = post(db, "sale", 2, "SN-001\nSN-002");
    expect(options(db)).toEqual(["SN-003"]);
    expect(stock(db, db.items[0].id).qty).toBe(1);
    expect(linesOf(db, sale.id)[0].serials).toBe("SN-001\nSN-002");
    validateDB(db);
  });
  it("menolak SN terjual, nomor duplikat, nomor belum diterima saat tidak ada stok anonim dan SN melebihi Qty", () => {
    const { db } = setup();
    post(db, "purchase", 3, "A\nB\nC");
    post(db, "sale", 1, "A");
    for (const [qty, sn] of [
      [1, "A"],
      [2, "B\nb"],
      [1, "X"],
      [1, "B\nC"],
    ] as const) {
      const before = structuredClone(db);
      expect(() => post(db, "sale", qty, sn)).toThrow(/SN/);
      expect(db).toEqual(before);
    }
    expect(() => post(db, "purchase", 1, "b")).toThrow(/SN/);
  });
  it("barang seluruhnya berserial memerlukan pilihan SN sedangkan stok campuran masih boleh tanpa SN", () => {
    const { db } = setup(2);
    post(db, "purchase", 2, "A\nB");
    post(db, "sale", 3, "A");
    expect(options(db)).toEqual(["B"]);
    expect(() => post(db, "sale", 1, "")).toThrow(/pilih serial/);
  });
  it("retur penjualan mengembalikan SN yang benar dan mencegah retur ganda/salah asal", () => {
    const { db } = setup();
    post(db, "purchase", 2, "A\nB");
    const sale = post(db, "sale", 2, "A\nB");
    expect(() => post(db, "sale_return", 1, "X", sale.id)).toThrow(
      /transaksi asal/,
    );
    post(db, "sale_return", 1, "A", sale.id);
    expect(options(db)).toEqual(["A"]);
    expect(() => post(db, "sale_return", 1, "A", sale.id)).toThrow(
      /sudah diretur/,
    );
    post(db, "sale", 1, "A");
    expect(options(db)).toEqual([]);
    validateDB(db);
  });
  it("retur pembelian menolak SN yang sudah terjual dan SN yang dikembalikan bisa diterima lagi", () => {
    const { db } = setup();
    const buy = post(db, "purchase", 2, "A\nB");
    post(db, "sale", 1, "A");
    expect(() => post(db, "purchase_return", 1, "A", buy.id)).toThrow(
      /tidak tersedia/,
    );
    post(db, "purchase_return", 1, "B", buy.id);
    expect(options(db)).toEqual([]);
    post(db, "purchase", 1, "B");
    expect(options(db)).toEqual(["B"]);
    validateDB(db);
  });
  it("draf dan dokumen batal tidak mengunci SN", () => {
    const { db } = setup();
    post(db, "purchase", 1, "DRAFT", "", true);
    expect(options(db)).toEqual([]);
    const buy = post(db, "purchase", 1, "A");
    const draft = post(db, "sale", 1, "A", "", true);
    expect(options(db)).toEqual(["A"]);
    deleteDocument(db, draft.id);
    cancelDoc(db, buy.id, "Salah beli");
    expect(options(db)).toEqual([]);
  });
  it("edit mempertahankan SN sendiri, mengunci SN penjualan sesudahnya dan menolak ganti sumber yang sudah terpakai", () => {
    const { db } = setup();
    const buy = post(db, "purchase", 2, "A\nB"),
      first = post(db, "sale", 1, "A");
    post(db, "sale", 1, "B");
    expect(availableSerials(db, db.items[0].id, first).values).toEqual(["A"]);
    const before = structuredClone(db);
    expect(() =>
      reviseDocument(db, first, [
        { ...linesOf(db, first.id)[0], serials: "B" },
      ]),
    ).toThrow(/SN/);
    expect(db).toEqual(before);
    expect(() =>
      reviseDocument(db, buy, [{ ...linesOf(db, buy.id)[0], serials: "X\nB" }]),
    ).toThrow(/SN/);
    expect(db).toEqual(before);
    expect(() =>
      reviseDocument(db, buy, [{ ...linesOf(db, buy.id)[0], serials: "" }]),
    ).toThrow(/SN/);
    expect(db).toEqual(before);
  });
  it("penyimpanan CSV menormalkan kolom versi pada campuran dokumen lama dan baru tanpa mengaktifkan aturan lama", () => {
    const { db } = setup();
    const legacy = post(db, "purchase", 2, "");
    legacy.serialTracking = undefined;
    post(db, "purchase", 1, "NEW-SN");
    const prepared = withStoreDefaults(db);
    expect(prepared.documents.map((d) => d.serialTracking)).toEqual(["", "v1"]);
    expect(
      prepared.documents.every((d) => typeof d.serialTracking === "string"),
    ).toBe(true);
    expect(db.documents[0].serialTracking).toBeUndefined();
    validateDB(prepared);
    expect(withStoreDefaults(prepared).documents).toEqual(prepared.documents);
  });
  it("data lama tanpa versi tetap dibaca dan ketidakpastian identitas tidak ditebak", () => {
    const { db } = setup();
    const buy = post(db, "purchase", 2, "A\nB");
    const legacy = {
      ...newDoc(db, "sale"),
      serialTracking: undefined,
      status: "final" as const,
      seq: buy.seq + 1,
      partyId: db.parties.find((p) => p.kind === "customer")!.id,
      total: 200,
    };
    db.documents.push(legacy);
    db.lines.push({
      ...newLine(db, legacy.id, db.items[0].id, "sale"),
      qty: 1,
      serials: "",
      total: 200,
      cost: 100,
    });
    expect(() => validateSerialTimeline(db)).not.toThrow();
    expect(options(db)).toEqual([]);
    validateDB(db);
  });
});
