export type ShopConnection = { storeId: string; accessKey: string };
const prefix = "TOKO1.";
export function connectionCode(connection: ShopConnection) {
  return (
    prefix +
    btoa(JSON.stringify(connection))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replace(/=+$/, "")
  );
}
export function decodeConnectionCode(
  input: string,
  expectedStore: string,
): ShopConnection {
  try {
    const code = input.trim();
    if (!code.startsWith(prefix) || code.length > 2048) throw new Error();
    const value = JSON.parse(
      atob(code.slice(prefix.length).replaceAll("-", "+").replaceAll("_", "/")),
    ) as ShopConnection;
    if (
      value.storeId !== expectedStore ||
      typeof value.accessKey !== "string" ||
      !/^[A-Za-z0-9_-]{32,256}$/.test(value.accessKey)
    )
      throw new Error();
    return { storeId: value.storeId, accessKey: value.accessKey };
  } catch {
    throw new Error(
      "Kode koneksi toko tidak valid atau berasal dari toko lain.",
    );
  }
}
