import { test, expect, type Page } from "@playwright/test";
const nav = async (page: Page, name: string) =>
  page.locator("nav").getByRole("button", { name, exact: true }).click();
async function seed(page: Page) {
  await page.goto("/");
  await page.evaluate(async () => {
    const t = await import("/src/types.ts"),
      d = await import("/src/domain.ts"),
      db = t.emptyDB();
    d.saveItem(db, {
      id: t.uid(),
      code: "001",
      name: "Baterai SN",
      unit: "pcs",
      pack: "",
      buyPrice: 100,
      sellPrice: 200,
      openingQty: 0,
      openingCost: 0,
      minStock: 0,
      active: true,
    });
    d.saveParty(db, {
      id: t.uid(),
      kind: "customer",
      code: "C01",
      name: "Customer SN",
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
async function sale(page: Page, qty = "1") {
  await nav(page, "Penjualan");
  await page
    .getByRole("button", { name: "Penjualan baru", exact: true })
    .click();
  const f = page.getByRole("dialog");
  await f.getByRole("combobox", { name: "Customer", exact: true }).fill("C01");
  await f.getByRole("option", { name: /C01/ }).click();
  await f.getByLabel("Cari barang transaksi").fill("001");
  await f.getByLabel("Cari barang transaksi").press("Enter");
  await f.getByLabel("Qty Baterai SN", { exact: true }).fill(qty);
  return f;
}
test("SN dicatat saat pembelian, dicari/dipilih saat penjualan, tidak bisa terjual dua kali dan kembali setelah retur", async ({
  page,
}) => {
  await seed(page);
  await nav(page, "Pembelian");
  await page
    .getByRole("button", { name: "Pembelian baru", exact: true })
    .click();
  let f = page.getByRole("dialog");
  await f.getByLabel("Cari barang transaksi").fill("001");
  await f.getByLabel("Cari barang transaksi").press("Enter");
  await f.getByLabel("Qty Baterai SN", { exact: true }).fill("3");
  for (let i = 1; i <= 3; i++)
    await f
      .getByLabel(`SN Baterai SN unit ${i}`, { exact: true })
      .fill(`UNIT-00${i}`);
  await f
    .getByRole("button", { name: "Sahkan pembelian", exact: true })
    .click();
  await expect(f).not.toBeVisible();
  f = await sale(page, "2");
  await expect(
    f.getByRole("button", { name: "Sahkan penjualan", exact: true }),
  ).toBeDisabled();
  await f
    .getByRole("combobox", { name: "SN Baterai SN unit 1", exact: true })
    .fill("002");
  await f.getByRole("option", { name: "UNIT-002", exact: true }).click();
  await f
    .getByRole("combobox", { name: "SN Baterai SN unit 2", exact: true })
    .fill("002");
  await expect(
    f.getByRole("option", { name: "UNIT-002", exact: true }),
  ).toHaveCount(0);
  await f
    .getByRole("combobox", { name: "SN Baterai SN unit 2", exact: true })
    .fill("003");
  await f.getByRole("option", { name: "UNIT-003", exact: true }).click();
  await page.screenshot({
    path: test.info().outputPath("pilih-serial-penjualan.png"),
    fullPage: false,
  });
  await f
    .getByRole("button", { name: "Sahkan penjualan", exact: true })
    .click();
  await expect(f).not.toBeVisible();
  await page.reload();
  f = await sale(page);
  await f
    .getByRole("combobox", { name: "SN Baterai SN unit 1", exact: true })
    .fill("002");
  await expect(
    f.getByRole("option", { name: "UNIT-002", exact: true }),
  ).toHaveCount(0);
  await f
    .getByRole("combobox", { name: "SN Baterai SN unit 1", exact: true })
    .fill("001");
  await f.getByRole("option", { name: "UNIT-001", exact: true }).click();
  await f.getByRole("button", { name: "Tutup dialog", exact: true }).click();
  await nav(page, "Retur penjualan");
  await page
    .getByRole("button", { name: "Retur penjualan baru", exact: true })
    .click();
  f = page.getByRole("dialog");
  await f
    .getByLabel("Transaksi asal", { exact: true })
    .selectOption({ index: 1 });
  await f.getByLabel("Qty Baterai SN", { exact: true }).fill("1");
  await f.locator(".serial-extras summary").click();
  await f
    .getByRole("button", { name: "Hapus SN di luar Qty", exact: true })
    .click();
  await f
    .getByRole("button", { name: "Sahkan retur penjualan", exact: true })
    .click();
  await expect(f).not.toBeVisible();
  f = await sale(page);
  await f
    .getByRole("combobox", { name: "SN Baterai SN unit 1", exact: true })
    .fill("002");
  await expect(
    f.getByRole("option", { name: "UNIT-002", exact: true }),
  ).toBeVisible();
});

test("semua jenis dokumen memiliki tombol hapus dan penghapusan memperbarui stok", async ({
  page,
}) => {
  for (const [kind, label] of [
    ["customer_order", "Order customer"],
    ["supplier_order", "Order pembelian"],
    ["sale", "Penjualan"],
    ["purchase", "Pembelian"],
    ["sale_return", "Retur penjualan"],
    ["purchase_return", "Retur pembelian"],
  ] as const) {
    await seed(page);
    const ref = await page.evaluate(async (kind) => {
      const t = await import("/src/types.ts"),
        d = await import("/src/domain.ts"),
        db = JSON.parse(localStorage.getItem("toko-offline-preview-v1")!);
      const post = (k: any, q = 1, refId = "") => {
        const x = d.newDoc(db, k);
        if (["sale", "sale_return", "customer_order"].includes(k))
          x.partyId = db.parties.find((p: any) => p.kind === "customer").id;
        x.refId = refId;
        d.saveDoc(
          db,
          x,
          [
            {
              ...d.newLine(db, x.id, db.items[0].id, k),
              qty: q,
              refLineId: refId ? d.linesOf(db, refId)[0].id : "",
            },
          ],
          true,
        );
        return db.documents.find((v: any) => v.id === x.id);
      };
      if (["sale", "sale_return", "purchase_return"].includes(kind))
        post("purchase", 5);
      const parent =
        kind === "sale_return"
          ? post("sale", 2)
          : kind === "purchase_return"
            ? db.documents[0]
            : null;
      const target = post(kind, 1, parent?.id || "");
      localStorage.setItem("toko-offline-preview-v1", JSON.stringify(db));
      return { id: target.id, number: target.number };
    }, kind);
    await page.reload();
    await nav(page, label);
    await page
      .getByRole("button", { name: `Hapus ${ref.number}`, exact: true })
      .click();
    let f = page.getByRole("dialog");
    await f.getByRole("button", { name: "Kembali", exact: true }).click();
    expect(
      await page.evaluate(
        (id) =>
          JSON.parse(
            localStorage.getItem("toko-offline-preview-v1")!,
          ).documents.some((d: any) => d.id === id),
        ref.id,
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: `Hapus ${ref.number}`, exact: true })
      .click();
    f = page.getByRole("dialog");
    await f.getByRole("button", { name: "Lanjutkan", exact: true }).click();
    await expect(f).not.toBeVisible();
    expect(
      await page.evaluate(
        (id) =>
          JSON.parse(
            localStorage.getItem("toko-offline-preview-v1")!,
          ).documents.some((d: any) => d.id === id),
        ref.id,
      ),
    ).toBe(false);
  }
});

test("hapus barang/customer yang belum dipakai dan pembayaran; relasi transaksi mencegah penghapusan induk", async ({
  page,
}) => {
  await seed(page);
  await nav(page, "Customer");
  await page
    .getByRole("button", { name: "Hapus Customer SN", exact: true })
    .click();
  let f = page.getByRole("dialog");
  await f.getByRole("button", { name: "Hapus data", exact: true }).click();
  await expect(f).not.toBeVisible();
  await nav(page, "Barang & stok");
  await page
    .getByRole("button", { name: "Hapus Baterai SN", exact: true })
    .click();
  f = page.getByRole("dialog");
  await f.getByRole("button", { name: "Hapus data", exact: true }).click();
  await expect(f).not.toBeVisible();
  await seed(page);
  const ref = await page.evaluate(async () => {
    const t = await import("/src/types.ts"),
      d = await import("/src/domain.ts"),
      db = JSON.parse(localStorage.getItem("toko-offline-preview-v1")!);
    const buy = d.newDoc(db, "purchase");
    d.saveDoc(
      db,
      buy,
      [{ ...d.newLine(db, buy.id, db.items[0].id, "purchase"), qty: 3 }],
      true,
    );
    const sale = d.newDoc(db, "sale");
    sale.partyId = db.parties.find((p: any) => p.kind === "customer").id;
    sale.downPayment = 100;
    d.saveDoc(db, sale, [d.newLine(db, sale.id, db.items[0].id, "sale")], true);
    localStorage.setItem("toko-offline-preview-v1", JSON.stringify(db));
    return { invoice: sale.number, payment: db.payments[0].number };
  });
  await page.reload();
  await nav(page, "Penjualan");
  await page
    .getByRole("button", { name: `Hapus ${ref.invoice}`, exact: true })
    .click();
  f = page.getByRole("dialog");
  await f.getByRole("button", { name: "Lanjutkan", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("pembayaran");
  await f.getByRole("button", { name: "Kembali", exact: true }).click();
  await nav(page, "Pelunasan");
  await page
    .getByRole("button", {
      name: `Hapus pembayaran ${ref.payment}`,
      exact: true,
    })
    .click();
  f = page.getByRole("dialog");
  await f.getByRole("button", { name: "Hapus data", exact: true }).click();
  await expect(f).not.toBeVisible();
  await expect(
    page.getByRole("region", { name: "Riwayat pembayaran", exact: true }),
  ).toContainText("Belum ada pembayaran");
  await nav(page, "Penjualan");
  await page
    .getByRole("button", { name: `Hapus ${ref.invoice}`, exact: true })
    .click();
  f = page.getByRole("dialog");
  await f.getByRole("button", { name: "Lanjutkan", exact: true }).click();
  await expect(f).not.toBeVisible();
});

test("tombol keluar desktop meminta konfirmasi dan tidak menutup saat penyimpanan sibuk", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(async () => {
    await import("/tests/fixtures/DesktopActionsHarness.tsx");
  });
  await page
    .getByRole("button", { name: "Keluar aplikasi", exact: true })
    .click();
  let f = page.getByRole("dialog");
  await expect(f).toContainText("belum disimpan");
  await f.getByRole("button", { name: "Kembali", exact: true }).click();
  expect(await page.evaluate(() => (window as any).exitCalls)).toBe(0);
  await page
    .getByRole("button", { name: "Keluar aplikasi", exact: true })
    .click();
  f = page.getByRole("dialog");
  await f.getByRole("button", { name: "Keluar aplikasi", exact: true }).click();
  expect(await page.evaluate(() => (window as any).exitCalls)).toBe(1);
  await f.getByRole("button", { name: "Kembali", exact: true }).click();
  await page.evaluate(() => (window as any).renderExit(true));
  await expect(
    page.getByRole("button", { name: "Keluar aplikasi", exact: true }),
  ).toBeDisabled();
});
