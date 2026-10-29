# Library pihak ketiga (di-host sendiri)

Disalin dari paket npm dengan versi terkunci, supaya web tidak bergantung pada CDN luar
(lebih aman dari CDN yang diretas dan lebih cepat karena satu domain).

| File | Paket | Versi | Lisensi |
|---|---|---|---|
| chart.umd.min.js | chart.js | 4.4.1 | MIT |
| supabase.js | @supabase/supabase-js | 2.45.4 | MIT |
| lightweight-charts.standalone.production.js | lightweight-charts (TradingView) | 4.2.0 | Apache-2.0 |
| katex/* | katex | 0.16.11 | MIT |

Untuk memperbarui: `npm i <paket>@<versi>` lalu salin file `dist` yang sama ke folder ini.
