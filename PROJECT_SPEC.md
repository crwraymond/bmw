# Spesifikasi Awal Aplikasi Toko Offline

Status: draf kebutuhan berdasarkan percakapan, 17 foto aplikasi lama, dan 1 contoh invoice cetak.  
Tanggal: 25 Oktober 2026.  
Nama proyek sementara: **Toko Offline**.

Implementasi awal dan keputusan untuk aturan yang sebelumnya belum pasti dicatat pada [IMPLEMENTATION.md](IMPLEMENTATION.md). Dokumen ini mempertahankan asal kebutuhan dan usulan dari referensi.

## 1. Tujuan

Membuat aplikasi desktop dengan tampilan modern untuk mengelola barang, customer, order, pembelian, penjualan, retur, pelunasan, serta laporan toko. Fitur aplikasi lama menjadi acuan fungsi; tampilan DOS pada foto tidak perlu ditiru.

Identitas pada aplikasi referensi terbaca sebagai **UD. Bhakti Mandala Wijaya**. Identitas ini menjadi konteks referensi, belum otomatis ditetapkan sebagai nama aplikasi baru.

Dokumen ini adalah bahan untuk merancang dan membangun aplikasi, bukan pernyataan bahwa aplikasi sudah dibuat atau seluruh aturan bisnis sudah diketahui.

## 2. Kebutuhan yang sudah disampaikan

- Antarmuka dibuat menggunakan teknologi web, lalu dikemas menjadi aplikasi desktop dengan **Tauri**.
- Pengembang melakukan build; pengguna cukup membuka aplikasi hasil distribusi.
- Pengguna tidak perlu menjalankan Yarn, terminal, atau server secara manual.
- Operasional utama berjalan offline.
- Data disimpan secara lokal dalam format **CSV**.
- Saat aplikasi dibuka, CSV dibaca otomatis dari lokasi data aplikasi.
- Perubahan disimpan langsung oleh aplikasi ke penyimpanan lokal, tanpa membuka dialog pemilihan CSV setiap kali.
- Fitur mengikuti aplikasi lama pada foto, dengan desain yang diperbarui.
- Aplikasi menghasilkan invoice siap cetak dalam versi normal dan versi COPY sesuai contoh tambahan pengguna.
- Halaman dashboard menampilkan total penjualan, total keuntungan, jumlah transaksi, dan ringkasan operasional dengan filter periode.
- Permintaan awal adalah menyusun dokumen Markdown, lalu pengguna meminta implementasi aplikasi.
- Tambahan kebutuhan: diskon dapat diatur pada masing-masing produk. Implementasi menyediakan persen atau Rupiah per unit, serta mempertahankan diskon total sebagai potongan tambahan.
- Tambahan kebutuhan: jumlah kotak serial number mengikuti Qty barang.
- SN dimasukkan saat pembelian, lalu tersedia untuk pencarian dan pemilihan saat penjualan. SN yang sudah keluar tidak boleh dijual dua kali; retur penjualan mengembalikannya ke stok.
- Tombol hapus tersedia pada semua daftar data, dari barang/customer sampai order, transaksi, retur, dan pembayaran. Penghapusan dikonfirmasi dan ditolak jika merusak relasi, stok, atau saldo; data turunan dihapus terlebih dahulu.
- Aplikasi Windows dibuka fullscreen dan menyediakan tombol Keluar dengan konfirmasi. Di preview web, lokasinya ditampilkan dengan penjelasan bahwa penutupan aplikasi hanya berlaku pada desktop.
- Pengaturan menyediakan cek update Windows, cek otomatis saat startup, serta konfirmasi pemasangan. Paket harus bertanda tangan dan backup CSV diverifikasi sebelum pemasangan; data toko dipertahankan.
- Repo BMW tetap dikelola visibility-nya secara manual oleh pengguna. Untuk update tanpa akun/token pada penerima, pengguna membuat repo public saat pengecekan dan pengunduhan rilis.
- Klarifikasi terbaru pengguna: total modal berarti modal seluruh barang yang pernah dibeli. Dashboard menghitung nilai stok awal + seluruh pembelian final - retur pembelian final untuk semua waktu; penjualan tidak menguranginya. Nilai persediaan tersisa berdasarkan HPP tetap tersedia terpisah dalam laporan.
- Tema gelap menjadi default, dapat diganti ke tema terang dengan pilihan tersimpan di perangkat. Invoice dan hasil cetak mempertahankan kertas putih serta teks/border hitam.
- Tombol Lunasi pada halaman Pelunasan ditempatkan pada kolom Aksi.
- Saat mendaftarkan barang baru, stok dan nilai awal selalu nol. Penambahan stok operasional melalui pembelian yang disahkan; form tambah/edit barang tidak dapat mengisi stok atau nilai awal. Stok historis dari data lama/impor/pemulihan tetap dipertahankan.
- Penyederhanaan pabrik: hanya satu pemasok dan pengguna tidak perlu mendaftarkan atau memilihnya. Pembelian, retur pembelian, order, serta pelunasan tetap tersedia.
- Identitas sidebar mengikuti nama toko dari Pengaturan dan hanya menampilkan ikon serta nama toko.
- Logo Mitra Ecobike diambil dari contoh yang diberikan sebagai logo/ikon aplikasi.
- Data master, dokumen final, dan pembayaran bisa diedit langsung tanpa harus dibatalkan terlebih dahulu; stok, HPP, saldo, dan audit tetap konsisten.
- Instruksi pekerjaan terbaru: kerjakan perubahan lokal terlebih dahulu, tanpa build atau push.

Target sistem operasi sudah ditentukan pengguna: **Windows**. Implementasi awal memilih Windows x64 dan installer NSIS `.exe`, dengan build melalui GitHub Actions. Pratinjau web tetap dapat dijalankan di macOS untuk pengembangan.

## 3. Cara membaca tingkat kepastian

| Penanda | Arti |
| --- | --- |
| Terlihat pada foto | Nama menu atau kolom memang terbaca pada referensi. |
| Usulan | Rancangan untuk aplikasi baru; belum menjadi keputusan pengguna. |
| Perlu konfirmasi | Detail tidak bisa dipastikan dari foto maupun percakapan. |

Nama menu yang terlihat tidak membuktikan seluruh perilaku di balik menu tersebut. Terutama rumus modal/laba, diskon, konversi satuan, order, retur, dan pelunasan masih membutuhkan aturan bisnis.

## 4. Inventaris menu aplikasi lama

### 4.1 Menu utama

Terlihat pada foto 17: **Masuk Data**, **Ubah Data**, **Hapus Data**, **Transaksi**, **Lihat Data**, dan **Keluar**.

Isi menu System tidak terlihat. Jangan menyimpulkan ada fitur backup, pengaturan printer, atau pengguna hanya dari nama menu ini.

### 4.2 Masuk Data

Terlihat pada foto 16:

- Data Barang.
- Data Customer.

### 4.3 Ubah Data

Terlihat pada foto 13:

- Order Customer.
- Order Pabrik.
- Data Barang.
- Data Customer.
- Transaksi Penjualan.
- Transaksi Pembelian.
- Retur Penjualan.
- Retur Pembelian.
- Pelunasan Customer.
- Pelunasan Pabrik.
- Discount Pembelian.
- Password …; fungsi lanjutan belum terlihat.

### 4.4 Hapus Data

Terlihat pada foto 8:

- Order Customer dan Order Pabrik.
- Transaksi Penjualan dan Transaksi Pembelian.
- Retur Penjualan dan Retur Pembelian.
- Pelunasan Customer dan Pelunasan Pabrik.
- Data Barang dan Data Customer.

### 4.5 Transaksi

Terlihat pada foto 7:

- Order Customer dan Order Pabrik.
- Transaksi Penjualan dan Transaksi Pembelian.
- Retur Penjualan dan Retur Pembelian.
- Pelunasan Customer dan Pelunasan Pabrik.

### 4.6 Lihat Data

Terlihat pada foto 6:

