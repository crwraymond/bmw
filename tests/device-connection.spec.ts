import { test, expect, type Page } from "@playwright/test";
const origin = "https://pldeedsmovompchrmtsu.supabase.co";
const mock = "http://127.0.0.1:4511/supabase";
const storeId = "4a6943d3-408c-4583-ad26-c7d27e1684f1";
const key = "synthetic-device-connection-key-000000000";
const code = (accessKey = key) =>
  "TOKO1." +
  Buffer.from(JSON.stringify({ storeId, accessKey })).toString("base64url");
async function settings(page: Page) {
  await page.goto("/");
  if (
    await page
      .getByRole("button", { name: "Buka menu", exact: true })
      .isVisible()
  )
    await page.getByRole("button", { name: "Buka menu", exact: true }).click();
  await page
    .locator("nav")
    .getByRole("button", { name: "Pengaturan", exact: true })
    .click();
}
test("phone storage buttons remain usable and malformed connection codes preserve CSV", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(`${origin}/**`, (route) => route.abort());
  await settings(page);
  const use = page.getByRole("button", {
    name: "Gunakan database toko",
    exact: true,
  });
  await expect(use).toBeEnabled();
  if (
    await page
      .getByText("Perangkat ini belum terhubung ke toko.", { exact: false })
      .isVisible()
  )
    await use.click();
  else
    await page
      .getByRole("button", { name: "Atur koneksi toko", exact: true })
      .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Kode koneksi toko", { exact: true })
    .fill("invalid-code");
  await dialog.getByRole("button", { name: "Hubungkan & lanjutkan" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Kode koneksi toko tidak valid",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await dialog.getByRole("button", { name: "Batal", exact: true }).click();
  await expect(
    page.getByText("CSV lokal aktif", { exact: true }),
  ).toBeVisible();
});
test.describe("desktop migration followed by phone read access", () => {
  test.skip(
    process.env.TOKO_STORAGE_SIM !== "1" ||
      process.env.TOKO_PUBLIC_BUILD !== "1",
    "Use the public-build Vite test server and Postman storage simulation.",
  );
  test("fresh public desktop imports configuration, syncs CSV, then phone loads data without writing", async ({
    page,
    browser,
    request,
  }, info) => {
    await request.post(`${mock}/__reset`, { data: {} });
    const setup = async (p: Page) =>
      p.route(`${origin}/**`, async (route) => {
        const url = new URL(route.request().url());
        const response = await route.fetch({ url: `${mock}${url.pathname}` });
        await route.fulfill({ response });
      });
    await setup(page);
    await settings(page);
    await expect(
      page.getByRole("button", {
        name: "Sync ke database & gunakan",
        exact: true,
      }),
    ).toBeEnabled();
    await page
      .getByLabel("Nama toko / penerbit")
      .fill("Toko Desktop Tersinkron");
    await page
      .getByRole("button", { name: "Simpan pengaturan", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Sync ke database & gunakan", exact: true })
      .click();
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel("Pilih file koneksi (.txt)").setInputFiles({
      name: "koneksi-toko.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(code()),
    });
    await dialog.getByRole("button", { name: "Hubungkan & lanjutkan" }).click();
    dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Sync dan gunakan database?");
    await dialog
      .getByRole("button", { name: "Lanjutkan", exact: true })
      .click();
    await expect(
      page.getByText("Database Supabase aktif", { exact: true }),
    ).toBeVisible();
    const original = await (
      await request.post(`${mock}/rest/v1/rpc/toko_read`, {
        data: { p_store_id: storeId, p_access_key: key },
        headers: { apikey: "simulation" },
      })
    ).json();
    const context = await browser.newContext({
      baseURL: new URL(page.url()).origin,
      viewport: { width: 390, height: 844 },
    });
    const phone = await context.newPage();
    let writes = 0;
    phone.on("request", (r) => {
      if (r.url().endsWith("/toko_save")) writes++;
    });
    await setup(phone);
    await settings(phone);
    await phone
      .getByRole("button", { name: "Gunakan database toko", exact: true })
      .click();
    dialog = phone.getByRole("dialog");
    await dialog.getByLabel("Kode koneksi toko", { exact: true }).fill(code());
    await dialog.getByRole("button", { name: "Hubungkan & lanjutkan" }).click();
    await expect(
      phone.getByText("Database Supabase aktif", { exact: true }),
    ).toBeVisible();
    await expect(phone.getByLabel("Nama toko / penerbit")).toHaveValue(
      "Toko Desktop Tersinkron",
    );
    expect(writes).toBe(0);
    const current = await (
      await request.post(`${mock}/rest/v1/rpc/toko_read`, {
        data: { p_store_id: storeId, p_access_key: key },
        headers: { apikey: "simulation" },
      })
    ).json();
    expect(current).toEqual(original);
    await phone.screenshot({
      path: info.outputPath("phone-database-active.png"),
      fullPage: true,
    });
    await phone.reload();
    await phone.getByRole("button", { name: "Buka menu", exact: true }).click();
    await phone
      .locator("nav")
      .getByRole("button", { name: "Pengaturan", exact: true })
      .click();
    await expect(
      phone.getByText("Database Supabase aktif", { exact: true }),
    ).toBeVisible();
    expect(writes).toBe(0);
    await context.close();
  });
  test("invalid credentials are not saved and an empty database is never initialized by the phone", async ({
    page,
    request,
  }) => {
    await request.post(`${mock}/__reset`, { data: {} });
    let writes = 0;
    page.on("request", (r) => {
      if (r.url().endsWith("/toko_save")) writes++;
    });
    await page.route(`${origin}/**`, async (route) => {
      const response = await route.fetch({
        url: `${mock}${new URL(route.request().url()).pathname}`,
      });
      await route.fulfill({ response });
    });
    await settings(page);
    await page
      .getByRole("button", { name: "Gunakan database toko", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("Kode koneksi toko", { exact: true })
      .fill(code("denied-connection-key-000000000000000"));
    await dialog.getByRole("button", { name: "Hubungkan & lanjutkan" }).click();
    await expect(dialog.getByRole("alert")).toContainText("ditolak");
    expect(
      await page.evaluate(
        (id) => localStorage.getItem(`toko-shop-access:${id}`),
        storeId,
      ),
    ).toBeNull();
    await dialog.getByLabel("Kode koneksi toko", { exact: true }).fill(code());
    await dialog.getByRole("button", { name: "Hubungkan & lanjutkan" }).click();
    await expect(page.getByRole("alert")).toContainText("belum memiliki data");
    await expect(
      page.getByText("CSV lokal aktif", { exact: true }),
    ).toBeVisible();
    expect(writes).toBe(0);
  });
  test("an older database installation can restore missing device configuration without resetting data", async ({
    page,
    request,
  }) => {
    await request.post(`${mock}/__reset`, { data: {} });
    await page.route(`${origin}/**`, async (route) => {
      const response = await route.fetch({
        url: `${mock}${new URL(route.request().url()).pathname}`,
      });
      await route.fulfill({ response });
    });
    await page.goto("/");
    const db = await page.evaluate(async () => {
      const { emptyDB } = await import("/src/types.ts");
      const db = emptyDB();
      db.settings[0].name = "Toko Koneksi Dipulihkan";
      return db;
    });
    await request.post(`${mock}/rest/v1/rpc/toko_save`, {
      data: {
        p_store_id: storeId,
        p_access_key: key,
        p_expected_revision: 0,
        p_write_id: "11111111-1111-4111-8111-111111111111",
        p_create: true,
        p_db: db,
      },
      headers: { apikey: "simulation" },
    });
    await page.evaluate((id) => {
      localStorage.removeItem(`toko-shop-access:${id}`);
      localStorage.setItem(
        "toko-storage-v1",
        JSON.stringify({
          mode: "supabase",
          storeId: id,
          binding: "existing-installation",
        }),
      );
    }, storeId);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Data belum bisa dibuka" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Hubungkan kembali database", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Kode koneksi toko", { exact: true }).fill(code());
    await dialog.getByRole("button", { name: "Hubungkan & lanjutkan" }).click();
    await expect(
      page.getByRole("heading", { name: "Dashboard", exact: true }),
    ).toBeVisible();
    await page
      .locator("nav")
      .getByRole("button", { name: "Pengaturan", exact: true })
      .click();
    await expect(page.getByLabel("Nama toko / penerbit")).toHaveValue(
      "Toko Koneksi Dipulihkan",
    );
    await expect(
      page.getByText("Database Supabase aktif", { exact: true }),
    ).toBeVisible();
  });
});
