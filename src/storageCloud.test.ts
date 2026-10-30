import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyDB } from "./types";
import { snapshotCSV, readSnapshotCSV } from "./backupCSV";
import { canonicalSnapshot, sameSnapshot } from "./cloud";
const remote = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn() }));
vi.mock("./cloud", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./cloud")>();
  return {
    ...actual,
    sharedStoreId: "00000000-0000-4000-8000-000000000001",
    readRemote: remote.read,
    writeRemote: remote.write,
  };
});
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => false,
  invoke: vi.fn(),
}));
class MemoryStorage {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}
const storageKey = "toko-storage-v1",
  dataKey = "toko-offline-preview-v1";
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubGlobal("localStorage", new MemoryStorage());
  vi.stubGlobal("document", { createElement: () => ({ click: vi.fn() }) });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:backup");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});
describe("full CSV backup", () => {
  it("preserves the definite conflict code for retry and local editing", async () => {
    const { cloudError } = await import("./cloud");
    expect(
      cloudError({ message: "REVISION_CONFLICT", code: "PT409" }),
    ).toMatchObject({ code: "PT409" });
  });
  it("preserves profile, audit, leading zeroes and multiline fields", () => {
    const db = emptyDB();
    db.revision = 7;
    db.settings[0].account = "001230";
    db.settings[0].warranty = 'Satu; "dua"\nTiga';
    db.audit = [
      {
        id: "a",
        time: "2026-10-30T12:00:00Z",
        action: "Uji",
        entity: "store",
        detail: "",
      },
    ];
    expect(readSnapshotCSV(snapshotCSV(db))).toEqual(db);
    expect(() =>
      readSnapshotCSV("Tabel;Data JSON\nschema;1\nschema;1"),
    ).toThrow();
  });
  it("compares equivalent timestamps and row order but detects changed money", () => {
    const db = emptyDB();
    db.audit = [
      {
        id: "a",
        time: "2026-10-30T12:00:00.000Z",
        action: "Uji",
        entity: "store",
        detail: "",
      },
    ];
    const copy = structuredClone(db);
    copy.audit[0].time = "2026-10-30T19:00:00+07:00";
    copy.revision = 99;
    expect(sameSnapshot(db, copy)).toBe(true);
    copy.settings[0].account = "1";
    expect(sameSnapshot(db, copy)).toBe(false);
  });
});
describe("persistent storage switching", () => {
  it("only activates cloud after a verified migration and remembers it across reloads", async () => {
    const s = await import("./storage");
    const local = await s.load();
    localStorage.setItem(dataKey, JSON.stringify(local.db));
    remote.read.mockResolvedValue(null);
    remote.write.mockImplementation(async (db, req) => ({
      store_id: req.storeId,
      db: { ...db, revision: 1 },
    }));
    await s.syncToCloud(local.db);
    expect(s.storageState().mode).toBe("supabase");
    remote.read.mockResolvedValue({
      store_id: s.storageState().storeId,
      db: { ...local.db, revision: 1 },
    });
    expect((await s.load()).db.revision).toBe(1);
    expect(JSON.parse(localStorage.getItem(dataKey)!).revision).toBe(0);
  });
  it("keeps CSV and retries the same write ID after an ambiguous failure", async () => {
    const s = await import("./storage");
    const local = await s.load();
    localStorage.setItem(dataKey, JSON.stringify(local.db));
    remote.read.mockResolvedValue(null);
    remote.write.mockRejectedValueOnce(new Error("timeout"));
    await expect(s.syncToCloud(local.db)).rejects.toThrow("timeout");
    expect(s.storageState().mode).toBe("csv");
    const pending = s.storageState().pending!;
    await expect(s.persist(local.db)).rejects.toThrow("Selesaikan");
    remote.write.mockImplementation(async (db, req) => ({
      store_id: req.storeId,
      db: { ...db, revision: 1 },
    }));
    await s.syncToCloud(local.db);
    expect(remote.write.mock.calls[1][1].writeId).toBe(pending.writeId);
  });
  it("uploads offline changes against their cloud base and stops on a conflict", async () => {
    const s = await import("./storage");
    const db = emptyDB();
    localStorage.setItem(dataKey, JSON.stringify(db));
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        mode: "csv",
        binding: "x",
        storeId: "shop",
        csvBaseRevision: 4,
      }),
    );
    const loaded = await s.load();
    const { CloudRequestError } = await import("./cloud");
    remote.write.mockRejectedValue(
      new CloudRequestError("REVISION_CONFLICT", "PT409"),
    );
    await expect(s.syncToCloud(loaded.db)).rejects.toThrow("REVISION_CONFLICT");
    expect(remote.write.mock.calls[0][1].expectedRevision).toBe(4);
    expect(s.storageState().mode).toBe("csv");
    expect(s.storageState().pending).toBeUndefined();
    expect(JSON.parse(localStorage.getItem(dataKey)!)).toEqual(db);
    await expect(s.persist(loaded.db)).resolves.toMatchObject({ revision: 1 });
  });
  it("does not upload a second device's CSV over an existing database", async () => {
    const s = await import("./storage");
    const local = await s.load();
    remote.read.mockResolvedValue({ store_id: "existing", db: local.db });
    await expect(s.syncToCloud(local.db)).rejects.toThrow("sudah memiliki");
    expect(remote.write).not.toHaveBeenCalled();
    expect(s.storageState().mode).toBe("csv");
  });
  it("can explicitly open saved CSV offline and retains its original cloud base", async () => {
    const s = await import("./storage");
    const db = emptyDB();
    localStorage.setItem(dataKey, JSON.stringify(db));
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        mode: "supabase",
        binding: "cloud",
        storeId: "shop",
        csvBaseRevision: 2,
      }),
    );
    expect((await s.useLocalCSV(true)).db).toEqual((await s.loadLocal()).db);
    expect(remote.read).not.toHaveBeenCalled();
    expect(s.storageState().csvBaseRevision).toBe(2);
    expect(s.storageState().mode).toBe("csv");
  });
  it("refuses a stale window after another tab changes storage selection", async () => {
    const s = await import("./storage");
    const { db } = await s.load();
    localStorage.setItem(
      storageKey,
      JSON.stringify({ mode: "csv", binding: "other" }),
    );
    await expect(s.persist(db)).rejects.toThrow("tab lain");
  });
  it("does not switch if local data changed during the upload", async () => {
    const s = await import("./storage");
    const { db } = await s.load();
    remote.read.mockResolvedValue(null);
    remote.write.mockImplementation(async (value, req) => {
      localStorage.setItem(dataKey, JSON.stringify({ ...value, revision: 2 }));
      return { store_id: req.storeId, db: { ...value, revision: 1 } };
    });
    await expect(s.syncToCloud(db)).rejects.toThrow("CSV berubah selama");
    expect(s.storageState().mode).toBe("csv");
    expect(s.storageState().csvBaseRevision).toBe(1);
    expect(canonicalSnapshot(JSON.parse(localStorage.getItem(dataKey)!))).toBe(
      canonicalSnapshot(db),
    );
  });
});
