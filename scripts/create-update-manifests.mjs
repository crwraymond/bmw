import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { androidVersionCode } from "./prepare-release.mjs";
export function createManifests(directory, version, repo = "crwraymond/bmw") {
  if (!/^\d+\.\d+\.\d+$/.test(version) || !/^[\w-]+\/[\w.-]+$/.test(repo))
    throw new Error("Invalid release identity");
  const files = readdirSync(directory);
  const exe = files.filter((f) => f.endsWith("-setup.exe"));
  const apk = files.filter((f) => f === `Toko-Offline-${version}-arm64.apk`);
  if (exe.length !== 1 || apk.length !== 1 || !files.includes(`${exe[0]}.sig`))
    throw new Error("Both signed platform packages are required");
  const signature = readFileSync(
    resolve(directory, `${exe[0]}.sig`),
    "utf8",
  ).trim();
  if (
    !signature ||
    !Buffer.from(signature, "base64").toString().includes("untrusted comment:")
  )
    throw new Error("Invalid Tauri signature");
  // GitHub rewrites spaces and other special characters in uploaded names.
  // Rename the signed installer and its signature together before publishing
  // so local verification and manifest URLs use the exact remote asset names.
  const installer = `Toko-Offline-${version}-x64-setup.exe`;
  if (exe[0] !== installer) {
    if (
      [installer, installer + ".sig"].some((name) =>
        existsSync(resolve(directory, name)),
      )
    )
      throw new Error("Canonical Windows release filename already exists");
    renameSync(resolve(directory, exe[0]), resolve(directory, installer));
    renameSync(
      resolve(directory, exe[0] + ".sig"),
      resolve(directory, installer + ".sig"),
    );
  }
  const base = `https://github.com/${repo}/releases/download/v${version}/`;
  const notes =
    "Pembaruan aplikasi toko. Data dan pengaturan perangkat dipertahankan.";
  const pub_date = new Date().toISOString();
  const windows = {
    version,
    notes,
    pub_date,
    platforms: {
      "windows-x86_64": { signature, url: base + installer },
    },
  };
  const android = {
    version,
    versionCode: androidVersionCode(version),
    notes,
    pub_date,
    packageId: "local.tokooffline.app",
    abi: "arm64-v8a",
    url: base + apk[0],
    size: statSync(resolve(directory, apk[0])).size,
    sha256: createHash("sha256")
      .update(readFileSync(resolve(directory, apk[0])))
      .digest("hex"),
  };
  for (const [name, manifest] of [
    ["latest.json", windows],
    ["android-latest.json", android],
  ])
    writeFileSync(
      resolve(directory, name),
      JSON.stringify(manifest, null, 2) + "\n",
    );
  return { windows, android };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === new URL(import.meta.url).pathname
)
  createManifests(
    process.argv[2],
    process.argv[3],
    process.env.GITHUB_REPOSITORY,
  );
