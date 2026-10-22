# RAM Capital

Web app simulasi Monte Carlo untuk harga aset (kripto, saham IDX/global, indeks, emas, FX) dan yield obligasi, lengkap dengan uji keyakinan (backtest out-of-sample).

## Model
| Aset | Model | Catatan |
|---|---|---|
| Harga | GBM | Vol konstan, distribusi normal — baseline |
| Harga | GJR-GARCH(1,1)-t | MLE (Nelder–Mead, variance targeting). Vol berubah + ekor gemuk + efek leverage |
| Harga | Merton jump-diffusion | Jump = return di luar 3σ |
| Harga | Block bootstrap | Resample blok 10 hari dari return historis |
| Yield | Vasicek / CIR | Kalibrasi OLS, lalu dikonversi ke harga coupon bond |

## Fitur lain
- **Candlestick** harian/mingguan/bulanan + MA20/MA50, Bollinger, volume, RSI (Lightweight Charts)
- **Prediksi per periode** (median, rentang 80%, peluang naik) dan **rencana jual per lot** (target, stop loss, fee, fraksi harga BEI) yang disimulasikan path-by-path
- **Perbandingan** dengan indeks/aset lain: return, volatilitas, beta, korelasi, proyeksi
- **Analisis kuantitatif**: Sharpe, Sortino, Calmar, alpha Jensen, information ratio, up/down capture, Kelly; ARDL(p,q) mingguan dengan evaluasi out-of-sample; opsi Black-Scholes & binomial CRR (Eropa/Amerika); model ARCH-t
- **Valuasi Damodaran**: DCF FCFF 10 tahun (konvergensi growth/margin, sales-to-capital, terminal), excess return model untuk bank, reverse DCF, simulasi input. Parameter default: ERP 4,23% & CRP Indonesia 2,46% (dataset Damodaran Jan 2026)
- **Berita**: Yahoo, Google News, Bing News; sentimen judul + event study (reaksi abnormal hari berita vs model pasar)

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
