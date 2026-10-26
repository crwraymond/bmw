import { test, expect, type Page } from "@playwright/test";
async function seed(page: Page) {
  await page.goto("/");
  await page.evaluate(async () => {
    const t = await import("/src/types.ts"),
      d = await import("/src/domain.ts"),
      db = t.emptyDB();
    d.saveItem(db, {
      id: t.uid(),
      code: "001",
      name: "Barang Lima",
      unit: "pcs",
      pack: "",
      buyPrice: 100,
      sellPrice: 150,
      openingQty: 5,
      openingCost: 500,
      minStock: 0,
      active: true,
    });
    d.saveItem(db, {
      id: t.uid(),
      code: "000",
      name: "Barang Habis",
      unit: "pcs",
      pack: "",
      buyPrice: 100,
      sellPrice: 150,
      openingQty: 0,
      openingCost: 0,
      minStock: 0,
      active: true,
    });
    d.saveParty(db, {
      id: t.uid(),
      kind: "customer",
      code: "C001",
      name: "Customer Stok",
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
async function sale(page: Page) {
  await page
    .locator("nav")
    .getByRole("button", { name: "Penjualan", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Penjualan baru", exact: true })
    .click();
  const f = page.getByRole("dialog");
  await f.getByRole("combobox", { name: "Customer", exact: true }).fill("C001");
  await f.getByRole("option", { name: /C001/ }).click();
  return f;
}
test("stok 5 menolak Qty 6 di form dan kembali valid setelah dikoreksi menjadi 5", async ({
  page,
}) => {
  await seed(page);
  const f = await sale(page);
  await f.getByLabel("Cari barang transaksi").fill("001");
  await f.getByLabel("Cari barang transaksi").press("Enter");
  const quantity = f.getByLabel("Qty Barang Lima", { exact: true });
  await quantity.fill("6");
  await expect(
    f.getByRole("button", { name: "Sahkan penjualan", exact: true }),
  ).toBeDisabled();
  await expect(quantity).toHaveAttribute("aria-invalid", "true");
  await expect(f.getByRole("alert")).toContainText("Stok tidak cukup");
  await expect(f.getByRole("alert")).toContainText("5 pcs");
  await expect(
    f.getByRole("button", { name: "Simpan draf", exact: true }),
  ).toBeDisabled();
  await page.screenshot({
    path: test.info().outputPath("stok-tidak-cukup.png"),
    fullPage: true,
  });
  const before = await page.evaluate(() =>
    localStorage.getItem("toko-offline-preview-v1"),
  );
  await quantity.press("Control+s");
  expect(
    await page.evaluate(() => localStorage.getItem("toko-offline-preview-v1")),
  ).toBe(before);
  await quantity.fill("5");
  await expect(quantity).toHaveAttribute("aria-invalid", "false");
  await expect(
    f.getByRole("button", { name: "Sahkan penjualan", exact: true }),
  ).toBeEnabled();
  await f
    .getByRole("button", { name: "Sahkan penjualan", exact: true })
    .click();
  await expect(f).not.toBeVisible();
  expect(
    await page.evaluate(async () => {
      const d = await import("/src/domain.ts"),
        db = JSON.parse(localStorage.getItem("toko-offline-preview-v1")!);
      return d.stock(db, db.items[0].id).qty;
    }),
  ).toBe(0);
});

test("stok kosong dan penambahan berulang lewat Enter tidak bisa melampaui stok", async ({
  page,
}) => {
  await seed(page);
  const f = await sale(page);
  const code = f.getByLabel("Cari barang transaksi");
  const add = f.getByRole("button", { name: "Tambah baris", exact: true });
  await code.fill("000");
  await expect(add).toBeDisabled();
  await code.press("Enter");
  await expect(f.getByRole("status")).toContainText("Stok tidak cukup");
  await expect(f.getByLabel("Qty Barang Habis", { exact: true })).toHaveCount(
    0,
  );
  for (let i = 0; i < 5; i++) {
    await code.fill("001");
    await code.press("Enter");
  }
  await expect(f.getByLabel("Qty Barang Lima", { exact: true })).toHaveValue(
    "5",
  );
  await code.fill("001");
  await expect(add).toBeDisabled();
  await code.press("Enter");
  await expect(f.getByRole("status")).toContainText("5 pcs");
  await expect(f.getByLabel("Qty Barang Lima", { exact: true })).toHaveValue(
    "5",
  );
});

test("edit nota yang menghabiskan stok tetap valid dan tidak boleh melebihi stok asal", async ({
  page,
}) => {
  await seed(page);
  let f = await sale(page);
  await f.getByLabel("Cari barang transaksi").fill("001");
  await f.getByLabel("Cari barang transaksi").press("Enter");
  await f.getByLabel("Qty Barang Lima", { exact: true }).fill("5");
  await f
    .getByRole("button", { name: "Sahkan penjualan", exact: true })
    .click();
  await expect(f).not.toBeVisible();
  const original = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("toko-offline-preview-v1")!).documents[0]
        .id,
  );
  await page.getByTitle("Lihat detail").click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Edit dokumen", exact: true })
    .click();
  f = page.getByRole("dialog", { name: "Edit penjualan", exact: true });
  const quantity = f.getByLabel("Qty Barang Lima", { exact: true });
  const save = f.getByRole("button", { name: "Simpan perubahan", exact: true });
  await expect(quantity).toHaveValue("5");
  await expect(save).toBeEnabled();
  await quantity.fill("6");
  await expect(save).toBeDisabled();
  await expect(f.getByRole("alert")).toContainText("5 pcs");
  await quantity.fill("4");
  await save.click();
  await expect(f).not.toBeVisible();
  const result = await page.evaluate(async () => {
    const d = await import("/src/domain.ts"),
      db = JSON.parse(localStorage.getItem("toko-offline-preview-v1")!);
    return {
      stock: d.stock(db, db.items[0].id).qty,
      docs: db.documents,
      payments: db.payments,
    };
  });
  expect(result.stock).toBe(1);
  expect(result.docs).toHaveLength(1);
  expect(result.docs[0].id).toBe(original);
  expect(result.payments).toHaveLength(0);
});

test("stok pecahan tetap dapat dijual tanpa memaksa qty awal satu unit", async ({
  page,
}) => {
  await seed(page);
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem("toko-offline-preview-v1")!);
    db.items[0].openingQty = 0.5;
    db.items[0].openingCost = 50;
    localStorage.setItem("toko-offline-preview-v1", JSON.stringify(db));
  });
  await page.reload();
  const f = await sale(page);
  await f.getByLabel("Cari barang transaksi").fill("001");
  await f.getByLabel("Cari barang transaksi").press("Enter");
  await expect(f.getByLabel("Qty Barang Lima", { exact: true })).toHaveValue(
    "0,5",
  );
  await expect(
    f.getByRole("button", { name: "Sahkan penjualan", exact: true }),
  ).toBeEnabled();
});
