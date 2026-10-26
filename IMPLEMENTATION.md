# Keputusan implementasi dan verifikasi

Tanggal: 25 Oktober 2026. Target pengguna: Windows x64, sesuai arahan pengguna. Build Windows melalui GitHub Actions.

## Aturan yang dipakai pada versi awal

- Semua uang berupa Rupiah bulat. Kuantitas maksimal tiga desimal.
- Satu satuan dasar per barang. Isi/kemasan berupa keterangan; belum ada konversi dus ke pcs otomatis.
- Nilai stok awal adalah total biaya seluruh stok awal. Angka nol merupakan biaya nol, bukan biaya yang belum diketahui.
- HPP menggunakan rata-rata bergerak. Harga dan biaya penjualan disimpan saat pengesahan; edit data yang memengaruhi biaya menghitung ulang riwayat terkait secara atomik.
- Transaksi baru harus bertanggal tidak lebih awal dari mutasi terakhir. Edit historis menyusun ulang mutasi berdasarkan tanggal dan menghitung ulang HPP, dengan validasi stok pada setiap tahap.
- Diskon produk berupa persen (maksimal dua desimal) atau Rupiah per unit. Diskon produk dibulatkan ke Rupiah per baris. Diskon nominal total dokumen diterapkan sesudahnya dan dialokasikan proporsional terhadap nilai bersih tiap baris dengan pembulatan kumulatif. Retur mengembalikan nilai bersih asal secara proporsional, termasuk seluruh diskon.
- Order tidak mencadangkan/mengubah stok. Pemenuhan boleh sebagian; kuantitas tidak boleh melebihi sisa order. Retur tidak otomatis membuka kembali order yang sudah dipenuhi.
- Retur penjualan dianggap stok layak jual, mengembalikan biaya asal. Retur pembelian mengeluarkan persediaan dengan biaya rata-rata saat retur; kredit pemasok mengikuti nilai bersih pembelian asal. Selisih biaya retur pembelian tidak dimasukkan sebagai laba penjualan.
- Pembayaran customer/pemasok dialokasikan ke nota/faktur. Bagian tanpa alokasi hanya untuk saldo awal, bukan uang muka bebas untuk order mendatang.
- Retur setelah lunas menghasilkan saldo kredit. Pengembalian uang atas kredit dan pemindahan kredit ke tagihan lain belum menjadi jenis transaksi tersendiri.
- Dokumen final dan pembayaran dapat diedit langsung. ID dokumen/baris tetap digunakan; status tetap final. Validasi menolak perubahan yang membuat stok minus, retur/pemenuhan berlebih, tanggal alokasi tidak valid, atau pembayaran melampaui total baru. Pembatalan dengan alasan tetap tersedia sebagai tindakan terpisah.
- Master yang dipakai tetap ada dan dapat dinonaktifkan. Stok/nilai awal dapat diedit dengan perhitungan ulang HPP; saldo awal dapat diedit selama pembayaran tanpa alokasi tidak melebihi saldo baru.
- Dashboard dan laporan keuntungan menampilkan laba kotor. Belum ada biaya operasional, pajak, atau laba bersih.
- Penjualan dan retur mengikuti tanggal dokumen, pembayaran mengikuti tanggal pembayaran. Tanggal/zona waktu mengikuti perangkat toko.
- Piutang/hutang adalah saldo sampai tanggal akhir; stok minimum adalah stok terkini. Label dashboard membedakan keduanya dari aktivitas periode.

## Invoice

Profil penerbit, customer, logo, rekening, terms, dan garansi disalin saat dokumen dibuat/disahkan. Invoice historis dapat mengambil profil penerbit terbaru lewat aksi eksplisit pada pratinjau; customer dan angka transaksi tetap. Migrasi template melengkapi kolom kosong pada dokumen Mitra lama sekali saja. Uang muka dicatat sebagai pembayaran dalam commit yang sama dengan penjualan. Invoice mencetak uang muka saat penerbitan, bukan saldo pembayaran yang berubah setelahnya.

