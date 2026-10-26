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
  const quantity = f.getByLabel("Batas stok minimum", { exact: true });
  await quantity.fill("1234,5");
  await expect(quantity).toHaveValue("1.234,5");
  await f.getByLabel("Kode", { exact: true }).fill("003");
  await f.getByLabel("Nama", { exact: true }).fill("Barang angka");
  await f.getByLabel("Harga beli default (Rp)").fill("1234500000");
  await f.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(f).not.toBeVisible();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("toko-offline-preview-v1")!).items.find(
      (i: { code: string }) => i.code === "003",
    ),
  );
  expect(saved.sellPrice).toBe(1450000);
  expect(saved.buyPrice).toBe(1234500000);
  expect(saved.minStock).toBe(1234.5);
  expect(saved.openingQty).toBe(0);
  expect(saved.openingCost).toBe(0);
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
test("invoice memakai proporsi referensi lima barang, normal dan COPY", async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(async () => {
    const d = await import("/src/domain.ts"),
      t = await import("/src/types.ts");
    const db = JSON.parse(localStorage.getItem("toko-offline-preview-v1")!);
    Object.assign(db.parties[0], {
      name: "Toko Prima Andalan / Mr. Kim Sin",
      address:
        "Jl. Progo No.53, Dukuh, Kec. Pekalongan Utara, Kota Pekalongan, Jawa Tengah 51146",
      city: "",
      phone: "+6287711822677",
    });
    const invoice = d.newDoc(db, "sale");
    Object.assign(invoice, {
      partyId: db.parties[0].id,
      number: "2026/PHY/INV/X/005",
      date: "2026-10-24",
      issuerName: "Mitra Ecobike (Nico Wijaya)",
      issuerAddress:
        "Jawara Express, Jl. Matadireja 1 No.811,\nKec. Purwokerto Timur, Kab. Banyumas, Jawa\n53113",
      issuerPhone: "+62 812-2937-991",
      bank: "Bank Central Asia (BCA)",
      bankBranch: "Purwokerto",
      bankCode: "014",
      account: "046-1212-432",
      beneficiary: "Nico Vijaya",
      signature: "Mitra EcoBike (Nico Wijaya)",
      terms: "Cash Before Delivery(CBD)",
      warranty:
        "* Batteries purchased with electric bicycles or motorcycles can be claimed through the respective brand’s dealer.\n* Batteries purchased through partners can be shipped directly to Tangerang for inspection to determine warranty eligibility.\nWarranty is void if:\n1. The battery is exposed to water.\n2. The battery is disassembled by the customer or the ME seal is damaged.\n3. Damage is caused by improper installation, short circuits, or physical impact.\n4. The battery is stored for more than 60 days without charging. Charge it every 3 weeks or at least once a month.\n5. Batteries purchased outside official RESMI outlets must be returned to the original store for warranty claims.\nShipping costs are borne by the buyer",
    });
    const descriptions = [
      "BATTERY PACK 48V12AH",
      "BATTERY PACK 48V12AH",
      "CHARGER48V3A",
      "CABLE SOCKET 4812",
      "SOCKET FEMALE 4812 + TUTUP",
    ];
    const prices = [1450000, 1450000, 208000, 75000, 65000],
      quantities = [1, 1, 2, 2, 2];
    // The reference displays one wrapped legacy SN across two text lines.
    invoice.serialTracking = undefined;
    const lines = descriptions.map((name, index) => {
      const item = {
        ...db.items[0],
        id: t.uid(),
        code: `REF${index}`,
        name,
        sellPrice: prices[index],
      };
      d.saveItem(db, item);
      return {
        ...d.newLine(db, invoice.id, item.id, "sale"),
        qty: quantities[index],
        serials:
          index < 2
            ? `BFJCAHIDZM\n${index === 0 ? "101200GADF" : "101200YADE"}`
            : "",
      };
    });
    d.saveDoc(db, invoice, lines, true);
    localStorage.setItem("toko-offline-preview-v1", JSON.stringify(db));
  });
  await page.reload();
  await page
    .locator("nav")
    .getByRole("button", { name: "Penjualan", exact: true })
    .click();
  await page.getByTitle("Lihat detail").click();
  await page
    .getByRole("button", { name: "Cetak keduanya", exact: true })
    .click();
  await expect(page.locator(".invoice")).toHaveCount(2);
  const normal = page.locator('.invoice[data-copy="false"]'),
    copy = page.locator('.invoice[data-copy="true"]');
  await expect(normal.locator(".copy-stamp")).toHaveCount(0);
  await expect(copy.locator(".copy-stamp")).toHaveCount(1);
  for (const sheet of [normal, copy]) {
    await expect(
      sheet.locator('.invoice-title img[alt="Logo mitra"]'),
    ).toBeVisible();
    await expect(sheet.locator("tbody tr")).toHaveCount(5);
    await expect(sheet.locator("tfoot")).toContainText("3.596.000");
    await expect(sheet).toHaveCSS("padding-top", "0px");
    const dimensions = await sheet.evaluate((el) => {
      const frame = el.getBoundingClientRect(),
        box = (s: string) => el.querySelector(s)!.getBoundingClientRect();
      return {
        logo: box(".invoice-brand img").width / frame.width,
        tableTop: (box(".invoice-table").top - frame.top) / frame.height,
        bankTop: (box(".invoice-bank").top - frame.top) / frame.height,
        signatureTop:
          (box(".invoice-signature").top - frame.top) / frame.height,
        width: frame.width,
        height: frame.height,
      };
    });
    expect(dimensions.logo).toBeCloseTo(166 / 551, 1);
    expect(Math.abs(dimensions.tableTop - 279 / 741)).toBeLessThan(0.025);
    expect(Math.abs(dimensions.bankTop - 572 / 741)).toBeLessThan(0.035);
    expect(Math.abs(dimensions.signatureTop - 660 / 741)).toBeLessThan(0.025);
    expect(dimensions.height).toBeLessThanOrEqual(1015);
  }
  const stamp = await copy.locator(".copy-stamp").boundingBox(),
    frame = await copy.boundingBox();
  expect(stamp!.x).toBeGreaterThan(frame!.x);
  expect(stamp!.x + stamp!.width).toBeLessThan(frame!.x + frame!.width);
  expect(stamp!.y + stamp!.height).toBeLessThan(frame!.y + frame!.height);
  await expect(copy.locator(".warranty-void")).toHaveCSS(
    "color",
    "rgb(208, 0, 0)",
  );
  await page.pdf({
    path: test.info().outputPath("invoice-reference-normal-copy.pdf"),
    preferCSSPageSize: true,
    printBackground: true,
  });
  await page
    .locator(".print-toolbar")
    .evaluate((el) => ((el as HTMLElement).style.visibility = "hidden"));
  await copy.screenshot({
    path: test.info().outputPath("invoice-reference-copy.png"),
  });
});

