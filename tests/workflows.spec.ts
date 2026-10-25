import { test, expect, type Page } from "@playwright/test";
async function nav(page: Page, name: string) {
  await page.locator("nav").getByRole("button", { name, exact: true }).click();
}
async function contact(
  page: Page,
  kind: "Customer",
  code: string,
  name: string,
) {
  await nav(page, kind);
  await page
    .getByRole("button", {
      name: "Tambah customer",
      exact: true,
    })
    .click();
  const form = page.getByRole("dialog");
  await form.getByLabel("Kode", { exact: true }).fill(code);
  await form.getByLabel("Nama", { exact: true }).fill(name);
  await form.getByLabel("Alamat", { exact: true }).fill("Jl. Pengujian 1");
  await form.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(form).not.toBeVisible();
}
async function document(
  page: Page,
  kind: string,
  party: string,
  qty: string,
  price: string,
  order = false,
  dp = "0",
) {
  await nav(page, kind);
  await page.getByRole("button", { name: `${kind} baru`, exact: true }).click();
  const f = page.getByRole("dialog");
  if (!["Pembelian", "Order pembelian"].includes(kind)) {
    const partyField = f.getByRole("combobox", {
      name: "Customer",
      exact: true,
    });
    await partyField.fill(party);
    await f.getByRole("option", { name: party, exact: true }).click();
  }
  if (order)
    await f.getByLabel("Tautkan order (opsional)").selectOption({ index: 1 });
  else {
    await f.getByLabel("Cari barang transaksi").fill("001");
    await f.getByRole("button", { name: "Tambah baris" }).click();
  }
  await f.getByLabel("Qty Baterai 48V", { exact: true }).fill(qty);
  await f.getByLabel("Harga Baterai 48V", { exact: true }).fill(price);
  if (kind === "Penjualan")
    await f.getByLabel("Uang muka / dibayar sekarang (Rp)").fill(dp);
  await f
    .getByRole("button", { name: `Sahkan ${kind.toLowerCase()}`, exact: true })
    .click();
  await expect(f).not.toBeVisible();
}
test("alur operasional, invoice, backup, dan buka ulang", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Dashboard", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("dashboard-kosong.png"),
    fullPage: true,
  });
  await nav(page, "Pengaturan");
  await page.getByLabel("Nama toko / penerbit").fill("Toko Uji Invoice");
  await page.getByLabel("Alamat penerbit").fill("Jl. Contoh 11, Purwokerto");
  await page.getByLabel("Nomor rekening").fill("00120003");
  await page.getByLabel("Nama bank").fill("Bank Uji");
  await page
    .getByLabel("Ketentuan garansi")
    .fill(
      "Garansi sesuai ketentuan toko.\nSimpan invoice sebagai bukti pembelian.",
    );
  await page.getByRole("button", { name: "Simpan pengaturan" }).click();
  await expect(page.getByRole("status")).toContainText("Profil toko tersimpan");
  await nav(page, "Barang & stok");
  await page
    .getByRole("button", { name: "Tambah barang", exact: true })
    .click();
  let f = page.getByRole("dialog");
  await f.getByLabel("Kode", { exact: true }).fill("001");
  await f.getByLabel("Nama", { exact: true }).fill("Baterai 48V");
  await f.getByLabel("Harga beli default (Rp)").fill("100");
  await f.getByLabel("Harga jual default (Rp)").fill("200");
  await f.getByLabel("Stok awal", { exact: true }).fill("10");
  await f.getByLabel("Total nilai stok awal (Rp)").fill("1000");
  await f.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(f).not.toBeVisible();
  await contact(page, "Customer", "C01", "Customer Uji");
  await document(page, "Order pembelian", "", "5", "120");
  await document(page, "Pembelian", "", "5", "120", true);
  await document(page, "Order customer", "C01 — Customer Uji", "3", "200");
  await document(
    page,
    "Penjualan",
    "C01 — Customer Uji",
    "3",
    "200",
    true,
    "150",
  );
  await page.getByTitle("Lihat detail").click();
  await page
    .getByRole("button", { name: "Cetak keduanya", exact: true })
    .click();
  await expect(page.locator(".invoice")).toHaveCount(2);
  await expect(page.locator(".invoice").first()).not.toContainText("COPY");
  await expect(page.locator(".invoice").last()).toContainText("COPY");
  await expect(page.locator(".invoice").first()).toContainText("00120003");
  await page.pdf({
    path: info.outputPath("invoice-normal-copy.pdf"),
    format: "A4",
    preferCSSPageSize: true,
    printBackground: true,
  });
  await page.screenshot({
    path: info.outputPath("invoice-preview.png"),
    fullPage: false,
  });
  await page.getByRole("button", { name: "Tutup", exact: true }).click();
  await nav(page, "Retur penjualan");
  await page
    .getByRole("button", { name: "Retur penjualan baru", exact: true })
    .click();
  f = page.getByRole("dialog");
  await f
    .getByLabel("Transaksi asal", { exact: true })
    .selectOption({ index: 1 });
  await f.getByLabel("Qty Baterai 48V", { exact: true }).fill("1");
  await f
    .getByRole("button", { name: "Sahkan retur penjualan", exact: true })
    .click();
  await expect(f).not.toBeVisible();
  await nav(page, "Pelunasan");
  await page
    .getByRole("button", { name: "Catat pembayaran", exact: true })
    .click();
  f = page.getByRole("dialog");
  await f.getByRole("combobox", { name: "Customer", exact: true }).fill("C01");
  await f
    .getByRole("option", { name: "C01 — Customer Uji", exact: true })
    .click();
  await f.getByLabel("Nominal dibayar (Rp)").fill("250");
  await f.locator("tbody input").fill("250");
  await f.getByRole("button", { name: "Simpan pembayaran" }).click();
  await expect(f).not.toBeVisible();
  await nav(page, "Dashboard");
  const stats = page.locator(".stats-grid");
  await expect(stats).toContainText("400");
  await expect(stats).toContainText("187");
  await page.screenshot({
    path: info.outputPath("dashboard-transaksi.png"),
    fullPage: true,
  });
  await nav(page, "Laporan");
  const report = page.getByLabel("Jenis laporan");
  for (const value of [
    "customers",
    "stock",
    "sold",
    "customer_order",
    "supplier_order",
    "order_total",
    "order_customer",
    "sale",
    "purchase",
    "sale_return",
    "purchase_return",
    "receivable",
    "payable",
    "receivable_total",
    "profit",
  ]) {
    await report.selectOption(value);
    await expect(
      page.locator("#report-print .section-heading h3"),
    ).not.toBeEmpty();
  }
  await expect(page.locator("#report-print")).toContainText("Laba kotor");
  await expect(page.locator("#report-print")).toContainText("187");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Dashboard", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".stats-grid")).toContainText("187");
  await nav(page, "Pengaturan");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Buat backup" }).click();
  const file = await download;
  await file.saveAs(info.outputPath("backup.json"));
  await page
    .getByRole("button", { name: "Pulihkan backup", exact: true })
    .click();
  const chooser = page.waitForEvent("filechooser");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Lanjutkan" })
    .click();
  await (await chooser).setFiles(info.outputPath("backup.json"));
  await expect(page.getByRole("status")).toContainText(
    "Backup berhasil dipulihkan",
  );
  expect(errors).toEqual([]);
});
test("tampilan ponsel tetap dapat dipakai", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Buka menu" }).click();
  await nav(page, "Barang & stok");
  await expect(
    page.getByRole("button", { name: "Tambah barang", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("invoice panjang dipisah dan setiap halaman COPY diberi penanda", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.evaluate(async () => {
    // Fixture hanya pada browser pengujian yang terisolasi, bukan data aplikasi desktop.
    const t = await import("/src/types.ts");
    const d = await import("/src/domain.ts");
    const db = t.emptyDB();
    db.settings[0].warranty =
      "Garansi sesuai ketentuan toko. Simpan invoice sebagai bukti pembelian.\n".repeat(
        70,
      );
    const party = {
      id: t.uid(),
      kind: "customer",
      code: "CUJI",
      name: "Customer Pengujian Cetak",
      address: "Alamat uji cetak",
      city: "Purwokerto",
      phone: "08120000",
      fax: "",
      openingBalance: 0,
      active: true,
    };
    d.saveParty(db, party);
    for (let i = 0; i < 42; i++)
      d.saveItem(db, {
        id: t.uid(),
        code: `B-${i}`,
        name: `Komponen baterai nomor ${i + 1} dengan deskripsi yang perlu membungkus pada tabel`,
        unit: "pcs",
        pack: "",
        buyPrice: 100,
        sellPrice: 200,
        openingQty: 1,
        openingCost: 100,
        minStock: 0,
        active: true,
      });
    const doc = d.newDoc(db, "sale");
    doc.partyId = party.id;
    d.saveDoc(
      db,
      doc,
      db.items.map((i: { id: string }) => ({
        ...d.newLine(db, doc.id, i.id, "sale"),
        serials: "SN-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ",
      })),
      true,
    );
    localStorage.setItem("toko-offline-preview-v1", JSON.stringify(db));
  });
  await page.reload();
  await nav(page, "Penjualan");
  await page.getByTitle("Lihat detail").click();
  await page.getByRole("button", { name: "Cetak COPY", exact: true }).click();
  await expect(page.locator(".invoice")).not.toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Cetak / Simpan PDF" }),
  ).toBeEnabled();
  const count = await page.locator(".invoice").count();
  expect(count).toBeGreaterThan(2);
  await expect(page.locator(".invoice-signature")).toHaveCount(1);
  expect(await page.locator(".copy-stamp").count()).toBe(count);
  expect(
    await page
      .locator(".invoice")
      .evaluateAll((els) =>
        els.every((e) => e.getBoundingClientRect().height <= 1015),
      ),
  ).toBe(true);
  await page.pdf({
    path: info.outputPath("invoice-panjang-copy.pdf"),
    preferCSSPageSize: true,
    printBackground: true,
  });
});
