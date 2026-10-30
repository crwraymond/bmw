use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs::{self, File},
    io::Write,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
const TABLES: [&str; 8] = [
    "items",
    "parties",
    "documents",
    "lines",
    "payments",
    "allocations",
    "audit",
    "settings",
];
#[derive(Serialize, Deserialize)]
struct TableMeta {
    headers: Vec<String>,
    types: BTreeMap<String, String>,
    sha256: String,
    rows: usize,
}
#[derive(Serialize, Deserialize)]
struct Manifest {
    schema: u64,
    revision: u64,
    tables: BTreeMap<String, TableMeta>,
}
fn stamp() -> String {
    static COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    format!(
        "{}-{}-{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos(),
        std::process::id(),
        COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
    )
}
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
fn write_sync(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let mut f = File::create(path).map_err(err)?;
    f.write_all(bytes).map_err(err)?;
    f.sync_all().map_err(err)
}
fn sync_dir(path: &Path) -> Result<(), String> {
    #[cfg(unix)]
    {
        File::open(path).map_err(err)?.sync_all().map_err(err)?;
    }
    Ok(())
}
fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn blank() -> Value {
    json!({"schema":1,"revision":0,"items":[],"parties":[],"documents":[],"lines":[],"payments":[],"allocations":[],"audit":[],"settings":[{"id":"store","name":"Toko Offline","address":"","phone":"","bank":"","beneficiary":"","account":"","bankBranch":"","bankCode":"","country":"Indonesia","warranty":"","terms":"Pembayaran sesuai kesepakatan.","signature":"","logo":"","partnerLogo":""}]})
}
pub fn validate(db: &Value) -> Result<(), String> {
    if db["schema"].as_u64() != Some(1) || db["revision"].as_u64().is_none() {
        return Err("Versi data tidak didukung".into());
    }
    for name in TABLES {
        let rows = db[name]
            .as_array()
            .ok_or(format!("Tabel {name} tidak valid"))?;
        let mut ids = BTreeSet::new();
        for row in rows {
            let obj = row.as_object().ok_or("Baris CSV harus berupa objek")?;
            let id = row["id"]
                .as_str()
                .filter(|s| !s.is_empty())
                .ok_or("ID baris kosong")?;
            if !ids.insert(id) {
                return Err(format!("ID ganda pada {name}"));
            }
            for v in obj.values() {
                if v.is_array() || v.is_object() || v.is_null() {
                    return Err("Sel CSV harus teks, angka, atau boolean".into());
                }
            }
        }
    }
    if db["settings"].as_array().map(|r| r.len()) != Some(1) {
        return Err("Profil toko tidak valid".into());
    }
    let ids = |name: &str| -> BTreeSet<String> {
        db[name]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|r| r["id"].as_str().map(String::from))
            .collect()
    };
    let items = ids("items");
    let docs = ids("documents");
    let parties = ids("parties");
    let payments = ids("payments");
    for l in db["lines"].as_array().unwrap() {
        if !items.contains(l["itemId"].as_str().unwrap_or(""))
            || !docs.contains(l["docId"].as_str().unwrap_or(""))
        {
            return Err("Relasi baris tidak valid".into());
        }
    }
    for d in db["documents"].as_array().unwrap() {
        if !parties.contains(d["partyId"].as_str().unwrap_or("")) {
            return Err("Relasi pihak tidak valid".into());
        }
    }
    for p in db["payments"].as_array().unwrap() {
        if !parties.contains(p["partyId"].as_str().unwrap_or("")) {
            return Err("Relasi pembayaran tidak valid".into());
        }
    }
    for a in db["allocations"].as_array().unwrap() {
        if !payments.contains(a["paymentId"].as_str().unwrap_or(""))
            || !docs.contains(a["docId"].as_str().unwrap_or(""))
        {
            return Err("Relasi alokasi tidak valid".into());
        }
    }
    Ok(())
}
fn write_generation(path: &Path, db: &Value) -> Result<(), String> {
    validate(db)?;
    fs::create_dir_all(path).map_err(err)?;
    let mut manifest = Manifest {
        schema: 1,
        revision: db["revision"].as_u64().unwrap(),
        tables: BTreeMap::new(),
    };
    for name in TABLES {
        let rows = db[name].as_array().unwrap();
        let headers: Vec<String> = rows
            .iter()
            .flat_map(|r| r.as_object().unwrap().keys().cloned())
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect();
        let mut types = BTreeMap::new();
        for h in &headers {
            let kind = rows
                .iter()
                .filter_map(|r| r.get(h))
                .map(|v| {
                    if v.is_string() {
                        "string"
                    } else if v.is_boolean() {
                        "bool"
                    } else {
                        "number"
                    }
                })
                .collect::<BTreeSet<_>>();
            if kind.len() != 1 {
                return Err(format!("Tipe kolom {name}.{h} tidak konsisten"));
            }
            types.insert(h.clone(), kind.into_iter().next().unwrap().to_string());
        }
        let mut writer = csv::Writer::from_writer(Vec::new());
        if !headers.is_empty() {
            writer.write_record(&headers).map_err(err)?;
            for row in rows {
                let cells = headers
                    .iter()
                    .map(|h| {
                        let v = &row[h];
                        if let Some(s) = v.as_str() {
                            s.to_string()
                        } else {
                            v.to_string()
                        }
                    })
                    .collect::<Vec<_>>();
                writer.write_record(cells).map_err(err)?;
            }
        }
        let bytes = writer.into_inner().map_err(err)?;
        write_sync(&path.join(format!("{name}.csv")), &bytes)?;
        manifest.tables.insert(
            name.to_string(),
            TableMeta {
                headers,
                types,
                sha256: digest(&bytes),
                rows: rows.len(),
            },
        );
    }
    write_sync(
        &path.join("manifest.pending"),
        &serde_json::to_vec_pretty(&manifest).map_err(err)?,
    )?;
    fs::rename(path.join("manifest.pending"), path.join("manifest.json")).map_err(err)?;
    sync_dir(path)
}
pub fn read_generation(path: &Path) -> Result<Value, String> {
    let manifest: Manifest =
        serde_json::from_slice(&fs::read(path.join("manifest.json")).map_err(err)?).map_err(err)?;
    if manifest.schema != 1 || manifest.tables.len() != TABLES.len() {
        return Err("Skema backup tidak didukung".into());
    }
    let mut db = json!({"schema":1,"revision":manifest.revision});
    for name in TABLES {
        let meta = manifest
            .tables
            .get(name)
            .ok_or(format!("Tabel {name} hilang"))?;
        let bytes = fs::read(path.join(format!("{name}.csv"))).map_err(err)?;
        if digest(&bytes) != meta.sha256 {
            return Err(format!(
                "Checksum {name}.csv berbeda. Data mungkin rusak; pulihkan backup."
            ));
        }
        let mut rows = Vec::new();
        if !bytes.is_empty() {
            let mut reader = csv::Reader::from_reader(bytes.as_slice());
            if reader.headers().map_err(err)?.iter().collect::<Vec<_>>()
                != meta.headers.iter().map(String::as_str).collect::<Vec<_>>()
            {
                return Err("Header CSV tidak sesuai manifest".into());
            }
            for record in reader.records() {
                let record = record.map_err(err)?;
                let mut row = serde_json::Map::new();
                for (h, cell) in meta.headers.iter().zip(record.iter()) {
                    let value = match meta.types.get(h).map(String::as_str) {
                        Some("string") => Value::String(cell.to_string()),
                        Some("number") | Some("bool") => serde_json::from_str(cell).map_err(err)?,
                        _ => return Err("Tipe kolom CSV tidak dikenal".into()),
                    };
                    row.insert(h.clone(), value);
                }
                rows.push(Value::Object(row));
            }
        }
        if rows.len() != meta.rows {
            return Err("Jumlah baris CSV berbeda".into());
        }
        db[name] = Value::Array(rows);
    }
    validate(&db)?;
    Ok(db)
}
fn latest(root: &Path) -> Result<Option<PathBuf>, String> {
    if !root.exists() {
        return Ok(None);
    }
    let mut generations = Vec::new();
    for entry in fs::read_dir(root).map_err(err)? {
        let entry = entry.map_err(err)?;
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with("g-") && entry.path().is_dir() {
            generations.push(entry.path());
        }
    }
    generations.sort();
    Ok(generations.pop())
}
pub fn load(root: &Path) -> Result<Value, String> {
    if let Some(path) = latest(root)? {
        return read_generation(&path);
    }
    if root.join("STORE.json").exists() {
        return Err(
            "Data sebelumnya tidak ditemukan. Pulihkan backup; data tidak direset otomatis.".into(),
        );
    }
    fs::create_dir_all(root).map_err(err)?;
    let db = blank();
    commit_generation(root, &db)?;
    write_sync(&root.join("STORE.json"), b"{\"schema\":1}")?;
    sync_dir(root)?;
    Ok(db)
}
fn commit_generation(root: &Path, db: &Value) -> Result<(), String> {
    let suffix = stamp();
    let pending = root.join(format!(".pending-{suffix}"));
    write_generation(&pending, db)?;
    let final_path = root.join(format!(
        "g-{:020}-{suffix}",
        db["revision"].as_u64().unwrap()
    ));
    fs::rename(pending, final_path).map_err(err)?;
    sync_dir(root)?;
    let mut generations = fs::read_dir(root)
        .map_err(err)?
        .filter_map(Result::ok)
        .map(|e| e.path())
        .filter(|p| p.is_dir() && p.file_name().unwrap().to_string_lossy().starts_with("g-"))
        .collect::<Vec<_>>();
    generations.sort();
    let remove = generations.len().saturating_sub(50);
    for old in generations.into_iter().take(remove) {
        let _ = fs::remove_dir_all(old);
    }
    Ok(())
}
pub fn save(root: &Path, mut db: Value, expected: u64) -> Result<Value, String> {
    let current = load(root)?;
    if current["revision"].as_u64() != Some(expected) {
        return Err("Data telah berubah. Muat ulang aplikasi sebelum menyimpan.".into());
    }
    validate(&db)?;
    db["revision"] = json!(expected.checked_add(1).ok_or("Revisi melebihi batas")?);
    commit_generation(root, &db)?;
    Ok(db)
}
pub fn backup(root: &Path, destination: &Path) -> Result<String, String> {
    let db = load(root)?;
    fs::create_dir_all(destination).map_err(err)?;
    let path = destination.join(format!("toko-backup-{}-{}", db["revision"], stamp()));
    write_generation(&path, &db)?;
    Ok(path.to_string_lossy().to_string())
}
// Export an explicit snapshot (including Supabase data) as a verified CSV backup.
pub fn backup_snapshot(db: &Value, destination: &Path) -> Result<String, String> {
    validate(db)?;
    fs::create_dir_all(destination).map_err(err)?;
    let pending = destination.join(format!(".pending-backup-{}", stamp()));
    write_generation(&pending, db)?;
    if read_generation(&pending)? != *db {
        return Err("Verifikasi backup CSV gagal".into());
    }
    let path = destination.join(format!("toko-backup-{}-{}", db["revision"], stamp()));
    fs::rename(&pending, &path).map_err(err)?;
    sync_dir(destination)?;
    Ok(path.to_string_lossy().to_string())
}
// Refuse stale/corrupt snapshots. Installation requires a verified backup.
pub fn prepare_update(root: &Path, backup_root: &Path, expected: u64) -> Result<String, String> {
    let current = load(root)?;
    if current["revision"].as_u64() != Some(expected) {
        return Err("Data telah berubah. Muat ulang sebelum memasang update.".into());
    }
    let destination = backup(root, backup_root)?;
    if read_generation(Path::new(&destination))? != current {
        return Err("Verifikasi backup gagal. Update tidak boleh dipasang.".into());
    }
    Ok(destination)
}
#[cfg(test)]
mod tests {
    use super::*;
    fn root() -> PathBuf {
        std::env::temp_dir().join(format!("toko-store-test-{}", stamp()))
    }
    #[test]
    fn supplied_snapshot_backup_does_not_export_stale_local_data() {
        let p = root();
        let mut db = load(&p).unwrap();
        db["settings"][0]["name"] = json!("Snapshot Supabase terbaru");
        db["revision"] = json!(42);
        let path = backup_snapshot(&db, &p.join("exports")).unwrap();
        assert_eq!(read_generation(Path::new(&path)).unwrap(), db);
        assert_ne!(load(&p).unwrap()["settings"][0]["name"], db["settings"][0]["name"]);
        fs::remove_dir_all(p).unwrap();
    }
    #[test]
    fn roundtrip_and_conflict() {
        let p = root();
        let mut db = load(&p).unwrap();
        db["settings"][0]["name"] = json!("Toko, \"Jaya\"\nIndonesia");
        db["settings"][0]["account"] = json!("0012300");
        let db = save(&p, db, 0).unwrap();
        assert_eq!(load(&p).unwrap(), db);
        assert!(save(&p, db, 0).is_err());
        fs::remove_dir_all(p).unwrap();
    }
    #[test]
    fn interrupted_commit_and_corruption() {
        let p = root();
        load(&p).unwrap();
        fs::create_dir_all(p.join(".pending-interrupted")).unwrap();
        assert!(load(&p).is_ok());
        let latest = latest(&p).unwrap().unwrap();
        write_sync(&latest.join("items.csv"), b"broken").unwrap();
        assert!(load(&p).unwrap_err().contains("Checksum"));
        fs::remove_dir_all(p).unwrap();
    }
    #[test]
    fn update_backup_preserves_data_and_blocks_stale_or_corrupt_store() {
        let p = root();
        let dest = root();
        let mut db = load(&p).unwrap();
        db["settings"][0]["name"] = json!("Toko pengguna");
        db["settings"][0]["account"] = json!("0012300");
        let saved = save(&p, db, 0).unwrap();
        assert!(prepare_update(&p, &dest, 0).is_err());
        assert!(!dest.exists());
        let copy = prepare_update(&p, &dest, 1).unwrap();
        assert_eq!(read_generation(Path::new(&copy)).unwrap(), saved);
        assert_eq!(load(&p).unwrap(), saved);
        let latest = latest(&p).unwrap().unwrap();
        write_sync(&latest.join("settings.csv"), b"corrupt").unwrap();
        assert!(prepare_update(&p, &dest, 1).is_err());
        fs::remove_dir_all(p).unwrap();
        fs::remove_dir_all(dest).unwrap();
    }
    #[test]
    fn backup_restores_exact_snapshot() {
        let p = root();
        let dest = root();
        let db = load(&p).unwrap();
        let backup = backup(&p, &dest).unwrap();
        assert_eq!(read_generation(Path::new(&backup)).unwrap(), db);
        fs::remove_dir_all(p).unwrap();
        fs::remove_dir_all(dest).unwrap();
    }
}

