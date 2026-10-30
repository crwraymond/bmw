# Update aplikasi Windows

Workflow kini membangun Windows dan Android bersama. Panduan aktif untuk kedua platform, Actions secrets, feed rilis, dan installer awal privat ada di [UPDATE_RELEASES.md](UPDATE_RELEASES.md).

Windows tetap memakai updater resmi Tauri dengan public key pada `src-tauri/tauri.conf.json`. Private key terenkripsi berada di `~/Documents/bmw-update-signing/`; dua Actions secrets Windows telah tersedia. Jangan mengganti key setelah installer dibagikan tanpa rencana rotasi.

Pengguna memilih **Pengaturan → Cek update → Pasang update → Backup & pasang**. Aplikasi memeriksa revisi dan membuat backup CSV yang diverifikasi sebelum mengunduh. Plugin memverifikasi signature sebelum installer NSIS dijalankan; folder data toko tidak direset. Installer kemudian membuka aplikasi kembali. Simpan form sebelum memasang.

Installer lama yang belum mendukung updater atau penyimpanan konfigurasi akses toko memerlukan pemasangan privat manual sekali. Paket update GitHub public tidak membawa capability toko; paket tersebut menggunakan pengaturan yang sudah tersimpan pada perangkat. Pemasangan baru dari paket public tetap dapat menggunakan CSV lokal.

Lakukan smoke test antarversi pada Windows sebelum distribusi luas: verifikasi barang, transaksi, stok, pembayaran, pengaturan, serta password tetap utuh. Build/instalasi Windows aktual memerlukan runner/perangkat Windows.