Normal dan COPY mempunyai nomor serta nilai yang sama. COPY memiliki judul dan cap berbeda pada setiap lembar. Pemisahan lembar menggunakan pengukuran tinggi konten pada pratinjau. Baris yang terlalu tinggi untuk satu lembar akan ditandai dan pencetakan diblokir sampai diringkas. Pratinjau menggunakan A4 portrait. Printer fisik dan WebView2 Windows perlu pemeriksaan di perangkat pengguna.

PDF pengujian memakai fixture pada browser terisolasi; satu fixture mencontoh susunan dan teks dari foto invoice. Fixture barang/customer tidak dimasukkan ke data operasional pengguna. Logo Mitra bawaan berasal dari potongan referensi pengguna; logo Phylion juga dipotong langsung dari referensi menjadi aset PNG. Profil penerbit, rekening BCA, dan teks garansi pada referensi menjadi bawaan yang dapat diedit melalui Pengaturan.

## Perbaikan versi 0.1.1

- Layout invoice mengikuti susunan referensi: logo penerbit di atas kiri, judul di kiri dan logo mitra di kanan, grid ringkas, Rp sejajar, terms/uang muka satu baris, blok rekening, tanda tangan, dan cap COPY bergaris luar. Identitas dan logo tetap mengikuti snapshot dokumen.
- Dropdown memakai panah dengan jarak kanan yang konsisten. Customer/pemasok dan barang dapat dicari langsung pada field pilihan.
- Kode barang yang cocok langsung mengaktifkan tombol tambah. Enter menambahkan barang tanpa menyimpan dokumen; memasukkan barang yang sama menaikkan kuantitas.
- Input numerik menampilkan pemisah ribuan titik dan desimal koma. Nol di depan dinormalisasi; nilai tersimpan tetap angka. Kode barang, nomor telepon, dan SN tetap berupa teks.
- Lima regresi UI tambahan mencakup keluhan tersebut; delapan pengujian browser dan empat belas pengujian domain lolos lokal. PDF normal/COPY dan invoice panjang diperiksa, termasuk batas halaman dan tanda tangan akhir.
- Identifier aplikasi serta skema data tetap sama agar pembaruan menggunakan penyimpanan yang sudah ada.

## Tambahan versi 0.1.2: diskon per produk

- Setiap baris order, penjualan, dan pembelian memiliki pilihan `%` atau `Rp/unit`. Rp/unit dikalikan kuantitas; persen dihitung dari nilai bruto baris. Potongan dibulatkan ke Rupiah bulat per baris, maksimal senilai harga barang.
- Contoh: Qty 2 × Rp 1.450.000 dengan diskon 10% menghasilkan potongan Rp 290.000 dan subtotal Rp 2.610.000. Diskon total di bawah form merupakan potongan tambahan dari subtotal setelah diskon produk.
- Diskon ikut disimpan pada draf, diwariskan dari order terkait, ditampilkan pada detail dan deskripsi invoice normal/COPY, serta masuk perhitungan piutang, HPP pembelian, laba kotor, dan kredit retur.
- Baris historis tanpa kolom diskon produk diperlakukan sebagai diskon nol. Sebelum penyimpanan CSV, semua baris diberi nilai default agar kolom lama/baru tetap konsisten. Total/HPP historis tidak dihitung ulang.
- Delapan belas pengujian domain dan sembilan pengujian browser lolos lokal. Pemeriksaan mencakup gabungan kedua diskon, pembulatan retur sebagian, pembelian, diskon tidak valid, draf setelah reload, invoice, dan data versi lama.

## Tambahan versi 0.1.3: SN, modal, dan pemasok tunggal

