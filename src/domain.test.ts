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
  saleStockLimit,
  metrics,
  savePayment,
  settleInvoice,
  paid,
  due,
  balance,
  cancelDoc,
  cancelPayment,
  linesOf,
  fulfilled,
  validateDB,
  withLineDiscountDefaults,
  lineDiscount,
  lineNet,
  inventoryCapital,
  totalCapital,
  singleSupplier,
  withStoreDefaults,
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
  it("modal persediaan mengikuti HPP pembelian, penjualan, dan retur", () => {
    const { db, item, c, s } = setup();
    expect(inventoryCapital(db)).toBe(1000);
    const purchase = newDoc(db, "purchase");
    purchase.partyId = s.id;
    saveDoc(
      db,
      purchase,
      [
        {
          ...newLine(db, purchase.id, item.id, "purchase"),
          qty: 10,
          price: 200,
          discountType: "percent",
          discountValue: 10,
        },
      ],
      true,
    );
    expect(inventoryCapital(db)).toBe(2800);
    const sale = doc(db, "sale", item.id, c.id, 3);
    expect(inventoryCapital(db)).toBe(2380);
    ret(db, sale.id, 1);
    expect(inventoryCapital(db)).toBe(2520);
    ret(db, purchase.id, 2);
    expect(inventoryCapital(db)).toBe(2240);
    db.items[0].active = false;
    expect(inventoryCapital(db)).toBe(2240);
    validateDB(db);
  });
  it("pemasok tetap dibuat otomatis hanya setelah pembelian valid", () => {
    const { db, item } = setup();
    db.parties = db.parties.filter((p) => p.kind === "customer");
    const purchase = newDoc(db, "purchase");
    const line = newLine(db, purchase.id, item.id, "purchase");
    expect(() => saveDoc(db, purchase, [{ ...line, price: -1 }], true)).toThrow(
      "harga",
    );
    expect(db.parties.filter((p) => p.kind === "supplier")).toHaveLength(0);
    saveDoc(db, purchase, [line], true);
    const supplier = singleSupplier(db);
    expect(db.parties.filter((p) => p.kind === "supplier")).toHaveLength(1);
    expect(db.documents[0].partyId).toBe(supplier.id);
    expect(newDoc(db, "supplier_order").partyId).toBe(supplier.id);
    ret(db, purchase.id, 1);
    expect(balance(db, supplier.id)).toBe(0);
    validateDB(db);
  });
  it("pemasok lama dipakai kembali dan relasi dokumen tetap utuh", () => {
    const { db, item, s } = setup();
    doc(db, "purchase", item.id, s.id, 2);
    const prepared = withStoreDefaults(db);
    expect(prepared.parties.filter((p) => p.kind === "supplier")).toHaveLength(
      1,
    );
    expect(singleSupplier(prepared).id).toBe(s.id);
    expect(prepared.documents).toEqual(db.documents);
    expect(prepared.lines.map((l) => l.total)).toEqual(
      db.lines.map((l) => l.total),
    );
    expect(newDoc(prepared, "purchase").partyId).toBe(s.id);
    expect(withStoreDefaults(prepared).parties).toEqual(prepared.parties);
    validateDB(prepared);
  });
  it("diskon persen dan Rupiah per unit dialokasikan bersama diskon total", () => {
    const { db, item, c } = setup();
    const second = { ...item, id: uid(), code: "002" };
    saveItem(db, second);
    const sale = newDoc(db, "sale");
    sale.partyId = c.id;
    sale.discount = 90;
    saveDoc(
      db,
      sale,
      [
        {
          ...newLine(db, sale.id, item.id, "sale"),
          qty: 3,
          discountType: "percent",
          discountValue: 10,
        },
        {
          ...newLine(db, sale.id, second.id, "sale"),
          qty: 2,
          price: 300,
          discountType: "amount",
          discountValue: 25,
        },
      ],
      true,
    );
    const saved = linesOf(db, sale.id);
    expect(saved.map(lineDiscount)).toEqual([60, 50]);
    expect(saved.map(lineNet)).toEqual([540, 550]);
    expect(saved.map((l) => l.total)).toEqual([495, 505]);
    expect(db.documents[0].total).toBe(1000);
    expect(metrics(db, today(), today())).toMatchObject({
      revenue: 1000,
      profit: 500,
      cogs: 500,
    });
    ret(db, sale.id, 1);
    ret(db, sale.id, 2);
    const back = newDoc(db, "sale_return");
    back.partyId = c.id;
    back.refId = sale.id;
    saveDoc(
      db,
      back,
      [{ ...saved[1], id: uid(), docId: back.id, refLineId: saved[1].id }],
      true,
    );
    expect(due(db, sale.id)).toBe(0);
    expect(metrics(db, today(), today())).toMatchObject({
      revenue: 0,
      profit: 0,
    });
    expect(stock(db, item.id).qty).toBe(10);
    expect(stock(db, second.id).qty).toBe(10);
    validateDB(db);
  });
  it("diskon produk pembelian masuk nilai stok dan kredit retur mengikuti nilai bersih", () => {
    const { db, item, s } = setup();
    const purchase = newDoc(db, "purchase");
    purchase.partyId = s.id;
    purchase.discount = 25;
    const line = {
      ...newLine(db, purchase.id, item.id, "purchase"),
      qty: 3,
      price: 200,
      discountType: "percent" as const,
      discountValue: 12.5,
    };
    saveDoc(db, purchase, [line], false);
    expect(stock(db, item.id).value).toBe(1000);
    expect(db.documents[0].total).toBe(500);
    saveDoc(db, db.documents[0], linesOf(db, purchase.id), true);
    expect(linesOf(db, purchase.id)[0].cost).toBe(500);
    expect(stock(db, item.id)).toMatchObject({ qty: 13, value: 1500 });
    expect(ret(db, purchase.id, 1).total).toBe(167);
    expect(ret(db, purchase.id, 2).total).toBe(333);
    expect(balance(db, s.id)).toBe(0);
    validateDB(db);
  });
  it("diskon tidak valid ditolak dan diskon 100% menghasilkan nilai nol", () => {
    const { db, item, c } = setup();
    const sale = newDoc(db, "sale");
    sale.partyId = c.id;
    for (const discount of [
      { discountType: "percent", discountValue: -1 },
      { discountType: "percent", discountValue: 100.01 },
      { discountType: "percent", discountValue: 1.001 },
      { discountType: "amount", discountValue: 201 },
      { discountType: "amount", discountValue: 0.5 },
    ] as const) {
      expect(() =>
        saveDoc(
          db,
          sale,
          [{ ...newLine(db, sale.id, item.id, "sale"), ...discount }],
          true,
        ),
      ).toThrow("Diskon produk");
    }
    saveDoc(
      db,
      sale,
      [
        {
          ...newLine(db, sale.id, item.id, "sale"),
          discountType: "percent",
          discountValue: 100,
        },
      ],
      true,
    );
    expect(db.documents[0].total).toBe(0);
    validateDB(db);
  });
  it("data versi lama diberi default diskon nol tanpa mengubah nilai historis", () => {
    const { db, item, c } = setup();
    doc(db, "sale", item.id, c.id, 2, 200, 50);
    delete db.lines[0].discountType;
    delete db.lines[0].discountValue;
    validateDB(db);
    const normalized = withLineDiscountDefaults(db);
    expect(normalized.lines[0]).toMatchObject({
      discountType: "amount",
      discountValue: 0,
      total: 350,
      cost: 200,
    });
    expect(normalized.documents[0].total).toBe(350);
    expect(db.lines[0].discountType).toBeUndefined();
    validateDB(normalized);
    const malformed = structuredClone(normalized);
    malformed.lines[0].discountValue = -1;
    expect(() => validateDB(malformed)).toThrow("Baris dokumen");
  });
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

