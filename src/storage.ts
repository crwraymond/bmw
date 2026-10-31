import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { type DB, emptyDB } from "./types";
import { validateDB, audit, withStoreDefaults } from "./domain";
import { csvText } from "./csv";
import { snapshotCSV, readSnapshotCSV } from "./backupCSV";
import {
  canonicalSnapshot,
  CloudRequestError,
  sharedStoreId,
  readRemote,
  writeRemote,
  type CloudWrite,
} from "./cloud";
import { native, android, desktop } from "./platform";
export { native, android, desktop } from "./platform";
const key = "toko-offline-preview-v1";
export async function loadLocal(): Promise<{ db: DB; path: string }> {
  if (native) {
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
async function persistLocal(db: DB): Promise<DB> {
  validateDB(db);
  db = withStoreDefaults(db);
  if (native)
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
// Export the supplied snapshot, including cloud data, rather than stale local CSV.
async function backupSnapshot(db: DB, automatic = false) {
  validateDB(db);
  if (android && !automatic) {
    const { saveAndroidText } = await import("./mobileFiles");
    return saveAndroidText(
      `backup-toko-${new Date().toISOString().slice(0, 10)}.csv`,
      snapshotCSV(db),
    );
  }
  if (native) {
    const destination = automatic
      ? null
      : await open({ directory: true, title: "Pilih folder untuk backup CSV" });
    if (!automatic && !destination) return false;
    await invoke("backup_snapshot", { db, destination });
  } else {
    download(
      `backup-toko-${new Date().toISOString().slice(0, 10)}.csv`,
      snapshotCSV(db),
    );
  }
  return true;
}
export async function backup(db: DB) {
  assertStorageBinding();
  if (storageState().mode === "supabase") {
    const remote = await readRemote(storageState().storeId);
    if (!remote) throw new Error("Data Supabase belum tersedia.");
    db = remote.db;
  }
  return backupSnapshot(db);
}
export async function restore(current: DB): Promise<DB | null> {
  if (android) {
    const { readAndroidBackup } = await import("./mobileFiles");
    const content = await readAndroidBackup();
    if (content === null) return null;
    const candidate = content.trimStart().startsWith("{")
      ? JSON.parse(content)
      : readSnapshotCSV(content);
    validateDB(candidate);
    const db = { ...withStoreDefaults(candidate), revision: current.revision };
    audit(db, "Pulihkan backup", "store");
    if (storageState().mode === "supabase") {
      if (!(await backup(current))) return null;
      return persist(db);
    }
    return invoke<DB>("restore_store", {
      db,
      expectedRevision: current.revision,
    });
  }
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
    if (storageState().mode === "supabase") {
      if (!(await backup(current))) return null;
      return persist(db);
    }
    return invoke<DB>("restore_store", {
      db,
      expectedRevision: current.revision,
    });
  }
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,.csv";
    input.oncancel = () => resolve(null);
    input.onchange = async () => {
      try {
        const file = input.files?.[0];
        if (!file) return resolve(null);
        const content = await file.text();
        const db = file.name.toLowerCase().endsWith(".csv")
          ? readSnapshotCSV(content)
          : JSON.parse(content);
        validateDB(db);
        db.revision = current.revision;
        audit(db, "Pulihkan backup", "store");
        if (storageState().mode === "supabase" && !(await backup(current)))
          return resolve(null);
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
  if (android) {
    void import("./mobileFiles").then(({ downloadAndroidText }) =>
      downloadAndroidText(name, content),
    );
    return;
  }
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
  if (native) await invoke("print_document");
  else window.print();
}

export type StorageState = {
  mode: "csv" | "supabase";
  storeId?: string;
  csvBaseRevision?: number;
  binding: string;
  pending?: CloudWrite & { fingerprint: string };
};
const storageKey = "toko-storage-v1";
let activeBinding: string | undefined;
export function storageState(): StorageState {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return { mode: "csv", binding: "initial" };
  const value = JSON.parse(raw) as StorageState;
  if (
    !["csv", "supabase"].includes(value.mode) ||
    typeof value.binding !== "string" ||
    (value.mode === "supabase" && !value.storeId)
  )
    throw new Error("Pengaturan penyimpanan rusak. Data tidak direset.");
  return value;
}
function setStorageState(state: StorageState) {
  localStorage.setItem(storageKey, JSON.stringify(state));
}
function activateStorage(state: StorageState) {
  const next = { ...state, binding: crypto.randomUUID() };
  setStorageState(next);
  activeBinding = next.binding;
}
function assertStorageBinding() {
  if (activeBinding !== undefined && storageState().binding !== activeBinding)
    throw new Error(
      "Pilihan penyimpanan berubah di tab lain. Muat ulang sebelum melanjutkan.",
    );
}
function cloudResult(remote: { store_id: string; db: DB }) {
  return { db: remote.db, path: `Supabase · ${remote.store_id}` };
}
export async function load(): Promise<{ db: DB; path: string }> {
  const state = storageState();
  if (state.mode === "csv") {
    const result = await loadLocal();
    activeBinding = state.binding;
    return result;
  }
  if (native) await invoke("check_store_access");
  const remote = await readRemote(state.storeId);
  if (!remote) throw new Error("Data toko Supabase tidak ditemukan.");
  activeBinding = state.binding;
  return cloudResult(remote);
}
export async function persist(db: DB): Promise<DB> {
  assertStorageBinding();
  const state = storageState();
  if (state.mode === "csv") {
    if (state.pending)
      throw new Error(
        "Selesaikan percobaan sync sebelumnya sebelum mengubah CSV. Klik Sync ke database lagi atau Gunakan database toko.",
      );
    return persistLocal(db);
  }
  const result = await writeRemote(withStoreDefaults(db), {
    storeId: state.storeId!,
    expectedRevision: db.revision,
    writeId: crypto.randomUUID(),
    create: false,
  });
  return result.db;
}
// A snapshot is uploaded atomically. Persistent mode changes only after the
// server returns the verified data; failed/ambiguous uploads keep CSV active.
export async function syncToCloud(db: DB) {
  assertStorageBinding();
  const state = storageState();
  if (state.mode !== "csv") throw new Error("Supabase sudah aktif.");
  const current = await loadLocal();
  if (
    current.db.revision !== db.revision ||
    canonicalSnapshot(current.db) !== canonicalSnapshot(db)
  )
    throw new Error("CSV berubah. Muat ulang sebelum melakukan sync.");
  db = withStoreDefaults(db);
  validateDB(db);
  const fingerprint = canonicalSnapshot(db);
  let request = state.pending;
  if (request && request.fingerprint !== fingerprint)
    throw new Error(
      "Data lokal berbeda dari percobaan sync sebelumnya. Simpan backup dan periksa data Supabase terlebih dahulu.",
    );
  if (!request) {
    if (!(await backupSnapshot(db, true)))
      throw new Error("Backup awal gagal.");
    if (!state.storeId) {
      const existing = await readRemote();
      if (existing)
        throw new Error(
          "Toko ini sudah memiliki data Supabase. Gunakan Gunakan database toko untuk menghubungkan perangkat; CSV tidak ditimpa.",
        );
    } else if (state.csvBaseRevision === undefined) {
      throw new Error(
        "Asal revisi CSV belum diketahui. Gunakan database toko atau gunakan backup yang sesuai; unggahan dihentikan.",
      );
    }
    request = {
      storeId: state.storeId || sharedStoreId,
      expectedRevision: state.csvBaseRevision ?? 0,
      writeId: crypto.randomUUID(),
      create: !state.storeId,
      fingerprint,
    };
    setStorageState({ ...state, pending: request });
  }
  let remote;
  try {
    remote = await writeRemote(db, request);
  } catch (error) {
    if (error instanceof CloudRequestError && error.code && error.code !== "") {
      setStorageState({ ...state, pending: undefined });
    }
    throw error;
  }
  assertStorageBinding();
  const latest = await loadLocal();
  if (
    latest.db.revision !== db.revision ||
    canonicalSnapshot(latest.db) !== fingerprint
  ) {
    setStorageState({
      ...state,
      storeId: remote.store_id,
      csvBaseRevision: remote.db.revision,
      pending: undefined,
    });
    throw new Error(
      "CSV berubah selama unggahan. Database sudah menerima snapshot sebelumnya, tetapi aplikasi tetap memakai CSV. Muat ulang lalu lakukan sync lagi untuk mengunggah perubahan terbaru.",
    );
  }
  activateStorage({
    mode: "supabase",
    storeId: remote.store_id,
    csvBaseRevision: remote.db.revision,
    binding: state.binding,
  });
  return cloudResult(remote);
}
// Connecting another device never uploads or overwrites its local data.
export async function connectCloud() {
  assertStorageBinding();
  const state = storageState();
  const remote = await readRemote(state.storeId);
  if (!remote)
    throw new Error(
      "Database toko ini belum memiliki data. Gunakan Sync ke database dari perangkat yang memiliki data CSV.",
    );
  if (state.mode === "csv") {
    const local = await loadLocal();
    await backupSnapshot(local.db, true);
  }
  assertStorageBinding();
  activateStorage({
    ...state,
    mode: "supabase",
    storeId: remote.store_id,
    pending: undefined,
  });
  return cloudResult(remote);
}
export async function useLocalCSV(savedOnly = false) {
  assertStorageBinding();
  const state = storageState();
  const local = await loadLocal();
  if (state.mode === "csv") return local;
  let result = local;
  let base = state.csvBaseRevision;
  if (!savedOnly) {
    const remote = await readRemote(state.storeId);
    if (!remote) throw new Error("Data Supabase tidak ditemukan.");
    const copy = { ...remote.db, revision: local.db.revision };
    if (native) {
      result = {
        ...local,
        db: await invoke<DB>("restore_store", {
          db: copy,
          expectedRevision: local.db.revision,
        }),
      };
    } else {
      await backupSnapshot(local.db, true);
      result = { ...local, db: await persistLocal(copy) };
    }
    base = remote.db.revision;
  }
  assertStorageBinding();
  activateStorage({
    ...state,
    mode: "csv",
    csvBaseRevision: base,
    pending: undefined,
  });
  return result;
}
