# Pilihan CSV / Supabase untuk satu toko

Semua perangkat toko menggunakan database yang sama tanpa halaman login. Installer awal privat dapat membawa capability toko acak 256 bit. Build GitHub public memakai konfigurasi perangkat yang disimpan sebelumnya atau dihubungkan sekali melalui kode/file koneksi dari pemilik toko. Tidak ada service-role key di aplikasi.

## Konfigurasi build

`.env.local` (diabaikan Git) berisi:

- `VITE_TOKO_STORE_ID`: identitas toko yang diprovisikan oleh migrasi 002.
- `VITE_TOKO_PUBLIC_KEY`: publishable key Supabase, aman untuk frontend.
- `VITE_TOKO_ACCESS_KEY`: capability toko yang sama pada semua perangkat. Database hanya menyimpan hash SHA-256-nya.

Jangan mengganti capability tanpa memperbarui hash database dan membangun ulang installer. Pencabutan capability berlaku untuk semua installer lama sekaligus. Bangun installer privat secara lokal dengan konfigurasi ini. Workflow rilis publik yang sudah ada sengaja tidak diberi capability: jangan memasukkannya ke build/rilis/website publik. Tanpa konfigurasi, tombol database tetap aktif dan membuka penghubungan perangkat. Kode/file koneksi diverifikasi dengan RPC toko_read sebelum disimpan; kode salah tidak mengubah konfigurasi atau CSV.

## Migrasi database

1. `001_initial_schema.sql` sudah dipasang pada proyek Toko Offline. Jangan jalankan ulang di proyek tersebut.
2. `002_storage_rpc.sql` menambahkan akses toko melalui RPC dan satu identitas toko kosong. Ini tidak mengunggah data operasional. Tabel tetap RLS tanpa policy serta tanpa grant langsung untuk anon/authenticated. RPC SECURITY DEFINER memakai search_path kosong dan selalu memeriksa capability sebelum membaca/menulis.
3. Pengguna memilih **Sync ke database & gunakan** di Pengaturan. Aplikasi membuat backup CSV, mengirim satu snapshot lengkap dalam transaksi, memeriksa hasilnya, kemudian menyimpan pilihan Supabase pada perangkat itu.
4. Perangkat lain memilih **Gunakan database toko**; CSV-nya tidak diunggah atau menimpa database.

## Penghubungan perangkat sekali

1. Perangkat yang sudah terhubung dapat membuka **Pengaturan → Sumber data → Hubungkan perangkat lain**, lalu menyalin kode koneksi. Pemilik toko juga dapat memberikan file koneksi `.txt` secara privat.
2. Pada desktop dengan CSV operasional, pilih **Sync ke database & gunakan**. Jika koneksi belum disimpan, impor file atau tempel kode dahulu, lalu konfirmasikan sync. Konfigurasi dapat diverifikasi sebelum database pertama kali diisi.
3. Setelah sync desktop berhasil, pada HP pilih **Gunakan database toko**. Jika belum terhubung, impor file/tempel kode sekali. Aplikasi langsung membaca snapshot terbaru; CSV HP tidak dikirim dan tidak menginisialisasi toko kosong.
4. Pilihan database serta koneksi tersimpan untuk pembukaan aplikasi dan update berikutnya. Perangkat yang kehilangan konfigurasi saat mode database aktif dapat memilih **Hubungkan kembali database** tanpa mereset data.

Kode koneksi berisi capability yang sama dengan installer privat. Bagikan hanya ke perangkat toko; jangan unggah file koneksi ke source, Actions artifacts, atau Releases public. Tidak ada perubahan skema/RPC database yang dibutuhkan oleh alur ini.

## Perpindahan dan konflik

