import { test, expect, type Page } from "@playwright/test";
async function seedCapital(page: Page) {
  await page.goto("/");
  await page.evaluate(async () => {
    const t = await import("/src/types.ts"),
      d = await import("/src/domain.ts"),
      db = t.emptyDB();
    const item = {
      id: t.uid(),
      code: "001",
      name: "Baterai Modal",
      unit: "pcs",
      pack: "",
      buyPrice: 100,
      sellPrice: 300,
      openingQty: 10,
      openingCost: 1000,
      minStock: 0,
      active: true,
    };
    d.saveItem(db, item);
    const c = {
      id: t.uid(),
      kind: "customer" as const,
      code: "C01",
      name: "Customer Modal",
      address: "",
      city: "",
      phone: "",
      fax: "",
      openingBalance: 0,
      active: true,
    };
    d.saveParty(db, c);
    const purchase = d.newDoc(db, "purchase");
    d.saveDoc(
      db,
      purchase,
      [
        {
          ...d.newLine(db, purchase.id, item.id, "purchase"),
          qty: 5,
          price: 200,
          discountType: "percent",
          discountValue: 10,
        },
      ],
      true,
    );
    const sale = d.newDoc(db, "sale");
    sale.partyId = c.id;
    d.saveDoc(
      db,
      sale,
      [{ ...d.newLine(db, sale.id, item.id, "sale"), qty: 3, price: 300 }],
      true,
    );
    localStorage.setItem("toko-offline-preview-v1", JSON.stringify(db));
  });
  await page.reload();
}
test("total modal tetap mencakup seluruh pembelian setelah barang terjual dan tidak ikut filter periode", async ({
  page,
}) => {
  await seedCapital(page);
  const capital = page.getByRole("button", { name: /^Total modal/ });
  await expect(capital).toContainText("Rp 1.900");
  await expect(capital).toContainText("Stok awal + pembelian bersih");
  await page.getByLabel("Periode", { exact: true }).selectOption("custom");
  await page.getByLabel("Dari tanggal", { exact: true }).fill("2000-01-01");
  await page.getByLabel("Sampai tanggal", { exact: true }).fill("2000-01-02");
  await expect(capital).toContainText("Rp 1.900");
  await capital.click();
  await expect(
    page.getByRole("heading", { name: "Pembelian", exact: true }),
  ).toBeVisible();
});

test("tema gelap menjadi default, pilihan terang tersimpan, dan tema tidak mengubah data usaha", async ({
  page,
}) => {
  await seedCapital(page);
  const before = await page.evaluate(() =>
    localStorage.getItem("toko-offline-preview-v1"),
  );
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(
    await page
      .locator("html")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe("rgb(16, 28, 37)");
  await page.screenshot({
    path: test.info().outputPath("dashboard-dark.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Aktifkan tema terang", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.screenshot({
    path: test.info().outputPath("dashboard-light.png"),
    fullPage: true,
  });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page
    .getByRole("button", { name: "Aktifkan tema gelap", exact: true })
    .click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(
    await page.evaluate(() => localStorage.getItem("toko-offline-preview-v1")),
  ).toBe(before);
  await page.setViewportSize({ width: 390, height: 844 });
  const toggle = page.getByRole("button", {
    name: "Aktifkan tema terang",
    exact: true,
  });
  await expect(toggle).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("dashboard-dark-mobile.png"),
    fullPage: true,
  });
});

test("tema gelap mencakup form, dropdown, pengaturan dan pratinjau; kertas invoice/cetak tetap putih", async ({
  page,
}) => {
  await seedCapital(page);
  const nav = async (name: string) =>
    page.locator("nav").getByRole("button", { name, exact: true }).click();
  await nav("Pengaturan");
  expect(
    await page
      .locator(".settings-panel")
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe("rgb(24, 41, 50)");
  await page.screenshot({
    path: test.info().outputPath("settings-dark.png"),
    fullPage: true,
  });
  await nav("Penjualan");
  await page
    .getByRole("button", { name: "Penjualan baru", exact: true })
    .click();
  let dialog = page.getByRole("dialog");
  await dialog
    .getByRole("combobox", { name: "Customer", exact: true })
    .fill("C01");
  await expect(dialog.getByRole("option", { name: /C01/ })).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("form-dropdown-dark.png"),
    fullPage: false,
  });
  await dialog.getByRole("option", { name: /C01/ }).click();
  await dialog
    .getByRole("button", { name: "Tutup dialog", exact: true })
    .click();
  await page.getByTitle("Lihat detail").click();
  await page
    .getByRole("button", { name: "Cetak keduanya", exact: true })
    .click();
  await expect(page.locator(".invoice")).toHaveCount(2);
  const paper = page.locator(".invoice").first();
  expect(
    await paper.evaluate((el) => ({
      background: getComputedStyle(el).backgroundColor,
      color: getComputedStyle(el).color,
      border: getComputedStyle(el).borderTopColor,
    })),
  ).toEqual({
    background: "rgb(255, 255, 255)",
    color: "rgb(0, 0, 0)",
    border: "rgb(0, 0, 0)",
  });
  expect(
    await paper.locator("h1").evaluate((el) => getComputedStyle(el).color),
  ).toBe("rgb(0, 0, 0)");
  await page.screenshot({
    path: test.info().outputPath("invoice-dark-preview-white-paper.png"),
    fullPage: false,
  });
  await page.emulateMedia({ media: "print" });
  expect(
    await paper.evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe("rgb(255, 255, 255)");
  expect(
    await page
      .locator("html")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe("rgb(255, 255, 255)");
  await page.pdf({
    path: test.info().outputPath("invoice-dark-normal-copy.pdf"),
    preferCSSPageSize: true,
    printBackground: true,
  });
});