- Qty bulat positif menampilkan satu kotak SN per unit. Enter berpindah ke kotak berikutnya. Qty besar ditampilkan 12 kotak per halaman agar form tetap responsif; Qty pecahan memakai isian SN per baris.
- SN tetap berupa teks pada CSV. Koma/newline dari data lama tetap terbaca. Mengurangi Qty tidak menghapus SN yang sudah terisi secara diam-diam: SN berlebih tetap disimpan dan tersedia tindakan untuk menghapusnya. Invoice mencetak hanya SN yang terisi, satu per baris.
- Dashboard menampilkan Total modal sebagai jumlah nilai stok saat ini berdasarkan HPP. Termasuk stok barang nonaktif yang masih tersisa. Angka ini tidak mengikuti filter periode penjualan; catatan pada kartu membedakannya dari metrik periode.
- Menu pendaftaran pabrik dihapus. Field pilihan pemasok pada pembelian, order pembelian, dan pelunasan dihilangkan. Nama Order pabrik/Hutang pabrik diganti menjadi Order pembelian/Hutang pembelian.
- Satu relasi pemasok ditangani otomatis untuk menjaga konsistensi transaksi dan hutang. Jika sudah ada pemasok lama, ID-nya dipakai kembali; dokumen dan saldo historis tetap utuh. Jika belum ada, aplikasi menyiapkan pemasok internal tanpa langkah pendaftaran pengguna.
- Dua puluh satu pengujian domain dan dua belas pengujian browser lolos lokal, mencakup SN/draf/invoice, perubahan Qty, Qty besar/pecahan, modal berdasarkan mutasi stok, pemasok lama, pembelian tanpa pendaftaran, dan pelunasan otomatis.

## Perubahan lokal berikutnya: identitas toko, logo, dan edit langsung

- Sidebar hanya berisi ikon dan nama toko dari Pengaturan; kotak identitas kedua serta subtitle aplikasi dihapus. Judul tab juga mengikuti nama toko.
- Logo Mitra Ecobike dipotong dari area logo pada referensi pengguna. Hanya logo yang dimasukkan sebagai aset, tanpa data invoice/rekening pada gambar. Lambang daun digunakan untuk favicon dan aset ikon aplikasi. Logo penerbit baru memakai logo bawaan ini; logo unggahan pengguna tetap dipertahankan.
- Logo bawaan dimigrasikan sekali memakai `brandingVersion`. Menghapus/mengganti logo setelah migrasi tetap dihormati. Logo invoice disalin sebagai data URL sehingga tidak bergantung pada nama file hasil build.
- Tombol Edit tersedia pada dokumen final, detail dokumen, dan pembayaran. Penyimpanan memperbarui baris yang sama; tidak perlu membuat pembatalan dan transaksi pengganti.
- Perubahan dokumen atau stok/nilai awal dihitung pada salinan data, lalu seluruh dokumen final diputar ulang secara kronologis dengan ID dan snapshot identitas yang sama. HPP penjualan, biaya retur, nilai stok, total, serta saldo mengikuti hasil terbaru. Master nonaktif tidak menghalangi perhitungan dokumen historis.
- Uang muka yang terkait invoice dapat diubah dari invoice maupun pembayaran tanpa pembayaran ganda. Pembayaran yang telah dibatalkan tidak dihidupkan kembali hanya karena invoice diedit. Kolom `sourceDocId` diisi default teks kosong pada pembayaran lama sebelum penyimpanan CSV.
- Alokasi pembayaran yang melebihi total baru harus disesuaikan melalui Edit pembayaran. Perubahan yang tidak valid tidak diterapkan sebagian; data awal tetap utuh. Aktivitas edit tercatat dalam audit.
- Perubahan ini dikerjakan lokal, tanpa build aplikasi atau push sesuai instruksi pengguna. Pemeriksaan menggunakan TypeScript, pengujian domain, dan browser pengembangan.

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


## Impor CSV lengkap (tambahan kebutuhan pengguna)

Pengguna meminta impor untuk seluruh data operasional termasuk transaksi dan pembayaran, dengan pilihan Upsert atau Replace. Implementasi mencakup barang, customer, enam jenis dokumen, pembayaran dan alokasi, serta impor gabungan dari Pengaturan. Laporan dihitung ulang dari data sumber.

Upsert mencocokkan kode/nomor tanpa membedakan kapital dan mempertahankan ID lokal. Replace hanya mengganti dataset yang disertakan; master yang masih dirujuk dinonaktifkan, penghapusan dokumen yang masih dirujuk ditolak. CSV gabungan menyertakan penanda dataset kosong agar Replace seluruh kategori dapat dilakukan secara eksplisit.

