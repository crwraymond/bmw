export function saveShopAccess(storeId: string, accessKey: string) {
  localStorage.setItem(`toko-shop-access:${storeId}`, accessKey);
}
export function resolveShopAccess(storeId: string, bundled: string) {
  const cached = localStorage.getItem(`toko-shop-access:${storeId}`);
  if (cached) return cached;
  if (bundled) saveShopAccess(storeId, bundled);
  return bundled;
}
