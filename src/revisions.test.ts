import { describe, it, expect } from "vitest";
import { emptyDB, uid, type DB, type Kind } from "./types";
import {
  saveItem,
  saveParty,
  newDoc,
  newLine,
  saveDoc,
  savePayment,
  linesOf,
  stock,
  metrics,
  due,
  paid,
  balance,
  validateDB,
  cancelPayment,
  withStoreDefaults,
  refreshInvoiceProfile,
} from "./domain";
import {
  reviseDocument,
  revisePayment,
  reviseItem,
  saveCatalogItem,
  reviseParty,
} from "./revisions";
function fixture() {
  const db = emptyDB();
  const item = {
    id: uid(),
    code: "001",
    name: "Baterai",
    unit: "pcs",
    pack: "",
    buyPrice: 100,
    sellPrice: 200,
    openingQty: 10,
    openingCost: 1000,
    minStock: 0,
    active: true,
  };
  saveItem(db, item);
  const customer = {
    id: uid(),
    kind: "customer" as const,
    code: "C01",
    name: "Customer Lama",
    address: "Alamat lama",
    city: "",
    phone: "",
    fax: "",
    openingBalance: 0,
    active: true,
  };
  saveParty(db, customer);
  return { db, item, customer };
}
function post(db: DB, kind: Kind, qty = 1, price = 200, dp = 0) {
  const d = newDoc(db, kind);
  if (kind === "sale" || kind === "customer_order")
    d.partyId = db.parties.find((p) => p.kind === "customer")!.id;
  d.downPayment = dp;
  saveDoc(
    db,
    d,
    [{ ...newLine(db, d.id, db.items[0].id, kind), qty, price }],
    true,
  );
  return db.documents.find((x) => x.id === d.id)!;
}
function returned(db: DB, id: string, qty = 1) {
  const parent = db.documents.find((d) => d.id === id)!;
  const d = newDoc(
    db,
    parent.kind === "sale" ? "sale_return" : "purchase_return",
  );
  d.partyId = parent.partyId;
  d.refId = id;
  const origin = linesOf(db, id)[0];
  saveDoc(
    db,
    d,
    [
      {
        ...origin,
        id: uid(),
        docId: d.id,
        refLineId: origin.id,
        qty,
        serials: origin.serials
          .split(/\r?\n|,/)
          .slice(0, qty)
          .join("\n"),
      },
    ],
    true,
  );
  return db.documents.find((x) => x.id === d.id)!;
}
function pay(db: DB, docId: string, amount: number) {
  const d = db.documents.find((x) => x.id === docId)!;
  const p = {
    id: uid(),
    number: uid(),
    date: d.date,
    partyId: d.partyId,
    direction: "in" as const,
    amount,
    notes: "Transfer",
    status: "final" as const,
  };
  savePayment(db, p, [{ docId, amount }]);
  return db.payments.find((x) => x.id === p.id)!;
}
describe("edit data tanpa pembatalan", () => {
  it("harga pembelian lama menghitung ulang HPP penjualan dan retur sesudahnya", () => {
    const { db } = fixture();
    const purchase = post(db, "purchase", 10, 100);
    const sale = post(db, "sale", 3, 300);
    const back = returned(db, sale.id);
    pay(db, sale.id, 400);
    reviseDocument(
      db,
      purchase,
      linesOf(db, purchase.id).map((l) => ({ ...l, price: 200 })),
    );
    expect(linesOf(db, sale.id)[0].cost).toBe(450);
    expect(linesOf(db, back.id)[0].cost).toBe(150);
    expect(stock(db, db.items[0].id)).toMatchObject({ qty: 18, value: 2700 });
    expect(metrics(db, sale.date, sale.date)).toMatchObject({
      revenue: 600,
      profit: 300,
    });
    expect(db.documents).toHaveLength(3);
    expect(db.documents.every((d) => d.status === "final")).toBe(true);
    expect(db.payments).toHaveLength(1);
    expect(db.audit.at(-1)?.action).toBe("Ubah dokumen");
    validateDB(db);
  });
  it("edit penjualan memperbarui nilai retur dan tagihan dengan ID yang sama", () => {
    const { db } = fixture();
    const sale = post(db, "sale", 3, 200);
    reviseDocument(db, sale, [
      { ...linesOf(db, sale.id)[0], serials: "SN1\nSN2\nSN3" },
    ]);
    const back = returned(db, sale.id);
    pay(db, sale.id, 200);
    const oldLine = linesOf(db, sale.id)[0];
    reviseDocument(db, { ...sale, notes: "Diperbarui" }, [
      { ...oldLine, price: 300, serials: "SN1\nSN2\nSN3" },
    ]);
    expect(linesOf(db, sale.id)[0]).toMatchObject({
      id: oldLine.id,
      serials: "SN1\nSN2\nSN3",
      total: 900,
    });
    expect(db.documents.find((d) => d.id === back.id)?.total).toBe(300);
    expect(due(db, sale.id)).toBe(400);
    expect(metrics(db, sale.date, sale.date).profit).toBe(400);
    validateDB(db);
  });
  it("edit yang menyebabkan stok negatif ditolak tanpa mengubah data apa pun", () => {
    const { db } = fixture();
    const sale = post(db, "sale", 3);
    post(db, "sale", 5);
    const before = structuredClone(db);
    expect(() =>
      reviseDocument(
        db,
        sale,
        linesOf(db, sale.id).map((l) => ({ ...l, qty: 8 })),
      ),
    ).toThrow("Stok");
    expect(db).toEqual(before);
  });
  it("Qty tidak dapat diperkecil melewati retur atau pemenuhan order", () => {
    const { db } = fixture();
    const order = post(db, "customer_order", 3);
    const sale = newDoc(db, "sale");
    sale.partyId = order.partyId;
    sale.orderId = order.id;
    saveDoc(
      db,
      sale,
      [{ ...newLine(db, sale.id, db.items[0].id, "sale"), qty: 3 }],
      true,
    );
    returned(db, sale.id, 2);
    const before = structuredClone(db);
    expect(() =>
      reviseDocument(
        db,
        order,
        linesOf(db, order.id).map((l) => ({ ...l, qty: 2 })),
      ),
    ).toThrow("sisa order");
    expect(() =>
      reviseDocument(
        db,
        db.documents.find((d) => d.id === sale.id)!,
        linesOf(db, sale.id).map((l) => ({ ...l, qty: 1 })),
      ),
    ).toThrow("retur");
    expect(db).toEqual(before);
  });
  it("uang muka dapat diedit dari invoice atau pembayaran tanpa pembayaran ganda", () => {
    const { db } = fixture();
    const sale = post(db, "sale", 2, 200, 100);
    const id = db.payments[0].id;
    reviseDocument(db, { ...sale, downPayment: 150 }, linesOf(db, sale.id));
    expect(db.payments).toHaveLength(1);
    expect(db.payments[0]).toMatchObject({
      id,
      amount: 150,
      sourceDocId: sale.id,
    });
    revisePayment(db, { ...db.payments[0], amount: 200 }, [
      { docId: sale.id, amount: 200 },
    ]);
    expect(db.documents.find((d) => d.id === sale.id)?.downPayment).toBe(200);
    expect(paid(db, sale.id)).toBe(200);
    const current = db.documents.find((d) => d.id === sale.id)!;
    reviseDocument(db, { ...current, downPayment: 0 }, linesOf(db, sale.id));
    expect(paid(db, sale.id)).toBe(0);
    expect(db.payments).toHaveLength(1);
    validateDB(db);
  });
  it("uang muka lama yang dibatalkan tidak muncul kembali saat catatan diedit", () => {
    const { db } = fixture();
    const sale = post(db, "sale", 2, 200, 100);
    cancelPayment(db, db.payments[0].id, "Koreksi");
    reviseDocument(
      db,
      { ...sale, notes: "Ganti catatan" },
      linesOf(db, sale.id),
    );
    expect(paid(db, sale.id)).toBe(0);
    expect(db.payments).toHaveLength(1);
  });
  it("tanggal pembayaran yang sudah diedit tetap dipertahankan saat invoice diedit", () => {
    const { db } = fixture();
    const sale = post(db, "sale", 2, 200, 100);
    reviseDocument(db, { ...sale, date: "2000-01-01" }, linesOf(db, sale.id));
    revisePayment(db, { ...db.payments[0], date: "2000-01-02" }, [
      { docId: sale.id, amount: 100 },
    ]);
    const current = db.documents.find((d) => d.id === sale.id)!;
    reviseDocument(
      db,
      { ...current, notes: "Edit SN/catatan" },
      linesOf(db, sale.id),
    );
    expect(db.payments[0].date).toBe("2000-01-02");
    validateDB(db);
  });
  it("pembayaran setelah retur dapat diperbarui dan pembayaran berlebih ditolak", () => {
    const { db, customer } = fixture();
    const sale = post(db, "sale", 2);
    const payment = pay(db, sale.id, 400);
    returned(db, sale.id);
    revisePayment(db, { ...payment, notes: "Nomor bukti baru" }, [
      { docId: sale.id, amount: 400 },
    ]);
    revisePayment(db, { ...payment, amount: 300 }, [
      { docId: sale.id, amount: 300 },
    ]);
    expect(db.payments).toHaveLength(1);
    expect(balance(db, customer.id)).toBe(-100);
    const before = structuredClone(db);
    expect(() =>
      revisePayment(db, { ...payment, amount: 500 }, [
        { docId: sale.id, amount: 500 },
      ]),
    ).toThrow("melebihi");
    expect(() =>
      reviseDocument(
        db,
        sale,
        linesOf(db, sale.id).map((l) => ({ ...l, price: 100 })),
      ),
    ).toThrow("Pembayaran teralokasi");
    expect(db).toEqual(before);
  });
  it("stok dan nilai awal master bisa diedit dengan HPP yang dihitung ulang", () => {
    const { db, item, customer } = fixture();
    const sale = post(db, "sale", 2, 300);
    reviseItem(db, { ...item, openingCost: 2000 });
    expect(linesOf(db, sale.id)[0].cost).toBe(400);
    expect(stock(db, item.id).value).toBe(1600);
    reviseParty(db, {
      ...customer,
      name: "Customer Baru",
      openingBalance: 300,
    });
    expect(db.documents[0].partyName).toBe("Customer Lama");
    const payment = {
      id: uid(),
      number: uid(),
      date: sale.date,
      partyId: customer.id,
      direction: "in" as const,
      amount: 100,
      notes: "Saldo awal",
      status: "final" as const,
    };
    savePayment(db, payment, []);
    const before = structuredClone(db);
    expect(() => reviseParty(db, { ...customer, openingBalance: 50 })).toThrow(
      "saldo awal",
    );
    expect(db).toEqual(before);
    validateDB(db);
  });
  it("logo bawaan dimigrasikan sekali dan pilihan logo pengguna dipertahankan", () => {
    const { db } = fixture();
    expect(db.settings[0].logo).toMatch(/^data:image\/png;base64,/);
    delete db.settings[0].brandingVersion;
    db.settings[0].logo = "";
    const migrated = withStoreDefaults(db);
    expect(migrated.settings[0].logo).toBeTruthy();
    migrated.settings[0].logo = "";
    expect(withStoreDefaults(migrated).settings[0].logo).toBe("");
    db.settings[0].logo = "data:image/png;base64,CUSTOM";
    expect(withStoreDefaults(db).settings[0].logo).toBe(db.settings[0].logo);
  });
});

