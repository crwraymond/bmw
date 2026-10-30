import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createManifests } from "./create-update-manifests.mjs";
test("release waits for both packages and maps each platform to its own signed artifact", () => {
  const root = mkdtempSync(join(tmpdir(), "toko-manifest-"));
  try {
    const version = "0.2.42";
    writeFileSync(join(root, "Toko-Offline_0.2.42_x64-setup.exe"), "installer");
    writeFileSync(
      join(root, "Toko-Offline_0.2.42_x64-setup.exe.sig"),
      Buffer.from("untrusted comment: test signature").toString("base64"),
    );
    assert.throws(() => createManifests(root, version), /Both signed/);
    writeFileSync(
      join(root, `Toko-Offline-${version}-arm64.apk`),
      "test APK bytes",
    );
    const { windows, android } = createManifests(root, version);
    assert.equal(windows.version, android.version);
    assert.match(windows.platforms["windows-x86_64"].url, /-setup.exe$/);
    assert.equal(android.versionCode, 2042);
    assert.match(android.url, /\/v0.2.42\/Toko-Offline-0.2.42-arm64.apk$/);
    assert.match(android.sha256, /^[0-9a-f]{64}$/);
    assert.equal(android.size, 14);
    assert.throws(() => createManifests(root, "../bad"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