Ekspor memuat detail baris, diskon produk, SN, snapshot invoice, urutan dokumen, relasi order/retur, uang muka dan alokasi. Pratinjau menampilkan tambah/perbarui/hapus/nonaktifkan, validasi dilakukan pada salinan data, revisi diperiksa kembali saat penerapan, dan satu kegagalan membatalkan seluruh impor. Template dan panduan ada di `IMPORT_CSV.md`. Profil toko dan riwayat aktivitas tetap melalui backup lengkap.

Pengerjaan fitur ini hanya pada source lokal; tidak membuat build aplikasi, commit, atau push.


## Kelengkapan dan kesesuaian cetak invoice

Keluhan pengguna berikutnya memperjelas bahwa logo Mitra dan Phylion, ketentuan garansi lengkap, serta rekening pada referensi harus sudah tersedia. Bawaan Mitra kini mencakup penerbit Nico Wijaya, alamat/telepon, beneficiary Nico Vijaya, BCA Purwokerto, rekening 046-1212-432, kode bank 014, country, CBD, lima pengecualian garansi, ongkir, dan tanda tangan sesuai gambar. Nama toko di sidebar tetap terpisah dari nama penerbit invoice. Seluruhnya bisa diedit. Tidak memasukkan barang/customer contoh sebagai data operasional.

`invoiceDefaultsVersion` melengkapi hanya kolom kosong pada profil/snapshot Mitra lama sekali. Nilai khusus yang sudah ada dipertahankan, identitas toko lain tidak menerima rekening/garansi Mitra, dan pengosongan setelah migrasi dihormati. Tombol **Gunakan template Mitra Ecobike** mengisi form Pengaturan untuk ditinjau sebelum disimpan. Tombol **Gunakan data pengaturan** pada pratinjau memperbarui snapshot penerbit/logo/garansi/rekening dokumen yang dipilih dengan audit; angka, customer, barang, stok, dan pembayaran tidak berubah.

Ukuran logo/font, grid atas, rasio kolom, jarak tiap blok, judul, garis tabel, aturan garansi merah, dan posisi cap COPY disesuaikan memakai fixture lima barang dengan total Rp3.596.000 seperti referensi. PDF normal/COPY diperiksa sebagai dua halaman A4; versi normal tidak memiliki cap COPY. Invoice panjang tetap dipaginasi dan total tidak digandakan. Pengerjaan lokal saja, tanpa build installer, commit, atau push.


Reset logo tersedia terpisah untuk Mitra Ecobike dan Phylion, termasuk saat logo dihapus. Reset mengambil aset asli yang dipotong dari referensi pengguna dan tidak mengubah nama toko, rekening, atau garansi. Pengguna menekan Simpan pengaturan untuk menerapkan form; invoice baru memakai hasil reset, dan invoice lama bisa mengambilnya dengan Gunakan data pengaturan.


## Sumber data penerbit ketika mencetak

Pengguna meminta invoice langsung memakai isian pada halaman Pengaturan (nama penerbit BMW, alamat/telepon, rekening dan logo pengguna). Sumber default pratinjau serta cetak normal/COPY sekarang **Pengaturan tersimpan**, termasuk untuk invoice yang sudah ada. Field kosong yang disimpan tetap kosong dan tidak diganti kembali dengan data contoh. Barang, customer, nomor, tanggal, diskon, pembayaran, dan total selalu berasal dari transaksi.

Pilihan **Profil saat transaksi** pada pratinjau tetap membuka snapshot historis. Mengubah pilihan atau mencetak tidak menulis data atau mengubah angka. **Simpan profil ke dokumen** merupakan aksi eksplisit untuk menyimpan profil terbaru ke snapshot melalui validasi/audit sebelumnya. Fungsi `invoiceProfile` menyamakan pemetaan pengaturan ke pembuatan dokumen, preview/cetak, serta penyimpanan snapshot. Mengganti sumber mereset pemisahan halaman agar panjang garansi terbaru ditata ulang.


Grid abu-abu Excel di area logo, identitas penerbit, dan customer dihapus sesuai permintaan pengguna. Border hitam pembatas bagian, frame invoice, serta tabel barang tetap dipertahankan pada pratinjau dan hasil cetak normal/COPY.


