$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'Jalankan skrip ini di Windows.' }
Set-Location (Join-Path $PSScriptRoot '..')
foreach ($tool in @('node', 'npm', 'cargo')) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "Prasyarat belum tersedia: $tool. Lihat README.md." }
}
npm ci
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm test
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
cargo test --manifest-path src-tauri/Cargo.toml --lib --locked
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run tauri:build -- --bundles nsis
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host 'Installer: src-tauri\target\release\bundle\nsis\'
