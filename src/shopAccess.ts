export function resolveShopAccess(storeId: string, bundled: string) {
  const key = `toko-shop-access:${storeId}`;
  if (bundled) {
    if (localStorage.getItem(key) !== bundled)
      localStorage.setItem(key, bundled);
    return bundled;
  }
  return localStorage.getItem(key) || "";
}
