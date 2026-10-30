import { invoke } from "@tauri-apps/api/core";
import { android } from "./platform";
import { check, type DownloadEvent } from "@tauri-apps/plugin-updater";
export interface UpdateInfo {
  version: string;
  configured: boolean;
  supported: boolean;
}
export interface UpdatePackage {
  version: string;
  body?: string;
  download: (onEvent: (event: DownloadEvent) => void) => Promise<void>;
  install: () => Promise<void>;
  close: () => Promise<void>;
  systemConfirmation?: boolean;
}
export interface UpdateRuntime {
  info: () => Promise<UpdateInfo>;
  check: () => Promise<UpdatePackage | null>;
  backup: (revision: number) => Promise<string>;
}
export const updateRuntime: UpdateRuntime = {
  info: () => invoke("update_info"),
  check: async () => {
    if (!android) return check({ timeout: 20_000 });
    const { checkAndroidUpdate } = await import("./androidUpdates");
    return checkAndroidUpdate();
  },
  backup: (expectedRevision) => invoke("prepare_update", { expectedRevision }),
};
export type UpdatePhase =
  | "idle"
  | "checking"
  | "available"
  | "current"
  | "error"
  | "backing-up"
  | "downloading"
  | "installing"
  | "installed"
  | "awaiting-install";
export const installingUpdate = (phase: UpdatePhase) =>
  ["backing-up", "downloading", "installing"].includes(phase);
export const updateError = (error: unknown) => {
  const text = String(error instanceof Error ? error.message : error);
  if (/404|403|release|valid release|fetch/i.test(text))
    return "Rilis update belum dapat diakses. Pastikan internet tersambung dan rilis GitHub untuk perangkat ini sudah tersedia, lalu coba lagi.";
  return `Update belum bisa dilanjutkan: ${text}`;
};
export async function installSafely(
  update: UpdatePackage,
  runtime: Pick<UpdateRuntime, "backup">,
  revision: number,
  onPhase: (phase: UpdatePhase) => void,
  onProgress: (value: number | null) => void,
  onBackup: (path: string) => void,
) {
  onPhase("backing-up");
  const path = await runtime.backup(revision);
  onBackup(path);
  onPhase("downloading");
  onProgress(null);
  let received = 0,
    total = 0;
  await update.download((event) => {
    if (event.event === "Started") total = event.data.contentLength || 0;
    if (event.event === "Progress") received += event.data.chunkLength;
    if (event.event === "Finished") onProgress(100);
    else if (total)
      onProgress(Math.min(100, Math.round((received / total) * 100)));
  });
  onPhase("installing");
  // The plugin verifies the signature while downloading and refuses invalid
  // payloads. Windows closes/relaunches the app only after installation starts.
  await update.install();
  onPhase(update.systemConfirmation ? "awaiting-install" : "installed");
}
