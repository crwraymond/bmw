use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier, password_hash::SaltString};
use rand_core::OsRng;
use std::{fs, path::Path};
pub fn configured(path: &Path) -> bool {
    path.exists()
}
pub fn verify(path: &Path, password: &str) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }
    let raw = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let hash = PasswordHash::new(&raw).map_err(|e| e.to_string())?;
    Argon2::default()
        .verify_password(password.as_bytes(), &hash)
        .map_err(|_| "Password salah".to_string())
}
pub fn set(path: &Path, current: &str, new_password: &str) -> Result<(), String> {
    verify(path, current)?;
    if new_password.is_empty() {
        if path.exists() {
            fs::remove_file(path).map_err(|e| e.to_string())?;
        }
        return Ok(());
    }
    if new_password.len() < 8 {
        return Err("Password baru minimal 8 karakter".into());
    }
    let salt = SaltString::generate(&mut OsRng);
    let hash = Argon2::default()
        .hash_password(new_password.as_bytes(), &salt)
        .map_err(|e| e.to_string())?
        .to_string();
    fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    let pending = path.with_extension("pending");
    fs::write(&pending, hash).map_err(|e| e.to_string())?;
    fs::rename(pending, path).map_err(|e| e.to_string())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn password_lifecycle() {
        let p = std::env::temp_dir().join(format!("toko-auth-{}", std::process::id()));
        let _ = fs::remove_file(&p);
        set(&p, "", "password-uji-123").unwrap();
        assert!(configured(&p));
        assert!(verify(&p, "salah").is_err());
        assert!(verify(&p, "password-uji-123").is_ok());
        assert!(!fs::read_to_string(&p).unwrap().contains("password-uji-123"));
        assert!(set(&p, "salah", "pengganti-123").is_err());
        set(&p, "password-uji-123", "").unwrap();
        assert!(!configured(&p));
    }
}