| Kelompok | Laporan/menu pada referensi |
| --- | --- |
| Master dan stok | Data Customer, Stock Barang, Total Barang Terjual |
| Order | Order Customer, Order Pabrik, Total Order Customer, Order Percustomer |
| Transaksi | Transaksi Penjualan, Transaksi Pembelian |
| Retur | Retur Penjualan, Retur Pembelian |
| Saldo | Hutang Customer, Hutang Pabrik, Hutang Total Customer |
| Keuangan | Modal/Laba |

Istilah **Hutang Customer** dipertahankan sebagai nama dari referensi. Usulan interpretasinya adalah piutang toko kepada customer, sedangkan Hutang Pabrik adalah kewajiban toko kepada pemasok. Interpretasi ini perlu dikonfirmasi.

## 5. Rincian fitur

### 5.1 Data barang

Kolom terlihat pada foto 10 dan 15:

| Kolom | Kebutuhan awal |
| --- | --- |
| Kode Barang | Pengenal barang; usulan harus unik dan disimpan sebagai teks agar nol di depan tidak hilang. |
| Nama Barang | Nama atau jenis barang. |
| Jumlah Barang | Angka stok pada form lama; usulan pada aplikasi baru dibedakan menjadi stok awal dan stok berjalan. |
| Satuan | Contohnya belum terlihat; daftar satuan perlu dikonfirmasi. |
| Isi | Kolom terlihat, tetapi arti dan kaitannya dengan satuan belum diketahui. |
| Harga Beli | Harga master; metode biaya untuk laporan laba belum ditentukan. |
| Harga Jual | Harga master untuk penjualan baru. |
| Tanggal Beli | Kolom terlihat; arti sebagai tanggal awal, terakhir, atau transaksi belum diketahui. |

Fungsi aplikasi baru yang diusulkan:

- Tambah, cari, lihat detail, ubah, dan nonaktifkan barang.
- Pencarian berdasarkan kode atau nama.
- Stok berjalan diturunkan dari mutasi, bukan diketik ulang di master setiap terjadi transaksi.
- Perubahan harga master tidak mengubah harga pada transaksi historis.
- Barang yang sudah dipakai dalam transaksi tidak dihapus secara permanen.
- Koreksi stok dicatat sebagai penyesuaian dengan alasan dan riwayat, jika fitur ini disetujui.

### 5.2 Data customer

Kolom terlihat pada foto 14: **Kode Customer, Nama, Alamat, Kota, Telephone, Fax**.

Usulan perilaku:

- Tambah, cari, lihat detail, ubah, dan nonaktifkan customer.
- Kode customer unik; nomor telepon dan fax disimpan sebagai teks.
- Fax boleh kosong.
- Detail customer dapat menampilkan order, penjualan, retur, pembayaran, dan saldo terkait.
- Alamat dan informasi kontak menjadi data lokal aplikasi.

### 5.3 Pabrik/pemasok

Nama pabrik muncul dalam order, pelunasan, dan laporan hutang. Form master pabrik tidak ditampilkan pada foto.

**Usulan:** sediakan data pemasok minimal berupa kode dan nama agar transaksi dapat ditautkan secara konsisten. Alamat, telepon, serta kebutuhan menu master tersendiri perlu dikonfirmasi. Istilah tampilan dapat tetap memakai “Pabrik” jika lebih dikenal pengguna.

### 5.4 Order customer

Keberadaan fitur terlihat pada menu; foto 12 memperlihatkan pencarian **Ubah Order Penjualan** menggunakan **No. Order**. Pemetaan Order Penjualan ke Order Customer adalah interpretasi awal yang perlu diverifikasi.

Usulan data: nomor order, tanggal, customer, baris barang, kuantitas, harga, serta status pemenuhan.

Usulan alur: buat order → simpan → penuhi melalui penjualan → tampilkan sisa order. Order tidak langsung mengurangi stok fisik. Apakah order harus mencadangkan stok, bisa dipenuhi sebagian, dan boleh berdiri tanpa customer terdaftar masih perlu dikonfirmasi.

### 5.5 Order pabrik

Keberadaan fitur terlihat pada menu; foto 11 memperlihatkan pencarian **Ubah Order Pembelian** menggunakan **No. Order**. Pemetaan Order Pembelian ke Order Pabrik adalah interpretasi awal.

Usulan data: nomor order, tanggal, pemasok, baris barang, kuantitas, harga perkiraan, serta status penerimaan.

Usulan alur: buat order → simpan → terima melalui pembelian → tampilkan sisa order. Order tidak langsung menambah stok; penambahan terjadi ketika barang diterima melalui transaksi yang disahkan.

### 5.6 Transaksi penjualan

Terlihat pada foto 2:

- No. Nota.
- Tanggal Jual.
- Nama Customer dan Kode Customer.
- Tabel: Kode Barang, Jenis Barang, Jumlah, Harga Satuan, Jumlah.
- Area penjumlahan di bawah kolom nilai.
- Petunjuk Enter = Melanjutkan dan F1 = Menyimpan.

Usulan interpretasi: kolom Jumlah pertama adalah kuantitas; kolom Jumlah terakhir adalah subtotal baris, yaitu kuantitas × harga satuan. Pada UI baru gunakan label **Qty** dan **Subtotal** agar tidak ambigu.

Usulan alur:

1. Buat nota baru dengan nomor unik dan tanggal.
2. Pilih customer, lalu tambah barang melalui kode atau pencarian nama.
3. Isi kuantitas dan harga; subtotal serta total dihitung otomatis.
4. Simpan sebagai transaksi final setelah validasi.
5. Aplikasi mencatat pengurangan stok dan nilai tagihan sesuai aturan pembayaran yang disepakati.

Foto 9 menunjukkan ubah penjualan melalui No. Nota. Aplikasi baru perlu mendukung pencarian nota dan perubahan yang mempertahankan konsistensi stok serta saldo.

Status tunai/kredit, pembayaran awal, diskon penjualan, pajak, pencetakan nota, dan izin mengubah harga belum terlihat pada form referensi.

### 5.7 Transaksi pembelian

Terlihat pada foto 1:

- No. Faktur.
- Tanggal Beli.
- Tabel: Kode Barang, Jenis Barang, Jumlah, Harga Satuan, Jumlah.
- Petunjuk Enter = Melanjutkan dan F1 = Menyimpan.

Usulan alur: masukkan nomor faktur dan tanggal → tentukan pemasok bila diperlukan → tambah baris barang → hitung total → sahkan pembelian → tambah stok dan catat kewajiban sesuai aturan pembayaran.

Kolom pemasok tidak terlihat pada foto 1. Relasi ke pemasok adalah kebutuhan yang diusulkan untuk mendukung Hutang Pabrik dan Pelunasan Pabrik.

**Discount Pembelian** terlihat sebagai menu Ubah Data pada foto 13. Belum diketahui apakah diskon berlaku per barang, per faktur, persentase, nominal, atau potongan pembayaran. Rumus dan pengaruhnya pada biaya barang harus ditentukan sebelum implementasi.

### 5.8 Retur penjualan dan retur pembelian

Fitur tambah, ubah, hapus, serta lihat data retur terlihat pada menu. Form detailnya belum tersedia.

Usulan kebutuhan:

- Nomor retur, tanggal, referensi transaksi asal, pihak terkait, barang, kuantitas, nilai, dan alasan.
- Kuantitas retur tidak boleh melebihi sisa kuantitas yang dapat diretur dari transaksi asal.
- Retur penjualan mencatat barang kembali; apakah barang masuk stok layak jual perlu ditentukan.
- Retur pembelian mencatat barang keluar kembali ke pemasok.
- Pengaruh terhadap tagihan, hutang, uang kembali, atau saldo kredit harus eksplisit. Jangan otomatis menganggap semua retur mengurangi saldo dengan cara yang sama.
- Perubahan dan pembatalan retur memperhitungkan mutasi serta pembayaran yang sudah terkait.

### 5.9 Pelunasan customer dan pabrik

Fitur transaksi, ubah, dan hapus terlihat pada menu. Form detail belum tersedia.

Usulan data: nomor pembayaran, tanggal, customer/pemasok, nominal, alokasi ke nota/faktur, serta catatan.

Usulan kebutuhan:

