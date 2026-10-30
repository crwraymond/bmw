import { beforeEach, expect, it, vi } from "vitest";
const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke, isTauri: () => false }));
import { checkAndroidUpdate } from "./androidUpdates";
import { installSafely } from "./updates";
beforeEach(() => {
  invoke.mockReset();
});
it("Android distinguishes no newer package from a failed release check", async () => {
  invoke.mockResolvedValueOnce(null);
  await expect(checkAndroidUpdate()).resolves.toBeNull();
  invoke.mockRejectedValueOnce(new Error("HTTP 404"));
  await expect(checkAndroidUpdate()).rejects.toThrow("HTTP 404");
});
it("backs up before native download and waits for the Android installer confirmation", async () => {
  invoke
    .mockResolvedValueOnce({ version: "0.2.42", body: "Update Android" })
    .mockResolvedValue(undefined);
  const update = await checkAndroidUpdate();
  const calls: string[] = [],
    phases: string[] = [];
  invoke.mockImplementation(async (name: string) => {
    calls.push(name);
  });
  await installSafely(
    update!,
    {
      backup: async (revision) => {
        calls.push(`backup:${revision}`);
        return "verified-backup";
      },
    },
    8,
    (phase) => phases.push(phase),
    () => {},
    () => {},
  );
  expect(calls).toEqual([
    "backup:8",
    "android_update_download",
    "android_update_install",
  ]);
  expect(phases.at(-1)).toBe("awaiting-install");
});
it("never opens the installer when APK verification fails", async () => {
  invoke.mockResolvedValueOnce({ version: "0.2.42" });
  const update = await checkAndroidUpdate();
  invoke.mockRejectedValue(new Error("Tanda tangan APK update tidak sesuai"));
  await expect(
    installSafely(
      update!,
      { backup: async () => "backup" },
      1,
      () => {},
      () => {},
      () => {},
    ),
  ).rejects.toThrow("Tanda tangan");
  expect(invoke.mock.calls.map(([command]) => command)).not.toContain(
    "android_update_install",
  );
});
