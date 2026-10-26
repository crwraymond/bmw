import { invoke, isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { type DB, emptyDB } from "./types";
import { validateDB, audit, withStoreDefaults } from "./domain";
import { csvText } from "./csv";
export const desktop = isTauri();
const key = "toko-offline-preview-v1";
export async function load(): Promise<{ db: DB; path: string }> {
  if (desktop) {
    const result = await invoke<{ db: DB; path: string }>("load_store");
    validateDB(result.db);
    return { ...result, db: withStoreDefaults(result.db) };
  }
  const raw = localStorage.getItem(key);
  const db = raw ? JSON.parse(raw) : emptyDB();
  validateDB(db);
  return {
    db: withStoreDefaults(db),
    path: "Penyimpanan browser ini — terpisah dari CSV aplikasi desktop",
  };
}
export async function persist(db: DB): Promise<DB> {
  validateDB(db);
  db = withStoreDefaults(db);
  if (desktop)
    return invoke<DB>("save_store", { db, expectedRevision: db.revision });
  const current = localStorage.getItem(key);
  if (current && JSON.parse(current).revision !== db.revision)
    throw new Error(
      "Data berubah di tab lain. Muat ulang sebelum melanjutkan.",
    );
  const saved = { ...db, revision: db.revision + 1 };
  localStorage.setItem(key, JSON.stringify(saved));
  return saved;
}
export async function backup(db: DB) {
  if (desktop) {
    const path = await open({
      directory: true,
      title: "Pilih folder untuk backup",
    });
    if (!path) return false;
    await invoke("backup_store", { destination: path });
  } else
    download(
      `backup-toko-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(db, null, 2),
      "application/json",
    );
  return true;
}
export async function restore(current: DB): Promise<DB | null> {
  if (desktop) {
    const path = await open({
      directory: true,
      title: "Pilih folder backup toko (berisi manifest.json)",
    });
    if (!path) return null;
    const candidate = await invoke<DB>("read_backup", { source: path });
    validateDB(candidate);
    const db = {
      ...withStoreDefaults(candidate),
      revision: current.revision,
    };
    audit(db, "Pulihkan backup", "store");
    return invoke<DB>("restore_store", {
      db,
      expectedRevision: current.revision,
    });
  }
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.oncancel = () => resolve(null);
    input.onchange = async () => {
      try {
        const file = input.files?.[0];
        if (!file) return resolve(null);
        const db = JSON.parse(await file.text());
        validateDB(db);
        db.revision = current.revision;
        audit(db, "Pulihkan backup", "store");
        resolve(await persist(db));
      } catch (e) {
        reject(e);
      }
    };
    input.click();
  });
}
export function download(
  name: string,
  content: string,
  type = "text/csv;charset=utf-8",
) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function exportCSV(
  name: string,
  headers: string[],
  rows: (string | number)[][],
) {
  download(name, csvText(headers, rows));
}
export async function printDocument() {
  if (desktop) await invoke("print_document");
  else window.print();
}