describe("batas stok pada form penjualan", () => {
  it("memakai stok saat ini untuk penjualan baru/draf dan mengembalikan qty nota yang sedang diedit", () => {
    const { db, item, c } = setup();
    const sale = doc(db, "sale", item.id, c.id, 10);
    expect(stock(db, item.id).qty).toBe(0);
    expect(saleStockLimit(db, newDoc(db, "sale"), item.id)).toBe(0);
    expect(saleStockLimit(db, sale, item.id)).toBe(10);
    expect(
      saleStockLimit(db, { ...sale, notes: "Edit catatan" }, item.id),
    ).toBe(10);
  });
  it("menyisakan stok untuk penjualan sesudahnya, tanpa menghitung draf dan nota batal", () => {
    const { db, item, c } = setup();
    const first = doc(db, "sale", item.id, c.id, 3);
    doc(db, "sale", item.id, c.id, 5);
    const cancelled = doc(db, "sale", item.id, c.id, 1);
    cancelDoc(db, cancelled.id, "Salah input");
    const draft = newDoc(db, "sale");
    draft.partyId = c.id;
    saveDoc(
      db,
      draft,
      [{ ...newLine(db, draft.id, item.id, "sale"), qty: 20 }],
      false,
    );
    expect(saleStockLimit(db, first, item.id)).toBe(5);
    expect(saleStockLimit(db, draft, item.id)).toBe(2);
  });
  it("pembelian belakangan tidak membiayai penjualan lama; tanggal edit mengikuti urutan replay", () => {
    const { db, item, c, s } = setup();
    const first = doc(db, "sale", item.id, c.id, 10);
    first.date = "2020-01-01";
    const purchase = doc(db, "purchase", item.id, s.id, 10);
    purchase.date = "2020-01-02";
    expect(saleStockLimit(db, first, item.id)).toBe(10);
    expect(saleStockLimit(db, { ...first, date: "2020-01-03" }, item.id)).toBe(
      20,
    );
  });
  it("retur setelah penjualan bukan stok yang tersedia sebelum penjualan itu", () => {
    const { db, item, c } = setup();
    const first = doc(db, "sale", item.id, c.id, 10);
    ret(db, first.id, 3);
    expect(stock(db, item.id).qty).toBe(3);
    expect(saleStockLimit(db, first, item.id)).toBe(10);
  });
  it("menjaga presisi qty pecahan sampai tiga desimal", () => {
    const { db, item, c } = setup();
    saveItem(db, { ...item, openingQty: 0.3, openingCost: 30 });
    const first = doc(db, "sale", item.id, c.id, 0.1);
    doc(db, "sale", item.id, c.id, 0.2);
    expect(saleStockLimit(db, first, item.id)).toBe(0.1);
    expect(saleStockLimit(db, newDoc(db, "sale"), item.id)).toBe(0);
  });
});

