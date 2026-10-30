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
fn check_store_access(app: tauri::AppHandle, lock: tauri::State<StoreLock>) -> Result<(), String> {
    gate(&app, &lock)
}
#[tauri::command]
fn backup_snapshot(
    app: tauri::AppHandle,
    lock: tauri::State<StoreLock>,
    db: serde_json::Value,
    destination: Option<String>,
) -> Result<String, String> {
    let _guard = lock.0.lock().map_err(|e| e.to_string())?;
    gate(&app, &lock)?;
    let path = match destination {
        Some(path) => std::path::PathBuf::from(path),
        None => app
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .join("backups")
            .join("before-sync"),
    };
    store::backup_snapshot(&db, &path)
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
fn update_info(app: tauri::AppHandle) -> serde_json::Value {
    let configured = app
        .config()
        .plugins
        .0
        .get("updater")
        .and_then(|v| v.get("pubkey"))
        .and_then(|v| v.as_str())
        .is_some_and(|key| !key.trim().is_empty());
    serde_json::json!({
        "version": app.package_info().version.to_string(),
        "configured": configured,
        "supported": cfg!(any(target_os = "windows", target_os = "android"))
    })
}
#[tauri::command]
fn prepare_update(
    app: tauri::AppHandle,
    lock: tauri::State<StoreLock>,
    expected_revision: u64,
) -> Result<String, String> {
    let _guard = lock.0.lock().map_err(|e| e.to_string())?;
    gate(&app, &lock)?;
    let data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    store::prepare_update(
        &data.join("store"),
        &data.join("backups").join("before-update"),
        expected_revision,
    )
}
#[cfg(desktop)]
#[tauri::command]
fn print_document(window: tauri::WebviewWindow) -> Result<(), String> {
    window.print().map_err(|e| e.to_string())
}
#[cfg(target_os = "android")]
struct AndroidPrint(tauri::plugin::PluginHandle<tauri::Wry>);
#[cfg(target_os = "android")]
#[tauri::command]
async fn print_document(app: tauri::AppHandle) -> Result<(), String> {
    app.state::<AndroidPrint>()
        .0
        .run_mobile_plugin_async::<()>("print", ())
        .await
        .map_err(|e| e.to_string())
}
#[cfg(target_os = "android")]
struct AndroidUpdate(tauri::plugin::PluginHandle<tauri::Wry>);
#[cfg(target_os = "android")]
async fn run_android_update(
    app: tauri::AppHandle,
    command: &str,
) -> Result<serde_json::Value, String> {
    app.state::<AndroidUpdate>()
        .0
        .run_mobile_plugin_async(command, ())
        .await
        .map_err(|e| e.to_string())
}
#[tauri::command]
async fn android_update_check(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    #[cfg(target_os = "android")]
    {
        return run_android_update(app, "check").await;
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Err("Update Android hanya tersedia di Android".into())
    }
}
#[tauri::command]
async fn android_update_download(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    #[cfg(target_os = "android")]
    {
        return run_android_update(app, "download").await;
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Err("Update Android hanya tersedia di Android".into())
    }
}
#[tauri::command]
async fn android_update_install(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    #[cfg(target_os = "android")]
    {
        return run_android_update(app, "install").await;
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Err("Update Android hanya tersedia di Android".into())
    }
}
#[tauri::command]
async fn android_update_close(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    #[cfg(target_os = "android")]
    {
        return run_android_update(app, "close").await;
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Err("Update Android hanya tersedia di Android".into())
    }
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_updater::Builder::new().build());
    #[cfg(target_os = "android")]
    let builder = builder.plugin(
        tauri::plugin::Builder::<tauri::Wry, ()>::new("android-print")
            .setup(|app, api| {
                let handle = api.register_android_plugin("local.tokooffline.app", "PrintPlugin")?;
                app.manage(AndroidPrint(handle));
                Ok(())
            })
            .build(),
    );
    #[cfg(target_os = "android")]
    let builder = builder.plugin(
        tauri::plugin::Builder::<tauri::Wry, ()>::new("android-update")
            .setup(|app, api| {
                let handle =
                    api.register_android_plugin("local.tokooffline.app", "UpdatePlugin")?;
                app.manage(AndroidUpdate(handle));
                Ok(())
            })
            .build(),
    );
    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(StoreLock(Mutex::new(()), Mutex::new(false)))
        .invoke_handler(tauri::generate_handler![
            unlock_store,
            lock_store,
            set_password,
            check_store_access,
            backup_snapshot,
            load_store,
            save_store,
            backup_store,
            read_backup,
            restore_store,
            print_document,
            update_info,
            android_update_check,
            android_update_download,
            android_update_install,
            android_update_close,
            prepare_update
        ])
        .run(tauri::generate_context!())
        .expect("Tidak dapat membuka Toko Offline");
}