## Default teks untuk profil pengaturan

Bawaan garansi lengkap (termasuk pengecualian dan ongkir), syarat CBD, serta negara Indonesia sekarang juga tersedia pada profil dengan nama khusus seperti BMW. `invoiceTextDefaultsVersion` mengisi teks yang kosong sekali saat profil lama dimuat, tanpa menyalin rekening atau identitas dari contoh Mitra. Penandatangan yang kosong diisi dengan nama penerbit profil tersebut. Teks khusus yang sudah ada dipertahankan; pengosongan setelah migrasi tetap dihormati. Snapshot dokumen historis tidak dimigrasikan oleh aturan teks ini.

Pengaturan menyediakan Reset garansi, Reset syarat pembayaran, Reset negara, serta Gunakan nama penerbit untuk penandatangan. Reset per bagian hanya mengubah field terkait pada form; Simpan pengaturan menerapkannya. Tidak memerlukan tombol template seluruh profil yang ikut mengganti rekening. Default muncul pada invoice yang memakai Pengaturan tersimpan.


Tampilan Pengaturan dirapikan: logo penerbit dan mitra berada dalam grup dua kolom tersendiri dengan area preview sama tinggi, kontrol unggah/hapus ringkas, reset di samping label, dan input file native disembunyikan di balik tombol unggah yang dapat diakses. Garansi dan pembayaran dikelompokkan terpisah; reset teks/negara tidak lagi mengambil satu baris tombol penuh. Pada ponsel logo tersusun satu kolom dan aksi simpan membungkus tanpa overflow. Tidak mengubah data, aset default, atau hasil cetak invoice.

## Validasi stok langsung pada penjualan

Form penjualan menampilkan stok tersedia per barang. Qty yang melampaui stok diberi pesan kesalahan dan menonaktifkan Simpan draf/Sahkan/Simpan perubahan; shortcut simpan juga tidak dapat melewatinya. Penambahan barang melalui tombol maupun Enter tidak dapat memasukkan barang habis atau menaikkan qty melewati batas. Stok pecahan positif di bawah satu tetap dapat dijual.

Saat mengedit nota final, batas qty mengembalikan konsumsi nota asal dan menyisakan stok untuk transaksi setelahnya. Perhitungan mengikuti urutan tanggal/seq yang dipakai replay revisi; pembelian/retur belakangan tidak dianggap tersedia untuk penjualan yang lebih awal. Validasi domain saat pengesahan dan replay tetap menjadi pemeriksaan terakhir. Order customer tidak dibatasi stok karena belum mengeluarkan barang. Perubahan lokal ini tidak membuat build, commit, atau push.

## Pelunasan per nota

Halaman Pelunasan menampilkan daftar nota penjualan/faktur pembelian final dengan total tagihan, pembayaran aktif yang sudah dialokasikan, sisa, dan status Lunas/Belum lunas. Retur ditampilkan terpisah di bawah total; sisa memperhitungkan retur, sementara saldo negatif ditampilkan sebagai kredit. Nota tanpa uang muka juga tampil. Kolom Arah di riwayat pembayaran dihapus; jenis nota tetap terlihat di daftar tagihan.

Tombol Lunasi menambahkan satu pembayaran baru sebesar sisa terbaru untuk nota tersebut, bertanggal hari ini dengan nomor otomatis dan arah sesuai penjualan/pembelian. Uang muka, pembayaran lama, isi nota, stok, dan HPP tetap dipertahankan. Saldo dan status tagihan langsung dihitung ulang dari alokasi tersebut; tombol menjadi nonaktif setelah lunas. Mutasi memeriksa ulang sisa di salinan data terbaru dan memakai validasi pembayaran serta pengunci commit, sehingga klik berulang tidak menggandakan pembayaran. Urutan baris tetap saat status berubah agar tombol nota lain tidak berpindah ke posisi klik yang sama.