describe("pelunasan otomatis per nota", () => {
  it("mencatat hanya sisa tagihan dan mempertahankan uang muka serta stok", () => {
    const { db, item, c } = setup();
    const sale = newDoc(db, "sale");
    sale.partyId = c.id;
    sale.downPayment = 200;
    saveDoc(
      db,
      sale,
      [{ ...newLine(db, sale.id, item.id, "sale"), qty: 5 }],
      true,
    );
    const originalPayment = structuredClone(db.payments[0]);
    const beforeStock = stock(db, item.id);
    settleInvoice(db, sale.id);
    expect(db.payments).toHaveLength(2);
    expect(db.payments[0]).toEqual(originalPayment);
    expect(db.payments[1]).toMatchObject({
      amount: 800,
      direction: "in",
      sourceDocId: "",
    });
    expect(
      db.allocations.filter((a) => a.docId === sale.id).map((a) => a.amount),
    ).toEqual([200, 800]);
    expect(paid(db, sale.id)).toBe(1000);
    expect(due(db, sale.id)).toBe(0);
    expect(balance(db, c.id)).toBe(0);
    expect(stock(db, item.id)).toEqual(beforeStock);
    expect(db.documents.find((d) => d.id === sale.id)?.downPayment).toBe(200);
    const saved = structuredClone(db);
    expect(() => settleInvoice(db, sale.id)).toThrow("sudah lunas");
    expect(db).toEqual(saved);
    validateDB(db);
  });
  it("mengurangi retur dan pembayaran parsial, tanpa melunasi nota lain milik customer sama", () => {
    const { db, item, c } = setup();
    const first = doc(db, "sale", item.id, c.id, 5);
    const second = doc(db, "sale", item.id, c.id, 2);
    ret(db, first.id, 1);
    payment(db, c.id, first.id, 300);
    settleInvoice(db, first.id);
    expect(db.payments.at(-1)?.amount).toBe(500);
    expect(due(db, first.id)).toBe(0);
    expect(due(db, second.id)).toBe(400);
    expect(balance(db, c.id)).toBe(400);
    validateDB(db);
  });
  it("pembelian tanpa pembayaran sebelumnya tetap bisa dilunasi dengan pembayaran keluar", () => {
    const { db, item, s } = setup();
    const purchase = doc(db, "purchase", item.id, s.id, 5);
    settleInvoice(db, purchase.id);
    expect(db.payments[0]).toMatchObject({
      partyId: s.id,
      amount: 500,
      direction: "out",
    });
    expect(due(db, purchase.id)).toBe(0);
    expect(balance(db, s.id)).toBe(0);
    validateDB(db);
  });
  it("pembayaran batal tidak dihitung dan pelunasan baru mengikuti sisa terbaru", () => {
    const { db, item, c } = setup();
    const sale = doc(db, "sale", item.id, c.id, 3);
    settleInvoice(db, sale.id);
    cancelPayment(db, db.payments[0].id, "Salah catat");
    expect(due(db, sale.id)).toBe(600);
    settleInvoice(db, sale.id);
    expect(db.payments).toHaveLength(2);
    expect(paid(db, sale.id)).toBe(600);
    expect(due(db, sale.id)).toBe(0);
    validateDB(db);
  });
  it("menolak order, draf, nota batal, tagihan kredit, dan ID yang hilang tanpa mutasi", () => {
    const { db, item, c } = setup();
    const order = doc(db, "customer_order", item.id, c.id);
    const sale = doc(db, "sale", item.id, c.id);
    payment(db, c.id, sale.id, 200);
    ret(db, sale.id, 1);
    const cancelled = doc(db, "sale", item.id, c.id);
    cancelDoc(db, cancelled.id, "Salah nota");
    const draft = newDoc(db, "sale");
    draft.partyId = c.id;
    saveDoc(db, draft, [newLine(db, draft.id, item.id, "sale")], false);
    for (const id of [order.id, sale.id, cancelled.id, draft.id, "missing"]) {
      const before = structuredClone(db);
      expect(() => settleInvoice(db, id)).toThrow();
      expect(db).toEqual(before);
    }
  });
});

