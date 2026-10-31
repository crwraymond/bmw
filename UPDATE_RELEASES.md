# Build dan update Windows + Android lewat GitHub

Push ke `main` menjalankan **Build desktop and Android** (`.github/workflows/windows.yml`). File workflow lama dipertahankan agar penghitung versinya tidak kembali ke awal. Job Android memanggil workflow reusable `.github/workflows/android.yml`; job Windows dan Android berjalan paralel dengan versi yang sama.

## Alur rilis

1. Validasi versi, jalankan tes, lalu build Windows x64 dan Android ARM64.
2. Windows ditandatangani dengan key updater Tauri yang sudah ada. Android memakai keystore yang sama dengan APK awal; jangan membuat key pengganti.
3. Setelah kedua job berhasil, kumpulkan installer, APK, dan signature. Buat `latest.json` untuk Windows dan `android-latest.json` untuk Android.
4. Unggah semua aset ke draft `v<versi>`, periksa kelengkapannya, lalu publikasikan rilis. Salah satu build gagal: rilis baru tidak diumumkan.
5. Aplikasi memeriksa hasil rilis, bukan status workflow. Windows memakai `/releases/latest/download/latest.json`; Android memakai `/releases/latest/download/android-latest.json` pada repo `crwraymond/bmw`.

Pengaturan menyediakan **Cek update → Pasang update → Backup & pasang** pada Windows dan Android. Pemeriksaan otomatis saat membuka aplikasi hanya memberi pemberitahuan. Backup dan pemeriksaan revisi harus selesai sebelum mengunduh. Kegagalan backup atau verifikasi menghentikan pemasangan.

Pada Android, aplikasi memeriksa ukuran/SHA-256 unduhan, package ID, versi yang lebih baru, serta sertifikat penandatangan yang sama dengan aplikasi terpasang. Android kemudian menampilkan dialog pemasangan APK. Jika diminta mengaktifkan izin pemasangan, aktifkan untuk Toko Offline, kembali ke aplikasi, lalu tekan Pasang update lagi. Android tidak dipasang diam-diam. Data aplikasi tetap memakai identifier `local.tokooffline.app`.

## Konfigurasi Actions secrets

Windows memakai `TAURI_SIGNING_PRIVATE_KEY` dan `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` yang sudah tersedia di repo.

Android memerlukan:

- `ANDROID_KEYSTORE_BASE64`: base64 file lokal `.android-signing/toko-offline-release.p12`.
- `ANDROID_KEYSTORE_PASSWORD`: isi `.android-signing/keystore-password.txt`.

Kedua signing secrets Android sudah dikonfigurasi dengan izin eksplisit pemilik kunci dan diverifikasi melalui metadata GitHub. Nilainya hanya menjadi Actions secrets, tidak dicetak pada log, tidak masuk source, tidak masuk release asset. File sementara pada runner dihapus pada langkah `always()`. Jangan mengganti kunci Android: perangkat menolak update dengan sertifikat yang berbeda.

## Installer awal privat, update public

Repo/rilis GitHub dapat public. Workflow selalu membangun dengan `VITE_TOKO_ACCESS_KEY` kosong dan **tidak pernah menerima capability database toko**. Artifacts pada repo public juga jangan dianggap sebagai tempat penyimpanan rahasia.

Installer awal untuk perangkat toko dibuat dan dikirim secara privat dari konfigurasi lokal. Saat koneksi toko diperiksa/dipakai, installer menyimpan capability pada penyimpanan aplikasi perangkat, terpisah dari aset frontend. Update public mengambil kembali pengaturan tersebut. Pemasangan baru dari paket public tanpa pengaturan perangkat dapat menggunakan CSV lokal. Tombol database membuka penghubungan sekali dengan kode/file koneksi dari pemilik toko; kode diverifikasi sebelum disimpan. Setelah itu perangkat dapat membaca database yang sama.

APK awal yang belum mendukung penyimpanan konfigurasi akses dan updater Android perlu diganti manual satu kali dengan APK privat terbaru. Pertahankan data aplikasi saat memasang; jangan uninstall atau hapus storage. Perangkat Windows yang belum pernah dikonfigurasi juga dapat mengimpor file koneksi privat melalui Sumber data. Desktop melakukan sync CSV dahulu, kemudian HP memilih Gunakan database toko. Backup CSV tidak menyertakan capability perangkat.

## Versi dan validasi

Versi dasar `0.2.0` + workflow run 42 menjadi `0.2.42`, dan Android versionCode 2042. Versi disamakan pada package, lockfile, Cargo, Tauri, dan konfigurasi Android. Jangan menghapus/membuat ulang workflow atau menurunkan versi dasar. Minor/patch Android dibatasi di bawah 1000 agar versionCode tidak bertabrakan. Jika mendekati batas, sesuaikan skema versi/counter secara eksplisit dan pastikan lebih tinggi daripada versi yang telah didistribusikan.

Validasi lokal:

```sh
npm test
node --test scripts/release.test.mjs scripts/update-manifests.test.mjs
npm run test:e2e
npm run android:build
```

Transport unduhan Android juga diuji terhadap simulasi Postman lokal. Jalankan simulasi `postman/simulations/updates/updates.sim.yaml` pada port 4520, kompilasi `UpdateTransport.java` dan `scripts/UpdateTransportCheck.java`, lalu jalankan checker dengan base URL `http://127.0.0.1:4520/github`. Kasus meliputi rilis tidak tersedia, unduhan valid, hash salah, ukuran berlebih, file terpotong, dan HTTP 500. Simulasi tidak memublikasikan rilis GitHub.

Workflow belum dijalankan sampai perubahan ini dipush ke `main` atau workflow yang sudah ada di remote menerima perubahan. Uji dua versi pada perangkat Windows/Android tetap diperlukan untuk membuktikan pemasangan lengkap dari rilis GitHub yang sebenarnya.