- **Supabase**: startup dan penyimpanan memakai database. Tidak ada fallback diam-diam saat jaringan gagal. Muat ulang database untuk mengambil perubahan perangkat lain; penyimpanan dari revisi lama ditolak.
- **Salin database & gunakan CSV**: ambil data cloud terbaru, backup CSV lama, simpan salinan lokal dan revisi asal, lalu aktifkan CSV.
- **Gunakan CSV tersimpan (offline)**: buka salinan lokal yang sudah ada secara eksplisit. Salinan mungkin lama; revisi asal tetap dipertahankan.
- **Sync ke database & gunakan** setelah mengedit CSV: unggah hanya jika revisi database masih sama dengan revisi asal CSV. Jika berbeda, hentikan; CSV tidak dihapus. Tidak ada merge otomatis atau tombol paksa timpa.
- Kegagalan jaringan setelah commit bisa ambigu: migrasi menyimpan write ID dan mengulang request identik dengan ID yang sama. Editor lokal diblokir selama hasil request ambigu agar retry tidak mengirim payload berbeda.
- Mode disimpan per perangkat dalam localStorage WebView/browser. Pembersihan data WebView menghapus pilihan mode; data cloud dan file CSV tetap tersedia. Pilih **Gunakan database toko** untuk menyambung kembali.

## Backup dan pemulihan

**Backup ke CSV** mengambil snapshot Supabase terbaru saat mode database aktif. Desktop membuat folder berisi delapan CSV, manifest, tipe kolom, dan checksum; hasil dibaca ulang sebelum dipublikasikan. Browser mengunduh CSV lengkap dua kolom (Tabel / Data JSON), mencakup pengaturan serta audit; format ini berbeda dari ekspor CSV operasional.

Pemulihan berlaku pada sumber data yang sedang aktif. Untuk membuka backup tanpa mengubah database, pilih mode CSV terlebih dahulu. Pemulihan dalam mode Supabase memerlukan internet, backup terlebih dahulu, dan pemeriksaan revisi; perubahan berlaku pada semua perangkat.

## Kontrak

- `POST /rest/v1/rpc/toko_read`: p_store_id, p_access_key -> null sebelum migrasi data, atau {store_id, db}.
- `POST /rest/v1/rpc/toko_save`: p_store_id, p_access_key, p_expected_revision, p_write_id, p_db, p_create -> snapshot tersimpan dengan revisi +1.
- Header standar Supabase memakai publishable key. Capability dikirim di body melalui HTTPS, jangan log body request atau merekam trace produksi.
- Setiap save mengunci baris stores, memeriksa revisi, mengganti delapan tabel dalam satu transaksi, memeriksa FK tertunda, dan mengembalikan snapshot tersimpan. p_write_id membantu retry identik jika balasan hilang. Backend tidak melakukan merge antar-revisi.
- Validasi bisnis tetap dijalankan oleh aplikasi sebelum write; database memeriksa tipe, enum, key unik, dan relasi. Pengguna yang memiliki installer/capability dipercaya sebagai operator penuh toko.

## Verifikasi lokal

`npm test` mencakup backup lengkap, pemilihan mode, retry ambigu, konflik, serta perubahan di tab lain.

Untuk SQL gunakan cluster PostgreSQL sementara milik sendiri melalui Unix socket `/tmp`, port 55439, cluster khusus pengujian:

```
TOKO_TEST_SOCKET=/tmp/toko-supabase-socket python3 scripts/test-supabase.py
```

Script membuat database sementara bernama acak, schema auth tiruan dan role anon/authenticated, memasang kedua migrasi, mengganti hash toko hanya di database uji dengan capability sintetis, lalu menguji roundtrip, penolakan akses, idempotensi, rollback FK, serta dua writer bersamaan. Jangan arahkan ke database asli.

Untuk simulasi HTTP (Postman CLI >= 1.70):

```
postman simulation run postman/simulations/storage/storage.sim.yaml --port 4511 --no-history --output ndjson
```

Di terminal lain jalankan Vite pada port pengujian, lalu:

```
TOKO_STORAGE_SIM=1 PLAYWRIGHT_PORT=1425 npx playwright test tests/storage-mode.spec.ts --workers=1
```

Tes UI mencegat semua request ke host Supabase menuju simulator localhost. Tanpa TOKO_STORAGE_SIM=1, tes simulasi dilewati. Data operasional asli tidak dipakai.
