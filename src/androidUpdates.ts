import { invoke } from "@tauri-apps/api/core";
import type { UpdatePackage } from "./updates";
export async function checkAndroidUpdate(): Promise<UpdatePackage | null> {
  const next = await invoke<{ version: string; body?: string } | null>(
    "android_update_check",
  );
  if (!next) return null;
  return {
    ...next,
    systemConfirmation: true,
    close: () => invoke("android_update_close"),
    download: async (event) => {
      event({ event: "Started", data: {} });
      await invoke("android_update_download");
      event({ event: "Finished" });
    },
    install: () => invoke("android_update_install"),
  };
}
