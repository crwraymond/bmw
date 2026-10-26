import { test, expect, type Page } from "@playwright/test";
async function seed(page: Page) {
  await page.goto("/");
  await page.evaluate(async () => {
    const t = await import("/src/types.ts"),
      d = await import("/src/domain.ts");
    const db = d.withStoreDefaults(t.emptyDB());
    d.saveItem(db, {
      id: t.uid(),
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
    });
    d.saveParty(db, {
      id: t.uid(),
      kind: "customer",
      code: "C001",
      name: "Toko Prima",
      address: "Jl. Mawar",
      city: "Purwokerto",
      phone: "+628123",
      fax: "",
      openingBalance: 0,
      active: true,
    });
    const sale = d.newDoc(db, "sale");
    sale.partyId = db.parties.find((p) => p.kind === "customer")!.id;
    sale.downPayment = 50;
    d.saveDoc(db, sale, [d.newLine(db, sale.id, db.items[0].id, "sale")], true);
    localStorage.setItem("toko-offline-preview-v1", JSON.stringify(db));
  });
  await page.reload();
}
async function upload(page: Page, name: string, content: string) {
  const dialog = page.getByRole("dialog");
  await dialog.locator("input[type=file]").setInputFiles({
    name,
    mimeType: "text/csv",
    buffer: Buffer.from(content),
  });
  await dialog
    .getByRole("button", { name: "Periksa file", exact: true })
    .click();
  return dialog;
}
test("upsert previews, preserves zeros and phone, then replaces unused customers with confirmation", async ({
  page,
}) => {
  await seed(page);
  await page
    .locator("nav")
    .getByRole("button", { name: "Customer", exact: true })
    .click();
  await page.getByRole("button", { name: "Impor CSV", exact: true }).click();
  let dialog = await upload(
    page,
    "customers.csv",
    "Kode;Nama;Telepon;Saldo awal\r\nC001;Toko Baru;+628123;0\r\n0002;Pelanggan Kedua;08120000;0",
  );
  await expect(
    dialog.getByRole("region", { name: "Pratinjau impor" }),
  ).toBeVisible();
  await expect(page.getByText("Toko Prima", { exact: true })).toBeVisible();
  await dialog.screenshot({ path: "test-results/import-upsert.png" });
  await dialog.getByRole("button", { name: "Terapkan Upsert" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText("Toko Baru", { exact: true })).toBeVisible();
  await expect(page.getByText("+628123", { exact: true })).toBeVisible();
  await expect(page.getByText("0002", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Impor CSV", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: /Replace/ }).check();
  await upload(page, "replace.csv", "Kode,Nama\n0003,Pelanggan Ketiga");
  await expect(
    dialog.getByRole("button", { name: "Terapkan Replace" }),
  ).toBeDisabled();
  await expect(
    dialog.getByRole("cell", { name: "Nonaktifkan", exact: true }),
  ).toHaveCount(1);
  await dialog.getByRole("checkbox", { name: /Saya memahami/ }).check();
  await dialog.getByRole("button", { name: "Terapkan Replace" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByText("Pelanggan Ketiga", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Pelanggan Kedua", { exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("checkbox", { name: "Tampilkan nonaktif" }).check();
  await expect(page.getByText("Toko Baru", { exact: true })).toBeVisible();
});
test("full CSV export and import retain financial state and do not duplicate down payments", async ({
  page,
}) => {
  await seed(page);
  await page
    .locator("nav")
    .getByRole("button", { name: "Pengaturan", exact: true })
    .click();
  const previous = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("toko-offline-preview-v1")!),
  );
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Ekspor semua data (CSV)", exact: true })
    .click();
  const download = await downloaded;
  const stream = (await download.createReadStream())!;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  const content = Buffer.concat(chunks).toString("utf8");
  expect(content).toContain("Nomor invoice uang muka");
  expect(content).toContain("Dataset kosong");
  await page
    .getByRole("button", { name: "Impor data (CSV)", exact: true })
    .click();
  let dialog = await upload(page, "semua-data-toko.csv", content);
  await expect(
    dialog.getByRole("region", { name: "Pratinjau impor" }),
  ).toBeVisible();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Terapkan Upsert" }).click();
  await expect(dialog).not.toBeVisible();
  let saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("toko-offline-preview-v1")!),
  );
  expect(saved.payments).toHaveLength(1);
  expect(saved.documents[0].total).toBe(previous.documents[0].total);
  expect(saved.lines[0].cost).toBe(previous.lines[0].cost);
  // Replace into a fresh store demonstrates portable IDs and all foreign-key resolution.
  await page.evaluate(async () => {
    const t = await import("/src/types.ts");
    localStorage.setItem(
      "toko-offline-preview-v1",
      JSON.stringify(t.emptyDB()),
    );
  });
  await page.reload();
  await page
    .locator("nav")
    .getByRole("button", { name: "Pengaturan", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Impor data (CSV)", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: /Replace/ }).check();
  await upload(page, "semua-data-toko.csv", content);
  await expect(
    dialog.getByRole("region", { name: "Pratinjau impor" }),
  ).toBeVisible();
  await dialog.getByRole("checkbox", { name: /Saya memahami/ }).check();
  await dialog.getByRole("button", { name: "Terapkan Replace" }).click();
  await expect(dialog).not.toBeVisible();
  saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("toko-offline-preview-v1")!),
  );
  expect(saved.documents).toHaveLength(1);
  expect(saved.payments).toHaveLength(1);
  expect(saved.allocations[0].docId).toBe(saved.documents[0].id);
  await page
    .locator("nav")
    .getByRole("button", { name: "Dashboard", exact: true })
    .click();
  await expect(page.getByText("Rp 200", { exact: true }).first()).toBeVisible();
});
test("invalid files show errors with no partial writes and a template is downloadable", async ({
  page,
}) => {
  await seed(page);
  await page
    .locator("nav")
    .getByRole("button", { name: "Barang & stok", exact: true })
    .click();
  await page.getByRole("button", { name: "Impor CSV", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const downloaded = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Unduh template" }).click();
  expect((await downloaded).suggestedFilename()).toBe("template-items.csv");
  const before = await page.evaluate(() =>
    localStorage.getItem("toko-offline-preview-v1"),
  );
  await upload(
    page,
    "rusak.csv",
    "Kode,Nama,Satuan,Harga jual\n001,Nama berubah,pcs,300\n002,Rusak,pcs,abc",
  );
  await expect(dialog.getByRole("alert")).toContainText("angka tidak valid");
  await expect(
    dialog.getByRole("button", { name: "Terapkan Upsert" }),
  ).toBeDisabled();
  expect(
    await page.evaluate(() => localStorage.getItem("toko-offline-preview-v1")),
  ).toBe(before);
});
