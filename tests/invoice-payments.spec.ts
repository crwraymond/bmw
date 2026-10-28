import { test, expect, type Page } from "@playwright/test";
async function seed(page: Page, dp: number) {
  await page.goto("/");
  const number = await page.evaluate(async (downPayment) => {
    const t = await import("/src/types.ts"),
      d = await import("/src/domain.ts"),
      db = d.withStoreDefaults(t.emptyDB());
    const item = {
      id: t.uid(),
      code: "001",
      name: "Baterai",
      unit: "pcs",
      pack: "",
      buyPrice: 100,
      sellPrice: 500,
      openingQty: 10,
      openingCost: 1000,
      minStock: 0,
      active: true,
    };
    d.saveItem(db, item);
    const customer = {
      id: t.uid(),
      kind: "customer" as const,
      code: "C01",
      name: "Customer Invoice",
      address: "Alamat uji",
      city: "",
      phone: "",
      fax: "",
      openingBalance: 0,
      active: true,
    };
    d.saveParty(db, customer);
    const sale = d.newDoc(db, "sale");
    sale.partyId = customer.id;
    sale.downPayment = downPayment;
    d.saveDoc(
      db,
      sale,
      [{ ...d.newLine(db, sale.id, item.id, "sale"), qty: 2, price: 500 }],
      true,
    );
    localStorage.setItem(
      "toko-offline-preview-v1",
      JSON.stringify(d.withStoreDefaults(db)),
    );
    return sale.number;
  }, dp);
  await page.reload();
  return number;
}
async function nav(page: Page, name: string) {
  await page.locator("nav").getByRole("button", { name, exact: true }).click();
}
for (const dp of [0, 200]) {
  test(`pelunasan memperbarui invoice dan COPY dengan DP ${dp}`, async ({
    page,
  }) => {
    const number = await seed(page, dp);
    await nav(page, "Pelunasan");
    await page
      .getByRole("button", { name: `Lunasi ${number}`, exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: `Lunas ${number}`, exact: true }),
    ).toBeDisabled();
    const before = await page.evaluate(() =>
      localStorage.getItem("toko-offline-preview-v1"),
    );
    await nav(page, "Penjualan");
    for (const label of ["Cetak invoice", "Cetak COPY"]) {
      await page
        .getByRole("button", { name: `${label} ${number}`, exact: true })
        .click();
      await expect(
        page.locator(".invoice tfoot tr").last().locator("td").last(),
      ).toHaveText("Rp0");
      await expect(page.locator(".invoice-payment-status")).toContainText(
        "Lunas",
      );
      await expect(page.locator(".invoice-payment-status")).not.toContainText(
        "Belum lunas",
      );
      await expect(page.locator(".copy-stamp")).toHaveCount(
        label === "Cetak COPY" ? 1 : 0,
      );
      await page.getByRole("button", { name: "Tutup", exact: true }).click();
    }
    expect(
      await page.evaluate(() =>
        localStorage.getItem("toko-offline-preview-v1"),
      ),
    ).toBe(before);
  });
}

async function openBoth(page: Page) {
  await nav(page, "Penjualan");
  await page.getByTitle("Lihat detail").click();
  await page
    .getByRole("button", { name: "Cetak keduanya", exact: true })
    .click();
  await expect(page.locator(".invoice")).toHaveCount(2);
}

