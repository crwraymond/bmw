import { describe, it, expect } from "vitest";
import {
  emptyDB,
  uid,
  today,
  type DB,
  type Item,
  type Party,
  type Kind,
} from "./types";
import {
  newDoc,
  newLine,
  saveDoc,
  saveItem,
  saveParty,
  stock,
  metrics,
  savePayment,
  due,
  balance,
  cancelDoc,
  cancelPayment,
  linesOf,
  fulfilled,
  validateDB,
} from "./domain";
function setup() {
  const db = emptyDB();
  const item: Item = {
    id: uid(),
    code: "001",
    name: 'Baterai, "48V"',
    unit: "pcs",
    pack: "",
    buyPrice: 100,
    sellPrice: 200,
    openingQty: 10,
    openingCost: 1000,
    minStock: 2,
    active: true,
  };
  saveItem(db, item);
  const c: Party = {
    id: uid(),
    kind: "customer",
    code: "C01",
    name: "Toko pelanggan",
    address: "Alamat\nBaris dua",
    city: "Purwokerto",
    phone: "08123",
    fax: "",
    openingBalance: 0,
    active: true,
  };
  const s: Party = {
    ...c,
    id: uid(),
    kind: "supplier",
    code: "P01",
    name: "Pemasok",
  };
  saveParty(db, c);
  saveParty(db, s);
  return { db, item, c, s };
}
function doc(
  db: DB,
  kind: Kind,
  itemId: string,
  partyId: string,
  q = 1,
  price?: number,
  discount = 0,
) {
  const d = newDoc(db, kind);
  d.partyId = partyId;
  d.discount = discount;
  const line = newLine(db, d.id, itemId, kind);
  line.qty = q;
  if (price !== undefined) line.price = price;
  saveDoc(db, d, [line], true);
  return db.documents.find((x) => x.id === d.id)!;
}
function ret(db: DB, parentId: string, q = 1) {
  const parent = db.documents.find((d) => d.id === parentId)!;
  const origin = linesOf(db, parentId)[0];
  const d = newDoc(
    db,
    parent.kind === "sale" ? "sale_return" : "purchase_return",
  );
  d.partyId = parent.partyId;
  d.refId = parent.id;
  saveDoc(
    db,
    d,
    [{ ...origin, id: uid(), docId: d.id, refLineId: origin.id, qty: q }],
    true,
  );
  return db.documents.at(-1)!;
}
function payment(db: DB, partyId: string, docId: string, amount: number) {
  const p = {
    id: uid(),
    number: uid(),
    date: today(),
    partyId,
    amount,
    direction: "in" as const,
    notes: "",
    status: "final" as const,
  };
  savePayment(db, p, [{ docId, amount }]);
  return p;
}