test("diskon tiap produk tersimpan di draf, invoice, dashboard dan retur", async ({
  page,
}) => {
  await setup(page);
  let f = await editor(page);
  await f.getByRole("combobox", { name: "Customer", exact: true }).fill("C001");
  await f.getByRole("option", { name: /C001/ }).click();
  for (const code of ["001", "002"]) {
    await f.getByLabel("Cari barang transaksi").fill(code);
    await f.getByLabel("Cari barang transaksi").press("Enter");
  }
  await f.getByLabel("Qty Baterai 48V", { exact: true }).fill("2");
  await f
    .getByLabel("Jenis diskon Baterai 48V", { exact: true })
    .selectOption("percent");
  await f.getByLabel("Diskon Baterai 48V", { exact: true }).fill("10");
  await f.getByLabel("Qty Charger 48V", { exact: true }).fill("3");
  await f.getByLabel("Harga Charger 48V", { exact: true }).fill("2000000");
  await f.getByLabel("Diskon Charger 48V", { exact: true }).fill("100000");
  await f.getByLabel("Diskon total (Rp)", { exact: true }).fill("310000");
  await expect(f.locator(".total-box .grand")).toContainText("8.000.000");
  await page.screenshot({
    path: test.info().outputPath("diskon-per-produk.png"),
    fullPage: true,
  });
  await f.getByRole("button", { name: "Simpan draf", exact: true }).click();
  await expect(f).not.toBeVisible();
  await page.reload();
  await page
    .locator("nav")
    .getByRole("button", { name: "Penjualan", exact: true })
    .click();
  await page.getByTitle("Lanjutkan draf").click();
  f = page.getByRole("dialog");
  await expect(f.getByLabel("Diskon Baterai 48V", { exact: true })).toHaveValue(
    "10",
  );
  await expect(f.getByLabel("Diskon Charger 48V", { exact: true })).toHaveValue(
    "100.000",
  );
  await expect(
    f.getByLabel("Jenis diskon Baterai 48V", { exact: true }),
  ).toHaveValue("percent");
  await f
    .getByRole("button", { name: "Sahkan penjualan", exact: true })
    .click();
  await expect(f).not.toBeVisible();
  await page.getByTitle("Lihat detail").click();
  await page
    .getByRole("button", { name: "Cetak keduanya", exact: true })
    .click();
  await expect(page.locator(".invoice")).toHaveCount(2);
  for (const sheet of await page.locator(".invoice").all()) {
    await expect(
      sheet.locator(".invoice-product-discount").first(),
    ).toContainText("10%");
    await expect(
      sheet.locator(".invoice-product-discount").last(),
    ).toContainText("100.000");
    await expect(sheet.locator("tfoot")).toContainText("8.000.000");
    await expect(sheet.locator(".invoice-line-total").first()).toContainText(
      "2.610.000",
    );
    await expect(sheet.locator(".invoice-line-total").last()).toContainText(
      "5.700.000",
    );
  }
  await page.pdf({
    path: test.info().outputPath("invoice-diskon-produk.pdf"),
    preferCSSPageSize: true,
    printBackground: true,
  });
  await page.getByRole("button", { name: "Tutup", exact: true }).click();
  await page
    .locator("nav")
    .getByRole("button", { name: "Dashboard", exact: true })
    .click();
  await expect(page.locator(".stats-grid")).toContainText("3.000.000");
  await page
    .locator("nav")
    .getByRole("button", { name: "Retur penjualan", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Retur penjualan baru", exact: true })
    .click();
  f = page.getByRole("dialog");
  await f
    .getByLabel("Transaksi asal", { exact: true })
    .selectOption({ index: 1 });
  await f.getByLabel("Qty Baterai 48V", { exact: true }).fill("1");
  await f
    .getByRole("button", { name: "Hapus baris Charger 48V", exact: true })
    .click();
  await expect(f.locator(".total-box .grand")).toContainText("1.256.318");
  await f
    .getByRole("button", { name: "Sahkan retur penjualan", exact: true })
    .click();
  await expect(f).not.toBeVisible();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("toko-offline-preview-v1")!),
  );
  expect(
    saved.documents.find((d: { kind: string }) => d.kind === "sale").total,
  ).toBe(8000000);
  expect(
    saved.documents.find((d: { kind: string }) => d.kind === "sale_return")
      .total,
  ).toBe(1256318);
});

