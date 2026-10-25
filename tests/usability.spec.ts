import { test, expect, type Page } from "@playwright/test";
async function setup(page: Page) {
  await page.goto("/");
  await page.evaluate(async () => {
    const t = await import("/src/types.ts");
    const d = await import("/src/domain.ts");
    const db = t.emptyDB();
    for (const [code, name] of [
      ["001", "Baterai 48V"],
      ["002", "Charger 48V"],
    ])
      d.saveItem(db, {
        id: t.uid(),
        code,
        name,
        unit: "pcs",
        pack: "",
        buyPrice: 1000000,
        sellPrice: 1450000,
        openingQty: 20,
        openingCost: 20000000,
        minStock: 2,
        active: true,
      });
    d.saveParty(db, {
      id: t.uid(),
      kind: "customer",
      code: "C001",
      name: "Toko Prima Andalan",
      address: "Jl. Progo No.53",
      city: "Pekalongan",
      phone: "08120000",
      fax: "",
      openingBalance: 0,
      active: true,
    });
    d.saveParty(db, {
      id: t.uid(),
      kind: "customer",
      code: "C002",
      name: "Customer Lain",
      address: "",
      city: "",
      phone: "",
      fax: "",
      openingBalance: 0,
      active: true,
    });
    localStorage.setItem("toko-offline-preview-v1", JSON.stringify(db));
  });
  await page.reload();
}
async function editor(page: Page) {
  await page
    .locator("nav")
    .getByRole("button", { name: "Penjualan", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Penjualan baru", exact: true })
    .click();
  return page.getByRole("dialog");
}
test("kode barang langsung mengaktifkan tambah dan Enter menambah tanpa submit", async ({
  page,
}) => {
  await setup(page);
  const f = await editor(page);
  await f.getByLabel("Cari barang transaksi").fill("001");
  await expect(f.getByRole("button", { name: "Tambah baris" })).toBeEnabled();
  await f.getByLabel("Cari barang transaksi").press("Enter");
  await expect(f.getByLabel("Qty Baterai 48V")).toBeVisible();
  await expect(f).toBeVisible();
  await f.getByLabel("Cari barang transaksi").fill("001");
  await f.getByLabel("Cari barang transaksi").press("Enter");
  await expect(f.getByLabel("Qty Baterai 48V")).toHaveValue("2");
});
test("customer dapat dicari lewat kode atau nama dalam field pilihan", async ({
  page,
}) => {
  await setup(page);
  const f = await editor(page);
  const customer = f.getByRole("combobox", { name: "Customer", exact: true });
  await customer.fill("prima");
  await expect(
    f.getByRole("option", { name: /C001.*Toko Prima/ }),
  ).toBeVisible();
  await expect(f.getByRole("option", { name: /Customer Lain/ })).toHaveCount(0);
  await customer.press("ArrowDown");
  await customer.press("Enter");
  await expect(customer).toHaveValue("C001 — Toko Prima Andalan");
  await customer.fill("C002");
  await f.getByRole("option", { name: /C002.*Customer Lain/ }).click();
  await expect(customer).toHaveValue("C002 — Customer Lain");
});
test("angka memakai separator dan nol awal diganti saat mengetik", async ({
  page,
}) => {
  await setup(page);
  await page
    .locator("nav")
    .getByRole("button", { name: "Barang & stok", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Tambah barang", exact: true })
    .click();
  const f = page.getByRole("dialog");
  const price = f.getByLabel("Harga jual default (Rp)");
  await price.click();
  await price.press("End");
  await price.pressSequentially("5");
  await expect(price).toHaveValue("5");
  await price.fill("1450000");
  await expect(price).toHaveValue("1.450.000");
  const quantity = f.getByLabel("Stok awal", { exact: true });
  await quantity.fill("1234,5");
  await expect(quantity).toHaveValue("1.234,5");
  await f.getByLabel("Kode", { exact: true }).fill("003");
  await f.getByLabel("Nama", { exact: true }).fill("Barang angka");
  await f.getByLabel("Total nilai stok awal (Rp)").fill("1234500000");
  await f.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(f).not.toBeVisible();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("toko-offline-preview-v1")!).items.find(
      (i: { code: string }) => i.code === "003",
    ),
  );
  expect(saved.sellPrice).toBe(1450000);
  expect(saved.openingQty).toBe(1234.5);
  expect(saved.openingCost).toBe(1234500000);
});
test("arrow dropdown mempunyai ruang kanan yang konsisten", async ({
  page,
}) => {
  await setup(page);
  const f = await editor(page);
  const select = f.getByLabel("Tautkan order (opsional)");
  await expect(select).toHaveCSS("appearance", "none");
  const padding = await select.evaluate((el) =>
    parseFloat(getComputedStyle(el).paddingRight),
  );
  expect(padding).toBeGreaterThanOrEqual(36);
});
test("invoice memakai grid dan susunan seperti referensi", async ({ page }) => {
  await setup(page);
  await page.evaluate(async () => {
    const d = await import("/src/domain.ts");
    const db = JSON.parse(localStorage.getItem("toko-offline-preview-v1")!);
    const invoice = d.newDoc(db, "sale");
    invoice.partyId = db.parties[0].id;
    invoice.issuerName = "Mitra Ecobike (Nico Wijaya)";
    invoice.issuerAddress =
      "Jawara Express, Jl. Matadireja 1 No.811,\nKec. Purwokerto Timur, Kab. Banyumas, Jawa\n53113";
    invoice.issuerPhone = "+62 812-2937-991";
    invoice.bank = "Bank Central Asia (BCA)";
    invoice.bankBranch = "Purwokerto";
    invoice.bankCode = "014";
    invoice.account = "046-1212-432";
    invoice.beneficiary = "Nico Wijaya";
    invoice.signature = "Mitra EcoBike (Nico Wijaya)";
    invoice.terms = "Cash Before Delivery(CBD)";
    invoice.warranty =
      "Batteries purchased with electric bicycles or motorcycles can be claimed through the respective brand’s dealer.\nBatteries purchased through partners can be shipped directly for inspection.\nWarranty is void if:\n1. The battery is exposed to water.\n2. The battery is disassembled.\nShipping costs are borne by the buyer";
    invoice.partnerLogo =
      "data:image/svg+xml," +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="170" height="35"><text x="2" y="27" fill="#1697ba" font-family="Arial" font-size="27" font-weight="bold">PHYLiON</text></svg>',
      );
    d.saveDoc(
      db,
      invoice,
      [
        {
          ...d.newLine(db, invoice.id, db.items[0].id, "sale"),
          qty: 2,
          serials: "BFJCAHIDZM\n101200GADF",
        },
      ],
      true,
    );
    localStorage.setItem("toko-offline-preview-v1", JSON.stringify(db));
  });
  await page.reload();
  await page
    .locator("nav")
    .getByRole("button", { name: "Penjualan", exact: true })
    .click();
  await page.getByTitle("Lihat detail").click();
  await page.getByRole("button", { name: "Cetak COPY", exact: true }).click();
  await expect(
    page.locator('.invoice-title img[alt="Logo mitra"]'),
  ).toBeVisible();
  await expect(page.locator(".invoice")).toHaveCSS("padding-top", "0px");
  const grid = await page
    .locator(".invoice-title")
    .evaluate((el) => getComputedStyle(el).gridTemplateColumns);
  expect(grid).not.toBe("none");
  await expect(page.locator(".invoice-terms")).not.toContainText(
    "Sisa saat penerbitan",
  );
  await page.pdf({
    path: test.info().outputPath("invoice-reference-copy.pdf"),
    preferCSSPageSize: true,
    printBackground: true,
  });
  await page.screenshot({
    path: test.info().outputPath("invoice-reference-copy.png"),
    fullPage: true,
  });
});
