# Update aplikasi Windows

Pengguna aplikasi membuka **Pengaturan → Cek update → Pasang update → Backup & pasang**. Pengecekan otomatis saat startup hanya memberi tahu versi baru; pemasangan tidak dijalankan diam-diam saat form sedang dikerjakan.

## Persiapan satu kali

- Kunci publik updater sudah dipasang pada `src-tauri/tauri.conf.json`. Jangan menggantinya setelah installer dibagikan tanpa rencana rotasi kunci.
- Pasangan kunci privat terenkripsi dan password disimpan di folder lokal `~/Documents/bmw-update-signing/`, di luar source repository, dengan akses dibatasi pada pengguna perangkat. Buat salinan aman folder ini; kehilangan kunci mencegah penandatanganan update bagi installer yang sudah dibagikan. Jangan commit atau mengunggahnya sebagai release asset.
- Tambahkan dua **Repository Actions secrets** pada repo BMW: `TAURI_SIGNING_PRIVATE_KEY` berisi isi `update.key`, dan `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` berisi isi `password.txt`. Ini adalah secret untuk CI, bukan nilai konfigurasi di installer. Kedua secret sudah dikonfigurasi dengan izin eksplisit pengguna dan diverifikasi melalui metadata namanya; nilai secret tidak ditampilkan.
- Pengguna memilih mengubah repo BMW menjadi **public secara manual** saat penerima mengakses rilis. Pastikan tidak ada data toko, backup, atau secret dalam history/aset repo sebelum mengubah visibility. Source repo juga ikut terlihat jika repo dibuat public. Aplikasi tidak mengubah visibility dan tidak menyimpan token GitHub.
- Installer lama tanpa updater memerlukan pemasangan manual satu kali dari installer yang sudah memuat updater. Setelah itu penerima cukup memakai tombol update.

## Setiap update berikutnya

1. Push perubahan ke `main` atau jalankan workflow **Build Windows installer** secara manual.
2. Workflow menambah nomor versi berdasarkan nomor run, menjalankan tes, serta membangun installer yang ditandatangani dengan key yang sama.
3. Draft rilis berisi installer `*-setup.exe`, signature `.sig`, dan manifest `latest.json`. Workflow memublikasikan rilis setelah semua aset lengkap. Build gagal tidak mengumumkan rilis setengah jadi.
4. Buat repo public secara manual sebelum meminta penerima mengecek dan mengunduh update. Repo harus tetap dapat diakses sampai unduhan selesai; jika dikembalikan menjadi private, pengecekan/unduhan berikutnya gagal dan dapat dicoba kembali.
5. Di aplikasi penerima, simpan form yang sedang dikerjakan lalu buka Pengaturan. Klik Cek update, kemudian Pasang update. Setelah konfirmasi, data tersimpan dibackup dan diverifikasi. Aplikasi Windows ditutup oleh updater, installer berjalan dengan progress, lalu aplikasi dibuka kembali.

Versi dasar pada source adalah `0.2.0`; workflow run 42 menghasilkan `0.2.42`. Rilis yang tidak lebih baru tidak ditawarkan sebagai update. Jangan menurunkan versi dasar atau menghapus/membuat ulang workflow sehingga nomor run mundur tanpa menaikkan versi dasar.

## Perlindungan data

Identifier `local.tokooffline.app` dan direktori data aplikasi dipertahankan. Installer mengganti program, bukan menginisialisasi ulang CSV toko. Sebelum pemasangan, Rust menolak revisi data usang dan membaca ulang snapshot backup untuk memastikan isinya identik. Backup berada pada folder data aplikasi di `backups/before-update/toko-backup-...`; lokasinya juga ditampilkan pada panel update. Jangan menghapus folder data aplikasi atau memilih penghapusan data saat uninstall.

Kegagalan backup menghentikan proses sebelum unduhan; kegagalan unduhan/verifikasi signature menghentikan proses sebelum pemasangan. Data rusak ditampilkan sebagai error, tidak direset diam-diam. Backup menyertakan profil dan audit data operasional. Hash password perangkat terpisah dari backup CSV dan tidak diubah oleh update.

## Validasi sebelum distribusi luas

Tes otomatis memeriksa urutan backup → download → install, penolakan ketika backup/signature gagal, pesan repo private, serta snapshot CSV yang tetap utuh. Lakukan uji dua versi pada Windows: isi data pada versi pertama, pasang versi berikutnya lewat tombol update, lalu cek barang, transaksi, pembayaran, pengaturan, dan password. Build/instalasi Windows aktual tidak dijalankan dari macOS pada pengerjaan fitur ini.

Mekanisme signature dan updater mengikuti [dokumentasi resmi Tauri](https://v2.tauri.app/plugin/updater/).