test("kotak SN mengikuti Qty dan mempertahankan nilai saat Qty berubah", async ({
  page,
}) => {
  await setup(page);
  let f = await editor(page);
  await f.getByRole("combobox", { name: "Customer", exact: true }).fill("C001");
  await f.getByRole("option", { name: /C001/ }).click();
  await f.getByLabel("Cari barang transaksi").fill("001");
  await f.getByLabel("Cari barang transaksi").press("Enter");
  const quantity = f.getByLabel("Qty Baterai 48V", { exact: true });
  await quantity.fill("2");
  await expect(f.locator(".serial-unit input")).toHaveCount(2);
  await f.getByLabel("SN Baterai 48V unit 2", { exact: true }).fill("SN-002");
  await expect(
    f.getByLabel("SN Baterai 48V unit 1", { exact: true }),
  ).toHaveValue("");
  await f.getByLabel("SN Baterai 48V unit 1", { exact: true }).fill("SN-001");
  await f.getByLabel("SN Baterai 48V unit 1", { exact: true }).press("Enter");
  await expect(
    f.getByLabel("SN Baterai 48V unit 2", { exact: true }),
  ).toBeFocused();
  await expect(f).toBeVisible();
  await quantity.fill("3");
  await expect(f.locator(".serial-unit input")).toHaveCount(3);
  await f.getByLabel("SN Baterai 48V unit 3", { exact: true }).fill("SN-003");
  await quantity.fill("2");
  await expect(f.locator(".serial-unit input")).toHaveCount(2);
  await expect(f.locator(".serial-extras")).toContainText("1 SN di luar Qty");
  await quantity.fill("3");
  await expect(
    f.getByLabel("SN Baterai 48V unit 3", { exact: true }),
  ).toHaveValue("SN-003");
  await quantity.fill("2");
  await f.locator(".serial-extras summary").click();
  await f
    .getByRole("button", { name: "Hapus SN di luar Qty", exact: true })
    .click();
  await expect(f.locator(".serial-extras")).toHaveCount(0);
  await page.screenshot({
    path: test.info().outputPath("sn-per-unit.png"),
    fullPage: true,
  });
  await f.getByRole("button", { name: "Simpan draf", exact: true }).click();
  await expect(f).not.toBeVisible();
  await page.reload();
  await page
    .locator("nav")
    .getByRole("button", { name: "Penjualan", exact: true })
    .click();
  await page.getByTitle("Lanjutkan draf").click();
  f = page.getByRole("dialog");
  await expect(f.locator(".serial-unit input")).toHaveCount(2);
  await expect(
    f.getByLabel("SN Baterai 48V unit 2", { exact: true }),
  ).toHaveValue("SN-002");
  await f
    .getByRole("button", { name: "Sahkan penjualan", exact: true })
    .click();
  await expect(f).not.toBeVisible();
  await page.getByTitle("Lihat detail").click();
  await page
    .getByRole("button", { name: "Cetak keduanya", exact: true })
    .click();
  for (const sheet of await page.locator(".invoice").all()) {
    await expect(sheet.locator(".serial-cell")).toHaveText("SN-001\nSN-002");
    await expect(sheet).not.toContainText("SN-003");
  }
});

