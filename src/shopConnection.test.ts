import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { connectionCode, decodeConnectionCode } from "./shopConnection";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc }) }));
const storeId = "4a6943d3-408c-4583-ad26-c7d27e1684f1";
const accessKey = "synthetic-test-connection-key-0000000000";
beforeEach(() => {
  vi.resetModules();
  rpc.mockReset();
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => values.set(k, v),
  });
});
afterEach(() => vi.unstubAllGlobals());
it("connection code transfers only the expected shop and rejects malformed or foreign codes", () => {
  const code = connectionCode({ storeId, accessKey });
  expect(decodeConnectionCode(`\n${code}\n`, storeId)).toEqual({
    storeId,
    accessKey,
  });
  expect(() => decodeConnectionCode(code, "another-store")).toThrow(
    "toko lain",
  );
  expect(() => decodeConnectionCode("arbitrary input", storeId)).toThrow(
    "tidak valid",
  );
  expect(() =>
    decodeConnectionCode(
      connectionCode({ storeId, accessKey: "short" }),
      storeId,
    ),
  ).toThrow("tidak valid");
});
it("verifies read access before saving configuration and never uploads CSV", async () => {
  const { emptyDB } = await import("./types");
  rpc.mockResolvedValue({
    data: { store_id: storeId, db: emptyDB() },
    error: null,
  });
  const { configureShopConnection } = await import("./cloud");
  await configureShopConnection(connectionCode({ storeId, accessKey }));
  expect(rpc.mock.calls).toEqual([
    ["toko_read", { p_store_id: storeId, p_access_key: accessKey }],
  ]);
  expect(localStorage.getItem(`toko-shop-access:${storeId}`)).toBe(accessKey);
});
it("a valid connection can provision the desktop before its first CSV migration", async () => {
  rpc.mockResolvedValue({ data: null, error: null });
  const { configureShopConnection } = await import("./cloud");
  await configureShopConnection(connectionCode({ storeId, accessKey }));
  expect(localStorage.getItem(`toko-shop-access:${storeId}`)).toBe(accessKey);
});
it("denied or malformed server responses cannot replace stored access", async () => {
  localStorage.setItem(`toko-shop-access:${storeId}`, "previous-device-key");
  rpc.mockResolvedValue({
    data: null,
    error: { code: "42501", message: "STORE_ACCESS_DENIED" },
  });
  const { configureShopConnection } = await import("./cloud");
  await expect(
    configureShopConnection(connectionCode({ storeId, accessKey })),
  ).rejects.toThrow("ditolak");
  expect(localStorage.getItem(`toko-shop-access:${storeId}`)).toBe(
    "previous-device-key",
  );
  rpc.mockResolvedValue({
    data: { store_id: storeId, db: { schema: 999 } },
    error: null,
  });
  await expect(
    configureShopConnection(connectionCode({ storeId, accessKey })),
  ).rejects.toThrow();
  expect(localStorage.getItem(`toko-shop-access:${storeId}`)).toBe(
    "previous-device-key",
  );
});