- Mendukung pembayaran sebagian maupun pelunasan penuh.
- Menampilkan saldo sebelum dan sesudah pembayaran.
- Menyimpan alokasi pembayaran agar transaksi mana yang dilunasi dapat ditelusuri.
- Mengubah atau membatalkan pembayaran memperbarui saldo secara konsisten.
- Aturan lebih bayar, uang muka, metode pembayaran, dan satu pembayaran untuk banyak faktur perlu dikonfirmasi.

### 5.10 Ubah dan hapus data

Aplikasi lama memisahkan menu Masuk, Ubah, dan Hapus. Pada UI baru, usulannya adalah menggabungkan aksi tersebut di halaman masing-masing modul.

- Master yang sudah direferensikan: nonaktifkan, pertahankan riwayat.
- Draf transaksi: boleh diedit atau dihapus.
- Transaksi final: usulan koreksi atau pembatalan dengan alasan dan jejak perubahan.
- Perubahan transaksi harus menghitung dampaknya pada stok, sisa order, retur, serta alokasi pembayaran.
- Jika ada transaksi turunan, blokir perubahan yang tidak aman atau minta pengguna menyelesaikan dependensinya lebih dahulu.
- Jangan mengurangi atau menambah stok dua kali saat tombol Simpan diklik berulang.

Kebijakan ini adalah usulan pengganti hapus permanen, bukan perilaku lama yang sudah terbukti.

### 5.11 Password dan pengaturan

Password terlihat pada menu Masuk Data dan Ubah Data; alur sebenarnya belum diketahui. Login, peran admin/kasir, dan pembatasan akses belum ditetapkan.

Usulan halaman Pengaturan: identitas toko, lokasi data, backup/pemulihan, dan preferensi tampilan. Bila password digunakan, simpan hash yang sesuai, bukan password asli dalam CSV.

### 5.12 Invoice siap cetak — kebutuhan tambahan pengguna

Pengguna meminta aplikasi dapat menghasilkan dokumen seperti foto 18 untuk dicetak, dengan pilihan **versi normal/tanpa COPY** dan **versi COPY**. Ini merupakan kebutuhan yang diminta, bukan lagi sekadar usulan fitur cetak.

#### Dua versi dokumen

| Bagian | Versi normal | Versi COPY |
| --- | --- | --- |
| Judul | Invoice | Copy Invoice |
| Penanda COPY | Tidak ada | Ada cap/watermark COPY merah berbentuk diagonal di area bawah, mengikuti contoh |
| Nomor referensi dan tanggal | Menggunakan dokumen transaksi yang sama | Sama dengan versi normal |
| Barang, serial number, harga, total, pembayaran | Menggunakan data invoice yang sama | Sama dengan versi normal |
| Stok dan saldo | Cetak tidak mengubah transaksi | Cetak COPY juga tidak mengubah transaksi |

Versi normal harus bersih dari tulisan, cap, maupun watermark COPY. COPY adalah varian hasil cetak dari invoice yang sama, bukan transaksi penjualan baru dan bukan nomor invoice baru. Versi COPY tetap dibuat langsung dari data; pengguna tidak perlu mengedit PDF atau gambar secara manual.

Usulan menyediakan aksi **Cetak Invoice**, **Cetak COPY**, dan pilihan **Cetak Keduanya** pada invoice yang sudah disahkan. Pilihan terakhir menghasilkan dua salinan yang masing-masing lengkap, bukan menggandakan baris barang pada satu invoice.

#### Susunan yang terlihat pada referensi

| Area | Isi yang terlihat | Rancangan aplikasi baru |
| --- | --- | --- |
| Header | Logo Mitra ecobike di kiri dan PHYLiON di kanan | Dua area logo yang bisa dikonfigurasi; gunakan aset logo asli bila tersedia. |
| Judul | Copy Invoice | Ganti berdasarkan versi yang dipilih. |
| Identitas dokumen | Date dan Reff | Tanggal invoice dan nomor referensi unik yang tersimpan. |
| Issuer | Nama penerbit, alamat, dan nomor telepon | Ambil dari profil penerbit saat invoice disahkan. |
| For Account | Nama usaha/penerima, alamat, dan Contact Person | Ambil dari customer dengan opsi identitas penerima invoice. |
| Tabel barang | No, SN, Description, Qty, Unit Price IDR, Total | Baris detail dengan serial number opsional dan format harga yang konsisten. |
| Ringkasan | Grand Total | Total dari rincian dan komponen penyesuaian yang memang ditetapkan. |
| Pembayaran | Terms of Payment dan Down Payment | Syarat pembayaran serta uang muka yang terkait transaksi. |
| Ketentuan | WARRANTY TERMS & CONDITIONS | Teks ketentuan/garansi yang dapat diatur, bukan teks tetap untuk semua barang. |
| Rekening | Beneficiary, Bank Name, Branch, Account Number, Bank Code, Country | Profil rekening penerima yang dapat dikonfigurasi. |
| Penutup | Signature dan nama penerbit | Area tanda tangan; gambar tanda tangan atau cap tambahan hanya jika disediakan. |
| Penanda salinan | Cap COPY diagonal merah di area bawah | Hanya muncul pada versi COPY dan tetap menjaga informasi utama terbaca. |

Contoh memakai identitas **Mitra Ecobike** dan logo **PHYLiON**, berbeda dari identitas aplikasi lama. Jangan mengunci nama toko, alamat, rekening, logo, atau ketentuan garansi berdasarkan salah satu contoh. Belum diketahui apakah aplikasi baru dipakai untuk satu identitas atau beberapa profil penerbit.

#### Alur penggunaan

1. Buka transaksi penjualan final atau detail invoice terkait.
2. Periksa penerima, alamat, barang, serial number, harga, ketentuan pembayaran, dan uang muka.
3. Pilih versi normal, COPY, atau keduanya.
4. Aplikasi menampilkan pratinjau dengan tata letak dokumen yang akan dicetak.
5. Pengguna memilih Cetak dan printer yang tersedia pada sistem operasi.
6. Cetak ulang memakai nomor dan isi invoice yang tersimpan; tidak membuat penjualan atau mutasi stok baru.

Usulan tambahan: **Simpan PDF** untuk arsip atau pengiriman manual. Mekanisme cetak/PDF perlu ditentukan dan diuji pada OS target; tidak bergantung pada pengguna menjalankan server lokal atau Yarn.

#### Data tambahan yang diperlukan

- Nomor referensi invoice; format contoh adalah `2026/PHY/INV/X/005`, tetapi pola penomoran baru belum ditetapkan.
- Hubungan invoice ke transaksi penjualan; usulan awal satu invoice untuk satu penjualan, dengan aturan final perlu konfirmasi.
- Snapshot identitas penerbit dan customer, termasuk alamat serta contact person.
- Snapshot deskripsi barang, satuan, kuantitas, harga, dan serial number saat diterbitkan.
- Dukungan lebih dari satu serial number bila satu baris mencakup beberapa unit. Apakah harus dipecah menjadi beberapa baris cetak perlu ditentukan.
- Terms of Payment, nilai Down Payment, dan referensi pembayaran terkait agar uang muka tidak dihitung dua kali.
- Grand Total dibedakan dari sisa yang harus dibayar. Jika sisa bayar ditampilkan, beri label tersendiri dan gunakan alokasi pembayaran yang valid.
- Snapshot teks garansi, profil rekening, nama penandatangan, serta versi template dan aset logo untuk cetak ulang yang konsisten.
- Pilihan normal/COPY hanya mengatur presentasi; tidak mengubah nilai dokumen yang sudah disahkan.

#### Persyaratan tata letak

- Orientasi portrait mengikuti contoh. Ukuran kertas belum diketahui; A4 portrait menjadi usulan awal yang perlu dicek dengan kertas/printer pengguna.
- Hasil cetak hanya berisi invoice, tanpa sidebar, tombol, menu aplikasi, atau status penyimpanan.
- Gunakan latar putih, teks hitam, garis tabel tipis, dan warna pada logo/cap sesuai kebutuhan.
- Jumlah, harga satuan, subtotal, dan grand total tertata serta terbaca; format contoh memakai Rupiah dengan titik pemisah ribuan.
- Nama/deskripsi, alamat panjang, dan serial number harus membungkus tanpa menimpa kolom lain.
- Tinggi baris mengikuti isi; jangan membatasi jumlah barang sesuai jumlah baris pada foto.
- Bila melebihi satu halaman, ulangi header tabel dan tampilkan identitas invoice/nomor halaman. Total, ketentuan, dan tanda tangan tidak boleh terpotong atau tercetak ganda secara keliru.
- Penanda COPY muncul pada setiap halaman varian COPY; posisinya disesuaikan agar tidak menghalangi informasi penting.
- Semua font, logo, dan aset template tersedia lokal agar pratinjau dan cetak berfungsi offline.
- Ketentuan garansi yang terlihat pada contoh adalah isi referensi, bukan instruksi maupun kebijakan otomatis untuk aplikasi baru.

