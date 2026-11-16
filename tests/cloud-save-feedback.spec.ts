import { test, expect } from "@playwright/test";
const origin = "https://pldeedsmovompchrmtsu.supabase.co";
const mock = "http://127.0.0.1:4511/supabase";
const storeId = "4a6943d3-408c-4583-ad26-c7d27e1684f1";
test.skip(
  process.env.TOKO_STORAGE_SIM !== "1",
  "Requires local Postman simulation",
);
for (const conflict of [false, true]) {
  test(`database customer save ${conflict ? "shows revision conflict inside form" : "writes directly and survives reload"}`, async ({
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
    const db = await page.evaluate(async () =>
      (await import("/src/types.ts")).emptyDB(),
    );
    await request.post(`${mock}/rest/v1/rpc/toko_save`, {
      headers: { apikey: "synthetic" },
      data: {
        p_store_id: storeId,
        p_access_key: "synthetic-save-key",
        p_expected_revision: 0,
        p_write_id: "initial",
        p_create: true,
        p_db: db,
      },
    });
    await page.evaluate(
      ({ storeId }) => {
        localStorage.setItem(
          `toko-shop-access:${storeId}`,
          "synthetic-save-key-00000000000000000",
        );
        localStorage.setItem(
          "toko-storage-v1",
          JSON.stringify({ mode: "supabase", binding: "save-test", storeId }),
        );
      },
      { storeId },
    );
    await page.reload();
    await page
      .locator("nav")
      .getByRole("button", { name: "Customer", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Tambah customer", exact: true })
      .click();
    const form = page.getByRole("dialog");
    await form.getByLabel("Kode", { exact: true }).fill("SAVE01");
    await form
      .getByLabel("Nama", { exact: true })
      .fill("Customer save database");
    if (conflict) await request.post(`${mock}/__advance`, { data: {} });
    await form.getByRole("button", { name: "Simpan", exact: true }).click();
    if (conflict) {
      const alert = form.getByRole("alert");
      await expect(alert).toContainText("berubah di perangkat lain");
      await alert.getByRole("button", { name: "Tutup pemberitahuan" }).click();
      await expect(form.getByLabel("Nama", { exact: true })).toHaveValue(
        "Customer save database",
      );
      await expect(
        form.getByRole("button", { name: "Simpan", exact: true }),
      ).toBeEnabled();
    } else {
      await expect(form).not.toBeVisible();
      await page.reload();
      await page
        .locator("nav")
        .getByRole("button", { name: "Customer", exact: true })
        .click();
      await expect(page.locator("tbody")).toContainText(
        "Customer save database",
      );
    }
  });
}
