import { test, expect, type Page } from "@playwright/test";

async function seed(page: Page, invoice = false) {
  await page.goto("/");
  await page.evaluate(async (invoice) => {
    const t = await import("/src/types.ts");
    const d = await import("/src/domain.ts");
    const db = t.emptyDB();
    const customer = {
      id: t.uid(),
      kind: "customer" as const,
      code: "C001",
      name: "Customer Uji Cetak",
      address: "Jalan Pengujian 123",
      city: "Purwokerto",
      phone: "081234567890",
      fax: "",
      openingBalance: 0,
      active: true,
    };
    d.saveParty(db, customer);
    for (let i = 0; i < 5; i++)
      d.saveItem(db, {
        id: t.uid(),
        code: `B00${i}`,
        name: `Baterai sepeda listrik ${i + 1}`,
        unit: "pcs",
        pack: "",
        buyPrice: 1000000,
        sellPrice: 1500000,
        openingQty: 10,
        openingCost: 10000000,
        minStock: 0,
        active: true,
      });
    const purchase = d.newDoc(db, "purchase");
    d.saveDoc(
      db,
      purchase,
      [{ ...d.newLine(db, purchase.id, db.items[0].id, "purchase"), qty: 1 }],
      true,
    );
    if (invoice) {
      const sale = d.newDoc(db, "sale");
      sale.partyId = customer.id;
      d.saveDoc(
        db,
        sale,
        db.items.map((i) => ({
          ...d.newLine(db, sale.id, i.id, "sale"),
          serials: `SN-${i.code}`,
        })),
        true,
      );
      d.settleInvoice(db, sale.id);
    }
    localStorage.setItem("toko-offline-preview-v1", JSON.stringify(db));
  }, invoice);
  await page.reload();
}
async function nav(page: Page, name: string) {
  const menu = page.getByRole("button", { name: "Buka menu", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.locator("nav").getByRole("button", { name, exact: true }).click();
}
for (const mobile of [false, true]) {
  test.describe(mobile ? "Android" : "Desktop", () => {
    test.use({
      viewport: mobile
        ? { width: 393, height: 851 }
        : { width: 1440, height: 1000 },
      isMobile: mobile,
      hasTouch: mobile,
    });
    test("pembelian dan penjualan tanggal lampau tersimpan setelah transaksi hari ini", async ({
      page,
    }) => {
      await seed(page);
      for (const kind of ["Pembelian", "Penjualan"]) {
        await nav(page, kind);
        await page
          .getByRole("button", { name: `${kind} baru`, exact: true })
          .click();
        const form = page.getByRole("dialog");
        await form.getByLabel("Tanggal", { exact: true }).fill("2026-10-01");
        if (kind === "Penjualan") {
          await form
            .getByRole("combobox", { name: "Customer", exact: true })
            .fill("C001");
          await form.getByRole("option", { name: /C001/ }).click();
          await form
            .getByLabel("Uang muka / dibayar sekarang (Rp)")
            .fill("500000");
        }
        await form.getByLabel("Cari barang transaksi").fill("B000");
        await form
          .getByRole("button", { name: "Tambah baris", exact: true })
          .click();
        await form
          .getByRole("button", {
            name: `Sahkan ${kind.toLowerCase()}`,
            exact: true,
          })
          .click();
        await expect(form).not.toBeVisible();
      }
      await page.reload();
      const result = await page.evaluate(() => {
        const db = JSON.parse(localStorage.getItem("toko-offline-preview-v1")!);
        return {
          docs: db.documents.filter(
            (d: { date: string }) => d.date === "2026-10-01",
          ),
          payments: db.payments,
        };
      });
      expect(result.docs).toHaveLength(2);
      expect(result.payments).toHaveLength(1);
      expect(result.payments[0]).toMatchObject({
        date: "2026-10-01",
        amount: 500000,
      });
    });
    test("invoice lunas dan COPY lima barang muat satu A4", async ({
      page,
    }, info) => {
      await seed(page, true);
      const before = await page.evaluate(() =>
        localStorage.getItem("toko-offline-preview-v1"),
      );
      await nav(page, "Penjualan");
      await page
        .getByRole("row")
        .filter({ hasText: "INV/" })
        .getByRole("button", { name: /^Cetak keduanya INV\// })
        .click();
      await expect(page.locator(".invoice-paper")).toHaveCount(1);
      await expect(page.locator(".invoice")).toHaveCount(2);
      await expect(
        page.getByRole("button", { name: "Cetak / Simpan PDF" }),
      ).toBeEnabled();
      await page
        .locator(".invoice img")
        .evaluateAll(async (els) =>
          Promise.all(els.map((el) => (el as HTMLImageElement).decode())),
        );
      const [original, copy] = await page.locator(".invoice").all();
      for (const sheet of [original, copy]) {
        await expect(sheet.locator("tbody tr")).toHaveCount(5);
        await expect(sheet.locator(".invoice-payment-status")).toContainText(
          "Lunas",
        );
        const rect = await sheet.boundingBox();
        expect(rect!.height).toBeLessThanOrEqual(711);
      }
      await expect(
        page.locator('.invoice[data-copy="false"] .copy-stamp'),
      ).toHaveCount(0);
      await expect(
        page.locator('.invoice[data-copy="true"] .copy-stamp'),
      ).toHaveCount(1);
      await page.emulateMedia({ media: "print" });
      const left = (await original.boundingBox())!;
      const right = (await copy.boundingBox())!;
      expect(right.x).toBeGreaterThan(left.x + left.width);
      expect(right.y).toBeCloseTo(left.y, 0);
      await page.pdf({
        path: info.outputPath("invoice-setengah-a4.pdf"),
        preferCSSPageSize: true,
        printBackground: true,
      });
      expect(
        await page.evaluate(() =>
          localStorage.getItem("toko-offline-preview-v1"),
        ),
      ).toBe(before);
    });
  });
}