## 6. Laporan

Seluruh laporan pada menu lama tetap masuk cakupan kebutuhan. Kolom berikut adalah usulan jika tampilan laporan tidak ada dalam foto.

| Laporan | Filter dan isi yang diusulkan | Bukti khusus |
| --- | --- | --- |
| Data Customer | Rentang kode, pencarian nama, identitas dan kontak | Foto 5 menunjukkan dari/sampai kode customer. |
| Stock Barang | Rentang kode, nama, satuan, stok berjalan | Foto 4 menunjukkan dari/sampai kode barang. |
| Total Barang Terjual | Periode, barang, kuantitas terjual; perlakuan retur harus dijelaskan | Nama menu pada foto 6. |
| Order Customer | Periode, customer, nomor, status, jumlah order dan sisa | Nama menu pada foto 6. |
| Order Pabrik | Periode, pemasok, nomor, status, jumlah order dan sisa | Nama menu pada foto 6. |
| Total Order Customer | Rekap agregat order; kelompok dan rumus perlu konfirmasi | Nama menu pada foto 6. |
| Order Percustomer | Rincian order untuk customer tertentu | Nama menu pada foto 6. |
| Transaksi Penjualan | Rentang tanggal, nota, customer, total, status | Foto 3 menunjukkan dari/sampai tanggal. |
| Transaksi Pembelian | Rentang tanggal, faktur, pemasok, total, status | Nama menu pada foto 6. |
| Retur Penjualan | Periode, customer, transaksi asal, barang, nilai | Nama menu pada foto 6. |
| Retur Pembelian | Periode, pemasok, transaksi asal, barang, nilai | Nama menu pada foto 6. |
| Hutang Customer | Usulan rincian tagihan, pembayaran, penyesuaian, dan saldo per customer | Makna istilah perlu konfirmasi. |
| Hutang Pabrik | Usulan rincian kewajiban, pembayaran, penyesuaian, dan saldo per pemasok | Nama menu pada foto 6. |
| Hutang Total Customer | Usulan rekap saldo seluruh customer | Perbedaan dengan Hutang Customer perlu konfirmasi. |
| Modal/Laba | Periode, dasar biaya, penjualan, retur, dan diskon yang relevan | Rumus dan makna modal belum diketahui. |

Tanggal awal dan akhir diusulkan inklusif. Filter kode diusulkan berbasis teks; aturan urutan kode campuran huruf/angka perlu ditetapkan.

Tombol **Tampilkan** digunakan untuk menjalankan laporan. Foto 3–5 menampilkan petunjuk F1 = Menyimpan walaupun konteksnya filter; perilaku aplikasi baru tidak perlu mengikuti label yang ambigu ini.

Ekspor laporan ke CSV serta cetak/PDF untuk laporan adalah usulan tambahan, belum terbukti tersedia pada aplikasi lama. Cetak invoice normal dan COPY sudah diminta secara terpisah pada bagian 5.12.

## 7. Arah tampilan modern — usulan

Dashboard merupakan fitur yang sudah diminta pengguna. Susunan visual dan metrik tambahan di bawah merupakan usulan desain.

### 7.1 Navigasi

Gunakan sidebar dengan susunan:

1. Dashboard / Ringkasan.
2. Barang & Stok.
3. Customer.
4. Pabrik/Pemasok.
5. Order: Customer dan Pabrik.
6. Transaksi: Penjualan dan Pembelian.
7. Retur: Penjualan dan Pembelian.
8. Pembayaran: Customer dan Pabrik.
9. Laporan.
10. Pengaturan.

Dashboard menjadi halaman awal saat aplikasi dibuka. Rincian kebutuhan terdapat pada bagian 7.4.

### 7.2 Prinsip visual dan penggunaan

- Bahasa Indonesia dengan istilah yang familiar bagi operator toko.
- Latar terang, teks gelap, aksen biru atau teal, dan garis tabel yang lembut.
- Tabel tetap padat dan mudah dibaca; angka rata kanan, total transaksi menonjol.
- Font dan ikon dibundel agar tampilan bekerja tanpa internet.
- Kolom pencarian terlihat jelas; barang/customer bisa dipilih dengan keyboard.
- Form transaksi menampilkan identitas dokumen di atas, baris barang di tengah, dan total serta aksi Simpan di bawah.
- Tanggal ditampilkan sebagai DD-MM-YYYY; format penyimpanan diusulkan YYYY-MM-DD.
- Format mata uang dan jumlah desimal mengikuti aturan toko yang nanti dipilih.
- Status penyimpanan selalu jelas: sedang menyimpan, tersimpan, atau gagal.
- Kesalahan tampil dekat kolom terkait dan tidak menghilangkan isian.
- Pesan kosong menyertakan tindakan berikutnya, misalnya Tambah Barang.

### 7.3 Keyboard

Pertahankan kecepatan kerja aplikasi lama tanpa mewajibkan semua pengguna menghafal tombol:

- Tab/Shift+Tab untuk pindah kolom.
- Enter untuk memilih hasil pencarian atau melanjutkan input dalam konteks yang jelas.
- F1 dapat dipertahankan sebagai shortcut Simpan dalam jendela aplikasi, setelah diuji pada OS target.
- Ctrl/Cmd+S sebagai alternatif Simpan.
- Esc untuk menutup dialog atau membatalkan aksi yang belum disahkan.
- Semua aksi penting tetap memiliki tombol dengan label.

### 7.4 Dashboard penjualan dan operasional

Pengguna meminta dapat melihat **total penjualan, total keuntungan, dan jumlah transaksi**. Dashboard menyajikan angka ringkas yang dapat dibuka menuju daftar transaksi atau laporan pembentuknya.

#### Filter periode

- Pilihan Hari Ini, 7 Hari Terakhir, Bulan Ini, Tahun Ini, Semua Data, dan rentang tanggal khusus.
- Usulan tampilan awal: Bulan Ini, dengan tanggal awal/akhir terlihat jelas.
- Semua kartu, grafik, dan daftar aktivitas mengikuti periode yang sama kecuali kartu saldo yang diberi label khusus.
- Usulan perbandingan opsional dengan periode sebelumnya yang berdurasi sama; definisi pembanding harus terlihat. Bila nilai pembanding nol, tampilkan selisih nominal tanpa persentase yang menyesatkan.
- Hari dan batas tanggal mengikuti zona waktu toko yang ditetapkan. Tanggal awal/akhir inklusif.

#### Kartu utama

| Kartu | Definisi rancangan awal |
| --- | --- |
| Total Penjualan | Penjualan bersih dalam periode: nilai penjualan final setelah potongan penjualan yang berlaku, dikurangi nilai retur penjualan final yang diakui pada periode itu. Tampilkan rincian penjualan dan retur agar angkanya dapat ditelusuri. |
| Total Keuntungan | Usulan awal berupa **Laba Kotor**: penjualan bersih dikurangi HPP bersih terkait. Metode biaya dan perlakuan retur/diskon harus ditentukan sebelum angka dinyatakan final. |
| Jumlah Transaksi | Jumlah dokumen penjualan final dalam periode, bukan jumlah baris barang, jumlah pembayaran, order, atau jumlah cetak invoice. Retur dihitung terpisah. |
| Rata-rata Nilai Penjualan | Usulan metrik tambahan: total nilai dokumen penjualan final setelah potongan, sebelum retur terpisah, dibagi jumlah dokumen tersebut. Label dan penjelasan harus membedakannya dari penjualan bersih setelah retur. |

