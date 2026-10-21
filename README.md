# Simulasi Pasar

Web app simulasi Monte Carlo untuk harga aset (kripto, saham IDX/global, indeks, emas, FX) dan yield obligasi, lengkap dengan uji keyakinan (backtest out-of-sample).

## Model
| Aset | Model | Catatan |
|---|---|---|
| Harga | GBM | Vol konstan, distribusi normal — baseline |
| Harga | GJR-GARCH(1,1)-t | MLE (Nelder–Mead, variance targeting). Vol berubah + ekor gemuk + efek leverage |
| Harga | Merton jump-diffusion | Jump = return di luar 3σ |
| Harga | Block bootstrap | Resample blok 10 hari dari return historis |
| Yield | Vasicek / CIR | Kalibrasi OLS, lalu dikonversi ke harga coupon bond |

## Uji keyakinan
Untuk ±60 titik waktu historis, model di-fit ulang **hanya** dengan data sebelum titik itu, disimulasikan sejauh horizon, lalu dicek apakah nilai aktual jatuh di rentang 50/80/90/95%. Plus backtest VaR 1-hari 95% (uji Kupiec) untuk 250 hari terakhir.
Jendela horizon saling tumpang tindih, jadi sampel independen efektifnya jauh lebih kecil dari jumlah titik uji.

## Arsitektur
- `index.html`, `app.js`, `style.css` — UI (GitHub Pages)
- `engine.js` — semua model & backtest (jalan di browser lewat `worker.js`, juga bisa di Node)
- `supabase/functions/market-data` — proxy data Yahoo Finance (fallback Binance untuk kripto), karena browser tidak bisa memanggil Yahoo langsung (CORS)
- `python/mc_forecast.py` — versi CLI Python (pakai library `arch`)

## Pakai
Ketik ticker format Yahoo: `BTC-USD`, `BBCA.JK`, `^JKSE`, `GC=F`, `IDR=X`, `^TNX`. Link bisa dibagikan: `?s=BBCA.JK&h=60`.
Upload CSV (kolom tanggal, nilai di kolom terakhir) untuk data yang tidak ada di Yahoo, mis. yield SBN.

Bukan saran investasi.