test("Qty besar memakai halaman SN dan Qty pecahan tetap dapat diisi", async ({
  page,
}) => {
  await setup(page);
  const f = await editor(page);
  await f.getByLabel("Cari barang transaksi").fill("001");
  await f.getByLabel("Cari barang transaksi").press("Enter");
  await f.getByLabel("Qty Baterai 48V", { exact: true }).fill("1000");
  await expect(f.locator(".serial-unit input")).toHaveCount(12);
  await f.getByLabel("SN Baterai 48V unit 12", { exact: true }).press("Enter");
  await expect(
    f.getByLabel("SN Baterai 48V unit 13", { exact: true }),
  ).toBeFocused();
  await f.getByLabel("SN Baterai 48V unit 13", { exact: true }).fill("SN-013");
  await f.getByLabel("Qty Baterai 48V", { exact: true }).fill("1,5");
  await expect(f.getByLabel("SN Baterai 48V", { exact: true })).toContainText(
    "SN-013",
  );
  await f.getByLabel("Qty Baterai 48V", { exact: true }).fill("13");
  await expect(
    f.getByLabel("SN Baterai 48V unit 13", { exact: true }),
  ).toHaveValue("SN-013");
});

test("pembelian dan pelunasan tidak perlu daftar pabrik dan modal masuk dashboard", async ({
  page,
}) => {
  await setup(page);
  const nav = async (name: string) =>
    page.locator("nav").getByRole("button", { name, exact: true }).click();
  await expect(
    page.locator("nav").getByRole("button", { name: /pabrik|pemasok/i }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /^Total modal/ }),
  ).toContainText("40.000.000");
  await nav("Pembelian");
  await page
    .getByRole("button", { name: "Pembelian baru", exact: true })
    .click();
  let f = page.getByRole("dialog");
  await expect(
    f.getByRole("combobox", { name: /customer|pemasok|pabrik/i }),
  ).toHaveCount(0);
  await f.getByLabel("Cari barang transaksi").fill("001");
  await f.getByLabel("Cari barang transaksi").press("Enter");
  await f.getByLabel("Qty Baterai 48V", { exact: true }).fill("5");
  await f.getByLabel("Harga Baterai 48V", { exact: true }).fill("1200000");
  await f
    .getByLabel("Jenis diskon Baterai 48V", { exact: true })
    .selectOption("percent");
  await f.getByLabel("Diskon Baterai 48V", { exact: true }).fill("10");
  await f
    .getByRole("button", { name: "Sahkan pembelian", exact: true })
    .click();
  await expect(f).not.toBeVisible();
  await nav("Dashboard");
  await expect(
    page.getByRole("button", { name: /^Total modal/ }),
  ).toContainText("45.400.000");
  await page.getByLabel("Periode", { exact: true }).selectOption("custom");
  await page.getByLabel("Dari tanggal", { exact: true }).fill("2000-01-01");
  await page.getByLabel("Sampai tanggal", { exact: true }).fill("2000-01-02");
  await expect(
    page.getByRole("button", { name: /^Total modal/ }),
  ).toContainText("45.400.000");
  await page.screenshot({
    path: test.info().outputPath("dashboard-total-modal.png"),
    fullPage: true,
  });
  await nav("Pelunasan");
  await page
    .getByRole("button", { name: "Catat pembayaran", exact: true })
    .click();
  f = page.getByRole("dialog");
  await f
    .getByLabel("Jenis pembayaran", { exact: true })
    .selectOption("supplier");
  await expect(
    f.getByRole("combobox", { name: /Customer|pemasok/ }),
  ).toHaveCount(0);
  await f.getByLabel("Nominal dibayar (Rp)", { exact: true }).fill("5400000");
  await f.locator("tbody input").fill("5400000");
  await f
    .getByRole("button", { name: "Simpan pembayaran", exact: true })
    .click();
  await expect(f).not.toBeVisible();
  await page.reload();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("toko-offline-preview-v1")!),
  );
  const suppliers = saved.parties.filter(
    (p: { kind: string }) => p.kind === "supplier",
  );
  expect(suppliers).toHaveLength(1);
  expect(
    saved.documents.find((d: { kind: string }) => d.kind === "purchase")
      .partyId,
  ).toBe(suppliers[0].id);
  expect(saved.payments[0]).toMatchObject({
    partyId: suppliers[0].id,
    direction: "out",
    amount: 5400000,
  });
});