Istilah “Total Keuntungan” pada tampilan perlu disertai label **Laba Kotor** bila belum memperhitungkan biaya operasional. **Laba Bersih** baru ditampilkan jika pencatatan biaya seperti gaji, sewa, dan biaya operasional lain masuk cakupan dan rumusnya disepakati. Harga beli master saat ini tidak boleh digunakan untuk mengganti HPP historis.

#### Ringkasan tambahan yang diusulkan

| Informasi | Perilaku |
| --- | --- |
| Total Pembelian | Nilai pembelian final dan retur pembelian ditampilkan dengan definisi yang jelas; mengikuti periode. |
| Pembayaran Customer Diterima | Pembayaran masuk final pada periode; terpisah dari penjualan karena penjualan kredit dan penerimaan pembayaran berbeda waktunya. |
| Piutang Customer | Saldo seluruh customer **sampai tanggal akhir periode**, termasuk saldo awal dan transaksi sebelumnya; bukan sekadar penjualan pada periode terpilih. |
| Hutang Pabrik/Pemasok | Saldo kewajiban **sampai tanggal akhir periode**, termasuk saldo awal dan transaksi sebelumnya. |
| Order Belum Selesai | Jumlah order terbuka dan sisa pemenuhan sampai tanggal akhir periode, setelah modul order tersedia. |
| Stok Menipis | Daftar stok terkini di bawah batas minimum per barang, bila batas minimum disetujui. Beri label **stok saat ini**, terpisah dari filter periode. |
| Produk Terlaris | Peringkat berdasarkan nilai penjualan atau kuantitas; pilihan dasar peringkat terlihat dan perlakuan retur konsisten. Jangan menjumlahkan kuantitas dengan satuan berbeda tanpa konversi yang disepakati. |
| Transaksi Terbaru | Daftar penjualan terbaru dalam periode, berisi tanggal, nomor, customer, total, dan status pembayaran. |

Metrik tambahan bukan syarat dari aplikasi lama. Masing-masing ditampilkan setelah modul dan data pendukungnya tersedia; jangan mengisi nol untuk metrik yang belum dapat dihitung.

#### Visual dan interaksi

- Baris atas memuat filter periode dan kartu penjualan, keuntungan, serta jumlah transaksi.
- Usulan grafik tren penjualan dan laba kotor per hari/bulan, mengikuti panjang rentang waktu.
- Di bawah grafik, tampilkan produk terlaris serta transaksi terbaru; saldo dan perhatian operasional dapat ditempatkan di area pendamping.
- Klik kartu atau titik grafik membuka rincian dengan filter periode yang sama.
- Sediakan aksi cepat Penjualan Baru, Pembelian Baru, dan Tambah Barang.
- Angka nol berarti tidak ada aktivitas yang relevan; biaya belum tersedia ditampilkan sebagai **Belum dapat dihitung**, bukan laba nol atau seluruh penjualan dianggap laba.
- Keuntungan negatif tetap ditampilkan sebagai rugi. Warna membantu pembacaan, disertai teks/angka yang jelas.
- Setelah commit transaksi, retur, koreksi, atau pembayaran berhasil, dashboard memperbarui metrik yang terkait tanpa perlu menutup aplikasi.
- Dashboard bekerja offline dari kumpulan data aktif yang sama dengan laporan.

#### Aturan perhitungan dan penelusuran

- Hanya dokumen final yang berlaku diperhitungkan; draf, transaksi batal, dan revisi yang sudah digantikan tidak dihitung ganda.
- Usulan pengakuan penjualan mengikuti tanggal penjualan, retur mengikuti tanggal retur, dan pembayaran mengikuti tanggal pembayaran. Kebijakan ini harus sama pada dashboard dan laporan, lalu dikonfirmasi sebelum implementasi.
- HPP bersih menggunakan biaya barang yang terjual, dikurangi pembalikan biaya atas retur yang memenuhi aturan. Penanganan barang rusak dan retur lintas periode membutuhkan aturan yang disepakati.
- Pelunasan tidak menambah penjualan atau keuntungan untuk kedua kalinya; mencetak invoice normal/COPY juga tidak mengubah metrik.
- Bila belum ada transaksi, tampilkan keadaan kosong dan angka nol yang valid. Bila ada penjualan dengan biaya hilang, tampilkan cakupan biaya yang belum lengkap dan jangan menyajikan keuntungan sebagai angka final.
- Simpan dasar biaya historis dan sumber perhitungannya saat pengesahan transaksi. Pilihan FIFO, rata-rata tertimbang, atau metode lain masih perlu ditentukan bersama aturan diskon pembelian.
- Total kartu harus dapat direkonsiliasi dengan rincian laporan untuk periode dan aturan pengakuan yang sama.

## 8. Penyimpanan CSV dan arsitektur — rancangan awal

### 8.1 Alur utama

```text
Pengguna membuka aplikasi desktop
                 ↓
UI web yang dibundel dalam Tauri
                 ↓
Layanan lokal Rust untuk validasi dan baca/tulis
                 ↓
CSV di folder data aplikasi
```

Tidak dibutuhkan server terpisah untuk operasi ini. UI mengirim aksi ke layanan lokal aplikasi. Akses data dibatasi ke lokasi yang memang dikelola aplikasi.

Keputusan teknologi awal: **React + Vite + TypeScript**, dikemas dengan **Tauri**. Pengguna menyerahkan pilihan frontend kepada pengembang. Proyek awal dibuat menggunakan template resmi React TypeScript Tauri; versi terpasang dicatat dalam lockfile. Pilihan ini sesuai antarmuka lokal tanpa kebutuhan server rendering.

### 8.2 Lokasi dan perilaku file

- CSV operasional berada di folder data aplikasi yang dapat ditulis, terpisah dari aset installer.
- Saat pertama berjalan, aplikasi membuat struktur data kosong bila memang belum pernah diinisialisasi.
- Saat berikutnya dibuka, aplikasi memuat data dari lokasi yang sama secara otomatis.
- Jika data yang sebelumnya ada tiba-tiba hilang atau rusak, tampilkan masalah; jangan diam-diam menggantinya dengan data kosong.
- Bila disertakan CSV contoh, salin sebagai data awal sekali saja dan jangan menimpa data pengguna saat pembaruan aplikasi.
- Dialog pilih file hanya diperlukan untuk tindakan seperti impor, ekspor, backup, atau pemulihan yang memang diminta pengguna.
- Pengguna dapat melihat lokasi data melalui Pengaturan.

### 8.3 Simpan langsung dan draf transaksi

“Simpan langsung ke CSV” berarti aplikasi menulis sendiri ke disk; pengguna tidak perlu mengunduh CSV baru lalu mengganti file lama.

Usulan membedakan dua tahap:

- **Draf:** isian transaksi dapat disimpan otomatis setelah jeda singkat. Draf belum memengaruhi stok dan saldo.
- **Final:** tombol Simpan mengesahkan transaksi, mutasi stok, serta dampak saldo sebagai satu perubahan konsisten.

Dengan cara ini pengguna tidak kehilangan pekerjaan, tetapi mengetik satu digit kuantitas belum langsung dianggap sebagai penjualan yang sah. Pola autosave untuk master dan transaksi perlu disepakati saat desain rinci.

### 8.4 Kelompok CSV yang diusulkan

Nama file berikut adalah rancangan baru, bukan format data aplikasi lama.

