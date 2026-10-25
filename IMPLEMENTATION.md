# Keputusan implementasi dan verifikasi

Tanggal: 25 Oktober 2026. Target pengguna: Windows x64, sesuai arahan pengguna. Build Windows melalui GitHub Actions.

## Aturan yang dipakai pada versi awal

- Semua uang berupa Rupiah bulat. Kuantitas maksimal tiga desimal.
- Satu satuan dasar per barang. Isi/kemasan berupa keterangan; belum ada konversi dus ke pcs otomatis.
- Nilai stok awal adalah total biaya seluruh stok awal. Angka nol merupakan biaya nol, bukan biaya yang belum diketahui.
- HPP menggunakan rata-rata bergerak. Harga dan total biaya penjualan dikunci pada saat pengesahan.
- Mutasi final harus bertanggal tidak lebih awal dari mutasi terakhir. Koreksi historis tidak melakukan perhitungan ulang HPP diam-diam.
- Diskon adalah nominal total dokumen, dialokasikan proporsional ke baris dengan pembulatan kumulatif agar jumlah alokasi tepat. Retur mengembalikan nilai bersih proporsional.
- Order tidak mencadangkan/mengubah stok. Pemenuhan boleh sebagian; kuantitas tidak boleh melebihi sisa order. Retur tidak otomatis membuka kembali order yang sudah dipenuhi.
- Retur penjualan dianggap stok layak jual, mengembalikan biaya asal. Retur pembelian mengeluarkan persediaan dengan biaya rata-rata saat retur; kredit pemasok mengikuti nilai bersih pembelian asal. Selisih biaya retur pembelian tidak dimasukkan sebagai laba penjualan.
- Pembayaran customer/pemasok dialokasikan ke nota/faktur. Bagian tanpa alokasi hanya untuk saldo awal, bukan uang muka bebas untuk order mendatang.
- Retur setelah lunas menghasilkan saldo kredit. Pengembalian uang atas kredit dan pemindahan kredit ke tagihan lain belum menjadi jenis transaksi tersendiri.
- Dokumen final tidak diedit/diapus permanen. Batalkan dengan alasan dan buat pengganti. Pembayaran serta dokumen turunan harus dibatalkan lebih dahulu. Pembatalan mutasi lama diblokir bila ada mutasi lebih baru pada barang terkait.
- Master yang dipakai tetap ada dan dapat dinonaktifkan. Stok/saldo awal dikunci setelah dipakai.
- Dashboard dan laporan keuntungan menampilkan laba kotor. Belum ada biaya operasional, pajak, atau laba bersih.
- Penjualan dan retur mengikuti tanggal dokumen, pembayaran mengikuti tanggal pembayaran. Tanggal/zona waktu mengikuti perangkat toko.
- Piutang/hutang adalah saldo sampai tanggal akhir; stok minimum adalah stok terkini. Label dashboard membedakan keduanya dari aktivitas periode.

## Invoice

Profil penerbit, customer, logo, rekening, terms, dan garansi disalin saat dokumen dibuat/disahkan; perubahan master tidak mengganti invoice historis. Uang muka dicatat sebagai pembayaran dalam commit yang sama dengan penjualan. Invoice mencetak uang muka saat penerbitan, bukan saldo pembayaran yang berubah setelahnya.

Normal dan COPY mempunyai nomor serta nilai yang sama. COPY memiliki judul dan cap berbeda pada setiap lembar. Pemisahan lembar menggunakan pengukuran tinggi konten pada pratinjau. Baris yang terlalu tinggi untuk satu lembar akan ditandai dan pencetakan diblokir sampai diringkas. Pratinjau menggunakan A4 portrait. Printer fisik dan WebView2 Windows perlu pemeriksaan di perangkat pengguna.

PDF pengujian memakai fixture toko uji pada browser terisolasi, bukan identitas/rekening pengguna dari foto. Logo asli perlu diunggah melalui Pengaturan; aplikasi tidak mengekstrak logo dari foto invoice.

## Perbaikan versi 0.1.1

- Layout invoice mengikuti susunan referensi: logo penerbit di atas kiri, judul di kiri dan logo mitra di kanan, grid ringkas, Rp sejajar, terms/uang muka satu baris, blok rekening, tanda tangan, dan cap COPY bergaris luar. Identitas dan logo tetap mengikuti snapshot dokumen.
- Dropdown memakai panah dengan jarak kanan yang konsisten. Customer/pemasok dan barang dapat dicari langsung pada field pilihan.
- Kode barang yang cocok langsung mengaktifkan tombol tambah. Enter menambahkan barang tanpa menyimpan dokumen; memasukkan barang yang sama menaikkan kuantitas.
- Input numerik menampilkan pemisah ribuan titik dan desimal koma. Nol di depan dinormalisasi; nilai tersimpan tetap angka. Kode barang, nomor telepon, dan SN tetap berupa teks.
- Lima regresi UI tambahan mencakup keluhan tersebut; delapan pengujian browser dan empat belas pengujian domain lolos lokal. PDF normal/COPY dan invoice panjang diperiksa, termasuk batas halaman dan tanda tangan akhir.
- Identifier aplikasi serta skema data tetap sama agar pembaruan menggunakan penyimpanan yang sudah ada.

## Penyimpanan dan keamanan

Delapan CSV memuat master, dokumen, detail, pembayaran/alokasi, audit, dan pengaturan. Stok, saldo, serta data invoice diturunkan dari dokumen/snapshot yang sama, bukan file laporan terpisah. Bentuk file ini menyederhanakan daftar CSV usulan pada spesifikasi tanpa mengganti penyimpanan menjadi database lain.

Satu proses penulis dijaga oleh plugin single-instance dan mutex. Setiap commit memeriksa revisi, menulis seluruh snapshot, menyinkronkan file ke disk, kemudian mempublikasikan direktori generasi. SHA-256 mendeteksi kerusakan file. Sinkronisasi direktori eksplisit dilakukan pada Unix; perilaku ketahanan terhadap mati listrik pada Windows tetap perlu uji perangkat nyata. Tidak ada sinkronisasi banyak komputer atau berbagi folder CSV aktif.

Password opsional memakai Argon2 dengan salt acak dan pemeriksaan di perintah backend yang mengakses data. CSV tidak terenkripsi, dan tidak ada peran admin/kasir terpisah. Backup data tidak menyertakan password.

## Hasil verifikasi lokal

- TypeScript dan build produksi frontend: lolos.
- Pengujian domain: stok/HPP, diskon, retur, draf, saldo, pembayaran parsial, kredit, order, pembatalan, kode duplikat, stok awal, dan validasi pemulihan.
- Pengujian Rust: CSV roundtrip (koma/kutip/newline/nol di depan), konflik revisi, commit terputus, checksum rusak, backup, dan hash password.
- Pengujian browser: alur operasional lengkap, penyimpanan setelah reload, backup/pemulihan, seluruh kategori laporan, mobile, dan invoice panjang normal/COPY.
- Paket Windows dan pengujian Rust Windows: dijalankan melalui workflow. Status run GitHub menjadi bukti hasil Windows, bukan hasil kompilasi macOS.

## Batas versi awal

Belum ada impor format database aplikasi DOS karena file sumber belum tersedia. Belum ada multi-cabang, sinkronisasi cloud, perpajakan, biaya operasional/laba bersih, konversi satuan otomatis, refund uang tunai atas saldo kredit, atau matriks hak akses pengguna. Aturan awal di atas perlu ditinjau bersama operator sebelum memakai data operasional nyata.
