import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { releaseVersion, prepareRelease } from "./prepare-release.mjs";
test("each workflow run has an increasing Windows-compatible version", () => {
  assert.equal(releaseVersion("0.2.0", "41"), "0.2.41");
  assert.equal(releaseVersion("0.2.10", "42"), "0.2.52");
  for (const value of ["", "0", "-1", "1.2", "65536"])
    assert.throws(() => releaseVersion("0.2.0", value));
});
test("release preparation updates every version and enables signed artifacts without changing store identity", () => {
  const root = mkdtempSync(resolve(tmpdir(), "bmw-release-test-"));
  try {
    mkdirSync(resolve(root, "src-tauri"));
    for (const file of [
      "package.json",
      "package-lock.json",
      "src-tauri/tauri.conf.json",
      "src-tauri/Cargo.toml",
      "src-tauri/Cargo.lock",
    ])
      writeFileSync(
        resolve(root, file),
        readFileSync(new URL(`../${file}`, import.meta.url)),
      );
    const before = JSON.parse(
      readFileSync(resolve(root, "src-tauri/tauri.conf.json")),
    );
    const version = prepareRelease(root, "99");
    const pkg = JSON.parse(readFileSync(resolve(root, "package.json"))),
      lock = JSON.parse(readFileSync(resolve(root, "package-lock.json"))),
      after = JSON.parse(
        readFileSync(resolve(root, "src-tauri/tauri.conf.json")),
      );
    assert.equal(pkg.version, version);
    assert.equal(lock.packages[""].version, version);
    assert.equal(after.version, version);
    assert.equal(after.identifier, before.identifier);
    assert.deepEqual(after.plugins, before.plugins);
    assert.equal(after.bundle.createUpdaterArtifacts, true);
    assert.match(
      readFileSync(resolve(root, "src-tauri/Cargo.toml"), "utf8"),
      new RegExp(`version = "${version}"`),
    );
    assert.match(
      readFileSync(resolve(root, "src-tauri/Cargo.lock"), "utf8"),
      new RegExp(`name = "toko-offline"\nversion = "${version}"`),
    );
    after.plugins.updater.pubkey = "";
    writeFileSync(
      resolve(root, "src-tauri/tauri.conf.json"),
      JSON.stringify(after),
    );
    assert.throws(() => prepareRelease(root, "100"), /public key/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