test("sidebar hanya menampilkan ikon dan nama toko dari pengaturan", async ({
  page,
}) => {
  await setup(page);
  await page
    .locator("nav")
    .getByRole("button", { name: "Pengaturan", exact: true })
    .click();
  await page
    .getByLabel("Nama toko / penerbit", { exact: true })
    .fill("Toko Sepeda Jaya");
  await page
    .getByRole("button", { name: "Simpan pengaturan", exact: true })
    .click();
  await expect(page.locator(".brand")).toHaveText("Toko Sepeda Jaya");
  await expect(page.locator(".brand img")).toHaveAttribute(
    "src",
    "/mitra-icon.png",
  );
  await expect(page.locator(".store-name")).toHaveCount(0);
  await expect(page.locator(".brand small")).toHaveCount(0);
  await expect(page).toHaveTitle("Toko Sepeda Jaya");
  await page.reload();
  await expect(page.locator(".brand")).toHaveText("Toko Sepeda Jaya");
  await page.screenshot({
    path: test.info().outputPath("sidebar-identitas-toko.png"),
    fullPage: true,
  });
});

test("dokumen final dan uang muka dapat diedit langsung tanpa membuat transaksi baru", async ({
  page,
}) => {
  await setup(page);
  let f = await editor(page);
  await f.getByRole("combobox", { name: "Customer", exact: true }).fill("C001");
  await f.getByRole("option", { name: /C001/ }).click();
  await f.getByLabel("Cari barang transaksi").fill("001");
  await f.getByLabel("Cari barang transaksi").press("Enter");
  await f.getByLabel("Qty Baterai 48V", { exact: true }).fill("2");
  await f.getByLabel("Uang muka / dibayar sekarang (Rp)").fill("500000");
  await f
    .getByRole("button", { name: "Sahkan penjualan", exact: true })
    .click();
  await expect(f).not.toBeVisible();
  const original = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("toko-offline-preview-v1")!),
  );
  await page.getByTitle("Lihat detail").click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Edit dokumen", exact: true })
    .click();
  f = page.getByRole("dialog", { name: "Edit penjualan", exact: true });
  await f.getByLabel("Qty Baterai 48V", { exact: true }).fill("3");
  await f.getByLabel("Harga Baterai 48V", { exact: true }).fill("2000000");
  await f
    .getByLabel("Jenis diskon Baterai 48V", { exact: true })
    .selectOption("percent");
  await f.getByLabel("Diskon Baterai 48V", { exact: true }).fill("10");
  await f.getByLabel("Uang muka / dibayar sekarang (Rp)").fill("600000");
  await f.getByLabel("SN Baterai 48V unit 1", { exact: true }).fill("EDIT-SN1");
  await f
    .getByRole("button", { name: "Simpan perubahan", exact: true })
    .click();
  await expect(f).not.toBeVisible();
  let saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("toko-offline-preview-v1")!),
  );
  expect(saved.documents).toHaveLength(1);
  expect(saved.documents[0]).toMatchObject({
    id: original.documents[0].id,
    status: "final",
    total: 5400000,
    downPayment: 600000,
  });
  expect(saved.payments).toHaveLength(1);
  expect(saved.payments[0]).toMatchObject({
    id: original.payments[0].id,
    amount: 600000,
    status: "final",
  });
  await page.getByTitle("Lihat detail").click();
  await page
    .getByRole("button", { name: "Cetak invoice", exact: true })
    .click();
  await expect(
    page.locator('.invoice-brand img[alt="Logo penerbit"]'),
  ).toHaveAttribute("src", /^data:image\/png;base64,/);
  await expect(page.locator(".invoice tfoot")).toContainText("5.400.000");
  await expect(page.locator(".invoice .serial-cell")).toHaveText("EDIT-SN1");
  await page.getByRole("button", { name: "Tutup", exact: true }).click();
  await page
    .locator("nav")
    .getByRole("button", { name: "Pelunasan", exact: true })
    .click();
  await page.getByTitle("Edit pembayaran").click();
  f = page.getByRole("dialog", { name: "Edit pembayaran", exact: true });
  await f.getByLabel("Nominal dibayar (Rp)", { exact: true }).fill("700000");
  await f.locator("tbody input").fill("700000");
  await f
    .getByRole("button", { name: "Simpan pembayaran", exact: true })
    .click();
  await expect(f).not.toBeVisible();
  await page.reload();
  saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("toko-offline-preview-v1")!),
  );
  expect(saved.payments).toHaveLength(1);
  expect(saved.payments[0]).toMatchObject({
    id: original.payments[0].id,
    amount: 700000,
    status: "final",
  });
  expect(saved.documents[0].downPayment).toBe(700000);
});

