/* RAM Capital · panduan chat, kenyamanan, perintah Bloomberg, terminal, AI berita
   Semua file js/ berbagi satu lingkup global (skrip biasa, dimuat berurutan). Jangan diubah jadi modul tanpa menyesuaikan impor. */
"use strict";
  // =====================================================================
  // PANDUAN DALAM BENTUK CHAT
  // =====================================================================
  const KB = [
    ["terminal f7 launchpad panel monitor bloomberg pro layar banyak", "Terminal (F7)", "Mode Pro saja. Tekan <b>F7</b> atau ketik <code>TERM</code>. 8 panel terhubung: jam dunia & status bursa, montase kuotasi (IHSG, S&P, USD/IDR, emas, minyak, BTC), peta pasar watchlist, monitor watchlist (klik judul kolom untuk urut), grafik 6 bulan, fokus aset (rencana aksi, ML, prediksi), scatter risiko vs return, dan penggerak. Klik satu saham → semua panel ikut; klik ganda → buka Analisis. Data diperbarui tiap 15 detik. Tombol <b>PANEL</b> untuk menyembunyikan panel, □ untuk memperbesar."],
    ["machine learning ml model peluang auc brier kalibrasi", "Machine learning", "Kartu <b>Machine learning</b> di Analisis (perintah <code>ML</code>). Model buatan sendiri (regresi logistik + gradient boosting) menebak apakah harga H hari lagi naik melebihi biaya. Diuji walk-forward di data yang belum pernah dilihat. <b>AUC</b> 0,5 = tebak koin; <b>Teruji</b> bila AUC ≥ 0,53 dan nilai-p &lt; 0,05 serta Brier skill &gt; 0 — hanya model teruji yang boleh mengubah Rencana aksi."],
    ["prediksi harga forecast rentang conformal keyakinan 80 90", "Prediksi harga", "Di kartu Machine learning: titik tengah harga H hari lagi plus rentang 50%/80%/90%. Rentang dibuat dari kesalahan model di data yang belum dilihat (conformal), lalu diuji: kolom <b>teruji</b> menunjukkan seberapa sering harga benar-benar jatuh di rentang itu. Kalau R² ≤ 0, pegang rentangnya, bukan titik tengahnya."],
    ["valuasi gabungan nilai wajar graham residual income ddm murah mahal", "Valuasi gabungan", "Hingga 6 metode: DCF Damodaran, Graham number, residual income, dividend discount (Gordon), P/E wajar, dan laba tahun depan. Median = nilai wajar gabungan; <b>kesepakatan</b> = porsi metode yang setuju murah/mahal. Valuasi menjawab murah atau mahal, bukan kapan naik."],
    ["dampak berita sentimen uji kejadian event study reaksi", "Dampak berita", "Uji kejadian dari berita yang ada: rata-rata reaksi harga abnormal 3 hari setelah berita positif vs negatif, dengan statistik t. Hanya dipakai kalau polanya kuat (≥ 5 kejadian, |t| ≥ 2). AI juga membaca judul berita terbaru."],
    ["rekam jejak track record catat benar salah ai terlalu percaya diri", "Rekam jejak", "Setiap rencana dicatat (tersimpan di akunmu) dan dinilai otomatis setelah tanggal evaluasinya lewat: benar/salah, keyakinan yang dijanjikan vs kenyataan, dan apakah AI terlalu percaya diri. Makin lama dipakai, makin bisa dicek apakah angka keyakinannya jujur."],
    ["setup sql persetujuan admin aktifkan approval supabase", "Aktifkan persetujuan admin", "Ketik <code>SETUP</code> di baris perintah (atau PROFIL → Aktifkan sekarang). Klik <b>Salin SQL</b> → <b>Buka SQL Editor</b> → tempel → <b>Run</b> → kembali dan klik <b>Cek status</b>. Setelah aktif, pendaftar baru harus kamu setujui di PROFIL."],
    ["quick mode cepat trading satu lembar sheet", "Mode Quick", "Klik tombol <b>MODE</b> di atas sampai jadi <b>MODE: QUICK</b>. Layar Analisis jadi satu lembar: kartu <b>Rencana aksi</b> (beli/jual/tahan, harga antre, stop, target, sampai kapan), keyakinan %, risk:reward, ukuran posisi, target uang, ringkasan AI, plus grafik dan tiket order di samping. AI otomatis merangkum saat aset dibuka (maks 30×/jam)."],
    ["rencana aksi beli jual tahan harga kapan stop target antre", "Rencana aksi", "Kartu paling atas di Analisis. <b>Antre beli</b> = harga order limit; <b>Stop</b> = jual bila harga <i>tutup</i> di bawahnya; <b>Target 1</b> = jual ½ lalu stop naik ke harga masuk; <b>Target 2</b> = jual sisa. <b>Batal bila lewat</b> = jangan kejar harga. Tanggal: kapan order dipasang, sampai kapan berlaku, dan batas evaluasi. Ada langkah terpisah untuk yang <b>belum punya</b> dan <b>sudah punya</b> aset."],
    ["keyakinan persen teruji akurasi ai yakin", "Keyakinan %", "<b>Keyakinan teruji</b> = seberapa sering keputusan yang sama di masa lalu benar dalam H hari, dibanding peluang dasar tanpa sinyal. Kalau selisihnya kecil, sinyal belum memberi keunggulan. <b>Keyakinan AI</b> = penilaian Gemini atas semua data di halaman — subjektif, bukan peluang yang dihitung."],
    ["rr risk reward rasio risiko persen ekspektasi r", "Risk : Reward & R", "<b>R</b> = jarak harga masuk ke stop (risiko per lembar). RR 1 : 1,5 berarti target 1 memberi 1,5× risiko. <b>Ekspektasi</b> = rata-rata hasil per transaksi dalam R setelah biaya, dari 3.000 jalur bootstrap. Di atas 0 = rencana harga ini pernah menguntungkan rata-rata."],
    ["target uang 100 juta jt modal kapan tercapai", "Target uang", "Isi modal dan target (default Rp 100 jt). Aplikasi mengulang pola hasil rencana dengan risiko tetap % modal dan menghitung: butuh berapa transaksi, peluang tercapai dalam 1/3/5 tahun, peluang sempat turun 50%, dan modal awal yang dibutuhkan agar tercapai ±1 tahun. Menaikkan risiko tidak membuat target lebih aman."],
    ["dsr deflated sharpe lolos konsisten walk forward keandalan", "Uji keandalan strategi", "<b>DSR</b>: peluang Sharpe strategi benar-benar > 0 setelah dikoreksi karena 50 strategi dicoba sekaligus, kemencengan dan ekor gemuk. <b>Konsisten</b>: berapa dari 5 potongan waktu strategi ≥ beli-dan-tahan. <b>Lolos</b> = DSR ≥ 90%, konsisten ≥ 3/5, mengalahkan beli-dan-tahan. <b>Walk-forward</b>: hasil jujur kalau tiap periode kamu memilih juara peringkat sampai saat itu."],
    ["biaya impas bps transaksi fee", "Biaya impas", "Biaya per transaksi (bps) yang membuat untung strategi jadi nol. Kalau biaya brokermu mendekati angka ini, keunggulannya habis dimakan biaya. IDX: beli ±0,15% + jual ±0,25% ≈ 20 bps per sisi."],
    ["akurasi isi candle taker binance asli perkiraan", "Akurasi Isi candle", "Kripto: memakai volume beli agresif (taker buy) asli dari Binance — akurasi tinggi, berlaku juga untuk candle lama. Saham: bursa tidak membagikan data per lot gratis, jadi beli/jual diperkirakan dari bar kecil (1 menit untuk ≤ 6 hari terakhir, 5 menit ≤ 2 bulan, per jam ≤ 2 tahun). Lokasi volume (POC, value area) lebih andal daripada persentase beli/jual."],
    ["mulai pertama cara pakai awal pemula baru", "Cara mulai", "Ketik kode saham di baris perintah paling atas lalu Enter, misalnya <code>BBCA</code>. Layar Analisis terbuka: baca dulu kartu <b>Intinya</b> (ringkasan bahasa sehari-hari), lalu kalkulator <b>Kalau aku beli</b> untuk melihat untung/rugi dalam rupiah. Kalau mau latihan beli, pakai kartu <b>Order</b> di kiri (akun demo, uang virtual)."],
    ["login masuk daftar akun persetujuan admin menunggu", "Masuk & daftar", "Klik <b>Buat akun</b>, isi nama, alasan, email, password. Akun baru harus disetujui admin dulu; layar menunggu memeriksa otomatis tiap 30 detik. Menutup jendela atau 30 menit tidak aktif = keluar otomatis."],
    ["layar f1 f2 f3 f4 f5 f6 menu pindah navigasi", "Layar utama", "F1 Watchlist (banyak saham), F2 Quant Lab (portofolio & strategi sistematis), F3 Analisis 1 aset, F4 Pasar hari ini, F5 Portofolio, F6 Akun trading (demo, 50 strategi, Indodax). Di HP tombolnya ada di bawah layar."],
    ["perintah command baris ketik bloomberg fungsi des hp gip help", "Baris perintah", "Format <code>TICKER FUNGSI</code>: <code>BBCA DES</code> (deskripsi), <code>TLKM HP</code> (riwayat harga + CSV), <code>BBRI GIP</code> (intraday), <code>ANTM N</code> (berita), <code>BBCA MATH</code>, <code>BBCA STRAT</code> (uji strategi), <code>BBCA BUY</code> (tiket demo), <code>WEI</code>, <code>MOST</code>, <code>SHIP</code>, <code>ALRT</code>. Ketik <code>HELP</code> untuk semuanya."],
    ["intinya ringkasan bahasa sehari hari", "Kartu Intinya", "Merangkum analisis: rentang 9 dari 10 skenario, tingkat gejolak, sinyal dan apakah sinyalnya pernah lebih baik dari sekadar menahan saham, valuasi, kondisi rezim pasar, dan nilai uji historis model."],
    ["kalkulator kalau aku beli rupiah uang modal", "Kalkulator “Kalau aku beli”", "Isi nominal. Hasilnya: berapa lot didapat, untung/rugi di skenario buruk (P5), tengah, bagus (P95), dan peluang rugi. Fee beli 0,15% dan jual 0,25% sudah dihitung. Tanya diri: sanggup menanggung angka skenario buruk?"],
    ["sinyal beli jual tahan skor rekomendasi", "Sinyal beli/jual", "Skor dari tren MA20/MA50, momentum 3 bulan, RSI, valuasi, dan AI. ≥ +2 BELI, ≤ −2 JUAL. Percayai hanya kalau baris backtest menunjukkan Sharpe OOS aturan di atas beli-dan-tahan."],
    ["candle grafik candlestick timeframe ma bollinger fibonacci", "Grafik harga", "Pilih timeframe (1m–1B) dan rentang. MA20/MA50: harga di atas keduanya dan MA20 > MA50 = tren naik. Bollinger = MA20 ± 2σ. Fibonacci = level acuan konvensi trader. Panel bawah bisa RSI, MACD, atau Stochastic."],
    ["isi candle footprint konsentrasi beli jual harga komposisi delta", "Isi candle", "Klik sebuah candle. Panel kanan menunjukkan di harga berapa beli (hijau) dan jual (merah) terkonsentrasi, komposisi beli vs jual, POC (harga paling ramai), value area 70%, VWAP, delta, dan ketimpangan > 3:1. Sisi beli/jual diperkirakan dari bar menit, bukan data transaksi bursa."],
    ["lot per harga volume profile poc vwap", "Lot per harga", "Lot yang sudah tertransaksi di tiap harga (hari ini / 5 hari). POC = harga dengan transaksi terbanyak, sering jadi support/resistance. Ini bukan antrean order."],
    ["bid offer antrean order book", "Bid / Offer", "Kripto: order book Binance real-time. Saham IDX: hanya bid/offer teratas dari Yahoo bila ada; antrean lengkap hanya di aplikasi sekuritas."],
    ["proyeksi kipas monte carlo garch median p5 p95 rentang", "Proyeksi", "Pita gelap = 50% skenario tengah, pita terang = 90%. Garis tengah = median, bukan ramalan. Yang penting adalah lebar pita (risiko)."],
    ["rencana lot target stop loss jual bertahap", "Rencana jual per lot", "Menghitung peluang tiap target dan stop loss tersentuh sebelum horizon, plus hasil per lot setelah fee."],
    ["perbandingan beta korelasi indeks ihsg ardl", "Perbandingan", "Beta > 1 = lebih agresif dari indeks; korelasi tinggi = ikut pasar. ARDL dengan R² OOS ≤ 0 = variabel itu tidak membantu meramal."],
    ["valuasi damodaran dcf nilai wajar intrinsik", "Valuasi", "DCF FCFF (atau excess return untuk bank). Ubah input sesuai ceritamu. Hasilnya rentang nilai, sangat sensitif pada asumsi pertumbuhan dan biaya modal."],
    ["laporan keuangan pendapatan laba fcf roe", "Laporan keuangan", "± 4 tahun dari Yahoo. Lihat tren, bukan satu tahun. FCF negatif bertahun-tahun = butuh dana dari luar."],
    ["berita ai gemini sentimen reaksi", "Berita & AI", "Reaksi > ±1,96σ = signifikan. AI (Gemini) memberi ringkasan dan arah, tapi peluang dari AI bukan probabilitas terkalibrasi. Kalau AI sibuk, server otomatis mencoba model cadangan."],
    ["matematika gaussian normal student hmm rezim kurtosis hurst", "Lab matematika", "Menguji apakah return Gaussian (JB/KS), ketebalan ekor (Student-t ν, Hill α), rezim tenang vs bergejolak (HMM), dan memori (Hurst, variance ratio, Ljung-Box). Hanya tampil di mode Pro."],
    ["keyakinan model backtest kupiec baik buruk", "Keyakinan model", "Model “Baik” = interval 90%-nya benar-benar memuat ±90% hasil nyata di uji historis. Kalau “Buruk”, jangan percayai rentangnya."],
    ["pasar hari ini indeks kurs komoditas obligasi", "Pasar hari ini (F4)", "Indeks dunia, kurs rupiah (naik = rupiah melemah), komoditas, yield obligasi, penggerak IDX dari 50 saham likuid, dan kalender RDG BI & FOMC."],
    ["shipping freight kontainer wci bdry kapal", "Shipping & freight", "Drewry WCI (tarif kontainer), BDRY (proksi Baltic Dry), BWET (tanker), saham pelayaran, dan Brent. |z| > 2 = gerak tidak biasa. Tarif naik + berita gangguan jalur biasanya karena kapasitas tersendat."],
    ["portofolio posisi untung rugi risiko var", "Portofolio (F5)", "Isi ticker, harga beli, dan lot. Lihat untung/rugi, porsi risiko per saham (lebih penting dari bobot), VaR/CVaR, beta, dan simulasi nilai ke depan."],
    ["alarm alert notifikasi harga", "Alarm harga", "Klik ALRT atau ketik <code>ALRT BBRI</code>. Dicek tiap 60 detik hanya selama web terbuka."],
    ["demo paper trading latihan virtual order", "Akun demo", "Uang virtual Rp 100 juta, harga live. Order market terisi langsung; limit dicek tiap 60 detik. Pasang order dari kartu Order di Analisis atau F6. Reset kapan saja."],
    ["indodax kripto uang asli api key eksekusi", "Indodax", "Hanya kripto berpasangan rupiah dan hanya akun pemilik. Buat API key (view + trade, tanpa withdraw), simpan di Supabase Secrets <code>INDODAX_KEY</code>/<code>INDODAX_SECRET</code>. Setiap order wajib konfirmasi ketik ulang."],
    ["3 kecerdasan ml dl ai lokal kesimpulan gabungan", "3 kecerdasan", "Kesimpulan di atas Rencana aksi menggabungkan <b>machine learning</b> (4 model + stacking), <b>deep learning</b> (jaringan konvolusi + attention), dan <b>RAM AI lokal</b> (aturan Buku Panduan). Model yang belum teruji tidak ikut menentukan. AI lokal bisa menahan BELI bila skor aturannya ≤ −3."],
    ["fusi meta model gabungan dipelajari bobot", "Fusi 3 kecerdasan", "Meta-model logistik yang belajar dari riwayat aset itu berapa bobot ML, deep learning, dan konfluensi. Diuji walk-forward; hanya dipakai Rencana aksi bila teruji. Bobot negatif = sinyal itu menyesatkan di aset tersebut."],
    ["kelly ukuran posisi optimal berapa lot risiko modal", "Kelly (ukuran posisi)", "Kelly = porsi modal yang dipertaruhkan per transaksi yang memaksimalkan pertumbuhan jangka panjang, dihitung dari distribusi hasil rencana. Aplikasi memakai ¼ Kelly dan membatasi 2% (0,5% bila bukti belum teruji) karena Kelly dari data historis terlalu optimistis."],
    ["deep learning dl cnn saraf attention perhatian", "Deep learning", "Jaringan saraf konvolusi membaca urutan 24 hari (return, lebar candle, volume, posisi tutup, gap, jarak MA20) + semua fitur ML. Batang 'perhatian' = hari yang paling dipakai jaringan. Ikut memutuskan hanya bila teruji walk-forward."],
    ["multi timeframe mingguan harian jam searah konflik", "Membaca multi-timeframe", "Paling bersih bila mingguan, harian, 4 jam, 1 jam semua naik. Mingguan naik + harian turun = koreksi, tunggu harian/4 jam berbalik. Harian naik + mingguan turun = melawan arus, posisi kecil & target dekat."],
    ["volume candle akumulasi distribusi obv cmf", "Membaca volume", "Naik dengan volume di atas rata-rata = sehat. Naik dengan volume menyusut = rawan. Turun dengan volume besar = distribusi. OBV & CMF positif = dana masuk."],
    ["rezim bergejolak tenang ukuran posisi hmm", "Menyesuaikan dengan rezim", "Rezim bergejolak (HMM > 60%): kecilkan ukuran posisi, stop lebih lebar, target lebih dekat. Rezim tenang: aturan normal."],
    ["sinyal bertentangan konflik ml strategi berbeda", "Saat sinyal bertentangan", "Yang teruji mengalahkan yang tidak teruji. Strategi lolos > ML teruji > konfluensi teruji > indikator tunggal. Kalau yang teruji saling bertentangan: TAHAN."],
    ["jangan masuk kapan tidak beli larangan", "Jangan masuk bila", "Ekspektasi ≤ 0R, RR < 1,5, ada laporan keuangan/RUPS dalam beberapa hari, atau kamu tidak bisa menjelaskan alasannya dalam satu kalimat."],
    ["checklist sebelum beli", "Checklist sebelum beli", "BELI & keyakinan ≥ 50% (lebih baik A+), RR ≥ 1,5, ≥ 3 sinyal searah, rezim tidak bergejolak, tidak ada aksi korporasi dekat, stop siap di sekuritas, rugi bila stop ≤ 1–2% modal, porsi aset ≤ 30%."],
    ["checklist sebelum jual", "Checklist sebelum jual", "Jual karena target/stop tersentuh atau rencana jadi JUAL — bukan panik satu candle merah. Target 1 tercapai: jual sebagian, geser stop ke harga masuk. Catat hasilnya."],
    ["obligasi durasi dv01 konveksitas sbn ori sr yield", "Obligasi", "Mode Yield obligasi: proyeksi yield (Vasicek/CIR) + durasi, DV01, konveksitas, titik impas. Kalkulator obligasi untuk SBN/ORI/SR: isi yield, kupon, tenor, nominal → harga, kupon bersih, skenario yield ±200bp."],
    ["hidden gems berlian tersembunyi diamond murah", "Hidden gems", "F1 → Hidden gems (atau ketik <code>GEMS</code>). Mencari aset yang sudah jatuh jauh, mulai berbalik, ada akumulasi, murah/berkualitas, dan didukung model. ◆ = pola gem pernah berhasil di riwayat aset itu. Kandidat kuat hanya bila ada bukti teruji dan likuid."],
    ["radar scan semua aset perhatikan uji", "Radar", "F1 → Radar (atau ketik <code>RADAR</code>): memindai banyak aset sekaligus dengan konfluensi/A+, binomial (peluang target sebelum stop), nilai intrinsik, dan ML cepat; hasil: Perhatikan / Uji dulu / Abaikan. Klik baris untuk analisis lengkap."],
    ["konfluensi confluence faktor skor timeframe mtf mingguan jam", "Konfluensi & multi-timeframe", "Di kartu Rencana aksi (atau ketik <code>BBCA CONF</code>). Skor = jumlah 9 faktor teknikal (▲ +1, ▼ −1). Lihat apakah skor <b>teruji</b> di aset itu, dan apakah mingguan, harian, 4 jam, dan 1 jam searah."],
    ["keyakinan tinggi a+ setup selektif yakin", "Setup A+ (keyakinan tinggi)", "Keyakinan tinggi yang jujur hanya muncul saat setup A+ terpenuhi: skor konfluensi tinggi + tren harian & mingguan naik, dan kombinasi itu terbukti lebih sering benar di riwayat aset tersebut. Lebih jarang masuk, tapi lebih sering benar. Cari aset dengan <b>A+ aktif</b> di Watchlist → tab Sinyal."],
    ["stop loss otomatis target demo bracket", "Stop & target otomatis (demo)", "Isi Stop loss, Target 1, Target 2 di tiket demo (beli). Setelah terisi: harga ≤ stop → jual semua; ≥ T1 → jual ½ dan stop naik ke harga masuk; ≥ T2 → jual sisa. Dicek tiap 60 detik selama web terbuka."],
    ["strategi 50 backtest uji pilih", "50 strategi", "F6 → Strategi (50) atau ketik <code>BBCA STRAT</code>. Pilih satu lalu Jalankan, atau Bandingkan semua 50. Lihat Sharpe OOS dan bandingkan dengan beli-dan-tahan serta ambang kebetulan di bawah peringkat."],
    ["noise band intraday momentum zarattini", "Noise band", "Strategi intraday: batas = max/min(open, tutup kemarin) × (1 ± rata-rata gerak 14 hari di jam yang sama). Masuk saat harga keluar dari pita, keluar di batas/VWAP, tutup semua sebelum pasar tutup. Pakai data per jam untuk uji yang lebih panjang."],
    ["rate of return ror cagr return bulanan tahunan", "Rate of return", "Total = pertumbuhan seluruh periode; CAGR = rata-rata per tahun; tabel bulanan menunjukkan return tiap bulan dan setahun, bisa dibandingkan dengan beli-dan-tahan."],
    ["ambang kebetulan data mining overfitting sharpe oos", "Kenapa ada ambang kebetulan", "Kalau menguji 50 strategi, yang terbaik pasti terlihat bagus karena kebetulan. Ambang dihitung dari jumlah strategi dan panjang data OOS (Bailey & López de Prado). Di bawah ambang = belum bukti."],
    ["mode pemula pro beda", "Mode Pemula vs Pro", "Datanya sama. Pemula menyembunyikan kuantitatif & opsi, lab matematika, keyakinan model, dan rumus. Ganti lewat tombol MODE."],
    ["tema warna gelap terang terminal kontras", "Tema", "Tombol TEMA: Gelap, Terang, Terminal. Bisa juga di Profil."],
    ["cetak pdf laporan print", "Cetak / PDF", "Tombol CETAK / PDF di kartu harga Analisis membuat laporan bersih untuk disimpan sebagai PDF."],
    ["install aplikasi hp layar utama pwa", "Pasang sebagai aplikasi", "Chrome/Edge: ikon install di address bar. HP: menu browser → Tambahkan ke layar utama."],
    ["tertunda delay live real time data yahoo", "Data tertunda?", "Saham IDX dari Yahoo tertunda ±10–15 menit; kripto dari Binance real-time. Titik LIVE kuning = tertunda, abu = pasar tutup."],
    ["fee biaya pajak broker", "Fee", "Asumsi: IDX beli 0,15%, jual 0,25% (termasuk pajak 0,1%); kripto demo 0,3%. Fee sekuritasmu bisa berbeda."],
    ["kesalahan umum salah baca", "Kesalahan baca yang sering", "Peluang naik 58% bukan berarti pasti naik; median bukan target harga; VaR bukan rugi maksimal; P/E rendah belum tentu murah; backtest in-sample hampir selalu terlalu indah."],
  ];
  const STOP = new Set("yang dan di ke dari untuk apa itu ini cara bagaimana gimana gmn kenapa mengapa saya aku kamu bisa ada dengan atau juga baca membaca arti maksud tolong jelaskan dong sih ya kah".split(" "));
  const toks = (s) => String(s).toLowerCase().replace(/[^a-z0-9%\s]/g, " ").split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w));
  function kbSearch(q) {
    const Q = toks(q); if (!Q.length) return [];
    const docs = KB.map(([k, t, a]) => ({ t, a, k: toks(k + " " + t) })).concat(Object.entries(GLOSS).map(([t, a]) => ({ t, a: esc(a), k: toks(t), gloss: true })));
    return docs.map((d) => ({ ...d, s: Q.reduce((s, w) => s + (d.k.some((x) => x === w) ? 2 : d.k.some((x) => x.startsWith(w) || w.startsWith(x)) ? 1 : 0), 0) + (d.gloss && Q.some((w) => d.t.toLowerCase().includes(w)) ? 1.5 : 0) }))
      .filter((d) => d.s > 0).sort((a, b) => b.s - a.s).slice(0, 4);
  }
  const chat = { open: false, log: [] };
  function chatAdd(who, html) { chat.log.push({ who, html }); const el = document.createElement("div"); el.className = "chat-msg " + who; el.innerHTML = html; $("chatLog").appendChild(el); $("chatLog").scrollTop = 1e9; return el; }
  async function chatAsk(q) {
    q = String(q || "").trim(); if (!q) return; chatAdd("me", esc(q)); $("chatIn").value = "";
    const hits = kbSearch(q), view = ["screen", "quant", "detail", "market", "pf", "trade"].find((v) => !$({ screen: "screenView", quant: "quantView", detail: "detailView", market: "marketView", pf: "pfView", trade: "tradeView" }[v]).hidden);
    const local = hits.length ? `<b>${esc(hits[0].t)}</b><br>${hits[0].a}` + (hits.length > 1 ? `<div class="chat-more">Lihat juga: ${hits.slice(1).map((h) => `<button class="chip" data-chatq="${esc(h.t)}">${esc(h.t)}</button>`).join(" ")}</div>` : "") : "Saya belum menemukan bagian panduan yang cocok. Coba kata kunci lain, misalnya <i>sinyal</i>, <i>isi candle</i>, <i>noise band</i>, <i>VaR</i>.";
    if (view === "detail" && act.plan && state.data) { const la = localAnswer(q, true); if (la) { chatAdd("bot", `${la}<div class="chat-more note">RAM AI · ${esc(state.data.symbol)}</div>`); return; } }
    if (!$("chatAi").checked || !hits.length) { chatAdd("bot", local); return; }
    const el = chatAdd("bot", '<span class="note">Menyusun jawaban…</span>');
    try { const ctx = hits.map((h) => `${h.t}: ${h.a.replace(/<[^>]+>/g, "")}`).join("\n"), extra = state.data && view === "detail" ? `Aset yang sedang dibuka: ${state.data.symbol}.` : "";
      const r = await apiFetch(`${API}?action=guide`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q, ctx, view, extra }) });
      const j = await r.json(); if (!r.ok || j.error) throw new Error(j.error || "AI tidak tersedia");
      el.innerHTML = esc(j.answer).replace(/\n/g, "<br>") + `<div class="chat-more"><span class="note">Dari panduan: ${hits.map((h) => esc(h.t)).join(", ")} · AI</span></div>`;
    } catch (e) { el.innerHTML = local + `<div class="chat-more note">(jawaban langsung dari panduan; AI: ${esc(e.message)})</div>`; }
  }
  function bindChat() {
    $("chatBtn").onclick = () => { chat.open = !chat.open; $("chatBox").hidden = !chat.open; if (chat.open) { if (!chat.log.length) chatAdd("bot", "Halo! Tanyakan cara pakai atau cara membaca apa pun di RAM Capital. Contoh di bawah, atau ketik sendiri."); $("chatIn").focus(); } };
    $("chatClose").onclick = () => { chat.open = false; $("chatBox").hidden = true; };
    $("chatForm").onsubmit = (e) => { e.preventDefault(); chatAsk($("chatIn").value); };
    $("chatBox").addEventListener("click", (e) => { const c = e.target.closest("[data-chatq]"); if (c) chatAsk(c.dataset.chatq); });
    try { $("chatAi").checked = localStorage.getItem("sp_chat_ai") !== "0"; } catch { /* */ }
    $("chatAi").onchange = () => { try { localStorage.setItem("sp_chat_ai", $("chatAi").checked ? "1" : "0"); } catch { /* */ } };
  }

  // =====================================================================
  // KENYAMANAN: "Intinya", kalkulator kalau-aku-beli, mode Pemula/Pro, istilah, tur, cetak
  // =====================================================================
  const volClass = (v) => (v < 0.2 ? ["rendah", "pos"] : v < 0.35 ? ["sedang", ""] : v < 0.6 ? ["tinggi", "neg"] : ["sangat tinggi", "neg"]);
  function renderIntro() {
    const res = state.res, d = state.data; if (!res || res.mode !== "price" || !d) { $("introCard").hidden = true; return; }
    $("introCard").hidden = false;
    const m = res.models[state.sel] || Object.values(res.models)[0], s0 = res.s0, q = m.summary.q, days = state.cfg.days;
    const unit = isCrypto() ? "hari" : "hari bursa", vol = res.stats ? res.stats.volAnn : NaN, [vc, vcls] = volClass(vol);
    const best = typeof pickBest === "function" ? res.models[pickBest(res)] : null, grade = best && best.backtest ? best.backtest.grade : null;
    const L = [];
    L.push(`Dalam <b>${days} ${unit}</b>, 9 dari 10 skenario model berakhir di antara <b>${fmtNum(q[0])}</b> dan <b>${fmtNum(q[6])}</b> (<span class="neg">${spct(q[0] / s0 - 1, 0)}</span> s/d <span class="pos">${spct(q[6] / s0 - 1, 0)}</span>). Titik tengahnya ${fmtNum(q[3])}.`);
    if (isFinite(vol)) L.push(`Tingkat gejolak: <b class="${vcls}">${vc}</b> (volatilitas ${pct(vol, 0)} per tahun). ${vol >= 0.35 ? "Siapkan mental untuk naik-turun tajam." : "Pergerakannya relatif wajar untuk aset sejenis."}`);
    const g = state.sig && state.sig.now ? state.sig.now.score : null;
    if (state.sig && state.sig.now) { const beat = state.sig.oos.strat.sharpe > state.sig.oos.bh.sharpe, v = g >= 2 ? "BELI" : g <= -2 ? "JUAL" : "TAHAN";
      L.push(`Sinyal teknikal: <b class="${g >= 2 ? "pos" : g <= -2 ? "neg" : ""}">${v}</b> (skor ${g > 0 ? "+" : ""}${g}). ${beat ? "Aturan ini pernah lebih baik dari sekadar menahan saham ini." : "Tapi aturan ini <b>tidak</b> lebih baik dari sekadar menahan saham ini di masa lalu, jadi anggap sebagai info tambahan saja."}`); }
    if (state.valUpside != null && isFinite(state.valUpside)) L.push(`Valuasi Damodaran (asumsi default): nilai wajar ${state.valUpside > 0 ? "di atas" : "di bawah"} harga sekarang sekitar <b class="${cls(state.valUpside)}">${spct(state.valUpside, 0)}</b>. Angka ini sangat bergantung pada asumsi pertumbuhan.`);
    if (state.math && state.math.hmm) { const p = state.math.hmm.probHighNow; L.push(`Kondisi pasar untuk aset ini: ${p > 0.6 ? "<b class='neg'>sedang bergejolak</b>" : p < 0.3 ? "<b class='pos'>sedang tenang</b>" : "di antara tenang dan bergejolak"} (peluang rezim bergejolak ${pct(p, 0)}).${state.math.kurt > 1 ? " Kejadian ekstrem lebih sering dari perkiraan kurva normal." : ""}`); }
    if (grade) L.push(`Seberapa bisa dipercaya: uji historis menilai model ini <b class="g-${grade}">${grade}</b>${grade === "Buruk" ? " — rentang di atas jangan dijadikan pegangan" : ""}.`);
    $("introList").innerHTML = L.map((x) => `<li>${x}</li>`).join("");
    $("introAsOf").textContent = `data s/d ${d.dates[d.dates.length - 1]}`;
    renderWhatIf();
  }
  function renderWhatIf() {
    const res = state.res; if (!res || res.mode !== "price") return;
    const m = res.models[state.sel] || Object.values(res.models)[0], s0 = res.s0, q = m.summary.q, idr = (state.data.currency || "") === "IDR";
    const amt = Math.max(0, parseFloat($("wiAmt").value) || 0), idx = isIdx();
    const fb = idx ? 0.0015 : 0.001, fs = idx ? 0.0025 : 0.001; // fee beli/jual (IDX: jual termasuk PPh final 0,1%)
    let units, cost;
    if (idx) { const lot = Math.floor(amt / (s0 * 100 * (1 + fb))); units = lot * 100; cost = units * s0 * (1 + fb); }
    else { units = amt / (s0 * (1 + fb)); cost = amt; }
    if (!units) { $("wiOut").innerHTML = ""; $("wiNote").textContent = idx ? `Belum cukup untuk 1 lot (butuh ±${money(s0 * 100 * (1 + fb))}).` : ""; return; }
    const val = (p) => units * p * (1 - fs) - cost, cur = (v) => (idr ? "Rp " : (state.data.currency || "") + " ") + big(Math.abs(v)).replace(/^Rp /, "");
    const pl = (v) => `<span class="${cls(v)}">${v >= 0 ? "+" : "−"}${cur(v)}</span>`;
    const pLoss = m.probUp != null ? 1 - m.probUp[m.probUp.length - 1] : NaN;
    $("wiOut").innerHTML = [[idx ? "Dapat" : "Dapat", idx ? `${nf(0).format(units / 100)} lot` : `${nf(units < 1 ? 6 : 2).format(units)} unit`, `modal terpakai ${cur(cost)}`],
      ["Skenario buruk (P5)", pl(val(q[0])), "1 dari 20 kemungkinan lebih jelek"], ["Skenario tengah", pl(val(q[3])), "median"], ["Skenario bagus (P95)", pl(val(q[6])), "1 dari 20 kemungkinan lebih bagus"],
      ["Peluang rugi", isFinite(pLoss) ? pct(pLoss, 0) : "–", `di akhir ${state.cfg.days} periode, sebelum fee`]]
      .map(([k, v, h]) => `<div class="kpi"><div class="k">${k}</div><div class="v">${v}</div><div class="h">${h}</div></div>`).join("");
    $("wiNote").textContent = `Sudah termasuk perkiraan fee beli ${pct(fb, 2)} dan jual ${pct(fs, 2)}${idx ? " (termasuk pajak jual 0,1%)" : ""}; belum termasuk dividen. Ukur dulu: sanggupkah kamu menanggung angka skenario buruk tanpa panik?`;
  }

  // ---------- mode Pemula / Pro ----------
  function applyMode(mode, save = true) {
    if (!["simple", "pro", "quick"].includes(mode)) mode = "pro";
    document.body.classList.toggle("mode-simple", mode === "simple"); document.body.classList.toggle("mode-quick", mode === "quick"); document.body.classList.toggle("mode-pro", mode === "pro");
    $("modeBtn").textContent = mode === "simple" ? "MODE: PEMULA" : mode === "quick" ? "MODE: QUICK" : "MODE: PRO";
    $("modeBtn").title = mode === "simple" ? "Tampilan ringkas untuk pemula. Klik untuk Pro." : mode === "quick" ? "Satu lembar untuk trading cepat: rencana aksi + AI + grafik + order. Klik untuk Pemula." : "Semua fitur tampil. Klik untuk Quick (trading cepat).";
    if (mode !== "pro" && $("termView") && !$("termView").hidden) setView("screen");
    if (mode === "quick") { if (state.focus && state.focus !== "all") setFocus("all", false); if (act.plan && !$("detailView").hidden) { drawBrain(); window.scrollTo({ top: 0 }); } }
    if (mode === "simple" && ["math", "trust", "quant"].includes(state.focus)) setFocus("all", false);
    try { localStorage.setItem("sp_mode", mode); } catch { /* */ } if (save) saveSettings({ mode });
    setTimeout(() => window.dispatchEvent(new Event("resize")), 50);
  }

  // ---------- kamus istilah (ketuk istilah bergaris titik) ----------
  const GLOSS = {
    "VaR 95%": "Value at Risk: kerugian yang hanya dilampaui 1 dari 20 kali. Bukan rugi maksimal.", "CVaR": "Rata-rata kerugian di 5% kasus terburuk.",
    "Volatilitas": "Seberapa liar harga bergerak, dalam % per tahun. Makin tinggi makin berisiko.", "Sharpe": "Imbal hasil di atas bunga bebas risiko per unit risiko. > 1 bagus, < 0 kalah dari deposito.",
    "Beta": "Seberapa besar aset ikut gerak indeks. 1 = sama, 2 = dua kali lipat, 0,5 = setengahnya.", "Korelasi": "Seberapa searah dua aset bergerak (−1 sampai 1).",
    "RSI": "Kecepatan gerak 14 hari. > 70 sudah naik sangat cepat, < 30 sudah turun sangat cepat.", "MACD": "Selisih rata-rata cepat dan lambat. Memotong garis sinyal ke atas = momentum membaik.",
    "Stochastic": "Posisi harga di rentang 14 hari terakhir. > 80 dekat puncak, < 20 dekat dasar.", "Bollinger": "Pita MA20 ± 2 standar deviasi. Harga di luar pita = gerak tidak biasa.",
    "Fib": "Level Fibonacci: titik acuan konvensi trader di antara puncak dan dasar.", "ATR": "Rata-rata rentang harian; dipakai untuk mengukur jarak stop loss.",
    "Max drawdown": "Penurunan terdalam dari titik tertinggi sebelumnya.", "Max DD": "Penurunan terdalam dari titik tertinggi sebelumnya.",
    "P/E": "Harga dibagi laba per saham. Bandingkan hanya dalam satu sektor.", "P/BV": "Harga dibagi nilai buku per saham.", "ROE": "Laba bersih dibagi ekuitas: seberapa efisien modal pemegang saham dipakai.",
    "Peluang naik": "Porsi skenario simulasi yang berakhir di atas harga sekarang. Sekitar 50% itu normal.", "Rentang 90%": "9 dari 10 skenario simulasi berakhir di rentang ini.",
    "Kurtosis": "Ketebalan ekor distribusi. > 0 = kejadian ekstrem lebih sering dari kurva normal.", "Skewness": "Kemiringan distribusi. Negatif = penurunan tajam lebih sering daripada kenaikan tajam.",
    "Jarque": "Uji apakah return berdistribusi normal. p < 0,05 = tidak normal.", "Kolmogorov": "Uji apakah return berdistribusi normal. p < 0,05 = tidak normal.",
    "Hurst": "Memori jangka panjang. Di atas nilai acak = tren cenderung berlanjut, di bawahnya = cenderung berbalik.", "Hill": "Indeks ekor rugi. < 4 = ekor tebal; < 2 = sangat ekstrem.",
    "Ljung": "Uji apakah ada pola berulang dalam return (atau dalam besarnya gejolak).", "Market cap": "Harga × jumlah saham beredar: nilai pasar perusahaan.",
    "Div. yield": "Dividen setahun dibagi harga saham.", "Dividend yield": "Dividen setahun dibagi harga saham.", "EPS": "Laba bersih per lembar saham.",
    "Nilai transaksi": "Harga × volume: berapa rupiah yang diperdagangkan. Kecil = sulit jual cepat.", "Porsi risiko": "Berapa persen risiko portofolio yang berasal dari posisi ini.",
    "VWAP": "Harga rata-rata tertimbang volume hari itu.", "POC": "Harga dengan transaksi terbanyak; sering jadi support/resistance.",
    "Kelly": "Ukuran posisi teoretis yang memaksimalkan pertumbuhan. Hampir selalu terlalu agresif; pakai setengahnya atau kurang.",
  };
  const GLOSS_KEYS = Object.keys(GLOSS).sort((a, b) => b.length - a.length);
  let glTimer = null;
  function applyGloss() {
    document.querySelectorAll(".kpi .k, th, .tech-stats div, .kvs span, .lbl").forEach((el) => {
      if (el.dataset.gl || el.children.length > 2) return; const t = el.textContent.trim(); if (!t || t.length > 60) return;
      const k = GLOSS_KEYS.find((k) => t.toLowerCase().startsWith(k.toLowerCase()) || t.toLowerCase().includes(k.toLowerCase()));
      el.dataset.gl = k || "-"; if (k) { el.classList.add("gl"); el.title = GLOSS[k]; } });
  }
  function showGloss(el, e) { const p = $("glPop"), k = el.dataset.gl; if (!GLOSS[k]) return; p.innerHTML = `<b>${esc(k)}</b><br>${esc(GLOSS[k])}`; p.hidden = false;
    const r = el.getBoundingClientRect(); p.style.left = Math.min(innerWidth - 300, Math.max(8, r.left)) + "px"; p.style.top = (r.bottom + 6) + "px"; }

  // ---------- tur pengenalan ----------
  const TOUR = [
    ["#cmdQ", "Baris perintah", "Ketik kode saham lalu Enter, misalnya BBCA. Tambahkan fungsi seperti BBCA DES atau TLKM HP. Ketik HELP untuk semua perintah."],
    ["#views", "Lima layar utama", "Watchlist untuk banyak saham, Quant Lab untuk portofolio, Analisis 1 aset, Pasar hari ini, dan Portofolio milikmu. Pintasan: F1–F5."],
    ["#modeBtn", "Mode Pemula / Pro", "Mode Pemula menyembunyikan bagian yang sangat teknis. Pindah ke Pro kapan saja untuk semua fitur."],
    ["#introCard", "Intinya", "Di Analisis 1 aset, kartu ini merangkum semuanya dalam bahasa sehari-hari, plus kalkulator: kalau beli Rp 10 juta, skenario terburuk dan terbaiknya berapa."],
    ["#cmdUser", "Profil & bantuan", "Ganti nama dan tema di sini. Istilah yang bergaris titik bisa diketuk untuk melihat artinya."],
  ];
  let tourI = 0;
  function startTour() { tourI = 0; $("tour").hidden = false; showTourStep(); }
  function showTourStep() {
    document.querySelectorAll(".tour-hl").forEach((x) => x.classList.remove("tour-hl"));
    if (tourI >= TOUR.length) { $("tour").hidden = true; try { localStorage.setItem("sp_toured", "1"); } catch { /* */ } saveSettings({ toured: true }); return; }
    const [sel, t, txt] = TOUR[tourI]; let el = document.querySelector(sel);
    if (sel === "#introCard" && el && el.offsetParent === null) el = null;
    if (el) { el.classList.add("tour-hl"); el.scrollIntoView({ block: "center", behavior: "smooth" }); }
    $("tourStep").textContent = `${tourI + 1} / ${TOUR.length}`; $("tourTitle").textContent = t; $("tourText").textContent = txt; $("tourNext").textContent = tourI === TOUR.length - 1 ? "Selesai" : "Lanjut";
    const c = $("tourCard"); if (el) { const r = el.getBoundingClientRect(); c.style.top = Math.min(innerHeight - 220, r.bottom + 12) + "px"; c.style.left = Math.min(innerWidth - 360, Math.max(12, r.left)) + "px"; c.style.transform = "none"; }
    else { c.style.top = "40%"; c.style.left = "50%"; c.style.transform = "translate(-50%,-50%)"; }
  }
  function bindComfort() {
    let mode = null; try { mode = localStorage.getItem("sp_mode"); } catch { /* */ }
    applyMode(settings.mode || mode || (me && me.role === "admin" ? "pro" : "simple"), false);
    $("modeBtn").onclick = () => { const b = document.body.classList; applyMode(b.contains("mode-simple") ? "pro" : b.contains("mode-quick") ? "simple" : "quick"); };
    $("wiAmt").addEventListener("input", renderWhatIf);
    $("wiChips").addEventListener("click", (e) => { const c = e.target.closest(".chip[data-v]"); if (c) { $("wiAmt").value = c.dataset.v; renderWhatIf(); } });
    $("printBtn").onclick = () => { setFocus("all", false); document.body.classList.add("printing"); setTimeout(() => { window.print(); document.body.classList.remove("printing"); }, 300); };
    new MutationObserver(() => { clearTimeout(glTimer); glTimer = setTimeout(applyGloss, 400); }).observe(document.body, { childList: true, subtree: true });
    document.addEventListener("click", (e) => { const g = e.target.closest(".gl"); if (g && !e.target.closest("th[data-i]")) { showGloss(g, e); e.stopPropagation(); } else $("glPop").hidden = true; });
    $("tourNext").onclick = () => { tourI++; showTourStep(); }; $("tourSkip").onclick = () => { tourI = TOUR.length; showTourStep(); };
    let toured = settings.toured; try { toured = toured || localStorage.getItem("sp_toured"); } catch { /* */ }
    if (!toured) setTimeout(startTour, 1500);
  }

  // =====================================================================
  // GAYA BLOOMBERG: perintah mnemonic, panel fungsi (DES, HP, ALRT, HELP)
  // =====================================================================
  const FN = {
    GP: ["Grafik harga (candlestick)", "aset"], GIP: ["Grafik intraday 5 menit", "aset"], DES: ["Deskripsi & statistik kunci", "aset"], HP: ["Riwayat harga harian (tabel + CSV)", "aset"],
    FA: ["Laporan keuangan & valuasi", "aset"], N: ["Berita + analisis AI", "aset"], SIG: ["Sinyal beli/jual + backtest", "aset"], MC: ["Proyeksi Monte Carlo/GARCH", "aset"],
    PLAN: ["Rencana jual per lot", "aset"], MATH: ["Lab matematika: Gaussian, Student-t, GMM, HMM, Hurst", "aset"], COMP: ["Perbandingan vs indeks/aset lain", "aset"], OMON: ["Opsi, risiko & metrik hedge fund", "aset"], TRUST: ["Keyakinan model (backtest)", "aset"],
    ALRT: ["Alarm harga", "opsional"], WEI: ["Indeks dunia", ""], WCRS: ["Kurs rupiah", ""], CMDTY: ["Komoditas", ""], GOVT: ["Obligasi & suku bunga", ""], MOST: ["Saham IDX paling aktif", ""],
    ECO: ["Kalender ekonomi", ""], SHIP: ["Shipping & freight", ""], W: ["Watchlist", ""], EQS: ["Screener watchlist (tab Sinyal)", ""], PORT: ["Portofolio saya", ""], QL: ["Quant Lab", ""], TOUR: ["Tur pengenalan", ""], DEMO: ["Akun demo (paper trading)", ""], STRAT: ["Uji 50 strategi + noise band", "opsional"], ML: ["Machine learning: peluang naik, prediksi harga, valuasi gabungan, dampak berita", "aset"], ACT: ["Rencana aksi: beli/jual/tahan, harga & waktu", "aset"], RADAR: ["Radar: scan semua aset → mana yang diperhatikan", ""], AUTO: ["Autopilot: bid & offer otomatis (ML + DL + AI)", ""], GEMS: ["Hidden gems: cari aset tersembunyi (nilai + pembalikan + akumulasi + ML/DL)", ""], CONF: ["Konfluensi 9 faktor (teruji historis) + multi-timeframe mingguan/harian/4 jam/1 jam", "aset"], QUICK: ["Mode Quick (satu lembar trading cepat)", ""], SETUP: ["Aktifkan persetujuan admin (SQL siap salin + tutorial)", ""], TERM: ["Terminal: 8 panel terhubung (jam dunia, montase, peta pasar, monitor, fokus, grafik, scatter, penggerak)", ""], BUY: ["Tiket beli demo untuk aset ini", "aset"], SELL: ["Tiket jual demo untuk aset ini", "aset"], HELP: ["Daftar perintah", ""],
  };
  const FN_ALIAS = { G: "GP", GPC: "GP", GPO: "GP", INTRA: "GIP", NEWS: "N", CN: "N", TOP: "SHIP", FRT: "SHIP", FREIGHT: "SHIP", FXIP: "WCRS", FX: "WCRS", GLCO: "CMDTY", WB: "GOVT", BOND: "GOVT",
    CAL: "ECO", LP: "TERM", BLP: "TERM", LAUNCHPAD: "TERM", TERMINAL: "TERM", AI: "ML", FORECAST: "ML", PREDIKSI: "ML", VALUASI: "FA", RENCANA: "ACT", MTF: "CONF", SCAN: "RADAR", RDR: "RADAR", GEM: "GEMS", AUTOPILOT: "AUTO", BOT: "AUTO", DIAMOND: "GEMS", HIDDEN: "GEMS", KONFLUENSI: "CONF", CHECK: "CONF", PLANAKSI: "ACT", Q: "QUICK", APPROVAL: "SETUP", ADMIN: "SETUP", BT: "STRAT", BACKTEST: "STRAT", NOISE: "STRAT", B: "BUY", S: "SELL", PAPER: "DEMO", TRADE: "DEMO", GAUSS: "MATH", HMM: "MATH", REGIME: "MATH", STAT: "MATH", PRTU: "PORT", PF: "PORT", BETA: "COMP", RV: "COMP", OV: "OMON", GF: "MC", FCST: "MC", DVD: "DES", RELS: "DES", WL: "W", MON: "W", ALERT: "ALRT", "?": "HELP", MENU: "MENU" };
  const YELLOW = new Set(["EQUITY", "EQ", "IJ", "INDEX", "CURNCY", "CMDTY", "COMDTY", "GOVT", "CORP", "GO"]);
  function normTicker(t, us) { t = t.toUpperCase(); if (us) return t;
    const al = ALIASES.find(([k]) => k === t.toLowerCase()); if (al) return al[1];
    if (/^[A-Z]{4}$/.test(t) && !/^(BTC|ETH|SOL|BNB|XRP)/.test(t)) return t + ".JK"; // kode saham IDX 4 huruf
    if (/^(BTC|ETH|SOL|BNB|XRP|DOGE|ADA)$/.test(t)) return t + "-USD";
    return t; }
  const fnHist = [];
  async function runCommand(raw) {
    const toks = String(raw).trim().toUpperCase().split(/\s+/).filter((x) => x && !YELLOW.has(x) || x === "CMDTY" || x === "GOVT");
    if (!toks.length) return;
    let fn = null, last = toks[toks.length - 1]; last = FN_ALIAS[last] || last;
    const first = FN_ALIAS[toks[0]] || toks[0];
    if (FN[last] || last === "MENU") { fn = last; toks.pop(); }
    else if (FN[first] && toks.length > 1) { fn = first; toks.shift(); } // juga terima urutan FUNGSI TICKER
    let us = false; if (toks.length > 1 && toks[toks.length - 1] === "US") { us = true; toks.pop(); }
    const sym = toks.length ? normTicker(toks.join(""), us) : null;
    fnHist.unshift(String(raw).toUpperCase()); fnHist.length = Math.min(fnHist.length, 20);
    if (fn === "MENU") { closeFn(); return; }
    if (fn === "HELP") return showHelp();
    if (fn === "TOUR") { closeFn(); return startTour(); }
    if (fn === "SETUP") return showApprovalSetup();
    if (fn === "TERM") { closeFn(); if (document.body.classList.contains("mode-simple") || document.body.classList.contains("mode-quick")) applyMode("pro"); if (sym) tm.sel = sym; setView("term"); return; }
    if (fn === "QUICK") { closeFn(); applyMode("quick"); if (sym && sym !== state.symbol) await openDetail(sym); else setView("detail"); return; }
    if (fn === "ALRT") return showAlerts(sym);
    const market = { WEI: "mkIdx", WCRS: "mkFx", CMDTY: "mkCmd", GOVT: "mkBond", MOST: "mkMov", ECO: "mkCal", SHIP: "shipCard" };
    if (market[fn]) { closeFn(); setView("market"); if (fn === "MOST") { mk.mov = "value"; document.querySelectorAll("#mkMovTabs .tab").forEach((x) => x.classList.toggle("active", x.dataset.m === "value")); if (mk.at) renderMovers(); }
      setTimeout(() => { const el = $(market[fn]); (el.closest(".card") || el).scrollIntoView({ behavior: "smooth", block: "start" }); flashCard(el.closest(".card") || el); }, 400); return; }
    if (fn === "AUTO") { closeFn(); setView("trade"); setTradeTab("ap"); return; }
    if (fn === "GEMS") { closeFn(); setView("screen"); setTimeout(() => { $("gemCard").scrollIntoView({ behavior: "smooth", block: "start" }); if (!gm.rows.length) runGems(); }, 300); return; }
    if (fn === "RADAR") { closeFn(); setView("screen"); setTimeout(() => { $("radarCard").scrollIntoView({ behavior: "smooth", block: "start" }); if (!rd.rows.length) runRadar(); }, 300); return; }
    if (fn === "W" || fn === "EQS") { closeFn(); setView("screen"); if (fn === "EQS") setTimeout(() => { const t = document.querySelector('#wlCols .tab[data-c="sinyal"]'); if (t) t.click(); }, 300); return; }
    if (fn === "PORT") { closeFn(); setView("pf"); return; }
    if (fn === "DEMO") { closeFn(); setView("trade"); setTradeTab("demo"); return; }
    if (fn === "STRAT") { closeFn(); setView("trade"); if (sym) $("sSym").value = sym; setTradeTab("strat"); return; }
    if (fn === "BUY" || fn === "SELL") { closeFn(); const t = sym || state.symbol; if (!state.data || state.data.symbol !== t || $("detailView").hidden) { setFocus("all", false); await openDetail(t); } openTrade(t, fn === "BUY" ? "buy" : "sell"); return; }
    if (fn === "QL") { closeFn(); setView("quant"); return; }
    const target = sym || state.symbol;
    if (fn === "DES") return showDes(target);
    if (fn === "HP") return showHp(target);
    closeFn();
    const focus = { ML: "ml", ACT: "signal", CONF: "signal", GP: "candle", GIP: "candle", FA: "val", N: "news", SIG: "signal", MC: "proj", PLAN: "plan", COMP: "cmp", OMON: "quant", TRUST: "trust", MATH: "math" }[fn] || "all";
    const need = sym && (sym !== state.symbol || !state.res);
    if (need) { setFocus(focus); await openDetail(sym); } else { setView("detail"); }
    setFocus(focus);
    if (fn === "GIP") { const t = document.querySelector('#tfTabs .tab[data-tf="5m"]'); if (t) t.click(); }
    else if (fn === "CONF") { setActTab("conf"); let k = 0; const go = () => { const el = $("actConf"); if (el && el.innerHTML) { el.scrollIntoView({ behavior: "smooth", block: "start" }); flashCard(el); } else if (k++ < 40) setTimeout(go, 500); }; go(); }
    else if (fn === "GP" && isIntra()) { const t = document.querySelector('#tfTabs .tab[data-tf="D"]'); if (t) t.click(); }
  }
  function flashCard(el) { if (!el) return; el.classList.remove("flash-card"); void el.offsetWidth; el.classList.add("flash-card"); }
  function openFn(title, html) { $("fnTitle").innerHTML = title; $("fnBody").innerHTML = html; $("fnPanel").hidden = false; $("fnPanel").focus(); }
  function closeFn() { $("fnPanel").hidden = true; }
  function showHelp() {
    const row = (k) => `<tr><td><span class="fn-key">${k}</span></td><td class="txt">${FN[k][0]}</td><td class="note">${FN[k][1] === "aset" ? "BBCA " + k : FN[k][1] === "opsional" ? k + " / BBCA " + k : k}</td></tr>`;
    openFn("HELP <span class='note'>· daftar perintah</span>", `<p class="note">Ketik di baris perintah paling atas lalu <b>Enter</b> (= &lt;GO&gt;). Format seperti Bloomberg: <code>TICKER FUNGSI</code>. Kode saham IDX 4 huruf otomatis jadi <code>.JK</code> (saham AS tambahkan <code>US</code>, mis. <code>AAPL US DES</code>); <code>EQUITY</code>, <code>IJ</code>, <code>GO</code> boleh ditulis atau tidak. <b>Esc</b> = &lt;MENU&gt; (tutup panel). <b>/</b> = fokus ke baris perintah. F1–F5 = pindah layar.</p>
      <div class="fn-cols"><div><div class="subh">Satu aset</div><table>${Object.keys(FN).filter((k) => FN[k][1] === "aset").map(row).join("")}</table></div>
      <div><div class="subh">Pasar & alat</div><table>${Object.keys(FN).filter((k) => FN[k][1] !== "aset").map(row).join("")}</table></div></div>
      ${me && me.role === "admin" ? '<p class="note"><a href="https://claude.ai/artifact/Gsh64n2QBhwzjocJJWqDbU" target="_blank" rel="noopener">Buku panduan lengkap</a> (dokumen pribadi admin; bagikan ke anggota bila perlu).</p>' : '<p class="note">Buku panduan lengkap dibagikan oleh admin.</p>'}
      <p class="note"><button class="fn-key" data-cmd="TOUR">Ulangi tur pengenalan</button></p>
      <p class="note">Contoh: <code>BBCA DES</code>, <code>TLKM HP</code>, <code>BBRI GIP</code>, <code>ANTM N</code>, <code>WEI</code>, <code>MOST</code>, <code>SHIP</code>, <code>ALRT</code>. ${fnHist.length ? "Terakhir: " + fnHist.slice(0, 6).map((x) => `<code>${esc(x)}</code>`).join(" ") : ""}</p>`);
  }
  async function showDes(sym) {
    openFn(`${esc(sym)} <span class="note">DES · deskripsi</span>`, '<p class="status">Memuat…</p>');
    try {
      const d = await fetchSymbol(sym, "2y"); const v = d.values, n = v.length, last = v[n - 1];
      const eq = !/^\^/.test(d.symbol) && !/=F$|=X$/.test(d.symbol) && !/INDEX|CURRENCY|FUTURE|CRYPTO/i.test(d.type || "");
      let F = {}; if (eq) { try { F = await (await apiFetch(`${API}?action=fundamentals&symbol=${encodeURIComponent(d.symbol)}`)).json(); } catch { /* */ } }
      const back = (days) => { const t = new Date(d.dates[n - 1]); t.setDate(t.getDate() - days); const ts = t.toISOString().slice(0, 10); let i = n - 1; while (i > 0 && d.dates[i] > ts) i--; return last / v[i] - 1; };
      const yi = d.dates.findIndex((x) => x >= d.dates[n - 1].slice(0, 4) + "-01-01"), yr = (d.ohlc.length ? d.ohlc : v.map((x) => [0, x, x, x, x, 0])).slice(-252);
      const hi = Math.max(...yr.map((b) => b[2])), lo = Math.min(...yr.map((b) => b[3])), liq = liquidity(d), sg = quickSignal(d, DAMO.biRate, 252);
      const r = MCEngine.logReturns(v.slice(-253)), vol = MCEngine.std(r) * Math.sqrt(252), cur = d.currency;
      const kv = (k, val) => `<div><span>${k}</span><b>${val}</b></div>`;
      const pos52 = hi > lo ? (last - lo) / (hi - lo) : NaN;
      openFn(`${esc(d.symbol)} <span class="note">DES · ${esc(d.name || "")}</span>`, `
        <div class="des-top"><div><div class="des-px">${fmtNum(last)} <span class="note">${esc(cur)}</span></div><div>${pc(v[n - 1] / v[n - 2] - 1, 2)} hari ini · ${esc(F.sector || TYPE_ID[d.type] || d.type || "")}${F.industry ? " · " + esc(F.industry) : ""}</div></div>
          <div class="des-range"><div class="note">Rentang 52 minggu</div><div class="r52"><span>${fmtNum(lo)}</span><div class="r52-bar"><i style="left:${isFinite(pos52) ? (pos52 * 100).toFixed(1) : 50}%"></i></div><span>${fmtNum(hi)}</span></div></div></div>
        <div class="fn-cols">
          <div class="kvs"><div class="subh">Harga & risiko</div>${kv("1 minggu", pc(back(7)))}${kv("1 bulan", pc(back(30)))}${kv("3 bulan", pc(back(91)))}${kv("YTD", yi > 0 ? pc(last / v[yi - 1] - 1) : "–")}${kv("1 tahun", pc(back(365)))}
            ${kv("Volatilitas 1T", pct(vol))}${kv("Beta (Yahoo)", F.beta != null ? nf(2).format(F.beta) : "–")}${kv("Sinyal teknikal", sigPill(sg))}${liq ? kv("Nilai transaksi rata-rata 20h", big(liq.avgVal, cur)) + kv("Volume rata-rata 20h", big(liq.avgVol) + (liq.lotDiv === 100 ? " lot" : "")) : ""}</div>
          <div class="kvs"><div class="subh">Valuasi & fundamental</div>${kv("Market cap", F.marketCap ? big(F.marketCap, cur) : "–")}${kv("Saham beredar", F.shares ? big(F.shares) : "–")}${kv("P/E (trailing)", F.trailingPE ? nf(1).format(F.trailingPE) : "–")}${kv("P/E (forward)", F.forwardPE ? nf(1).format(F.forwardPE) : "–")}
            ${kv("P/BV", F.priceToBook ? nf(2).format(F.priceToBook) : "–")}${kv("ROE", F.roe != null ? pct(F.roe) : "–")}${kv("Margin operasi", F.operatingMargin != null ? pct(F.operatingMargin) : "–")}${kv("Pertumbuhan pendapatan", F.revenueGrowth != null ? pc(F.revenueGrowth) : "–")}
            ${kv("Dividend yield", F.dividendYield != null ? pct(F.dividendYield, 2) : "–")}${kv("Payout ratio", F.payoutRatio != null ? pct(F.payoutRatio, 0) : "–")}${kv("Utang / kas", F.totalDebt != null ? `${big(F.totalDebt, cur)} / ${big(F.totalCash, cur)}` : "–")}</div></div>
        <div class="fn-actions">${["GP", "GIP", "HP", "FA", "N", "SIG", "MC", "COMP"].map((k) => `<button class="fn-key" data-cmd="${esc(d.symbol)} ${k}">${k}</button>`).join("")}<button class="fn-key" data-cmd="ALRT ${esc(d.symbol)}">ALRT</button></div>
        <p class="note">Sumber: Yahoo Finance. ${eq ? "" : "Aset ini bukan saham, jadi tidak ada data fundamental."}</p>`);
    } catch (e) { openFn(`${esc(sym)} <span class="note">DES</span>`, `<p class="status err">${esc(e.message)}</p>`); }
  }
  const hp = { sym: null, n: 63, d: null };
  async function showHp(sym, n) {
    hp.sym = sym; if (n) hp.n = n;
    openFn(`${esc(sym)} <span class="note">HP · riwayat harga</span>`, '<p class="status">Memuat…</p>');
    try {
      const d = await fetchSymbol(sym, "2y"); hp.d = d; const lotDiv = /\.JK$/i.test(d.symbol) ? 100 : 1;
      const rows = (d.ohlc.length ? d.ohlc : d.dates.map((x, i) => [x, NaN, NaN, NaN, d.values[i], 0])).slice(-hp.n - 1);
      const body = rows.slice(1).map((b, i) => [b, b[4] / rows[i][4] - 1]).reverse();
      const up = body.filter((x) => x[1] > 0).length;
      openFn(`${esc(d.symbol)} <span class="note">HP · ${esc(d.name || "")}</span>`, `
        <div class="toolbar"><div class="tabs" id="hpRange">${[[21, "1B"], [63, "3B"], [126, "6B"], [252, "1T"], [500, "2T"]].map(([k, l]) => `<button class="tab ${k === hp.n ? "active" : ""}" data-n="${k}">${l}</button>`).join("")}</div>
          <button class="fn-key" id="hpCsv">Unduh CSV</button></div>
        <p class="note">${body.length} hari bursa · ${up} hari naik, ${body.length - up} hari turun · harga mentah (belum disesuaikan dividen/split)${lotDiv === 100 ? " · volume dalam lot" : ""}</p>
        <div class="table-wrap hp-wrap"><table><thead><tr><th>Tanggal</th><th>Buka</th><th>Tertinggi</th><th>Terendah</th><th>Tutup</th><th>Perubahan</th><th>Volume</th><th>Nilai</th></tr></thead><tbody>
        ${body.map(([b, c]) => `<tr><td>${b[0]}</td><td>${fmtNum(b[1])}</td><td>${fmtNum(b[2])}</td><td>${fmtNum(b[3])}</td><td><b>${fmtNum(b[4])}</b></td><td>${pc(c, 2)}</td><td>${big(b[5] / lotDiv)}</td><td>${big(b[4] * b[5], d.currency)}</td></tr>`).join("")}</tbody></table></div>`);
    } catch (e) { openFn(`${esc(sym)} <span class="note">HP</span>`, `<p class="status err">${esc(e.message)}</p>`); }
  }
  function hpCsv() { const d = hp.d; if (!d) return; const rows = (d.ohlc.length ? d.ohlc : d.dates.map((x, i) => [x, "", "", "", d.values[i], ""])).slice(-hp.n);
    const csv = "date,open,high,low,close,volume\n" + rows.map((b) => b.join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = `${d.symbol}_HP.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }

  // ---------- alarm harga (ALRT) ----------
  const AL_KEY = "sp_alerts_v1";
  const al = { list: [], timer: null };
  function alLoad() { try { al.list = JSON.parse(localStorage.getItem(AL_KEY) || "[]"); } catch { al.list = []; } }
  function alSave() { try { localStorage.setItem(AL_KEY, JSON.stringify(al.list)); } catch { /* */ } saveSettings({ alerts: al.list }); updateAlBadge(); }
  function updateAlBadge() { const n = al.list.filter((a) => a.on).length, h = al.list.filter((a) => a.hit && !a.seen).length;
    $("alBtn").textContent = `ALRT ${n}${h ? " · " + h + " ✓" : ""}`; $("alBtn").classList.toggle("hot", h > 0); }
  function showAlerts(sym) {
    al.list.forEach((a) => { if (a.hit) a.seen = true; }); alSave();
    const perm = "Notification" in window ? Notification.permission : "unsupported";
    openFn("ALRT <span class='note'>· alarm harga</span>", `
      <div class="grid al-form"><div><label class="lbl">Ticker</label><input id="alSym" value="${esc(sym || state.symbol || "")}" autocomplete="off"></div>
        <div><label class="lbl">Kondisi</label><select id="alOp"><option value=">=">harga ≥</option><option value="<=">harga ≤</option><option value="pct+">naik ≥ % hari ini</option><option value="pct-">turun ≥ % hari ini</option></select></div>
        <div><label class="lbl">Nilai</label><input id="alVal" type="number" step="any"></div><div><label class="lbl">Catatan</label><input id="alNote" placeholder="mis. area beli"></div></div>
      <div class="fn-actions"><button class="fn-key" id="alAdd">Tambah alarm</button>${perm === "default" ? '<button class="fn-key" id="alPerm">Izinkan notifikasi browser</button>' : perm === "denied" ? '<span class="note">Notifikasi browser diblokir; alarm tetap muncul di layar.</span>' : ""}<button class="fn-key" id="alCheck">Cek sekarang</button></div>
      <div class="table-wrap"><table><thead><tr><th>Ticker</th><th>Kondisi</th><th>Harga terakhir</th><th>Status</th><th>Catatan</th><th></th></tr></thead><tbody>
      ${al.list.length ? al.list.map((a, i) => `<tr><td><span class="pf-sym" data-cmd="${esc(a.s)} DES">${esc(a.s)}</span></td><td>${a.op === ">=" ? "≥ " + fmtNum(a.v) : a.op === "<=" ? "≤ " + fmtNum(a.v) : (a.op === "pct+" ? "naik ≥ " : "turun ≥ ") + nf(1).format(a.v) + "%"}</td>
        <td>${a.px != null ? fmtNum(a.px) : "–"}</td><td>${a.hit ? `<span class="pill pos">kena ${esc(a.hitAt || "")}</span>` : a.on ? '<span class="pill sig">aktif</span>' : "mati"}</td><td class="txt">${esc(a.note || "")}</td>
        <td>${a.hit ? `<button class="x-btn" data-al-re="${i}" title="Aktifkan lagi" style="color:var(--accent)">↻</button>` : ""}<button class="x-btn" data-al-del="${i}">✕</button></td></tr>`).join("") : '<tr><td colspan="6" class="note">Belum ada alarm.</td></tr>'}</tbody></table></div>
      <p class="note">Alarm dicek tiap 60 detik selama web ini terbuka (harga Yahoo tertunda ±10–15 menit untuk saham IDX). Tidak berjalan saat web ditutup karena tidak ada server yang memantau 24 jam. Disimpan di akunmu.</p>`);
  }
  function alAdd() { const s = normTicker($("alSym").value.trim()), op = $("alOp").value, v = parseFloat($("alVal").value);
    if (!s || !isFinite(v)) return; al.list.push({ s, op, v, note: $("alNote").value.trim(), on: true, at: new Date().toISOString().slice(0, 10) }); alSave(); showAlerts(s); checkAlerts(); }
  async function checkAlerts() {
    const act = al.list.filter((a) => a.on); if (!act.length || !session) return;
    const q = await quotesFor([...new Set(act.map((a) => a.s))]); let changed = false;
    for (const a of act) { const x = q[a.s]; if (!x) continue; a.px = x.price; changed = true; const c = x.prevClose ? (x.price / x.prevClose - 1) * 100 : NaN;
      const hit = a.op === ">=" ? x.price >= a.v : a.op === "<=" ? x.price <= a.v : a.op === "pct+" ? c >= a.v : -c >= a.v;
      if (hit) { a.on = false; a.hit = true; a.seen = false; a.hitAt = new Date(Date.now() + 7 * 3600e3).toISOString().slice(5, 16).replace("T", " ");
        const msg = `${a.s} ${a.op === ">=" ? "≥" : a.op === "<=" ? "≤" : a.op === "pct+" ? "naik" : "turun"} ${a.op.startsWith("pct") ? nf(1).format(a.v) + "%" : fmtNum(a.v)} · sekarang ${fmtNum(x.price)}${a.note ? " · " + a.note : ""}`;
        toast("ALARM: " + msg); beep(); try { if ("Notification" in window && Notification.permission === "granted") new Notification("RAM Capital · alarm", { body: msg }); } catch { /* */ } } }
    if (changed) { alSave(); if (!$("fnPanel").hidden && /ALRT/.test($("fnTitle").textContent)) showAlerts(); }
  }
  function toast(msg) { const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; $("toasts").appendChild(t); setTimeout(() => t.remove(), 12000); t.onclick = () => t.remove(); }
  function beep() { try { const c = new (window.AudioContext || window.webkitAudioContext)(), o = c.createOscillator(), g = c.createGain(); o.frequency.value = 880; o.connect(g); g.connect(c.destination); g.gain.value = 0.06; o.start(); setTimeout(() => { o.stop(); c.close(); }, 250); } catch { /* */ } }
  function bindBbg() {
    alLoad(); updateAlBadge(); al.timer = setInterval(() => { if (!document.hidden) checkAlerts(); }, 60000); setTimeout(checkAlerts, 5000);
    $("alBtn").onclick = () => showAlerts(); $("helpBtn").onclick = showHelp; $("fnClose").onclick = closeFn;
    $("fnPanel").addEventListener("click", (e) => { if (e.target === $("fnPanel")) closeFn(); });
    $("fnBody").addEventListener("click", (e) => {
      const c = e.target.closest("[data-cmd]"); if (c) { runCommand(c.dataset.cmd); return; }
      const r = e.target.closest("#hpRange .tab"); if (r) { showHp(hp.sym, +r.dataset.n); return; }
      if (e.target.id === "hpCsv") return hpCsv();
      const ts = e.target.closest("[data-theme-set]"); if (ts) { applyTheme(ts.dataset.themeSet); showProfile(); return; }
      if (e.target.id === "profOut") { $("cmdLogout").click(); return; }
      if (e.target.id === "profSave") { sb.rpc("sp_update_profile", { p_name: $("profName").value }).then(({ data }) => { if (data) me = { ...me, ...data }; $("cmdUser").textContent = (me.name || "").toUpperCase().slice(0, 18) + (me.role === "admin" ? " · ADMIN" : ""); toast("Nama disimpan"); }); return; }
      const mb = e.target.closest("[data-mem]"); if (mb) { const args = { p_user: mb.dataset.mem, p_status: mb.dataset.st || "approved", p_role: mb.dataset.role || null };
        sb.rpc("sp_admin_decide", args).then(({ error }) => { if (error) toast("Gagal: " + error.message); showProfile(); refreshAdminBadge(); }); return; }
      if (e.target.id === "alAdd") return alAdd();
      if (e.target.id === "alCheck") return checkAlerts();
      if (e.target.id === "alPerm") { Notification.requestPermission().then(() => showAlerts()); return; }
      const dl = e.target.closest("[data-al-del]"); if (dl) { al.list.splice(+dl.dataset.alDel, 1); alSave(); showAlerts(); return; }
      const re = e.target.closest("[data-al-re]"); if (re) { const a = al.list[+re.dataset.alRe]; a.on = true; a.hit = false; alSave(); showAlerts(); } });
    document.addEventListener("click", (e) => { const c = e.target.closest("[data-cmd]"); if (c && !c.closest("#fnBody")) { e.preventDefault(); runCommand(c.dataset.cmd); } });
    $("fnBody").addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.closest(".al-form")) alAdd(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("fnPanel").hidden) { e.preventDefault(); closeFn(); } });
    // baris perintah: <GO> = Enter; panah atas = perintah sebelumnya
    $("cmdQ").addEventListener("keydown", (e) => { if (e.key === "ArrowUp" && $("cmdQ").parentElement.querySelector(".sugg").hidden && fnHist.length) { e.preventDefault(); $("cmdQ").value = fnHist[0]; } });
  }

  // =====================================================================
  // TERMINAL: ticker berjalan, jam, baris perintah, tema, tombol fungsi
  // =====================================================================
  const TAPE = ["^JKSE", "^JKLQ45", "BBCA.JK", "BBRI.JK", "BMRI.JK", "TLKM.JK", "ASII.JK", "^GSPC", "^IXIC", "GC=F", "CL=F", "IDR=X", "BTC-USD", "ETH-USD", "^TNX"];
  async function updateTape() {
    if (document.hidden || !session) return;
    const wlSyms = (($("wlQ") && $("wlQ").value) || "").split(/[,\s]+/).map((x) => x.trim().toUpperCase()).filter(Boolean);
    const syms = [...new Set([...TAPE, ...wlSyms])].slice(0, 25);
    try { const j = await (await apiFetch(`${API}?action=quotes&symbols=${encodeURIComponent(syms.join(","))}`)).json();
      const html = (j.quotes || []).filter((q) => q.price != null).map((q) => { const c = q.prevClose ? q.price / q.prevClose - 1 : NaN;
        return `<span class="tape-item" data-s="${esc(q.symbol)}"><b>${esc(q.symbol.replace(/\.JK$/, ""))}</b>${fmtNum(q.price)} <span class="${cls(c)}">${c >= 0 ? "▲" : "▼"} ${spct(c, 2)}</span></span>`; }).join("");
      if (html) $("tapeInner").innerHTML = html + html; } catch { /* */ }
  }
  function tickClock() { const d = new Date(Date.now() + 7 * 3600e3).toISOString(); $("cmdClock").textContent = `${d.slice(0, 10)} ${d.slice(11, 19)} WIB`; }
  const THEMES = ["pro", "light", "terminal"], THEME_LBL = { pro: "GELAP", light: "TERANG", terminal: "TERMINAL" };
  const nextTheme = (t) => THEMES[(THEMES.indexOf(t) + 1) % THEMES.length];
  function themeBtnLbl() { const t = document.documentElement.getAttribute("data-theme"); $("themeBtn").textContent = "TEMA: " + (THEME_LBL[t] || t); $("themeBtn").title = "Ganti ke " + THEME_LBL[nextTheme(t)]; }
  function applyTheme(t) { document.documentElement.setAttribute("data-theme", t); try { localStorage.setItem("sp_theme2", t); } catch { /* */ }
    themeBtnLbl(); if (state.res) render(); if (state.math) renderMath(); if (ql.res) renderQuantLab(); if (wl.rows.length) { renderWatch(); renderWlMap(); } if (typeof pf !== "undefined" && pf.res) renderPortfolio(); }
  function syncTopbar() { const h = document.querySelector(".topbar").offsetHeight; document.documentElement.style.setProperty("--tb", h + 8 + "px"); }
  function bindTerminal() {
    syncTopbar(); addEventListener("resize", syncTopbar); new ResizeObserver(syncTopbar).observe(document.querySelector(".topbar"));
    $("themeBtn").onclick = () => applyTheme(nextTheme(document.documentElement.getAttribute("data-theme")));
    themeBtnLbl();
    attachAC($("cmdQ"), { onPick: (sym) => runCommand(sym) }); bindBbg();
    $("tape").addEventListener("click", (e) => { const t = e.target.closest(".tape-item[data-s]"); if (t) openDetail(t.dataset.s); });
    document.addEventListener("keydown", (e) => { const map = { F1: "screen", F2: "quant", F3: "detail", F4: "market", F5: "pf", F6: "trade", F7: "term" }, k = e.altKey && /^[1-7]$/.test(e.key) ? ["screen", "quant", "detail", "market", "pf", "trade", "term"][+e.key - 1] : map[e.key];
      if (k && $("authGate").hidden) { e.preventDefault(); setView(k); }
      if (e.key === "/" && document.activeElement && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); $("cmdQ").focus(); } });
    tickClock(); setInterval(tickClock, 1000); updateTape(); setInterval(updateTape, 60000);
  }

  // =====================================================================
  // AI (Gemini lewat proxy) untuk berita
  // =====================================================================
  async function runAI() {
    if (!state.news || !state.news.length) { $("aiOut").innerHTML = '<p class="note">Belum ada berita untuk dianalisis.</p>'; return; }
    const btn = $("aiRun"); btn.disabled = true; $("aiOut").innerHTML = '<p class="status">AI sedang membaca berita…</p>';
    const items = state.news.slice(0, 25).map((x, i) => ({ id: i, title: x.title, summary: (x.summary || "").slice(0, 300), publisher: x.publisher || x.via, date: new Date(x.time * 1000).toISOString().slice(0, 10),
      reaksi_abnormal: x.ar != null ? +(x.ar * 100).toFixed(2) : null, signifikan: x.z != null ? Math.abs(x.z) > 1.96 : null }));
    const r = state.res, m = r && r.models[state.sel];
    const ctx = { harga: r ? r.s0 : null, mata_uang: state.data.currency, vol_tahunan: r ? +(r.stats.volAnn * 100).toFixed(1) : null,
      peluang_naik_model: m ? +(m.probUp[m.probUp.length - 1] * 100).toFixed(0) : null, horizon: state.cfg ? state.cfg.days : null };
    try {
      const res = await apiFetch(`${API}?action=ai`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: state.data.symbol, name: state.data.name, items, context: ctx }) });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error || `AI gagal (${res.status})`);
      state.ai = j; renderAI(); renderNews(); renderSignal();
    } catch (e) { $("aiOut").innerHTML = `<p class="status err">${esc(e.message)}</p>`; }
    finally { btn.disabled = false; }
  }
  function renderAI() {
    const A = state.ai; if (!A || !A.overall) return;
    const o = A.overall, dir = o.arah === "naik" ? '<span class="pos">▲ NAIK</span>' : o.arah === "turun" ? '<span class="neg">▼ TURUN</span>' : "◆ NETRAL";
    const react = state.news.filter((x) => x.ar != null), sig = react.filter((x) => Math.abs(x.z) > 1.96);
    const agree = (A.items || []).filter((it) => { const n = state.news[it.id]; return n && n.ar != null && Math.abs(n.z) > 1.96 && ((it.arah === "naik" && n.ar > 0) || (it.arah === "turun" && n.ar < 0)); }).length;
    $("aiOut").innerHTML = `<div class="ai-box"><h3>Penilaian AI · ${esc(A.model || "Gemini")}</h3>
      <div class="kpis compact"><div class="kpi"><div class="k">Arah keseluruhan</div><div class="v">${dir}</div><div class="h">keyakinan ${esc(o.keyakinan || "?")}</div></div>
      <div class="kpi"><div class="k">Peluang naik (AI)</div><div class="v">${o.peluang_naik != null ? pct(o.peluang_naik / 100, 0) : "–"}</div><div class="h">horizon ${ctx_h()}</div></div>
      <div class="kpi"><div class="k">AI vs reaksi pasar</div><div class="v">${sig.length ? `${agree}/${sig.length}` : "–"}</div><div class="h">berita signifikan yang arahnya cocok</div></div></div>
      <p class="ai-sum">${esc(o.ringkasan || "")}</p>${o.risiko ? `<p class="note"><b>Risiko utama:</b> ${esc(o.risiko)}</p>` : ""}
      <p class="note">Peluang dari AI adalah penilaian model bahasa atas teks berita, bukan probabilitas terkalibrasi. Bandingkan dengan simulasi dan reaksi harga aktual.</p></div>`;
  }
  const ctx_h = () => (state.cfg ? `${state.cfg.days} periode` : "–");