describe("kelengkapan invoice dari contoh pengguna", () => {
  it("melengkapi profil dan snapshot lama yang kosong sekali tanpa mengganti nama toko atau transaksi", () => {
    const { db } = fixture();
    const invoice = post(db, "sale");
    const original = structuredClone(db);
    const s = db.settings[0];
    s.name = "Mitra Ecobike";
    delete s.invoiceDefaultsVersion;
    delete s.invoiceIssuer;
    for (const key of [
      "bank",
      "beneficiary",
      "account",
      "bankBranch",
      "bankCode",
      "warranty",
      "logo",
      "partnerLogo",
      "address",
      "phone",
      "signature",
    ] as const)
      s[key] = "";
    s.terms = "Pembayaran sesuai kesepakatan.";
    const old = db.documents.find((d) => d.id === invoice.id)!;
    delete old.invoiceDefaultsVersion;
    old.issuerName = "Mitra Ecobike";
    for (const key of [
      "bank",
      "account",
      "warranty",
      "logo",
      "partnerLogo",
      "issuerAddress",
      "issuerPhone",
    ] as const)
      old[key] = "";
    old.terms = "Pembayaran sesuai kesepakatan.";
    const result = withStoreDefaults(db),
      doc = result.documents[0];
    expect(result.settings[0]).toMatchObject({
      name: "Mitra Ecobike",
      bank: "Bank Central Asia (BCA)",
      account: "046-1212-432",
      invoiceDefaultsVersion: 1,
    });
    expect(doc).toMatchObject({
      id: invoice.id,
      number: invoice.number,
      bank: "Bank Central Asia (BCA)",
      account: "046-1212-432",
      bankBranch: "Purwokerto",
      bankCode: "014",
    });
    expect(doc.logo).toMatch(/^data:image\/png;base64,/);
    expect(doc.partnerLogo).toMatch(/^data:image\/png;base64,/);
    expect(doc.warranty).toContain("Warranty is void if:");
    expect(doc.warranty).toContain("Shipping costs are borne by the buyer");
    expect(doc.warranty).toContain("5. Batteries purchased outside");
    expect(result.lines).toEqual(original.lines);
    expect(result.payments).toEqual(original.payments);
    expect(stock(result, db.items[0].id)).toEqual(
      stock(original, db.items[0].id),
    );
    doc.warranty = "";
    doc.partnerLogo = "";
    result.settings[0].bank = "";
    const again = withStoreDefaults(result);
    expect(again.documents[0].warranty).toBe("");
    expect(again.documents[0].partnerLogo).toBe("");
    expect(again.settings[0].bank).toBe("");
  });
  it("mempertahankan rekening/garansi khusus dan tidak memasukkan data Mitra ke identitas lain", () => {
    const { db } = fixture();
    const doc = post(db, "sale");
    delete doc.invoiceDefaultsVersion;
    doc.bank = "Bank khusus";
    doc.account = "000123";
    doc.warranty = "Garansi khusus";
    delete db.settings[0].invoiceDefaultsVersion;
    db.settings[0].bank = "Bank toko";
    expect(withStoreDefaults(db).documents[0]).toMatchObject({
      bank: "Bank khusus",
      account: "000123",
      warranty: "Garansi khusus",
    });
    db.settings[0].name = "Toko Lain";
    db.settings[0].bank = "";
    db.settings[0].account = "";
    delete db.settings[0].invoiceIssuer;
    doc.issuerName = "Toko Lain";
    doc.bank = "";
    doc.account = "";
    doc.warranty = "";
    const other = withStoreDefaults(db);
    expect(other.settings[0].bank).toBe("");
    expect(other.settings[0].invoiceIssuer).toBe("Toko Lain");
    expect(other.documents[0].account).toBe("");
    expect(other.documents[0].warranty).toBe("");
  });
  it("memperbarui snapshot secara eksplisit dari pengaturan tanpa mengubah nominal, identitas customer, atau pembayaran", () => {
    const { db } = fixture();
    const doc = post(db, "sale", 2, 200, 50),
      before = structuredClone(db);
    db.settings[0].bank = "Bank Baru";
    db.settings[0].account = "00001234";
    db.settings[0].warranty = "Garansi baru";
    expect(doc.bank).toBe(before.documents[0].bank);
    refreshInvoiceProfile(db, doc.id);
    expect(doc).toMatchObject({
      id: before.documents[0].id,
      number: before.documents[0].number,
      total: 400,
      downPayment: 50,
      partyName: before.documents[0].partyName,
      bank: "Bank Baru",
      account: "00001234",
      warranty: "Garansi baru",
    });
    expect(db.items).toEqual(before.items);
    expect(db.lines).toEqual(before.lines);
    expect(db.payments).toEqual(before.payments);
    expect(db.allocations).toEqual(before.allocations);
    expect(db.audit.at(-1)?.action).toBe("Perbarui profil invoice");
  });
});