test("invoice lama mendapatkan dua logo, garansi dan rekening; profil terbaru bisa diterapkan dari preview", async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(async () => {
    const d = await import("/src/domain.ts"),
      db = JSON.parse(localStorage.getItem("toko-offline-preview-v1")!);
    const doc = d.newDoc(db, "sale");
    doc.partyId = db.parties[0].id;
    d.saveDoc(db, doc, [d.newLine(db, doc.id, db.items[0].id, "sale")], true);
    const old = db.documents[0];
    delete old.invoiceDefaultsVersion;
    old.issuerName = "Mitra Ecobike";
    for (const key of [
      "logo",
      "partnerLogo",
      "warranty",
      "bank",
      "account",
      "beneficiary",
      "bankCode",
      "bankBranch",
    ])
      old[key] = "";
    const s = db.settings[0];
    delete s.invoiceDefaultsVersion;
    s.name = "Mitra Ecobike";
    for (const key of [
      "logo",
      "partnerLogo",
      "warranty",
      "bank",
      "account",
      "beneficiary",
      "bankCode",
      "bankBranch",
    ])
      s[key] = "";
    localStorage.setItem("toko-offline-preview-v1", JSON.stringify(db));
  });
  await page.reload();
  await page
    .locator("nav")
    .getByRole("button", { name: "Penjualan", exact: true })
    .click();
  await page.getByTitle("Lihat detail").click();
  await page
    .getByRole("button", { name: "Cetak invoice", exact: true })
    .click();
  await expect(page.locator(".invoice-brand img")).toBeVisible();
  await expect(page.locator(".invoice-partner-logo img")).toBeVisible();
  await expect(page.locator(".invoice-warranty")).toContainText(
    "Warranty is void if:",
  );
  await expect(page.locator(".invoice-bank")).toContainText("046-1212-432");
  await expect(page.locator(".invoice-bank")).toContainText(
    "Bank Central Asia (BCA)",
  );
  await page.getByRole("button", { name: "Tutup", exact: true }).click();
  await page
    .locator("nav")
    .getByRole("button", { name: "Pengaturan", exact: true })
    .click();
  await page.getByLabel("Nomor rekening", { exact: true }).fill("00009999");
  await page
    .getByLabel("Ketentuan garansi", { exact: true })
    .fill("Garansi pengganti sesuai toko.");
  await page
    .getByRole("button", { name: "Simpan pengaturan", exact: true })
    .click();
  await page
    .locator("nav")
    .getByRole("button", { name: "Penjualan", exact: true })
    .click();
  await page.getByTitle("Lihat detail").click();
  await page
    .getByRole("button", { name: "Cetak invoice", exact: true })
    .click();
  await expect(page.locator(".invoice-bank")).toContainText("00009999");
  await expect(page.locator(".invoice-warranty")).toContainText(
    "Garansi pengganti sesuai toko.",
  );
  await page.getByLabel("Sumber data penerbit invoice").selectOption("saved");
  await expect(page.locator(".invoice-bank")).toContainText("046-1212-432");
  await page
    .getByLabel("Sumber data penerbit invoice")
    .selectOption("settings");
  const before = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("toko-offline-preview-v1")!),
  );
  await page
    .getByRole("button", { name: "Simpan profil ke dokumen", exact: true })
    .click();
  await expect(page.locator(".invoice-bank")).toContainText("00009999");
  await expect(page.locator(".invoice-warranty")).toContainText(
    "Garansi pengganti sesuai toko.",
  );
  const after = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("toko-offline-preview-v1")!),
  );
  expect(after.documents[0].total).toBe(before.documents[0].total);
  expect(after.lines).toEqual(before.lines);
  expect(after.payments).toEqual(before.payments);
  expect(after.documents).toHaveLength(1);
});

