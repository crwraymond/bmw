import { describe, it, expect } from "vitest";
import { csvText, parseCSV, csvNumber } from "./csv";
import {
  prepareImport,
  exportData,
  applyImport,
  type ImportTarget,
  type ImportMode,
} from "./dataImport";
import { exportAllCSV, splitAllCSV } from "./ImportCSV";
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
  balance,
  metrics,
  withStoreDefaults,
  cancelDoc,
  cancelPayment,
} from "./domain";
function fixture() {
  const db = withStoreDefaults(emptyDB());
  saveItem(db, {
    id: uid(),
    code: "001",
    name: 'Baterai, "48V"',
    unit: "pcs",
    pack: "1 unit",
    buyPrice: 100,
    sellPrice: 200,
    openingQty: 10,
    openingCost: 1000,
    minStock: 2,
    active: true,
  });
  saveParty(db, {
    id: uid(),
    kind: "customer",
    code: "C001",
    name: "Toko lama",
    address: "Baris satu\nBaris dua",
    city: "Purwokerto",
    phone: "+628123",
    fax: "",
    openingBalance: 500,
    active: true,
  });
  return db;
}
function post(db: DB, kind: Kind, qty = 3, orderId = "") {
  const d = newDoc(db, kind);
  d.partyId =
    kind === "sale" || kind === "customer_order"
      ? db.parties.find((p) => p.kind === "customer")!.id
      : d.partyId;
  d.orderId = orderId;
  if (kind === "sale") {
    d.downPayment = 50;
    d.discount = 30;
  }
  saveDoc(
    db,
    d,
    [
      {
        ...newLine(db, d.id, db.items[0].id, kind),
        qty,
        discountType: "percent",
        discountValue: 10,
        serials: "0001,0002,0003",
      },
    ],
    true,
  );
  return db.documents.find((x) => x.id === d.id)!;
}
function ledger() {
  const db = fixture();
  const customerOrder = post(db, "customer_order"),
    supplierOrder = post(db, "supplier_order");
  const purchase = post(db, "purchase", 3, supplierOrder.id),
    sale = post(db, "sale", 3, customerOrder.id);
  for (const origin of [sale, purchase]) {
    const d = newDoc(
      db,
      origin.kind === "sale" ? "sale_return" : "purchase_return",
    );
    d.partyId = origin.partyId;
    d.refId = origin.id;
    const l = linesOf(db, origin.id)[0];
    saveDoc(
      db,
      d,
      [{ ...l, id: uid(), docId: d.id, refLineId: l.id, qty: 1 }],
      true,
    );
  }
  savePayment(
    db,
    {
      id: uid(),
      number: "PAY001",
      date: sale.date,
      partyId: sale.partyId,
      amount: 100,
      direction: "in",
      notes: "Transfer",
      status: "final",
    },
    [{ docId: sale.id, amount: 80 }],
  );
  savePayment(
    db,
    {
      id: uid(),
      number: "PAY002",
      date: purchase.date,
      partyId: purchase.partyId,
      amount: 50,
      direction: "out",
      notes: "Transfer",
      status: "final",
    },
    [{ docId: purchase.id, amount: 50 }],
  );
  const cancelled = post(db, "purchase", 1);
  cancelDoc(db, cancelled.id, "Salah input");
  const draft = newDoc(db, "customer_order");
  draft.partyId = sale.partyId;
  saveDoc(
    db,
    draft,
    [newLine(db, draft.id, db.items[0].id, draft.kind)],
    false,
  );
  return db;
}
function file(db: DB, target: ImportTarget) {
  const data = exportData(db, target);
  return { target, text: csvText(data.headers, data.rows) };
}
function figures(db: DB) {
  return {
    stock: stock(db, db.items[0].id),
    balance: db.parties.map((p) => [p.code, balance(db, p.id)]),
    metrics: metrics(db, "2000-01-01", "2099-01-01"),
    docs: db.documents
      .map((d) => [d.kind, d.number, d.status, d.total, d.downPayment])
      .sort(),
    lines: db.lines
      .map((l) => [
        db.documents.find((d) => d.id === l.docId)!.number,
        l.code,
        l.qty,
        l.price,
        l.total,
        l.cost,
        l.serials,
      ])
      .sort(),
    payments: db.payments.map((p) => [p.number, p.amount, p.status]).sort(),
  };
}
describe("CSV parser", () => {
  it("roundtrips quotes, multiline, formula safety, leading zeros and literal apostrophes", () => {
    const values = ["001", "+628123", "=1+1", "'hello", "'@hello", 'A, "B"\nC'];
    expect(
      Object.values(
        parseCSV(
          csvText(
            values.map((_, i) => `C${i}`),
            [values],
          ),
        ).rows[0].cells,
      ),
    ).toEqual(values);
  });
  it("reads BOM semicolon/tab and rejects malformed files", () => {
    expect(parseCSV('\uFEFFKode;Nama\r\n001;"a;b"').rows[0].cells).toEqual({
      kode: "001",
      nama: "a;b",
    });
    expect(parseCSV("Kode\tNama\n002\tB").rows[0].cells.kode).toBe("002");
    for (const text of [
      "A,A\nx,y",
      "A,B\nx",
      'A,B\n"unterminated,b',
      'A,B\n"closed"oops,b',
    ])
      expect(() => parseCSV(text)).toThrow();
  });
  it("parses Indonesian money and quantities without losing precision", () => {
    expect(csvNumber("1.234,567", "qty")).toBe(1234.567);
    expect(csvNumber("Rp 1.450.000", "harga")).toBe(1450000);
    expect(csvNumber("0,005", "qty")).toBe(0.005);
    expect(csvNumber("-1.000", "saldo", true)).toBe(-1000);
    expect(() => csvNumber("1e3", "harga")).toThrow();
  });
});
describe("complete CSV import", () => {
  it.each<ImportMode>(["upsert", "replace"])(
    "roundtrips a full ledger (%s) with orders, DP, returns, cancelled docs and allocations",
    (mode) => {
      const original = ledger();
      const before = figures(original);
      const plan = prepareImport(
        original,
        splitAllCSV(exportAllCSV(original)),
        mode,
      );
      expect(figures(plan.db)).toEqual(before);
      expect(plan.db.items[0].id).toBe(original.items[0].id);
      expect(plan.db.lines.map((l) => l.id).sort()).toEqual(
        original.lines.map((l) => l.id).sort(),
      );
      const fresh = prepareImport(
        withStoreDefaults(emptyDB()),
        splitAllCSV(exportAllCSV(original)),
        mode,
      ).db;
      expect(figures(fresh)).toEqual(before);
      expect(fresh.payments).toHaveLength(original.payments.length);
      expect(fresh.documents.find((d) => d.kind === "sale")!.issuerName).toBe(
        original.documents.find((d) => d.kind === "sale")!.issuerName,
      );
    },
  );
  it("upserts by code, preserves IDs, validates the whole file and never mutates input", () => {
    const db = fixture(),
      before = structuredClone(db);
    const input = {
      target: "items" as const,
      text: csvText(
        ["Kode", "Nama", "Satuan", "Harga jual"],
        [
          ["001", "Baru", "pcs", "1.500"],
          ["002", "Charger", "pcs", "200"],
        ],
      ),
    };
    const plan = prepareImport(db, [input], "upsert");
    expect(plan.db.items).toHaveLength(2);
    expect(plan.db.items[0]).toMatchObject({
      id: db.items[0].id,
      name: "Baru",
      sellPrice: 1500,
      openingQty: 10,
    });
    expect(db).toEqual(before);
    expect(() =>
      prepareImport(
        db,
        [{ ...input, text: input.text + '\r\n"003","rusak","pcs","oops"' }],
        "upsert",
      ),
    ).toThrow(/angka/);
    expect(db).toEqual(before);
    expect(() =>
      prepareImport(
        db,
        [{ target: "items", text: "Kode,Nama,Satuan\n001,A,pcs\n001,B,pcs" }],
        "upsert",
      ),
    ).toThrow(/ganda/);
    db.revision++;
    expect(() => applyImport(db, plan)).toThrow(/berubah/);
  });
  it("replaces one master dataset, removes unused entries and archives referenced entries", () => {
    const db = ledger();
    saveItem(db, { ...db.items[0], id: uid(), code: "unused" });
    const result = prepareImport(
      db,
      [{ target: "items", text: "Kode,Nama,Satuan\n002,Charger,pcs" }],
      "replace",
    );
    expect(result.db.items.find((i) => i.code === "001")?.active).toBe(false);
    expect(result.db.items.find((i) => i.code === "unused")).toBeUndefined();
    expect(result.db.items.find((i) => i.code === "002")?.active).toBe(true);
    expect(result.db.documents).toHaveLength(db.documents.length);
    expect(stock(result.db, db.items[0].id)).toEqual(stock(db, db.items[0].id));
  });
  it("blocks dangling payment, order and return references without changing saved data", () => {
    const db = ledger(),
      before = structuredClone(db);
    const purchase = db.documents.find((d) => d.kind === "purchase")!;
    const data = exportData(db, "sale");
    data.rows[0][1] = "NEW-INV";
    expect(() =>
      prepareImport(
        db,
        [{ target: "sale", text: csvText(data.headers, data.rows) }],
        "replace",
      ),
    ).toThrow();
    expect(db).toEqual(before);
    expect(() =>
      prepareImport(
        db,
        [
          {
            target: "supplier_order",
            text:
              "Nomor,Tanggal,Kode barang,Qty,Harga\nNEW-ORDER," +
              purchase.date +
              ",001,3,100",
          },
        ],
        "replace",
      ),
    ).toThrow(/order/i);
  });
  it("replays purchase edits from CSV and rejects negative stock or excessive payments", () => {
    const db = ledger();
    const data = exportData(db, "purchase");
    const activeRow = data.rows.find((r) => r[3] === "final")!;
    activeRow[data.headers.indexOf("Harga")] = "200";
    const plan = prepareImport(
      db,
      [{ target: "purchase", text: csvText(data.headers, data.rows) }],
      "upsert",
    );
    expect(stock(plan.db, db.items[0].id).value).not.toBe(
      stock(db, db.items[0].id).value,
    );
    const items = exportData(db, "items");
    items.rows[0][items.headers.indexOf("Stok awal")] = 0;
    items.rows[0][items.headers.indexOf("Nilai stok awal")] = 0;
    const sales = exportData(db, "sale");
    sales.rows[0][sales.headers.indexOf("Qty")] = "100";
    expect(() =>
      prepareImport(
        db,
        [{ target: "sale", text: csvText(sales.headers, sales.rows) }],
        "upsert",
      ),
    ).toThrow();
    const payments = exportData(db, "payments");
    payments.rows.find((r) => r[1] === "PAY001")![
      payments.headers.indexOf("Alokasi")
    ] = "9.999";
    expect(() =>
      prepareImport(
        db,
        [
          {
            target: "payments",
            text: csvText(payments.headers, payments.rows),
          },
        ],
        "upsert",
      ),
    ).toThrow();
  });
  it("can import a minimal transaction and payment using codes and numbers", () => {
    const db = fixture(),
      date = newDoc(db, "sale").date;
    const plan = prepareImport(
      db,
      [
        {
          target: "sale",
          text: `Nomor,Tanggal,Kode customer,Kode barang,Qty,Harga\nINV001,${date},C001,001,2,200`,
        },
        {
          target: "payments",
          text: `Nomor,Tanggal,Arah,Kode customer,Nominal,Nomor tagihan,Alokasi\nPAY001,${date},in,C001,100,INV001,100`,
        },
      ],
      "upsert",
    );
    expect(plan.db.documents[0].total).toBe(400);
    expect(plan.db.payments[0].amount).toBe(100);
    expect(stock(plan.db, db.items[0].id).qty).toBe(8);
  });
  it("reconciles DP once on document upsert and imports payments without duplication", () => {
    const db = fixture();
    post(db, "sale");
    const data = exportData(db, "sale");
    data.rows[0][data.headers.indexOf("Uang muka")] = "75";
    const plan = prepareImport(
      db,
      [{ target: "sale", text: csvText(data.headers, data.rows) }],
      "upsert",
    );
    expect(plan.db.payments).toHaveLength(1);
    expect(plan.db.payments[0].amount).toBe(75);
    expect(
      prepareImport(plan.db, [file(plan.db, "payments")], "upsert").db.payments,
    ).toHaveLength(1);
  });
  it("preserves a cancelled down payment on export and import without creating a new payment", () => {
    const db = fixture();
    post(db, "sale");
    cancelPayment(db, db.payments[0].id, "Salah transfer");
    delete db.payments[0].sourceDocId; // legacy CSV before explicit DP links
    const result = prepareImport(
      withStoreDefaults(emptyDB()),
      splitAllCSV(exportAllCSV(db)),
      "replace",
    ).db;
    expect(result.payments).toHaveLength(1);
    expect(result.payments[0].status).toBe("cancelled");
    expect(figures(result)).toEqual(figures(db));
    expect(
      prepareImport(db, [file(db, "sale")], "upsert").db.payments,
    ).toHaveLength(1);
  });
  it("allows paid-then-return history but rejects increasing allocations beyond the remaining net invoice", () => {
    const db = fixture();
    const sale = post(db, "sale");
    savePayment(
      db,
      {
        id: uid(),
        number: "P",
        date: sale.date,
        partyId: sale.partyId,
        amount: 400,
        direction: "in",
        notes: "",
        status: "final",
      },
      [{ docId: sale.id, amount: 400 }],
    );
    const d = newDoc(db, "sale_return");
    d.partyId = sale.partyId;
    d.refId = sale.id;
    const l = linesOf(db, sale.id)[0];
    saveDoc(
      db,
      d,
      [{ ...l, id: uid(), docId: d.id, refLineId: l.id, qty: 1 }],
      true,
    );
    expect(() =>
      prepareImport(db, splitAllCSV(exportAllCSV(db)), "upsert"),
    ).not.toThrow();
    expect(() =>
      prepareImport(
        withStoreDefaults(emptyDB()),
        splitAllCSV(exportAllCSV(db)),
        "replace",
      ),
    ).not.toThrow();
    const data = exportData(db, "payments"),
      row = data.rows.find((r) => r[1] === "P")!;
    row[data.headers.indexOf("Nominal")] = "410";
    row[data.headers.indexOf("Alokasi")] = "410";
    expect(() =>
      prepareImport(
        db,
        [{ target: "payments", text: csvText(data.headers, data.rows) }],
        "upsert",
      ),
    ).toThrow(/sisa tagihan/);
  });
  it("empty dataset markers support full replacement, while plain empty files cannot wipe data", () => {
    const db = ledger(),
      empty = withStoreDefaults(emptyDB());
    const plan = prepareImport(db, splitAllCSV(exportAllCSV(empty)), "replace");
    expect(plan.db.documents).toHaveLength(0);
    expect(plan.db.payments).toHaveLength(0);
    expect(plan.db.allocations).toHaveLength(0);
    expect(plan.db.items).toHaveLength(0);
    expect(plan.db.parties.filter((p) => p.kind === "customer")).toHaveLength(
      0,
    );
    expect(() =>
      prepareImport(
        db,
        [{ target: "items", text: "Kode,Nama,Satuan" }],
        "replace",
      ),
    ).toThrow(/tidak berisi/);
  });
  it("rejects conflicting headers within a document, legacy totals and invalid formulas", () => {
    const db = fixture();
    const date = newDoc(db, "sale").date;
    expect(() =>
      prepareImport(
        db,
        [
          {
            target: "sale",
            text: `Nomor,Tanggal,Kode customer,Kode barang,Qty,Harga\nI,${date},C001,001,1,200\nI,2000-01-01,C001,001,1,200`,
          },
        ],
        "upsert",
      ),
    ).toThrow(/berbeda/);
    expect(() =>
      prepareImport(
        db,
        [{ target: "items", text: "Kode,Nama,Satuan,Stok\n001,B,pcs,10" }],
        "upsert",
      ),
    ).toThrow(/lama/);
    expect(() =>
      prepareImport(
        db,
        [
          {
            target: "items",
            text: "Kode,Nama,Satuan,Harga jual\n001,B,pcs,=1+1",
          },
        ],
        "upsert",
      ),
    ).toThrow(/angka/);
  });
});
