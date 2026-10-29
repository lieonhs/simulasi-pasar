# Struktur kode RAM Capital

Web statis (GitHub Pages) + Supabase (login, data, fungsi edge). Tidak ada proses build.

| File | Isi |
|---|---|
| `index.html` | Kerangka halaman, CSP, urutan skrip |
| `boot.js` | Dimuat pertama: tema, versi worker, anti-clickjacking |
| `engine.js` | Mesin hitung murni (Monte Carlo, GARCH, strategi, ML/DL, rencana aksi). Bisa dites di Node |
| `worker.js` | Web Worker yang menjalankan `engine.js` di luar thread utama |
| `js/00-inti.js` | Utilitas, state, worker pool, pengambilan data, render utama |
| `js/10-analisis.js` | Analisis kuantitatif, berita, valuasi |
| `js/20-watchlist-pasar.js` | Watchlist, harga live, panel candle, Quant Lab, laporan keuangan, Pasar |
| `js/30-portofolio.js` | Portofolio, Lab matematika |
| `js/40-trading-strategi.js` | Akun demo, Indodax, 50 strategi |
| `js/50-bantuan-terminal.js` | Panduan chat, perintah, terminal, AI berita |
| `js/60-sinyal-rencana-ai.js` | Sinyal, Rencana aksi, RAM AI |
| `js/70-radar-gems.js` | Radar, live Indodax, Hidden gems |
| `js/80-autopilot.js` | Masa belajar demo, Quick IN/OUT, order otomatis, Autopilot, otak, futures, harian |
| `js/90-aset-terminal-boot.js` | Manajemen aset, terminal Pro, penyimpanan, login & boot |
| `vendor/` | Library pihak ketiga di-host sendiri |
| `supabase/functions/` | Fungsi edge (`market-data`, `indodax-menu`) |
| `supabase/sql/` | SQL yang dijalankan manual di Supabase |
| `tests/` | `engine.test.cjs` (Node, jalan otomatis di GitHub Actions) dan `smoke.mjs` (browser) |

**Aturan penting**
- File `js/` adalah skrip biasa yang berbagi satu lingkup global dan dimuat **berurutan**. Kode tingkat atas di file awal tidak boleh langsung memanggil fungsi dari file yang lebih akhir (pemanggilan di dalam fungsi/handler aman).
- Setelah mengubah file, jalankan `python3 stamp.py` supaya versi `?v=` per file diperbarui (browser hanya mengunduh ulang file yang berubah).
- Sebelum push: `npm test` (dan `node tests/smoke.mjs` bila Playwright terpasang).
