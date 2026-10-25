# Toko Offline

Aplikasi desktop toko berbasis React, Vite, TypeScript, dan Tauri, dengan CSV lokal. Target distribusi pengguna adalah **Windows x64**. Halaman awal adalah dashboard penjualan, laba kotor, dan transaksi.

## Lihat hasil di browser

Di Terminal macOS:

```sh
cd ~/Documents/toko-offline
npm ci
npm run dev
```

Di PowerShell Windows, setelah source disalin/di-clone ke folder tersebut:

```powershell
cd "$HOME\Documents\toko-offline"
npm ci
npm run dev
```

Buka alamat yang dicetak Vite (default `http://localhost:1420`). Jika port sedang dipakai server pratinjau yang sudah berjalan, cukup buka alamat tersebut.

**Mode browser adalah pratinjau:** data tersimpan di localStorage browser itu dan terpisah dari data desktop. Backup browser berupa JSON. Data pengujian otomatis selalu berada pada konteks browser terisolasi; aplikasi tidak mengisi data contoh ke toko pengguna.

## Jalankan aplikasi desktop untuk pengembangan

Siapkan Node.js 24, Rust stable, dan [prasyarat Tauri Windows](https://v2.tauri.app/start/prerequisites/), termasuk Microsoft C++ Build Tools dengan workload Desktop development with C++ dan WebView2.

```sh
npm ci
npm run tauri:dev
```

Pengguna akhir cukup memasang installer dan membuka aplikasi. Mereka tidak perlu Node, npm, Rust, atau terminal.

## Build Windows lewat GitHub Actions

Workflow `.github/workflows/windows.yml` otomatis berjalan setelah push ke `main` dan juga bisa dijalankan manual:

1. Buka tab **Actions** pada repository.
2. Pilih **Build Windows installer** → **Run workflow**.
3. Setelah berhasil, unduh artifact **toko-offline-windows-x64**.
4. Ekstrak dan jalankan file `*-setup.exe` di Windows x64.

Workflow memeriksa aturan bisnis, build frontend, dan pengujian CSV/password pada runner Windows sebelum membuat installer NSIS. Konfigurasi `src-tauri/tauri.windows.conf.json` menyertakan installer WebView2 offline agar pemasangan runtime tidak memerlukan internet. Build di CI tetap memerlukan internet untuk mengunduh dependency dan runtime. Installer belum memakai sertifikat code signing.

Untuk build dari PC Windows sendiri:

```powershell
.\scripts\build-windows.ps1
```

Hasil installer berada di `src-tauri\target\release\bundle\nsis\`. Build macOS tidak menghasilkan installer Windows; hasil Windows ditentukan oleh workflow tersebut.

## Fitur yang diimplementasikan

- Dashboard dengan filter periode, penjualan bersih, laba kotor, jumlah transaksi, rata-rata nota, tren, produk terlaris, piutang/hutang, dan stok minimum.
- Barang, customer, dan pemasok: tambah, ubah, cari, aktif/nonaktif, stok/saldo awal.
- Order customer/pabrik, pemenuhan sebagian melalui transaksi terkait, dan sisa order.
- Penjualan/pembelian: draf, final, diskon nominal, pencarian, detail, pembatalan dengan alasan.
- Input kode barang langsung mengaktifkan Tambah baris; Enter menambahkan barang dan pengulangan kode menaikkan Qty.
- Pencarian barang/customer/pemasok tersedia langsung di field pilihan.
- Input angka memakai pemisah ribuan Indonesia, koma untuk desimal kuantitas, dan menghapus nol di depan.
- Uang muka penjualan dicatat sekaligus sebagai pembayaran teralokasi.
- Retur penjualan/pembelian yang mengacu transaksi asal, termasuk batas kuantitas dan diskon proporsional.
- Pelunasan parsial/penuh, alokasi per tagihan, serta pembatalan pembayaran.
- Invoice normal, COPY, atau keduanya; logo penerbit/mitra, SN, rekening, garansi, snapshot identitas, pemisahan halaman, serta dialog cetak/PDF sistem.
- Seluruh kategori laporan dari referensi lama, filter kode/kontak/periode, ekspor CSV, dan cetak laporan.
- Profil toko, backup/pemulihan, audit aktivitas, serta kunci password lokal opsional (Argon2).

Detail kebutuhan dan asal referensi: [PROJECT_SPEC.md](PROJECT_SPEC.md). Keputusan implementasi dan batas yang perlu ditinjau pengguna: [IMPLEMENTATION.md](IMPLEMENTATION.md).

## Penyimpanan desktop

Lokasi data terlihat pada Pengaturan. Pada Windows lokasinya menggunakan direktori data aplikasi untuk identifier `local.tokooffline.app`, dengan subfolder `store`.

```text
store/
  STORE.json
  g-00000000000000000001-.../
    items.csv
    parties.csv
    documents.csv
    lines.csv
    payments.csv
    allocations.csv
    audit.csv
    settings.csv
    manifest.json
```

Setiap generasi adalah snapshot lengkap dengan checksum SHA-256 dan metadata tipe kolom. Data baru ditulis ke folder sementara dan dipublikasikan dengan rename setelah semua file selesai. Pembaca hanya memuat generasi yang sudah dipublikasikan. Sebanyak 50 generasi terakhir dipertahankan; file rusak tidak menyebabkan reset diam-diam.

Jangan mengedit CSV operasional saat aplikasi berjalan. Gunakan ekspor laporan untuk membuka salinan di Excel. Backup desktop adalah folder tersendiri berisi CSV dan `manifest.json`; pilih folder itu saat memulihkan. Sebelum pemulihan data yang sehat, backup otomatis dibuat. Saat data aktif rusak, generasi rusak tetap disimpan untuk pemeriksaan dan backup valid dipublikasikan sebagai generasi baru.

Password disimpan sebagai hash di file terpisah. Kunci ini membatasi akses melalui aplikasi dan tidak mengenkripsi CSV. Hash password tidak ikut backup data; pemulihan tidak mengubah password perangkat tujuan.

## Verifikasi

```sh
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml --lib --locked
npx playwright install chromium
npm run test:e2e
```

Pengujian browser menjalankan fixture pada penyimpanan terisolasi dan memeriksa alur order → pembelian → penjualan → invoice → retur → pembayaran → laporan → backup → buka ulang; juga tampilan mobile dan invoice panjang. PDF pengujian tersedia di `test-results/` setelah test berjalan, bukan bagian data operasional.

## Struktur source

```text
src/types.ts          Model data dan format tampilan
src/domain.ts         Aturan transaksi, stok, biaya, saldo, dan metrik
src/inputs.tsx        Pilihan dengan pencarian dan input angka terformat
src/numberFormat.ts   Format angka saat mengetik dan parsing nilai
src/storage.ts        Adapter desktop CSV dan pratinjau browser
src/App.tsx           Navigasi, sesi, commit, dan konfirmasi
src/Dashboard.tsx     Dashboard
src/Masters.tsx       Barang dan kontak
src/Documents.tsx     Order, transaksi, retur, draf, dan detail
src/Payments.tsx      Pelunasan dan alokasi
src/Reports.tsx       Laporan dan ekspor
src/Invoice.tsx       Dokumen cetak normal/COPY dan pemisahan halaman
src/Settings.tsx      Profil toko, backup, dan password
src-tauri/src/        Penyimpanan CSV, autentikasi, dan perintah desktop
```
