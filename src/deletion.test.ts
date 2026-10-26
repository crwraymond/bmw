import { describe, it, expect } from "vitest";
import { emptyDB, uid, type Kind } from "./types";
import {
  saveItem,
  saveParty,
  newDoc,
  newLine,
  saveDoc,
  savePayment,
  stock,
  linesOf,
  due,
  validateDB,
} from "./domain";
import { deleteMaster, deleteDocument, deletePayment } from "./revisions";
function setup() {
  const db = emptyDB(),
    item = {
      id: uid(),
      code: "A",
      name: "Barang",
      unit: "pcs",
      pack: "",
      buyPrice: 100,
      sellPrice: 200,
      openingQty: 0,
      openingCost: 0,
      minStock: 0,
      active: true,
    },
    c = {
      id: uid(),
      kind: "customer" as const,
      code: "C",
      name: "Customer",
      address: "",
      city: "",
      phone: "",
      fax: "",
      openingBalance: 0,
      active: true,
    };
  saveItem(db, item);
  saveParty(db, c);
  return { db, item, c };
}
function fixture() {
  const { db, item, c } = setup();
  const post = (kind: Kind, q = 1, refId = "", dp = 0) => {
    const d = newDoc(db, kind);
    if (["sale", "sale_return", "customer_order"].includes(kind))
      d.partyId = c.id;
    d.refId = refId;
    d.downPayment = dp;
    saveDoc(
      db,
      d,
      [
        {
          ...newLine(db, d.id, item.id, kind),
          qty: q,
          refLineId: refId ? linesOf(db, refId)[0].id : "",
        },
      ],
      true,
    );
    return db.documents.find((x) => x.id === d.id)!;
  };
  return { db, item, c, post };
}
describe("hapus data dengan validasi relasi", () => {
  it("hapus master yang belum dipakai dan menolak master yang masih dirujuk", () => {
    const { db, item, c, post } = fixture();
    const buy = post("purchase", 3);
    const before = structuredClone(db);
    expect(() => deleteMaster(db, "items", item.id)).toThrow(/masih dipakai/);
    expect(db).toEqual(before);
    deleteDocument(db, buy.id);
    deleteMaster(db, "items", item.id);
    deleteMaster(db, "customer", c.id);
    expect(db.items).toEqual([]);
    expect(db.parties.some((p) => p.id === c.id)).toBe(false);
    validateDB(db);
  });
  it("penghapusan transaksi memperbarui stok dan menolak menghapus pembelian sumber lebih dahulu", () => {
    const { db, item, post } = fixture();
    const buy = post("purchase", 5),
      sale = post("sale", 2);
    const before = structuredClone(db);
    expect(() => deleteDocument(db, buy.id)).toThrow(/mutasi/);
    expect(db).toEqual(before);
    deleteDocument(db, sale.id);
    expect(stock(db, item.id).qty).toBe(5);
    deleteDocument(db, buy.id);
    expect(stock(db, item.id).qty).toBe(0);
    validateDB(db);
  });
  it("retur dan order yang terhubung harus dihapus sebelum induknya", () => {
    const { db, post } = fixture();
    post("purchase", 5);
    const sale = post("sale", 2),
      back = post("sale_return", 1, sale.id);
    expect(() => deleteDocument(db, sale.id)).toThrow(/turunan/);
    deleteDocument(db, back.id);
    deleteDocument(db, sale.id);
    const order = post("customer_order", 1);
    const fulfilled = newDoc(db, "sale");
    fulfilled.partyId = order.partyId;
    fulfilled.orderId = order.id;
    saveDoc(
      db,
      fulfilled,
      [newLine(db, fulfilled.id, db.items[0].id, "sale")],
      true,
    );
    expect(() => deleteDocument(db, order.id)).toThrow(/turunan/);
    deleteDocument(db, fulfilled.id);
    deleteDocument(db, order.id);
    validateDB(db);
  });
  it("hapus uang muka menghapus alokasi dan mengembalikan sisa tagihan sebelum nota dihapus", () => {
    const { db, c, post } = fixture();
    post("purchase", 5);
    const sale = post("sale", 2, "", 100);
    const before = structuredClone(db);
    expect(() => deleteDocument(db, sale.id)).toThrow(/pembayaran/);
    expect(db).toEqual(before);
    const payment = db.payments[0];
    deletePayment(db, payment.id);
    expect(due(db, sale.id)).toBe(400);
    expect(db.documents.find((d) => d.id === sale.id)?.downPayment).toBe(0);
    expect(db.allocations).toEqual([]);
    deleteDocument(db, sale.id);
    deleteMaster(db, "customer", c.id);
    validateDB(db);
  });
  it("customer dengan pembayaran saldo awal harus menghapus pembayaran lebih dahulu", () => {
    const { db, c } = setup();
    db.parties[0].openingBalance = 50;
    const p = {
      id: uid(),
      number: "PAY1",
      date: new Date().toLocaleDateString("sv-SE"),
      partyId: c.id,
      amount: 50,
      direction: "in" as const,
      status: "final" as const,
      notes: "",
    };
    savePayment(db, p, []);
    expect(() => deleteMaster(db, "customer", c.id)).toThrow(/pembayaran/);
    deletePayment(db, p.id);
    deleteMaster(db, "customer", c.id);
    validateDB(db);
  });
  it("semua jenis dokumen termasuk retur pembelian dan draf dapat dihapus bila tidak terhubung", () => {
    const { db, post } = fixture();
    const buy = post("purchase", 3),
      back = post("purchase_return", 1, buy.id);
    deleteDocument(db, back.id);
    deleteDocument(db, buy.id);
    const d = newDoc(db, "supplier_order");
    saveDoc(db, d, [newLine(db, d.id, db.items[0].id, d.kind)], false);
    deleteDocument(db, d.id);
    expect(db.documents).toEqual([]);
    expect(db.lines).toEqual([]);
    validateDB(db);
  });
});

