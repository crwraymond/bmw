import { test, expect, type Page } from "@playwright/test";

async function seed(page: Page, scenario: "partial" | "return" = "partial") {
  await page.goto("/");
  const refs = await page.evaluate(async (scenario) => {
    const t = await import("/src/types.ts"),
      d = await import("/src/domain.ts"),
      db = t.emptyDB();
    const item = {
      id: t.uid(),
      code: "001",
      name: "Baterai Uji",
      unit: "pcs",
      pack: "",
      buyPrice: 100,
      sellPrice: 200,
      openingQty: 20,
      openingCost: 2000,
      minStock: 0,
      active: true,
    };
    d.saveItem(db, item);
    const customer = {
      id: t.uid(),
      kind: "customer" as const,
      code: "C001",
      name: "Customer Uji",
      address: "",
      city: "",
      phone: "",
      fax: "",
      openingBalance: 0,
      active: true,
    };
    d.saveParty(db, customer);
    const sale = d.newDoc(db, "sale");
    sale.partyId = customer.id;
    sale.downPayment = 200;
    d.saveDoc(
      db,
      sale,
      [{ ...d.newLine(db, sale.id, item.id, "sale"), qty: 5 }],
      true,
    );
    if (scenario === "return") {
      const back = d.newDoc(db, "sale_return"),
        origin = d.linesOf(db, sale.id)[0];
      back.partyId = customer.id;
      back.refId = sale.id;
      d.saveDoc(
        db,
        back,
        [
          {
            ...origin,
            id: t.uid(),
            docId: back.id,
            refLineId: origin.id,
            qty: 1,
          },
        ],
        true,
      );
    }
    const unpaid = d.newDoc(db, "sale");
    unpaid.partyId = customer.id;
    d.saveDoc(
      db,
      unpaid,
      [{ ...d.newLine(db, unpaid.id, item.id, "sale"), qty: 1 }],
      true,
    );
    const purchase = d.newDoc(db, "purchase");
    d.saveDoc(
      db,
      purchase,
      [{ ...d.newLine(db, purchase.id, item.id, "purchase"), qty: 3 }],
      true,
    );
    localStorage.setItem("toko-offline-preview-v1", JSON.stringify(db));
    return {
      sale: sale.number,
      saleId: sale.id,
      unpaid: unpaid.number,
      unpaidId: unpaid.id,
      purchase: purchase.number,
      purchaseId: purchase.id,
      downPayment: db.payments[0].id,
    };
  }, scenario);
  await page.reload();
  await page
    .locator("nav")
    .getByRole("button", { name: "Pelunasan", exact: true })
    .click();
  return refs;
}
async function read(page: Page) {
  return page.evaluate(async () => {
    const d = await import("/src/domain.ts"),
      db = JSON.parse(localStorage.getItem("toko-offline-preview-v1")!);
    return {
      db,
      dues: Object.fromEntries(
        db.documents.map((doc: { id: string }) => [doc.id, d.due(db, doc.id)]),
      ),
      stock: d.stock(db, db.items[0].id).qty,
    };
  });
}