describe("integritas transaksi", () => {
  it("penjualan mengurangi stok dan mengunci HPP historis", () => {
    const { db, item, c } = setup();
    const d = doc(db, "sale", item.id, c.id, 2);
    expect(stock(db, item.id)).toMatchObject({ qty: 8, value: 800 });
    expect(metrics(db, today(), today())).toMatchObject({
      revenue: 400,
      profit: 200,
      count: 1,
    });
    saveItem(db, { ...item, buyPrice: 9999 });
    expect(linesOf(db, d.id)[0].cost).toBe(200);
    validateDB(db);
  });
  it("pembelian memakai diskon dan HPP rata-rata bergerak", () => {
    const { db, item, c, s } = setup();
    doc(db, "purchase", item.id, s.id, 10, 200, 100);
    expect(stock(db, item.id)).toMatchObject({
      qty: 20,
      value: 2900,
      average: 145,
    });
    doc(db, "sale", item.id, c.id, 2, 300);
    expect(metrics(db, today(), today()).profit).toBe(310);
    validateDB(db);
  });
  it("diskon penjualan diretur proporsional tanpa melebihi nilai asal", () => {
    const { db, item, c } = setup();
    const d = doc(db, "sale", item.id, c.id, 3, 200, 100);
    ret(db, d.id, 1);
    ret(db, d.id, 2);
    expect(due(db, d.id)).toBe(0);
    expect(stock(db, item.id)).toMatchObject({ qty: 10, value: 1000 });
    expect(metrics(db, today(), today())).toMatchObject({
      revenue: 0,
      profit: 0,
    });
    expect(() => ret(db, d.id, 1)).toThrow("melebihi");
    validateDB(db);
  });
  it("stok kurang dan backdate ditolak", () => {
    const { db, item, c } = setup();
    expect(() => doc(db, "sale", item.id, c.id, 11)).toThrow("tidak cukup");
    doc(db, "sale", item.id, c.id);
    const d = newDoc(db, "sale");
    d.partyId = c.id;
    d.date = "2000-01-01";
    expect(() =>
      saveDoc(db, d, [newLine(db, d.id, item.id, "sale")], true),
    ).toThrow("mendahului");
  });
  it("draf tidak mengubah stok atau metrik", () => {
    const { db, item, c } = setup();
    const d = newDoc(db, "sale");
    d.partyId = c.id;
    saveDoc(db, d, [newLine(db, d.id, item.id, "sale")], false);
    expect(stock(db, item.id).qty).toBe(10);
    expect(metrics(db, today(), today()).count).toBe(0);
    saveDoc(db, db.documents[0], linesOf(db, d.id), true);
    expect(stock(db, item.id).qty).toBe(9);
    expect(() => saveDoc(db, db.documents[0], linesOf(db, d.id), true)).toThrow(
      "tidak dapat ditimpa",
    );
  });
  it("pembayaran tidak menambah penjualan; pelunasan teralokasi", () => {
    const { db, item, c } = setup();
    const d = doc(db, "sale", item.id, c.id, 2);
    const p = payment(db, c.id, d.id, 150);
    expect(due(db, d.id)).toBe(250);
    expect(balance(db, c.id)).toBe(250);
    expect(metrics(db, today(), today()).revenue).toBe(400);
    expect(() => payment(db, c.id, d.id, 251)).toThrow("melebihi");
    expect(() => cancelDoc(db, d.id, "Koreksi")).toThrow("pembayaran");
    cancelPayment(db, p.id, "Salah input");
    cancelDoc(db, d.id, "Salah input");
    expect(stock(db, item.id).qty).toBe(10);
    validateDB(db);
  });
  it("retur yang telah dilunasi membentuk saldo kredit", () => {
    const { db, item, c } = setup();
    const d = doc(db, "sale", item.id, c.id, 2);
    payment(db, c.id, d.id, 400);
    ret(db, d.id, 1);
    expect(balance(db, c.id)).toBe(-200);
    expect(due(db, d.id)).toBe(-200);
    validateDB(db);
  });
  it("order tidak mengubah stok dan pemenuhan tidak boleh berlebih", () => {
    const { db, item, c } = setup();
    const order = doc(db, "customer_order", item.id, c.id, 2);
    expect(stock(db, item.id).qty).toBe(10);
    const d = newDoc(db, "sale");
    d.partyId = c.id;
    d.orderId = order.id;
    const l = newLine(db, d.id, item.id, "sale");
    l.qty = 1;
    saveDoc(db, d, [l], true);
    expect(fulfilled(db, order.id, item.id)).toBe(1);
    const second = newDoc(db, "sale");
    second.partyId = c.id;
    second.orderId = order.id;
    expect(() =>
      saveDoc(
        db,
        second,
        [{ ...l, id: uid(), docId: second.id, qty: 2 }],
        true,
      ),
    ).toThrow("sisa order");
    expect(() => cancelDoc(db, order.id, "Batal order")).toThrow("turunan");
  });
  it("pembatalan mutasi lama diblokir setelah ada mutasi berikutnya", () => {
    const { db, item, c, s } = setup();
    const p = doc(db, "purchase", item.id, s.id, 3);
    doc(db, "sale", item.id, c.id, 1);
    expect(() => cancelDoc(db, p.id, "Koreksi")).toThrow(
      "mutasi barang sesudah",
    );
  });
  it("retur pembelian mengurangi stok dan kewajiban pemasok", () => {
    const { db, item, s } = setup();
    const p = doc(db, "purchase", item.id, s.id, 2, 120, 20);
    ret(db, p.id, 1);
    expect(stock(db, item.id).qty).toBe(11);
    expect(balance(db, s.id)).toBe(110);
    validateDB(db);
  });
  it("diskon kecil pada banyak baris tetap teralokasi tanpa angka negatif", () => {
    const { db, c, item } = setup();
    const ids = [item.id];
    for (let i = 0; i < 4; i++) {
      const next = {
        ...item,
        id: uid(),
        code: `B${i}`,
        buyPrice: 0,
        sellPrice: 1,
      };
      saveItem(db, next);
      ids.push(next.id);
    }
    const d = newDoc(db, "sale");
    d.partyId = c.id;
    d.discount = 3;
    saveDoc(
      db,
      d,
      ids.map((id) => ({ ...newLine(db, d.id, id, "sale"), price: 1 })),
      true,
    );
    expect(linesOf(db, d.id).every((l) => l.total >= 0)).toBe(true);
    expect(linesOf(db, d.id).reduce((s, l) => s + l.total, 0)).toBe(2);
    validateDB(db);
  });
  it("kode duplikat dan perubahan stok awal setelah pemakaian ditolak", () => {
    const { db, item, c } = setup();
    expect(() => saveItem(db, { ...item, id: uid() })).toThrow(
      "sudah digunakan",
    );
    doc(db, "sale", item.id, c.id);
    expect(() => saveItem(db, { ...item, openingQty: 20 })).toThrow("terkunci");
  });
  it("saldo awal dapat dilunasi tanpa alokasi", () => {
    const { db, c } = setup();
    saveParty(db, { ...c, openingBalance: 300 });
    savePayment(
      db,
      {
        id: uid(),
        number: "PAY-A",
        date: today(),
        partyId: c.id,
        amount: 100,
        direction: "in",
        notes: "",
        status: "final",
      },
      [],
    );
    expect(balance(db, c.id)).toBe(200);
    expect(() =>
      savePayment(
        db,
        {
          id: uid(),
          number: "PAY-B",
          date: today(),
          partyId: c.id,
          amount: 201,
          direction: "in",
          notes: "",
          status: "final",
        },
        [],
      ),
    ).toThrow("saldo awal");
  });
  it("data rusak dan relasi hilang ditolak saat pemulihan", () => {
    const { db, item, c } = setup();
    doc(db, "sale", item.id, c.id);
    const broken = structuredClone(db);
    broken.items = [];
    expect(() => validateDB(broken)).toThrow("Baris dokumen");
    const dup = structuredClone(db);
    dup.items.push({ ...dup.items[0] });
    expect(() => validateDB(dup)).toThrow("ID ganda");
  });
});
