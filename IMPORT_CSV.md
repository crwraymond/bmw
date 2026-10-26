# Impor dan ekspor CSV

CSV bisa dipakai untuk memindahkan atau memperbarui **barang, customer, order customer, order pembelian, penjualan, pembelian, kedua jenis retur, dan pembayaran beserta alokasinya**. Laporan, stok berjalan, modal persediaan, piutang, hutang, serta keuntungan dihitung dari data sumber tersebut.

## Cara memakai

- Dari halaman data: pilih **Ekspor CSV**, atau buka **Impor CSV → Unduh template**. Ekspor halaman mengikuti pencarian/filter yang sedang aktif.
- Untuk seluruh data operasional: buka **Pengaturan → Ekspor semua data (CSV)**. File gabungan mencakup seluruh data aktif, nonaktif, draf, final, dan dibatalkan, tanpa mengikuti filter halaman.
- Buka **Impor CSV** pada halaman terkait, atau **Pengaturan → Impor data (CSV)** untuk file gabungan maupun beberapa file hasil ekspor halaman.
- Pilih **Upsert** atau **Replace**, unggah file, lalu klik **Periksa file**. Tinjau jumlah tambah/perbarui/hapus/nonaktifkan beserta kode/nomor yang terdampak.
- Klik **Terapkan**. Mode Replace memerlukan centang pemahaman perubahan yang ditampilkan. Menutup dialog sebelum menerapkan tidak mengubah data.

**Upsert** mencocokkan barang/customer berdasarkan kode, transaksi berdasarkan jenis dan nomor, serta pembayaran berdasarkan nomor. Huruf besar/kecil diabaikan. Data yang cocok diperbarui dengan ID lokal yang sama, data baru ditambahkan, dan data lain dipertahankan.

**Replace** mengganti jenis data yang disertakan dalam file. Jenis data lain tetap disimpan. Barang/customer yang tidak disertakan dihapus bila tidak dipakai, atau dinonaktifkan bila masih dirujuk dokumen/pembayaran yang dipertahankan. Penghapusan transaksi yang masih dirujuk order, retur, atau pembayaran ditolak. Sertakan data rujukan dalam impor gabungan untuk menggantinya bersama-sama.

File gabungan membawa penanda `Dataset kosong` untuk kategori tanpa data. Dalam Replace, kategori itu ikut dikosongkan. Jangan menghapus/mengubah penanda tersebut. File biasa yang hanya berisi header ditolak agar template kosong tidak menghapus data.

## Format umum

- Encoding UTF-8; BOM diperbolehkan. Pemisah koma, titik koma, dan tab dibaca otomatis.
- Teks yang berisi koma, kutip, atau baris baru mengikuti aturan CSV: bungkus dengan kutip ganda; kutip di dalam teks ditulis dua kali. Excel mengurus pengutipan ini ketika menyimpan CSV.
- Tanggal menggunakan `YYYY-MM-DD`, misalnya `2026-10-25`, dan tidak boleh di masa depan untuk dokumen/pembayaran aktif.
- Angka memakai format Indonesia: `1.450.000` untuk harga, `1.234,567` untuk qty. Rupiah bilangan bulat, qty maksimal tiga desimal, diskon persen maksimal dua desimal. Tanpa pemisah juga diterima: `1450000`.
- Kode, telepon, rekening pada snapshot invoice, dan SN dibaca sebagai teks. Atur kolom sebagai **Text** di Excel supaya nol awal tidak hilang sebelum file disimpan.
- Teks berawalan karakter formula diberi apostrof pelindung saat ekspor. Impor mengembalikan teksnya tanpa mengeksekusi formula. Formula pada kolom angka ditolak.
- Batas per file: 20 MB dan 10.000 baris. Untuk arsip lengkap berukuran besar gunakan backup.
- Kolom opsional yang tidak ada mempertahankan nilai lama pada Upsert. Kolom yang ada tetapi kosong mengosongkan teks atau memberi angka nol. Kolom wajib tidak boleh kosong.
- Nama kolom boleh berbeda huruf besar/kecil dan spasi tepi. Gunakan nama dari template; kolom tak dikenal diabaikan dengan pemberitahuan.

## Barang dan customer

Barang wajib memiliki `Kode`, `Nama`, dan `Satuan`. Kolom lain: `Isi`, `Harga beli`, `Harga jual`, `Stok awal`, `Nilai stok awal`, `Stok minimum`, `Aktif`. Nilai stok awal adalah **total modal stok awal**, bukan modal per unit.

Form pendaftaran barang baru selalu memulai stok/nilai awal dari nol; pemasukan stok rutin dicatat melalui Pembelian final. Kolom stok awal CSV tetap didukung untuk migrasi atau pemulihan data historis agar ekspor/impor tidak menghilangkan saldo dan HPP lama.

Customer wajib memiliki `Kode` dan `Nama`. Kolom lain: `Alamat`, `Kota`, `Telepon`, `Fax`, `Saldo awal`, `Aktif`. Aktif diisi `ya` atau `tidak`.

Kolom `Stok tersedia`, `Nilai stok tersedia`, dan `Saldo berjalan` adalah hasil perhitungan dan diabaikan saat impor. Ekspor lama yang hanya mempunyai `Stok`/`Saldo` berjalan ditolak; memakainya sebagai saldo awal akan menghitung transaksi dua kali. Ekspor ulang dengan versi terbaru.

