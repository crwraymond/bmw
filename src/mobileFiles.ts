import { open, save, message } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
export async function saveAndroidText(name: string, content: string) {
  const path = await save({
    defaultPath: name,
    filters: [{ name: "CSV", extensions: ["csv"] }],
  });
  if (!path) return false;
  await writeTextFile(path, content);
  return true;
}
export async function readAndroidBackup() {
  const path = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "Backup toko", extensions: ["csv", "json"] }],
  });
  if (!path || typeof path !== "string") return null;
  return readTextFile(path);
}
export function downloadAndroidText(name: string, content: string) {
  void saveAndroidText(name, content).catch((error) =>
    message(`File belum dapat disimpan: ${String(error)}`, {
      title: "Simpan CSV",
      kind: "error",
    }),
  );
}