describe("default teks invoice untuk semua profil", () => {
  it("mengisi teks BMW lama yang kosong sekali tanpa mengganti identitas, rekening, atau snapshot transaksi", () => {
    const { db } = fixture();
    post(db, "sale");
    const original = structuredClone(db.documents);
    const s = db.settings[0];
    Object.assign(s, {
      name: "BMW",
      invoiceIssuer: "BMW",
      bank: "BCA",
      account: "6041588001",
      bankCode: "",
      warranty: "",
      terms: "",
      country: "",
      signature: "",
      logo: "",
      partnerLogo: "",
    });
    delete s.invoiceTextDefaultsVersion;
    const result = withStoreDefaults(db),
      profile = result.settings[0];
    expect(profile).toMatchObject({
      name: "BMW",
      invoiceIssuer: "BMW",
      bank: "BCA",
      account: "6041588001",
      bankCode: "",
      country: "Indonesia",
      signature: "BMW",
      terms: "Cash Before Delivery(CBD)",
      logo: "",
      partnerLogo: "",
      invoiceTextDefaultsVersion: 1,
    });
    expect(profile.warranty).toContain("Warranty is void if:");
    expect(profile.warranty).toContain("Shipping costs are borne by the buyer");
    expect(result.documents).toEqual(original);
    profile.warranty = "";
    profile.terms = "";
    profile.country = "";
    profile.signature = "";
    const reloaded = withStoreDefaults(result);
    expect(reloaded.settings[0]).toMatchObject({
      warranty: "",
      terms: "",
      country: "",
      signature: "",
      account: "6041588001",
    });
  });
  it("mempertahankan teks khusus yang sudah tersimpan saat default baru diperkenalkan", () => {
    const { db } = fixture();
    const s = db.settings[0];
    Object.assign(s, {
      name: "BMW",
      warranty: "Garansi toko sendiri",
      terms: "Pembayaran kesepakatan khusus",
      country: "Negara sendiri",
      signature: "Nama pilihan",
    });
    delete s.invoiceTextDefaultsVersion;
    expect(withStoreDefaults(db).settings[0]).toMatchObject({
      warranty: "Garansi toko sendiri",
      terms: "Pembayaran kesepakatan khusus",
      country: "Negara sendiri",
      signature: "Nama pilihan",
      invoiceTextDefaultsVersion: 1,
    });
  });
});

