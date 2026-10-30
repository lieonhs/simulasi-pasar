/* RAM Capital · watchlist, harga live, panel candle, Quant Lab, laporan keuangan, Pasar (F4)
   Semua file js/ berbagi satu lingkup global (skrip biasa, dimuat berurutan). Jangan diubah jadi modul tanpa menyesuaikan impor. */
"use strict";
  // =====================================================================
  // WATCHLIST / SCREENER
  // =====================================================================
  const WL_PRESETS = [
    ["Bank besar", "BBCA.JK, BBRI.JK, BMRI.JK, BBNI.JK, BRIS.JK, BBTN.JK"],
    ["Big caps IDX", "BBCA.JK, BBRI.JK, BMRI.JK, TLKM.JK, ASII.JK, BBNI.JK, AMRT.JK, ICBP.JK, UNVR.JK, ADRO.JK, ANTM.JK, GOTO.JK"],
    ["Konsumer", "ICBP.JK, INDF.JK, UNVR.JK, MYOR.JK, AMRT.JK, CPIN.JK, KLBF.JK"],
    ["Tambang & energi", "ADRO.JK, PTBA.JK, ITMG.JK, ANTM.JK, INCO.JK, MDKA.JK, MEDC.JK, PGAS.JK"],
    ["Telko & teknologi", "TLKM.JK, EXCL.JK, ISAT.JK, GOTO.JK, BUKA.JK, EMTK.JK"],
    ["Kripto", "BTC-USD, ETH-USD, SOL-USD, BNB-USD, XRP-USD"],
    ["Lintas aset", "^JKSE, ^GSPC, GC=F, IDR=X, BTC-USD, ^TNX"],
  ];
  const WL_KEY = "sp_watchlist_v1";
  const wl = { rows: [], col: "ringkas", sort: null, dir: -1 };
  function wlLoad() { let v = null; try { v = localStorage.getItem(WL_KEY); } catch { /* */ } $("wlQ").value = v || WL_PRESETS[0][1]; }
  function wlSave() { try { localStorage.setItem(WL_KEY, $("wlQ").value); } catch { /* */ } saveSettings({ watchlist: $("wlQ").value }); }
  function benchFor(sym, type) { if (/\.JK$/i.test(sym)) return "^JKSE"; if (/CRYPTO/i.test(type || "") || /-USDT?$/i.test(sym)) return "BTC-USD"; return "^GSPC"; }
  async function pool(items, k, fn) { const out = new Array(items.length); let i = 0; await Promise.all(Array.from({ length: Math.min(k, items.length) }, async () => { while (i < items.length) { const j = i++; out[j] = await fn(items[j], j); } })); return out; }
  async function runWatchlist() {
    const syms = [...new Set($("wlQ").value.split(/[,\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean))].slice(0, 20);
    if (!syms.length) { $("wlStatus").textContent = "Isi minimal satu ticker."; return; }
    wlSave(); $("wlRun").disabled = true; $("wlStatus").classList.remove("err");
    const range = $("wlRange").value, days = Math.max(1, Math.min(252, parseInt($("wlH").value, 10) || 21)), model = $("wlModel").value;
    let done = 0; const total = syms.length; const tick = (msg) => { done++; $("wlBar").style.width = Math.round((100 * done) / (total * 2)) + "%"; $("wlStatus").textContent = msg; };
    try {
      $("wlStatus").textContent = `Mengambil data ${total} aset…`;
      const datas = await pool(syms, 4, async (s) => { try { const d = await fetchSymbol(s, range); tick(`Data ${s} ✓`); return d; } catch (e) { tick(`Data ${s} gagal`); return { error: e.message, symbol: s }; } });
      const benches = {}; for (const b of new Set(datas.filter((d) => !d.error).map((d) => benchFor(d.symbol, d.type)))) { try { benches[b] = await fetchSymbol(b, range); } catch { /* */ } }
      const rfIDR = DAMO.biRate; await ensureUsRf();
      const wantFund = $("wlFund").checked;
      const rows = await pool(datas, 3, async (d, j) => {
        if (d.error) { tick(`${d.symbol} dilewati`); return { symbol: d.symbol, error: d.error }; }
        const bsym = benchFor(d.symbol, d.type), b = benches[bsym] && benches[bsym].symbol !== d.symbol ? benches[bsym] : null;
        const rf = d.currency === "IDR" ? rfIDR : state.usRf ?? 0.04;
        const m = await compute("screen", { a: { dates: d.dates, values: d.values, type: d.type }, bench: b ? { dates: b.dates, values: b.values } : null, o: { days, sims: 3000, model, rf, seed: 11 + j } });
        let F = null;
        const eq = !/^\^/.test(d.symbol) && !/=F$|=X$/.test(d.symbol) && !/INDEX|CURRENCY|FUTURE|CRYPTO/i.test(d.type || "");
        if (wantFund && eq) { try { F = await (await apiFetch(`${API}?action=fundamentals&symbol=${encodeURIComponent(d.symbol)}`)).json(); } catch { /* */ } }
        tick(`Analisis ${d.symbol} ✓`);
        return { symbol: d.symbol, name: d.name, currency: d.currency, type: d.type, bench: b ? b.symbol : "–", m, F, liq: liquidity(d), sig: quickSignal(d, rf, m.ppy), cf: quickConf(d) };
      });
      wl.rows = rows; wl.days = days; wl.model = model;
      $("wlOut").hidden = false; renderWatch(); renderWlMap(); renderHighlights(); startWlLive();
      const bad = rows.filter((r) => r.error).map((r) => r.symbol);
      $("wlStatus").textContent = `${rows.length - bad.length} aset dianalisis · model ${PRICE_LABEL(model)} · horizon ${days}${bad.length ? ` · gagal: ${bad.join(", ")}` : ""}`;
    } catch (e) { $("wlStatus").textContent = e.message; $("wlStatus").classList.add("err"); }
    finally { $("wlRun").disabled = false; setTimeout(() => ($("wlBar").style.width = "0"), 600); }
  }
  // likuiditas dari OHLC mentah (20 hari bursa terakhir)
  function liquidity(d) {
    const o = (d.ohlc || []).filter((b) => b[5] > 0).slice(-20); if (o.length < 5) return null;
    const lotDiv = /\.JK$/i.test(d.symbol) ? 100 : 1, last = o[o.length - 1];
    const avgVol = o.reduce((s, b) => s + b[5], 0) / o.length, avgVal = o.reduce((s, b) => s + b[4] * b[5], 0) / o.length;
    return { lotDiv, lastVol: last[5] / lotDiv, avgVol: avgVol / lotDiv, lastVal: last[4] * last[5], avgVal, ratio: avgVol > 0 ? last[5] / avgVol : NaN, date: last[0] };
  }
  // sinyal teknikal yang sama dengan bagian "Sinyal beli/jual" (tanpa valuasi & AI)
  function quickSignal(d, rf, ppy) {
    try { const B = MCEngine.signalBacktest(d.dates, d.values, { rf, ppy: ppy || 252 }); const c = B.now; if (!c) return null;
      return { score: c.score, tr: c.tr, mo: c.mo, rs: c.rs, rsi: c.rsi, momRet: c.momRet, verdict: c.score >= 2 ? "BELI" : c.score <= -2 ? "JUAL" : "TAHAN",
        position: B.position, entryDate: B.entryDate, entryPx: B.entryPx, oosS: B.oos.strat.sharpe, oosB: B.oos.bh.sharpe, trades: B.trades.length, win: B.winRate };
    } catch { return null; }
  }
  const sigPill = (g) => (!g ? "–" : `<span class="pill ${g.verdict === "BELI" ? "pos" : g.verdict === "JUAL" ? "neg" : ""}">${g.verdict}</span>`);
  function big(v, cur) { if (!isFinite(v)) return "–"; const a = Math.abs(v);
    const s = a >= 1e12 ? nf(2).format(v / 1e12) + " T" : a >= 1e9 ? nf(2).format(v / 1e9) + " M" : a >= 1e6 ? nf(1).format(v / 1e6) + " jt" : a >= 1e3 ? nf(1).format(v / 1e3) + " rb" : nf(0).format(v);
    return (cur === "IDR" ? "Rp " : "") + s; }
  const PRICE_LABEL = (k) => (MCEngine.PRICE_MODELS[k] ? MCEngine.PRICE_MODELS[k].label : k);
  function sparkSvg(arr) {
    if (!arr || arr.length < 2) return "";
    const w = 80, h = 26, mn = Math.min(...arr), mx = Math.max(...arr), sx = w / (arr.length - 1), sy = mx > mn ? (h - 4) / (mx - mn) : 0;
    const pts = arr.map((v, i) => `${(i * sx).toFixed(1)},${(h - 2 - (v - mn) * sy).toFixed(1)}`).join(" ");
    const c = arr[arr.length - 1] >= arr[0] ? css("--good") : css("--bad");
    return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline fill="none" stroke="${c}" stroke-width="1.5" points="${pts}"/></svg>`;
  }
  const trendIcon = (t) => (t > 0 ? '<span class="pos">▲ naik</span>' : t < 0 ? '<span class="neg">▼ turun</span>' : "◆ datar");
  const pc = (v, d = 1) => `<span class="${cls(v)}">${spct(v, d)}</span>`;
  function quickConf(d) { try { if (!d.ohlc || d.ohlc.length < 300) return null; const C = MCEngine.confluence(buildD(d), { H: 10, ppy: /CRYPTO/i.test(d.type || "") ? 365 : 252 }); if (!C) return null;
      return { s: C.sNow, n: C.nNow, valid: C.valid, aplus: C.sel.active, best: C.sel.best ? { thr: C.sel.best.thr, up: C.sel.best.up, nEff: C.sel.best.nEff } : null, base: C.base }; } catch { return null; } }
  const aplusCell = (r) => (!r.cf ? '<span class="note">data < 300 hari</span>' : r.cf.aplus ? `<b class="pos">A+ aktif</b> <span class="note">${pct(r.cf.best.up, 0)} vs ${pct(r.cf.base, 0)}</span>` : r.cf.best ? `<span class="note">teruji (≥+${r.cf.best.thr}), belum aktif</span>` : '<span class="note">tidak teruji</span>');
  function wlCols() {
    const days = wl.days;
    const C = {
      ringkas: [["Live", (r) => { const q = wl.q && wl.q[r.symbol]; return q && q.prevClose ? q.price / q.prevClose - 1 : null; }, (r) => { const q = wl.q && wl.q[r.symbol];
          if (!q) return `${fmtNum(r.m.last)}`; const c = q.prevClose ? q.price / q.prevClose - 1 : NaN, fl = (wl.flash && wl.flash[r.symbol]) || "";
          return `<span class="${fl}"><b>${fmtNum(q.price)}</b></span> <span class="${cls(c)}">${spct(c, 2)}</span>${q.open === false ? ' <span class="note">tutup</span>' : ""}`; }],
        ["1H", (r) => r.m.chg1d, (r) => pc(r.m.chg1d, 2)], ["3 bulan", null, (r) => sparkSvg(r.m.spark)],
        ["1B", (r) => r.m.ret1m, (r) => pc(r.m.ret1m)], ["1T", (r) => r.m.ret1y, (r) => pc(r.m.ret1y)], ["Tren", (r) => r.m.trend, (r) => trendIcon(r.m.trend)],
        ["RSI", (r) => r.m.rsi, (r) => `<span class="${r.m.rsi > 70 ? "neg" : r.m.rsi < 30 ? "pos" : ""}">${nf(0).format(r.m.rsi)}</span>`],
        [`Peluang naik (${days}p)`, (r) => r.m.probUp, (r) => pct(r.m.probUp, 0)], [`Rentang 90% (${days}p)`, (r) => r.m.simP95 - r.m.simP5, (r) => `${pc(r.m.simP5, 0)} / ${pc(r.m.simP95, 0)}`],
        ["VaR 95%", (r) => r.m.var95, (r) => pct(r.m.var95)], ["Sinyal", (r) => (r.sig ? r.sig.score : null), (r) => sigPill(r.sig)]],
      sinyal: [["Sinyal", (r) => (r.sig ? r.sig.score : null), (r) => sigPill(r.sig)], ["Skor", (r) => (r.sig ? r.sig.score : null), (r) => (r.sig ? `<span class="${cls(r.sig.score)}">${r.sig.score > 0 ? "+" : ""}${r.sig.score}</span> / ±3` : "–")],
        ["Tren MA", (r) => (r.sig ? r.sig.tr : null), (r) => (r.sig ? trendIcon(r.sig.tr) : "–")], ["Momentum 3B", (r) => (r.sig ? r.sig.momRet : null), (r) => (r.sig ? pc(r.sig.momRet) : "–")],
        ["RSI", (r) => (r.sig ? r.sig.rsi : null), (r) => (r.sig && r.sig.rsi != null ? `<span class="${r.sig.rsi > 70 ? "neg" : r.sig.rsi < 30 ? "pos" : ""}">${nf(0).format(r.sig.rsi)}</span>` : "–")],
        ["Sistem sedang", (r) => (r.sig ? r.sig.position : null), (r) => (!r.sig ? "–" : r.sig.position ? `<span class="pos">pegang</span> <span class="note">sejak ${esc(r.sig.entryDate)} (${spct(r.m.last / r.sig.entryPx - 1)})</span>` : '<span class="note">di luar pasar</span>')],
        ["Sharpe OOS aturan / B&H", (r) => (r.sig ? r.sig.oosS - r.sig.oosB : null), (r) => (!r.sig ? "–" : `<span class="${r.sig.oosS > r.sig.oosB ? "pos" : "neg"}">${nf(2).format(r.sig.oosS)}</span> / ${nf(2).format(r.sig.oosB)}`)],
        ["Transaksi · menang", (r) => (r.sig ? r.sig.win : null), (r) => (r.sig ? `${r.sig.trades} · ${pct(r.sig.win, 0)}` : "–")],
        ["Konfluensi", (r) => (r.cf ? r.cf.s : null), (r) => (r.cf ? `<span class="${r.cf.s >= 3 ? "pos" : r.cf.s <= -3 ? "neg" : ""}">${r.cf.s > 0 ? "+" : ""}${r.cf.s}</span> / ${r.cf.n}` : "–")],
        ["Setup A+ (10 hari)", (r) => (r.cf ? (r.cf.aplus ? 2 + r.cf.best.up : r.cf.best ? 1 : 0) : -1), aplusCell]],
      likuid: [["Volume terakhir", (r) => (r.liq ? r.liq.lastVol : null), (r) => (r.liq ? big(r.liq.lastVol) + (r.liq.lotDiv === 100 ? " lot" : "") : "–")],
        ["Rata-rata vol 20h", (r) => (r.liq ? r.liq.avgVol : null), (r) => (r.liq ? big(r.liq.avgVol) + (r.liq.lotDiv === 100 ? " lot" : "") : "–")],
        ["Vol vs rata-rata", (r) => (r.liq ? r.liq.ratio : null), (r) => (r.liq && isFinite(r.liq.ratio) ? `<span class="${r.liq.ratio > 2 ? "pos" : ""}">${nf(1).format(r.liq.ratio)}×</span>` : "–")],
        ["Nilai transaksi terakhir", (r) => (r.liq ? r.liq.lastVal : null), (r) => (r.liq ? big(r.liq.lastVal, r.currency) : "–")],
        ["Nilai transaksi rata-rata 20h", (r) => (r.liq ? r.liq.avgVal : null), (r) => (r.liq ? big(r.liq.avgVal, r.currency) : "–")],
        ["Market cap", (r) => r.F && r.F.marketCap, (r) => (r.F && r.F.marketCap ? big(r.F.marketCap, r.currency) : "–")],
        ["Sektor", null, (r) => `<span class="nm">${esc(((r.F && (r.F.sector || r.F.industry)) || "–").slice(0, 24))}</span>`]],
      kinerja: [["Harga", (r) => r.m.last, (r) => fmtNum(r.m.last)], ["1H", (r) => r.m.chg1d, (r) => pc(r.m.chg1d, 2)], ["1M", (r) => r.m.ret1w, (r) => pc(r.m.ret1w)], ["1B", (r) => r.m.ret1m, (r) => pc(r.m.ret1m)],
        ["3B", (r) => r.m.ret3m, (r) => pc(r.m.ret3m)], ["YTD", (r) => r.m.ytd, (r) => pc(r.m.ytd)], ["1T", (r) => r.m.ret1y, (r) => pc(r.m.ret1y)], ["Dari puncak 52mg", (r) => r.m.offHigh, (r) => pc(r.m.offHigh)],
        ["Di atas MA200", (r) => (r.m.aboveMa200 == null ? -2 : r.m.aboveMa200 ? 1 : 0), (r) => (r.m.aboveMa200 == null ? "–" : r.m.aboveMa200 ? '<span class="pos">ya</span>' : '<span class="neg">tidak</span>')]],
      risiko: [["Volatilitas/th", (r) => r.m.vol, (r) => pct(r.m.vol)], ["Vol model ke depan", (r) => r.m.horizonVol, (r) => pct(r.m.horizonVol)], ["Max DD 1T", (r) => r.m.maxDD, (r) => pct(r.m.maxDD)],
        ["Beta", (r) => r.m.beta, (r) => (isFinite(r.m.beta) ? nf(2).format(r.m.beta) : "–")], ["Korelasi", (r) => r.m.corr, (r) => (isFinite(r.m.corr) ? nf(2).format(r.m.corr) : "–")], ["vs", null, (r) => esc(r.bench)],
        ["Sharpe 1T", (r) => r.m.sharpe, (r) => `<span class="${cls(r.m.sharpe)}">${isFinite(r.m.sharpe) ? nf(2).format(r.m.sharpe) : "–"}</span>`], ["VaR 95%", (r) => r.m.var95, (r) => pct(r.m.var95)]],
      proyeksi: [["Median", (r) => r.m.simMed, (r) => pc(r.m.simMed)], ["P5", (r) => r.m.simP5, (r) => pc(r.m.simP5)], ["P95", (r) => r.m.simP95, (r) => pc(r.m.simP95)],
        ["Peluang naik", (r) => r.m.probUp, (r) => pct(r.m.probUp, 0)], ["Peluang > +10%", (r) => r.m.probUp10, (r) => pct(r.m.probUp10, 0)], ["Peluang < −10%", (r) => r.m.probDn10, (r) => pct(r.m.probDn10, 0)],
        ["Harga P5", (r) => r.m.last * (1 + r.m.simP5), (r) => fmtNum(r.m.last * (1 + r.m.simP5))], ["Harga P95", (r) => r.m.last * (1 + r.m.simP95), (r) => fmtNum(r.m.last * (1 + r.m.simP95))]],
      fund: [["Sektor", null, (r) => `<span class="nm">${esc(((r.F && (r.F.industry || r.F.sector)) || "–").slice(0, 22))}</span>`], ["P/E", (r) => r.F && r.F.trailingPE, (r) => (r.F && r.F.trailingPE ? nf(1).format(r.F.trailingPE) : "–")],
        ["P/BV", (r) => r.F && r.F.priceToBook, (r) => (r.F && r.F.priceToBook ? nf(2).format(r.F.priceToBook) : "–")], ["ROE", (r) => r.F && r.F.roe, (r) => (r.F && r.F.roe != null ? pct(r.F.roe) : "–")],
        ["Div. yield", (r) => r.F && r.F.dividendYield, (r) => (r.F && r.F.dividendYield != null ? pct(r.F.dividendYield, 2) : "–")], ["Margin operasi", (r) => r.F && r.F.operatingMargin, (r) => (r.F && r.F.operatingMargin != null ? pct(r.F.operatingMargin) : "–")],
        ["Growth pendapatan", (r) => r.F && r.F.revenueGrowth, (r) => (r.F && r.F.revenueGrowth != null ? pc(r.F.revenueGrowth) : "–")], ["Market cap", (r) => r.F && r.F.marketCap, (r) => (r.F && r.F.marketCap ? big(r.F.marketCap, r.currency) : "–")],
        ["EPS (laba/saham)", (r) => r.F && r.F.netIncome && r.F.shares ? r.F.netIncome / r.F.shares : null, (r) => (r.F && r.F.netIncome && r.F.shares ? fmtNum(r.F.netIncome / r.F.shares) : "–")],
        ["Utang / ekuitas", (r) => r.F && r.F.totalDebt != null && r.F.bookValuePerShare && r.F.shares ? r.F.totalDebt / (r.F.bookValuePerShare * r.F.shares) : null,
          (r) => (r.F && r.F.totalDebt != null && r.F.bookValuePerShare && r.F.shares ? nf(2).format(r.F.totalDebt / (r.F.bookValuePerShare * r.F.shares)) + "×" : "–")]],
    };
    return C[wl.col];
  }
  function renderWatch() {
    const cols = wlCols(), ok = wl.rows.filter((r) => !r.error), bad = wl.rows.filter((r) => r.error);
    if (wl.sort != null && cols[wl.sort] && cols[wl.sort][1]) { const f = cols[wl.sort][1]; ok.sort((a, b) => { const x = f(a), y = f(b); const xn = x == null || !isFinite(x), yn = y == null || !isFinite(y); return xn && yn ? 0 : xn ? 1 : yn ? -1 : wl.dir * (y - x); }); }
    $("wlTable").innerHTML = `<thead><tr><th>Aset</th>${cols.map((c, i) => `<th data-i="${i}" class="${wl.sort === i ? "sorted" : ""}">${c[0]}${wl.sort === i ? (wl.dir < 0 ? " ↓" : " ↑") : ""}</th>`).join("")}</tr></thead><tbody>` +
      ok.map((r) => `<tr><td data-s="${esc(r.symbol)}"><b>${esc(r.symbol)}</b><div class="nm">${esc(r.name || "")}</div></td>${cols.map((c) => `<td>${c[2](r)}</td>`).join("")}</tr>`).join("") +
      bad.map((r) => `<tr class="err-row"><td><b>${esc(r.symbol)}</b><div class="nm">${esc(r.error)}</div></td><td colspan="${cols.length}"></td></tr>`).join("") + "</tbody>";
  }
  function renderWlMap() {
    const ok = wl.rows.filter((r) => !r.error && isFinite(r.m.ret1y)), grid = css("--grid"), muted = css("--muted");
    const col = (t) => (t > 0 ? css("--good") : t < 0 ? css("--bad") : muted);
    const labels = { id: "lbl", afterDatasetsDraw(ch) { const ctx = ch.ctx; ctx.save(); ctx.font = "11px IBM Plex Mono, monospace"; ctx.fillStyle = css("--ink");
      ch.getDatasetMeta(0).data.forEach((pt, i) => ctx.fillText(ok[i].symbol.replace(/\.JK$/, ""), pt.x + 6, pt.y - 6)); ctx.restore(); } };
    if (state.charts.wlMap) state.charts.wlMap.destroy();
    state.charts.wlMap = new Chart($("wlMap"), { type: "scatter", plugins: [labels],
      data: { datasets: [{ data: ok.map((r) => ({ x: r.m.horizonVol * 100, y: r.m.ret1y * 100 })), pointBackgroundColor: ok.map((r) => col(r.m.trend)), pointBorderColor: css("--ink"), pointBorderWidth: 1.5, pointRadius: 7, pointHoverRadius: 9 }] },
      options: baseOpts({ interaction: { mode: "nearest", intersect: true }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${ok[c.dataIndex].symbol}: vol ${nf(1).format(c.raw.x)}%, 1T ${nf(1).format(c.raw.y)}%` } } },
        scales: { x: { title: { display: true, text: "Volatilitas tahunan ke depan (%)", color: muted }, ticks: { color: muted }, grid: { color: grid } },
          y: { title: { display: true, text: "Return 1 tahun (%)", color: muted }, ticks: { color: muted }, grid: { color: grid } } } }) });
  }
  function renderHighlights() {
    const ok = wl.rows.filter((r) => !r.error); if (!ok.length) return;
    const best = (f, dir = 1) => ok.filter((r) => isFinite(f(r))).sort((a, b) => dir * (f(b) - f(a)))[0];
    const L = [], nm = (r) => `<b>${esc(r.symbol)}</b>`;
    const s = best((r) => r.m.sharpe); if (s) L.push(`Imbal hasil per risiko terbaik (Sharpe 1T): ${nm(s)} ${nf(2).format(s.m.sharpe)}`);
    const lv = best((r) => r.m.horizonVol, -1); if (lv) L.push(`Paling tenang (vol ke depan terendah): ${nm(lv)} ${pct(lv.m.horizonVol)}/th`);
    const hv = best((r) => r.m.horizonVol); if (hv && hv !== lv) L.push(`Paling bergejolak: ${nm(hv)} ${pct(hv.m.horizonVol)}/th — rentang 90% ${spct(hv.m.simP5, 0)} s/d ${spct(hv.m.simP95, 0)} dalam ${wl.days} periode`);
    const os = ok.filter((r) => r.m.rsi < 30); if (os.length) L.push(`RSI di bawah 30 (turun sangat cepat): ${os.map(nm).join(", ")}`);
    const ob = ok.filter((r) => r.m.rsi > 70); if (ob.length) L.push(`RSI di atas 70 (naik sangat cepat): ${ob.map(nm).join(", ")}`);
    const up = ok.filter((r) => r.m.trend > 0), dn = ok.filter((r) => r.m.trend < 0); L.push(`Tren naik: ${up.length ? up.map(nm).join(", ") : "–"} · tren turun: ${dn.length ? dn.map(nm).join(", ") : "–"}`);
    const sb = ok.filter((r) => r.sig && r.sig.verdict === "BELI"), ss = ok.filter((r) => r.sig && r.sig.verdict === "JUAL");
    L.push(`Sinyal teknikal BELI: ${sb.length ? sb.map(nm).join(", ") : "–"} · JUAL: ${ss.length ? ss.map(nm).join(", ") : "–"} <span class="note">(lihat tab Sinyal; cek apakah aturannya lolos backtest di saham itu)</span>`);
    const lq = best((r) => (r.liq ? r.liq.avgVal : NaN)); if (lq && lq.liq) L.push(`Paling likuid (nilai transaksi rata-rata 20h): ${nm(lq)} ${big(lq.liq.avgVal, lq.currency)}/hari`);
    const il = best((r) => (r.liq ? r.liq.avgVal : NaN), -1); if (il && il !== lq && il.liq && il.currency === "IDR" && il.liq.avgVal < 5e9) L.push(`Kurang likuid: ${nm(il)} hanya ${big(il.liq.avgVal, il.currency)}/hari — order besar bisa menggeser harga`);
    const sp = ok.filter((r) => r.liq && r.liq.ratio > 2); if (sp.length) L.push(`Volume melonjak (>2× rata-rata): ${sp.map(nm).join(", ")}`);
    const dd = best((r) => r.m.offHigh, -1); if (dd) L.push(`Paling jauh dari puncak 52 minggu: ${nm(dd)} ${spct(dd.m.offHigh)}`);
    const pb = ok.filter((r) => r.F && r.F.priceToBook && r.F.roe != null); if (pb.length > 1) { const x = pb.sort((a, b) => b.F.roe / b.F.priceToBook - a.F.roe / a.F.priceToBook)[0]; L.push(`ROE tertinggi per unit P/BV: ${nm(x)} (ROE ${pct(x.F.roe)}, P/BV ${nf(2).format(x.F.priceToBook)}) — cek valuasinya di Analisis 1 aset`); }
    $("wlHigh").innerHTML = L.map((x) => `<li>${x}</li>`).join("");
  }
  document.addEventListener("toggle", (e) => { const d = e.target; if (d.classList && d.classList.contains("formula") && d.open && !d.dataset.rendered && window.renderMathInElement) {
    window.renderMathInElement(d, { delimiters: [{ left: "\\(", right: "\\)", display: false }, { left: "$$", right: "$$", display: true }], throwOnError: false }); d.dataset.rendered = "1"; } }, true);

  // ---------- bilah fokus ----------
  const FOCUS = { ml: ["headCard", "actCard", "mlCard"], signal: ["headCard", "actCard", "mlCard", "introCard", "signalCard", "candleCard", "planCard"], overview: ["headCard", "actCard", "introCard", "kpis", "signalCard", "fanCard", "predCard", "sumCard"], candle: ["headCard", "candleCard"], proj: ["headCard", "fanCard", "predCard", "sumCard", "histCard"],
    plan: ["headCard", "actCard", "planCard"], cmp: ["headCard", "cmpCard"], quant: ["headCard", "quantCard"], val: ["headCard", "finCard", "valCard", "holdCard"], news: ["headCard", "newsCard"],
    trust: ["headCard", "confCard", "paramCard", "caveatCard"], math: ["headCard", "mathCard"] };
  function setFocus(f, save = true) {
    const out = $("out"), keep = FOCUS[f];
    document.querySelectorAll("#focusBar .fchip").forEach((b) => b.classList.toggle("active", b.dataset.f === f));
    out.classList.toggle("focused", !!keep);
    [...out.children].forEach((el) => { if (keep && !keep.includes(el.id)) el.dataset.hide = "1"; else delete el.dataset.hide; });
    if (save) saveSettings({ focus: f });
    state.focus = f;
    setTimeout(() => { window.dispatchEvent(new Event("resize")); if (state.lw) renderCandle(true); }, 60);
    if (save) window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function setView(v) {
    document.querySelectorAll(".view-btn").forEach((b) => b.classList.toggle("active", b.dataset.v === v));
    $("screenView").hidden = v !== "screen"; $("detailView").hidden = v !== "detail"; $("quantView").hidden = v !== "quant";
    $("marketView").hidden = v !== "market"; $("pfView").hidden = v !== "pf"; $("tradeView").hidden = v !== "trade"; $("termView").hidden = v !== "term";
    $("focusBar").hidden = v !== "detail"; document.body.classList.toggle("in-term", v === "term");
    if (v === "term") { stopOB(); stopLive(); tmStart(); return; }
    if (v !== "detail") stopOB();
    if (v === "market") { stopLive(); if (!mk.at || Date.now() - mk.at > 120000) runMarket(); return; }
    if (v === "trade") { stopLive(); mountTicket("trade"); setTradeTab(document.querySelector("#trTabs .seg-btn.active").dataset.t); renderPaper(); refreshPaper(); return; }
    if (v === "detail" && pp.a) setTimeout(syncTradeCard, 0);
    if (v === "pf") { stopLive(); renderPfList(); amRender(); if (!pf.res && pf.list.length && !$("pfRun").disabled) runPortfolio(); return; }
    if (v === "quant") { if (!$("qlQ").value.trim()) $("qlQ").value = $("wlQ").value; if (!ql.res && !$("qlRun").disabled) runQuant(); stopLive(); return; }
    if (v === "screen") { stopLive(); if (wl.rows.length) wlLiveOnce(); else if (!$("wlRun").disabled) runWatchlist(); } else if (state.res) startLive();
    if (v === "detail" && state.lw) setTimeout(renderCandle, 30);
  }
  function openDetail(sym) { setView("detail"); setMode("price", true); pick(sym); $("horizon").value = wl.days || $("horizon").value; const p = run(); scrollTo({ top: 0, behavior: "smooth" }); return p; }

  // =====================================================================
  // HARGA LIVE (Binance WS untuk kripto, Yahoo WS + polling untuk lainnya)
  // =====================================================================
  const live = { on: true, ws: null, poll: null, guard: null, sym: null, last: null, prev: null, src: "", gotWs: false, refetch: null };
  function pbDecode(bytes) {
    let i = 0; const out = {};
    const varint = () => { let r = 0n, s = 0n, b; do { b = bytes[i++]; r |= BigInt(b & 0x7f) << s; s += 7n; } while (b & 0x80 && i < bytes.length); return r; };
    while (i < bytes.length) {
      const key = Number(varint()), f = key >> 3, w = key & 7;
      if (w === 0) out[f] = varint();
      else if (w === 5) { out[f] = new DataView(bytes.buffer, bytes.byteOffset + i, 4).getFloat32(0, true); i += 4; }
      else if (w === 1) { out[f] = new DataView(bytes.buffer, bytes.byteOffset + i, 8).getFloat64(0, true); i += 8; }
      else if (w === 2) { const len = Number(varint()); out[f] = new TextDecoder().decode(bytes.subarray(i, i + len)); i += len; }
      else break;
    }
    return out;
  }
  const zz = (v) => Number((v >> 1n) ^ -(v & 1n));
  function decodeYahoo(b64) { // PricingData: 1 id, 2 price, 3 time, 8 changePercent, 9 dayVolume, 10 dayHigh, 11 dayLow, 12 change, 16 previousClose
    const bin = atob(b64), bytes = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
    const f = pbDecode(bytes); let t = f[3] != null ? zz(f[3]) : Date.now(); if (t > 1e12) t /= 1000;
    return { symbol: f[1], price: f[2], time: t, high: f[10], low: f[11], volume: f[9] != null ? zz(f[9]) : null, prevClose: f[16] ?? (f[2] != null && f[12] != null ? f[2] - f[12] : null) };
  }
  function stopLive() {
    if (live.ws) { try { live.ws.onclose = null; live.ws.close(); } catch { /* */ } live.ws = null; }
    clearInterval(live.poll); clearTimeout(live.guard); clearInterval(live.refetch); live.poll = live.guard = live.refetch = null;
  }
  function startLive() {
    stopLive(); setLiveDot("closed", "");
    if (!live.on || !state.data || state.csv || state.mode !== "price" || document.hidden) return;
    const sym = state.data.symbol; live.sym = sym; live.gotWs = false; live.last = null;
    pollOnce(); // isi high/low/prev close segera
    const m = sym.toUpperCase().match(/^([A-Z0-9]+)-USDT?$/);
    if (m) wsBinance(m[1].toLowerCase()); else wsYahoo(sym);
    live.guard = setTimeout(() => { if (!live.gotWs) startPolling(); }, 8000);
    live.refetch = setInterval(async () => { if (document.hidden) return; if (isIntra()) { try { await loadIntraday(); renderCandle(true); } catch { /* */ } } if (book.tab === "vp") { book.vp = null; renderVP(); } }, 120000);
  }
  function startPolling() { clearInterval(live.poll); live.poll = setInterval(() => { if (!document.hidden) pollOnce(); }, 15000); }
  async function pollOnce() {
    const sym = live.sym; if (!sym) return;
    try { const j = await (await apiFetch(`${API}?action=quotes&symbols=${encodeURIComponent(sym)}`)).json(); const q = j.quotes && j.quotes[0];
      if (q && q.price != null && live.sym === sym) onTick({ price: q.price, time: q.time, high: q.dayHigh, low: q.dayLow, volume: q.volume, prevClose: q.prevClose, open: q.open, gmtoffset: q.gmtoffset }, live.gotWs ? null : "Yahoo (polling 15 dtk)"); } catch { /* */ }
  }
  function wsBinance(base) {
    try {
      const ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${base}usdt@miniTicker`); live.ws = ws;
      ws.onmessage = (e) => { const j = JSON.parse(e.data), d = j.data; if (!d) return; live.gotWs = true; clearInterval(live.poll);
        onTick({ price: +d.c, time: d.E / 1000, high: +d.h, low: +d.l, volume: +d.v, prevClose: +d.o, open: true, gmtoffset: 0, h24: true }, "Binance real-time"); };
      ws.onclose = () => { if (live.ws === ws) { live.ws = null; startPolling(); } };
      ws.onerror = () => { try { ws.close(); } catch { /* */ } };
    } catch { startPolling(); }
  }
  function wsYahoo(sym) {
    try {
      const ws = new WebSocket("wss://streamer.finance.yahoo.com/?version=2"); live.ws = ws;
      ws.onopen = () => ws.send(JSON.stringify({ subscribe: [sym] }));
      ws.onmessage = (e) => { try { let b64 = e.data; if (typeof b64 === "string" && b64.startsWith("{")) { const j = JSON.parse(b64); b64 = j.message || j.data; }
        const q = decodeYahoo(b64); if (!q.symbol || q.symbol.toUpperCase() !== sym.toUpperCase() || !(q.price > 0)) return;
        live.gotWs = true; clearInterval(live.poll);
        onTick({ ...q, high: q.high || (live.last && live.last.high), low: q.low || (live.last && live.last.low), prevClose: q.prevClose || (live.last && live.last.prevClose), open: true, gmtoffset: live.last ? live.last.gmtoffset : 0 }, "Yahoo streaming"); } catch { /* abaikan pesan lain */ } };
      ws.onclose = () => { if (live.ws === ws) { live.ws = null; startPolling(); } };
      ws.onerror = () => { try { ws.close(); } catch { /* */ } };
    } catch { startPolling(); }
  }
  function setLiveDot(kind, label) { $("liveDot").className = "dot-live " + kind; if (label != null) live.src = label; }
  function onTick(q, srcLabel) {
    if (srcLabel) live.src = srcLabel;
    const prevPx = live.last ? live.last.price : null;
    live.last = { ...(live.last || {}), ...Object.fromEntries(Object.entries(q).filter(([, v]) => v != null)) };
    const L = live.last, pc = L.prevClose, chg = pc ? L.price / pc - 1 : NaN;
    const el = $("lastPx"); el.textContent = fmtNum(L.price);
    if (prevPx != null && L.price !== prevPx) { el.classList.remove("flash-up", "flash-dn"); void el.offsetWidth; el.classList.add(L.price > prevPx ? "flash-up" : "flash-dn"); }
    $("liveChg").innerHTML = isFinite(chg) ? `<span class="${cls(chg)}">${chg >= 0 ? "▲" : "▼"} ${fmtNum(L.price - pc)} (${spct(chg, 2)})</span>` : "";
    const age = Date.now() / 1000 - (L.time || 0);
    const kind = L.open === false ? "closed" : age < 180 ? "ok" : "delay";
    setLiveDot(kind);
    const tm = L.time ? new Date((L.time + (L.gmtoffset || 0)) * 1000).toISOString().slice(11, 19) : "–";
    const tz = (L.gmtoffset || 0) === 25200 ? "WIB" : (L.gmtoffset || 0) === 0 ? "UTC" : "lokal bursa";
    $("liveStats").innerHTML = `${L.h24 ? "24j" : "Hari ini"} H ${fmtNum(L.high)} · L ${fmtNum(L.low)}${L.volume ? ` · Vol ${nf(0).format(L.volume)}` : ""} · ${tm} ${tz} · ${esc(live.src)}` +
      (kind === "closed" ? " · <b>pasar tutup</b>" : kind === "delay" ? ` · tertunda ${Math.round(age / 60)} mnt` : "");
    updateLiveCandle(L.price, L.time, L.gmtoffset || 0);
  }
  function updateLiveCandle(price, t, off) {
    if (!state.lw || !t || !(price > 0)) return;
    const ref = state.data && state.data.ohlc && state.data.ohlc.length ? state.data.ohlc[state.data.ohlc.length - 1][4] : null;
    if (ref && Math.abs(price / ref - 1) > 0.35) return; // abaikan tick yang tidak masuk akal (> batas ARA/ARB)
    const cs = state.lw.cs;
    try {
      if (isIntra() && state.intra && state.intra.key === state.data.symbol + "|" + state.tf) {
        const step = INTRA_TF[state.tf], bars = state.intra.bars, o2 = state.intra.data.gmtoffset || off, last = bars[bars.length - 1];
        if (t < last[0]) return;
        if (Math.floor((t + o2) / step) === Math.floor((last[0] + o2) / step)) { last[2] = Math.max(last[2], price); last[3] = Math.min(last[3], price); last[4] = price; }
        else { const bt = Math.floor((t + o2) / step) * step - o2; bars.push([bt, price, price, price, price, 0]); state.lw.n++; }
        const b = bars[bars.length - 1]; cs.update({ time: b[0] + o2, open: b[1], high: b[2], low: b[3], close: b[4] });
      } else if (state.tf === "D") {
        const d = state.data.ohlc, last = d[d.length - 1], day = new Date((t + off) * 1000).toISOString().slice(0, 10);
        if (day < last[0]) return;
        if (day === last[0]) { last[2] = Math.max(last[2], price); last[3] = Math.min(last[3], price); last[4] = price; }
        else d.push([day, price, price, price, price, 0]);
        const b = d[d.length - 1]; cs.update({ time: b[0], open: b[1], high: b[2], low: b[3], close: b[4] });
      }
    } catch { /* grafik sedang digambar ulang */ }
  }

  // ---------- autocomplete untuk input berisi daftar ticker (dipisah koma) ----------
  function attachAC(input, opts = {}) {
    const ul = input.parentElement.querySelector(".sugg"); let timer = null, idx = -1, seq = 0;
    const lastTok = () => { const v = input.value, i = Math.max(v.lastIndexOf(","), v.lastIndexOf("\n")); return { pre: v.slice(0, i + 1), tok: v.slice(i + 1).trim() }; };
    const show = (sections) => { idx = -1; const html = sections.filter((s) => s.items.length).map((s) => `<li class="hdr">${s.title}</li>` + s.items.map((q) => suggRow(q)).join("")).join("");
      ul.innerHTML = html; ul.hidden = !html; };
    const choose = (sym) => { ul.hidden = true; if (opts.onPick) { input.value = ""; input.blur(); opts.onPick(sym); return; }
      const { pre } = lastTok(); input.value = (pre ? pre.replace(/\s*$/, " ") : "") + sym + ", "; input.focus(); };
    input.addEventListener("input", () => { clearTimeout(timer); const { tok } = lastTok(); if (tok.length < 2) { ul.hidden = true; return; }
      timer = setTimeout(async () => { const my = ++seq, local = localMatches(tok); show([{ title: "Rekomendasi", items: local }]);
        let remote = []; try { remote = (await (await apiFetch(`${API}?action=search&q=${encodeURIComponent(tok)}`)).json()).quotes || []; } catch { /* */ }
        if (my !== seq) return; const seen = new Set(local.map((x) => x.symbol));
        remote = remote.filter((x) => !seen.has(x.symbol)).sort((a, b) => (/\.JK$/.test(b.symbol) ? 1 : 0) - (/\.JK$/.test(a.symbol) ? 1 : 0));
        show([{ title: "Rekomendasi", items: local }, { title: "Hasil pencarian", items: remote }]); }, 250); });
    input.addEventListener("keydown", (e) => { const items = [...ul.querySelectorAll("li[data-s]")];
      if (e.key === "Enter" && opts.onPick && (ul.hidden || idx < 0)) { e.preventDefault(); const v = input.value.trim(); if (v) { const al = localMatches(v).find((x) => x.symbol.toUpperCase() === v.toUpperCase()) || ALIASES.find(([k]) => k === v.toLowerCase());
        choose(al ? (al.symbol || al[1]) : v.toUpperCase()); } return; }
      if (ul.hidden || !items.length) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); idx = (idx + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length; items.forEach((li, i) => li.classList.toggle("on", i === idx)); }
      else if (e.key === "Enter" && idx >= 0) { e.preventDefault(); e.stopImmediatePropagation(); choose(items[idx].dataset.s); }
      else if (e.key === "Escape") ul.hidden = true; }, true);
    ul.addEventListener("mousedown", (e) => { const li = e.target.closest("li[data-s]"); if (li) { e.preventDefault(); choose(li.dataset.s); } });
    input.addEventListener("blur", () => setTimeout(() => (ul.hidden = true), 150));
  }

  // ---------- harga live di watchlist ----------
  let wlLiveTimer = null;
  async function wlLiveOnce() {
    const ok = wl.rows.filter((r) => !r.error); if (!ok.length || $("screenView").hidden || document.hidden) return;
    try { const j = await (await apiFetch(`${API}?action=quotes&symbols=${encodeURIComponent(ok.map((r) => r.symbol).join(","))}`)).json();
      wl.q = wl.q || {}; const changed = {};
      for (const q of j.quotes || []) { if (q.price == null) continue; const old = wl.q[q.symbol]; if (old && old.price !== q.price) changed[q.symbol] = q.price > old.price ? "flash-up" : "flash-dn"; wl.q[q.symbol] = q; }
      wl.flash = changed; renderWatch(); wl.flash = {}; } catch { /* */ }
  }
  function startWlLive() { clearInterval(wlLiveTimer); wlLiveOnce(); wlLiveTimer = setInterval(wlLiveOnce, 30000); }

  // =====================================================================
  // PANEL SAMPING CANDLE: lot per harga (volume profile) & bid/offer
  // =====================================================================
  const book = { tab: "vp", days: 1, ws: null, timer: null, vp: null, ob: null };
  async function loadVP() {
    const sym = state.data.symbol, key = sym + "|1m";
    if (state.intra && state.intra.key === key) return state.intra;
    if (book.vp && book.vp.key === key && Date.now() - book.vp.at < 60000) return book.vp;
    const j = await (await apiFetch(`${API}?action=intraday&symbol=${encodeURIComponent(sym)}&interval=1m`)).json();
    if (j.error || !Array.isArray(j.bars)) throw new Error(j.error || "Data intraday tidak tersedia");
    book.vp = { key, data: j, bars: j.bars, at: Date.now() }; return book.vp;
  }
  async function renderBook() {
    if (!state.data || $("candleCard").hidden) return;
    document.querySelectorAll("#bookTabs .tab").forEach((t) => t.classList.toggle("active", t.dataset.b === book.tab));
    $("vpRange").hidden = book.tab !== "vp";
    if (book.tab === "vp") return renderVP();
    if (book.tab === "fp") return renderFP();
    return renderOB();
  }

  // ---------- Isi candle (footprint): konsentrasi beli/jual per harga ----------
  async function fineBars(interval) {
    const sym = state.data.symbol, key = sym + "|" + interval; book.fine = book.fine || {};
    const c = book.fine[key]; if (c && Date.now() - c.at < 120000) return c;
    const j = await (await apiFetch(`${API}?action=intraday&symbol=${encodeURIComponent(sym)}&interval=${interval}`)).json();
    if (j.error || !Array.isArray(j.bars)) throw new Error(j.error || `Data ${interval} tidak tersedia`);
    return (book.fine[key] = { data: j, bars: j.bars, at: Date.now(), interval });
  }
  async function flowBars(interval, start, end) { // kripto: bar Binance + volume beli agresif asli
    const sym = state.data.symbol, key = `flow|${sym}|${interval}|${start}|${end}`; book.fine = book.fine || {};
    const c = book.fine[key]; if (c && (end < Date.now() / 1000 - 3600 || Date.now() - c.at < 60000)) return c;
    const j = await (await apiFetch(`${API}?action=flow&symbol=${encodeURIComponent(sym)}&interval=${interval}&start=${Math.floor(start)}&end=${Math.ceil(end)}`)).json();
    if (j.error || !Array.isArray(j.bars)) throw new Error(j.error || "Data transaksi tidak tersedia");
    return (book.fine[key] = { data: j, bars: j.bars, at: Date.now(), interval });
  }
  async function renderFP() {
    stopOB(); const body = $("bookBody"), note = $("bookNote");
    if (!book.fp) { const d = state.data.ohlc, b = d[d.length - 1]; book.fp = { t: b[0], bar: b, next: null, tf: "D", off: 0 }; }
    const F = book.fp, idx = isIdx(), crypto = isCrypto(), unit = idx ? 100 : 1; body.innerHTML = '<p class="note">Mengambil data menit…</p>';
    let interval, from, to, label, src;
    if (typeof F.t === "number") { // candle intraday: waktu sudah digeser ke jam bursa
      const step = INTRA_TF[F.tf] || 60; from = F.t - F.off; to = from + step; interval = "1m";
      label = new Date(F.t * 1000).toISOString().slice(0, 16).replace("T", " ") + ` (${F.tf})`; }
    else { const t0 = new Date(F.t + "T00:00:00Z").getTime() / 1000, age = (Date.now() / 1000 - t0) / 86400, span = F.tf === "D" ? 1 : F.tf === "W" ? 7 : 31;
      label = F.tf === "D" ? F.t : `${F.t} (${F.tf === "W" ? "mingguan" : "bulanan"})`; F.span = span;
      if (crypto) { interval = F.tf === "D" ? "1m" : F.tf === "W" ? "15m" : "60m"; from = t0; to = F.next ? new Date(F.next + "T00:00:00Z").getTime() / 1000 : t0 + span * 86400; }
      else { interval = F.tf === "D" ? (age <= 6 ? "1m" : age <= 57 ? "5m" : "60m") : age <= 50 ? "15m" : "60m"; from = null; to = null;
        if (age > 725) { body.innerHTML = `<p class="note">Data per jam saham hanya tersedia ±2 tahun terakhir; candle ${esc(F.t)} terlalu lama untuk dibedah.</p>`; return; } } }
    try { src = crypto ? await flowBars(interval, from, to) : await fineBars(interval); } catch (e) {
      if (!crypto) { body.innerHTML = `<p class="note">${esc(e.message)}</p>`; return; }
      try { src = await fineBars(interval === "15m" ? "60m" : interval); } catch (e2) { body.innerHTML = `<p class="note">${esc(e.message)}</p>`; return; } }
    const off = src.data.gmtoffset || 0, dayOf = (t) => new Date((t + off) * 1000).toISOString().slice(0, 10);
    let bars;
    if (from != null) bars = src.bars.filter((b) => b[0] >= from && b[0] < to);
    else if (F.tf === "D") bars = src.bars.filter((b) => dayOf(b[0]) === F.t);
    else { const end = F.next || "9999"; bars = src.bars.filter((b) => dayOf(b[0]) >= F.t && dayOf(b[0]) < end); }
    if (!bars.length) { body.innerHTML = `<p class="note">Tidak ada data ${interval} untuk candle ${esc(label)}.</p>`; return; }
    const R = MCEngine.candleFootprint(bars, { idx }), maxV = Math.max(...R.levels.map((x) => x.buy + x.sell)), g = css("--good"), r = css("--bad");
    const lot = (v) => big(v / unit) + (idx ? "" : "");
    body.innerHTML = `<div class="fp-head"><b>${esc(label)}</b> · O ${fmtNum(R.open)} · C ${fmtNum(R.close)} <span class="note">· dari ${R.nBars} bar ${interval}</span></div>
      <div class="fp-comp"><i style="width:${(R.buyPct * 100).toFixed(1)}%;background:${g}"></i><i style="width:${((1 - R.buyPct) * 100).toFixed(1)}%;background:${r}"></i></div>
      <div class="fp-comp-l"><span class="pos">Beli ${pct(R.buyPct, 0)} · ${lot(R.buy)}${idx ? " lot" : ""}</span><span class="neg">Jual ${pct(1 - R.buyPct, 0)} · ${lot(R.sell)}${idx ? " lot" : ""}</span></div>
      <div class="bk-hdr"><span>Harga</span><span>beli ▮ ▮ jual</span><span>${idx ? "lot" : "vol"}</span></div>` +
      R.levels.filter((x) => x.buy + x.sell > 0).map((x) => { const t = x.buy + x.sell, isPoc = Math.abs(x.p - R.poc) < R.step / 2, inVa = x.p >= R.vaLo - 1e-9 && x.p <= R.vaHi + 1e-9;
        return `<div class="bk-row fp-row ${isPoc ? "poc" : ""} ${inVa ? "va" : ""}"><span class="p">${fmtNum(x.p)}${isPoc ? " ◀" : ""}</span><span class="bk-bar"><i style="width:${((x.buy / maxV) * 100).toFixed(1)}%;background:${g}"></i><i style="width:${((x.sell / maxV) * 100).toFixed(1)}%;background:${r}"></i></span><span class="q">${big(t / unit)}</span></div>`; }).join("");
    const dlt = R.delta / unit, closeVsPoc = R.close > R.poc ? "di atas" : R.close < R.poc ? "di bawah" : "tepat di";
    note.innerHTML = `<b>POC</b> ${fmtNum(R.poc)} · <b>value area 70%</b> ${fmtNum(R.vaLo)}–${fmtNum(R.vaHi)} · <b>VWAP</b> ${fmtNum(R.vwap)} · <b>delta</b> <span class="${cls(dlt)}">${dlt > 0 ? "+" : ""}${big(dlt)}${idx ? " lot" : ""}</span><br>
      Konsentrasi beli terbesar di <b class="pos">${fmtNum(R.topBuy)}</b>, jual terbesar di <b class="neg">${fmtNum(R.topSell)}</b>. ${R.imbalances.length ? `Ketimpangan > 3:1 di ${R.imbalances.slice(0, 4).map((x) => `${fmtNum(x.p)} (${x.side})`).join(", ")}.` : ""}<br>
      ${R.buyPct > 0.55 ? "Pembeli lebih agresif" : R.buyPct < 0.45 ? "Penjual lebih agresif" : "Beli dan jual seimbang"}; harga tutup ${closeVsPoc} POC.
      ${fpAccuracy(R, interval)}`;
  }
  function fpAccuracy(R, interval) {
    if (R.realShare > 0.9) return `<span class="pill pos">Akurasi tinggi</span> <span class="note">Beli/jual dari data transaksi asli Binance (volume beli agresif / taker buy per bar ${interval}). Sebaran per harga di dalam tiap bar ${interval} tetap dibagi rata.</span>`;
    const lvl = interval === "1m" ? ["sedang", ""] : interval === "5m" || interval === "15m" ? ["rendah–sedang", "neg"] : ["rendah", "neg"];
    return `<span class="pill ${lvl[1]}">Akurasi ${lvl[0]}</span> <span class="note">Bursa tidak membagikan data transaksi per lot gratis, jadi sisi beli/jual <b>diperkirakan</b> dari posisi tutup tiap bar ${interval} di rentangnya dan arah barnya. Makin kecil bar, makin dekat ke aslinya: candle ≤ 6 hari terakhir memakai bar 1 menit. Pakai untuk melihat <b>di harga mana</b> volume menumpuk (POC, value area) — bagian itu jauh lebih andal daripada persentase beli vs jual.</span>`;
  }
  async function renderVP() {
    stopOB();
    const body = $("bookBody"); body.innerHTML = '<p class="note">Menghitung…</p>';
    let src; try { src = await loadVP(); } catch (e) { body.innerHTML = `<p class="note">${esc(e.message)}</p>`; return; }
    const off = src.data.gmtoffset || 0, idx = isIdx(), unit = idx ? 100 : 1;
    const day = (t) => new Date((t + off) * 1000).toISOString().slice(0, 10);
    const days = [...new Set(src.bars.map((b) => day(b[0])))], keep = new Set(days.slice(-book.days));
    const bars = src.bars.filter((b) => keep.has(day(b[0])) && b[5] > 0);
    if (!bars.length) { body.innerHTML = '<p class="note">Belum ada transaksi di periode ini.</p>'; return; }
    const lo = Math.min(...bars.map((b) => b[3])), hi = Math.max(...bars.map((b) => b[2]));
    // ukuran level: fraksi BEI untuk saham IDX, selain itu ±28 level
    let step = idx ? MCEngine.idxTick(bars[bars.length - 1][4]) : 0;
    if (!idx || (hi - lo) / step > 40) { const raw = (hi - lo) / 28 || hi * 0.001, mag = Math.pow(10, Math.floor(Math.log10(raw))); step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw; if (idx) step = Math.max(step, MCEngine.idxTick(lo)); }
    const lvl = new Map(); let pv = 0, vv = 0;
    for (const b of bars) { const p = Math.round(b[4] / step) * step, rec = lvl.get(p) || { up: 0, dn: 0 }; if (b[4] >= b[1]) rec.up += b[5]; else rec.dn += b[5]; lvl.set(p, rec); pv += ((b[2] + b[3] + b[4]) / 3) * b[5]; vv += b[5]; }
    const rows = [...lvl.entries()].sort((a, b) => b[0] - a[0]), maxV = Math.max(...rows.map(([, r]) => r.up + r.dn));
    const poc = rows.reduce((a, b) => (b[1].up + b[1].dn > a[1].up + a[1].dn ? b : a))[0], vwap = pv / vv;
    const cur = live.last ? live.last.price : bars[bars.length - 1][4], curL = Math.round(cur / step) * step;
    const up = isFinite(cur) ? css("--good") : "", dn = css("--bad");
    const fmtQ = (v) => (idx ? nf(0).format(v / unit) : v >= 1e6 ? nf(2).format(v / 1e6) + "jt" : nf(v < 10 ? 3 : 0).format(v));
    body.innerHTML = `<div class="bk-hdr"><span style="text-align:right">Harga</span><span>Transaksi</span><span style="text-align:right">${idx ? "Lot" : "Volume"}</span></div>` +
      rows.map(([p, r]) => { const t = r.up + r.dn, w = (t / maxV) * 100;
        return `<div class="bk-row ${p === curL ? "cur" : ""} ${p === poc ? "poc" : ""}" title="naik ${fmtQ(r.up)} · turun ${fmtQ(r.dn)}"><span class="p">${fmtNum(p)}${p === poc ? " ◀" : ""}</span>
          <span class="bk-bar" style="width:${w.toFixed(1)}%"><i style="width:${((r.up / t) * 100).toFixed(1)}%;background:${up}"></i><i style="width:${((r.dn / t) * 100).toFixed(1)}%;background:${dn}"></i></span><span class="q">${fmtQ(t)}</span></div>`; }).join("");
    $("bookNote").innerHTML = `POC (◀) ${fmtNum(poc)} · VWAP ${fmtNum(vwap)} · total ${fmtQ(vv)} ${idx ? "lot" : ""} · ${book.days === 1 ? days[days.length - 1] : `${Math.min(book.days, days.length)} hari`}. Transaksi yang sudah terjadi, bukan antrean order. Hijau/merah = perkiraan dari arah candle 1 menit.`;
    const curRow = body.querySelector(".bk-row.cur"); if (curRow) curRow.scrollIntoView({ block: "center" });
  }
  function stopOB() { if (book.ws) { try { book.ws.onclose = null; book.ws.close(); } catch { /* */ } book.ws = null; } clearInterval(book.timer); book.timer = null; }
  function renderOB() {
    stopOB(); const body = $("bookBody"), m = state.data.symbol.toUpperCase().match(/^([A-Z0-9]+)-USDT?$/);
    if (m) { // order book kripto real-time
      body.innerHTML = '<p class="note">Menghubungkan ke Binance…</p>';
      try { const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${m[1].toLowerCase()}usdt@depth20@1000ms`); book.ws = ws;
        ws.onmessage = (e) => { const d = JSON.parse(e.data); drawDepth(d.bids.slice(0, 15).map((x) => [+x[0], +x[1]]), d.asks.slice(0, 15).map((x) => [+x[0], +x[1]]), "BTC"); };
        ws.onerror = () => { body.innerHTML = '<p class="note">Tidak bisa terhubung ke order book Binance dari jaringan ini.</p>'; };
      } catch { body.innerHTML = '<p class="note">WebSocket tidak didukung.</p>'; }
      $("bookNote").textContent = "Order book Binance (pasangan USDT), real-time, 15 level teratas. Kolom kanan = jumlah koin.";
      return;
    }
    const poll = async () => { try { const j = await (await apiFetch(`${API}?action=book&symbol=${encodeURIComponent(state.data.symbol)}`)).json();
        if (j.bid == null && j.ask == null) { body.innerHTML = '<p class="note">Bid/offer tidak tersedia untuk aset ini dari Yahoo.</p>'; return; }
        const lot = (v) => (v ? (isIdx() ? nf(0).format(v / 100) + " lot" : nf(0).format(v)) : "—");
        const spread = j.ask && j.bid ? j.ask - j.bid : NaN;
        body.innerHTML = `<div class="ob-row"><span class="neg">Offer ${fmtNum(j.ask)}</span><span>${lot(j.askSize)}</span></div>
          <div class="ob-spread">spread ${fmtNum(spread)}${j.bid ? ` (${pct(spread / j.bid, 2)})` : ""}${isIdx() && j.bid ? ` · ${nf(0).format(spread / MCEngine.idxTick(j.bid))} tick` : ""}</div>
          <div class="ob-row"><span class="pos">Bid ${fmtNum(j.bid)}</span><span>${lot(j.bidSize)}</span></div>
          <p class="note" style="margin-top:10px">Status pasar: ${esc(j.marketState || "?")}. Diperbarui tiap 15 detik.</p>`;
      } catch { body.innerHTML = '<p class="note">Gagal mengambil bid/offer.</p>'; } };
    body.innerHTML = '<p class="note">Mengambil…</p>'; poll(); book.timer = setInterval(() => { if (!document.hidden) poll(); }, 15000);
    $("bookNote").innerHTML = "Hanya <b>level teratas</b> dari Yahoo (biasanya tertunda; jumlah lot sering tidak disediakan). Antrean bid/offer lengkap per level saham IDX adalah data berlisensi BEI dan hanya tersedia di aplikasi sekuritas.";
  }
  function drawDepth(bids, asks) {
    const mx = Math.max(...bids.map((x) => x[1]), ...asks.map((x) => x[1]));
    const row = (p, q, side) => `<div class="ob-row"><span class="${side === "a" ? "neg" : "pos"}">${fmtNum(p)}</span><span>${nf(q < 10 ? 4 : 2).format(q)}</span><i class="bgb" style="width:${((q / mx) * 100).toFixed(1)}%;background:${side === "a" ? css("--bad") : css("--good")}"></i></div>`;
    const sp = asks[0][0] - bids[0][0];
    $("bookBody").innerHTML = `<div class="bk-hdr" style="grid-template-columns:1fr 1fr"><span>Harga</span><span style="text-align:right">Jumlah</span></div>` +
      asks.slice().reverse().map((x) => row(x[0], x[1], "a")).join("") + `<div class="ob-spread">spread ${fmtNum(sp)} (${pct(sp / bids[0][0], 3)})</div>` + bids.map((x) => row(x[0], x[1], "b")).join("");
  }

  // =====================================================================
  // QUANT LAB (UI)
  // =====================================================================
  const ql = { series: null, res: null, method: "rp", syms: [] };
  const QL_PRESETS = [["Bank + telko + konsumer", "BBCA.JK, BBRI.JK, BMRI.JK, TLKM.JK, ICBP.JK, UNVR.JK, ASII.JK, AMRT.JK"], ["Lintas aset", "^JKSE, GC=F, BTC-USD, IDR=X, ^GSPC"],
    ["Komoditas IDX", "ADRO.JK, PTBA.JK, ANTM.JK, INCO.JK, MDKA.JK, MEDC.JK"], ["Kripto", "BTC-USD, ETH-USD, SOL-USD, BNB-USD, XRP-USD"]];
  async function runQuant() {
    const syms = [...new Set($("qlQ").value.split(/[,\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean))].slice(0, 15);
    if (syms.length < 2) { $("qlStatus").textContent = "Butuh minimal 2 aset."; return; }
    saveSettings({ quantlab: $("qlQ").value });
    $("qlRun").disabled = true; $("qlStatus").classList.remove("err"); $("qlStatus").textContent = `Mengambil data ${syms.length} aset…`;
    try {
      const range = $("qlRange").value, got = await pool(syms, 4, async (s) => { try { return await fetchSymbol(s, range); } catch { return null; } });
      const ok = got.filter(Boolean); const failed = syms.filter((_, i) => !got[i]);
      if (ok.length < 2) throw new Error("Kurang dari 2 aset berhasil dimuat.");
      ql.series = ok; ql.syms = ok.map((d) => d.symbol);
      const crypto = ok.every((d) => /CRYPTO/i.test(d.type || ""));
      const lastPx = ok.map((d) => d.values[d.values.length - 1]);
      $("qlStatus").textContent = "Mengoptimasi & mensimulasikan…";
      ql.res = await compute("qport", { series: ok.map((d) => ({ dates: d.dates, values: d.values })), opt: { method: ql.method, cap: (parseFloat($("qlCap").value) || 100) / 100,
        shrinkMu: (parseFloat($("qlShr").value) || 0) / 100, shrinkCov: 0.3, rf: (parseFloat($("qlRf").value) || 0) / 100, ppy: crypto ? 365 : 252,
        horizon: parseInt($("qlH").value, 10) || 63, sims: 5000, capital: parseFloat($("qlCapital").value) || 0, prices: lastPx, lotSize: ok.map((d) => (/\.JK$/.test(d.symbol) ? 100 : 1)) } });
      ql.ppy = crypto ? 365 : 252; ql.lastPx = lastPx; ql.res.simFor = ql.method;
      $("qlOut").hidden = false; renderQuantLab();
      $("qlStatus").textContent = `${ok.length} aset · ${ql.res.T} hari bersama (${ql.res.dates[0]} → ${ql.res.dates[ql.res.dates.length - 1]})${failed.length ? ` · gagal: ${failed.join(", ")}` : ""}` +
        (ok.some((d) => /CRYPTO/i.test(d.type || "")) && !crypto ? " · campuran kripto & saham: hanya hari bursa bersama yang dipakai" : "");
    } catch (e) { $("qlStatus").textContent = e.message; $("qlStatus").classList.add("err"); }
    finally { $("qlRun").disabled = false; }
  }
  const short = (s) => s.replace(/\.JK$/, "");
  function renderQuantLab() {
    const R = ql.res, S = ql.syms, N = S.length, grid = css("--grid"), muted = css("--muted");
    // korelasi
    const heat = (v) => { const a = Math.min(1, Math.abs(v)); return v >= 0 ? `rgba(239,83,80,${(a * 0.5).toFixed(2)})` : `rgba(74,163,223,${(a * 0.5).toFixed(2)})`; };
    $("qlCorr").innerHTML = `<thead><tr><th></th>${S.map((s) => `<th>${esc(short(s))}</th>`).join("")}</tr></thead><tbody>` +
      R.corr.map((row, i) => `<tr><td><b>${esc(short(S[i]))}</b></td>${row.map((v, j) => `<td style="background:${i === j ? "transparent" : heat(v)}">${i === j ? "—" : nf(2).format(v)}</td>`).join("")}</tr>`).join("") + "</tbody>";
    let hiP = null, loP = null; for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) { const v = R.corr[i][j]; if (!hiP || v > hiP[2]) hiP = [i, j, v]; if (!loP || v < loP[2]) loP = [i, j, v]; }
    $("qlCorrTxt").innerHTML = `Rata-rata korelasi ${nf(2).format(R.rbar)}. Paling searah: <b>${esc(short(S[hiP[0]]))}–${esc(short(S[hiP[1]]))}</b> (${nf(2).format(hiP[2])}); paling independen: <b>${esc(short(S[loP[0]]))}–${esc(short(S[loP[1]]))}</b> (${nf(2).format(loP[2])}).`;
    // bobot semua metode
    const M = [["minvar", "Min Var"], ["rp", "Risk Parity"], ["maxsharpe", "Max Sharpe"], ["iv", "Inv Vol"], ["ew", "Equal"]];
    $("qlW").innerHTML = `<thead><tr><th>Aset</th><th>Vol/th</th><th>Return/th (shrink)</th>${M.map(([k, l]) => `<th class="${k === ql.method ? "sorted" : ""}">${l}</th>`).join("")}</tr></thead><tbody>` +
      S.map((s, i) => `<tr><td><b>${esc(short(s))}</b></td><td>${pct(R.volAsset[i])}</td><td><span class="${cls(R.muShr[i])}">${spct(R.muShr[i])}</span> <span class="note">(${spct(R.muAsset[i], 0)})</span></td>${M.map(([k]) => `<td>${pct(R.res[k].w[i], 0)}</td>`).join("")}</tr>`).join("") +
      `<tr><td>Return/th</td><td></td><td></td>${M.map(([k]) => `<td>${pct(R.res[k].ret)}</td>`).join("")}</tr><tr><td>Vol/th</td><td></td><td></td>${M.map(([k]) => `<td>${pct(R.res[k].vol)}</td>`).join("")}</tr>` +
      `<tr><td>Sharpe</td><td></td><td></td>${M.map(([k]) => `<td>${nf(2).format(R.res[k].sharpe)}</td>`).join("")}</tr></tbody>`;
    renderQuantMethod();
    // frontier
    const pts = M.map(([k, l], i) => ({ label: l, data: [{ x: R.res[k].vol * 100, y: R.res[k].ret * 100 }], backgroundColor: COLORS[i % COLORS.length], pointBorderColor: css("--ink"), pointBorderWidth: 1.5, pointRadius: k === ql.method ? 10 : 7, pointStyle: "rectRot" }));
    if (state.charts.qlFront) state.charts.qlFront.destroy();
    state.charts.qlFront = new Chart($("qlFront"), { type: "scatter", data: { datasets: [
        { label: "Portofolio acak", data: R.cloud.map(([v, r]) => ({ x: v * 100, y: r * 100 })), backgroundColor: muted + "66", pointRadius: 2.5, pointBorderWidth: 0 },
        { label: "Aset tunggal", data: S.map((s, i) => ({ x: R.volAsset[i] * 100, y: R.muShr[i] * 100, s })), backgroundColor: css("--ink"), pointBorderColor: css("--bg"), pointBorderWidth: 1.5, pointRadius: 6 }, ...pts] },
      options: baseOpts({ interaction: { mode: "nearest", intersect: true }, plugins: { legend: { labels: { color: muted, boxWidth: 10, font: { size: 11 } } },
        tooltip: { callbacks: { label: (c) => `${c.raw.s ? short(c.raw.s) : c.dataset.label}: vol ${nf(1).format(c.raw.x)}%, return ${nf(1).format(c.raw.y)}%` } } },
        scales: { x: { title: { display: true, text: "Volatilitas tahunan (%)", color: muted }, ticks: { color: muted }, grid: { color: grid } }, y: { title: { display: true, text: "Return harapan/th (%, shrink)", color: muted }, ticks: { color: muted }, grid: { color: grid } } } }) });
  }
  async function renderQuantMethod() {
    const R = ql.res, S = ql.syms, P = R.res[ql.method], muted = css("--muted"), grid = css("--grid");
    document.querySelectorAll("#qlMethod .tab").forEach((t) => t.classList.toggle("active", t.dataset.m === ql.method));
    // alokasi: hitung ulang lot untuk metode terpilih (cepat, di thread utama)
    const capital = parseFloat($("qlCapital").value) || 0; let spent = 0;
    const rows = P.w.map((w, j) => { const unit = /\.JK$/.test(S[j]) ? 100 : 1, px = ql.lastPx[j], target = capital * w;
      const lots = unit > 1 ? Math.floor(target / (px * unit)) : Math.floor((target / px) * 1e6) / 1e6, cost = lots * unit * px; spent += cost; return { lots, cost, unit, px, w }; });
    const rfA = (parseFloat($("qlRf").value) || 0) / 100, allBad = R.muShr.every((u) => u <= rfA);
    $("qlAllocT").innerHTML = `Alokasi modal Rp ${nf(0).format(capital)} · ${({ minvar: "Min Variance", rp: "Risk Parity", maxsharpe: "Max Sharpe", iv: "Inverse Vol", ew: "Equal" })[ql.method]}` +
      (ql.method === "maxsharpe" && allBad ? ' <span class="neg" style="font-weight:400">— semua return harapan di bawah risk-free, jadi Max Sharpe tidak bermakna di sini (secara historis, deposito/SBN lebih baik). Pakai Min Variance / Risk Parity.</span>' : "");
    $("qlAlloc").innerHTML = `<thead><tr><th>Aset</th><th>Bobot</th><th>Harga</th><th>Beli</th><th>Nilai</th><th>Kontribusi risiko</th></tr></thead><tbody>` +
      rows.map((r, j) => `<tr><td><b>${esc(short(S[j]))}</b></td><td>${pct(r.w, 1)}</td><td>${fmtNum(r.px)}</td><td>${r.unit > 1 ? nf(0).format(r.lots) + " lot" : nf(6).format(r.lots)}</td><td>${nf(0).format(r.cost)}</td>
        <td><span class="rcbar" style="width:${Math.max(1, P.rc[j] * 120).toFixed(0)}px"></span>${pct(P.rc[j], 0)}</td></tr>`).join("") +
      `<tr><td>Sisa kas</td><td></td><td></td><td></td><td>${nf(0).format(capital - spent)}</td><td></td></tr></tbody>`;
    // simulasi untuk metode terpilih (jalankan ulang di worker bila metode berubah)
    let sim = R.sim;
    if (R.simFor !== ql.method) { const ok = ql.series; try { const r2 = await compute("qport", { series: ok.map((d) => ({ dates: d.dates, values: d.values })), opt: { method: ql.method,
        cap: (parseFloat($("qlCap").value) || 100) / 100, shrinkMu: (parseFloat($("qlShr").value) || 0) / 100, shrinkCov: 0.3, rf: (parseFloat($("qlRf").value) || 0) / 100, ppy: ql.ppy, horizon: parseInt($("qlH").value, 10) || 63, sims: 5000 } });
      R.sim = sim = r2.sim; R.eq = r2.eq; R.simFor = ql.method; } catch { /* */ } }
    const H = parseInt($("qlH").value, 10) || 63;
    $("qlSimT").textContent = `Simulasi ${H} hari ke depan (5.000 skenario, block bootstrap)`;
    $("qlSim").innerHTML = [["Median", spct(sim.q[2])], ["Rentang 90%", `${spct(sim.q[0], 0)} / ${spct(sim.q[4], 0)}`], ["Peluang rugi", pct(sim.probLoss, 0)],
      ["VaR 95% / CVaR", `${pct(sim.var95)} / ${pct(sim.cvar95)}`], ["Drawdown di tengah jalan", `median ${pct(sim.ddMed)} · buruk ${pct(sim.dd5)}`],
      ["VaR 95% dalam Rp", "Rp " + nf(0).format(sim.var95 * (parseFloat($("qlCapital").value) || 0))]].map(([a, b]) => `<div class="kpi"><div class="k">${a}</div><div class="v">${b}</div></div>`).join("");
    drawChart("qlSimH", { type: "bar", data: { labels: sim.hist.edges.map((x) => spct(x, 0)), datasets: [{ data: sim.hist.counts, backgroundColor: sim.hist.edges.map((x) => (x < 0 ? css("--bad") : css("--accent"))), borderWidth: 0, barPercentage: 1, categoryPercentage: 1 }] },
      options: baseOpts({ plugins: { legend: { display: false } }, scales: { x: { ticks: { maxTicksLimit: 7, color: muted }, grid: { display: false } }, y: { display: false } } }) });
    const step = Math.max(1, Math.floor(R.eq.length / 400)), lab = R.dates.filter((_, i) => i % step === 0);
    drawChart("qlEq", { type: "line", data: { labels: lab, datasets: [{ label: "Nilai portofolio (awal = 1)", data: R.eq.filter((_, i) => i % step === 0), borderColor: css("--accent"), borderWidth: 1.6, pointRadius: 0 }] },
      options: baseOpts({ plugins: { legend: { display: false } }, scales: { x: { ticks: { maxTicksLimit: 6, color: muted }, grid: { display: false } }, y: { ticks: { color: muted }, grid: { color: grid } } } }) });
    document.querySelectorAll("#qlW th").forEach((th, i) => th.classList.toggle("sorted", i >= 3 && ["minvar", "rp", "maxsharpe", "iv", "ew"][i - 3] === ql.method));
  }
  function btParamsVis() { const s = $("btStrat").value, need = { xsmom: ["look", "topK", "rebal"], tsmom: ["look"], ma: ["fast", "slow"], rsi: ["rsiLo", "rsiHi"], bh: [] }[s];
    document.querySelectorAll("[data-p]").forEach((el) => (el.hidden = !need.includes(el.dataset.p))); }
  async function runBacktest() {
    if (!ql.series) { $("btOut").innerHTML = '<p class="status err">Jalankan analisis portofolio dulu (data diambil di sana).</p>'; return; }
    const v = (id) => parseFloat($(id).value);
    const opt = { strat: $("btStrat").value, look: v("btLook"), topK: Math.min(v("btTop"), ql.syms.length), rebal: v("btRebal"), fast: v("btFast"), slow: v("btSlow"), rsiLo: v("btLo"), rsiHi: v("btHi"),
      costBps: v("btCost"), split: v("btSplit") / 100, ppy: ql.ppy, rf: (parseFloat($("qlRf").value) || 0) / 100 };
    if (opt.strat === "ma" && opt.fast >= opt.slow) { $("btOut").innerHTML = '<p class="status err">MA cepat harus lebih kecil dari MA lambat.</p>'; return; }
    $("btOut").innerHTML = '<p class="status">Menjalankan backtest…</p>';
    try {
      const b = await compute("qbt", { series: ql.series.map((d) => ({ dates: d.dates, values: d.values })), opt });
      const f2 = (x) => (isFinite(x) ? nf(2).format(x) : "–");
      const row = (n, f) => `<tr><td>${n}</td>${["is", "oos", "all"].map((k) => `<td>${f(b[k].strat)}</td><td class="note">${f(b[k].bh)}</td>`).join("")}</tr>`;
      const oosS = b.oos.strat, oosB = b.oos.bh, isS = b.is.strat;
      const verdict = oosS.sharpe < 0 ? "Strategi <b>rugi secara risk-adjusted di out-of-sample</b>. Jangan dipakai." :
        oosS.sharpe < oosB.sharpe - 0.1 ? "Strategi <b>kalah dari buy & hold</b> di out-of-sample. Kalau di in-sample terlihat bagus, itu tanda overfitting." :
        isS.sharpe - oosS.sharpe > 0.7 ? "Ada <b>penurunan besar dari in-sample ke out-of-sample</b>, jadi hasilnya kemungkinan banyak karena kebetulan. Uji dengan parameter lain dan periode lain sebelum percaya." :
        oosS.sharpe >= 0.5 ? "Strategi bertahan di out-of-sample dengan Sharpe ≥ 0,5. Menarik untuk diteliti lebih lanjut, tapi ingat bias survivorship dan biaya nyata (slippage, likuiditas)." :
        "Hasil out-of-sample setara buy & hold. Strategi ini tidak menambah nilai berarti setelah biaya.";
      $("btOut").innerHTML = `<div class="table-wrap"><table><thead><tr><th></th><th>In-sample</th><th class="note">B&H</th><th>Out-of-sample</th><th class="note">B&H</th><th>Seluruh</th><th class="note">B&H</th></tr></thead><tbody>
        ${row("CAGR", (x) => `<span class="${cls(x.cagr)}">${spct(x.cagr)}</span>`)}${row("Volatilitas", (x) => pct(x.vol))}${row("Sharpe", (x) => f2(x.sharpe))}${row("Max drawdown", (x) => pct(x.maxDD))}${row("Total return", (x) => spct(x.total, 0))}</tbody></table></div>
        <p class="note">Pemisah in/out-of-sample: ${b.splitDate}. Rata-rata eksposur ${pct(b.exposure, 0)} · turnover ${nf(1).format(b.turnoverYr)}×/th · ${b.tradeDays} hari ada transaksi · hari untung ${pct(b.hit, 0)} saat berposisi.</p>
        <div class="verdict">${verdict}</div><div class="chart-box tall"><canvas id="btEq"></canvas></div>`;
      const step = Math.max(1, Math.floor(b.eqS.length / 500)), lab = b.dates.filter((_, i) => i % step === 0), muted = css("--muted"), grid = css("--grid");
      const splitIdx = lab.findIndex((d) => d >= b.splitDate);
      const splitLine = { id: "split", afterDatasetsDraw(ch) { if (splitIdx < 0) return; const x = ch.scales.x.getPixelForValue(splitIdx), ctx = ch.ctx; ctx.save(); ctx.strokeStyle = muted; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(x, ch.chartArea.top); ctx.lineTo(x, ch.chartArea.bottom); ctx.stroke(); ctx.fillStyle = muted; ctx.font = "11px IBM Plex Sans"; ctx.fillText("out-of-sample →", x + 4, ch.chartArea.top + 12); ctx.restore(); } };
      if (state.charts.btEq) state.charts.btEq.destroy();
      state.charts.btEq = new Chart($("btEq"), { type: "line", plugins: [splitLine], data: { labels: lab, datasets: [
        { label: "Strategi", data: b.eqS.filter((_, i) => i % step === 0), borderColor: css("--accent"), borderWidth: 1.8, pointRadius: 0 },
        { label: "Buy & hold (equal)", data: b.eqB.filter((_, i) => i % step === 0), borderColor: muted, borderWidth: 1.2, pointRadius: 0 }] },
        options: baseOpts({ plugins: { legend: { labels: { color: muted, boxWidth: 10 } } }, scales: { x: { ticks: { maxTicksLimit: 6, color: muted }, grid: { display: false } }, y: { type: "logarithmic", ticks: { color: muted }, grid: { color: grid } } } }) });
    } catch (e) { $("btOut").innerHTML = `<p class="status err">${esc(e.message)}</p>`; }
  }


  // =====================================================================
  // LAPORAN KEUANGAN TAHUNAN
  // =====================================================================
  function renderFinancials(F) {
    const A = (F && F.annual) || {}, keys = Object.keys(A);
    if (!keys.length) { $("finCard").hidden = true; return; }
    const years = [...new Set(keys.flatMap((k) => A[k].map((x) => x[0].slice(0, 4))))].sort().slice(-5);
    const get = (k, y) => { const r = (A[k] || []).find((x) => x[0].slice(0, 4) === y); return r ? r[1] : null; };
    const cur = F.financialCurrency || F.currency || "", B = (v) => (v == null || !isFinite(v) ? "–" : big(v, cur));
    const ratio = (a, b) => (a == null || b == null || !b ? null : a / b);
    const taxR = (y) => { const p = get("PretaxIncome", y), t = get("TaxProvision", y); return p > 0 && t != null ? Math.min(0.4, Math.max(0, t / p)) : 0.22; };
    const fcf = (y) => { const oi = get("OperatingIncome", y), da = get("DepreciationAndAmortization", y), cx = get("CapitalExpenditure", y); return oi == null || cx == null ? null : oi * (1 - taxR(y)) + (da || 0) + cx; };
    const rows = [
      ["Pendapatan", (y) => B(get("TotalRevenue", y))],
      ["Pertumbuhan pendapatan", (y, i) => { const p = i ? get("TotalRevenue", years[i - 1]) : null, v = get("TotalRevenue", y); return p && v ? pc(v / p - 1) : "–"; }],
      ["Laba operasi", (y) => B(get("OperatingIncome", y))],
      ["Margin operasi", (y) => { const v = ratio(get("OperatingIncome", y), get("TotalRevenue", y)); return v == null ? "–" : pct(v); }],
      ["Laba sebelum pajak", (y) => B(get("PretaxIncome", y))],
      ["Laba bersih", (y) => { const v = get("NetIncome", y); return v == null ? "–" : `<span class="${cls(v)}">${B(v)}</span>`; }],
      ["Margin bersih", (y) => { const v = ratio(get("NetIncome", y), get("TotalRevenue", y)); return v == null ? "–" : pct(v); }],
      ["Tarif pajak efektif", (y) => { const v = ratio(get("TaxProvision", y), get("PretaxIncome", y)); return v == null ? "–" : pct(v); }],
      ["Ekuitas", (y) => B(get("StockholdersEquity", y))],
      ["ROE", (y) => { const v = ratio(get("NetIncome", y), get("StockholdersEquity", y)); return v == null ? "–" : pct(v); }],
      ["Kas & setara kas", (y) => B(get("CashAndCashEquivalents", y))],
      ["Total utang", (y) => B(get("TotalDebt", y))],
      ["Utang / ekuitas", (y) => { const v = ratio(get("TotalDebt", y), get("StockholdersEquity", y)); return v == null ? "–" : nf(2).format(v) + "×"; }],
      ["Capex", (y) => B(get("CapitalExpenditure", y))],
      ["Penyusutan & amortisasi", (y) => B(get("DepreciationAndAmortization", y))],
      ["FCF (perkiraan)", (y) => { const v = fcf(y); return v == null ? "–" : `<span class="${cls(v)}">${B(v)}</span>`; }],
      ["Saham beredar", (y) => { const v = get("OrdinarySharesNumber", y); return v == null ? "–" : big(v); }],
      ["EPS", (y) => { const v = ratio(get("NetIncome", y), get("OrdinarySharesNumber", y)); return v == null ? "–" : fmtNum(v); }],
      ["Nilai buku / saham", (y) => { const v = ratio(get("StockholdersEquity", y), get("OrdinarySharesNumber", y)); return v == null ? "–" : fmtNum(v); }],
    ];
    $("finCur").textContent = cur ? `mata uang laporan: ${cur}` : "";
    $("finTable").innerHTML = `<thead><tr><th>Tahun buku</th>${years.map((y) => `<th>${y}</th>`).join("")}</tr></thead><tbody>` +
      rows.map(([n, f]) => `<tr><td>${n}</td>${years.map((y, i) => `<td>${f(y, i)}</td>`).join("")}</tr>`).join("") + "</tbody>";
    $("finCard").hidden = false;
    const muted = css("--muted"), grid = css("--grid"), sc = cur === "IDR" ? 1e9 : 1e6;
    drawChart("finChart", { type: "bar", data: { labels: years, datasets: [
      { label: `Pendapatan (${cur === "IDR" ? "Rp M" : cur + " jt"})`, data: years.map((y) => (get("TotalRevenue", y) ?? NaN) / sc), backgroundColor: css("--c1") },
      { label: "Laba bersih", data: years.map((y) => (get("NetIncome", y) ?? NaN) / sc), backgroundColor: css("--c2") },
      { label: "FCF (perkiraan)", data: years.map((y) => (fcf(y) ?? NaN) / sc), backgroundColor: css("--c3") }] },
      options: baseOpts({ plugins: { legend: { labels: { color: muted, boxWidth: 10 } } }, scales: { x: { ticks: { color: muted }, grid: { display: false } }, y: { ticks: { color: muted }, grid: { color: grid } } } }) });
  }

  // =====================================================================
  // PASAR HARI INI (F4)
  // =====================================================================
  const MK = {
    idx: [["^JKSE", "IHSG"], ["^JKLQ45", "LQ45"], ["^GSPC", "S&P 500"], ["^IXIC", "Nasdaq"], ["^DJI", "Dow Jones"], ["^N225", "Nikkei 225"], ["^HSI", "Hang Seng"], ["000001.SS", "Shanghai"], ["^STI", "Singapura STI"], ["^KLSE", "Malaysia KLCI"], ["^FTSE", "FTSE 100"], ["^GDAXI", "DAX"]],
    fx: [["IDR=X", "USD/IDR"], ["EURIDR=X", "EUR/IDR"], ["JPYIDR=X", "JPY/IDR"], ["SGDIDR=X", "SGD/IDR"], ["CNYIDR=X", "CNY/IDR"], ["AUDIDR=X", "AUD/IDR"], ["MYRIDR=X", "MYR/IDR"], ["DX-Y.NYB", "Indeks dolar (DXY)"]],
    cmd: [["GC=F", "Emas (USD/oz)"], ["SI=F", "Perak"], ["CL=F", "Minyak WTI"], ["BZ=F", "Minyak Brent"], ["NG=F", "Gas alam"], ["HG=F", "Tembaga"], ["MTF=F", "Batu bara Newcastle"], ["ALI=F", "Aluminium"], ["ZW=F", "Gandum"], ["ZS=F", "Kedelai"], ["BTC-USD", "Bitcoin"], ["ETH-USD", "Ethereum"]],
    bond: [["^IRX", "US 3 bulan"], ["^FVX", "US 5 tahun"], ["^TNX", "US 10 tahun"], ["^TYX", "US 30 tahun"]],
    stocks: ["BBCA", "BBRI", "BMRI", "BBNI", "BRIS", "BBTN", "ARTO", "TLKM", "EXCL", "ISAT", "TOWR", "ASII", "UNTR", "AMRT", "ICBP", "INDF", "UNVR", "MYOR", "KLBF", "SIDO", "CPIN", "JPFA",
      "ADRO", "PTBA", "ITMG", "HRUM", "ANTM", "INCO", "MDKA", "MBMA", "AMMN", "MEDC", "PGAS", "AKRA", "BRPT", "TPIA", "INKP", "TKIM", "SMGR", "INTP", "GOTO", "BUKA", "EMTK", "ACES", "MAPI", "ERAA", "CTRA", "BSDE", "PWON", "JSMR"].map((s) => s + ".JK"),
    ship: [["BDRY", "Tarif kapal curah kering (BDRY, proksi Baltic Dry)"], ["BWET", "Tarif kapal tanker (BWET)"], ["ZIM", "ZIM (kontainer)"], ["MAERSK-B.CO", "Maersk (kontainer)"], ["HLAG.DE", "Hapag-Lloyd (kontainer)"], ["1919.HK", "COSCO Shipping (kontainer)"],
      ["BZ=F", "Brent (biaya bunker)"], ["TMAS.JK", "Temas (pelayaran IDX)"], ["SMDR.JK", "Samudera Indonesia (IDX)"]],
  };
  const mk = { q: {}, mov: "gain", at: 0 };
  async function quotesFor(syms) {
    const out = {}; for (let i = 0; i < syms.length; i += 25) { const part = syms.slice(i, i + 25);
      try { const j = await (await apiFetch(`${API}?action=quotes&symbols=${encodeURIComponent(part.join(","))}`)).json(); (j.quotes || []).forEach((q) => { if (q && q.price != null) out[q.symbol] = q; }); } catch { /* */ } }
    // koin -USDT (meme/altcoin dari Binance) yang tidak ada di Yahoo: ambil harga langsung dari Binance
    const miss = syms.filter((s) => /-USDT$/i.test(s) && !out[s]);
    await Promise.all(miss.map(async (s) => { try { const t = await (await fetch(`https://data-api.binance.vision/api/v3/ticker/24hr?symbol=${s.toUpperCase().replace("-USDT", "")}USDT`)).json();
      if (t && t.lastPrice) out[s] = { symbol: s, price: +t.lastPrice, prevClose: +t.prevClosePrice || +t.openPrice, volume: +t.volume, currency: "USDT", open: true, time: Math.floor((t.closeTime || Date.now()) / 1000) }; } catch { /* */ } }));
    return out;
  }
  const qChg = (q) => (q && q.prevClose ? q.price / q.prevClose - 1 : NaN);
  function mkTable(id, list, opt = {}) {
    $(id).innerHTML = `<thead><tr><th></th><th>Harga</th><th>Hari ini</th>${opt.extra ? `<th>${opt.extra[0]}</th>` : ""}</tr></thead><tbody>` + list.map(([s, n]) => { const q = mk.q[s], c = qChg(q);
      return `<tr><td><span class="pf-sym" data-s="${esc(s)}">${esc(n)}</span></td><td>${q ? (opt.fmt ? opt.fmt(q.price) : fmtNum(q.price)) : "–"}</td><td>${q ? pc(opt.diff ? q.price - q.prevClose : c, 2).replace("%", opt.diff ? " bp" : "%") : '<span class="note">tidak tersedia</span>'}</td>${opt.extra ? `<td>${opt.extra[1](s, q)}</td>` : ""}</tr>`; }).join("") + "</tbody>";
  }
  async function runMarket() {
    $("mkRun").disabled = true; $("mkStatus").textContent = "Mengambil harga…";
    try {
      const all = [...new Set([...MK.idx, ...MK.fx, ...MK.cmd, ...MK.bond].map((x) => x[0]).concat(MK.stocks))];
      mk.q = await quotesFor(all); mk.at = Date.now();
      mkTable("mkIdx", MK.idx); mkTable("mkFx", MK.fx); mkTable("mkCmd", MK.cmd);
      $("mkCmdNote").textContent = MK.cmd.filter(([s]) => !mk.q[s]).length ? "Komoditas yang tidak tersedia di Yahoo ditandai 'tidak tersedia' (CPO dan nikel tidak punya kontrak gratis di Yahoo)." : "";
      $("mkBond").innerHTML = `<thead><tr><th></th><th>Yield</th><th>Hari ini</th></tr></thead><tbody>` + MK.bond.map(([s, n]) => { const q = mk.q[s];
        return `<tr><td>${n}</td><td>${q ? nf(2).format(q.price) + "%" : "–"}</td><td>${q && q.prevClose ? `<span class="${cls(q.price - q.prevClose)}">${q.price - q.prevClose > 0 ? "+" : ""}${nf(0).format((q.price - q.prevClose) * 100)} bp</span>` : "–"}</td></tr>`; }).join("") +
        `<tr><td>SBN 10 tahun <span class="note">(asumsi)</span></td><td>${pct(DAMO.sbn10, 2)}</td><td class="note">manual</td></tr><tr><td>BI-Rate <span class="note">(asumsi)</span></td><td>${pct(DAMO.biRate, 2)}</td><td class="note">manual</td></tr>` +
        (mk.q["^TNX"] ? `<tr><td>Selisih SBN10 − UST10</td><td>${nf(2).format(DAMO.sbn10 * 100 - mk.q["^TNX"].price)} pp</td><td></td></tr>` : "") + "</tbody>";
      renderMovers(); renderCalendar();
      $("mkStatus").textContent = `Diperbarui ${new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`;
      runShipping();
    } catch (e) { $("mkStatus").textContent = e.message; }
    finally { $("mkRun").disabled = false; }
  }
  function renderMovers() {
    const rows = MK.stocks.map((s) => mk.q[s]).filter(Boolean).map((q) => ({ s: q.symbol, p: q.price, c: qChg(q), v: q.volume || 0, val: (q.volume || 0) * q.price }));
    const by = { gain: (a, b) => b.c - a.c, lose: (a, b) => a.c - b.c, value: (a, b) => b.val - a.val, vol: (a, b) => b.v - a.v }[mk.mov];
    const top = rows.filter((r) => isFinite(r.c)).sort(by).slice(0, 12);
    $("mkMov").innerHTML = `<thead><tr><th>Saham</th><th>Harga</th><th>Hari ini</th><th>Volume (lot)</th><th>Nilai transaksi</th></tr></thead><tbody>` +
      top.map((r) => `<tr><td><span class="pf-sym" data-s="${esc(r.s)}">${esc(r.s.replace(/\.JK$/, ""))}</span></td><td>${fmtNum(r.p)}</td><td>${pc(r.c, 2)}</td><td>${big(r.v / 100)}</td><td>${big(r.val, "IDR")}</td></tr>`).join("") + "</tbody>";
    const up = rows.filter((r) => r.c > 0).length, dn = rows.filter((r) => r.c < 0).length;
    $("mkBreadth").innerHTML = `Dari ${rows.length} saham likuid: <span class="pos">${up} naik</span>, <span class="neg">${dn} turun</span>, ${rows.length - up - dn} tetap. Total nilai transaksi ${big(rows.reduce((a, r) => a + r.val, 0), "IDR")}.`;
  }
  const CAL = [
    ...[["2026-01-20", "2026-01-21"], ["2026-02-18", "2026-02-19"], ["2026-03-16", "2026-03-17"], ["2026-04-21", "2026-04-22"], ["2026-05-19", "2026-05-20"], ["2026-06-17", "2026-06-18"], ["2026-07-21", "2026-07-22"],
      ["2026-08-18", "2026-08-19"], ["2026-09-22", "2026-09-23"], ["2026-10-20", "2026-10-21"], ["2026-11-17", "2026-11-18"], ["2026-12-15", "2026-12-16"]].map(([a, b]) => ({ d: b, t: `RDG Bank Indonesia (${a.slice(8)}–${b.slice(8)}) · keputusan BI-Rate`, c: "ID", src: "jadwal resmi BI" })),
    ...[["2026-01-27", "2026-01-28"], ["2026-03-17", "2026-03-18"], ["2026-04-28", "2026-04-29"], ["2026-06-16", "2026-06-17"], ["2026-07-28", "2026-07-29"], ["2026-09-15", "2026-09-16"], ["2026-10-27", "2026-10-28"], ["2026-12-08", "2026-12-09"]]
      .map(([a, b]) => ({ d: b, t: `FOMC The Fed (${a.slice(8)}–${b.slice(8)}) · keputusan Fed funds rate`, c: "US", src: "jadwal resmi Fed" })),
  ];
  function renderCalendar() {
    const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10), items = CAL.slice();
    // rilis BPS: hari kerja pertama tiap bulan (perkiraan)
    for (let k = -1; k <= 3; k++) { const t = new Date(today.slice(0, 7) + "-01T00:00:00Z"); t.setUTCMonth(t.getUTCMonth() + k); while ([0, 6].includes(t.getUTCDay()) || t.toISOString().slice(5, 10) === "01-01") t.setUTCDate(t.getUTCDate() + 1);
      items.push({ d: t.toISOString().slice(0, 10), t: "BPS: inflasi bulanan & neraca perdagangan (perkiraan: hari kerja awal bulan / pertengahan bulan)", c: "ID", src: "perkiraan" }); }
    const list = items.filter((x) => x.d >= addDays(today, -14) && x.d <= addDays(today, 75)).sort((a, b) => a.d.localeCompare(b.d));
    const next = list.find((x) => x.d >= today);
    $("mkCal").innerHTML = `<thead><tr><th>Tanggal</th><th>Negara</th><th>Acara</th><th>Sumber</th></tr></thead><tbody>` + list.map((x) =>
      `<tr class="${x.d < today ? "cal-past" : x === next ? "cal-next" : ""}"><td>${x.d}${x.d === today ? ' <span class="pill sig">hari ini</span>' : ""}</td><td>${x.c}</td><td class="txt">${esc(x.t)}</td><td class="note">${x.src}</td></tr>`).join("") + "</tbody>";
  }
  const addDays = (d, n) => { const t = new Date(d + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

  // ---------- shipping & freight ----------
  async function runShipping() {
    $("shipTable").innerHTML = '<tbody><tr><td>Mengambil data freight…</td></tr></tbody>';
    const back = (d, days) => { const n = d.values.length, t = new Date(d.dates[n - 1]); t.setDate(t.getDate() - days); const ts = t.toISOString().slice(0, 10); let i = n - 1; while (i > 0 && d.dates[i] > ts) i--; return d.values[n - 1] / d.values[i] - 1; };
    const [rows, wci] = await Promise.all([
      pool(MK.ship, 4, async ([s, n]) => { try { const d = await fetchSymbol(s, "1y"), v = d.values, L = v.length;
        const r = MCEngine.logReturns(v.slice(-64)), z = (() => { const m = []; for (let i = 21; i < v.length; i++) m.push(v[i] / v[i - 21] - 1); const mu = MCEngine.mean(m), sd = MCEngine.std(m, 0); return sd > 0 ? (m[m.length - 1] - mu) / sd : NaN; })();
        return { s, n, cur: d.currency, last: v[L - 1], d1: v[L - 1] / v[L - 2] - 1, w1: back(d, 7), m1: back(d, 30), m3: back(d, 91), y1: back(d, 365), z, vol: MCEngine.std(r, 0) * Math.sqrt(252), spark: v.slice(-66) }; }
        catch (e) { return { s, n, error: e.message }; } }),
      apiFetch(`${API}?action=freight`).then((r) => r.json()).catch(() => ({ error: "tidak tersedia" })),
    ]);
    const W = wci && !wci.error && wci.composite ? wci : null;
    $("shipWci").innerHTML = W ? `<div class="kpi"><div class="k">Drewry WCI komposit (USD / 40ft)</div><div class="v">$${nf(0).format(W.composite)}</div><div class="h"><span class="${cls(W.chg)}">${spct(W.chg, 0)}</span> minggu ini · ${esc(W.date || "")}</div></div>` +
      (W.routes || []).slice(0, 5).map((x) => `<div class="kpi"><div class="k">${esc(x.route)}</div><div class="v">$${nf(0).format(x.price)}</div><div class="h">${x.chg != null ? `<span class="${cls(x.chg)}">${spct(x.chg, 0)}</span> minggu ini` : ""}</div></div>`).join("")
      : `<div class="kpi"><div class="k">Drewry WCI</div><div class="v">–</div><div class="h">gagal dibaca dari situs Drewry (${esc((wci && wci.error) || "?")}); pakai proksi di bawah</div></div>`;
    $("shipTable").innerHTML = `<thead><tr><th>Indikator</th><th>Harga</th><th>1H</th><th>1M</th><th>1B</th><th>3B</th><th>1T</th><th>3 bulan</th><th>Gerak 1B vs biasanya</th></tr></thead><tbody>` +
      rows.map((r) => r.error ? `<tr class="err-row"><td>${esc(r.n)}</td><td colspan="8">${esc(r.error)}</td></tr>` :
        `<tr><td><span class="pf-sym" data-s="${esc(r.s)}">${esc(r.n)}</span></td><td>${fmtNum(r.last)}</td><td>${pc(r.d1, 1)}</td><td>${pc(r.w1)}</td><td>${pc(r.m1)}</td><td>${pc(r.m3)}</td><td>${pc(r.y1)}</td><td>${sparkSvg(r.spark)}</td>
        <td>${isFinite(r.z) ? `<span class="${Math.abs(r.z) > 2 ? (r.z > 0 ? "pos" : "neg") : ""}">${r.z > 0 ? "+" : ""}${nf(1).format(r.z)}σ${Math.abs(r.z) > 2 ? " · tidak biasa" : ""}</span>` : "–"}</td></tr>`).join("") + "</tbody>";
    const R = Object.fromEntries(rows.filter((r) => !r.error).map((r) => [r.s, r]));
    const lines = [];
    const box = ["MAERSK-B.CO", "HLAG.DE", "1919.HK", "ZIM"].map((s) => R[s]).filter(Boolean), boxM = box.length ? MCEngine.mean(box.map((r) => r.m1)) : NaN;
    if (W && W.chg != null) lines.push(`Tarif kontainer (WCI) ${W.chg > 0.05 ? "<b>naik tajam</b>" : W.chg > 0 ? "naik" : W.chg < -0.05 ? "<b>turun tajam</b>" : "turun"} ${spct(W.chg, 0)} minggu ini ke $${nf(0).format(W.composite)}/40ft.`);
    if (isFinite(boxM)) lines.push(`Saham pelayaran kontainer global rata-rata ${spct(boxM)} sebulan: ${boxM > 0.08 ? "pasar memperkirakan tarif kontainer tetap tinggi / naik." : boxM < -0.08 ? "pasar memperkirakan tarif kontainer melemah." : "tidak ada perubahan ekspektasi yang besar."}`);
    if (R.BDRY) lines.push(`Curah kering (BDRY) ${spct(R.BDRY.m1)} sebulan${Math.abs(R.BDRY.z) > 2 ? " (gerak tidak biasa)" : ""}: ${R.BDRY.m1 > 0.1 ? "permintaan angkut batu bara/bijih besi/biji-bijian menguat — biasanya sejalan dengan impor China." : R.BDRY.m1 < -0.1 ? "permintaan angkut komoditas curah melemah." : "relatif stabil."}`);
    if (R.BWET) lines.push(`Tanker (BWET) ${spct(R.BWET.m1)} sebulan: ${R.BWET.m1 > 0.1 ? "biaya angkut minyak naik — menambah biaya impor BBM Indonesia." : R.BWET.m1 < -0.1 ? "biaya angkut minyak turun." : "relatif stabil."}`);
    if (R["BZ=F"]) lines.push(`Brent ${spct(R["BZ=F"].m1)} sebulan → biaya bahan bakar kapal (bunker) ${R["BZ=F"].m1 > 0 ? "naik" : "turun"}.`);
    $("shipRead").innerHTML = (lines.length ? lines.join(" ") : "Data belum cukup untuk dibaca.") + ' <span class="note">Bacaan otomatis berbasis aturan sederhana, bukan prediksi.</span>';
    const dir = (v) => (!isFinite(v) ? "–" : v > 0.03 ? '<span class="pos">▲</span>' : v < -0.03 ? '<span class="neg">▼</span>' : "◆");
    $("shipImpact").innerHTML = `<thead><tr><th>Jika naik</th><th>Arah sekarang</th><th>Global</th><th>Indonesia</th></tr></thead><tbody>
      <tr><td>Tarif kontainer</td><td>${dir(W ? W.chg : boxM)}</td><td class="txt">Biaya barang impor naik → tekanan inflasi barang; untung untuk perusahaan pelayaran kontainer.</td><td class="txt">Biaya impor bahan baku & barang jadi naik (ritel elektronik/otomotif: ERAA, ACES, ASII); eksportir manufaktur kurang kompetitif; positif untuk TMAS, SMDR.</td></tr>
      <tr><td>Tarif curah kering</td><td>${dir(R.BDRY && R.BDRY.m1)}</td><td class="txt">Sinyal permintaan bahan baku (terutama China) dan kapasitas kapal.</td><td class="txt">Ekspor batu bara & nikel umumnya FOB (ongkos kapal ditanggung pembeli), tapi tarif tinggi bisa menekan harga jual bersih; sentimen untuk ADRO, PTBA, ITMG, INCO.</td></tr>
      <tr><td>Tarif tanker</td><td>${dir(R.BWET && R.BWET.m1)}</td><td class="txt">Biaya angkut minyak & produk BBM naik.</td><td class="txt">Indonesia net importir minyak: biaya impor BBM dan beban subsidi naik; bisa menekan neraca dagang & rupiah.</td></tr>
      <tr><td>Harga minyak (bunker)</td><td>${dir(R["BZ=F"] && R["BZ=F"].m1)}</td><td class="txt">Ongkos operasi kapal naik, diteruskan lewat biaya tambahan bahan bakar (BAF).</td><td class="txt">Positif untuk MEDC (produsen), negatif untuk biaya logistik umum.</td></tr></tbody>`;
    try { const j = await (await apiFetch(`${API}?action=news&symbol=BDRY&q=${encodeURIComponent("freight rates shipping container Red Sea Suez Panama")}`)).json();
      const kw = /ship|freight|container|vessel|port|tanker|bulk|suez|red sea|panama|maersk|cargo|pelayaran|kapal|pelabuhan|logistik/i;
      const items = (j.items || []).filter((x) => kw.test(x.title)).slice(0, 8);
      $("shipNews").innerHTML = items.length ? items.map((x) => `<div class="news"><a href="${esc(x.link)}" target="_blank" rel="noopener">${esc(x.title)}</a><div class="nm">${esc(x.publisher || x.via)} · ${new Date(x.time * 1000).toLocaleDateString("id-ID")}</div>${x.summary ? `<div class="ns">${esc(x.summary.slice(0, 220))}</div>` : ""}</div>`).join("") : '<p class="note">Tidak ada berita shipping yang relevan.</p>';
    } catch { $("shipNews").innerHTML = '<p class="note">Berita gagal dimuat.</p>'; }
  }