test("setiap logo bisa diunggah, dihapus, dan direset persis ke aset bawaan lalu disimpan", async ({
  page,
}) => {
  await setup(page);
  await page
    .locator("nav")
    .getByRole("button", { name: "Pengaturan", exact: true })
    .click();
  const issuer = page.locator(".field").filter({
    has: page.getByText("Logo penerbit (opsional)", { exact: true }),
  });
  const partner = page
    .locator(".field")
    .filter({ has: page.getByText("Logo mitra (opsional)", { exact: true }) });
  const originals = await page.evaluate(async () => {
    const b = await import("/src/branding.ts");
    return { issuer: b.defaultLogo, partner: b.defaultPartnerLogo };
  });
  await expect(issuer.locator("img")).toHaveAttribute("src", originals.issuer);
  await expect(partner.locator("img")).toHaveAttribute(
    "src",
    originals.partner,
  );
  const custom = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 10;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ff0000";
    ctx.fillRect(0, 0, 10, 10);
    return c.toDataURL("image/png");
  });
  const upload = {
    name: "logo-sendiri.png",
    mimeType: "image/png",
    buffer: Buffer.from(custom.split(",")[1], "base64"),
  };
  await issuer.locator("input[type=file]").setInputFiles(upload);
  await partner.locator("input[type=file]").setInputFiles(upload);
  await expect(issuer.locator("img")).toHaveAttribute("src", custom);
  await expect(partner.locator("img")).toHaveAttribute("src", custom);
  await page
    .getByLabel("Nomor rekening", { exact: true })
    .fill("REKENING-SENDIRI");
  await page
    .getByRole("button", { name: "Simpan pengaturan", exact: true })
    .click();
  await page.reload();
  await page
    .locator("nav")
    .getByRole("button", { name: "Pengaturan", exact: true })
    .click();
  await expect(issuer.locator("img")).toHaveAttribute("src", custom);
  await page
    .getByRole("button", {
      name: "Reset logo Mitra Ecobike ke bawaan",
      exact: true,
    })
    .click();
  await expect(issuer.locator("img")).toHaveAttribute("src", originals.issuer);
  await expect(partner.locator("img")).toHaveAttribute("src", custom);
  await partner
    .getByRole("button", { name: "Hapus logo", exact: true })
    .click();
  await expect(partner.locator("img")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Reset logo Phylion ke bawaan", exact: true })
    .click();
  await expect(partner.locator("img")).toHaveAttribute(
    "src",
    originals.partner,
  );
  await page
    .getByRole("button", { name: "Simpan pengaturan", exact: true })
    .click();
  await page.reload();
  await page
    .locator("nav")
    .getByRole("button", { name: "Pengaturan", exact: true })
    .click();
  await expect(issuer.locator("img")).toHaveAttribute("src", originals.issuer);
  await expect(partner.locator("img")).toHaveAttribute(
    "src",
    originals.partner,
  );
  await expect(page.getByLabel("Nomor rekening", { exact: true })).toHaveValue(
    "REKENING-SENDIRI",
  );
});

test("invoice lama normal dan COPY otomatis memakai pengaturan BMW tanpa mengubah data transaksi", async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(async () => {
    const d = await import("/src/domain.ts"),
      db = JSON.parse(localStorage.getItem("toko-offline-preview-v1")!);
    const doc = d.newDoc(db, "sale");
    doc.partyId = db.parties[0].id;
    d.saveDoc(db, doc, [d.newLine(db, doc.id, db.items[0].id, "sale")], true);
    localStorage.setItem("toko-offline-preview-v1", JSON.stringify(db));
  });
  await page.reload();
  await page
    .locator("nav")
    .getByRole("button", { name: "Pengaturan", exact: true })
    .click();
  for (const [label, value] of [
    ["Nama toko / penerbit", "BMW"],
    ["Nama penerbit di invoice", "BMW"],
    ["Alamat penerbit", "Alamat BMW dari Pengaturan"],
    ["Telepon", "12312"],
    ["Nama penandatangan", "Penandatangan BMW"],
    ["Nama bank", "BCA"],
    ["Nama penerima rekening", "Nico Wijaya"],
    ["Nomor rekening", "6041588001"],
    ["Cabang bank", "BCA"],
    ["Kode bank", ""],
    ["Ketentuan garansi", "Garansi BMW dari pengaturan terbaru."],
  ])
    await page.getByLabel(label, { exact: true }).fill(value);
  await page
    .getByRole("button", { name: "Simpan pengaturan", exact: true })
    .click();
  const before = await page.evaluate(() =>
    localStorage.getItem("toko-offline-preview-v1"),
  );
  await page
    .locator("nav")
    .getByRole("button", { name: "Penjualan", exact: true })
    .click();
  await page.getByTitle("Lihat detail").click();
  await page
    .getByRole("button", { name: "Cetak keduanya", exact: true })
    .click();
  await expect(page.getByLabel("Sumber data penerbit invoice")).toHaveValue(
    "settings",
  );
  await expect(page.locator(".invoice")).toHaveCount(2);
  for (const sheet of await page.locator(".invoice").all()) {
    await expect(sheet.locator(".invoice-meta")).toContainText("BMW");
    await expect(sheet.locator(".invoice-meta")).toContainText(
      "Alamat BMW dari Pengaturan",
    );
    await expect(sheet.locator(".invoice-meta")).toContainText("12312");
    await expect(sheet.locator(".invoice-bank")).toContainText("6041588001");
    await expect(sheet.locator(".invoice-bank")).not.toContainText(
      "046-1212-432",
    );
    await expect(sheet.locator(".invoice-bank")).not.toContainText("Bank Code");
    await expect(sheet.locator(".invoice-signature")).toContainText(
      "Penandatangan BMW",
    );
    await expect(sheet.locator(".invoice-warranty")).toContainText(
      "Garansi BMW dari pengaturan terbaru.",
    );
    await expect(sheet.locator(".invoice-account")).toContainText(
      "Toko Prima Andalan",
    );
    await expect(sheet.locator("tfoot")).toContainText("1.450.000");
  }
  expect(
    await page.evaluate(() => localStorage.getItem("toko-offline-preview-v1")),
  ).toBe(before);
  await page.getByLabel("Sumber data penerbit invoice").selectOption("saved");
  await expect(page.locator(".invoice-bank").first()).toContainText(
    "046-1212-432",
  );
  await expect(page.locator(".invoice-meta").first()).toContainText(
    "Mitra Ecobike",
  );
  await page
    .getByLabel("Sumber data penerbit invoice")
    .selectOption("settings");
  await expect(page.locator(".invoice-bank").first()).toContainText(
    "6041588001",
  );
  expect(
    await page.evaluate(() => localStorage.getItem("toko-offline-preview-v1")),
  ).toBe(before);
});

