import { test, expect } from "@playwright/test";
async function seed(page: import("@playwright/test").Page) {
  await page.goto("/");
  const ids = await page.evaluate(async () => {
    const t = await import("/src/types.ts"),
      d = await import("/src/domain.ts"),
      db = d.withStoreDefaults(t.emptyDB());
    const item = {
      id: t.uid(),
      code: "A",
      name: "Barang",
      unit: "pcs",
      pack: "",
      buyPrice: 100,
      sellPrice: 200,
      openingQty: 3,
      openingCost: 300,
      minStock: 0,
      active: true,
    };
    d.saveItem(db, item);
    const customer = {
      id: t.uid(),
      code: "C",
      name: "Customer",
      kind: "customer",
      address: "",
      city: "",
      phone: "",
      fax: "",
      openingBalance: 0,
      active: true,
    };
    d.saveParty(db, customer);
    const doc = d.newDoc(db, "sale");
    doc.partyId = customer.id;
    doc.downPayment = 50;
    d.saveDoc(db, doc, [d.newLine(db, doc.id, item.id, "sale")], true);
    localStorage.setItem("toko-offline-preview-v1", JSON.stringify(db));
    return { number: doc.number, payment: db.payments[0].number };
  });
  await page.reload();
  await page
    .locator("nav")
    .getByRole("button", { name: "Penjualan", exact: true })
    .click();
  await page
    .getByRole("button", { name: `Hapus ${ids.number}`, exact: true })
    .click();
  return ids;
}
test("penolakan hapus invoice berbayar terlihat di dalam dialog", async ({
  page,
}) => {
  await seed(page);
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Lanjutkan", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("pembayaran terkait");
});

test("persetujuan eksplisit dapat menghapus invoice dan pembayaran khususnya, sedangkan Kembali tidak mengubah data", async ({
  page,
}) => {
  const ref = await seed(page);
  let dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(ref.payment);
  await dialog
    .getByRole("checkbox", { name: "Hapus juga pembayaran khusus dokumen ini" })
    .check();
  await dialog.getByRole("button", { name: "Kembali", exact: true }).click();
  const before = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("toko-offline-preview-v1")!),
  );
  expect(before.documents).toHaveLength(1);
  expect(before.payments).toHaveLength(1);
  await page
    .getByRole("button", { name: `Hapus ${ref.number}`, exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("checkbox")).not.toBeChecked();
  await dialog.getByRole("checkbox").check();
  await page.screenshot({
    path: test.info().outputPath("hapus-invoice-dengan-pembayaran.png"),
    fullPage: false,
  });
  await dialog.getByRole("button", { name: "Lanjutkan", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const after = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("toko-offline-preview-v1")!),
  );
  expect(after.documents).toEqual([]);
  expect(after.lines).toEqual([]);
  expect(after.payments).toEqual([]);
  expect(after.allocations).toEqual([]);
  expect(after.items).toEqual(before.items);
  expect(after.parties).toEqual(before.parties);
});

test("pembayaran gabungan mengarahkan ke Pelunasan tanpa menghapus tagihan lain", async ({
  page,
}) => {
  const ref = await seed(page);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Kembali", exact: true })
    .click();
  await page.evaluate(async () => {
    const t = await import("/src/types.ts"),
      d = await import("/src/domain.ts"),
      r = await import("/src/revisions.ts");
    const db = JSON.parse(localStorage.getItem("toko-offline-preview-v1")!);
    r.deletePayment(db, db.payments[0].id);
    const sale = d.newDoc(db, "sale");
    sale.partyId = db.parties.find((p: any) => p.kind === "customer").id;
    d.saveDoc(db, sale, [d.newLine(db, sale.id, db.items[0].id, "sale")], true);
    d.savePayment(
      db,
      {
        id: t.uid(),
        number: "PAY-GABUNGAN",
        date: sale.date,
        partyId: sale.partyId,
        direction: "in",
        amount: 100,
        notes: "",
        status: "final",
      },
      db.documents.map((doc: any) => ({ docId: doc.id, amount: 50 })),
    );
    localStorage.setItem("toko-offline-preview-v1", JSON.stringify(db));
  });
  await page.reload();
  const before = await page.evaluate(() =>
    localStorage.getItem("toko-offline-preview-v1"),
  );
  await page
    .locator("nav")
    .getByRole("button", { name: "Penjualan", exact: true })
    .click();
  await page
    .getByRole("button", { name: `Hapus ${ref.number}`, exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("PAY-GABUNGAN");
  await expect(dialog.getByRole("checkbox")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Lanjutkan", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("tagihan lain");
  await dialog
    .getByRole("button", { name: "Buka Pelunasan", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Pelunasan", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("toko-offline-preview-v1")),
  ).toBe(before);
});

test("hapus customer cukup satu konfirmasi dan riwayat penjualan serta pembayaran tetap ada", async ({
  page,
}) => {
  const ref = await seed(page);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Kembali", exact: true })
    .click();
  await page
    .locator("nav")
    .getByRole("button", { name: "Customer", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Hapus Customer", exact: true })
    .click();
  const before = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("toko-offline-preview-v1")!),
  );
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveCount(1);
  await dialog.getByRole("button", { name: "Hapus data", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Tampilkan nonaktif" }).check();
  await expect(
    page.getByRole("button", { name: "Hapus Customer", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  const after = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("toko-offline-preview-v1")!),
  );
  expect(after.documents).toEqual(before.documents);
  expect(after.lines).toEqual(before.lines);
  expect(after.payments).toEqual(before.payments);
  expect(after.allocations).toEqual(before.allocations);
  expect(
    after.parties.find((p: { code: string }) => p.code === "C"),
  ).toMatchObject({ deleted: true, active: false });
  await page
    .locator("nav")
    .getByRole("button", { name: "Penjualan", exact: true })
    .click();
  await expect(page.locator("tbody")).toContainText("Customer");
  await page.getByTitle("Lihat detail").click();
  await page
    .getByRole("button", { name: "Cetak keduanya", exact: true })
    .click();
  await expect(page.locator(".invoice")).toHaveCount(2);
  for (const invoice of await page.locator(".invoice").all())
    await expect(invoice.locator(".invoice-account")).toContainText("Customer");
  await page.getByRole("button", { name: "Tutup", exact: true }).click();
  await page
    .locator("nav")
    .getByRole("button", { name: "Pelunasan", exact: true })
    .click();
  await page
    .getByRole("button", { name: `Lunasi ${ref.number}`, exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: `Lunas ${ref.number}`, exact: true }),
  ).toBeDisabled();
  await page
    .locator("nav")
    .getByRole("button", { name: "Penjualan", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Penjualan baru", exact: true })
    .click();
  const form = page.getByRole("dialog");
  await form
    .getByRole("combobox", { name: "Customer", exact: true })
    .fill("Customer");
  await expect(form.getByRole("option", { name: /C — Customer/ })).toHaveCount(
    0,
  );
});
