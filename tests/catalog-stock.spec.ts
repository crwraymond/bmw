import { test, expect, type Page } from "@playwright/test";
const nav = async (page: Page, name: string) =>
  page.locator("nav").getByRole("button", { name, exact: true }).click();
async function snapshot(page: Page) {
  return page.evaluate(async () => {
    const d = await import("/src/domain.ts"),
      db = JSON.parse(localStorage.getItem("toko-offline-preview-v1")!);
    return {
      item: db.items[0],
      stock: d.stock(db, db.items[0].id).qty,
      capital: d.totalCapital(db),
      documents: db.documents,
    };
  });
}
test("barang didaftarkan tanpa stok lalu stok/modal bertambah hanya setelah pembelian disahkan", async ({
  page,
}) => {
  await page.goto("/");
  await nav(page, "Barang & stok");
  await page
    .getByRole("button", { name: "Tambah barang", exact: true })
    .click();
  let f = page.getByRole("dialog");
  await expect(f.getByLabel("Stok awal", { exact: true })).toHaveCount(0);
  await expect(
    f.getByLabel("Total nilai stok awal (Rp)", { exact: true }),
  ).toHaveCount(0);
  await expect(f).toContainText("stok 0");
  await f.getByLabel("Kode", { exact: true }).fill("001");
  await f.getByLabel("Nama", { exact: true }).fill("Baterai Katalog");
  await f.getByLabel("Harga beli default (Rp)").fill("100");
  await f.getByLabel("Harga jual default (Rp)").fill("200");
  await page.screenshot({
    path: test.info().outputPath("barang-baru-tanpa-stok.png"),
    fullPage: false,
  });
  await f.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(f).not.toBeVisible();
  let result = await snapshot(page);
  expect(result.item).toMatchObject({ openingQty: 0, openingCost: 0 });
  expect(result.stock).toBe(0);
  expect(result.capital).toBe(0);
  await nav(page, "Penjualan");
  await page
    .getByRole("button", { name: "Penjualan baru", exact: true })
    .click();
  f = page.getByRole("dialog");
  await f.getByLabel("Cari barang transaksi").fill("001");
  await f.getByLabel("Cari barang transaksi").press("Enter");
  await expect(
    f.getByLabel("Qty Baterai Katalog", { exact: true }),
  ).toHaveCount(0);
  await expect(f.getByRole("status")).toContainText("Stok tidak cukup");
  await f.getByRole("button", { name: "Tutup dialog", exact: true }).click();
  await nav(page, "Pembelian");
  await page
    .getByRole("button", { name: "Pembelian baru", exact: true })
    .click();
  f = page.getByRole("dialog");
  await f.getByLabel("Cari barang transaksi").fill("001");
  await f.getByLabel("Cari barang transaksi").press("Enter");
  await f.getByLabel("Qty Baterai Katalog", { exact: true }).fill("5");
  await f.getByRole("button", { name: "Simpan draf", exact: true }).click();
  await expect(f).not.toBeVisible();
  result = await snapshot(page);
  expect(result.stock).toBe(0);
  expect(result.capital).toBe(0);
  await page.getByTitle("Lanjutkan draf").click();
  f = page.getByRole("dialog");
  await f
    .getByRole("button", { name: "Sahkan pembelian", exact: true })
    .click();
  await expect(f).not.toBeVisible();
  result = await snapshot(page);
  expect(result.stock).toBe(5);
  expect(result.capital).toBe(500);
  await nav(page, "Barang & stok");
  await page
    .getByRole("button", { name: "Ubah Baterai Katalog", exact: true })
    .click();
  f = page.getByRole("dialog");
  await expect(f.getByLabel("Stok awal", { exact: true })).toHaveCount(0);
  await f.getByLabel("Harga beli default (Rp)").fill("150");
  await f.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(f).not.toBeVisible();
  result = await snapshot(page);
  expect(result.stock).toBe(5);
  expect(result.capital).toBe(500);
  expect(result.item).toMatchObject({
    openingQty: 0,
    openingCost: 0,
    buyPrice: 150,
  });
});
