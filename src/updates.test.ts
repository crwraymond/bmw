import { describe, it, expect } from "vitest";
import {
  installSafely,
  updateError,
  type UpdatePackage,
  type UpdatePhase,
} from "./updates";
function fixture(fail = "") {
  const calls: string[] = [],
    phases: UpdatePhase[] = [],
    percentages: (number | null)[] = [],
    paths: string[] = [];
  const update: UpdatePackage = {
    version: "0.3.0",
    close: async () => {},
    download: async (event) => {
      calls.push("download");
      if (fail === "signature") throw new Error("Invalid signature");
      event({ event: "Started", data: { contentLength: 20 } });
      event({ event: "Progress", data: { chunkLength: 10 } });
      event({ event: "Finished" });
    },
    install: async () => {
      calls.push("install");
    },
  };
  const backup = async (revision: number) => {
    calls.push(`backup:${revision}`);
    if (fail === "backup") throw new Error("Backup failed");
    return "backups/verified";
  };
  return {
    calls,
    phases,
    percentages,
    paths,
    run: () =>
      installSafely(
        update,
        { backup },
        17,
        (v) => phases.push(v),
        (v) => percentages.push(v),
        (v) => paths.push(v),
      ),
  };
}
describe("safe app updates", () => {
  it("requires verified backup before download and install and reports progress", async () => {
    const f = fixture();
    await f.run();
    expect(f.calls).toEqual(["backup:17", "download", "install"]);
    expect(f.phases).toEqual([
      "backing-up",
      "downloading",
      "installing",
      "installed",
    ]);
    expect(f.paths).toEqual(["backups/verified"]);
    expect(f.percentages).toEqual([null, 0, 50, 100]);
  });
  it("never downloads or installs when the backup fails", async () => {
    const f = fixture("backup");
    await expect(f.run()).rejects.toThrow("Backup failed");
    expect(f.calls).toEqual(["backup:17"]);
  });
  it("never installs a payload when signature verification fails", async () => {
    const f = fixture("signature");
    await expect(f.run()).rejects.toThrow("Invalid signature");
    expect(f.calls).toEqual(["backup:17", "download"]);
  });
  it("explains unavailable private releases without claiming there is no update", () => {
    expect(updateError("404 Not Found")).toContain("repo BMW sudah public");
    expect(updateError("Invalid signature")).toContain("Invalid signature");
  });
});