pub fn restore(
    root: &Path,
    mut db: Value,
    expected: u64,
    backup_root: &Path,
) -> Result<Value, String> {
    validate(&db)?;
    match load(root) {
        Ok(_) => {
            backup(root, backup_root)?;
            save(root, db, expected)
        }
        Err(_) => {
            let revision = latest(root)?
                .and_then(|p| p.file_name().map(|s| s.to_string_lossy().to_string()))
                .and_then(|s| s.split('-').nth(1).and_then(|n| n.parse::<u64>().ok()))
                .unwrap_or(expected);
            db["revision"] = json!(revision.checked_add(1).ok_or("Revisi melebihi batas")?);
            fs::create_dir_all(root).map_err(err)?;
            commit_generation(root, &db)?;
            write_sync(&root.join("STORE.json"), b"{\"schema\":1}")?;
            Ok(db)
        }
    }
}

#[cfg(test)]
mod recovery_tests {
    use super::*;
    #[test]
    fn recovery_keeps_corrupt_generation_and_publishes_valid_backup() {
        let root = std::env::temp_dir().join(format!("toko-recover-{}", stamp()));
        let backups = std::env::temp_dir().join(format!("toko-recover-backup-{}", stamp()));
        let db = load(&root).unwrap();
        let bad = latest(&root).unwrap().unwrap();
        write_sync(&bad.join("settings.csv"), b"corrupt").unwrap();
        assert!(load(&root).is_err());
        let restored = restore(&root, db, 0, &backups).unwrap();
        assert_eq!(restored["revision"], json!(1));
        assert_eq!(load(&root).unwrap(), restored);
        assert!(bad.exists());
        fs::remove_dir_all(root).unwrap();
    }
}
