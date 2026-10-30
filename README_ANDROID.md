# Android APK privat

APK rilis: `release/android/Mitra-Ecobike-0.2.0-arm64.apk`.
Android 7.0 atau lebih baru, prosesor ARM64. Kirim APK langsung ke perangkat toko dan izinkan pemasangan dari aplikasi pengirim jika Android memintanya.

## Data desktop dan HP

1. Pada desktop yang memiliki CSV operasional, buka **Pengaturan → Sumber data**, lalu **Sync ke database & gunakan**. Tunggu sampai berhasil.
2. Pada HP, buka **Pengaturan → Sumber data → Muat data Supabase**. Semua installer privat ini memakai toko yang sama tanpa login.
3. Mode Supabase memerlukan internet. Mode CSV menyimpan data terpisah di perangkat; peralihan kembali ke Supabase memeriksa konflik sebelum mengunggah perubahan.
4. Tombol **Backup ke CSV** pada Android membuka pemilih lokasi penyimpanan. Pilih lokasi lalu simpan. Hasilnya satu CSV snapshot lengkap, yang dapat dipulihkan di aplikasi. Backup desktop tetap mendukung folder CSV.

APK memuat konfigurasi akses toko dari `.env.local`. Bagikan hanya kepada pengguna toko ini. Jangan unggah APK atau konfigurasi privat ke repositori publik.

## Update lewat GitHub

APK privat terbaru menyimpan konfigurasi akses pada perangkat dan menyediakan **Pengaturan → Cek update**. Pasang APK ini manual satu kali jika versi lama belum memiliki tombol update. Selanjutnya paket public dari workflow GitHub mempertahankan konfigurasi dan data perangkat, tanpa membundel capability toko. Lihat [UPDATE_RELEASES.md](UPDATE_RELEASES.md).

## Build berikutnya

Prasyarat: Node/npm, Rust stable dengan target `aarch64-linux-android`, JDK 21, Android SDK platform/build-tools 36, NDK 27.1.12297006. Atur `JAVA_HOME`, `ANDROID_HOME`, dan `NDK_HOME`. Jalankan `npm ci`, lalu `npm run android:build` dari root proyek. Build mencakup aset React lokal; aplikasi tidak memerlukan hosting frontend.

Project Android tersimpan di `src-tauri/gen/android`. Jangan menjalankan init ulang karena MainActivity memiliki penyesuaian area aman layar dan plugin cetak native. `.cargo/config.toml` mengatur alignment pustaka ARM64 untuk perangkat dengan halaman memori 16 KB.

Build menghasilkan APK unsigned di `src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk`. Nama folder universal berasal dari Tauri; build ini hanya memuat ARM64.

Kunci rilis lokal ada di `.android-signing/toko-offline-release.p12`, alias `tokooffline`; password berada di `.android-signing/keystore-password.txt`. Keduanya diabaikan Git dan perlu dibackup secara privat. Gunakan kunci yang sama untuk setiap pembaruan agar data instalasi lama tetap dipertahankan.

```sh
"$ANDROID_HOME/build-tools/36.0.0/zipalign" -P 16 -f 4 \
  src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk \
  /tmp/toko-android-aligned.apk
mkdir -p release/android
"$ANDROID_HOME/build-tools/36.0.0/apksigner" sign \
  --ks .android-signing/toko-offline-release.p12 --ks-key-alias tokooffline \
  --ks-pass file:.android-signing/keystore-password.txt \
  --out release/android/Mitra-Ecobike-0.2.0-arm64.apk /tmp/toko-android-aligned.apk
"$ANDROID_HOME/build-tools/36.0.0/apksigner" verify --verbose release/android/Mitra-Ecobike-0.2.0-arm64.apk
"$ANDROID_HOME/build-tools/36.0.0/zipalign" -c -P 16 4 release/android/Mitra-Ecobike-0.2.0-arm64.apk
```

Naikkan versi aplikasi sebelum mendistribusikan pembaruan berikutnya. Cetak invoice memakai dialog cetak Android (termasuk Simpan sebagai PDF); printer yang tersedia mengikuti layanan cetak di HP.
