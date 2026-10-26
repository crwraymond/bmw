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

Workflow `.github/workflows/windows.yml` otomatis berjalan setelah push ke `main` dan juga bisa dijalankan manual. Setelah signing secrets dikonfigurasi, workflow menghasilkan installer bertanda tangan dan rilis update lengkap:

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

- Dashboard dengan filter periode, penjualan bersih, laba kotor, jumlah transaksi, rata-rata nota, total modal dari nilai stok awal + seluruh pembelian final bersih setelah retur pembelian, tren, produk terlaris, piutang/hutang, dan stok minimum. Penjualan tidak mengurangi total modal; nilai persediaan tersisa tetap tersedia di laporan Modal / laba.
- Tema gelap menjadi bawaan. Tombol matahari/bulan di kanan atas mengganti tema terang/gelap; pilihan disimpan pada perangkat. Invoice dan hasil cetak tetap putih dengan teks/border hitam.
- Barang dan customer: tambah, ubah, cari, aktif/nonaktif, serta hapus dengan konfirmasi jika belum dirujuk data lain. Barang baru mulai dengan stok nol; stok dan modal bertambah melalui pembelian final. Form barang tidak menyediakan isian stok/nilai stok awal. Data stok historis yang sudah ada tetap dipertahankan; saldo awal customer tetap tersedia.
- Pemasok tunggal otomatis: tidak perlu mendaftarkan atau memilih pabrik. Relasi pembelian, retur, dan pelunasan ditangani aplikasi.
- Order customer/pembelian, pemenuhan sebagian melalui transaksi terkait, dan sisa order.
- Penjualan/pembelian: draf, final, edit langsung dengan perhitungan ulang stok/HPP dan audit, diskon produk (% atau Rp/unit), diskon total tambahan, pencarian, detail, pembatalan dengan alasan.
- Input kode barang langsung mengaktifkan Tambah baris; Enter menambahkan barang dan pengulangan kode menaikkan Qty.
- Pencarian barang/customer/pemasok tersedia langsung di field pilihan.
- Input angka memakai pemisah ribuan Indonesia, koma untuk desimal kuantitas, dan menghapus nol di depan.
- Uang muka penjualan dicatat sekaligus sebagai pembayaran teralokasi.
- Retur penjualan/pembelian yang mengacu transaksi asal, termasuk batas kuantitas dan diskon proporsional.
- Pelunasan parsial/penuh, alokasi per tagihan, edit pembayaran, serta pembatalan pembayaran.
- SN dicatat per unit saat Pembelian. Setelah disahkan, SN tersedia untuk dicari/dipilih pada Penjualan; SN yang sudah terjual tidak dapat dipakai lagi sampai diretur. Draf tidak mengunci SN, dan data stok lama tanpa SN tetap didukung. Nomor ikut dicetak pada invoice.
- Tombol hapus tersedia untuk barang, customer, seluruh order/transaksi/retur, dan pembayaran. Konfirmasi wajib; relasi aktif maupun historis tetap diperiksa. Dialog invoice menampilkan pembayaran terkait. Centang **Hapus juga pembayaran khusus dokumen ini** untuk menghapus invoice beserta pembayaran yang seluruh alokasinya hanya ke invoice tersebut. Pembayaran gabungan/saldo awal harus diatur lewat Pelunasan; dokumen turunan dihapus terlebih dahulu, dan mutasi stok dimulai dari yang terakhir untuk barang terkait. Penghapusan memperbarui stok, modal, dan saldo.
- Aplikasi desktop dibuka fullscreen dengan tombol **Keluar** di kanan atas. Konfirmasi keluar mengingatkan perubahan form yang belum disimpan; tombol dinonaktifkan selama penyimpanan.
- Invoice normal, COPY, atau keduanya; proporsi cetak mengikuti referensi lima barang, logo Mitra Ecobike/Phylion bawaan, garansi lengkap, rekening BCA, SN, serta pemisahan halaman dan dialog cetak/PDF sistem.
- Garansi, syarat pembayaran, dan negara memiliki teks bawaan untuk seluruh profil toko, dengan reset per bagian; penandatangan kosong mengikuti nama penerbit. Data khusus dan rekening pengguna tetap dipertahankan.
- Data invoice bawaan bisa diubah melalui Pengaturan; setiap logo mempunyai tombol **Reset ke bawaan** yang mengembalikan potongan logo asli dari contoh. Pratinjau/cetak otomatis memakai **Pengaturan tersimpan**. Pilihan **Profil saat transaksi** menampilkan snapshot lama; **Simpan profil ke dokumen** menyimpan profil terbaru ke snapshot secara eksplisit tanpa mengubah barang, stok, atau pembayaran.
- Seluruh kategori laporan dari referensi lama, filter kode/kontak/periode, ekspor CSV, dan cetak laporan.
- Impor CSV barang, customer, semua transaksi/order/retur, serta pembayaran dan alokasinya: Upsert atau Replace, template, pratinjau, dan validasi atomik. Pengaturan menyediakan ekspor/impor gabungan seluruh data operasional.
- Identitas sidebar mengikuti nama toko; logo Mitra Ecobike tersedia sebagai bawaan dan bisa diganti melalui Pengaturan.
- Profil toko, backup/pemulihan, audit aktivitas, serta kunci password lokal opsional (Argon2).

