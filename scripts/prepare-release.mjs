import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
export function releaseVersion(base, run) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(base);
  const number = Number(run);
  if (!match || !Number.isSafeInteger(number) || number <= 0)
    throw new Error("Invalid release version or workflow run number");
  const parts = match.slice(1).map(Number);
  parts[2] += number;
  if (parts.some((v) => v > 65535))
    throw new Error("Release version exceeds Windows installer limits");
  return parts.join(".");
}
export function androidVersionCode(version) {
  const parts = version.split(".").map(Number);
  if (
    parts.length !== 3 ||
    parts.some((n) => !Number.isSafeInteger(n) || n < 0) ||
    parts[1] > 999 ||
    parts[2] > 999
  )
    throw new Error(
      "Android release requires minor/patch below 1000; raise the base minor version before resetting the workflow counter",
    );
  const code = parts[0] * 1_000_000 + parts[1] * 1000 + parts[2];
  if (code <= 0 || code > 2_100_000_000)
    throw new Error("Android version code exceeds limits");
  return code;
}
export function prepareRelease(root, run) {
  const json = (file) => JSON.parse(readFileSync(resolve(root, file), "utf8"));
  const pkg = json("package.json"),
    lock = json("package-lock.json"),
    config = json("src-tauri/tauri.conf.json");
  if (pkg.version !== config.version)
    throw new Error("Frontend and desktop base versions must match");
  const updater = config.plugins?.updater;
  if (
    !updater?.pubkey ||
    !Buffer.from(updater.pubkey, "base64")
      .toString()
      .includes("untrusted comment:")
  )
    throw new Error("A valid signing public key is required");
  if (
    !updater.endpoints?.length ||
    updater.endpoints.some((url) => !url.startsWith("https://"))
  )
    throw new Error("HTTPS update endpoint is required");
  const version = releaseVersion(pkg.version, run);
  const android = json("src-tauri/tauri.android.conf.json");
  android.bundle.android.versionCode = androidVersionCode(version);
  let cargo = readFileSync(resolve(root, "src-tauri/Cargo.toml"), "utf8");
  let cargoLock = readFileSync(resolve(root, "src-tauri/Cargo.lock"), "utf8");
  const packageVersion = /(\[package\][\s\S]*?\r?\nversion = ")[^"]+("\r?\n)/;
  const lockedVersion =
    /(\[\[package\]\]\r?\nname = "toko-offline"\r?\nversion = ")[^"]+("\r?\n)/;
  if (!packageVersion.test(cargo) || !lockedVersion.test(cargoLock))
    throw new Error("Desktop package version was not found");
  cargo = cargo.replace(packageVersion, `$1${version}$2`);
  cargoLock = cargoLock.replace(lockedVersion, `$1${version}$2`);
  pkg.version = version;
  lock.version = version;
  lock.packages[""].version = version;
  config.version = version;
  config.bundle.createUpdaterArtifacts = true;
  for (const [file, data] of [
    ["package.json", pkg],
    ["package-lock.json", lock],
    ["src-tauri/tauri.conf.json", config],
    ["src-tauri/tauri.android.conf.json", android],
  ])
    writeFileSync(resolve(root, file), JSON.stringify(data, null, 2) + "\n");
  writeFileSync(resolve(root, "src-tauri/Cargo.toml"), cargo);
  writeFileSync(resolve(root, "src-tauri/Cargo.lock"), cargoLock);
  return version;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const version = prepareRelease(process.cwd(), process.env.GITHUB_RUN_NUMBER);
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `version=${version}\ntag=v${version}\n`,
    );
  process.stdout.write(`Prepared desktop and Android release ${version}\n`);
}
