# Petunjuk proyek

- Acuan kebutuhan adalah `PROJECT_SPEC.md`. Bedakan kebutuhan pengguna, usulan desain, dan hal yang masih perlu konfirmasi.
- Stack awal: React + Vite + TypeScript + Tauri, dengan layanan lokal Rust dan penyimpanan CSV. Jangan mengganti CSV dengan database lain tanpa membahas perubahan kebutuhan.
- Semua fitur operasional utama harus dapat digunakan offline. Pengguna akhir tidak menjalankan Yarn, npm, atau server manual.
- UI berbahasa Indonesia. Jangan mengisi metrik dengan data palsu yang terlihat sebagai data operasional.
- Penjualan, stok, saldo, dan invoice harus konsisten. Cetak invoice normal/COPY tidak boleh menggandakan transaksi.
- Jangan menambahkan trailer Co-Authored-By atau tanda tangan/atribusi AI pada commit dan deskripsi PR.
- Nama branch baru tidak boleh mengandung codex, tanpa memperhatikan huruf besar/kecil. Jangan mengubah nama branch yang sudah ada demi menerapkan aturan ini.
- Gunakan skill Graphify bila tersedia untuk eksplorasi codebase, arsitektur, penelusuran dependensi, dan analisis dampak. Jika ada graph, periksa scope/freshness dan query sebelum pencarian source luas. Verifikasi temuan pada source saat ini. Jika graph belum tersedia atau tidak mencakup area terkait, gunakan pencarian terarah dan nyatakan batasannya. Pertahankan scope yang sengaja dibatasi saat memperbarui graph.
