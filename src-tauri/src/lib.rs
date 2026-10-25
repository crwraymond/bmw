mod auth;
mod store;
use std::sync::Mutex;
use tauri::Manager;
struct StoreLock(Mutex<()>, Mutex<bool>);
fn security_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("password.hash"))
}
fn gate(app: &tauri::AppHandle, lock: &StoreLock) -> Result<(), String> {
    if auth::configured(&security_path(app)?) && !*lock.1.lock().map_err(|e| e.to_string())? {
        return Err("APP_LOCKED".into());
    }
    Ok(())
}
#[tauri::command]
fn unlock_store(
    app: tauri::AppHandle,
    lock: tauri::State<StoreLock>,
    password: String,
) -> Result<(), String> {
    auth::verify(&security_path(&app)?, &password)?;
    *lock.1.lock().map_err(|e| e.to_string())? = true;
    Ok(())
}
#[tauri::command]
fn lock_store(app: tauri::AppHandle, lock: tauri::State<StoreLock>) -> Result<(), String> {
    if !auth::configured(&security_path(&app)?) {
        return Err("Atur password di Pengaturan sebelum mengunci aplikasi.".into());
    }
    *lock.1.lock().map_err(|e| e.to_string())? = false;
    Ok(())
}
#[tauri::command]
fn set_password(
    app: tauri::AppHandle,
    lock: tauri::State<StoreLock>,
    current: String,
    new_password: String,
) -> Result<(), String> {
    gate(&app, &lock)?;
    auth::set(&security_path(&app)?, &current, &new_password)?;
    *lock.1.lock().map_err(|e| e.to_string())? = true;
    Ok(())
}
#[tauri::command]
fn load_store(
    app: tauri::AppHandle,
    lock: tauri::State<StoreLock>,
) -> Result<serde_json::Value, String> {
    let _guard = lock.0.lock().map_err(|e| e.to_string())?;
    gate(&app, &lock)?;
    let path = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("store");
    let db = store::load(&path)?;
    Ok(serde_json::json!({"db":db,"path":path.to_string_lossy()}))
}
#[tauri::command]
fn save_store(
    app: tauri::AppHandle,
    lock: tauri::State<StoreLock>,
    db: serde_json::Value,
    expected_revision: u64,
) -> Result<serde_json::Value, String> {
    let _guard = lock.0.lock().map_err(|e| e.to_string())?;
    gate(&app, &lock)?;
    let root = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("store");
    store::save(&root, db, expected_revision)
}
#[tauri::command]
fn backup_store(
    app: tauri::AppHandle,
    lock: tauri::State<StoreLock>,
    destination: String,
) -> Result<String, String> {
    let _guard = lock.0.lock().map_err(|e| e.to_string())?;
    gate(&app, &lock)?;
    let root = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("store");
    store::backup(&root, std::path::Path::new(&destination))
}
#[tauri::command]
fn read_backup(source: String) -> Result<serde_json::Value, String> {
    store::read_generation(std::path::Path::new(&source))
}
#[tauri::command]
fn restore_store(
    app: tauri::AppHandle,
    lock: tauri::State<StoreLock>,
    db: serde_json::Value,
    expected_revision: u64,
) -> Result<serde_json::Value, String> {
    let _guard = lock.0.lock().map_err(|e| e.to_string())?;
    gate(&app, &lock)?;
    let root = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("store");
    store::restore(
        &root,
        db,
        expected_revision,
        &app.path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .join("backups"),
    )
}
#[tauri::command]
fn print_document(window: tauri::WebviewWindow) -> Result<(), String> {
    window.print().map_err(|e| e.to_string())
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .manage(StoreLock(Mutex::new(()), Mutex::new(false)))
        .invoke_handler(tauri::generate_handler![
            unlock_store,
            lock_store,
            set_password,
            load_store,
            save_store,
            backup_store,
            read_backup,
            restore_store,
            print_document
        ])
        .run(tauri::generate_context!())
        .expect("Tidak dapat membuka Toko Offline");
}