Riwayat pembayaran tetap tersedia untuk edit/pembatalan, ekspor dan impor. Pembatalan membuat sisa tagihan muncul kembali otomatis. Sesuai revisi pengguna, tombol Lunasi berada di kolom Aksi pada ujung kanan. Kolom tersebut tetap terlihat saat tabel digeser pada ponsel dan mengikuti tema terang/gelap. Pengujian mencakup uang muka, parsial, retur, kredit, nota tanpa DP, pembelian, pembatalan, reload, dan klik berulang. Pengerjaan lokal saja, tanpa build, commit, atau push.

## Tema default dan klarifikasi total modal

Tema gelap menjadi default untuk shell, dashboard, tabel, form, dropdown, pengaturan, status, dan pratinjau. Tombol matahari/bulan pada topbar mengganti tema. Preferensi terpisah dari data operasional (`toko-offline-theme`) disimpan pada perangkat dan disinkronkan antartab. Script lokal di head menerapkan pilihan sebelum tampilan dimuat; kegagalan penyimpanan preferensi tidak menghalangi penggunaan aplikasi. Override gelap hanya berlaku pada media screen. Invoice tetap memakai kertas putih dan tinta hitam pada preview maupun PDF/cetak, dan tidak menggunakan filter pembalik warna. Konfigurasi Tauri memakai frame Dark saat awal dan mengubah tema frame mengikuti tombol dengan izin window set-theme yang terbatas pada main window; perilaku frame Windows perlu diverifikasi pada build Windows berikutnya.

Pengguna memperjelas bahwa Total modal adalah modal seluruh barang yang pernah dibeli. Perhitungan lama `inventoryCapital` merupakan nilai stok yang tersisa; penjualan menurunkannya dan dapat membuatnya nol saat stok habis. Kartu sekarang menggunakan `totalCapital`: jumlah nilai stok awal dan total seluruh pembelian final, dikurangi retur pembelian final. Order, draf, pembelian batal, penjualan, dan retur penjualan tidak menambah/mengurangi total ini. Angka tidak mengikuti filter periode. Harga beli default bukan bukti modal yang sudah dikeluarkan dan tidak digunakan sebagai angka pengganti saat nilai stok awal/pembelian belum tercatat.

Laporan Modal / laba menampilkan total modal historis dan nilai persediaan tersisa sebagai dua nilai berbeda; perhitungan stok/HPP dan data tersimpan tetap dipertahankan. Kartu Total modal membuka daftar Pembelian untuk memeriksa sumbernya. Pengujian mencakup stok awal, diskon pembelian, penjualan, kedua retur, pembatalan, draf, pilihan tema/reload, ponsel, dropdown, serta media print. Tidak membuat build, commit, atau push.

## Barang baru tanpa pengisian stok awal

Form tambah/edit barang hanya mengatur identitas, satuan/kemasan, harga default, dan batas stok minimum. Stok awal serta total nilainya tidak lagi berupa input. Barang baru disimpan dengan stok/nilai awal nol; pembelian draf tidak menambah stok atau modal dan harus disahkan terlebih dahulu.

Jalur interaktif `saveCatalogItem` menolak pengisian stok awal pada barang baru dan perubahan nilai awal pada barang lama sebelum melakukan mutasi. Perubahan harga default/metadata mempertahankan stok, HPP, dan nilai modal historis. Data lama, CSV historis, dan pemulihan backup tetap menggunakan format saldo awal yang sama agar tidak kehilangan stok atau mengubah riwayat transaksi. Penambahan stok rutin dilakukan melalui Pembelian. Pengujian domain dan browser mencakup batas ini serta pelunasan pada kolom Aksi. Tidak membuat build, commit, atau push.

## Pembelian SN, hapus seluruh jenis data, dan fullscreen desktop

Perubahan 26 Oktober 2026 mengikuti permintaan pengguna. `serialInventory.ts` menurunkan ketersediaan SN dari mutasi final berdasarkan tanggal dan urutan, tanpa menambah tabel penyimpanan. SN pembelian menjadi pilihan yang dapat dicari per unit penjualan; SN yang dipilih pada unit lain tidak ditawarkan ulang. Penjualan mengeluarkan SN, retur penjualan mengembalikannya, dan retur pembelian mengeluarkannya ke pemasok. SN setelah retur pembelian boleh diterima kembali. Order/draf tidak mencadangkan unit. Identitas dibandingkan per barang tanpa membedakan huruf besar/kecil.

