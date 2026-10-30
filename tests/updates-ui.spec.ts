import { test, expect } from "@playwright/test";
test("ikon tombol tambah konsisten pada kedua tema dan lokasi tombol keluar jelas di preview", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .locator("nav")
    .getByRole("button", { name: "Barang & stok", exact: true })
    .click();
  for (const mode of ["dark", "light"]) {
    const toolbar = page.getByRole("button", {
      name: "Tambah barang",
      exact: true,
    });
    const empty = page.getByRole("button", {
      name: "Tambah data",
      exact: true,
    });
    for (const button of [toolbar, empty]) {
      expect(await button.evaluate((el) => getComputedStyle(el).color)).toBe(
        await button
          .locator("svg")
          .evaluate((el) => getComputedStyle(el).color),
      );
    }
    if (mode === "dark")
      await page.getByRole("button", { name: "Aktifkan tema terang" }).click();
  }
  const exit = page.getByRole("button", {
    name: "Keluar aplikasi",
    exact: true,
  });
  await expect(exit).toBeVisible();
  await expect(exit).toBeDisabled();
  await expect(exit).toHaveAttribute("title", /desktop Windows/);
  const minimize = page.getByRole("button", {
    name: "Minimalkan aplikasi",
    exact: true,
  });
  await expect(minimize).toBeVisible();
  await expect(minimize).toBeDisabled();
  await expect(minimize).toHaveAttribute("title", /desktop Windows/);
  await page
    .locator("nav")
    .getByRole("button", { name: "Pengaturan", exact: true })
    .click();
  const panel = page.getByRole("region", {
    name: "Pembaruan aplikasi",
    exact: true,
  });
  await expect(
    panel.getByRole("button", { name: "Cek update", exact: true }),
  ).toBeDisabled();
  await page.screenshot({
    path: test.info().outputPath("pengaturan-update.png"),
    fullPage: true,
  });
});
for (const mode of [
  "ready",
  "backup",
  "signature",
  "private",
  "current",
  "android",
]) {
  test(`alur update ${mode} tidak mengubah data dan menghormati hasil backup/verifikasi`, async ({
    page,
  }) => {
    await page.goto(`/?mode=${mode}`);
    const before = await page.evaluate(() =>
      localStorage.getItem("toko-offline-preview-v1"),
    );
    await page.evaluate(async () => {
      await import("/tests/fixtures/AppUpdatesHarness.tsx");
    });
    const panel = page.getByRole("region", {
      name: "Pembaruan aplikasi",
      exact: true,
    });
    await panel
      .getByRole("button", { name: "Cek update", exact: true })
      .click();
    if (mode === "private") {
      await expect(panel.getByRole("alert")).toContainText("rilis GitHub");
      await expect(
        panel.getByRole("button", { name: "Pasang update", exact: true }),
      ).toHaveCount(0);
    } else if (mode === "current") {
      await expect(panel.getByRole("status")).toContainText("versi terbaru");
    } else {
      await panel
        .getByRole("button", { name: "Pasang update", exact: true })
        .click();
      let dialog = page.getByRole("dialog");
      await dialog.getByRole("button", { name: "Nanti", exact: true }).click();
      expect(await page.evaluate(() => (window as any).updateCalls)).toEqual([
        "check",
      ]);
      await panel
        .getByRole("button", { name: "Pasang update", exact: true })
        .click();
      dialog = page.getByRole("dialog");
      await dialog
        .getByRole("button", { name: "Backup & pasang", exact: true })
        .click();
      if (mode === "ready" || mode === "android") {
        await expect(dialog.getByRole("status")).toContainText(
          mode === "android" ? "dialog Android" : "sudah dipasang",
        );
        expect(await page.evaluate(() => (window as any).updateCalls)).toEqual([
          "check",
          "backup:9",
          "download",
          "install",
        ]);
      } else {
        await expect(dialog.getByRole("alert")).toContainText(
          mode === "backup" ? "Backup failed" : "Invalid signature",
        );
        expect(await page.evaluate(() => (window as any).updateCalls)).toEqual(
          mode === "backup"
            ? ["check", "backup:9"]
            : ["check", "backup:9", "download"],
        );
      }
    }
    expect(
      await page.evaluate(() =>
        localStorage.getItem("toko-offline-preview-v1"),
      ),
    ).toBe(before);
  });
}