| File | Isi utama |
| --- | --- |
| `items.csv` | ID, kode, nama, satuan, isi, harga master, status aktif |
| `customers.csv` | ID, kode, nama, alamat, kota, telepon, fax, status aktif |
| `suppliers.csv` | ID, kode, nama, kontak opsional, status aktif |
| `orders.csv` | Header order, jenis customer/pabrik, nomor, tanggal, pihak, status |
| `order_lines.csv` | Barang, kuantitas, harga, dan hubungan ke order |
| `transactions.csv` | Header penjualan/pembelian, nomor, tanggal, pihak, status, total |
| `transaction_lines.csv` | Barang, kuantitas, harga saat transaksi, subtotal, referensi baris order opsional |
| `invoices.csv` | Referensi penjualan, nomor invoice, tanggal, snapshot penerbit/penerima, terms of payment, referensi uang muka, total, dan versi template |
| `invoice_lines.csv` | Snapshot baris barang, deskripsi, kuantitas, harga, subtotal, dan referensi ke baris penjualan |
| `invoice_serial_numbers.csv` | Satu serial number per baris, ditautkan ke baris invoice terkait |
| `returns.csv` | Header retur, jenis, tanggal, transaksi asal, alasan, status |
| `return_lines.csv` | Baris transaksi asal, barang, kuantitas, nilai, penanganan stok |
| `payments.csv` | Penerimaan/pengeluaran, nomor, tanggal, pihak, nominal, status |
| `payment_allocations.csv` | Alokasi pembayaran ke dokumen tagihan tertentu |
| `stock_movements.csv` | Stok awal dan mutasi masuk/keluar, barang, sumber, kuantitas |
| `opening_balances.csv` | Saldo awal customer/pemasok untuk migrasi atau mulai operasional |
| `adjustments.csv` | Penyesuaian nilai yang disetujui, jenis, referensi, nominal, alasan |
| `audit_log.csv` | Aksi, waktu, entitas, referensi revisi, alasan koreksi/pembatalan |
| `drafts.csv` | Referensi draf transaksi yang belum disahkan |

Rincian kolom, penyimpanan baris draf, pengaturan, serta kredensial dibahas pada desain teknis berikutnya. CSV tidak harus menampung seluruh konfigurasi internal aplikasi.

Logo dan aset cetak disimpan sebagai file lokal yang dikelola aplikasi, bukan data biner di dalam CSV. Snapshot invoice serta aset yang dirujuk harus ikut backup/pemulihan. Aturan koreksi invoice final perlu ditetapkan agar cetak ulang historis tidak diam-diam berubah ketika profil toko, customer, atau template diperbarui.

### 8.5 Aturan format dan konsistensi

- Gunakan UTF-8 dan penanganan CSV yang benar untuk koma, tanda kutip, dan baris baru.
- ID internal stabil; relasi tidak menggunakan nama yang bisa berubah.
- Kode, telepon, dan nomor dokumen diperlakukan sebagai teks.
- Simpan tanggal dan angka dalam format baku, tanpa pemisah ribuan tampilan.
- Usulan untuk Rupiah tanpa pecahan: nilai uang disimpan sebagai integer Rupiah. Jika toko membutuhkan pecahan atau mata uang lain, tentukan skala sebelum implementasi.
- Kuantitas memakai presisi desimal yang disepakati; hindari pembulatan uang memakai floating point biner biasa.
- Harga dan identitas dokumen yang perlu dipertahankan untuk riwayat disimpan sebagai snapshot transaksi.
- Satu layanan penulis menangani antrean simpan; cegah dua instance aplikasi menulis kumpulan data yang sama bersamaan.
- Pengubahan CSV secara manual saat aplikasi berjalan tidak didukung pada rancangan awal.
- Semua laporan memakai data aktif yang sama; stok dan saldo tidak disimpan ulang secara terpisah di tiap laporan.

### 8.6 Penyimpanan beberapa CSV secara konsisten

Menulis satu file secara aman belum cukup bila satu penjualan mengubah header, detail, dan stok pada beberapa CSV.

Usulan: gunakan kumpulan data berversi. Setiap commit menulis seluruh file yang berubah beserta file pendukung ke generasi baru, memvalidasi relasi serta totalnya, lalu mengganti penunjuk generasi aktif secara atomik. Generasi lama dipertahankan untuk pemulihan sesuai retensi. Jangan menimpa CSV aktif satu per satu sambil menyatakan transaksi sudah berhasil.

Implementasi perlu menguji pemulihan bila proses berhenti di tengah penulisan. Mekanisme final, termasuk flush ke disk dan perilaku penggantian file pada OS target, harus diverifikasi sebelum dipakai untuk data nyata.

Pendekatan CSV tetap mengikuti kebutuhan pengguna, tetapi kebutuhan ini lebih rumit daripada satu tabel. Bila nanti dipilih SQLite untuk transaksi internal dan CSV untuk impor/ekspor, itu perubahan arsitektur yang perlu dibahas lebih dahulu; dokumen ini tidak mengganti keputusan CSV secara diam-diam.

### 8.7 Backup dan pemulihan — usulan tambahan

- Backup mencakup satu kumpulan data yang konsisten beserta versi skemanya.
- Sediakan backup manual dan backup otomatis dengan retensi yang ditentukan.
- Lakukan backup sebelum migrasi skema atau pemulihan data.
- Pemulihan memvalidasi format, relasi, serta versi sebelum mengganti data aktif.
- Backup di disk yang sama membantu koreksi kesalahan, tetapi salinan di media terpisah diperlukan bila ingin perlindungan dari kerusakan perangkat.

## 9. Aturan bisnis yang perlu ditetapkan

| Topik | Usulan awal atau pertanyaan |
| --- | --- |
| Stok negatif | Usulan diblokir secara default; apakah operator boleh melakukan pengecualian? |
| Satuan dan isi | Apa arti Isi, satuan dasar, dan konversi kemasan? |
| Stok awal | Hanya dipertahankan untuk data historis/impor/pemulihan. Barang baru melalui form selalu nol; pemasukan stok rutin melalui pembelian final. |
| Order | Apakah reservasi stok, pemenuhan parsial, pembatalan, dan over-fulfillment dibutuhkan? |
| Nomor dokumen | Apakah nomor otomatis, manual, per tahun, atau mengikuti nomor faktur pemasok? |
| Pembayaran | Apakah penjualan dan pembelian mendukung tunai, kredit, serta pembayaran awal? |
| Saldo awal | Bagaimana mencatat piutang dan hutang sebelum mulai memakai aplikasi? |
| Diskon pembelian | Bentuk diskon, pembulatan, waktu penerapan, serta pengaruh ke biaya dan saldo. |
| Retur | Masuk stok layak jual atau rusak; mengurangi tagihan atau mengembalikan uang? |
| Modal/Laba | Total modal diklarifikasi sebagai nilai stok awal + seluruh pembelian final bersih setelah retur pembelian. HPP rata-rata bergerak dan nilai persediaan tersisa ditampilkan terpisah. |
| Keuntungan dashboard | Usulan laba kotor dengan HPP historis. Apakah perlu laba bersih dan pencatatan biaya operasional? |
| Pajak dan biaya lain | Belum terlihat pada foto; jangan otomatis menambahkan rumusnya. |
| Koreksi historis | Apakah transaksi boleh diubah setelah dilunasi atau diretur? Bagaimana penelusurannya? |
| Customer umum | Apakah penjualan tanpa customer terdaftar diperlukan? |
| Hak akses | Apakah satu operator atau beberapa akun dengan izin berbeda? |
| Cetak invoice | Versi normal dan COPY sudah diminta. Ukuran kertas, jenis printer, pola nomor, serta kebutuhan tanda tangan/logo asli perlu ditentukan. |
| Profil invoice | Apakah menggunakan identitas Mitra Ecobike, UD. Bhakti Mandala Wijaya, identitas lain, atau beberapa profil? |
| Serial number | Apakah wajib untuk kategori tertentu, dan bagaimana mencetak beberapa serial number dalam satu baris barang? |

Rumus dasar subtotal = kuantitas × harga satuan merupakan usulan yang sesuai tampilan, bukan bukti semua perhitungan lama telah diketahui. Rumus saldo dan laba baru dikunci setelah diskon, retur, pembayaran, saldo awal, serta metode biaya disepakati.

## 10. Tahapan pembangunan yang diusulkan

### Tahap A — Fondasi dan transaksi dasar

- Tentukan OS target, aturan satuan, nomor, harga, dan pembayaran dasar.
- Buat kerangka Tauri, penyimpanan CSV, commit konsisten, dan pemulihan.
- Master barang, customer, pemasok, stok awal, dan saldo awal.
- Pembelian, penjualan, pencarian dokumen, koreksi/pembatalan.
- Invoice siap cetak versi normal dan COPY, pratinjau, serta snapshot data untuk cetak ulang.
- Laporan stok, penjualan, pembelian, dan daftar customer.
- Dashboard awal: total penjualan, jumlah transaksi, dan laba kotor setelah metode biaya ditetapkan; filter periode serta akses rincian laporan.
- Backup/pemulihan serta build yang dapat dibuka pengguna tanpa Yarn.