Dokumen baru menggunakan `serialTracking: "v1"`. Validasi dilakukan sebelum pengesahan, saat penghitungan ulang edit/impor, dan saat pembacaan data. Jumlah SN tidak boleh melebihi Qty bulat, SN duplikat ditolak, unit yang dilacak wajib dipilih bila stok tanpa SN tidak mencukupi, dan SN retur harus berasal dari baris transaksi asal serta belum diretur sebelumnya. Edit/impor tidak boleh menghapus atau mengganti SN sumber yang masih digunakan dokumen lain. Semua pemeriksaan perubahan lintas dokumen berlangsung pada salinan agar kegagalan tidak mengubah data.

Dokumen historis tanpa penanda tetap dibaca tanpa penerapan aturan baru secara retroaktif. Edit metadata dokumen final lama mempertahankan versi tersebut; perubahan SN melalui form mengaktifkan aturan baru. SN CSV tetap teks dan penanda versi disertakan dalam snapshot `Data invoice` hasil ekspor. Sebelum penyimpanan desktop, seluruh baris dokumen lama diberi string versi kosong agar kolom CSV campuran lama/baru tidak berisi nilai `null` atau mengaktifkan validasi baru pada data historis. Mutasi lama yang tidak mengidentifikasi unit dapat membuat beberapa SN ambigu: pilihan tersebut disembunyikan, bukan ditebak unit mana yang masih tersedia. Stok lama tanpa SN tetap bisa dijual sebagai unit tanpa SN.

Tombol hapus tersedia pada barang, customer, seluruh enam jenis dokumen (order customer/pembelian, penjualan/pembelian, kedua retur), serta seluruh pembayaran. Konfirmasi mendahului penghapusan. Master yang masih dirujuk tidak boleh dihapus; dokumen dengan pembayaran atau turunan harus menghapus rujukan itu dahulu, termasuk data draf/batal. Penghapusan dokumen final memakai pemeriksaan pembatalan yang sama: mutasi stok harus dihapus mulai dari yang terakhir pada barang terkait agar biaya historis tidak berubah tanpa perhitungan ulang. Header/detail dokumen dihapus bersama. Pembayaran dihapus bersama alokasinya; pembayaran uang muka juga mengosongkan DP dokumen sumber. Stok, modal, dan saldo berasal dari data yang tersisa, dengan audit penghapusan.

Konfigurasi desktop memulai main window dalam fullscreen. Tombol Keluar terlihat di kanan atas, termasuk layar terkunci/pemuatan/gagal baca. Konfirmasi mengingatkan perubahan form yang belum disimpan. Tombol tidak dapat dipakai saat penyimpanan sedang berjalan. Aksi memakai `getCurrentWindow().close()` dengan izin terbatas `core:window:allow-close` untuk main window. Konfirmasi diuji dengan callback penutupan pengganti pada browser; fullscreen dan penutupan native perlu diverifikasi pada build Windows. Tidak membuat build atau push dalam pengerjaan ini; dev server utama tetap dihentikan.

Verifikasi lokal: TypeScript tanpa error; 81 pengujian unit dan seluruh 36 pengujian browser lolos. Setelah normalisasi kolom versi SN untuk CSV campuran, 22 regresi browser yang terkait SN, hapus, impor, dan penggunaan form dijalankan ulang dan lolos. Pemeriksaan format source juga lolos. Pengujian memakai penyimpanan browser terisolasi, tidak menghapus data operasional pengguna.

## Konsistensi ikon dan pembaruan Windows 0.2

Ikon tombol mengikuti warna teks pada tema terang/gelap. Selector ikon dekoratif empty state dipersempit menjadi anak langsung agar tidak menimpa ikon tombol Tambah data. Tombol Keluar ditampilkan di kanan atas pada desktop maupun preview; pada browser tombol nonaktif dengan keterangan, karena browser tidak memberi aplikasi hak menutup tab yang dibuka pengguna.

