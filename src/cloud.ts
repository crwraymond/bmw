import { connectionCode, decodeConnectionCode } from "./shopConnection";
import { resolveShopAccess, saveShopAccess } from "./shopAccess";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cloudFields } from "./cloudFields";
import { validateDB, withStoreDefaults } from "./domain";
import { type DB } from "./types";

export const defaultProjectUrl = "https://pldeedsmovompchrmtsu.supabase.co";
const env = (
  import.meta as ImportMeta & { env: Record<string, string | undefined> }
).env;
export const sharedStoreId =
  env.VITE_TOKO_STORE_ID || "4a6943d3-408c-4583-ad26-c7d27e1684f1";
const publicKey =
  env.VITE_TOKO_PUBLIC_KEY || "sb_publishable_N5goDT2Z8WSP41gdpARo0A_1XtWtep7";
// Bootstrap installers provision device access; public update packages reuse it.
export function shopAccessKey() {
  return resolveShopAccess(sharedStoreId, env.VITE_TOKO_ACCESS_KEY || "");
}
export type RemoteStore = { store_id: string; db: DB };
let client: SupabaseClient | undefined;
export function cloudConfigured() {
  return Boolean(publicKey && shopAccessKey() && sharedStoreId);
}
async function publicCloudClient() {
  if (!client) {
    const { createClient } = await import("@supabase/supabase-js");
    client ??= createClient(defaultProjectUrl, publicKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: (input, init) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(25_000) }),
      },
    });
  }
  return client;
}
export async function cloudClient() {
  if (!cloudConfigured())
    throw new Error(
      "Hubungkan perangkat ke toko terlebih dahulu melalui Pengaturan → Sumber data.",
    );
  return publicCloudClient();
}
export function exportShopConnection() {
  const accessKey = shopAccessKey();
  if (!accessKey) throw new Error("Perangkat ini belum terhubung ke toko.");
  return connectionCode({ storeId: sharedStoreId, accessKey });
}
export async function configureShopConnection(code: string) {
  const candidate = decodeConnectionCode(code, sharedStoreId);
  // Verify read access before storing credentials. This never creates a store,
  // uploads local CSV, or modifies operational data.
  const { data, error } = await (
    await publicCloudClient()
  ).rpc("toko_read", {
    p_store_id: candidate.storeId,
    p_access_key: candidate.accessKey,
  });
  if (error) throw cloudError(error);
  if (data !== null && decodeRemote(data).store_id !== candidate.storeId)
    throw new Error("Koneksi database mengembalikan toko yang berbeda.");
  saveShopAccess(candidate.storeId, candidate.accessKey);
}
export class CloudRequestError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}
export function cloudError(error: { message: string; code?: string }) {
  if (/REVISION_CONFLICT|PT409|40001/.test(`${error.code} ${error.message}`))
    return new CloudRequestError(
      "Data Supabase sudah berubah di perangkat lain. Unggahan dihentikan; data lokal tetap utuh. Gunakan database toko atau ekspor CSV untuk membandingkan perubahan.",
      error.code,
    );
  if (/STORE_NOT_FOUND_OR_ALREADY_EXISTS/.test(error.message))
    return new CloudRequestError(
      "Data toko sudah tersedia atau koneksi installer tidak sesuai. Gunakan Gunakan database toko; jangan menimpa data yang sudah ada.",
      error.code,
    );
  if (/PGRST202|42883/.test(error.code || ""))
    return new CloudRequestError(
      "Fungsi sinkronisasi Supabase belum dipasang. Jalankan migrasi 002_storage_rpc.sql terlebih dahulu.",
      error.code,
    );
  if (/42501|JWT|token|session/i.test(`${error.code} ${error.message}`))
    return new CloudRequestError(
      "Akses database ditolak. Koneksi toko pada installer perlu diperiksa.",
      error.code,
    );
  return new CloudRequestError(
    `Supabase belum dapat diakses: ${error.message}`,
    error.code,
  );
}
export function decodeRemote(value: unknown): RemoteStore {
  if (!value || typeof value !== "object")
    throw new Error("Respons Supabase tidak valid.");
  const result = value as RemoteStore;
  if (typeof result.store_id !== "string")
    throw new Error("Identitas toko Supabase tidak valid.");
  validateDB(result.db);
  return { ...result, db: withStoreDefaults(result.db) };
}
export async function readRemote(
  storeId?: string,
): Promise<RemoteStore | null> {
  const { data, error } = await (
    await cloudClient()
  ).rpc("toko_read", {
    p_store_id: storeId || sharedStoreId,
    p_access_key: shopAccessKey(),
  });
  if (error) throw cloudError(error);
  return data === null ? null : decodeRemote(data);
}
export type CloudWrite = {
  storeId: string;
  expectedRevision: number;
  writeId: string;
  create: boolean;
};
export async function writeRemote(
  db: DB,
  request: CloudWrite,
): Promise<RemoteStore> {
  validateDB(db);
  const { data, error } = await (
    await cloudClient()
  ).rpc("toko_save", {
    p_store_id: request.storeId,
    p_access_key: shopAccessKey(),
    p_expected_revision: request.expectedRevision,
    p_write_id: request.writeId,
    p_create: request.create,
    p_db: db,
  });
  if (error) throw cloudError(error);
  const result = decodeRemote(data);
  if (
    result.store_id !== request.storeId ||
    result.db.revision !== request.expectedRevision + 1 ||
    !sameSnapshot(db, result.db)
  )
    throw new Error(
      "Verifikasi data Supabase gagal. Pilihan penyimpanan tidak diubah; CSV lokal tetap tersedia.",
    );
  return result;
}
// Compare only persisted fields, independent of row order, NULL optional fields,
// timezone formatting, and the revision that the server increments.
export function canonicalSnapshot(db: DB): string {
  return JSON.stringify(
    Object.entries(cloudFields).map(([table, fields]) => [
      table,
      [...db[table as keyof typeof cloudFields]]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((row) =>
          fields.map((field) => {
            const value = (row as unknown as Record<string, unknown>)[
              field.name
            ];
            if (
              (field.name === "createdAt" || field.name === "time") &&
              typeof value === "string"
            )
              return new Date(value).toISOString();
            return value === undefined || value === null
              ? field.optional
                ? null
                : ""
              : value;
          }),
        ),
    ]),
  );
}
export const sameSnapshot = (a: DB, b: DB) =>
  canonicalSnapshot(a) === canonicalSnapshot(b);
