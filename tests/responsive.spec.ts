import { test, expect, type Page } from "@playwright/test";

async function fits(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}
async function nav(page: Page, name: string) {
  await page.getByRole("button", { name: "Buka menu", exact: true }).click();
  await page.locator("nav").getByRole("button", { name, exact: true }).click();
}
for (const viewport of [
  { width: 360, height: 800 },
  { width: 412, height: 915 },
  { width: 768, height: 1024 },
  { width: 844, height: 390 },
]) {
  test(`mobile navigation and forms ${viewport.width}x${viewport.height}`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.evaluate(async () => {
      const t = await import("/src/types.ts"),
        d = await import("/src/domain.ts"),
        db = t.emptyDB();
      d.saveItem(db, {
        id: t.uid(),
        code: "001",
        name: "Baterai sepeda listrik dengan nama barang yang sangat panjang",
        unit: "pcs",
        pack: "",
        buyPrice: 1000000,
        sellPrice: 2000000,
        openingQty: 200,
        openingCost: 200000000,
        minStock: 0,
        active: true,
      });
      d.saveParty(db, {
        id: t.uid(),
        kind: "customer",
        code: "C001",
        name: "Pelanggan dengan nama panjang untuk uji tampilan ponsel",
        address: "Jl. Contoh",
        city: "Jakarta",
        phone: "081234567890",
        fax: "",
        openingBalance: 0,
        active: true,
      });
      localStorage.setItem("toko-offline-preview-v1", JSON.stringify(db));
    });
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Dashboard", exact: true }),
    ).toBeVisible();
    await fits(page);
    for (const name of [
      "Barang & stok",
      "Customer",
      "Penjualan",
      "Pembelian",
      "Order customer",
      "Order pembelian",
      "Retur penjualan",
      "Retur pembelian",
      "Pelunasan",
      "Laporan",
      "Pengaturan",
    ]) {
      await nav(page, name);
      await fits(page);
    }
    if (viewport.width === 360)
      await page.screenshot({
        path: info.outputPath("settings-phone.png"),
        fullPage: true,
      });
    for (const [section, button] of [
      ["Barang & stok", "Tambah barang"],
      ["Customer", "Tambah customer"],
      ["Penjualan", "Penjualan baru"],
    ]) {
      await nav(page, section);
      await page.getByRole("button", { name: button, exact: true }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      const box = await dialog.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(box!.height).toBeLessThanOrEqual(viewport.height);
      for (const field of await dialog
        .locator(
          '.form-grid input:not([type="checkbox"]), .form-grid select, .form-grid textarea',
        )
        .all()) {
        const b = await field.boundingBox();
        if (b) {
          expect(b.x).toBeGreaterThanOrEqual(0);
          expect(b.x + b.width).toBeLessThanOrEqual(viewport.width + 1);
        }
      }
      if (viewport.width === 360 && section === "Penjualan")
        await page.screenshot({ path: info.outputPath("sale-phone.png") });
      await dialog.getByRole("button", { name: "Tutup dialog", exact: true }).click();
    }
  });
}
