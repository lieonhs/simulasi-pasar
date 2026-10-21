/* app.js — UI, data, chart, rencana lot, perbandingan, candlestick */
(() => {
  "use strict";
  const API = "https://immvxirnxumsvjelbmum.supabase.co/functions/v1/market-data";
  const PRESETS = {
    price: [["BTC-USD", "Bitcoin"], ["ETH-USD", "Ethereum"], ["^JKSE", "IHSG"], ["BBCA.JK", "BCA"], ["BBRI.JK", "BRI"], ["TLKM.JK", "Telkom"], ["GC=F", "Emas"], ["IDR=X", "USD/IDR"], ["^GSPC", "S&P 500"]],
    bond: [["^TNX", "US 10Y"], ["^FVX", "US 5Y"], ["^TYX", "US 30Y"], ["^IRX", "US 13W"]],
  };
  // nama umum (Indonesia) -> ticker; muncul sebagai "Rekomendasi" saat mengetik
  const ALIASES = [
    ["ihsg", "^JKSE", "IHSG (Indeks Harga Saham Gabungan)", "INDEX"], ["jkse", "^JKSE", "IHSG", "INDEX"], ["lq45", "^JKLQ45", "Indeks LQ45", "INDEX"],
    ["idx30", "^JKIDX30", "Indeks IDX30", "INDEX"], ["bitcoin", "BTC-USD", "Bitcoin (USD)", "CRYPTOCURRENCY"], ["btc", "BTC-USD", "Bitcoin (USD)", "CRYPTOCURRENCY"],
    ["ethereum", "ETH-USD", "Ethereum (USD)", "CRYPTOCURRENCY"], ["solana", "SOL-USD", "Solana (USD)", "CRYPTOCURRENCY"], ["emas", "GC=F", "Emas (futures, USD/oz)", "FUTURE"],
    ["gold", "GC=F", "Emas (futures, USD/oz)", "FUTURE"], ["perak", "SI=F", "Perak (futures)", "FUTURE"], ["minyak", "CL=F", "Minyak mentah WTI", "FUTURE"],
    ["batubara", "MTF=F", "Batu bara Newcastle", "FUTURE"], ["cpo", "FCPO=F", "CPO / sawit", "FUTURE"], ["dolar", "IDR=X", "USD/IDR (kurs dolar)", "CURRENCY"],
    ["rupiah", "IDR=X", "USD/IDR (kurs dolar)", "CURRENCY"], ["usd", "IDR=X", "USD/IDR (kurs dolar)", "CURRENCY"], ["sp500", "^GSPC", "S&P 500", "INDEX"],
    ["s&p", "^GSPC", "S&P 500", "INDEX"], ["nasdaq", "^IXIC", "Nasdaq Composite", "INDEX"], ["dow", "^DJI", "Dow Jones", "INDEX"], ["nikkei", "^N225", "Nikkei 225", "INDEX"],
    ["bca", "BBCA.JK", "Bank Central Asia", "EQUITY"], ["bri", "BBRI.JK", "Bank Rakyat Indonesia", "EQUITY"], ["mandiri", "BMRI.JK", "Bank Mandiri", "EQUITY"],
    ["bni", "BBNI.JK", "Bank Negara Indonesia", "EQUITY"], ["telkom", "TLKM.JK", "Telkom Indonesia", "EQUITY"], ["astra", "ASII.JK", "Astra International", "EQUITY"],
    ["goto", "GOTO.JK", "GoTo Gojek Tokopedia", "EQUITY"], ["antam", "ANTM.JK", "Aneka Tambang", "EQUITY"], ["unilever", "UNVR.JK", "Unilever Indonesia", "EQUITY"],
    ["indofood", "INDF.JK", "Indofood Sukses Makmur", "EQUITY"], ["us10y", "^TNX", "Yield obligasi AS 10 tahun", "INDEX"], ["treasury", "^TNX", "Yield obligasi AS 10 tahun", "INDEX"],
  ];
  const TYPE_ID = { EQUITY: "Saham", CRYPTOCURRENCY: "Kripto", INDEX: "Indeks", ETF: "ETF", CURRENCY: "Mata uang", FUTURE: "Komoditas", MUTUALFUND: "Reksa dana", OPTION: "Opsi" };
  const COLORS = ["#1f5eff", "#0f8a5f", "#b86e00", "#8b3fd9", "#c8322b"];

  const $ = (id) => document.getElementById(id);
  const state = { mode: "price", symbol: "BTC-USD", data: null, res: null, sel: null, charts: {}, csv: null, runId: 0,
    planMode: "auto", planRes: null, cmp: null, tf: "D", rg: 182, lw: null };

  // ---------- format ----------
  const nf = (d) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: d, minimumFractionDigits: d });
  function fmtNum(v) { if (!isFinite(v)) return "–"; const a = Math.abs(v); return nf(a >= 1000 ? 0 : a >= 10 ? 2 : a >= 1 ? 3 : 4).format(v); }
  const pct = (v, d = 1) => (isFinite(v) ? nf(d).format(v * 100) + "%" : "–");
  const spct = (v, d = 1) => (isFinite(v) ? (v > 0 ? "+" : "") + pct(v, d) : "–");
  const cls = (v) => (v > 0 ? "pos" : v < 0 ? "neg" : "");
  function money(v) { if (!isFinite(v)) return "–"; const c = state.data && state.data.currency; const a = Math.abs(v);
    const s = a >= 1e12 ? nf(2).format(v / 1e12) + " T" : a >= 1e9 ? nf(2).format(v / 1e9) + " M" : a >= 1e6 ? nf(2).format(v / 1e6) + " jt" : fmtNum(v);
    return (c === "IDR" ? "Rp " : c ? c + " " : "") + s; }
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const isIdx = () => /\.JK$/i.test(state.data ? state.data.symbol : state.symbol);
  const isCrypto = () => /CRYPTO/i.test((state.data && state.data.type) || "") || /-USDT?$/i.test(state.symbol);

  // ---------- state URL ----------
  function readUrl() {
    const p = new URLSearchParams(location.search);
    if (p.get("mode") === "bond") state.mode = "bond";
    state.symbol = p.get("s") || (state.mode === "bond" ? "^TNX" : "BTC-USD");
    if (p.get("h")) $("horizon").value = p.get("h");
  }
  function writeUrl() {
    const p = new URLSearchParams({ s: state.symbol, h: $("horizon").value });
    if (state.mode === "bond") p.set("mode", "bond");
    history.replaceState(null, "", "?" + p.toString());
  }

  // ---------- mode ----------
  function setMode(m, keepSymbol) {
    state.mode = m;
    document.querySelectorAll(".controls .seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.mode === m));
    document.querySelectorAll(".price-only").forEach((el) => (el.hidden = m !== "price"));
    document.querySelectorAll(".bond-only").forEach((el) => (el.hidden = m !== "bond"));
    $("customWrap").hidden = m !== "price" || $("drift").value !== "custom";
    if (!keepSymbol) { state.symbol = PRESETS[m][0][0]; state.csv = null; }
    $("q").value = state.symbol;
    $("chips").innerHTML = PRESETS[m].map(([s, n]) => `<button class="chip" data-s="${esc(s)}">${esc(n)}</button>`).join("");
  }

  // ---------- pencarian + rekomendasi ----------
  let searchTimer = null, suggIdx = -1, searchSeq = 0;
  function suggRow(q, tag) {
    const t = TYPE_ID[q.type] || q.type || "";
    return `<li data-s="${esc(q.symbol)}"><div class="left"><b>${esc(q.symbol)}</b>${t ? `<span class="badge">${esc(t)}</span>` : ""}</div><span>${esc(q.name || "")}${q.exch ? " · " + esc(q.exch) : ""}${tag ? " · " + tag : ""}</span></li>`;
  }
  function localMatches(v) {
    const s = v.toLowerCase(); const seen = new Set();
    return ALIASES.filter(([k, sym]) => (k.startsWith(s) || (s.length >= 3 && k.includes(s))) && !seen.has(sym) && seen.add(sym))
      .slice(0, 4).map(([, symbol, name, type]) => ({ symbol, name, type }));
  }
  function showSugg(sections) {
    const ul = $("sugg"); suggIdx = -1;
    const html = sections.filter((s) => s.items.length).map((s) => `<li class="hdr">${s.title}</li>` + s.items.map((q) => suggRow(q)).join("")).join("");
    if (!html) { ul.hidden = true; return; }
    ul.innerHTML = html; ul.hidden = false;
  }
  function popular() {
    const list = state.mode === "bond" ? PRESETS.bond.map(([symbol, name]) => ({ symbol, name, type: "INDEX" }))
      : [["^JKSE", "IHSG", "INDEX"], ["BBCA.JK", "Bank Central Asia", "EQUITY"], ["BBRI.JK", "Bank Rakyat Indonesia", "EQUITY"], ["BMRI.JK", "Bank Mandiri", "EQUITY"], ["TLKM.JK", "Telkom Indonesia", "EQUITY"],
         ["BTC-USD", "Bitcoin", "CRYPTOCURRENCY"], ["GC=F", "Emas", "FUTURE"], ["IDR=X", "USD/IDR", "CURRENCY"]].map(([symbol, name, type]) => ({ symbol, name, type }));
    showSugg([{ title: "Populer", items: list }]);
  }
  async function search(v) {
    const seq = ++searchSeq, local = localMatches(v);
    showSugg([{ title: "Rekomendasi", items: local }, { title: "Mencari…", items: [] }]);
    let remote = [];
    try { const r = await fetch(`${API}?action=search&q=${encodeURIComponent(v)}`); remote = (await r.json()).quotes || []; } catch { /* abaikan */ }
    if (seq !== searchSeq || $("q").value.trim() !== v) return;
    const seen = new Set(local.map((x) => x.symbol));
    remote = remote.filter((x) => !seen.has(x.symbol));
    // dahulukan bursa Indonesia
    remote.sort((a, b) => (/\.JK$/.test(b.symbol) ? 1 : 0) - (/\.JK$/.test(a.symbol) ? 1 : 0));
    showSugg([{ title: "Rekomendasi", items: local }, { title: "Hasil pencarian", items: remote }]);
  }
  function pick(sym) { state.symbol = sym.toUpperCase(); state.csv = null; $("q").value = state.symbol; $("sugg").hidden = true; $("didYouMean").hidden = true; }
  async function didYouMean(typed) {
    const box = $("didYouMean");
    const local = localMatches(typed.replace(/\.JK$/i, ""));
    let remote = [];
    try { const r = await fetch(`${API}?action=search&q=${encodeURIComponent(typed.replace(/\.JK$/i, ""))}`); remote = (await r.json()).quotes || []; } catch { /* */ }
    const all = [...local, ...remote].filter((x, i, a) => a.findIndex((y) => y.symbol === x.symbol) === i).slice(0, 6);
    if (!all.length) { box.hidden = true; return; }
    box.innerHTML = "Mungkin maksud kamu: " + all.map((q) => `<button class="chip" data-s="${esc(q.symbol)}" title="${esc(q.name || "")}">${esc(q.symbol)}${q.name ? " · " + esc(q.name.slice(0, 22)) : ""}</button>`).join("");
    box.hidden = false;
  }

  // ---------- data ----------
  const cache = new Map();
  async function fetchSymbol(sym, range) {
    const key = `${sym}|${range}`;
    if (cache.has(key)) return cache.get(key);
    const r = await fetch(`${API}?symbol=${encodeURIComponent(sym)}&range=${range}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error(j.error || `Gagal ambil data ${sym} (${r.status})`);
    const d = { name: j.name, symbol: j.symbol, currency: j.currency, type: j.type, source: j.source, dates: j.rows.map((x) => x[0]), values: j.rows.map((x) => x[1]), ohlc: j.ohlc || [] };
    cache.set(key, d);
    return d;
  }
  function parseCsv(text, name) {
    const lines = text.trim().split(/\r?\n/).filter(Boolean);
    const delim = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ";" : ",";
    const dates = [], values = [];
    for (const ln of lines) {
      const cols = ln.split(delim).map((c) => c.trim().replace(/^"|"$/g, ""));
      const d = new Date(cols[0]);
      let raw = cols[cols.length - 1];
      if (delim === ";") raw = raw.replace(/\./g, "").replace(",", ".");
      const v = parseFloat(raw);
      if (isNaN(d) || !isFinite(v)) continue;
      dates.push(d.toISOString().slice(0, 10)); values.push(v);
    }
    const idx = dates.map((_, i) => i).sort((a, b) => (dates[a] < dates[b] ? -1 : 1));
    if (idx.length < 60) throw new Error("CSV butuh minimal 60 baris: kolom tanggal, lalu nilai di kolom terakhir");
    return { name, symbol: name, currency: "", type: "", source: "CSV", dates: idx.map((i) => dates[i]), values: idx.map((i) => values[i]), ohlc: [] };
  }

  // ---------- worker ----------
  let worker = null;
  try { worker = new Worker("worker.js"); } catch { worker = null; }
  const pending = new Map();
  if (worker) {
    worker.onmessage = (e) => { const p = pending.get(e.data.id); if (!p) return;
      if (e.data.type === "progress") p.onProgress(e.data.msg, e.data.frac);
      else { pending.delete(e.data.id); e.data.type === "done" ? p.resolve(e.data.res) : p.reject(new Error(e.data.msg)); } };
    worker.onerror = (e) => { pending.forEach((p) => p.reject(new Error(e.message || "Worker error"))); pending.clear(); worker = null; };
  }
  function compute(type, cfg, onProgress = () => {}) {
    if (!worker) return new Promise((res, rej) => setTimeout(() => { try {
      if (type === "plan") res(MCEngine.evalPlan(cfg));
      else if (type === "compare") res(inlineCompare(cfg, onProgress));
      else res(cfg.mode === "bond" ? MCEngine.runBond(cfg, onProgress) : MCEngine.runPrice(cfg, onProgress));
    } catch (e) { rej(e); } }, 20));
    const id = ++state.runId;
    return new Promise((resolve, reject) => { pending.set(id, { resolve, reject, onProgress }); worker.postMessage({ id, type, cfg }); });
  }
  function inlineCompare(cfg, onProgress) {
    const stats = MCEngine.compareStats(cfg.series, cfg.benchIdx);
    const sims = cfg.series.map((s, i) => { onProgress(`Simulasi pembanding ${i + 1}…`, i / cfg.series.length);
      const r = MCEngine.runPrice({ ...cfg.sim, prices: s.values, dates: s.dates, type: s.type, backtest: false, keepPaths: false, seed: 101 + i });
      const out = {}; for (const [k, m] of Object.entries(r.models)) out[k] = { label: m.label, summary: m.summary, probUp: m.probUp[m.probUp.length - 1] };
      return { s0: r.s0, models: out }; });
    return { stats, sims };
  }

  // ---------- jalankan ----------
  function status(msg, err) { $("status").textContent = msg; $("status").classList.toggle("err", !!err); }
  async function run() {
    const btn = $("run"); btn.disabled = true; $("barFill").style.width = "5%"; $("didYouMean").hidden = true;
    let typed = "";
    try {
      typed = $("q").value.trim();
      if (typed && !state.csv && typed.toUpperCase() !== state.symbol) {
        const al = localMatches(typed).find((x) => x.symbol.toUpperCase() === typed.toUpperCase() || ALIASES.some(([k, s]) => k === typed.toLowerCase() && s === x.symbol));
        state.symbol = al ? al.symbol : typed.toUpperCase();
        $("q").value = state.symbol;
      }
      status("Mengambil data " + state.symbol + "…");
      const d = state.csv || await fetchSymbol(state.symbol, $("range").value);
      const newSymbol = !state.data || state.data.symbol !== d.symbol;
      state.data = d;
      const days = Math.max(1, Math.min(365, parseInt($("horizon").value, 10) || 30));
      const sims = parseInt($("sims").value, 10);
      const bt = $("bt").checked;
      let cfg;
      if (state.mode === "bond") {
        let y = d.values.slice();
        const med = y.slice().sort((a, b) => a - b)[y.length >> 1];
        if (med > 0.5) y = y.map((v) => v / 100);
        cfg = { mode: "bond", yields: y, dates: d.dates, days, sims, backtest: bt, coupon: (parseFloat($("coupon").value) || 0) / 100, maturity: parseFloat($("maturity").value) || 10, seed: 42 };
      } else {
        if (d.values.some((v) => v <= 0)) throw new Error("Ada harga ≤ 0, tidak bisa dihitung log-return. Untuk yield pakai mode Yield obligasi.");
        const models = [...document.querySelectorAll("#models input:checked")].map((x) => x.value);
        if (!models.length) throw new Error("Pilih minimal satu model");
        cfg = { mode: "price", prices: d.values, dates: d.dates, type: d.type, days, sims, models, drift: $("drift").value, customDrift: (parseFloat($("customDrift").value) || 0) / 100, backtest: bt, keepPaths: true, seed: 42 };
      }
      const t0 = performance.now();
      const res = await compute("run", cfg, (msg, f) => { status(msg); $("barFill").style.width = Math.round(10 + 85 * f) + "%"; });
      state.res = res; state.cfg = cfg;
      state.sel = pickBest(res) || Object.keys(res.models)[0];
      $("out").hidden = false;
      if (newSymbol) { setPlanDefaults(); setCmpDefaults(); state.cmp = null; $("cmpOut").hidden = true; }
      else { $("pEntry").placeholder = fmtNum(res.s0); }
      render();
      writeUrl();
      $("barFill").style.width = "100%";
      status(`Selesai dalam ${((performance.now() - t0) / 1000).toFixed(1)} detik · ${d.values.length.toLocaleString("id-ID")} observasi · sumber ${d.source}`);
      setTimeout(() => ($("barFill").style.width = "0"), 600);
      if (res.mode === "price") { runPlan(); if (newSymbol) { state.valBetaSet = false; state.rfAuto = true; state.oAuto = true; state.risk = null; runValuation(); } if (newSymbol || !state.cmp) runCompare(); else { renderCompare(); renderQuant(); } }
    } catch (e) {
      status(e.message || String(e), true); $("barFill").style.width = "0";
      if (typed && !state.csv) didYouMean(typed);
    } finally { btn.disabled = false; }
  }
  function pickBest(res) {
    let best = null, err = Infinity;
    for (const [k, m] of Object.entries(res.models)) if (m.backtest && m.backtest.calibErr < err) { err = m.backtest.calibErr; best = k; }
    return best;
  }

  // ---------- render utama ----------
  function futureDates(last, n, ppy) {
    const out = []; const d = new Date(last + "T00:00:00Z");
    while (out.length < n) { d.setUTCDate(d.getUTCDate() + 1); const wd = d.getUTCDay(); if (ppy === 365 || (wd !== 0 && wd !== 6)) out.push(d.toISOString().slice(0, 10)); }
    return out;
  }
  function render() {
    const { res, data: d, cfg } = state, bond = res.mode === "bond";
    $("asset").textContent = d.name || d.symbol;
    const lastDate = d.dates[d.dates.length - 1];
    $("assetMeta").textContent = `${d.symbol}${d.currency ? " · " + d.currency : ""}${d.type ? " · " + (TYPE_ID[d.type] || d.type) : ""} · data s/d ${lastDate}`;
    $("lastPx").textContent = bond ? pct(res.y0, 2) : fmtNum(res.s0);

    const k = bond
      ? [["Harga obligasi kini", fmtNum(res.p0), `kupon ${pct(cfg.coupon, 2)} · ${cfg.maturity} th`], ["Vol yield / tahun", nf(0).format(res.stats.volBpAnn) + " bp", "dari perubahan harian"],
         ["Rentang historis", `${pct(res.stats.min, 2)} – ${pct(res.stats.max, 2)}`, `${res.nObs} observasi`], ["Horizon", `${cfg.days} hari bursa`, "≈ " + nf(1).format(cfg.days / 21) + " bulan"]]
      : [["Volatilitas tahunan", pct(res.stats.volAnn), "historis"], ["Return tahunan hist.", pct(res.stats.retAnn), `drift dipakai: ${pct(res.stats.muUsed)}`],
         ["Excess kurtosis", nf(1).format(res.stats.exKurt), res.stats.exKurt > 3 ? "ekor gemuk — crash lebih sering dari normal" : "mendekati normal"],
         ["Max drawdown", pct(res.stats.maxDD), "dalam data historis"], ["Horizon", `${cfg.days} ${res.ppy === 365 ? "hari" : "hari bursa"}`, `skew ${nf(2).format(res.stats.skew)}`]];
    $("kpis").innerHTML = k.map(([a, b, c]) => `<div class="kpi"><div class="k">${a}</div><div class="v">${b}</div><div class="h">${c}</div></div>`).join("");

    document.querySelectorAll(".price-only").forEach((el) => (el.hidden = bond));
    $("candleCard").hidden = !(d.ohlc && d.ohlc.length > 30);
    $("modelTabs").innerHTML = Object.entries(res.models).map(([key, m]) => `<button class="tab ${key === state.sel ? "active" : ""}" data-m="${key}">${esc(m.label)}</button>`).join("");
    renderCandle(); renderSummary(); renderConfidence(); renderParams(); renderCaveats(); renderSelected();
  }

  function renderSelected() {
    const { res, data: d } = state, bond = res.mode === "bond", m = res.models[state.sel];
    document.querySelectorAll("#modelTabs .tab").forEach((t) => t.classList.toggle("active", t.dataset.m === state.sel));
    $("fanTitle").textContent = `Proyeksi ${bond ? "yield" : "harga"} · ${m.label}`;
    const days = m.fan[0].length, histN = Math.min(d.values.length, Math.max(60, days * 3));
    const med = d.values.slice().sort((a, b) => a - b)[d.values.length >> 1];
    const scale = bond && med <= 0.5 ? 100 : 1;
    const hd = d.dates.slice(-histN), hv = d.values.slice(-histN).map((v) => v * scale);
    const labels = hd.concat(futureDates(hd[hd.length - 1], days, res.ppy || 252));
    const pad = (arr, start) => new Array(histN - 1).fill(null).concat([start], arr);
    const s0 = bond ? res.y0 * 100 : res.s0;
    const [p5, , p25, p50, p75, , p95] = m.fan;
    const acc = css("--accent"), soft = css("--accent-soft"), mid = css("--accent-mid"), ink = css("--hist"), grid = css("--line"), muted = css("--muted");
    const ds = [
      { label: "Historis", data: hv.concat(new Array(days).fill(null)), borderColor: ink, borderWidth: 1.4, pointRadius: 0 },
      { label: "P5", data: pad(p5, s0), borderColor: "transparent", pointRadius: 0 },
      { label: "P95", data: pad(p95, s0), borderColor: "transparent", backgroundColor: soft, fill: "-1", pointRadius: 0 },
      { label: "P25", data: pad(p25, s0), borderColor: "transparent", pointRadius: 0 },
      { label: "P75", data: pad(p75, s0), borderColor: "transparent", backgroundColor: mid, fill: "-1", pointRadius: 0 },
      { label: "Median", data: pad(p50, s0), borderColor: acc, borderWidth: 2, pointRadius: 0 },
    ];
    if ($("showPaths").checked) m.samplePaths.forEach((p) => ds.push({ label: "path", data: pad(p, s0), borderColor: muted, borderWidth: 0.6, pointRadius: 0, _path: true }));
    drawChart("fan", { type: "line", data: { labels, datasets: ds },
      options: baseOpts({ plugins: { legend: { display: false }, tooltip: { mode: "index", intersect: false, filter: (i) => !i.dataset._path && i.raw != null,
        callbacks: { label: (c) => `${c.dataset.label}: ${bond ? nf(2).format(c.raw) + "%" : fmtNum(c.raw)}` } } },
        scales: { x: { ticks: { maxTicksLimit: 6, color: muted }, grid: { display: false } }, y: { ticks: { color: muted, callback: (v) => (bond ? v + "%" : fmtNum(v)) }, grid: { color: grid } } } }) });

    $("histTitle").textContent = `Histogram ${bond ? "harga obligasi" : "harga"} akhir horizon · ${m.label}`;
    const ref = bond ? res.p0 : res.s0;
    drawChart("hist", { type: "bar", data: { labels: m.hist.edges.map((v) => fmtNum(v)), datasets: [{ data: m.hist.counts, backgroundColor: m.hist.edges.map((v) => (v < ref ? css("--bad") : acc)), borderWidth: 0, barPercentage: 1, categoryPercentage: 1 }] },
      options: baseOpts({ plugins: { legend: { display: false }, tooltip: { callbacks: { title: (c) => "≈ " + c[0].label, label: (c) => c.raw + " path" } } },
        scales: { x: { ticks: { maxTicksLimit: 6, color: muted }, grid: { display: false } }, y: { display: false } } }) });
    if (!bond) renderPred();
  }

  // ---------- prediksi per periode ----------
  function renderPred() {
    const { res, data: d } = state, m = res.models[state.sel], days = m.fan[0].length, crypto = res.ppy === 365;
    const cps = (crypto ? [[1, "1 hari"], [7, "1 minggu"], [14, "2 minggu"], [30, "1 bulan"], [90, "3 bulan"], [180, "6 bulan"], [365, "1 tahun"]]
      : [[1, "1 hari"], [5, "1 minggu"], [10, "2 minggu"], [21, "1 bulan"], [63, "3 bulan"], [126, "6 bulan"], [252, "1 tahun"]]).filter(([t]) => t < days);
    cps.push([days, `${days} ${crypto ? "hari" : "hari bursa"} (akhir)`]);
    const fd = futureDates(d.dates[d.dates.length - 1], days, res.ppy);
    const s0 = res.s0;
    const rows = cps.map(([t, lbl]) => { const i = t - 1, md = m.fan[3][i], lo = m.fan[1][i], hi = m.fan[5][i];
      return `<tr><td>${lbl}<div class="sub-d">${fd[i]}</div></td><td>${fmtNum(md)}</td><td class="${cls(md / s0 - 1)}">${spct(md / s0 - 1)}</td><td>${fmtNum(lo)} – ${fmtNum(hi)}</td><td><span class="neg">${spct(lo / s0 - 1, 0)}</span> / <span class="pos">${spct(hi / s0 - 1, 0)}</span></td><td>${pct(m.probUp[i], 0)}</td></tr>`; });
    $("predTable").innerHTML = `<thead><tr><th>Periode</th><th>Median</th><th>%</th><th>Rentang 80%</th><th>% bawah / atas</th><th>Peluang naik</th></tr></thead><tbody>${rows.join("")}</tbody>`;
  }

  // ---------- rencana lot ----------
  function setPlanDefaults() {
    const idx = isIdx(), crypto = isCrypto();
    $("pEntry").value = state.res.s0 ? +(idx ? MCEngine.roundTick(state.res.s0, true, 0) : state.res.s0.toPrecision(6)) : "";
    $("pLotsLbl").textContent = idx ? "Jumlah lot" : "Jumlah (unit)";
    $("pUnitLbl").textContent = idx ? "Lembar per lot" : "Unit per lot";
    $("pUnit").value = idx ? 100 : 1;
    $("pLots").value = idx ? 10 : crypto ? 0.01 : 10;
    $("pLots").step = idx ? 1 : "any";
    $("pFeeB").value = idx ? 0.15 : 0.1; $("pFeeS").value = idx ? 0.25 : 0.1;
    state.planMode = "auto"; syncPlanSeg(); renderPlanInputs(null);
  }
  function syncPlanSeg() { document.querySelectorAll("#pModeSeg .seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.pm === state.planMode)); }
  function renderPlanInputs(pr) {
    const ro = state.planMode === "auto" ? "readonly" : "";
    const t = pr ? pr.targets : [0, 1, 2].map(() => ({ price: "", lots: "" }));
    while (t.length < 3) t.push({ price: "", lots: "" });
    const stopP = pr && pr.stop ? pr.stop.price : "";
    const step = isIdx() ? 1 : "any";
    $("planInput").innerHTML = `<thead><tr><th></th><th>Harga</th><th>${isIdx() ? "Lot" : "Unit"}</th></tr></thead><tbody>` +
      t.slice(0, 3).map((x, i) => `<tr><td>Target ${i + 1}</td><td><input type="number" step="any" data-k="tp${i}" value="${x.price === "" ? "" : +x.price}" ${ro}></td><td><input type="number" step="${step}" data-k="tl${i}" value="${x.lots === "" ? "" : +(+x.lots).toPrecision(6)}" ${ro}></td></tr>`).join("") +
      `<tr><td>Stop loss</td><td><input type="number" step="any" data-k="sl" value="${stopP === "" ? "" : +stopP}" ${ro}></td><td class="note">semua sisa</td></tr></tbody>`;
  }
  async function runPlan() {
    if (!state.res || state.res.mode !== "price") return;
    const entry = parseFloat($("pEntry").value) || state.res.s0;
    const cfg = { model: state.sel, entry, lots: parseFloat($("pLots").value) || 0, unitPerLot: parseFloat($("pUnit").value) || 1,
      feeBuy: (parseFloat($("pFeeB").value) || 0) / 100, feeSell: (parseFloat($("pFeeS").value) || 0) / 100, isIdx: isIdx(), auto: state.planMode === "auto" };
    if (!cfg.auto) {
      const g = (k) => parseFloat(document.querySelector(`#planInput [data-k="${k}"]`)?.value);
      cfg.targets = [0, 1, 2].map((i) => ({ price: g("tp" + i), lots: g("tl" + i) })).filter((x) => isFinite(x.price) && isFinite(x.lots));
      const sl = g("sl"); cfg.stop = isFinite(sl) && sl > 0 ? sl : null;
      const sum = cfg.targets.reduce((s, x) => s + x.lots, 0);
      if (sum > cfg.lots + 1e-9) { $("planOut").innerHTML = `<p class="status err">Total lot di target (${fmtNum(sum)}) melebihi jumlah yang kamu pegang (${fmtNum(cfg.lots)}).</p>`; return; }
    }
    if (cfg.lots <= 0) { $("planOut").innerHTML = `<p class="status err">Isi jumlah ${isIdx() ? "lot" : "unit"} dulu.</p>`; return; }
    $("planOut").innerHTML = `<p class="status">Menghitung rencana di ${nf(0).format(Math.min(state.cfg.sims, 2e6 / state.cfg.days))} path…</p>`;
    try { const pr = await compute("plan", cfg); state.planRes = { pr, cfg }; if (cfg.auto) renderPlanInputs(pr); renderPlan(); }
    catch (e) { $("planOut").innerHTML = `<p class="status err">${esc(e.message)}</p>`; }
  }
  function renderPlan() {
    const { pr, cfg } = state.planRes, u = isIdx() ? "lot" : "unit", m = state.res.models[cfg.model];
    const rows = [];
    if (pr.stop) rows.push(`<tr><td>Stop loss</td><td>${fmtNum(pr.stop.price)}</td><td class="neg">${spct(pr.stop.pctFromEntry)}</td><td>semua sisa</td><td>${pct(pr.stop.prob, 0)}</td><td>${isFinite(pr.stop.medDay) ? nf(0).format(pr.stop.medDay) : "–"}</td><td class="neg">${money(pr.stop.pnl)}</td></tr>`);
    pr.targets.forEach((t, i) => rows.push(`<tr><td>Target ${i + 1}</td><td>${fmtNum(t.price)}</td><td class="${cls(t.pctFromEntry)}">${spct(t.pctFromEntry)}</td><td>${isIdx() ? nf(0).format(t.lots) : fmtNum(t.lots)} ${u}</td><td>${pct(t.prob, 0)}</td><td>${isFinite(t.medDay) ? nf(0).format(t.medDay) : "–"}</td><td class="${cls(t.pnl)}">${money(t.pnl)}</td></tr>`));
    const P = pr.plan, H = pr.hold;
    const cmpRow = (lbl, f, d) => `<tr><td>${lbl}</td><td class="${d ? cls(f(P)) : ""}">${d ? money(f(P)) : pct(f(P), 0)}</td><td class="${d ? cls(f(H)) : ""}">${d ? money(f(H)) : pct(f(H), 0)}</td></tr>`;
    const better = P.probProfit > H.probProfit && P.mean < H.mean ? "Rencana ini <b>menaikkan peluang untung</b> tapi <b>menurunkan rata-rata hasil</b>: kamu menukar potensi naik besar dengan kepastian lebih tinggi."
      : P.mean >= H.mean && P.probProfit >= H.probProfit ? "Di simulasi ini rencana unggul di peluang untung dan rata-rata hasil. Ingat: ini bergantung pada model yang dipilih."
      : P.p5 > H.p5 ? "Rencana ini terutama <b>membatasi kerugian terburuk</b> (P5 lebih baik) dengan mengorbankan sebagian potensi naik."
      : "Rencana ini tidak lebih baik dari sekadar menahan posisi di simulasi ini. Coba geser target atau stop loss.";
    $("planOut").innerHTML = `
      <div class="subh">Level jual · model ${esc(m.label)} · harga beli ${fmtNum(cfg.entry)} · modal ${money(pr.cost)}</div>
      <div class="table-wrap"><table><thead><tr><th>Level</th><th>Harga</th><th>% dari beli</th><th>Jual</th><th>Peluang tersentuh</th><th>Hari ke- (median)</th><th>Laba/rugi bersih</th></tr></thead><tbody>${rows.join("")}</tbody></table></div>
      <div class="subh">Hasil di akhir horizon (${state.cfg.days} periode, ${nf(0).format(pr.nPaths)} simulasi)</div>
      <div class="table-wrap"><table><thead><tr><th></th><th>Ikuti rencana</th><th>Tahan semua</th></tr></thead><tbody>
        ${cmpRow("Peluang untung", (x) => x.probProfit)}${cmpRow("Rata-rata laba/rugi", (x) => x.mean, 1)}${cmpRow("Median", (x) => x.median, 1)}
        ${cmpRow("Skenario buruk (P5)", (x) => x.p5, 1)}${cmpRow("Skenario bagus (P95)", (x) => x.p95, 1)}</tbody></table></div>
      <div class="verdict">${better} Rata-rata ${nf(isIdx() ? 1 : 4).format(pr.unsoldAvg)} ${u} masih belum terjual di akhir horizon.</div>
      <div class="subh">Peluang harga tersentuh dalam ${state.cfg.days} periode (dari harga sekarang ${fmtNum(pr.s0)})</div>
      <div class="table-wrap"><table><thead><tr><th>Perubahan</th><th>Harga</th><th>Pernah tersentuh</th><th>Ditutup ${"di luar"} level di akhir</th></tr></thead><tbody>
        ${pr.grid.slice().reverse().map((g) => `<tr><td class="${cls(g.pct)}">${spct(g.pct, 1)}</td><td>${fmtNum(g.price)}</td><td>${pct(g.touch, 0)}</td><td>${pct(g.end, 0)}</td></tr>`).join("")}</tbody></table></div>
      <p class="note">“Ditutup di luar level” = harga akhir masih di atas level (untuk level naik) atau di bawah level (untuk level turun). Selisih dengan “pernah tersentuh” = peluang harga sempat ke sana lalu balik.</p>`;
  }

  // ---------- perbandingan ----------
  function defaultBench() {
    const s = state.data.symbol;
    if (/\.JK$/i.test(s)) return ["^JKSE", "^JKLQ45"];
    if (s === "^JKSE") return ["^GSPC", "IDR=X"];
    if (isCrypto()) return ["^GSPC", "GC=F"];
    return s === "^GSPC" ? ["^IXIC", "GC=F"] : ["^GSPC"];
  }
  function setCmpDefaults() {
    $("cmpQ").value = defaultBench().join(", ");
    const quick = [["^JKSE", "IHSG"], ["^JKLQ45", "LQ45"], ["^GSPC", "S&P 500"], ["GC=F", "Emas"], ["BTC-USD", "Bitcoin"], ["IDR=X", "USD/IDR"]].filter(([s]) => s !== state.data.symbol);
    $("cmpChips").innerHTML = quick.map(([s, n]) => `<button class="chip" data-s="${esc(s)}">+ ${esc(n)}</button>`).join("");
  }
  async function runCompare() {
    if (!state.res || state.res.mode !== "price" || state.csv) { if (state.csv) $("cmpStatus").textContent = "Perbandingan butuh data dari Yahoo (tidak tersedia untuk CSV)."; return; }
    const syms = $("cmpQ").value.split(",").map((s) => s.trim().toUpperCase()).filter((s) => s && s !== state.data.symbol).slice(0, 4);
    if (!syms.length) { $("cmpOut").hidden = true; $("cmpStatus").textContent = "Isi minimal satu ticker pembanding."; return; }
    $("cmpRun").disabled = true; $("cmpStatus").classList.remove("err");
    $("cmpStatus").textContent = "Mengambil data pembanding…";
    try {
      const range = $("range").value, got = [], failed = [];
      await Promise.all(syms.map(async (s) => { try { got.push([syms.indexOf(s), await fetchSymbol(s, range)]); } catch { failed.push(s); } }));
      got.sort((a, b) => a[0] - b[0]);
      const others = got.map((x) => x[1]).filter((s) => s.symbol !== state.data.symbol);
      if (!others.length) throw new Error("Semua ticker pembanding gagal dimuat: " + failed.join(", "));
      const series = [state.data, ...others];
      let benchIdx = series.findIndex((s, i) => i > 0 && s.symbol.startsWith("^")); if (benchIdx < 0) benchIdx = 1;
      const c = state.cfg;
      const res = await compute("compare", { series: series.map((s) => ({ dates: s.dates, values: s.values, type: s.type })), benchIdx,
        sim: { days: c.days, sims: 5000, models: c.models, drift: c.drift, customDrift: c.customDrift } }, (msg) => ($("cmpStatus").textContent = msg));
      state.cmp = { series, benchIdx, res };
      $("cmpStatus").textContent = failed.length ? `Gagal dimuat: ${failed.join(", ")}` : "";
      renderCompare();
      renderQuant(); if (state.newsFor !== state.data.symbol) { state.newsFor = state.data.symbol; runNews(); } else if (state.news) { scoreNews(); renderNews(); }
      if (state.val && state.val.v && state.risk && !state.valBetaSet) { state.valBetaSet = true; buildValDefaults(state.fund); renderValInputs(); computeValuation(); }
    } catch (e) { $("cmpStatus").textContent = e.message; $("cmpStatus").classList.add("err"); if (state.newsFor !== state.data.symbol) { state.newsFor = state.data.symbol; runNews(); } }
    finally { $("cmpRun").disabled = false; }
  }
  function renderCompare() {
    if (!state.cmp) return;
    const { series, benchIdx, res } = state.cmp, grid = css("--line"), muted = css("--muted");
    $("cmpOut").hidden = false;
    // grafik dirascale ke 100, 1 tahun terakhir, forward-fill tanggal libur yang berbeda
    const end = state.data.dates[state.data.dates.length - 1], st = new Date(end); st.setDate(st.getDate() - 365);
    const from = st.toISOString().slice(0, 10);
    const all = [...new Set(series.flatMap((s) => s.dates.filter((d) => d >= from && d <= end)))].sort();
    const ff = series.map((s) => { const mp = new Map(s.dates.map((d, i) => [d, s.values[i]])); let last = null;
      let j = s.dates.findIndex((d) => d >= from); if (j > 0) last = s.values[j - 1];
      return all.map((d) => (mp.has(d) ? (last = mp.get(d)) : last)); });
    const i0 = all.findIndex((_, i) => ff.every((a) => a[i] != null));
    const labels = all.slice(Math.max(0, i0));
    const ds = series.map((s, k) => ({ label: s.symbol, data: ff[k].slice(Math.max(0, i0)).map((v) => (v / ff[k][i0]) * 100), borderColor: COLORS[k % COLORS.length], borderWidth: k === 0 ? 2.2 : 1.4, pointRadius: 0 }));
    drawChart("cmpChart", { type: "line", data: { labels, datasets: ds }, options: baseOpts({ plugins: { legend: { labels: { color: muted, boxWidth: 10, font: { size: 11 } } },
      tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${nf(1).format(c.raw)}` } } },
      scales: { x: { ticks: { maxTicksLimit: 6, color: muted }, grid: { display: false } }, y: { ticks: { color: muted }, grid: { color: grid } } } }) });
    const mk = state.sel, bench = series[benchIdx].symbol;
    const st0 = res.stats, sm = res.sims;
    const pick = (i) => sm[i].models[mk] || Object.values(sm[i].models)[0];
    const rows = [
      ["Harga terakhir", (i) => fmtNum(series[i].values[series[i].values.length - 1])],
      ["Return 1 bulan", (i) => `<span class="${cls(st0[i].ret1m)}">${spct(st0[i].ret1m)}</span>`],
      ["Return 3 bulan", (i) => `<span class="${cls(st0[i].ret3m)}">${spct(st0[i].ret3m)}</span>`],
      ["Return 1 tahun", (i) => `<span class="${cls(st0[i].ret1y)}">${spct(st0[i].ret1y)}</span>`],
      ["Return 3 tahun", (i) => `<span class="${cls(st0[i].ret3y)}">${spct(st0[i].ret3y)}</span>`],
      ["Volatilitas/tahun", (i) => pct(st0[i].volAnn)],
      ["Max drawdown 3T", (i) => pct(st0[i].maxDD)],
      [`Beta vs ${bench}`, (i) => (isFinite(st0[i].beta) ? nf(2).format(st0[i].beta) : "–")],
      [`Korelasi vs ${bench}`, (i) => (isFinite(st0[i].corr) ? nf(2).format(st0[i].corr) : "–")],
      [`Proyeksi median (${state.cfg.days}p)`, (i) => { const s = pick(i).summary; const v = s.q[3] / sm[i].s0 - 1; return `<span class="${cls(v)}">${spct(v)}</span>`; }],
      ["Proyeksi P5 / P95", (i) => { const s = pick(i).summary; return `<span class="neg">${spct(s.q[0] / sm[i].s0 - 1, 0)}</span> / <span class="pos">${spct(s.q[6] / sm[i].s0 - 1, 0)}</span>`; }],
      ["Peluang naik", (i) => pct(pick(i).probUp, 0)],
      ["VaR 95%", (i) => pct(pick(i).summary.var95)],
    ];
    $("cmpTable").innerHTML = `<thead><tr><th></th>${series.map((s, i) => `<th style="color:${COLORS[i % COLORS.length]}">${esc(s.symbol)}</th>`).join("")}</tr></thead><tbody>` +
      rows.map(([n, f]) => `<tr><td>${n}</td>${series.map((_, i) => `<td>${f(i)}</td>`).join("")}</tr>`).join("") + "</tbody>";
    const me = st0[0], b = st0[benchIdx];
    const txt = [];
    if (isFinite(me.beta)) txt.push(me.beta > 1.15 ? `lebih agresif dari ${bench} (beta ${nf(2).format(me.beta)})` : me.beta < 0.85 ? `lebih tenang dari ${bench} (beta ${nf(2).format(me.beta)})` : `bergerak kurang lebih sebesar ${bench}`);
    if (isFinite(me.corr)) txt.push(me.corr > 0.7 ? "sangat searah dengan indeks" : me.corr > 0.4 ? "cukup searah dengan indeks" : "cukup independen dari indeks (bagus untuk diversifikasi)");
    if (isFinite(me.ret1y) && isFinite(b.ret1y)) txt.push(me.ret1y > b.ret1y ? `mengungguli ${bench} setahun terakhir (${spct(me.ret1y)} vs ${spct(b.ret1y)})` : `tertinggal dari ${bench} setahun terakhir (${spct(me.ret1y)} vs ${spct(b.ret1y)})`);
    $("cmpStatus").innerHTML = (state.cmp && txt.length ? `<b>${esc(series[0].symbol)}</b> ${txt.join("; ")}. ` : "") + ($("cmpStatus").dataset.fail || "");
  }

  // ---------- candlestick ----------
  function aggregate(ohlc, tf) {
    if (tf === "D") return ohlc;
    const key = (d) => { if (tf === "M") return d.slice(0, 7); const t = new Date(d + "T00:00:00Z"); const wd = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - wd); return t.toISOString().slice(0, 10); };
    const out = []; let cur = null, k = null;
    for (const r of ohlc) { const kk = key(r[0]);
      if (kk !== k) { if (cur) out.push(cur); k = kk; cur = [r[0], r[1], r[2], r[3], r[4], r[5]]; }
      else { cur[2] = Math.max(cur[2], r[2]); cur[3] = Math.min(cur[3], r[3]); cur[4] = r[4]; cur[5] += r[5]; } }
    if (cur) out.push(cur);
    return out;
  }
  const sma = (a, n) => a.map((_, i) => (i < n - 1 ? null : a.slice(i - n + 1, i + 1).reduce((s, v) => s + v, 0) / n));
  function rsi(c, n = 14) {
    const out = new Array(c.length).fill(null); let g = 0, l = 0;
    for (let i = 1; i < c.length; i++) { const d = c[i] - c[i - 1], up = Math.max(d, 0), dn = Math.max(-d, 0);
      if (i <= n) { g += up; l += dn; if (i === n) { g /= n; l /= n; out[i] = 100 - 100 / (1 + g / (l || 1e-12)); } }
      else { g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n; out[i] = 100 - 100 / (1 + g / (l || 1e-12)); } }
    return out;
  }
  function renderCandle() {
    const d = state.data;
    if (!d.ohlc || d.ohlc.length <= 30 || typeof LightweightCharts === "undefined") { $("candleCard").hidden = true; return; }
    if (state.lw) { state.lw.main.remove(); state.lw.rsi.remove(); state.lw = null; }
    const bars = aggregate(d.ohlc, state.tf), closes = bars.map((b) => b[4]);
    const show = new Set([...document.querySelectorAll("#indChecks input:checked")].map((x) => x.value));
    const ink = css("--ink"), muted = css("--muted"), line = css("--line"), card = css("--card"), up = css("--good"), dn = css("--bad");
    const opts = (h) => ({ height: h, layout: { background: { color: card }, textColor: muted, fontFamily: "IBM Plex Mono, monospace", fontSize: 11 },
      grid: { vertLines: { color: line }, horzLines: { color: line } }, rightPriceScale: { borderColor: line }, timeScale: { borderColor: line },
      crosshair: { mode: 0 }, localization: { priceFormatter: (p) => fmtNum(p), locale: "id-ID" } });
    const el = $("candle"), main = LightweightCharts.createChart(el, { ...opts(el.clientHeight), width: el.clientWidth });
    const cs = main.addCandlestickSeries({ upColor: up, downColor: dn, borderUpColor: up, borderDownColor: dn, wickUpColor: up, wickDownColor: dn });
    cs.setData(bars.map((b) => ({ time: b[0], open: b[1], high: b[2], low: b[3], close: b[4] })));
    const lineSer = (vals, color, w = 1.5, style = 0) => { const s = main.addLineSeries({ color, lineWidth: w, lineStyle: style, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      s.setData(bars.map((b, i) => (vals[i] == null ? { time: b[0] } : { time: b[0], value: vals[i] }))); return s; };
    const m20 = sma(closes, 20), m50 = sma(closes, 50);
    if (show.has("ma20")) lineSer(m20, "#1f5eff");
    if (show.has("ma50")) lineSer(m50, "#b86e00");
    if (show.has("bb")) { const sd = closes.map((_, i) => (i < 19 ? null : Math.sqrt(closes.slice(i - 19, i + 1).reduce((s, v) => s + (v - m20[i]) ** 2, 0) / 20)));
      lineSer(m20.map((v, i) => (v == null ? null : v + 2 * sd[i])), "#8b3fd9", 1, 2); lineSer(m20.map((v, i) => (v == null ? null : v - 2 * sd[i])), "#8b3fd9", 1, 2); }
    if (show.has("vol")) { const vs = main.addHistogramSeries({ priceFormat: { type: "volume" }, priceScaleId: "vol", lastValueVisible: false, priceLineVisible: false });
      main.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      vs.setData(bars.map((b) => ({ time: b[0], value: b[5], color: b[4] >= b[1] ? up + "66" : dn + "66" }))); }
    main.priceScale("right").applyOptions({ scaleMargins: { top: 0.08, bottom: show.has("vol") ? 0.22 : 0.08 } });

    const rWrap = $("rsiWrap"); rWrap.hidden = !show.has("rsi");
    const rel = $("rsi"), rchart = LightweightCharts.createChart(rel, { ...opts(rel.clientHeight || 110), width: rel.clientWidth || el.clientWidth, timeScale: { visible: false, borderColor: line } });
    const rv = rsi(closes), rs = rchart.addLineSeries({ color: ink, lineWidth: 1.4, priceLineVisible: false });
    rs.setData(bars.map((b, i) => (rv[i] == null ? { time: b[0] } : { time: b[0], value: rv[i] })));
    rs.createPriceLine({ price: 70, color: dn, lineStyle: 2, lineWidth: 1, axisLabelVisible: false });
    rs.createPriceLine({ price: 30, color: up, lineStyle: 2, lineWidth: 1, axisLabelVisible: false });
    rchart.priceScale("right").applyOptions({ autoScale: false, scaleMargins: { top: 0.1, bottom: 0.1 } });
    main.timeScale().subscribeVisibleLogicalRangeChange((r) => r && rchart.timeScale().setVisibleLogicalRange(r));
    state.lw = { main, rsi: rchart, cs };

    // rentang tampilan
    const lastT = bars[bars.length - 1][0];
    if (state.rg > 0) { const f = new Date(lastT); f.setDate(f.getDate() - state.rg); main.timeScale().setVisibleRange({ from: f.toISOString().slice(0, 10), to: lastT }); }
    else main.timeScale().fitContent();

    const legend = (b, i) => { if (!b) return; const prev = i > 0 ? bars[i - 1][4] : b[1], ch = b[4] / prev - 1;
      $("ohlcLegend").innerHTML = `${b[0]} · O ${fmtNum(b[1])} · H ${fmtNum(b[2])} · L ${fmtNum(b[3])} · C <span class="${cls(ch)}">${fmtNum(b[4])} (${spct(ch, 2)})</span> · Vol ${nf(0).format(b[5])}${rv[i] != null ? ` · RSI ${nf(0).format(rv[i])}` : ""}`; };
    const idxOf = new Map(bars.map((b, i) => [b[0], i]));
    legend(bars[bars.length - 1], bars.length - 1);
    main.subscribeCrosshairMove((p) => { if (!p.time) return legend(bars[bars.length - 1], bars.length - 1);
      const t = typeof p.time === "string" ? p.time : `${p.time.year}-${String(p.time.month).padStart(2, "0")}-${String(p.time.day).padStart(2, "0")}`;
      const i = idxOf.get(t); if (i != null) legend(bars[i], i); });

    // statistik teknikal (selalu dari data harian)
    const dO = d.ohlc, dc = dO.map((b) => b[4]), last = dc[dc.length - 1];
    const yr = dO.slice(-252), hi52 = Math.max(...yr.map((b) => b[2])), lo52 = Math.min(...yr.map((b) => b[3]));
    const d20 = sma(dc, 20), d50 = sma(dc, 50), d200 = sma(dc, 200), dr = rsi(dc);
    const ma20 = d20[d20.length - 1], ma50 = d50[d50.length - 1], ma200 = d200[d200.length - 1], r = dr[dr.length - 1];
    const vol20 = dO.slice(-20).reduce((s, b) => s + b[5], 0) / 20, volT = dO[dO.length - 1][5];
    const chg = (n) => (dc.length > n ? last / dc[dc.length - 1 - n] - 1 : NaN);
    $("techStats").innerHTML = [["Hari ini", `<span class="${cls(chg(1))}">${spct(chg(1), 2)}</span>`], ["1 minggu", `<span class="${cls(chg(5))}">${spct(chg(5))}</span>`],
      ["Tertinggi 52 mg", fmtNum(hi52)], ["Terendah 52 mg", fmtNum(lo52)], ["Dari puncak 52 mg", `<span class="${cls(last / hi52 - 1)}">${spct(last / hi52 - 1)}</span>`],
      ["MA20 / MA50", `${fmtNum(ma20)} / ${ma50 != null ? fmtNum(ma50) : "–"}`], ["RSI 14", r != null ? nf(0).format(r) : "–"], ["Volume vs rata-rata 20h", isFinite(volT / vol20) && vol20 > 0 ? nf(1).format(volT / vol20) + "×" : "–"]]
      .map(([a, b]) => `<div>${a}<b>${b}</b></div>`).join("");
    const t = [];
    if (ma20 && ma50) t.push(last > ma20 && ma20 > ma50 ? "Harga di atas MA20 dan MA50 dengan MA20 > MA50: <b>tren jangka pendek naik</b>." :
      last < ma20 && ma20 < ma50 ? "Harga di bawah MA20 dan MA50 dengan MA20 < MA50: <b>tren jangka pendek turun</b>." : "MA20 dan MA50 belum searah: <b>tren belum jelas / sideways</b>.");
    if (ma200) t.push(last > ma200 ? "Harga di atas MA200 (tren jangka panjang masih positif)." : "Harga di bawah MA200 (tren jangka panjang masih negatif).");
    if (r != null) t.push(r > 70 ? `RSI ${nf(0).format(r)}: jenuh beli, kenaikan sudah cepat.` : r < 30 ? `RSI ${nf(0).format(r)}: jenuh jual, penurunan sudah cepat.` : `RSI ${nf(0).format(r)}: netral.`);
    if (vol20 > 0 && volT / vol20 > 2) t.push("Volume hari terakhir lebih dari 2× rata-rata: ada minat besar / berita.");
    $("techText").innerHTML = t.join(" ") + ' <span class="note">Ringkasan ini deskriptif, bukan sinyal beli/jual.</span>';
  }

  // ---------- tabel ringkasan, keyakinan, parameter, batasan ----------
  function renderSummary() {
    const { res } = state, keys = Object.keys(res.models), M = res.models;
    const head = `<thead><tr><th></th>${keys.map((k) => `<th>${esc(M[k].label)}</th>`).join("")}</tr></thead>`;
    let rows;
    if (res.mode === "bond") {
      rows = [["Yield P5", (m) => pct(m.yq[0], 2)], ["Yield median", (m) => pct(m.yq[3], 2)], ["Yield P95", (m) => pct(m.yq[6], 2)],
        ["Harga P5", (m) => fmtNum(m.pq[0])], ["Harga median", (m) => fmtNum(m.pq[3])], ["Harga P95", (m) => fmtNum(m.pq[6])],
        ["Total return median", (m) => pct(m.trMedian, 2)], ["Prob. rugi (incl. kupon)", (m) => pct(m.probLoss)], ["VaR 95% (total return)", (m) => pct(m.var95, 2)], ["Prob. yield < 0", (m) => pct(m.negProb)]];
    } else {
      const s0 = res.s0, pc = (v) => `${fmtNum(v)} <span class="${cls(v / s0 - 1)} small">(${spct(v / s0 - 1, 0)})</span>`;
      rows = [["P5 (pesimis)", (m) => pc(m.summary.q[0])], ["P25", (m) => pc(m.summary.q[2])], ["Median", (m) => pc(m.summary.q[3])], ["P75", (m) => pc(m.summary.q[4])],
        ["P95 (optimis)", (m) => pc(m.summary.q[6])], ["Prob. turun", (m) => pct(m.summary.probDown)], ["Prob. turun > 10%", (m) => pct(m.summary.probDown10)],
        ["Prob. naik > 10%", (m) => pct(m.summary.probUp10)], ["VaR 95%", (m) => pct(m.summary.var95)], ["CVaR 95%", (m) => pct(m.summary.cvar95)], ["VaR 99%", (m) => pct(m.summary.var99)]];
    }
    $("sumTable").innerHTML = head + "<tbody>" + rows.map(([n, f]) => `<tr><td>${n}</td>${keys.map((k) => `<td>${f(M[k])}</td>`).join("")}</tr>`).join("") + "</tbody>";
  }

  function renderConfidence() {
    const { res, cfg } = state, entries = Object.entries(res.models).filter(([, m]) => m.backtest);
    $("confCard").hidden = !entries.length;
    if (!entries.length) return;
    const best = pickBest(res), bm = res.models[best], b = bm.backtest, c90 = b.cov.find((c) => c.nominal === 0.9);
    const unit = res.mode === "bond" ? "yield" : "harga";
    $("confLead").innerHTML = `Model paling terkalibrasi: <b>${esc(bm.label)}</b> (<span class="g-${b.grade}">${b.grade}</span>). Di ${b.n} titik uji historis, rentang 90%-nya memuat ${unit} aktual <b>${pct(c90.actual, 0)}</b> kali (target 90%). ` +
      (c90.actual < 0.82 ? "Rentangnya terlalu sempit — risiko nyata lebih besar dari yang ditunjukkan." : c90.actual > 0.97 ? "Rentangnya terlalu lebar — model terlalu berhati-hati." : "Lebar rentangnya wajar.");
    const head = `<thead><tr><th>Model</th><th>50%</th><th>80%</th><th>90%</th><th>95%</th><th>Tembus P5</th><th>Bias</th>${res.mode === "price" ? "<th>VaR 1h</th><th>Kupiec p</th>" : ""}<th>Nilai</th></tr></thead>`;
    const body = entries.map(([k, m]) => { const t = m.backtest;
      return `<tr class="${k === best ? "best" : ""}"><td>${esc(m.label)}</td>${t.cov.map((c) => `<td>${pct(c.actual, 0)}</td>`).join("")}<td>${pct(t.breachRate, 0)}</td><td>${t.medianBias > 0 ? "+" : ""}${nf(2).format(t.medianBias)}</td>` +
        (res.mode === "price" ? `<td>${m.var1d ? pct(m.var1d.rate) : "–"}</td><td>${m.var1d ? nf(2).format(m.var1d.p) : "–"}</td>` : "") + `<td class="g-${t.grade}">${t.grade}</td></tr>`; }).join("");
    $("confTable").innerHTML = head + "<tbody>" + body + "</tbody>";
    const grid = css("--line"), muted = css("--muted");
    drawChart("calib", { type: "bar", data: { labels: ["50%", "80%", "90%", "95%"], datasets: [
      { label: "Target", data: [50, 80, 90, 95], backgroundColor: grid, borderWidth: 0 },
      ...entries.map(([, m], i) => ({ label: m.label, data: m.backtest.cov.map((c) => c.actual * 100), backgroundColor: COLORS[i % COLORS.length], borderWidth: 0 })) ] },
      options: baseOpts({ plugins: { legend: { labels: { color: muted, boxWidth: 10, font: { size: 11 } } }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${nf(0).format(c.raw)}%` } } },
        scales: { x: { ticks: { color: muted }, grid: { display: false }, title: { display: true, text: "Rentang kepercayaan (target)", color: muted } }, y: { min: 0, max: 100, ticks: { color: muted, callback: (v) => v + "%" }, grid: { color: grid } } } }) });
    $("confNote").innerHTML = `<b>Cara baca:</b> model di-fit ulang hanya dengan data sebelum tiap titik uji, lalu dicek apakah ${unit} ${cfg.days} periode kemudian jatuh di dalam rentang. ` +
      `Batang model idealnya setinggi batang abu-abu (target). Kolom “Tembus P5” idealnya ≈ 5%. Bias > 0 = nilai aktual cenderung di atas median model, < 0 = di bawahnya. ` +
      `Nilai: <span class="g-Baik">Baik</span> (selisih rata-rata < 5 poin), <span class="g-Cukup">Cukup</span> (< 10), <span class="g-Buruk">Buruk</span>. ` +
      `Karena jendela ${cfg.days} periode saling tumpang tindih, sampel independen efektifnya hanya ≈ ${b.effN} — anggap angka ini indikasi, bukan bukti.` +
      (res.mode === "price" ? " VaR 1h: backtest VaR harian 95% selama 250 hari terakhir (ideal 5%, Kupiec p > 0,05 = lolos)." : "");
  }

  function renderParams() {
    const fmtP = (k, v) => (/vol|theta|sigma$|Rata-rata jump|Std jump/i.test(k) && Math.abs(v) < 5 ? pct(v, 2) : nf(Math.abs(v) >= 100 ? 0 : 3).format(v));
    $("params").innerHTML = Object.values(state.res.models).map((m) => `<div class="param"><h3>${esc(m.label)}</h3>${Object.entries(m.info).map(([k, v]) => `<div><span>${esc(k)}</span><span>${fmtP(k, v)}</span></div>`).join("")}</div>`).join("");
  }

  function renderCaveats() {
    const { res, cfg } = state, L = [];
    L.push("Ini <b>distribusi kemungkinan</b>, bukan prediksi harga. Median dekat harga sekarang itu wajar, bukan kegagalan model.");
    if (res.mode === "price") {
      if (cfg.drift === "hist") L.push(`Drift historis (${pct(res.stats.retAnn)}/th) diekstrapolasi ke depan. Rata-rata return dari data beberapa tahun punya error estimasi sangat besar — hasil bisa terlalu optimis/pesimis.`);
      else if (cfg.drift === "zero") L.push("Drift diset nol: simulasi hanya mengukur <b>lebar risiko</b>, tidak berasumsi arah naik/turun. Karena itu rencana lot rata-ratanya sedikit negatif — itu biaya broker.");
      L.push("GARCH memprediksi <b>volatilitas</b>, bukan arah harga.");
      if (res.stats.exKurt > 3 && cfg.models.includes("gbm")) L.push("Data berekor gemuk (kurtosis tinggi). GBM mengasumsikan distribusi normal, jadi cenderung meremehkan crash — bandingkan dengan GARCH-t/Jump di tabel keyakinan.");
      L.push("Simulasi memakai harga <b>penutupan harian</b>. Target yang tersentuh intraday lalu turun lagi tidak terhitung, jadi peluang tersentuh sedikit lebih rendah dari kenyataan.");
      if (isIdx()) L.push("Batas auto reject (ARA/ARB) BEI, suspensi, dan likuiditas (antrean bid/offer) tidak dimodelkan. Untuk saham tidak likuid, stop loss bisa tereksekusi jauh di bawah level.");
      L.push("Indikator candlestick (MA, RSI, Bollinger) menggambarkan masa lalu; daya prediksinya lemah jika dipakai sendirian.");
      L.push("Semua model berasumsi pola historis berlanjut. Regime baru (krisis, regulasi, halving, suku bunga) tidak tertangkap.");
    } else {
      L.push("Vasicek/CIR adalah model 1 faktor: seluruh kurva yield dianggap bergerak bersama. Kalibrasi OLS cenderung melebih-lebihkan kecepatan mean-reversion, sehingga rentang jangka panjang bisa terlalu sempit.");
      L.push("Yield SBN Indonesia tidak tersedia di Yahoo Finance. Upload CSV (tanggal, yield %) dari PHEI/investing.com untuk obligasi Indonesia.");
      L.push("Harga obligasi dihitung dari yield akhir dengan sisa tenor dikurangi horizon; spread kredit & likuiditas diabaikan.");
    }
    if (res.nObs < 500) L.push(`Data hanya ${res.nObs} observasi — estimasi parameter dan backtest kurang stabil.`);
    $("caveats").innerHTML = L.map((x) => `<li>${x}</li>`).join("");
  }

  function baseOpts(extra) { return Object.assign({ responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: "index", intersect: false } }, extra); }
  function drawChart(id, cfg) { if (state.charts[id]) state.charts[id].destroy(); state.charts[id] = new Chart($(id), cfg); }

  // =====================================================================
  // ANALISIS KUANTITATIF (risk metrics, ARDL, opsi)
  // =====================================================================
  const DAMO = { erp: 0.0423, crpID: 0.0246, dsID: 0.0162, sbn10: 0.071, biRate: 0.0575, src: "Damodaran, ctryprem Jan 2026" };
  function defaultRf() { const c = (state.data && state.data.currency) || ""; return c === "IDR" ? DAMO.biRate : c === "USD" || c === "USDT" ? state.usRf ?? 0.04 : 0.04; }
  async function ensureUsRf() {
    if (state.usRf != null) return;
    try { const d = await fetchSymbol("^IRX", "1y"); state.usRf = d.values[d.values.length - 1] / 100; } catch { state.usRf = 0.04; }
  }
  function benchSeries() { if (!state.cmp) return null; return state.cmp.series[state.cmp.benchIdx]; }
  async function renderQuant() {
    const b = benchSeries(); if (!b) { $("qStatus").textContent = "Jalankan perbandingan dulu untuk menentukan benchmark."; return; }
    if (["USD", "USDT"].includes(state.data.currency)) await ensureUsRf();
    if (!$("rf").value || state.rfAuto) { $("rf").value = +(defaultRf() * 100).toFixed(2); state.rfAuto = true; }
    $("qBench").textContent = `${b.symbol} · ${b.name || ""}`;
    const rf = (parseFloat($("rf").value) || 0) / 100;
    const m = MCEngine.riskMetrics(state.data, b, rf, state.res.ppy);
    state.risk = m;
    if (!m) { $("riskTable").innerHTML = ""; $("riskText").textContent = "Data bersama dengan benchmark terlalu sedikit."; }
    else {
      const A = m.asset, B = m.bench, two = (n, fa, fb) => `<tr><td>${n}</td><td>${fa}</td><td>${fb}</td></tr>`;
      const f2 = (x) => (isFinite(x) ? nf(2).format(x) : "–");
      $("riskTable").innerHTML = `<thead><tr><th>${m.from} → ${m.to}</th><th>${esc(state.data.symbol)}</th><th>${esc(b.symbol)}</th></tr></thead><tbody>` +
        two("CAGR", `<span class="${cls(A.cagr)}">${spct(A.cagr)}</span>`, `<span class="${cls(B.cagr)}">${spct(B.cagr)}</span>`) + two("Volatilitas/th", pct(A.vol), pct(B.vol)) +
        two("Sharpe", f2(A.sharpe), f2(B.sharpe)) + two("Sortino", f2(A.sortino), f2(B.sortino)) + two("Calmar", f2(A.calmar), f2(B.calmar)) +
        two("Max drawdown", pct(A.maxDD), pct(B.maxDD)) + two("VaR 95% harian (hist.)", pct(A.var95, 2), pct(B.var95, 2)) + two("Expected shortfall 95%", pct(A.es95, 2), pct(B.es95, 2)) +
        two("Skew / kurtosis", `${f2(A.skew)} / ${nf(1).format(A.kurt)}`, `${f2(B.skew)} / ${nf(1).format(B.kurt)}`) + two("Hari naik", pct(A.hit, 0), pct(B.hit, 0)) +
        two("Beta", f2(m.beta), "1,00") + two("Alpha (Jensen)/th", `<span class="${cls(m.alpha)}">${spct(m.alpha)}</span>`, "–") + two("Tracking error", pct(m.te), "–") +
        two("Information ratio", f2(m.ir), "–") + two("Up / down capture", `${pct(m.upCap, 0)} / ${pct(m.downCap, 0)}`, "100% / 100%") +
        two("Kelly penuh (½ Kelly)", `${pct(A.kelly, 0)} (${pct(A.kelly / 2, 0)})`, `${pct(B.kelly, 0)} (${pct(B.kelly / 2, 0)})`) + "</tbody>";
      const t = [];
      t.push(A.sharpe > B.sharpe ? `Per unit risiko, ${esc(state.data.symbol)} memberi imbal hasil lebih baik dari ${esc(b.symbol)} (Sharpe ${f2(A.sharpe)} vs ${f2(B.sharpe)}).` : `Per unit risiko, ${esc(state.data.symbol)} kalah dari ${esc(b.symbol)} (Sharpe ${f2(A.sharpe)} vs ${f2(B.sharpe)}).`);
      if (isFinite(m.alpha)) t.push(m.alpha > 0 ? `Alpha positif ${spct(m.alpha)}/th setelah memperhitungkan beta ${f2(m.beta)}.` : `Alpha negatif ${spct(m.alpha)}/th: return-nya lebih rendah dari yang “wajar” untuk risiko pasarnya.`);
      if (A.sharpe < 0) t.push(`Sharpe negatif berarti dalam periode ini lebih baik menyimpan uang di instrumen bebas risiko (${pct(rf, 2)}).`);
      if (A.kelly <= 0) t.push("Kelly ≤ 0: secara historis tidak ada keunggulan untuk posisi beli.");
      $("riskText").innerHTML = t.join(" ") + ` <span class="note">Periode ${m.n} hari bersama; angka historis, bukan janji.</span>`;
    }
    runArdl(b);
    renderOptions();
  }
  async function runArdl(b) {
    $("ardlOut").innerHTML = '<p class="status">Mengestimasi ARDL…</p>';
    try {
      const r = await compute("ardl", { a: { dates: state.data.dates, values: state.data.values, symbol: state.data.symbol }, xs: [{ dates: b.dates, values: b.values, symbol: b.symbol }] });
      if (!r) { $("ardlOut").innerHTML = '<p class="note">Data mingguan bersama terlalu sedikit (butuh ≥ 80 minggu).</p>'; return; }
      const star = (p) => (p < 0.01 ? "***" : p < 0.05 ? "**" : p < 0.1 ? "*" : "");
      const tbl = (c) => `<table><thead><tr><th>Variabel</th><th>Koef.</th><th>t</th><th>p</th></tr></thead><tbody>${c.map((x) => `<tr><td>${esc(x.name)}</td><td>${nf(4).format(x.b)}<span class="stars">${star(x.p)}</span></td><td>${nf(2).format(x.t)}</td><td>${nf(3).format(x.p)}</td></tr>`).join("")}</tbody></table>`;
      const beatsHM = r.oosR2 > 0, edge = r.hit - Math.max(r.upShare, 1 - r.upShare);
      $("ardlOut").innerHTML = `
        <div class="kpis compact">
          <div class="kpi"><div class="k">Lag terpilih (AIC)</div><div class="v">ARDL(${r.p}, ${r.q})</div><div class="h">${r.N} minggu data</div></div>
          <div class="kpi"><div class="k">R² out-of-sample</div><div class="v ${cls(r.oosR2)}">${nf(3).format(r.oosR2)}</div><div class="h">${r.nOOS} ramalan mingguan</div></div>
          <div class="kpi"><div class="k">Akurasi arah</div><div class="v">${pct(r.hit, 0)}</div><div class="h">vs selalu tebak naik ${pct(r.upShare, 0)}</div></div>
          <div class="kpi"><div class="k">Ramalan minggu depan</div><div class="v ${cls(r.nextFc)}">${spct(Math.exp(r.nextFc) - 1, 2)}</div><div class="h">80%: ${spct(Math.exp(r.nextLo) - 1, 1)} s/d ${spct(Math.exp(r.nextHi) - 1, 1)}</div></div>
        </div>
        <p class="verdict">${beatsHM && edge > 0.03 ? "Model lag ini sedikit mengalahkan tebakan naif di data out-of-sample. Keunggulannya kecil dan bisa hilang; perlakukan sebagai petunjuk lemah." : "Return masa lalu (aset maupun benchmark) <b>tidak membantu meramal</b> return minggu depan secara out-of-sample. Ini konsisten dengan pasar yang cukup efisien. Rentang ramalan minggu depan jauh lebih lebar daripada nilai tengahnya."}</p>
        <div class="subh">Model penjelas (dengan return ${esc(b.symbol)} minggu yang sama) · R² ${nf(2).format(r.expl.r2)}</div>
        <div class="table-wrap">${tbl(r.expl.coef)}</div>
        <div class="subh">Model prediktif (hanya lag) · R² in-sample ${nf(3).format(r.pred.r2)}</div>
        <div class="table-wrap">${tbl(r.pred.coef)}</div>
        <p class="note">*** p&lt;0,01 · ** p&lt;0,05 · * p&lt;0,1. Galat baku OLS biasa (belum robust HAC).</p>`;
    } catch (e) { $("ardlOut").innerHTML = `<p class="status err">${esc(e.message)}</p>`; }
  }
  async function renderOptions() {
    const S = state.res.s0, idx = isIdx();
    if (!$("oK").value || state.oAuto) { $("oK").value = +(idx ? MCEngine.roundTick(S, true, 0) : +S.toPrecision(4)); $("oT").value = Math.round(state.cfg.days * (state.res.ppy === 365 ? 1 : 365 / 252)); state.oAuto = true; }
    const K = parseFloat($("oK").value), Td = parseFloat($("oT").value) || 30, T = Td / 365, r = (parseFloat($("rf").value) || 0) / 100, q = (parseFloat($("oQ").value) || 0) / 100;
    const src = $("oVolSrc").value, m = state.res.models[state.sel];
    const sig = src === "custom" ? (parseFloat($("oVol").value) || 30) / 100 : src === "hist" ? state.res.stats.volAnn : m.horizonVol;
    if (!(K > 0) || !(sig > 0)) return;
    const bs = MCEngine.blackScholes(S, K, T, r, sig, q), bn = MCEngine.binomialCRR(S, K, T, r, sig, q, 300);
    let mc = null; try { mc = await compute("probEnd", { model: state.sel, K, r, T: state.cfg.days / (state.res.ppy || 252) }); } catch { /* */ }
    const sameH = Math.abs(Td - state.cfg.days * (state.res.ppy === 365 ? 1 : 365 / 252)) < 2;
    const row = (n, c, p) => `<tr><td>${n}</td><td>${c}</td><td>${p}</td></tr>`;
    $("optOut").innerHTML = `<p class="note">S = ${fmtNum(S)} · K = ${fmtNum(K)} · T = ${Td} hari · σ = ${pct(sig, 1)} (${src === "model" ? "rata-rata vol " + esc(m.label) + " sepanjang horizon" : src === "hist" ? "historis" : "custom"}) · r = ${pct(r, 2)}</p>
      <div class="table-wrap"><table><thead><tr><th></th><th>Call</th><th>Put</th></tr></thead><tbody>
      ${row("Black-Scholes", fmtNum(bs.call), fmtNum(bs.put))}${row("Binomial Eropa (300 langkah)", fmtNum(bn.callEU), fmtNum(bn.putEU))}${row("Binomial Amerika", fmtNum(bn.callUS), fmtNum(bn.putUS))}
      ${row("Harga opsi % dari saham", pct(bs.call / S, 2), pct(bs.put / S, 2))}${row("Delta", nf(3).format(bs.deltaC), nf(3).format(bs.deltaP))}${row("Gamma", nf(5).format(bs.gamma), nf(5).format(bs.gamma))}
      ${row("Vega (per 1% vol)", fmtNum(bs.vega), fmtNum(bs.vega))}${row("Theta (per hari)", fmtNum(bs.thetaC), fmtNum(bs.thetaP))}
      ${row("Peluang berakhir ITM — risk-neutral", pct(bs.probITMcall, 0), pct(bs.probITMput, 0))}
      ${mc && sameH ? row(`Peluang berakhir ITM — simulasi ${esc(m.label)}`, pct(mc.probAbove, 0), pct(1 - mc.probAbove, 0)) + row("Nilai harapan payoff (simulasi, didiskon)", fmtNum(mc.callMC), fmtNum(mc.putMC)) : ""}
      </tbody></table></div>
      <p class="note">Breakeven call: ${fmtNum(K + bs.call)} (${spct((K + bs.call) / S - 1)}); breakeven put: ${fmtNum(K - bs.put)} (${spct((K - bs.put) / S - 1)}).${!sameH ? " Samakan jatuh tempo dengan horizon simulasi untuk melihat peluang versi simulasi." : ""}</p>`;
  }

  // =====================================================================
  // BERITA + EVENT STUDY
  // =====================================================================
  const LEX_POS = ["naik", "menguat", "melonjak", "melesat", "meroket", "terbang", "laba", "untung", "cuan", "rekor", "tumbuh", "pertumbuhan", "ekspansi", "dividen", "buyback", "borong", "akumulasi", "net buy", "akuisisi", "upgrade", "outperform", "positif", "surplus", "bullish", "rally", "hijau", "membaik", "pulih", "kontrak baru", "raih", "target harga naik", "rises", "rise", "surge", "jumps", "beats", "record", "growth", "profit", "upgrade", "buy", "strong", "gain"];
  const LEX_NEG = ["turun", "melemah", "anjlok", "ambruk", "ambles", "merosot", "terkoreksi", "koreksi", "rugi", "kerugian", "jual", "net sell", "dilepas", "lepas", "downgrade", "gagal", "kasus", "sanksi", "denda", "gugatan", "phk", "utang", "gagal bayar", "default", "suspensi", "negatif", "bearish", "merah", "tekanan", "tertekan", "penurunan", "arb", "falls", "fall", "drops", "plunge", "loss", "miss", "lawsuit", "fraud", "probe", "cut", "weak", "decline"];
  function sentiment(text) {
    const t = " " + text.toLowerCase().replace(/[^a-z0-9à-ÿ\s]/g, " ") + " ";
    let p = 0, n = 0;
    for (const w of LEX_POS) if (t.includes(" " + w + " ") || (w.length > 5 && t.includes(w))) p++;
    for (const w of LEX_NEG) if (t.includes(" " + w + " ") || (w.length > 5 && t.includes(w))) n++;
    return { score: p - n, label: p > n ? "pos" : n > p ? "neg" : "neu" };
  }
  async function runNews() {
    const d = state.data; if (!d || state.csv) return;
    const code = d.symbol.replace(/\.JK$/i, "").replace(/^\^/, "");
    const q = /\.JK$/i.test(d.symbol) ? `saham ${code}` : isCrypto() ? (d.name || code).replace(/ USD$/i, "") : (d.name || code);
    $("newsStatus").textContent = "Mengambil berita…"; $("newsList").innerHTML = ""; $("newsSummary").innerHTML = "";
    try {
      const r = await fetch(`${API}?action=news&symbol=${encodeURIComponent(d.symbol)}&q=${encodeURIComponent(q)}`);
      const j = await r.json(); state.news = (j.items || []).filter((x) => x.title);
      if (!state.news.length) { $("newsStatus").textContent = "Tidak ada berita yang ditemukan dari sumber."; return; }
      scoreNews(); renderNews();
    } catch (e) { $("newsStatus").textContent = "Gagal mengambil berita: " + e.message; }
  }
  function scoreNews() {
    const d = state.data, b = benchSeries(), idx = isIdx(), crypto = isCrypto();
    const dates = d.dates, px = d.values, n = dates.length;
    const ra = new Map(); for (let i = 1; i < n; i++) ra.set(dates[i], Math.log(px[i] / px[i - 1]));
    const rb = new Map(); if (b) for (let i = 1; i < b.dates.length; i++) rb.set(b.dates[i], Math.log(b.values[i] / b.values[i - 1]));
    // market model dari 500 hari terakhir
    const xs = [], ys = []; for (const [dt, v] of ra) if (rb.has(dt)) { xs.push(rb.get(dt)); ys.push(v); }
    const use = xs.length > 60, X = xs.slice(-500), Y = ys.slice(-500);
    let alpha = 0, beta = 0, sd;
    if (use) { const mx = MCEngine.mean(X), my = MCEngine.mean(Y); let c = 0, v = 0; for (let i = 0; i < X.length; i++) { c += (X[i] - mx) * (Y[i] - my); v += (X[i] - mx) ** 2; } beta = c / v; alpha = my - beta * mx;
      sd = MCEngine.std(Y.map((y, i) => y - alpha - beta * X[i])); } else sd = MCEngine.std(ys.slice(-500));
    const ar = (dt) => { if (!ra.has(dt)) return null; const rbv = rb.get(dt); return ra.get(dt) - (use && rbv != null ? alpha + beta * rbv : MCEngine.mean(ys)); };
    const idxOf = new Map(dates.map((x, i) => [x, i]));
    // jam tutup: IDX 16:00 WIB (UTC+7), AS 16:00 ET (≈UTC-4), kripto: tanggal UTC
    const tz = idx ? 7 : crypto ? 0 : -4, close = crypto ? 24 : 16;
    const tradeDay = (unix) => { const t = new Date((unix + tz * 3600) * 1000); let dt = t.toISOString().slice(0, 10);
      if (t.getUTCHours() >= close) { t.setUTCDate(t.getUTCDate() + 1); dt = t.toISOString().slice(0, 10); }
      let lo = 0, hi = n - 1; if (dt > dates[hi]) return null; while (lo < hi) { const m = (lo + hi) >> 1; if (dates[m] < dt) lo = m + 1; else hi = m; } return dates[lo]; };
    const dayCounts = new Map();
    state.news.forEach((it) => { it.sent = sentiment(it.title + " " + (it.summary || "")); const td = tradeDay(it.time); it.tday = td;
      if (td) { const a0 = ar(td), i0 = idxOf.get(td); let car = 0, k = 0; for (let j = i0; j <= Math.min(n - 1, i0 + 2); j++) { const a = ar(dates[j]); if (a != null) { car += a; k++; } }
        it.ar = a0; it.car = k ? car : null; it.carDays = k; it.z = a0 != null ? a0 / sd : null; dayCounts.set(td, (dayCounts.get(td) || 0) + 1); } });
    state.news.forEach((it) => (it.sameDay = it.tday ? dayCounts.get(it.tday) : 0));
    state.newsModel = { alpha, beta, sd, useBench: use, bench: b ? b.symbol : null };
  }
  function renderNews() {
    const N = state.news, M = state.newsModel, f = state.newsFilter || "all";
    const withR = N.filter((x) => x.ar != null), sig = withR.filter((x) => Math.abs(x.z) > 1.96);
    const days = [...new Map(withR.map((x) => [x.tday, x])).values()];
    const avgAbs = days.length ? MCEngine.mean(days.map((x) => Math.abs(x.ar))) : NaN, normAbs = M.sd * Math.sqrt(2 / Math.PI);
    const pos = N.filter((x) => x.sent.label === "pos").length, neg = N.filter((x) => x.sent.label === "neg").length;
    const top = days.slice().sort((a, b) => Math.abs(b.ar) - Math.abs(a.ar)).slice(0, 3);
    $("newsStatus").textContent = `${N.length} berita · ${withR.length} punya data harga · model pasar: ${M.useBench ? `alpha + ${nf(2).format(M.beta)} × ${M.bench}` : "tanpa benchmark"} · σ harian normal ${pct(M.sd, 2)}`;
    $("newsSummary").innerHTML = `<div class="kpis compact">
      <div class="kpi"><div class="k">Sentimen judul</div><div class="v"><span class="pos">${pos}+</span> / <span class="neg">${neg}−</span></div><div class="h">${N.length - pos - neg} netral</div></div>
      <div class="kpi"><div class="k">Hari dengan reaksi signifikan</div><div class="v">${new Set(sig.map((x) => x.tday)).size} / ${days.length}</div><div class="h">|reaksi| > 1,96σ</div></div>
      <div class="kpi"><div class="k">Gerak hari berita vs hari biasa</div><div class="v">${isFinite(avgAbs) ? nf(1).format(avgAbs / normAbs) + "×" : "–"}</div><div class="h">rata-rata |reaksi abnormal|</div></div></div>` +
      (top.length ? `<p class="lead small-lead">Reaksi terbesar: ${top.map((x) => `<b>${x.tday}</b> <span class="${cls(x.ar)}">${spct(x.ar, 1)}</span>`).join(" · ")}</p>` : "");
    const list = N.filter((x) => f === "all" || (f === "big" && x.z != null && Math.abs(x.z) > 1.96) || (f === "pos" && x.sent.label === "pos") || (f === "neg" && x.sent.label === "neg"));
    const fmtDate = (u) => new Date(u * 1000).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    $("newsList").innerHTML = list.slice(0, 60).map((x) => {
      const s = x.sent.label === "pos" ? '<span class="pill pos">Sentimen +</span>' : x.sent.label === "neg" ? '<span class="pill neg">Sentimen −</span>' : '<span class="pill">Netral</span>';
      const imp = x.ar == null ? '<span class="pill">Belum ada reaksi harga</span>'
        : `<span class="pill ${cls(x.ar)}">${x.ar > 0 ? "▲" : "▼"} ${spct(x.ar, 2)} hari itu</span><span class="pill ${cls(x.car)}">${spct(x.car, 2)} ${x.carDays} hari</span>${Math.abs(x.z) > 1.96 ? '<span class="pill sig">Signifikan</span>' : ""}${x.sameDay > 1 ? `<span class="pill">${x.sameDay} berita di hari itu</span>` : ""}`;
      const safe = /^https?:\/\//.test(x.link) ? x.link : "#";
      return `<div class="news"><a href="${esc(safe)}" target="_blank" rel="noopener noreferrer">${esc(x.title)}</a>
        <div class="nm">${esc(x.publisher || x.via)} · ${fmtDate(x.time)}${x.tday ? ` · hari bursa ${x.tday}` : ""}</div>
        ${x.summary ? `<div class="ns">${esc(x.summary.length > 260 ? x.summary.slice(0, 257) + "…" : x.summary)}</div>` : '<div class="ns note">Sumber tidak menyediakan ringkasan — buka tautan untuk membaca.</div>'}
        <div class="imp">${s}${imp}</div></div>`; }).join("") || '<p class="note">Tidak ada berita untuk filter ini.</p>';
  }

  // =====================================================================
  // VALUASI DAMODARAN
  // =====================================================================
  const VAL_FIELDS = {
    fcff: [["revenue", "Pendapatan (12 bln)", "money"], ["g1", "Growth pendapatan th 1–5 (%)", "pct"], ["gT", "Growth terminal (%)", "pct"], ["m0", "Margin operasi kini (%)", "pct"],
      ["mT", "Margin operasi target (%)", "pct"], ["convYear", "Tahun margin tercapai", "num"], ["s2c", "Sales-to-capital", "num"], ["tax0", "Pajak efektif (%)", "pct"],
      ["taxMarg", "Pajak marginal (%)", "pct"], ["cash", "Kas", "money"], ["debt", "Utang", "money"], ["shares", "Saham beredar", "num"], ["sdG", "Ketidakpastian growth ± (%)", "pct"], ["sdM", "Ketidakpastian margin ± (%)", "pct"]],
    bank: [["bvps", "Book value per saham", "num"], ["roe1", "ROE th 1–5 (%)", "pct"], ["roeT", "ROE terminal (%)", "pct"], ["g1", "Growth book value th 1–5 (%)", "pct"],
      ["gT", "Growth terminal (%)", "pct"], ["sdR", "Ketidakpastian ROE ± (%)", "pct"], ["sdG", "Ketidakpastian growth ± (%)", "pct"]],
    risk: [["rf", "Risk-free (%)", "pct"], ["beta", "Beta", "num"], ["erp", "ERP pasar matang (%)", "pct"], ["crp", "Country risk premium (%)", "pct"], ["kdSpread", "Spread utang perusahaan (%)", "pct", "fcff"], ["dWeight", "Bobot utang D/(D+E) (%)", "pct", "fcff"]],
  };
  async function runValuation() {
    const d = state.data; state.val = null; $("valBody").hidden = true; $("valOut").innerHTML = "";
    const eqLike = !isCrypto() && !/^\^/.test(d.symbol) && !/=F$|=X$/.test(d.symbol) && !/INDEX|CURRENCY|FUTURE|CRYPTO/i.test(d.type || "");
    if (!eqLike || state.csv) { $("valStatus").innerHTML = "Aset ini tidak punya arus kas (kripto, komoditas, kurs, atau indeks), jadi tidak bisa divaluasi secara intrinsik. Damodaran menyebutnya hanya bisa di-<i>pricing</i>, bukan di-<i>valuing</i>."; return; }
    $("valStatus").textContent = "Mengambil laporan keuangan…";
    try {
      const r = await fetch(`${API}?action=fundamentals&symbol=${encodeURIComponent(d.symbol)}`); const F = await r.json();
      if (F.error) throw new Error(F.error);
      state.fund = F; buildValDefaults(F); $("valBody").hidden = false; renderValInputs(); computeValuation();
    } catch (e) { $("valStatus").textContent = "Data fundamental tidak tersedia: " + e.message; }
  }
  function lastA(F, k) { const a = F.annual && F.annual[k]; return a && a.length ? a[a.length - 1][1] : null; }
  function cagrA(F, k, yrs = 3) { const a = F.annual && F.annual[k]; if (!a || a.length < 2) return null; const n = Math.min(yrs, a.length - 1); const v0 = a[a.length - 1 - n][1], v1 = a[a.length - 1][1]; return v0 > 0 && v1 > 0 ? Math.pow(v1 / v0, 1 / n) - 1 : null; }
  function buildValDefaults(F) {
    const idr = (F.financialCurrency || F.currency || state.data.currency) === "IDR";
    const fin = /financial|bank/i.test((F.sector || "") + " " + (F.industry || ""));
    const rf = idr ? DAMO.sbn10 - DAMO.dsID : state.usRf != null ? state.usRf : 0.04;
    const regBeta = state.risk && isFinite(state.risk.beta) ? 0.67 * state.risk.beta + 0.33 : null; // Blume-adjusted
    const price = state.res.s0, shares = lastA(F, "OrdinarySharesNumber") || F.shares;
    const rev = F.revenue || lastA(F, "TotalRevenue"), opi = lastA(F, "OperatingIncome"), revA = lastA(F, "TotalRevenue");
    const m0 = F.operatingMargin != null ? F.operatingMargin : opi && revA ? opi / revA : 0.15;
    const pti = lastA(F, "PretaxIncome"), tp = lastA(F, "TaxProvision"), tax0 = pti > 0 && tp != null ? Math.min(0.4, Math.max(0, tp / pti)) : 0.22;
    const ic = lastA(F, "InvestedCapital"), s2c = ic && revA ? Math.min(5, Math.max(0.3, revA / ic)) : 1.5;
    const g = cagrA(F, "TotalRevenue"); const g1 = g == null ? 0.05 : Math.min(0.2, Math.max(-0.05, g));
    const debt = F.totalDebt ?? lastA(F, "TotalDebt") ?? 0, cash = F.totalCash ?? lastA(F, "CashAndCashEquivalents") ?? 0;
    const mcap = price * (shares || 0);
    const eq = lastA(F, "StockholdersEquity"), ni = lastA(F, "NetIncome");
    const bvps = F.bookValuePerShare || (eq && shares ? eq / shares : null), roe = F.roe ?? (eq && ni ? ni / eq : 0.12);
    const coeGuess = rf + (regBeta ?? 1) * (DAMO.erp + (idr ? DAMO.crpID : 0));
    const payout = F.payoutRatio != null ? Math.min(1, Math.max(0, F.payoutRatio)) : 0.5;
    state.val = { kind: fin ? "bank" : "fcff", fin, idr, price,
      v: { revenue: rev, g1, gT: Math.max(0.01, rf - 0.005), m0, mT: m0, convYear: 5, s2c, tax0, taxMarg: idr ? 0.22 : 0.25, cash, debt, shares,
        rf, beta: regBeta ?? 1, erp: DAMO.erp, crp: idr ? DAMO.crpID : 0, kdSpread: idr ? DAMO.dsID + 0.01 : 0.015, dWeight: mcap > 0 ? debt / (debt + mcap) : 0.2,
        bvps, roe1: roe, roeT: coeGuess + Math.max(0, roe - coeGuess) / 2, sdR: 0.02, sdG: 0.03, sdM: 0.03, price,
        g1b: Math.min(0.2, Math.max(0, roe * (1 - payout))) } };
    state.val.v.g1bank = state.val.v.g1b;
    $("valStatus").innerHTML = `${esc(F.sector || "Sektor ?")} · ${esc(F.industry || "")} · laporan ${esc(F.financialCurrency || "")}${regBeta == null ? " · beta default 1 (jalankan perbandingan untuk beta regresi)" : ` · beta regresi ${nf(2).format(state.risk.beta)} → disesuaikan ${nf(2).format(regBeta)}`}${F.beta != null ? ` · beta Yahoo ${nf(2).format(F.beta)}` : ""}` +
      (fin ? '<br><b>Perusahaan keuangan terdeteksi</b> → memakai model excess return (DCF FCFF tidak cocok untuk bank).' : "");
  }
  function renderValInputs() {
    const S = state.val, kind = S.kind, v = S.v;
    document.querySelectorAll("#valKind .seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.k === kind));
    const inp = ([k, lbl, t, only]) => { if (only && only !== kind) return "";
      let val = k === "g1" && kind === "bank" ? v.g1bank : v[k]; if (val == null || !isFinite(val)) val = "";
      const shown = val === "" ? "" : t === "pct" ? +(val * 100).toFixed(2) : t === "money" ? +(val / 1e9).toFixed(2) : Math.abs(val) >= 1e4 ? Math.round(val) : +(+val).toFixed(Math.abs(val) >= 100 ? 0 : 2);
      return `<div><label class="lbl">${lbl}${t === "money" ? " (miliar)" : ""}</label><input type="number" step="any" data-vk="${k}" data-vt="${t}" value="${shown}"></div>`; };
    $("valInputs").innerHTML = VAL_FIELDS[kind].map(inp).join("");
    $("valRisk").innerHTML = VAL_FIELDS.risk.map(inp).join("");
  }
  function readValInputs() {
    const S = state.val;
    document.querySelectorAll("#valCard input[data-vk]").forEach((el) => { const k = el.dataset.vk, t = el.dataset.vt, x = parseFloat(el.value); if (!isFinite(x)) return;
      const val = t === "pct" ? x / 100 : t === "money" ? x * 1e9 : x; if (k === "g1" && S.kind === "bank") S.v.g1bank = val; else S.v[k] = val; });
  }
  function computeValuation() {
    const S = state.val; readValInputs(); const v = { ...S.v, price: state.res.s0 };
    const out = $("valOut"), cur = state.data.currency === "IDR" ? "Rp " : "";
    try {
      let r, mc, implied, impliedLbl, cols;
      if (S.kind === "fcff") {
        if (!(v.revenue > 0 && v.shares > 0)) throw new Error("Pendapatan dan jumlah saham harus terisi.");
        if (v.gT >= v.rf) throw new Error("Growth terminal harus lebih kecil dari risk-free rate (aturan Damodaran).");
        r = MCEngine.dcfFCFF(v); mc = MCEngine.valuationMC("fcff", v);
        implied = MCEngine.solveImplied(MCEngine.dcfFCFF, v, "g1", -0.3, 0.6); impliedLbl = "growth pendapatan th 1–5";
        cols = `<th>Th</th><th>Growth</th><th>Pendapatan</th><th>Margin</th><th>EBIT(1−t)</th><th>Reinvestasi</th><th>FCFF</th><th>WACC</th><th>PV</th>`;
        cols += "</tr></thead><tbody>" + r.rows.map((x) => `<tr><td>${x.t}</td><td>${pct(x.g)}</td><td>${money(x.rev)}</td><td>${pct(x.m)}</td><td>${money(x.nopat)}</td><td>${money(x.reinv)}</td><td class="${cls(x.fcff)}">${money(x.fcff)}</td><td>${pct(x.wacc, 2)}</td><td>${money(x.pv)}</td></tr>`).join("");
      } else {
        const vb = { ...v, g1: v.g1bank };
        if (!(vb.bvps > 0)) throw new Error("Book value per saham harus terisi.");
        if (vb.gT >= vb.rf) throw new Error("Growth terminal harus lebih kecil dari risk-free rate.");
        r = MCEngine.excessReturn(vb); mc = MCEngine.valuationMC("bank", vb);
        implied = MCEngine.solveImplied((w) => MCEngine.excessReturn({ ...w, roe1: w.x, roeT: w.x }), { ...vb, x: 0 }, "x", -0.2, 1.5); impliedLbl = "ROE berkelanjutan";
        cols = `<th>Th</th><th>ROE</th><th>Growth BV</th><th>BV/saham</th><th>Laba/saham</th><th>Excess return</th><th>Payout</th><th>PV</th>`;
        cols += "</tr></thead><tbody>" + r.rows.map((x) => `<tr><td>${x.t}</td><td>${pct(x.roe)}</td><td>${pct(x.g)}</td><td>${fmtNum(x.bv)}</td><td>${fmtNum(x.ni)}</td><td class="${cls(x.exc)}">${fmtNum(x.exc)}</td><td>${pct(x.payout, 0)}</td><td>${fmtNum(x.pv)}</td></tr>`).join("");
      }
      const up = r.upside, verdict = up > 0.2 ? "di bawah nilai intrinsik (undervalued)" : up < -0.2 ? "di atas nilai intrinsik (overvalued)" : "mendekati nilai wajar";
      const coe = S.kind === "fcff" ? r.cc.coe : r.coe;
      out.innerHTML = `
        <div class="kpis compact">
          <div class="kpi"><div class="k">Nilai intrinsik / saham</div><div class="v">${cur}${fmtNum(r.perShare)}</div><div class="h">harga ${cur}${fmtNum(v.price)}</div></div>
          <div class="kpi"><div class="k">Selisih vs harga</div><div class="v ${cls(up)}">${spct(up)}</div><div class="h">${verdict}</div></div>
          <div class="kpi"><div class="k">Biaya ekuitas${S.kind === "fcff" ? " / WACC" : ""}</div><div class="v">${pct(coe, 2)}${S.kind === "fcff" ? " / " + pct(r.cc.wacc, 2) : ""}</div><div class="h">rf ${pct(v.rf, 2)} + β ${nf(2).format(v.beta)} × (${pct(v.erp, 2)} + ${pct(v.crp, 2)})</div></div>
          <div class="kpi"><div class="k">Reverse: harga pasar mengasumsikan</div><div class="v">${isFinite(implied) ? pct(implied) : "di luar rentang"}</div><div class="h">${impliedLbl}${S.kind === "fcff" ? ` (input kamu ${pct(v.g1)})` : ` (input kamu ${pct(v.roe1)})`}</div></div>
        </div>
        <div class="subh">Simulasi input (${nf(0).format(mc.n)} skenario)</div>
        <div class="kpis compact">
          <div class="kpi"><div class="k">Rentang nilai P5 – P95</div><div class="v">${fmtNum(mc.q[0])} – ${fmtNum(mc.q[4])}</div><div class="h">median ${fmtNum(mc.q[2])}</div></div>
          <div class="kpi"><div class="k">Peluang harga < nilai</div><div class="v">${pct(mc.probUnder, 0)}</div><div class="h">dalam ketidakpastian yang kamu isi</div></div>
          ${S.kind === "fcff" ? `<div class="kpi"><div class="k">Porsi terminal value</div><div class="v">${pct(r.tvShare, 0)}</div><div class="h">${r.tvShare > 0.75 ? "sangat bergantung asumsi jangka panjang" : "wajar"}</div></div>`
            : `<div class="kpi"><div class="k">P/BV wajar vs pasar</div><div class="v">${nf(2).format(r.justifiedPB)}× vs ${nf(2).format(v.price / v.bvps)}×</div><div class="h">P/BV stabil ${nf(2).format(r.stablePB)}×</div></div>`}
        </div>
        <div class="chart-box short"><canvas id="valHist"></canvas></div>
        <div class="subh">Proyeksi 10 tahun</div>
        <div class="table-wrap"><table><thead><tr>${cols}</tbody></table></div>
        ${S.kind === "fcff" ? `<p class="note">Nilai operasi ${money(r.ops)} = PV FCFF ${money(r.pvFCFF)} + PV terminal ${money(r.pvTV)} (WACC terminal ${pct(r.waccT, 2)}, reinvestasi terminal ${pct(r.reinvRateT, 0)} dari NOPAT). + kas ${money(v.cash)} − utang ${money(v.debt)} = ekuitas ${money(r.equity)} ÷ ${nf(0).format(v.shares)} saham.</p>`
          : `<p class="note">Nilai = book value ${fmtNum(v.bvps)} + PV excess return 10 th ${fmtNum(r.pvExcess)} + PV terminal ${fmtNum(r.pvTV)}.</p>`}
        <p class="note">Sumber parameter: ERP ${pct(DAMO.erp, 2)} & CRP Indonesia ${pct(DAMO.crpID, 2)} (${DAMO.src}); risk-free rupiah = yield SBN 10th ${pct(DAMO.sbn10, 2)} − default spread ${pct(DAMO.dsID, 2)}. Data keuangan: Yahoo Finance. Semua angka bisa kamu ubah di atas.</p>`;
      const acc = css("--accent"), muted = css("--muted");
      drawChart("valHist", { type: "bar", data: { labels: mc.hist.edges.map((x) => fmtNum(x)), datasets: [{ data: mc.hist.counts, backgroundColor: mc.hist.edges.map((x) => (x < v.price ? css("--bad") : acc)), borderWidth: 0, barPercentage: 1, categoryPercentage: 1 }] },
        options: baseOpts({ plugins: { legend: { display: false }, tooltip: { callbacks: { title: (c) => "Nilai ≈ " + c[0].label, label: (c) => c.raw + " skenario" } } }, scales: { x: { ticks: { maxTicksLimit: 6, color: muted }, grid: { display: false } }, y: { display: false } } }) });
    } catch (e) { out.innerHTML = `<p class="status err">${esc(e.message)}</p>`; }
  }

  // ---------- event ----------
  function bind() {
    document.querySelectorAll(".controls .seg-btn").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
    $("chips").addEventListener("click", (e) => { const s = e.target.closest(".chip"); if (s) { pick(s.dataset.s); run(); } });
    $("didYouMean").addEventListener("click", (e) => { const s = e.target.closest(".chip"); if (s) { pick(s.dataset.s); run(); } });
    $("q").addEventListener("focus", () => { if ($("q").value.trim().length < 2 || $("q").value.trim() === state.symbol) popular(); });
    $("q").addEventListener("input", (e) => { const v = e.target.value.trim(); clearTimeout(searchTimer); if (v.length < 2) { popular(); return; } searchTimer = setTimeout(() => search(v), 250); });
    $("q").addEventListener("keydown", (e) => {
      const items = [...$("sugg").querySelectorAll("li[data-s]")];
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { if (!items.length || $("sugg").hidden) return; e.preventDefault(); suggIdx = (suggIdx + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length; items.forEach((li, i) => li.classList.toggle("on", i === suggIdx)); }
      else if (e.key === "Enter") { e.preventDefault(); if (suggIdx >= 0 && items[suggIdx] && !$("sugg").hidden) pick(items[suggIdx].dataset.s); $("sugg").hidden = true; run(); }
      else if (e.key === "Escape") $("sugg").hidden = true;
    });
    $("sugg").addEventListener("mousedown", (e) => { const li = e.target.closest("li[data-s]"); if (li) { e.preventDefault(); pick(li.dataset.s); run(); } });
    $("q").addEventListener("blur", () => setTimeout(() => ($("sugg").hidden = true), 150));
    $("drift").addEventListener("change", () => ($("customWrap").hidden = $("drift").value !== "custom"));
    $("run").addEventListener("click", run);
    $("modelTabs").addEventListener("click", (e) => { const t = e.target.closest(".tab"); if (t) { state.sel = t.dataset.m; renderSelected(); runPlan(); renderCompare(); if (state.cmp) renderOptions(); } });
    $("showPaths").addEventListener("change", () => state.res && renderSelected());
    $("csv").addEventListener("change", async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try { state.csv = parseCsv(await f.text(), f.name.replace(/\.csv$/i, "")); $("q").value = "CSV: " + f.name; status(`CSV dimuat: ${state.csv.values.length} baris. Klik Jalankan.`); }
      catch (err) { status(err.message, true); }
      e.target.value = "";
    });
    // rencana
    document.querySelectorAll("#pModeSeg .seg-btn").forEach((b) => b.addEventListener("click", () => { state.planMode = b.dataset.pm; syncPlanSeg();
      renderPlanInputs(state.planRes ? state.planRes.pr : null); if (state.planMode === "auto") runPlan(); }));
    $("planInput").addEventListener("focusin", (e) => { if (e.target.readOnly) { state.planMode = "manual"; syncPlanSeg(); document.querySelectorAll("#planInput input").forEach((i) => (i.readOnly = false)); } });
    $("planRun").addEventListener("click", runPlan);
    ["pEntry", "pLots", "pUnit", "pFeeB", "pFeeS"].forEach((id) => $(id).addEventListener("keydown", (e) => e.key === "Enter" && runPlan()));
    // perbandingan
    $("cmpRun").addEventListener("click", runCompare);
    $("cmpQ").addEventListener("keydown", (e) => e.key === "Enter" && runCompare());
    $("cmpChips").addEventListener("click", (e) => { const c = e.target.closest(".chip"); if (!c) return;
      const cur = $("cmpQ").value.split(",").map((s) => s.trim()).filter(Boolean); if (!cur.includes(c.dataset.s)) cur.push(c.dataset.s);
      $("cmpQ").value = cur.slice(-4).join(", "); runCompare(); });
    // quant / opsi / berita / valuasi
    $("rf").addEventListener("change", () => { state.rfAuto = false; renderQuant(); });
    ["oK", "oT", "oVol", "oQ"].forEach((id) => $(id).addEventListener("change", () => { state.oAuto = false; renderOptions(); }));
    $("oVolSrc").addEventListener("change", () => { $("oVolWrap").hidden = $("oVolSrc").value !== "custom"; renderOptions(); });
    $("newsFilter").addEventListener("click", (e) => { const t = e.target.closest(".tab"); if (!t || !state.news) return; state.newsFilter = t.dataset.f;
      document.querySelectorAll("#newsFilter .tab").forEach((x) => x.classList.toggle("active", x === t)); renderNews(); });
    document.querySelectorAll("#valKind .seg-btn").forEach((b) => b.addEventListener("click", () => { if (!state.val) return; readValInputs(); state.val.kind = b.dataset.k; renderValInputs(); computeValuation(); }));
    $("valRun").addEventListener("click", computeValuation);
    $("valCard").addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.matches("input[data-vk]")) computeValuation(); });
    // candlestick
    $("tfTabs").addEventListener("click", (e) => { const t = e.target.closest(".tab"); if (!t) return; state.tf = t.dataset.tf;
      document.querySelectorAll("#tfTabs .tab").forEach((x) => x.classList.toggle("active", x === t)); renderCandle(); });
    $("rgTabs").addEventListener("click", (e) => { const t = e.target.closest(".tab"); if (!t) return; state.rg = +t.dataset.rg;
      document.querySelectorAll("#rgTabs .tab").forEach((x) => x.classList.toggle("active", x === t)); renderCandle(); });
    $("indChecks").addEventListener("change", renderCandle);
    let rz; addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => state.lw && renderCandle(), 200); });
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => state.res && render());
  }

  readUrl(); setMode(state.mode, true); bind();
  if (new URLSearchParams(location.search).get("s")) run();
})();