Updater resmi Tauri memeriksa rilis `https://github.com/crwraymond/bmw/releases/latest/download/latest.json`. Kunci publik nyata disertakan dalam konfigurasi; kunci privat berpassword disimpan di luar repository. Tidak ada token GitHub atau kunci privat pada source/installer. Signature wajib diverifikasi oleh plugin. User memilih tetap memakai repo BMW dan mengubahnya menjadi public secara manual saat membagikan update. Repo private/akses gagal ditampilkan sebagai kegagalan pengecekan, bukan status versi terbaru.

Hook update tetap hidup di App agar tersedia notifikasi versi baru setelah pemeriksaan startup. Cek otomatis dapat dimatikan per perangkat. Pasang update meminta konfirmasi simpan form; selama pemasangan, guard penyimpanan global memblokir commit lain dan tombol Keluar. Rust `prepare_update` memeriksa revisi data di bawah lock, membuat snapshot backup di `backups/before-update`, lalu membaca dan mencocokkan backup. Jika backup/revisi gagal, tidak ada unduhan/pemasangan. Data CSV aktif, schema, identifier, dan password perangkat tidak direset. Installer Windows mengganti aplikasi dan membukanya kembali; folder data berada di luar folder instalasi.

Workflow menyiapkan SemVer dari versi dasar major/minor/patch ditambah nomor run pada patch, menyelaraskan package, kedua lockfile, Cargo, dan Tauri, lalu mengaktifkan updater artifacts hanya untuk rilis. Setelah tes selesai, action Tauri membuat draft dengan installer NSIS, signature, dan latest.json; rilis baru dipublikasikan setelah seluruh aset lengkap. Signing secrets wajib diatur terlebih dahulu. Tidak ada workflow/rilis yang dijalankan atau visibility repo yang diubah selama perubahan lokal ini. Installer Windows dan update antarversi masih perlu smoke test pada Windows.

Verifikasi: TypeScript dan pemeriksaan format lolos; 85 tes unit frontend, 42 tes browser, 6 tes Rust, serta 2 tes versi rilis lolos. Integrasi Rust lolos cargo check pada macOS. Dua signing secrets GitHub Actions telah dikonfigurasi setelah izin eksplisit pengguna, dienkripsi menggunakan public key repository, dan diverifikasi melalui metadata tanpa menampilkan nilainya. Repo tetap private sesuai pilihan pengguna. Tidak membuat installer, push, atau rilis.

## Pesan penolakan hapus dan pembayaran terkait

Reproduksi invoice dengan DP menunjukkan penghapusan ditolak oleh validasi relasi, tetapi pesan hanya dirender pada toast di luar top-layer dialog sehingga diburamkan backdrop. Pengujian awal gagal menemukan `role=alert` di dalam dialog setelah menekan Lanjutkan. Callback error opsional pada commit sekarang membawa pesan ke dialog konfirmasi; kegagalan hapus master/pembayaran juga tampil di dalam modalnya.

Dialog hapus dokumen menampilkan nomor dan nominal pembayaran terkait, tombol Buka Pelunasan, serta checkbox tidak tercentang **Hapus juga pembayaran khusus dokumen ini** hanya jika seluruh pembayaran tersebut sepenuhnya dialokasikan ke dokumen itu. Penghapusan invoice dengan pembayaran tetap ditolak tanpa pilihan eksplisit. Pembayaran gabungan beberapa invoice atau sebagian untuk saldo awal tidak boleh ikut dihapus; pengguna harus mengatur alokasinya di Pelunasan. Dokumen turunan dan urutan mutasi tetap divalidasi. Seluruh pembayaran/alokasi dan dokumen dihapus pada satu salinan data, sehingga kegagalan validasi berikutnya tidak menghapus sebagian data. Pengujian hanya memakai data terisolasi; tidak menghapus invoice pengguna.

Verifikasi perbaikan: regresi awal gagal karena alert tidak ditemukan di dalam dialog; setelah perbaikan seluruh 89 tes unit dan 46 tes browser lolos. TypeScript dan format source lolos. Belum build atau push.
