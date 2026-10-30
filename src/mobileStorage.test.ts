import { beforeEach, expect, it, vi } from "vitest";
import { emptyDB } from "./types";
import { readSnapshotCSV } from "./backupCSV";
const io = vi.hoisted(() => ({
  invoke: vi.fn(),
  save: vi.fn(),
  open: vi.fn(),
  write: vi.fn(),
  read: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => true,
  invoke: io.invoke,
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: io.save,
  open: io.open,
  message: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-fs", () => ({
  writeTextFile: io.write,
  readTextFile: io.read,
}));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Linux; Android 16)" });
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
});
it("Android uses the native CSV backend, without desktop window controls", async () => {
  const s = await import("./storage");
  const db = emptyDB();
  io.invoke.mockResolvedValue({
    db,
    path: "/data/user/0/local.tokooffline.app/files/store",
  });
  await s.load();
  expect(s.native).toBe(true);
  expect(s.android).toBe(true);
  expect(s.desktop).toBe(false);
  expect(io.invoke).toHaveBeenCalledWith("load_store");
});
it("Android backup writes a full CSV to the selected content URI", async () => {
  const s = await import("./storage");
  const db = emptyDB();
  db.settings[0].account = "001230";
  io.save.mockResolvedValue("content://documents/backup.csv");
  io.write.mockResolvedValue(undefined);
  await expect(s.backup(db)).resolves.toBe(true);
  expect(io.write).toHaveBeenCalledWith(
    "content://documents/backup.csv",
    expect.any(String),
  );
  expect(readSnapshotCSV(io.write.mock.calls[0][1])).toEqual(db);
  expect(io.open).not.toHaveBeenCalled();
});
it("cancelled Android backup leaves the selected storage mode unchanged", async () => {
  const s = await import("./storage");
  io.save.mockResolvedValue(null);
  await expect(s.backup(emptyDB())).resolves.toBe(false);
  expect(io.write).not.toHaveBeenCalled();
  expect(s.storageState().mode).toBe("csv");
});
it("Android restoration reads the picked URI and restores through native revision checks", async () => {
  const s = await import("./storage");
  const db = emptyDB();
  db.revision = 8;
  const { snapshotCSV } = await import("./backupCSV");
  io.open.mockResolvedValue("content://documents/backup.csv");
  io.read.mockResolvedValue(snapshotCSV(emptyDB()));
  io.invoke.mockImplementation(async (command, args) =>
    command === "restore_store" ? { ...args.db, revision: 9 } : undefined,
  );
  const restored = await s.restore(db);
  expect(io.read).toHaveBeenCalledWith("content://documents/backup.csv");
  expect(io.invoke).toHaveBeenCalledWith(
    "restore_store",
    expect.objectContaining({ expectedRevision: 8 }),
  );
  expect(restored?.revision).toBe(9);
});