test("cicilan, revisi, dan pembatalan pembayaran langsung tercermin pada invoice tanpa menghitung DP dua kali", async ({
  page,
}) => {
  await seed(page, 200);
  for (const [phase, remaining, payment] of [
    ["partial", 500, 300],
    ["edited", 400, 400],
    ["cancelled", 800, 0],
    ["dp-cancelled", 1000, 0],
  ] as const) {
    await page.evaluate(async (stage) => {
      const t = await import("/src/types.ts"),
        d = await import("/src/domain.ts"),
        r = await import("/src/revisions.ts");
      const db = JSON.parse(localStorage.getItem("toko-offline-preview-v1")!);
      const sale = db.documents.find(
        (doc: { kind: string }) => doc.kind === "sale",
      );
      if (stage === "partial")
        d.savePayment(
          db,
          {
            id: t.uid(),
            number: "PAY-CICILAN",
            date: t.today(),
            partyId: sale.partyId,
            amount: 300,
            direction: "in",
            notes: "Cicilan",
            status: "final",
          },
          [{ docId: sale.id, amount: 300 }],
        );
      const payment = db.payments.find(
        (p: { number: string }) => p.number === "PAY-CICILAN",
      );
      if (stage === "edited")
        r.revisePayment(db, { ...payment, amount: 400 }, [
          { docId: sale.id, amount: 400 },
        ]);
      if (stage === "cancelled")
        d.cancelPayment(db, payment.id, "Cicilan dibatalkan");
      if (stage === "dp-cancelled")
        d.cancelPayment(db, r.downPaymentFor(db, sale)!.id, "DP dibatalkan");
      d.validateDB(db);
      localStorage.setItem("toko-offline-preview-v1", JSON.stringify(db));
    }, phase);
    await page.reload();
    const before = await page.evaluate(() =>
      localStorage.getItem("toko-offline-preview-v1"),
    );
    await openBoth(page);
    for (const sheet of await page.locator(".invoice").all()) {
      const footer = sheet.locator("tfoot");
      await expect(footer.locator("tr").last().locator("td").last()).toHaveText(
        `Rp${remaining.toLocaleString("id-ID")}`,
      );
      await expect(sheet.locator(".invoice-payment-status")).toHaveText(
        "Status pembayaran: Belum lunas",
      );
      const installments = footer
        .getByRole("row")
        .filter({ hasText: "Pembayaran lainnya" });
      if (payment)
        await expect(installments.locator("td").last()).toHaveText(
          `Rp-${payment}`,
        );
      else await expect(installments).toHaveCount(0);
      await expect(
        footer.getByRole("row").filter({ hasText: "Down Payment (DP)" }),
      ).toHaveCount(phase === "dp-cancelled" ? 0 : 1);
    }
    expect(
      await page.evaluate(() =>
        localStorage.getItem("toko-offline-preview-v1"),
      ),
    ).toBe(before);
    await page.getByRole("button", { name: "Tutup", exact: true }).click();
  }
});

test("retur setelah lunas menampilkan saldo kredit dan tidak menjadi tagihan negatif pada invoice/COPY", async ({
  page,
}) => {
  const number = await seed(page, 200);
  await nav(page, "Pelunasan");
  await page
    .getByRole("button", { name: `Lunasi ${number}`, exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: `Lunas ${number}`, exact: true }),
  ).toBeDisabled();
  await page.evaluate(async () => {
    const t = await import("/src/types.ts"),
      d = await import("/src/domain.ts");
    const db = JSON.parse(localStorage.getItem("toko-offline-preview-v1")!);
    const sale = db.documents.find(
      (doc: { kind: string }) => doc.kind === "sale",
    );
    const original = d.linesOf(db, sale.id)[0],
      returned = d.newDoc(db, "sale_return");
    returned.partyId = sale.partyId;
    returned.refId = sale.id;
    d.saveDoc(
      db,
      returned,
      [
        {
          ...original,
          id: t.uid(),
          docId: returned.id,
          refLineId: original.id,
          qty: 1,
        },
      ],
      true,
    );
    localStorage.setItem("toko-offline-preview-v1", JSON.stringify(db));
  });
  await page.reload();
  const before = await page.evaluate(() =>
    localStorage.getItem("toko-offline-preview-v1"),
  );
  await openBoth(page);
  for (const sheet of await page.locator(".invoice").all()) {
    const footer = sheet.locator("tfoot");
    await expect(footer.locator("tr").last().locator("td").last()).toHaveText(
      "Rp0",
    );
    await expect(
      footer.getByRole("row").filter({ hasText: "Retur" }).locator("td").last(),
    ).toHaveText("Rp-500");
    await expect(
      footer
        .getByRole("row")
        .filter({ hasText: "Saldo kredit" })
        .locator("td")
        .last(),
    ).toHaveText("Rp500");
    await expect(sheet.locator(".invoice-payment-status")).toContainText(
      "Lunas",
    );
    await expect(sheet.locator(".invoice-payment-status")).toContainText(
      "Memiliki saldo kredit",
    );
  }
  expect(
    await page.evaluate(() => localStorage.getItem("toko-offline-preview-v1")),
  ).toBe(before);
});
