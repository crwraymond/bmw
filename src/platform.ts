import { isTauri } from "@tauri-apps/api/core";
export const native = isTauri();
export const android =
  native &&
  typeof navigator !== "undefined" &&
  /Android/i.test(navigator.userAgent);
export const desktop = native && !android;