Detail kebutuhan dan asal referensi: [PROJECT_SPEC.md](PROJECT_SPEC.md). Keputusan implementasi dan batas yang perlu ditinjau pengguna: [IMPLEMENTATION.md](IMPLEMENTATION.md).

## Impor CSV

Tombol **Impor CSV** tersedia pada halaman barang, customer, dokumen, dan pembayaran. **Upsert** menambah/memperbarui kode atau nomor yang sama; **Replace** mengganti jenis data yang disertakan dalam file. Pratinjau perubahan harus diperiksa sebelum diterapkan. Untuk seluruh data operasional sekaligus gunakan **Pengaturan → Ekspor semua data (CSV) / Impor data (CSV)**.

Lihat [IMPORT_CSV.md](IMPORT_CSV.md) untuk format, contoh, aturan relasi, dan perbedaan dengan backup lengkap.

## Update aplikasi Windows

Pengaturan menyediakan **Cek update** dan **Pasang update**. Pengecekan saat aplikasi dibuka aktif secara default dan dapat dimatikan; pemasangan memerlukan konfirmasi. Aplikasi membuat backup CSV yang diverifikasi sebelum mengunduh/memasang paket bertanda tangan. Folder data dan identifier aplikasi tetap sama. Kegagalan backup, konflik revisi, atau tanda tangan menghentikan pemasangan.

Repo BMW harus **public saat penerima mengecek dan mengunduh update**. Saat private, aplikasi menampilkan kegagalan akses dan bisa dicoba lagi setelah repo dibuat public. Tidak ada token GitHub yang ditanam di installer. Visibility repo tidak diubah oleh aplikasi atau workflow.

Installer lama yang belum memuat updater harus diperbarui manual sekali. Panduan signing secrets, rilis, backup, dan uji Windows tersedia pada [UPDATE_WINDOWS.md](UPDATE_WINDOWS.md). Di preview browser, Cek update dan Keluar tetap terlihat dalam keadaan nonaktif; gunakan tab browser untuk keluar.

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
src/revisions.ts      Edit langsung dan perhitungan ulang transaksi secara atomik
src/branding.ts       Aset logo Mitra Ecobike dan Phylion bawaan
src/invoiceDefaults.ts Profil, rekening, dan ketentuan dari referensi invoice
src/inputs.tsx        Pilihan dengan pencarian dan input angka terformat
src/numberFormat.ts   Format angka saat mengetik dan parsing nilai
src/SerialInputs.tsx  Input SN per unit sesuai Qty
src/serials.ts        Pembacaan SN lama dan teks cetak
src/serialInventory.ts Pelacakan ketersediaan SN dan validasi mutasi
src/DesktopActions.tsx Tombol dan konfirmasi keluar desktop
src/storage.ts        Adapter desktop CSV dan pratinjau browser
src/csv.ts            Parser/serializer CSV dan angka Indonesia
src/dataImport.ts     Ekspor lengkap, perencanaan Upsert/Replace dan validasi relasi
src/ImportCSV.tsx     Unggah, pratinjau, template dan penerapan impor
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