describe("stok melalui pembelian pada katalog interaktif", () => {
  it("barang baru harus nol dan harga default tidak menciptakan stok/modal", () => {
    const { db, item } = fixture();
    const next = {
      ...item,
      id: uid(),
      code: "002",
      openingQty: 5,
      openingCost: 500,
    };
    const before = structuredClone(db);
    expect(() => saveCatalogItem(db, next)).toThrow("Catat pembelian");
    expect(db).toEqual(before);
    saveCatalogItem(db, { ...next, openingQty: 0, openingCost: 0 });
    expect(stock(db, next.id).qty).toBe(0);
    expect(stock(db, next.id).value).toBe(0);
    const purchase = newDoc(db, "purchase");
    saveDoc(
      db,
      purchase,
      [
        {
          ...newLine(db, purchase.id, next.id, "purchase"),
          qty: 5,
          price: 100,
        },
      ],
      true,
    );
    expect(stock(db, next.id).qty).toBe(5);
    expect(stock(db, next.id).value).toBe(500);
    validateDB(db);
  });
  it("edit katalog menjaga stok awal historis dan HPP serta menolak perubahan stok terselubung", () => {
    const { db, item } = fixture();
    const sale = post(db, "sale", 2);
    const oldStock = stock(db, item.id),
      oldCost = linesOf(db, sale.id)[0].cost;
    const before = structuredClone(db);
    expect(() =>
      saveCatalogItem(db, { ...item, openingQty: 20, openingCost: 2000 }),
    ).toThrow("Stok tidak dapat");
    expect(db).toEqual(before);
    saveCatalogItem(db, { ...item, name: "Baterai baru", buyPrice: 999 });
    expect(stock(db, item.id)).toEqual(oldStock);
    expect(linesOf(db, sale.id)[0].cost).toBe(oldCost);
    expect(db.items[0]).toMatchObject({
      openingQty: 10,
      openingCost: 1000,
      buyPrice: 999,
    });
    validateDB(db);
  });
});