describe("penghapusan pembayaran khusus invoice dengan persetujuan eksplisit", () => {
  it("menghapus DP dan pembayaran khusus invoice bersama dokumen serta memperbarui stok", () => {
    const { db, item, post } = fixture();
    post("purchase", 3);
    const sale = post("sale", 1, "", 50);
    savePayment(
      db,
      {
        id: uid(),
        number: "PAY-EXTRA",
        date: sale.date,
        partyId: sale.partyId,
        direction: "in",
        amount: 50,
        notes: "",
        status: "final",
      },
      [{ docId: sale.id, amount: 50 }],
    );
    const before = structuredClone(db);
    expect(() => deleteDocument(db, sale.id)).toThrow(/pembayaran terkait/);
    expect(db).toEqual(before);
    deleteDocument(db, sale.id, true);
    expect(db.payments).toEqual([]);
    expect(db.allocations).toEqual([]);
    expect(db.documents.some((d) => d.id === sale.id)).toBe(false);
    expect(stock(db, item.id).qty).toBe(3);
    expect(
      db.audit.filter((a) => a.action === "Hapus pembayaran"),
    ).toHaveLength(2);
    validateDB(db);
  });
  it("menolak pembayaran yang juga melunasi invoice lain secara atomik", () => {
    const { db, post } = fixture();
    post("purchase", 3);
    const first = post("sale"),
      second = post("sale");
    savePayment(
      db,
      {
        id: uid(),
        number: "PAY-SPLIT",
        date: first.date,
        partyId: first.partyId,
        direction: "in",
        amount: 100,
        notes: "",
        status: "final",
      },
      [
        { docId: first.id, amount: 50 },
        { docId: second.id, amount: 50 },
      ],
    );
    const before = structuredClone(db);
    expect(() => deleteDocument(db, first.id, true)).toThrow(/tagihan lain/);
    expect(db).toEqual(before);
  });
  it("menolak pembayaran yang sebagian dipakai untuk saldo awal", () => {
    const { db, post } = fixture();
    post("purchase", 3);
    const sale = post("sale");
    db.parties.find((p) => p.id === sale.partyId)!.openingBalance = 50;
    savePayment(
      db,
      {
        id: uid(),
        number: "PAY-OPENING",
        date: sale.date,
        partyId: sale.partyId,
        direction: "in",
        amount: 100,
        notes: "",
        status: "final",
      },
      [{ docId: sale.id, amount: 50 }],
    );
    const before = structuredClone(db);
    expect(() => deleteDocument(db, sale.id, true)).toThrow(/saldo awal/);
    expect(db).toEqual(before);
  });
  it("tidak menghapus pembayaran jika invoice masih dirujuk retur atau mutasi sesudahnya", () => {
    const { db, post } = fixture();
    post("purchase", 4);
    const sale = post("sale", 2, "", 50);
    const back = post("sale_return", 1, sale.id);
    let before = structuredClone(db);
    expect(() => deleteDocument(db, sale.id, true)).toThrow(/turunan/);
    expect(db).toEqual(before);
    deleteDocument(db, back.id);
    post("sale");
    before = structuredClone(db);
    expect(() => deleteDocument(db, sale.id, true)).toThrow(/mutasi/);
    expect(db).toEqual(before);
  });
});
