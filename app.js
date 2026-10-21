/* app.js — UI, data, chart, rencana lot, perbandingan, candlestick */
(() => {
  "use strict";
  const SB_URL = "https://immvxirnxumsvjelbmum.supabase.co";
  const SB_KEY = "sb_publishable_55aYAB_89tsZ2QNBzv5igg_v0FlChuz"; // kunci publik (aman di browser; data dilindungi RLS)
  const API = SB_URL + "/functions/v1/market-data";
  const sb = window.supabase ? window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true } }) : null;
  let session = null;
  async function apiFetch(url, opt = {}) {
    if (sb) { const { data } = await sb.auth.getSession(); session = data.session; }
    const headers = { ...(opt.headers || {}), apikey: SB_KEY, ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) };
    const r = await fetch(url, { ...opt, headers });
    if (r.status === 401) { showAuth("Sesi berakhir, silakan masuk lagi."); }
    return r;
  }
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
    try { const r = await apiFetch(`${API}?action=search&q=${encodeURIComponent(v)}`); remote = (await r.json()).quotes || []; } catch { /* abaikan */ }
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
    try { const r = await apiFetch(`${API}?action=search&q=${encodeURIComponent(typed.replace(/\.JK$/i, ""))}`); remote = (await r.json()).quotes || []; } catch { /* */ }
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
    const r = await apiFetch(`${API}?symbol=${encodeURIComponent(sym)}&range=${range}`);
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
  try { worker = new Worker("worker.js?v=" + (window.APP_V || "")); } catch { worker = null; }
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
      if (newSymbol) { setPlanDefaults(); setCmpDefaults(); state.cmp = null; $("cmpOut").hidden = true; state.intra = null; }
      else { $("pEntry").placeholder = fmtNum(res.s0); }
      render();
      writeUrl(); startLive();
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
  const INTRA_TF = { "1m": 60, "5m": 300, "15m": 900, "30m": 1800, "60m": 3600 };
  const isIntra = () => !!INTRA_TF[state.tf];
  async function loadIntraday() {
    const sym = state.data.symbol, iv = state.tf, key = sym + "|" + iv;
    const r = await apiFetch(`${API}?action=intraday&symbol=${encodeURIComponent(sym)}&interval=${iv}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error || !Array.isArray(j.bars)) throw new Error(j.error || `Gagal ambil data intraday (${r.status})`);
    // gabungkan tick terakhir yang belum genap satu interval ke candle sebelumnya
    const step = INTRA_TF[iv], bars = [];
    for (const b of j.bars) { const p = bars[bars.length - 1];
      if (p && b[0] - p[0] < step && Math.floor(b[0] / step) === Math.floor(p[0] / step)) { p[2] = Math.max(p[2], b[2]); p[3] = Math.min(p[3], b[3]); p[4] = b[4]; p[5] += b[5]; }
      else bars.push(b.slice()); }
    state.intra = { key, data: j, bars, at: Date.now() };
  }
  function setRangeTabs() {
    const opts = isIntra() ? [["1", "1 hari"], ["3", "3 hari"], ["5", "5 hari"], ["0", "Semua"]] : [["90", "3B"], ["182", "6B"], ["365", "1T"], ["1095", "3T"], ["0", "Semua"]];
    if (!opts.some(([v]) => +v === state.rg)) state.rg = isIntra() ? 1 : 182;
    $("rgTabs").innerHTML = opts.map(([v, l]) => `<button class="tab ${+v === state.rg ? "active" : ""}" data-rg="${v}">${l}</button>`).join("");
    $("liveRow").hidden = !isIntra();
  }
  let liveTimer = null;
  function setLive(on) { clearInterval(liveTimer); liveTimer = null;
    if (on) liveTimer = setInterval(async () => { if (!isIntra() || $("candleCard").hidden || document.hidden) return; try { await loadIntraday(); renderCandle(true); } catch { /* coba lagi menit berikutnya */ } }, 60000); }
  async function renderCandle(keepView) {
    if (isIntra()) {
      const key = state.data.symbol + "|" + state.tf;
      if (!state.intra || state.intra.key !== key) {
        $("ohlcLegend").textContent = "Mengambil data intraday…";
        try { await loadIntraday(); } catch (e) { $("ohlcLegend").textContent = e.message; return; }
      }
    }
    drawCandle(keepView);
  }
  function drawCandle(keepView) {
    if (!keepView) setTimeout(renderBook, 0);
    const d = state.data;
    if (!d.ohlc || d.ohlc.length <= 30 || typeof LightweightCharts === "undefined") { $("candleCard").hidden = true; return; }
    const intra = isIntra() && state.intra, off = intra ? state.intra.data.gmtoffset || 0 : 0;
    let prevRange = null, prevN = 0;
    if (state.lw) { if (keepView) { prevRange = state.lw.main.timeScale().getVisibleLogicalRange(); prevN = state.lw.n; } state.lw.main.remove(); state.lw.rsi.remove(); state.lw = null; }
    // intraday: waktu digeser ke jam bursa (sumbu menampilkan jam lokal bursa)
    const bars = intra ? state.intra.bars.map((b) => [b[0] + off, b[1], b[2], b[3], b[4], b[5]]) : aggregate(d.ohlc, state.tf), closes = bars.map((b) => b[4]);
    const tLabel = (t) => (typeof t === "number" ? new Date(t * 1000).toISOString().slice(0, 16).replace("T", " ") : t);
    const show = new Set([...document.querySelectorAll("#indChecks input:checked")].map((x) => x.value));
    const ink = css("--ink"), muted = css("--muted"), line = css("--line"), card = css("--card"), up = css("--good"), dn = css("--bad");
    const opts = (h) => ({ height: h, layout: { background: { color: card }, textColor: muted, fontFamily: "IBM Plex Mono, monospace", fontSize: 11 },
      grid: { vertLines: { color: line }, horzLines: { color: line } }, rightPriceScale: { borderColor: line }, timeScale: { borderColor: line },
      crosshair: { mode: 0 }, localization: { priceFormatter: (p) => fmtNum(p), locale: "id-ID" } });
    const tsOpt = intra ? { timeVisible: true, secondsVisible: false } : {};
    const el = $("candle"), base = opts(el.clientHeight), main = LightweightCharts.createChart(el, { ...base, width: el.clientWidth, timeScale: { ...base.timeScale, ...tsOpt } });
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
    state.lw = { main, rsi: rchart, cs, n: bars.length };

    // rentang tampilan
    const lastT = bars[bars.length - 1][0];
    if (prevRange) { const sh = bars.length - prevN; main.timeScale().setVisibleLogicalRange({ from: prevRange.from + sh, to: prevRange.to + sh }); }
    else if (intra && state.rg > 0) { const days = [...new Set(bars.map((b) => tLabel(b[0]).slice(0, 10)))]; const firstDay = days[Math.max(0, days.length - state.rg)];
      const i0 = bars.findIndex((b) => tLabel(b[0]).slice(0, 10) === firstDay); main.timeScale().setVisibleLogicalRange({ from: i0 - 0.5, to: bars.length - 0.5 }); }
    else if (!intra && state.rg > 0) { const f = new Date(lastT); f.setDate(f.getDate() - state.rg); main.timeScale().setVisibleRange({ from: f.toISOString().slice(0, 10), to: lastT }); }
    else main.timeScale().fitContent();
    if (intra) { const D = state.intra.data, pt = D.priceTime ? new Date((D.priceTime + off) * 1000).toISOString().slice(11, 16) : "–";
      const lastDay = tLabel(bars[bars.length - 1][0]).slice(0, 10), prevD = d.ohlc.filter((x) => x[0] < lastDay).pop(), dl = prevD ? prevD[4] : null, lastPx = bars[bars.length - 1][4];
      const ago = D.priceTime ? Math.round((Date.now() / 1000 - D.priceTime) / 60) : null;
      $("liveInfo").innerHTML = `Harga terakhir <b>${fmtNum(lastPx)}</b>${dl ? ` (<span class="${cls(lastPx / dl - 1)}">${spct(lastPx / dl - 1, 2)}</span> vs tutup kemarin)` : ""} · pukul ${pt} ${esc(D.timezone === "Asia/Jakarta" ? "WIB" : D.timezone)}${ago != null && ago > 20 ? ` · data ${ago} menit lalu (pasar tutup / tertunda)` : ""} · diperbarui ${new Date(state.intra.at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`; }

    const legend = (b, i) => { if (!b) return; const prev = i > 0 ? bars[i - 1][4] : b[1], ch = b[4] / prev - 1;
      $("ohlcLegend").innerHTML = `${tLabel(b[0])} · O ${fmtNum(b[1])} · H ${fmtNum(b[2])} · L ${fmtNum(b[3])} · C <span class="${cls(ch)}">${fmtNum(b[4])} (${spct(ch, 2)})</span> · Vol ${nf(0).format(b[5])}${rv[i] != null ? ` · RSI ${nf(0).format(rv[i])}` : ""}`; };
    const idxOf = new Map(bars.map((b, i) => [b[0], i]));
    legend(bars[bars.length - 1], bars.length - 1);
    main.subscribeCrosshairMove((p) => { if (!p.time) return legend(bars[bars.length - 1], bars.length - 1);
      const t = typeof p.time === "number" ? p.time : typeof p.time === "string" ? p.time : `${p.time.year}-${String(p.time.month).padStart(2, "0")}-${String(p.time.day).padStart(2, "0")}`;
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
      const r = await apiFetch(`${API}?action=news&symbol=${encodeURIComponent(d.symbol)}&q=${encodeURIComponent(q)}`);
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
      const r = await apiFetch(`${API}?action=fundamentals&symbol=${encodeURIComponent(d.symbol)}`); const F = await r.json();
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
        return { symbol: d.symbol, name: d.name, currency: d.currency, type: d.type, bench: b ? b.symbol : "–", m, F };
      });
      wl.rows = rows; wl.days = days; wl.model = model;
      $("wlOut").hidden = false; renderWatch(); renderWlMap(); renderHighlights(); startWlLive();
      const bad = rows.filter((r) => r.error).map((r) => r.symbol);
      $("wlStatus").textContent = `${rows.length - bad.length} aset dianalisis · model ${PRICE_LABEL(model)} · horizon ${days}${bad.length ? ` · gagal: ${bad.join(", ")}` : ""}`;
    } catch (e) { $("wlStatus").textContent = e.message; $("wlStatus").classList.add("err"); }
    finally { $("wlRun").disabled = false; setTimeout(() => ($("wlBar").style.width = "0"), 600); }
  }
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
        ["VaR 95%", (r) => r.m.var95, (r) => pct(r.m.var95)]],
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
        ["Growth pendapatan", (r) => r.F && r.F.revenueGrowth, (r) => (r.F && r.F.revenueGrowth != null ? pc(r.F.revenueGrowth) : "–")], ["Market cap", (r) => r.F && r.F.marketCap, (r) => (r.F && r.F.marketCap ? money(r.F.marketCap).replace(/^Rp /, "") : "–")]],
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
    const ok = wl.rows.filter((r) => !r.error && isFinite(r.m.ret1y)), grid = css("--line"), muted = css("--muted");
    const col = (t) => (t > 0 ? css("--good") : t < 0 ? css("--bad") : muted);
    const labels = { id: "lbl", afterDatasetsDraw(ch) { const ctx = ch.ctx; ctx.save(); ctx.font = "11px IBM Plex Mono, monospace"; ctx.fillStyle = css("--ink");
      ch.getDatasetMeta(0).data.forEach((pt, i) => ctx.fillText(ok[i].symbol.replace(/\.JK$/, ""), pt.x + 6, pt.y - 6)); ctx.restore(); } };
    if (state.charts.wlMap) state.charts.wlMap.destroy();
    state.charts.wlMap = new Chart($("wlMap"), { type: "scatter", plugins: [labels],
      data: { datasets: [{ data: ok.map((r) => ({ x: r.m.horizonVol * 100, y: r.m.ret1y * 100 })), pointBackgroundColor: ok.map((r) => col(r.m.trend)), pointRadius: 6, pointHoverRadius: 8 }] },
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
    const dd = best((r) => r.m.offHigh, -1); if (dd) L.push(`Paling jauh dari puncak 52 minggu: ${nm(dd)} ${spct(dd.m.offHigh)}`);
    const pb = ok.filter((r) => r.F && r.F.priceToBook && r.F.roe != null); if (pb.length > 1) { const x = pb.sort((a, b) => b.F.roe / b.F.priceToBook - a.F.roe / a.F.priceToBook)[0]; L.push(`ROE tertinggi per unit P/BV: ${nm(x)} (ROE ${pct(x.F.roe)}, P/BV ${nf(2).format(x.F.priceToBook)}) — cek valuasinya di Analisis 1 aset`); }
    $("wlHigh").innerHTML = L.map((x) => `<li>${x}</li>`).join("");
  }
  document.addEventListener("toggle", (e) => { const d = e.target; if (d.classList && d.classList.contains("formula") && d.open && !d.dataset.rendered && window.renderMathInElement) {
    window.renderMathInElement(d, { delimiters: [{ left: "\\(", right: "\\)", display: false }, { left: "$$", right: "$$", display: true }], throwOnError: false }); d.dataset.rendered = "1"; } }, true);
  function setView(v) {
    document.querySelectorAll(".view-btn").forEach((b) => b.classList.toggle("active", b.dataset.v === v));
    $("screenView").hidden = v !== "screen"; $("detailView").hidden = v !== "detail"; $("quantView").hidden = v !== "quant";
    if (v !== "detail") stopOB();
    if (v === "quant") { if (!$("qlQ").value.trim()) $("qlQ").value = $("wlQ").value; if (!ql.res && !$("qlRun").disabled) runQuant(); stopLive(); return; }
    if (v === "screen") { stopLive(); if (wl.rows.length) wlLiveOnce(); else if (!$("wlRun").disabled) runWatchlist(); } else if (state.res) startLive();
    if (v === "detail" && state.lw) setTimeout(renderCandle, 30);
  }
  function openDetail(sym) { setView("detail"); setMode("price", true); pick(sym); $("horizon").value = wl.days || $("horizon").value; run(); scrollTo({ top: 0, behavior: "smooth" }); }

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
  function attachAC(input) {
    const ul = input.parentElement.querySelector(".sugg"); let timer = null, idx = -1, seq = 0;
    const lastTok = () => { const v = input.value, i = Math.max(v.lastIndexOf(","), v.lastIndexOf("\n")); return { pre: v.slice(0, i + 1), tok: v.slice(i + 1).trim() }; };
    const show = (sections) => { idx = -1; const html = sections.filter((s) => s.items.length).map((s) => `<li class="hdr">${s.title}</li>` + s.items.map((q) => suggRow(q)).join("")).join("");
      ul.innerHTML = html; ul.hidden = !html; };
    const choose = (sym) => { const { pre } = lastTok(); input.value = (pre ? pre.replace(/\s*$/, " ") : "") + sym + ", "; ul.hidden = true; input.focus(); };
    input.addEventListener("input", () => { clearTimeout(timer); const { tok } = lastTok(); if (tok.length < 2) { ul.hidden = true; return; }
      timer = setTimeout(async () => { const my = ++seq, local = localMatches(tok); show([{ title: "Rekomendasi", items: local }]);
        let remote = []; try { remote = (await (await apiFetch(`${API}?action=search&q=${encodeURIComponent(tok)}`)).json()).quotes || []; } catch { /* */ }
        if (my !== seq) return; const seen = new Set(local.map((x) => x.symbol));
        remote = remote.filter((x) => !seen.has(x.symbol)).sort((a, b) => (/\.JK$/.test(b.symbol) ? 1 : 0) - (/\.JK$/.test(a.symbol) ? 1 : 0));
        show([{ title: "Rekomendasi", items: local }, { title: "Hasil pencarian", items: remote }]); }, 250); });
    input.addEventListener("keydown", (e) => { const items = [...ul.querySelectorAll("li[data-s]")]; if (ul.hidden || !items.length) return;
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
    return renderOB();
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
    const R = ql.res, S = ql.syms, N = S.length, grid = css("--line"), muted = css("--muted");
    // korelasi
    const heat = (v) => { const a = Math.min(1, Math.abs(v)); return v >= 0 ? `rgba(200,50,43,${(a * 0.55).toFixed(2)})` : `rgba(31,94,255,${(a * 0.55).toFixed(2)})`; };
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
    const pts = M.map(([k, l], i) => ({ label: l, data: [{ x: R.res[k].vol * 100, y: R.res[k].ret * 100 }], backgroundColor: COLORS[i % COLORS.length], pointRadius: k === ql.method ? 9 : 6, pointStyle: "rectRot" }));
    if (state.charts.qlFront) state.charts.qlFront.destroy();
    state.charts.qlFront = new Chart($("qlFront"), { type: "scatter", data: { datasets: [
        { label: "Portofolio acak", data: R.cloud.map(([v, r]) => ({ x: v * 100, y: r * 100 })), backgroundColor: grid, pointRadius: 2 },
        { label: "Aset tunggal", data: S.map((s, i) => ({ x: R.volAsset[i] * 100, y: R.muShr[i] * 100, s })), backgroundColor: muted, pointRadius: 4 }, ...pts] },
      options: baseOpts({ interaction: { mode: "nearest", intersect: true }, plugins: { legend: { labels: { color: muted, boxWidth: 10, font: { size: 11 } } },
        tooltip: { callbacks: { label: (c) => `${c.raw.s ? short(c.raw.s) : c.dataset.label}: vol ${nf(1).format(c.raw.x)}%, return ${nf(1).format(c.raw.y)}%` } } },
        scales: { x: { title: { display: true, text: "Volatilitas tahunan (%)", color: muted }, ticks: { color: muted }, grid: { color: grid } }, y: { title: { display: true, text: "Return harapan/th (%, shrink)", color: muted }, ticks: { color: muted }, grid: { color: grid } } } }) });
  }
  async function renderQuantMethod() {
    const R = ql.res, S = ql.syms, P = R.res[ql.method], muted = css("--muted"), grid = css("--line");
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
      const step = Math.max(1, Math.floor(b.eqS.length / 500)), lab = b.dates.filter((_, i) => i % step === 0), muted = css("--muted"), grid = css("--line");
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
    // watchlist
    $("views").addEventListener("click", (e) => { const b = e.target.closest(".view-btn"); if (b) setView(b.dataset.v); });
    $("wlPresets").innerHTML = WL_PRESETS.map(([n, l]) => `<button class="chip" data-l="${esc(l)}">${esc(n)}</button>`).join("");
    $("wlPresets").addEventListener("click", (e) => { const c = e.target.closest(".chip"); if (c) { $("wlQ").value = c.dataset.l; runWatchlist(); } });
    $("wlRun").addEventListener("click", runWatchlist);
    $("wlCols").addEventListener("click", (e) => { const t = e.target.closest(".tab"); if (!t) return; wl.col = t.dataset.c; wl.sort = null;
      document.querySelectorAll("#wlCols .tab").forEach((x) => x.classList.toggle("active", x === t)); renderWatch(); });
    $("wlTable").addEventListener("click", (e) => { const th = e.target.closest("th[data-i]"); if (th) { const i = +th.dataset.i; wl.dir = wl.sort === i ? -wl.dir : -1; wl.sort = i; renderWatch(); return; }
      const td = e.target.closest("td[data-s]"); if (td) openDetail(td.dataset.s); });
    // live
    $("liveToggle").addEventListener("click", () => { live.on = !live.on; $("liveToggle").classList.toggle("on", live.on); $("liveLbl").textContent = live.on ? "LIVE" : "LIVE OFF";
      if (live.on) startLive(); else { stopLive(); setLiveDot("closed", ""); $("liveStats").textContent = "Live dimatikan"; } });
    document.addEventListener("visibilitychange", () => { if (document.hidden) stopLive(); else if (!$("detailView").hidden && state.res) startLive(); else if (!$("screenView").hidden) wlLiveOnce(); });
    attachAC($("cmpQ")); attachAC($("wlQ"));
    // panel samping & quant lab
    $("bookTabs").addEventListener("click", (e) => { const t = e.target.closest(".tab"); if (!t) return; book.tab = t.dataset.b; renderBook(); });
    $("vpRange").addEventListener("click", (e) => { const t = e.target.closest(".tab"); if (!t) return; book.days = +t.dataset.d;
      document.querySelectorAll("#vpRange .tab").forEach((x) => x.classList.toggle("active", x === t)); renderVP(); });
    $("qlPresets").innerHTML = QL_PRESETS.map(([n, l]) => `<button class="chip" data-l="${esc(l)}">${esc(n)}</button>`).join("");
    $("qlPresets").addEventListener("click", (e) => { const c = e.target.closest(".chip"); if (c) { $("qlQ").value = c.dataset.l; ql.res = null; runQuant(); } });
    $("qlRun").addEventListener("click", runQuant);
    $("qlMethod").addEventListener("click", (e) => { const t = e.target.closest(".tab"); if (!t || !ql.res) return; ql.method = t.dataset.m; renderQuantLab(); });
    $("btStrat").addEventListener("change", btParamsVis); btParamsVis();
    $("btRun").addEventListener("click", runBacktest);
    attachAC($("qlQ"));
    // candlestick
    $("tfTabs").addEventListener("click", (e) => { const t = e.target.closest(".tab"); if (!t) return; state.tf = t.dataset.tf;
      document.querySelectorAll("#tfTabs .tab").forEach((x) => x.classList.toggle("active", x === t)); setRangeTabs(); renderCandle(); });
    $("rgTabs").addEventListener("click", (e) => { const t = e.target.closest(".tab"); if (!t) return; state.rg = +t.dataset.rg;
      document.querySelectorAll("#rgTabs .tab").forEach((x) => x.classList.toggle("active", x === t)); renderCandle(); });
    $("indChecks").addEventListener("change", renderCandle);
    let rz; addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => state.lw && renderCandle(), 200); });
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => state.res && render());
  }

  if (/[?&]debug\b/.test(location.search)) window.__sp = state;
  // ---------- login (Supabase Auth) ----------
  let settings = {}, saveTimer = null, booted = false;
  function saveSettings(patch) {
    settings = { ...settings, ...patch }; if (!sb || !session) return;
    clearTimeout(saveTimer); saveTimer = setTimeout(async () => { try { await sb.from("sp_settings").upsert({ user_id: session.user.id, data: settings, updated_at: new Date().toISOString() }); } catch { /* */ } }, 800);
  }
  async function loadSettings() {
    try { const { data } = await sb.from("sp_settings").select("data").eq("user_id", session.user.id).maybeSingle(); settings = (data && data.data) || {}; } catch { settings = {}; }
    if (settings.watchlist) $("wlQ").value = settings.watchlist;
    if (settings.quantlab) $("qlQ").value = settings.quantlab;
  }
  let authMode = "login";
  function setAuthMode(m) { authMode = m; const L = { login: ["Masuk untuk melanjutkan", "Masuk"], signup: ["Buat akun baru", "Daftar"], reset: ["Kirim tautan atur ulang password ke email", "Kirim tautan"] }[m];
    $("authSub").textContent = L[0]; $("authBtn").textContent = L[1]; $("authPass").hidden = $("authPassLbl").hidden = m === "reset";
    $("authPass").autocomplete = m === "signup" ? "new-password" : "current-password"; $("authPass").required = m !== "reset";
    $("authToSignup").hidden = m === "signup"; $("authToReset").hidden = m === "reset"; $("authToLogin").hidden = m === "login"; $("authMsg").textContent = ""; }
  function showAuth(msg) { $("authGate").hidden = false; $("userBox").hidden = true; stopLive(); if (msg) { $("authMsg").textContent = msg; $("authMsg").classList.add("err"); } }
  const authErr = (e) => { const m = (e && e.message) || String(e);
    return /Invalid login/i.test(m) ? "Email atau password salah." : /Email not confirmed/i.test(m) ? "Email belum dikonfirmasi — cek kotak masuk email kamu." : /already registered/i.test(m) ? "Email sudah terdaftar, silakan masuk." :
      /Password should/i.test(m) ? "Password minimal 6 karakter." : /rate limit/i.test(m) ? "Terlalu banyak percobaan, coba lagi beberapa menit lagi." : m; };
  async function onAuthed(s) {
    session = s; $("authGate").hidden = true; $("userBox").hidden = false; $("userEmail").textContent = s.user.email || "";
    if (booted) return; booted = true;
    readUrl(); setMode(state.mode, true); bind(); wlLoad(); await loadSettings(); setRangeTabs();
    const P = new URLSearchParams(location.search);
    if (P.get("s")) { setView("detail"); run(); } else { setView("screen"); runWatchlist(); }
  }
  async function startAuth() {
    setAuthMode("login");
    $("authToSignup").onclick = (e) => { e.preventDefault(); setAuthMode("signup"); };
    $("authToReset").onclick = (e) => { e.preventDefault(); setAuthMode("reset"); };
    $("authToLogin").onclick = (e) => { e.preventDefault(); setAuthMode("login"); };
    $("logoutBtn").onclick = async () => { await sb.auth.signOut(); location.reload(); };
    $("authForm").onsubmit = async (e) => { e.preventDefault(); const email = $("authEmail").value.trim(), pass = $("authPass").value, msg = $("authMsg");
      msg.classList.remove("err"); msg.textContent = "Memproses…"; $("authBtn").disabled = true;
      try {
        if (authMode === "login") { const { data, error } = await sb.auth.signInWithPassword({ email, password: pass }); if (error) throw error; msg.textContent = ""; await onAuthed(data.session); }
        else if (authMode === "signup") { const { data, error } = await sb.auth.signUp({ email, password: pass, options: { emailRedirectTo: location.origin + location.pathname } }); if (error) throw error;
          if (data.session) await onAuthed(data.session); else { msg.textContent = "Akun dibuat. Cek email kamu untuk konfirmasi, lalu masuk."; setTimeout(() => setAuthMode("login"), 50); } }
        else { const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }); if (error) throw error; msg.textContent = "Tautan atur ulang password sudah dikirim ke email kamu."; }
      } catch (err) { msg.textContent = authErr(err); msg.classList.add("err"); }
      finally { $("authBtn").disabled = false; } };
    if (!sb) { $("authMsg").textContent = "Gagal memuat modul login. Periksa koneksi lalu muat ulang."; $("authMsg").classList.add("err"); return; }
    sb.auth.onAuthStateChange(async (ev, s) => {
      if (ev === "PASSWORD_RECOVERY") { const np = prompt("Masukkan password baru (min. 6 karakter):"); if (np) { const { error } = await sb.auth.updateUser({ password: np }); alert(error ? authErr(error) : "Password berhasil diganti."); } }
      if (s) { session = s; if (!booted) onAuthed(s); } else if (ev === "SIGNED_OUT") showAuth();
    });
    const { data } = await sb.auth.getSession(); if (data.session) onAuthed(data.session);
  }
  startAuth();
})();