describe("total modal seluruh pembelian", () => {
  it("menjumlahkan nilai stok awal dan pembelian bersih; penjualan dan retur penjualan tidak menguranginya", () => {
    const { db, item, c, s } = setup();
    const purchase = newDoc(db, "purchase");
    purchase.partyId = s.id;
    saveDoc(
      db,
      purchase,
      [
        {
          ...newLine(db, purchase.id, item.id, "purchase"),
          qty: 10,
          price: 200,
          discountType: "percent",
          discountValue: 10,
        },
      ],
      true,
    );
    expect(totalCapital(db)).toBe(2800);
    const sale = doc(db, "sale", item.id, c.id, 3);
    expect(totalCapital(db)).toBe(2800);
    expect(inventoryCapital(db)).toBe(2380);
    ret(db, sale.id, 1);
    expect(totalCapital(db)).toBe(2800);
    ret(db, purchase.id, 2);
    expect(totalCapital(db)).toBe(2440);
    db.items[0].active = false;
    expect(totalCapital(db)).toBe(2440);
    validateDB(db);
  });
  it("mengabaikan order, draf, dan pembelian batal, lalu menghitung kembali retur yang dibatalkan", () => {
    const { db, item, s } = setup();
    doc(db, "supplier_order", item.id, s.id, 5);
    const draft = newDoc(db, "purchase");
    draft.partyId = s.id;
    saveDoc(
      db,
      draft,
      [{ ...newLine(db, draft.id, item.id, "purchase"), qty: 5 }],
      false,
    );
    const cancelled = doc(db, "purchase", item.id, s.id, 2);
    cancelDoc(db, cancelled.id, "Salah pembelian");
    expect(totalCapital(db)).toBe(1000);
    const purchase = doc(db, "purchase", item.id, s.id, 5);
    const back = ret(db, purchase.id, 1);
    expect(totalCapital(db)).toBe(1400);
    cancelDoc(db, back.id, "Salah retur");
    expect(totalCapital(db)).toBe(1500);
    expect(totalCapital(emptyDB())).toBe(0);
    validateDB(db);
  });
  it("harga beli default saja tidak dianggap modal pembelian yang sudah dikeluarkan", () => {
    const { db, item } = setup();
    saveItem(db, { ...item, openingCost: 0, buyPrice: 50000 });
    expect(totalCapital(db)).toBe(0);
  });
});