test("pelunasan menampilkan total/dibayar/sisa dan melunasi hanya sisa tanpa menggandakan uang muka", async ({
  page,
}) => {
  const refs = await seed(page);
  const bills = page.getByRole("region", {
    name: "Daftar tagihan",
    exact: true,
  });
  await expect(
    page.getByRole("columnheader", { name: "Arah", exact: true }),
  ).toHaveCount(0);
  await expect(
    bills.getByRole("columnheader", { name: "Total tagihan", exact: true }),
  ).toBeVisible();
  await expect(
    bills.getByRole("columnheader", { name: "Sudah dibayar", exact: true }),
  ).toBeVisible();
  let row = bills.getByRole("row").filter({ hasText: refs.sale });
  await expect(row.getByRole("cell").nth(2)).toHaveText("Rp 1.000");
  await expect(row.getByRole("cell").nth(3)).toHaveText("Rp 200");
  await expect(row.getByRole("cell").nth(4)).toHaveText("Rp 800");
  const original = await read(page);
  const order = await bills.locator("tbody tr strong").allTextContents();
  const settle = row.getByRole("button", {
    name: `Lunasi ${refs.sale}`,
    exact: true,
  });
  await expect(
    bills.getByRole("columnheader", { name: "Aksi", exact: true }),
  ).toBeVisible();
  expect(await settle.evaluate((el) => el.closest("td")?.cellIndex)).toBe(6);
  await settle.click({ clickCount: 2 });
  row = bills.getByRole("row").filter({ hasText: refs.sale });
  await expect(
    row.getByRole("button", { name: `Lunas ${refs.sale}`, exact: true }),
  ).toBeDisabled();
  await expect(row.getByRole("cell").nth(3)).toHaveText("Rp 1.000");
  await expect(row.getByRole("cell").nth(4)).toHaveText("Rp 0");
  const result = await read(page);
  expect(await bills.locator("tbody tr strong").allTextContents()).toEqual(
    order,
  );
  expect(result.db.payments).toHaveLength(2);
  expect(result.db.payments[0]).toEqual(original.db.payments[0]);
  expect(result.db.payments[1]).toMatchObject({ amount: 800, direction: "in" });
  expect(result.db.documents).toEqual(original.db.documents);
  expect(result.stock).toBe(original.stock);
  expect(result.dues[refs.saleId]).toBe(0);
  expect(result.dues[refs.unpaidId]).toBe(200);
  await page.screenshot({
    path: test.info().outputPath("pelunasan-total-dibayar.png"),
    fullPage: true,
  });
  await page.reload();
  await page
    .locator("nav")
    .getByRole("button", { name: "Pelunasan", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: `Lunas ${refs.sale}`, exact: true }),
  ).toBeDisabled();
});

test("nota tanpa DP dan pembelian bisa dilunasi; pembatalan pembayaran membuka tagihan kembali", async ({
  page,
}) => {
  const refs = await seed(page);
  await page
    .getByRole("button", { name: `Lunasi ${refs.unpaid}`, exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: `Lunas ${refs.unpaid}`, exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: `Lunasi ${refs.purchase}`, exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: `Lunas ${refs.purchase}`, exact: true }),
  ).toBeDisabled();
  let result = await read(page);
  expect(result.db.payments).toHaveLength(3);
  expect(result.db.payments[2]).toMatchObject({
    amount: 300,
    direction: "out",
  });
  const history = page.getByRole("region", {
    name: "Riwayat pembayaran",
    exact: true,
  });
  const paymentRow = history
    .getByRole("row")
    .filter({ hasText: result.db.payments[1].number });
  await paymentRow.getByTitle("Batalkan pembayaran", { exact: true }).click();
  const modal = page.getByRole("dialog");
  await modal.getByLabel("Alasan").fill("Salah catat pembayaran");
  await modal.getByRole("button", { name: "Lanjutkan", exact: true }).click();
  await expect(modal).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: `Lunasi ${refs.unpaid}`, exact: true }),
  ).toBeEnabled();
  result = await read(page);
  expect(result.dues[refs.unpaidId]).toBe(200);
  expect(result.dues[refs.purchaseId]).toBe(0);
});

test("pelunasan menghitung retur dan tombol tetap terlihat pada ponsel", async ({
  page,
}) => {
  const refs = await seed(page, "return");
  await page.setViewportSize({ width: 390, height: 844 });
  const bills = page.getByRole("region", {
    name: "Daftar tagihan",
    exact: true,
  });
  const row = bills.getByRole("row").filter({ hasText: refs.sale });
  await expect(row.getByRole("cell").nth(2)).toContainText("Retur: Rp 200");
  await expect(row.getByRole("cell").nth(4)).toHaveText("Rp 600");
  const settle = row.getByRole("button", {
    name: `Lunasi ${refs.sale}`,
    exact: true,
  });
  await settle.scrollIntoViewIfNeeded();
  const bounds = await settle.boundingBox();
  expect(bounds?.x).toBeGreaterThanOrEqual(0);
  expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: test.info().outputPath("pelunasan-mobile.png"),
    fullPage: false,
  });
  await settle.click();
  await expect(
    row.getByRole("button", { name: `Lunas ${refs.sale}`, exact: true }),
  ).toBeDisabled();
  const result = await read(page);
  expect(result.db.payments.at(-1)).toMatchObject({ amount: 600 });
  expect(result.dues[refs.saleId]).toBe(0);
});