Contoh barang:

```csv
Kode,Nama,Satuan,Harga beli,Harga jual,Stok awal,Nilai stok awal,Aktif
001,Baterai 48V,pcs,1000000,1450000,10,10000000,ya
002,Charger,pcs,100000,200000,0,0,ya
```

## Transaksi dan order

**Satu baris untuk setiap barang pada sebuah dokumen.** Ulangi nomor, tanggal, status, customer, diskon total, uang muka, catatan, nomor order, dan transaksi asal secara konsisten pada semua baris dokumen yang sama. Barang yang sama tidak boleh diulang dalam satu dokumen; gabungkan qty-nya.

Kolom wajib: `Nomor`, `Tanggal`, `Kode barang`, `Qty`, `Harga`. Transaksi customer juga harus menyertakan `Kode customer` yang sudah terdaftar atau ikut diimpor. Transaksi pembelian memakai pemasok tunggal otomatis.

Kolom lainnya:

| Kolom | Isi |
| --- | --- |
| Status | `draft`, `final`, atau `cancelled`; data baru default `final` |
| Nama barang, Satuan | Snapshot teks barang pada dokumen |
| Jenis diskon produk | `amount` (Rp per unit) atau `percent` (%) |
| Diskon produk | Nilai diskon per unit atau persen sesuai jenisnya |
| Diskon total | Diskon tambahan seluruh dokumen dalam Rupiah |
| Uang muka | Nominal DP, hanya untuk penjualan |
| SN | Serial sebagai teks, dipisahkan koma dan diapit kutip bila perlu |
| Nomor order | Nomor order customer/pembelian yang dipenuhi |
| Nomor transaksi asal | Nomor penjualan/pembelian asal retur |
| Kode barang asal | Kode barang pada transaksi asal retur |
| Urutan | Urutan relatif dokumen pada tanggal yang sama; pertahankan hasil ekspor |
| Data invoice | JSON snapshot identitas penerbit/customer, logo, rekening, syarat, garansi, tanda tangan, dan metadata; hanya pada satu baris per dokumen |
| Total baris, HPP baris, Total | Hasil hitung; transaksi final dihitung ulang dari sumber, bukan dipercaya dari angka ekspor |

Contoh penjualan (impor dari halaman Penjualan):

```csv
Nomor,Tanggal,Kode customer,Kode barang,Qty,Harga,Jenis diskon produk,Diskon produk
INV/2026/001,2026-10-25,C001,001,2,1450000,percent,5
INV/2026/001,2026-10-25,C001,002,1,200000,amount,10000
```

Order harus tersedia sebelum transaksi pemenuhannya dan transaksi asal harus tersedia sebelum retur. Dalam impor gabungan seluruh file diperiksa bersama sehingga relasinya dapat diselesaikan sekaligus. Harga pokok, diskon proporsional retur, stok, dan sisa order dihitung ulang; qty berlebih atau stok negatif menolak seluruh impor.

## Pembayaran

**Satu baris untuk setiap alokasi tagihan.** Ulangi nomor pembayaran, tanggal, arah, customer, nominal, status, catatan, dan invoice uang muka secara konsisten. Pembayaran tanpa alokasi cukup satu baris dengan tagihan/alokasi kosong; nominalnya hanya boleh melunasi saldo awal.

Kolom wajib: `Nomor`, `Tanggal`, `Arah`, `Nominal`, `Nomor tagihan`, `Alokasi`. `Kode customer` diperlukan untuk arah `in` (penerimaan customer); arah `out` memakai pemasok tunggal. Status `final` atau `cancelled`, default `final`.

`Nomor invoice uang muka` menandai pembayaran DP yang terkait langsung dengan penjualan. Hasil ekspor sudah mengisinya. Nominal DP transaksi dan pembayaran harus cocok; impor gabungan mempertahankan relasi itu tanpa membuat pembayaran ganda. DP yang sudah dibatalkan tetap menjadi riwayat pembatalan.

```csv
Nomor,Tanggal,Arah,Kode customer,Nominal,Nomor tagihan,Alokasi
PAY/001,2026-10-25,in,C001,1500000,INV/2026/001,1500000
```

Alokasi yang melebihi nominal pembayaran, tagihan yang tidak ditemukan, pihak yang tidak cocok, tanggal sebelum tagihan, dan pembayaran berlebih ditolak. Kredit historis dari pembayaran sebelum retur dipertahankan.

## Konsistensi dan backup

Pemeriksaan dilakukan pada salinan data. Bila satu baris atau satu relasi gagal, **tidak ada bagian file yang disimpan**. Jika data berubah setelah pratinjau, pengguna harus memeriksa file kembali. Penerapan mengikuti penyimpanan atomik dan pemeriksaan revisi yang sama dengan edit manual; aktivitas impor dicatat.

CSV gabungan memindahkan data operasional. Profil toko serta riwayat aktivitas perangkat dipertahankan. **Backup/pemulihan** tetap tersedia untuk salinan lengkap data termasuk pengaturan dan audit: folder CSV dengan manifest pada desktop, JSON pada pratinjau browser. File CSV internal generasi penyimpanan bukan format impor pengguna; gunakan ekspor dari UI.