describe("hapus customer tanpa menghapus riwayat", () => {
  it("mempertahankan order, penjualan, retur, pembayaran, stok, saldo, dan invoice", async () => {
    const { deleteMaster } = await import("./revisions");
    const { db, customer, item } = fixture();
    post(db, "customer_order", 2);
    const sale = post(db, "sale", 2, 200, 50);
    returned(db, sale.id);
    const before = structuredClone(db);
    const figures = {
      stock: stock(db, item.id),
      balance: balance(db, customer.id),
      paid: paid(db, sale.id),
      due: due(db, sale.id),
      metrics: metrics(db, "2000-01-01", "9999-12-31"),
    };
    deleteMaster(db, "customer", customer.id);
    expect(db.parties.find((p) => p.id === customer.id)).toMatchObject({
      deleted: true,
      active: false,
      name: customer.name,
    });
    for (const key of [
      "documents",
      "lines",
      "payments",
      "allocations",
      "items",
    ] as const)
      expect(db[key]).toEqual(before[key]);
    expect({
      stock: stock(db, item.id),
      balance: balance(db, customer.id),
      paid: paid(db, sale.id),
      due: due(db, sale.id),
      metrics: metrics(db, "2000-01-01", "9999-12-31"),
    }).toEqual(figures);
    expect(() => validateDB(db)).not.toThrow();
    const fresh = newDoc(db, "sale");
    fresh.partyId = customer.id;
    expect(() =>
      saveDoc(db, fresh, [newLine(db, fresh.id, item.id, "sale")], true),
    ).toThrow(/aktif/);
  });
  it("tagihan lama masih bisa dilunasi setelah customer dihapus", async () => {
    const { deleteMaster } = await import("./revisions");
    const { settleInvoice } = await import("./domain");
    const { db, customer } = fixture();
    const sale = post(db, "sale", 2, 200, 50);
    deleteMaster(db, "customer", customer.id);
    settleInvoice(db, sale.id);
    expect(due(db, sale.id)).toBe(0);
    expect(db.documents.find((d) => d.id === sale.id)?.total).toBe(400);
    expect(db.parties.find((p) => p.id === customer.id)).toMatchObject({
      deleted: true,
      active: false,
    });
    expect(() => validateDB(db)).not.toThrow();
  });
  it("data lama dan customer baru mendapat flag boolean konsisten untuk CSV desktop", () => {
    const { db } = fixture();
    db.parties[0].deleted = true;
    const normalized = withStoreDefaults(db);
    expect(
      normalized.parties.every((p) => typeof p.deleted === "boolean"),
    ).toBe(true);
    expect(
      normalized.parties.find((p) => p.id === db.parties[0].id),
    ).toMatchObject({ deleted: true, active: false });
    expect(withStoreDefaults(JSON.parse(JSON.stringify(normalized)))).toEqual(
      normalized,
    );
  });
});