### Tahap B — Kelengkapan operasional

- Order customer dan pabrik beserta pemenuhannya.
- Retur penjualan dan pembelian.
- Pelunasan customer dan pabrik, alokasi pembayaran, dan laporan saldo.
- Seluruh laporan order dan retur pada referensi.
- Discount Pembelian setelah aturannya jelas.

### Tahap C — Kelengkapan laporan dan pengalaman pakai

- Total Barang Terjual dan laporan Modal/Laba lengkap dengan rumus yang disepakati; kartu laba kotor dashboard sudah masuk Tahap A.
- Penyempurnaan dashboard: tren, produk terlaris, dan ringkasan operasional sesuai modul yang tersedia.
- Penyempurnaan keyboard, ekspor laporan, serta cetak laporan jika diperlukan. Cetak invoice normal/COPY sudah masuk Tahap A.
- Password/hak akses bila diperlukan.
- Migrasi data lama bila format sumbernya tersedia.

Tahapan hanya mengurutkan pengerjaan. Fitur pada referensi tetap tercatat sebagai cakupan keseluruhan dan tidak dihapus dari kebutuhan karena ditempatkan di tahap berikutnya.

## 11. Kriteria penerimaan

- [ ] Pengguna dapat membuka aplikasi hasil build tanpa menjalankan Yarn, Node, Rust, atau terminal secara manual.
- [ ] Pada OS target, prasyarat runtime yang diperlukan ditangani melalui distribusi yang dipilih.
- [ ] Fungsi utama bekerja tanpa koneksi internet; aset tampilan tersedia lokal.
- [ ] Membuka ulang aplikasi memuat data CSV terakhir secara otomatis.
- [ ] Menambah/mengubah data menulis ke penyimpanan lokal tanpa dialog pilih CSV.
- [ ] Draf tidak memengaruhi stok dan saldo sebelum transaksi disahkan.
- [ ] Satu transaksi dengan beberapa barang tersimpan lengkap dan tidak diterapkan dua kali.
- [ ] Pembelian, penjualan, retur, koreksi, serta pembatalan menghasilkan mutasi yang sesuai aturan.
- [ ] Pembayaran sebagian dan penuh memperbarui saldo serta alokasi dengan benar.
- [ ] Data historis tidak berubah hanya karena harga atau nama master diperbarui.
- [ ] Semua menu laporan yang terinventarisasi memiliki padanan pada aplikasi baru.
- [ ] Rentang tanggal dan rentang kode menghasilkan daftar yang sesuai aturan filter.
- [ ] Data berkoma, bertanda kutip, memakai karakter Indonesia, atau berkode berawalan nol tetap utuh setelah simpan dan baca ulang.
- [ ] Kegagalan menulis file ditampilkan; UI tidak menyatakan berhasil sebelum commit selesai.
- [ ] Proses berhenti di tengah simpan tidak menyisakan transaksi setengah diterapkan setelah pemulihan.
- [ ] Dua instance tidak dapat menulis kumpulan data yang sama secara bersamaan.
- [ ] Backup yang dipulihkan menghasilkan data dan laporan yang konsisten.
- [ ] Data pengguna tetap tersedia setelah aplikasi diperbarui.
- [ ] Invoice dapat dihasilkan dari penjualan final dengan pratinjau siap cetak, tanpa menyusun dokumen secara manual.
- [ ] Versi normal menampilkan judul Invoice dan tidak memiliki penanda COPY di halaman mana pun.
- [ ] Versi COPY menampilkan judul Copy Invoice serta cap/watermark COPY sesuai rancangan yang disetujui.
- [ ] Kedua versi memiliki nomor referensi, tanggal, penerima, barang, serial number, harga, total, dan pembayaran yang sama.
- [ ] Cetak, cetak ulang, serta cetak kedua versi tidak membuat transaksi, stok, atau tagihan ganda.
- [ ] Profil penerbit, penerima, rekening, terms of payment, garansi, dan area tanda tangan tercetak sesuai snapshot invoice.
- [ ] Perubahan master atau template tidak mengubah isi historis invoice tanpa proses koreksi yang eksplisit.
- [ ] Data panjang dan invoice beberapa halaman tercetak tanpa kolom terpotong atau informasi bertumpuk pada ukuran kertas yang dipilih.
- [ ] Pratinjau dan cetak dapat digunakan offline pada OS/printer target.
- [ ] Halaman awal menampilkan dashboard dengan total penjualan, keuntungan yang diberi label sesuai cakupannya, dan jumlah transaksi.
- [ ] Filter periode memperbarui seluruh metrik periode serta rincian terkait secara konsisten.
- [ ] Kartu saldo sampai tanggal akhir dan stok terkini diberi label yang membedakannya dari aktivitas selama periode.
- [ ] Total penjualan, laba kotor, dan jumlah transaksi dapat ditelusuri serta cocok dengan laporan pada filter yang sama.
- [ ] Draf, transaksi batal, pembayaran, serta cetak ulang invoice tidak menyebabkan penghitungan penjualan ganda.
- [ ] Perubahan harga beli master tidak mengubah keuntungan penjualan historis.
- [ ] Dashboard membedakan tidak ada aktivitas, kerugian, dan data biaya yang belum lengkap.
- [ ] Setelah penyimpanan final berhasil, dashboard memperbarui angka yang terdampak dan tetap dapat digunakan offline.

## 12. Batas cakupan dan informasi lanjutan

Asumsi rancangan awal: satu toko, satu komputer, satu penulis data pada satu waktu. Ini belum dikonfirmasi pengguna. Sinkronisasi antarperangkat, akses CSV bersama melalui jaringan, cloud, dan aplikasi mobile belum masuk rancangan awal.

Data lama belum dilampirkan. Foto bukan database; belum ada dasar untuk menjanjikan impor otomatis dari aplikasi lama.

Sebelum implementasi rinci, informasi paling penting adalah OS target, contoh data barang beserta satuan/isi, alur tunai/kredit, aturan diskon dan retur, arti Modal/Laba, serta ukuran kertas/printer dan profil penerbit invoice. Kebutuhan cetak invoice normal/COPY sudah dikonfirmasi melalui permintaan pengguna. Pertanyaan lain dapat diselesaikan per modul tanpa menghambat pembuatan rancangan awal.

## 13. Daftar referensi foto

Tautan berikut menunjuk file sumber lokal saat dokumen disusun. Jika dokumen dipindahkan ke komputer lain, gambar perlu disertakan terpisah. Isi utama dokumen tetap dapat dibaca tanpa gambar.