test("profil BMW lama mendapat default garansi dan teks lain dengan reset terpisah tanpa mengganti rekening", async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(async () => {
    const d = await import("/src/domain.ts"),
      db = JSON.parse(localStorage.getItem("toko-offline-preview-v1")!);
    const doc = d.newDoc(db, "sale");
    doc.partyId = db.parties[0].id;
    d.saveDoc(db, doc, [d.newLine(db, doc.id, db.items[0].id, "sale")], true);
    Object.assign(db.settings[0], {
      name: "BMW",
      invoiceIssuer: "BMW",
      bank: "BCA",
      account: "6041588001",
      bankCode: "",
      country: "",
      signature: "",
      terms: "",
      warranty: "",
    });
    delete db.settings[0].invoiceTextDefaultsVersion;
    localStorage.setItem("toko-offline-preview-v1", JSON.stringify(db));
  });
  await page.reload();
  await page
    .locator("nav")
    .getByRole("button", { name: "Pengaturan", exact: true })
    .click();
  await expect(
    page.getByLabel("Ketentuan garansi", { exact: true }),
  ).toHaveValue(/Warranty is void if:/);
  await expect(
    page.getByLabel("Ketentuan garansi", { exact: true }),
  ).toHaveValue(/Shipping costs are borne by the buyer/);
  await expect(
    page.getByLabel("Syarat pembayaran default", { exact: true }),
  ).toHaveValue("Cash Before Delivery(CBD)");
  await expect(page.getByLabel("Negara", { exact: true })).toHaveValue(
    "Indonesia",
  );
  await expect(
    page.getByLabel("Nama penandatangan", { exact: true }),
  ).toHaveValue("BMW");
  await page
    .getByLabel("Ketentuan garansi", { exact: true })
    .fill("Garansi khusus");
  await page
    .getByLabel("Syarat pembayaran default", { exact: true })
    .fill("Syarat khusus");
  await page.getByLabel("Negara", { exact: true }).fill("Negara khusus");
  await page
    .getByRole("button", { name: "Reset garansi ke bawaan", exact: true })
    .click();
  await expect(
    page.getByLabel("Syarat pembayaran default", { exact: true }),
  ).toHaveValue("Syarat khusus");
  await page
    .getByRole("button", {
      name: "Reset syarat pembayaran ke bawaan",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Reset negara ke bawaan", exact: true })
    .click();
  await expect(page.getByLabel("Nomor rekening", { exact: true })).toHaveValue(
    "6041588001",
  );
  await expect(
    page.getByLabel("Nama toko / penerbit", { exact: true }),
  ).toHaveValue("BMW");
  await page
    .getByRole("button", { name: "Simpan pengaturan", exact: true })
    .click();
  await page.reload();
  await page
    .locator("nav")
    .getByRole("button", { name: "Penjualan", exact: true })
    .click();
  await page.getByTitle("Lihat detail").click();
  await page.getByRole("button", { name: "Cetak COPY", exact: true }).click();
  await expect(page.locator(".invoice-warranty")).toContainText(
    "Warranty is void if:",
  );
  await expect(page.locator(".invoice-warranty")).toContainText(
    "Shipping costs are borne by the buyer",
  );
  await expect(page.locator(".invoice-terms")).toContainText(
    "Cash Before Delivery(CBD)",
  );
  await expect(page.locator(".invoice-bank")).toContainText("6041588001");
  await expect(page.locator(".invoice-meta")).toContainText("BMW");
});
