# Pindah dari Supabase ke Cloudflare

Web (GitHub Pages) tetap sama. Yang pindah hanya **server**: 5 fungsi Supabase digabung menjadi satu Cloudflare Worker
(`worker/`, dibuat otomatis dari `supabase/functions/*` oleh `tools/gen-worker.py`). Supabase tetap bisa dipakai sampai kamu menggantinya.

## Yang berubah di mode Cloudflare
- **Login**: akun diatur lewat secret `APP_USERS` (tidak ada daftar/persetujuan admin, tidak ada reset password lewat email).
- **Data** (pengaturan, akun demo, memori AI, log) tersimpan di **browser** (IndexedDB), tidak tersinkron antar perangkat.
  Pakai **Profil → Ekspor/Impor cadangan** secara rutin.
- **Riwayat sentimen berita harian** (tabel `sp_news_daily`) tidak ada; fitur lain yang memakainya berjalan tanpa data itu.

## Langkah pemasangan (sekali)
1. Buat akun gratis di dash.cloudflare.com.
2. **API token**: My Profile → API Tokens → Create Token → template **Edit Cloudflare Workers** → buat → salin tokennya.
   **Account ID**: dashboard → Workers & Pages → kolom kanan "Account ID".
3. Di GitHub repo `simulasi-pasar` → Settings → Secrets and variables → Actions → New repository secret:
   `CLOUDFLARE_API_TOKEN` dan `CLOUDFLARE_ACCOUNT_ID`.
4. GitHub → Actions → **Deploy Cloudflare Worker** → Run workflow. Setelah hijau, alamat Worker tampil di log
   (contoh `https://ram-capital.<subdomain>.workers.dev`).
5. Di web RAM Capital, layar login → **⚙ Server: ganti** → tempel alamat Worker → muat ulang.
   Lalu klik **buat TOKEN_SECRET** dan **buat entri akun** (password tidak pernah dikirim ke mana pun; yang disalin hanya hash).
6. Cloudflare → Workers & Pages → `ram-capital` → Settings → **Variables and Secrets** → tambah (tipe *Secret*):
   - `TOKEN_SECRET` — dari langkah 5
   - `APP_USERS` — dari langkah 5, bentuk `[{"email":"…","salt":"…","hash":"…","role":"owner"}]`
   - `GEMINI_API_KEY`
   - opsional: `INDODAX_KEY`, `INDODAX_SECRET`, `INDODAX_MAX_IDR`, `BINANCE_FUT_KEY`, `BINANCE_FUT_SECRET`, `BINANCE_FUT_LIVE`, `BINANCE_FUT_MAX_USDT`, `BINANCE_FUT_MAX_LEV`
7. Masuk di web dengan email & password dari langkah 5.
8. Data lama di Supabase **tidak ikut pindah otomatis**. Kalau perlu, sebelum ganti server: masuk mode Supabase dan biarkan saja
   (data tetap di Supabase); mode Cloudflare mulai dari kosong.

## Kembali ke Supabase
Layar login → ⚙ Server → kosongkan alamat → muat ulang. Atau buka `?srv=supabase`.

## Batas paket gratis Cloudflare Workers
100.000 permintaan/hari, CPU 10 ms per permintaan (waktu tunggu jaringan tidak dihitung). Bila muncul galat 1102 (CPU)
atau 1027 (kuota harian), pertimbangkan Workers Paid (± $5/bulan).