| Foto | Tampilan | File sumber |
| --- | --- | --- |
| 1 | Transaksi Pembelian | [31be6ca7-66b6-4eb5-b908-479fcd20484c.JPG](/Users/christian.wijaya/Downloads/31be6ca7-66b6-4eb5-b908-479fcd20484c.JPG) |
| 2 | Transaksi Penjualan | [c403cbcf-0656-4b7a-9092-47037a02e32d.JPG](/Users/christian.wijaya/Downloads/c403cbcf-0656-4b7a-9092-47037a02e32d.JPG) |
| 3 | Filter Transaksi Penjualan | [ac7bf927-8a34-48d9-a402-de83f415ac91.JPG](/Users/christian.wijaya/Downloads/ac7bf927-8a34-48d9-a402-de83f415ac91.JPG) |
| 4 | Filter Stock Barang | [77875a11-f90f-4464-89cf-1beb20526c09.JPG](/Users/christian.wijaya/Downloads/77875a11-f90f-4464-89cf-1beb20526c09.JPG) |
| 5 | Filter Data Customer | [1ce7282e-c8e7-4ddc-b38c-40c3bfce1583.JPG](/Users/christian.wijaya/Downloads/1ce7282e-c8e7-4ddc-b38c-40c3bfce1583.JPG) |
| 6 | Menu Lihat Data | [6651586d-536e-4136-bf37-058840f75ec5.JPG](/Users/christian.wijaya/Downloads/6651586d-536e-4136-bf37-058840f75ec5.JPG) |
| 7 | Menu Transaksi | [69de7ebc-87ff-4c94-a424-b47315262a97.JPG](/Users/christian.wijaya/Downloads/69de7ebc-87ff-4c94-a424-b47315262a97.JPG) |
| 8 | Menu Hapus Data | [53d1b0de-c182-431c-9168-606b5df7f540.JPG](/Users/christian.wijaya/Downloads/53d1b0de-c182-431c-9168-606b5df7f540.JPG) |
| 9 | Cari nota untuk ubah penjualan | [2ec847c2-02ff-4112-b075-c0ced9adf10f.JPG](/Users/christian.wijaya/Downloads/2ec847c2-02ff-4112-b075-c0ced9adf10f.JPG) |
| 10 | Ubah Barang Baru | [fbf5eb7c-2686-40dd-9f17-f8f5d430fe64.JPG](/Users/christian.wijaya/Downloads/fbf5eb7c-2686-40dd-9f17-f8f5d430fe64.JPG) |
| 11 | Cari nomor Ubah Order Pembelian | [9ba08a22-c60c-4929-a6af-895ee7a14f52.JPG](/Users/christian.wijaya/Downloads/9ba08a22-c60c-4929-a6af-895ee7a14f52.JPG) |
| 12 | Cari nomor Ubah Order Penjualan | [258e25a1-212f-42c0-81bf-ede3836eae8b.JPG](/Users/christian.wijaya/Downloads/258e25a1-212f-42c0-81bf-ede3836eae8b.JPG) |
| 13 | Menu Ubah Data | [4af6ccf2-99b9-43d9-b9e4-afa725cf56fa.JPG](/Users/christian.wijaya/Downloads/4af6ccf2-99b9-43d9-b9e4-afa725cf56fa.JPG) |
| 14 | Masukan Data Customer | [2ec5d7ac-a62b-43e6-9494-2c7bbe50736e.JPG](/Users/christian.wijaya/Downloads/2ec5d7ac-a62b-43e6-9494-2c7bbe50736e.JPG) |
| 15 | Masukan Barang Baru | [9fa5f80d-a8ff-4dcd-ba98-5053e9d0ddc9.JPG](/Users/christian.wijaya/Downloads/9fa5f80d-a8ff-4dcd-ba98-5053e9d0ddc9.JPG) |
| 16 | Menu Masuk Data | [4044b3f5-e690-4096-be4e-8e6181364315.JPG](/Users/christian.wijaya/Downloads/4044b3f5-e690-4096-be4e-8e6181364315.JPG) |
| 17 | Beranda dan menu utama | [c88be5c1-10f4-4e22-9b41-dd5c24adabc4.JPG](/Users/christian.wijaya/Downloads/c88be5c1-10f4-4e22-9b41-dd5c24adabc4.JPG) |
| 18 | Contoh invoice cetak, judul Copy Invoice dan cap COPY diagonal | [016f3459-7836-4951-8ba3-c97118319657.JPG](/Users/christian.wijaya/Downloads/016f3459-7836-4951-8ba3-c97118319657.JPG) |

Referensi teknis untuk rancangan Tauri: [Distribusi aplikasi](https://v2.tauri.app/distribute/) dan [akses file lokal](https://v2.tauri.app/plugin/file-system/). Tautan ini mendukung pendekatan teknis, bukan sumber aturan bisnis toko.


## Impor CSV lengkap (tambahan kebutuhan pengguna)

Pengguna meminta impor untuk seluruh data operasional termasuk transaksi dan pembayaran, dengan pilihan Upsert atau Replace. Implementasi mencakup barang, customer, enam jenis dokumen, pembayaran dan alokasi, serta impor gabungan dari Pengaturan. Laporan dihitung ulang dari data sumber.

Upsert mencocokkan kode/nomor tanpa membedakan kapital dan mempertahankan ID lokal. Replace hanya mengganti dataset yang disertakan; master yang masih dirujuk dinonaktifkan, penghapusan dokumen yang masih dirujuk ditolak. CSV gabungan menyertakan penanda dataset kosong agar Replace seluruh kategori dapat dilakukan secara eksplisit.

Ekspor memuat detail baris, diskon produk, SN, snapshot invoice, urutan dokumen, relasi order/retur, uang muka dan alokasi. Pratinjau menampilkan tambah/perbarui/hapus/nonaktifkan, validasi dilakukan pada salinan data, revisi diperiksa kembali saat penerapan, dan satu kegagalan membatalkan seluruh impor. Template dan panduan ada di `IMPORT_CSV.md`. Profil toko dan riwayat aktivitas tetap melalui backup lengkap.

Pengerjaan fitur ini hanya pada source lokal; tidak membuat build aplikasi, commit, atau push.


## Penyempurnaan invoice berdasarkan klarifikasi pengguna

Pengguna memperjelas bahwa hasil cetak harus menyertakan logo Mitra Ecobike dan Phylion, teks WARRANTY TERMS & CONDITIONS, rekening bank, dan tanda tangan seperti referensi; bukan hanya area template kosong. Data referensi tersebut disediakan sebagai bawaan yang dapat diedit melalui Pengaturan. Nama toko/sidebar dan nama penerbit invoice dapat diatur terpisah. Invoice lama yang kosong dilengkapi untuk identitas Mitra, serta tersedia aksi mengambil profil terbaru pada pratinjau. Nilai transaksi dan pembayaran tidak berubah akibat pembaruan profil cetak.


Logo default harus sama dengan logo pada referensi pengguna. Pengaturan menyediakan unggah logo masing-masing serta Reset ke bawaan per logo; reset selalu mengembalikan aset asli yang sama dan bisa digunakan kembali pada invoice.


Klarifikasi terbaru: invoice harus otomatis memakai data penerbit, logo, rekening, tanda tangan, dan garansi dari Pengaturan yang telah disimpan. Default cetak memakai Pengaturan tersimpan; pengguna masih bisa memilih Profil saat transaksi untuk cetak ulang historis. Perubahan tampilan tidak mengganti data sumber transaksi maupun snapshot yang tersimpan kecuali pengguna memilih aksi Simpan profil ke dokumen.


Default teks garansi, syarat pembayaran, dan negara berlaku juga untuk profil pengaturan bernama khusus seperti BMW. Field kosong pada profil lama dilengkapi sekali, tetap dapat diedit, serta dapat dikembalikan lewat reset per bagian. Rekening dan identitas pengguna tidak ikut ditimpa.


## Klarifikasi penghapusan customer — 28 Oktober 2026

Pengguna membatasi perubahan penghapusan hanya pada customer. Hapus customer cukup satu konfirmasi dan menghilangkannya dari daftar customer, laporan daftar customer, serta pilihan transaksi baru, termasuk ketika daftar nonaktif ditampilkan. Penjualan, order, retur, invoice, pembayaran, stok, dan saldo historis tetap tersimpan. Tagihan lama tetap dapat dilunasi. Referensi identitas customer disimpan internal dengan penanda hapus agar relasi transaksi tetap valid; kode historis tetap dicadangkan. Ekspor/impor semua data serta backup harus mempertahankan penanda ini. Aturan penghapusan barang, dokumen, retur, dan pembayaran tidak berubah.


## Penyempurnaan cetak dan navigasi — 28 Oktober 2026

Laporan stok dicetak dengan baris lebih padat. Cetakan daftar customer memakai kolom kode/kota lebih kecil, alamat lebih lebar, tanpa kolom fax. Daftar customer/barang, pilihan transaksi, laporan, dan CSV master diurutkan berdasarkan kode A–Z secara natural (B2 sebelum B10).

Invoice menampilkan total transaksi, DP sebagai pengurang, dan Grand Total sebagai sisa pembayaran tanpa mengubah nilai transaksi dalam laporan. DP tidak diulang pada Terms of Payment. Area garansi mengikuti tinggi konten tanpa ruang kosong besar; label telepon penerbit ditulis lengkap dan memiliki jarak antarblok. Tombol Cetak invoice/Cetak COPY tersedia langsung di kolom Aksi penjualan final. Tombol Minimize ditambahkan di samping Keluar untuk aplikasi desktop; preview browser menampilkannya nonaktif.
