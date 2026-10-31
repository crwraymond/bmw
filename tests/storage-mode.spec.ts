import { test, expect } from "@playwright/test";
const origin = "https://pldeedsmovompchrmtsu.supabase.co";
const mock = "http://127.0.0.1:4511/supabase";
test.describe("CSV/database storage with a local Supabase simulation", () => {
  test.skip(
    process.env.TOKO_STORAGE_SIM !== "1",
    "Run with TOKO_STORAGE_SIM=1 and the local Postman simulation.",
  );
  test.beforeEach(async ({ page, request }) => {
    await request.post(`${mock}/__reset`, { data: {} });
    await page.route(`${origin}/**`, async (route) => {
      const url = new URL(route.request().url());
      const response = await route.fetch({ url: `${mock}${url.pathname}` });
      await route.fulfill({ response });
    });
    await page.goto("/");
    await page.evaluate(() =>
      localStorage.setItem(
        "toko-shop-access:4a6943d3-408c-4583-ad26-c7d27e1684f1",
        "synthetic-storage-simulation-key-000000000",
      ),
    );
    await page.reload();
    await page
      .locator("nav")
      .getByRole("button", { name: "Pengaturan", exact: true })
      .click();
  });
  test("migrates, persists cloud mode, backs up to CSV, then uploads local changes with revision checking", async ({
    page,
    request,
  }) => {
    await page
      .getByRole("button", { name: "Sync ke database & gunakan" })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Lanjutkan" })
      .click();
    await expect(
      page.getByText("Database Supabase aktif", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await page
      .locator("nav")
      .getByRole("button", { name: "Pengaturan", exact: true })
      .click();
    await expect(
      page.getByText("Database Supabase aktif", { exact: true }),
    ).toBeVisible();
    await page.getByLabel("Nama toko / penerbit").fill("Toko dari database");
    await page
      .getByRole("button", { name: "Simpan pengaturan", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Profil toko tersimpan",
    );
    const downloaded = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Backup ke CSV", exact: true })
      .click();
    expect((await downloaded).suggestedFilename()).toMatch(/\.csv$/);
    await page
      .getByRole("button", { name: "Salin database & gunakan CSV" })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Lanjutkan" })
      .click();
    await expect(
      page.getByText("CSV lokal aktif", { exact: true }),
    ).toBeVisible();
    await page.getByLabel("Nama toko / penerbit").fill("Toko dari offline");
    await page
      .getByRole("button", { name: "Simpan pengaturan", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Profil toko tersimpan",
    );
    // Another device commits first; the local CSV must survive the refused upload.
    await request.post(`${mock}/__advance`, { data: {} });
    await page
      .getByRole("button", { name: "Sync ke database & gunakan" })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Lanjutkan" })
      .click();
    await expect(page.getByRole("alert")).toContainText("perangkat lain");
    await expect(
      page.getByText("CSV lokal aktif", { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Nama toko / penerbit")).toHaveValue(
      "Toko dari offline",
    );
    // Explicitly reconnecting reads cloud data without overwriting local CSV.
    await page
      .getByRole("button", { name: "Gunakan database toko", exact: true })
      .click();
    await expect(
      page.getByText("Database Supabase aktif", { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Nama toko / penerbit")).toHaveValue(
      "Toko dari database",
    );
  });
  test("failed network keeps CSV active and retains a retryable migration", async ({
    page,
  }) => {
    await page.route(`${origin}/rest/v1/rpc/toko_save`, (route) =>
      route.fulfill({
        status: 503,
        contentType: "text/html",
        body: "Unavailable",
      }),
    );
    await page
      .getByRole("button", { name: "Sync ke database & gunakan" })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Lanjutkan" })
      .click();
    await expect(page.getByRole("alert")).toContainText("Supabase");
    await expect(
      page.getByText("CSV lokal aktif", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Coba lagi sync ke database" }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Dashboard", exact: true }),
    ).toBeVisible();
  });
  test("a mismatched server snapshot cannot activate database mode", async ({
    page,
  }) => {
    await page.route(`${origin}/rest/v1/rpc/toko_save`, async (route) => {
      const response = await route.fetch({
        url: `${mock}/rest/v1/rpc/toko_save`,
      });
      const result = await response.json();
      result.db.settings[0].name = "Respons berbeda";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(result),
      });
    });
    await page
      .getByRole("button", { name: "Sync ke database & gunakan" })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Lanjutkan" })
      .click();
    await expect(page.getByRole("alert")).toContainText(
      "Verifikasi data Supabase gagal",
    );
    await expect(
      page.getByText("CSV lokal aktif", { exact: true }),
    ).toBeVisible();
  });
  test("a response lost after commit retries the identical write ID", async ({
    page,
  }) => {
    const ids: string[] = [];
    let lost = false;
    await page.route(`${origin}/rest/v1/rpc/toko_save`, async (route) => {
      ids.push(route.request().postDataJSON().p_write_id);
      const response = await route.fetch({
        url: `${mock}/rest/v1/rpc/toko_save`,
      });
      if (!lost) {
        lost = true;
        await route.abort("failed");
      } else await route.fulfill({ response });
    });
    await page
      .getByRole("button", { name: "Sync ke database & gunakan" })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Lanjutkan" })
      .click();
    await expect(
      page.getByRole("button", { name: "Coba lagi sync ke database" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Coba lagi sync ke database" })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Lanjutkan" })
      .click();
    await expect(
      page.getByText("Database Supabase aktif", { exact: true }),
    ).toBeVisible();
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(ids[1]);
    await expect(page.locator(".sidebar-bottom")).toContainText("revisi 1");
  });
});
