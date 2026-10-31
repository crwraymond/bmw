import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { resolveShopAccess } from "./shopAccess";
beforeEach(() => {
  vi.resetModules();
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("a private installer provisions device access and a public update reuses it", () => {
  expect(resolveShopAccess("store-one", "test-shop-capability")).toBe(
    "test-shop-capability",
  );
  expect(resolveShopAccess("store-one", "")).toBe("test-shop-capability");
});
it("a fresh public installer cannot access the shop or another shop's settings", () => {
  expect(resolveShopAccess("store-one", "")).toBe("");
  resolveShopAccess("store-one", "test-shop-capability");
  expect(resolveShopAccess("other-store", "")).toBe("");
});
it("an explicitly configured device key is preserved over older bundled settings", () => {
  localStorage.setItem("toko-shop-access:store-one", "verified-device-key");
  expect(resolveShopAccess("store-one", "older-installer-key")).toBe(
    "verified-device-key",
  );
});
