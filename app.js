/* app.js — UI, data, chart, rencana lot, perbandingan, candlestick */
(() => {
  "use strict";
  const SB_URL = "https://immvxirnxumsvjelbmum.supabase.co";
  const SB_KEY = "sb_publishable_55aYAB_89tsZ2QNBzv5igg_v0FlChuz"; // kunci publik (aman di browser; data dilindungi RLS)
  const API = SB_URL + "/functions/v1/market-data"; const API_IDX = API.replace("market-data", "indodax-menu");
  // sesi login hanya hidup selama tab terbuka (sessionStorage): tutup tab / browser = wajib login lagi.
  // Pengecualian: akun pemilik/admin di perangkat yang ditandai "tetap masuk" (sp_keep) memakai localStorage, tanpa keluar otomatis.
  let KEEP = false; try { KEEP = localStorage.getItem("sp_keep") === "1"; } catch { /* */ }
  if (!KEEP) try { Object.keys(localStorage).filter((k) => /^sb-.*-auth-token/.test(k)).forEach((k) => localStorage.removeItem(k)); } catch { /* */ }
  // jendela/tab ditutup lalu dipulihkan browser (Ctrl+Shift+T, "lanjutkan dari terakhir") -> sessionStorage ikut pulih.
  // Tandai saat halaman ditinggalkan; muat berikutnya yang BUKAN refresh = dianggap keluar.
  let closedBefore = false;
  try { const nav = (performance.getEntriesByType("navigation")[0] || {}).type || "navigate";
    if (!KEEP && sessionStorage.getItem("sp_left") && nav !== "reload") { closedBefore = true; Object.keys(sessionStorage).filter((k) => /^sb-.*-auth-token/.test(k)).forEach((k) => sessionStorage.removeItem(k)); }
    sessionStorage.removeItem("sp_left");
    addEventListener("pagehide", () => { try { sessionStorage.setItem("sp_left", String(Date.now())); } catch { /* */ } });
  } catch { /* */ }
  const sb = window.supabase ? window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true, storage: KEEP ? window.localStorage : window.sessionStorage } }) : null;
  const IDLE_MIN = 30; let lastAct = Date.now();
  let session = null;
  async function apiFetch(url, opt = {}) {
    if (sb) { const { data } = await sb.auth.getSession(); session = data.session; }
    const headers = { ...(opt.headers || {}), apikey: SB_KEY, ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) };
    const r = await fetch(url, { ...opt, headers });
    if (r.status === 401) { const t = await r.clone().json().catch(() => ({})); showAuth("Sesi berakhir, silakan masuk lagi."); }
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
  const COLORS = { get length() { return 6; } }; for (let i = 0; i < 6; i++) Object.defineProperty(COLORS, i, { get: () => css(`--c${i + 1}`) });

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
  // dua worker: satu untuk perhitungan biasa, satu khusus ML/Radar (berat) supaya tidak saling mengantre
  const pending = new Map();
  function mkWorker() { let w = null; try { w = new Worker("worker.js?v=" + (window.APP_V || "")); } catch { return null; }
    w.onmessage = (e) => { const p = pending.get(e.data.id); if (!p) return;
      if (e.data.type === "progress") p.onProgress(e.data.msg, e.data.frac);
      else { pending.delete(e.data.id); e.data.type === "done" ? p.resolve(e.data.res) : p.reject(new Error(e.data.msg)); } };
    w.onerror = (e) => { pending.forEach((p, id) => { if (p.w === w) { p.reject(new Error(e.message || "Worker error")); pending.delete(id); } }); if (worker === w) worker = null; if (mlWorker === w) mlWorker = null; };
    return w; }
  let worker = mkWorker(), mlWorker = mkWorker();
  function inlineRun(type, cfg, onProgress) {
    if (type === "plan") return MCEngine.evalPlan(cfg); if (type === "stratAll") return MCEngine.runAllStrategies(cfg.D, cfg.o); if (type === "strat") return MCEngine.runStrategy(cfg.id, cfg.D, cfg.o);
    if (type === "noise") return MCEngine.noiseBand(cfg.bars, cfg.o); if (type === "compare") return inlineCompare(cfg, onProgress); if (type === "ml") return MCEngine.mlModel(cfg.D, { ...cfg.o, progress: onProgress });
    if (type === "radar") return MCEngine.radarAsset(cfg.D, cfg.o); if (type === "math") return MCEngine.mathLab(cfg.px, cfg.o); if (type === "qport") return MCEngine.quantPortfolio(cfg.series, cfg.opt);
    if (type === "qbt") return MCEngine.backtest(cfg.series, cfg.opt); if (type === "screen") return MCEngine.screenAsset(cfg.a, cfg.bench, cfg.o); if (type === "probEnd") return MCEngine.probEnd(cfg.model, cfg.K, cfg.r, cfg.T);
    if (type === "ardl") return MCEngine.ardl(cfg.a, cfg.xs); return cfg.mode === "bond" ? MCEngine.runBond(cfg, onProgress) : MCEngine.runPrice(cfg, onProgress); }
  function compute(type, cfg, onProgress = () => {}, wOver) {
    const heavy = type === "ml" || type === "radar", w = wOver || (heavy ? mlWorker || worker : worker);
    if (!w) return new Promise((res, rej) => setTimeout(() => { try { res(inlineRun(type, cfg, onProgress)); } catch (e) { rej(e); } }, 20));
    const id = ++state.runId;
    return new Promise((resolve, reject) => { pending.set(id, { resolve, reject, onProgress, w }); w.postMessage({ id, type, cfg }); });
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
        if (!state.couponUser) $("coupon").value = (Math.round(y[y.length - 1] * 800) / 8).toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
        const ten = { "^IRX": 0.25, "^FVX": 5, "^TNX": 10, "^TYX": 30 }[d.symbol]; if (ten && !state.matUser) $("maturity").value = ten;
        cfg = { mode: "bond", yields: y, dates: d.dates, days, sims, backtest: bt, coupon: (parseFloat($("coupon").value) || 0) / 100, maturity: parseFloat($("maturity").value) || 10, seed: 42 };
      } else {
        if (d.values.some((v) => v <= 0)) throw new Error("Ada harga ≤ 0, tidak bisa dihitung log-return. Untuk yield pakai mode Yield obligasi.");
        const models = [...document.querySelectorAll("#models input:checked")].map((x) => x.value);
        if (!models.length) throw new Error("Pilih minimal satu model");
        cfg = { mode: "price", prices: d.values, dates: d.dates, type: d.type, days, sims, models, drift: $("drift").value, customDrift: (parseFloat($("customDrift").value) || 0) / 100, backtest: bt, keepPaths: true, seed: 42 };
        if (cfg.drift === "ml") { const md = mlDrift(d, days); state.mlDrift = md; if (md.ok) cfg.customDrift = md.mu; else { cfg.drift = "zero"; } }
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
      if (res.mode === "price") { runPlan(); if (newSymbol) { state.valBetaSet = false; state.valUpside = null; state.ai = null; state.rfAuto = true; state.oAuto = true; state.risk = null; runValuation(); } runMath(); if (newSymbol || !state.cmp) runCompare(); else { renderCompare(); renderQuant(); } }
    } catch (e) {
      status(e.message || String(e), true); $("barFill").style.width = "0";
      if (typed && !state.csv) didYouMean(typed);
    } finally { btn.disabled = false; }
  }
  // Drift dari ML/DL: P(naik dalam H hari) = Φ(μ_H/σ_H) → μ_harian = σ_harian·Φ⁻¹(p)/√H.
  // Hanya dipakai bila model teruji; total drift dibatasi pada H hari (sesudahnya netral), p dibatasi 30–70%.
  function mlDrift(d, days) { const M = act.ml, sym = d.symbol;
    if (!M || M.error || act.mlSym !== sym) return { ok: false, why: "ML/DL untuk aset ini belum selesai dilatih. Proyeksi memakai drift nol dan akan dihitung ulang otomatis setelah ML selesai." };
    const src = M.fuse && !M.fuse.error && M.fuse.valid && isFinite(M.fuse.p) ? ["fusi ML+DL+konfluensi", M.fuse.p] : M.valid && isFinite(M.p) ? ["machine learning", M.p] : M.dl && M.dl.valid && isFinite(M.dl.p) ? ["deep learning", M.dl.p] : null;
    if (!src) return { ok: false, why: "ML, deep learning, dan fusi belum teruji untuk aset ini, jadi arahnya tidak dipakai. Proyeksi memakai drift nol (netral)." };
    const v = d.values.slice(-253), r = []; for (let i = 1; i < v.length; i++) r.push(Math.log(v[i] / v[i - 1])); const sd = MCEngine.std(r), H = M.H || 5, p = Math.min(0.7, Math.max(0.3, src[1]));
    const muD = (sd * MCEngine.qnorm(p)) / Math.sqrt(H), mu = (muD * Math.min(H, days)) / days;
    return { ok: true, mu, src: src[0], p, H, why: `Arah dari ${src[0]} (teruji): peluang naik ${pct(p, 0)} dalam ${H} hari → drift ${spct(Math.exp(muD * Math.min(H, days)) - 1, 2)} selama ${Math.min(H, days)} hari pertama, sesudahnya netral.` }; }
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
      ? (() => { const K = res.risk, s100 = K.scen.find((x) => x.bp === 100); return [["Harga obligasi kini", fmtNum(res.p0), `kupon ${pct(cfg.coupon, 2)} · ${cfg.maturity} th · per 100`],
         ["Durasi modifikasi", nf(2).format(K.modD), `yield +1% → harga ${spct(s100.now, 1)}`], ["DV01", nf(3).format(K.dv01), "harga berubah per 0,01% yield (per 100)"],
         ["Konveksitas", nf(1).format(K.conv), "makin besar, makin terlindungi saat yield bergerak jauh"],
         [`Impas ${cfg.days} hari`, `+${nf(0).format(res.risk.beBp)} bp`, "yield boleh naik segini sebelum rugi (kupon + roll-down)"],
         ["Vol yield / tahun", nf(0).format(res.stats.volBpAnn) + " bp", `rentang ${pct(res.stats.min, 2)} – ${pct(res.stats.max, 2)}`]]; })()
      : [["Volatilitas tahunan", pct(res.stats.volAnn), "historis"], ["Return tahunan hist.", pct(res.stats.retAnn), `drift dipakai: ${pct(res.stats.muUsed)}`],
         ["Excess kurtosis", nf(1).format(res.stats.exKurt), res.stats.exKurt > 3 ? "ekor gemuk — crash lebih sering dari normal" : "mendekati normal"],
         ["Max drawdown", pct(res.stats.maxDD), "dalam data historis"], ["Horizon", `${cfg.days} ${res.ppy === 365 ? "hari" : "hari bursa"}`, `skew ${nf(2).format(res.stats.skew)}`]];
    $("kpis").innerHTML = k.map(([a, b, c]) => `<div class="kpi"><div class="k">${a}</div><div class="v">${b}</div><div class="h">${c}</div></div>`).join("");

    document.querySelectorAll(".price-only").forEach((el) => (el.hidden = bond));
    if (bond) { if (!state.bcInit) { state.bcInit = true; $("bcY").value = nf(2).format(res.y0 * 100).replace(",", "."); $("bcC").value = $("coupon").value; $("bcM").value = $("maturity").value; } drawBondCalc(); }
    $("customWrap").hidden = bond || $("drift").value !== "custom";
    $("candleCard").hidden = !(d.ohlc && d.ohlc.length > 30);
    $("modelTabs").innerHTML = Object.entries(res.models).map(([key, m]) => `<button class="tab ${key === state.sel ? "active" : ""}" data-m="${key}">${esc(m.label)}</button>`).join("");
    renderCandle(); renderSummary(); renderConfidence(); renderParams(); renderCaveats(); renderSelected(); renderSignal();
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
    const acc = css("--accent"), soft = css("--accent-soft"), mid = css("--accent-mid"), ink = css("--hist"), grid = css("--grid"), muted = css("--muted");
    const ds = [
      { label: "Historis", data: hv.concat(new Array(days).fill(null)), borderColor: ink, borderWidth: 1.4, pointRadius: 0 },
      { label: "P5", data: pad(p5, s0), borderColor: "transparent", pointRadius: 0 },
      { label: "P95", data: pad(p95, s0), borderColor: "transparent", backgroundColor: soft, fill: "-1", pointRadius: 0 },
      { label: "P25", data: pad(p25, s0), borderColor: "transparent", pointRadius: 0 },
      { label: "P75", data: pad(p75, s0), borderColor: "transparent", backgroundColor: mid, fill: "-1", pointRadius: 0 },
      { label: "Median", data: pad(p50, s0), borderColor: acc, borderWidth: 2, pointRadius: 0 },
    ];
    { const md = state.mlDrift, on = $("drift").value === "ml" && md; $("mlDriftNote").hidden = !on; if (on) $("mlDriftNote").innerHTML = `<br><b>Drift ML:</b> ${esc(md.why)}${md.ok ? " Uji keyakinan model di bawah tetap diuji dengan drift historis, bukan drift ML." : ""}`; }
    const fm = $("fanMode").value, P = m.samplePaths || [];
    if (fm !== "band" && P.length) { const n = P.length, alpha = fm === "paths" ? "cc" : "66";
      const rgb = (k) => { const h = (k * 137.508) % 360, s = 0.75, l = 0.55, f = (x) => { const q = (x + h / 30) % 12, a2 = s * Math.min(l, 1 - l); return Math.round(255 * (l - a2 * Math.max(-1, Math.min(q - 3, 9 - q, 1)))); }; return "#" + [f(0), f(8), f(4)].map((x) => x.toString(16).padStart(2, "0")).join(""); };
      P.forEach((p, k) => ds.push({ label: "path", data: pad(p, s0), borderColor: rgb(k) + alpha, borderWidth: fm === "paths" ? 0.8 : 0.6, pointRadius: 0, _path: true, order: 10 }));
      if (fm === "paths") { ds.splice(1, 4); const mean = P[0].map((_, t) => P.reduce((a, q) => a + q[t], 0) / n);
        ds.push({ label: "Rata-rata path", data: pad(mean, s0), borderColor: ink, borderWidth: 2.2, pointRadius: 0, order: 0 }); } }
    if (fm !== "band") ds.push({ label: `Harga sekarang ${fmtNum(s0)}`, data: labels.map(() => s0), borderColor: css("--bad"), borderWidth: 1.6, borderDash: [], pointRadius: 0, order: 0, _ref: true });
    drawChart("fan", { type: "line", data: { labels, datasets: ds },
      options: baseOpts({ plugins: { legend: { display: false }, tooltip: { mode: "index", intersect: false, filter: (i) => !i.dataset._path && !i.dataset._ref && i.raw != null,
        callbacks: { label: (c) => `${c.dataset.label}: ${bond ? nf(2).format(c.raw) + "%" : fmtNum(c.raw)}` } } },
        scales: { x: { ticks: { maxTicksLimit: 6, color: muted }, grid: { display: false } }, y: { ticks: { color: muted, callback: (v) => (bond ? nf(2).format(v) + "%" : fmtNum(v)) }, grid: { color: grid } } } }) });

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
    try { const pr = await compute("plan", cfg); state.planRes = { pr, cfg }; if (cfg.auto) renderPlanInputs(pr); renderPlan(); renderSignal(); }
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
    const { series, benchIdx, res } = state.cmp, grid = css("--grid"), muted = css("--muted");
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
  function ema(a, n) { const k = 2 / (n + 1), out = new Array(a.length).fill(null); let e = null, seed = 0, c = 0;
    for (let i = 0; i < a.length; i++) { const v = a[i]; if (v == null) continue; if (e == null) { seed += v; c++; if (c === n) { e = seed / n; out[i] = e; } } else { e = v * k + e * (1 - k); out[i] = e; } }
    return out; }
  function macd(c, f = 12, sl = 26, sg = 9) { const ef = ema(c, f), es = ema(c, sl), m = c.map((_, i) => (ef[i] != null && es[i] != null ? ef[i] - es[i] : null));
    const sig = ema(m, sg); return { m, sig, hist: m.map((v, i) => (v != null && sig[i] != null ? v - sig[i] : null)) }; }
  function stoch(bars, n = 14, sk = 3, sd = 3) { const raw = bars.map((_, i) => { if (i < n - 1) return null; let h = -Infinity, l = Infinity; for (let j = i - n + 1; j <= i; j++) { h = Math.max(h, bars[j][2]); l = Math.min(l, bars[j][3]); }
      return h > l ? (100 * (bars[i][4] - l)) / (h - l) : 50; });
    const smooth = (a, k) => a.map((_, i) => { const w = a.slice(Math.max(0, i - k + 1), i + 1); return w.length === k && w.every((v) => v != null) ? w.reduce((x, y) => x + y, 0) / k : null; });
    const K = smooth(raw, sk); return { K, D: smooth(K, sd) }; }
  const FIB = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
  function fibLevels(bars) { if (bars.length < 5) return null; let hi = -Infinity, lo = Infinity, ih = 0, il = 0;
    bars.forEach((b, i) => { if (b[2] > hi) { hi = b[2]; ih = i; } if (b[3] < lo) { lo = b[3]; il = i; } });
    const up = ih > il; // naik dari low ke high -> retracement diukur turun dari high
    return { hi, lo, up, levels: FIB.map((f) => ({ f, price: up ? hi - (hi - lo) * f : lo + (hi - lo) * f })) }; }
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
    const ink = css("--ink"), muted = css("--muted"), line = css("--grid"), card = css("--card"), up = css("--good"), dn = css("--bad");
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
    if (show.has("ma20")) lineSer(m20, css("--c1"));
    if (show.has("ma50")) lineSer(m50, css("--c3"));
    if (show.has("bb")) { const sd = closes.map((_, i) => (i < 19 ? null : Math.sqrt(closes.slice(i - 19, i + 1).reduce((s, v) => s + (v - m20[i]) ** 2, 0) / 20)));
      lineSer(m20.map((v, i) => (v == null ? null : v + 2 * sd[i])), css("--c4"), 1, 2); lineSer(m20.map((v, i) => (v == null ? null : v - 2 * sd[i])), css("--c4"), 1, 2); }
    if (show.has("vol")) { const vs = main.addHistogramSeries({ priceFormat: { type: "volume" }, priceScaleId: "vol", lastValueVisible: false, priceLineVisible: false });
      main.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      vs.setData(bars.map((b) => ({ time: b[0], value: b[5], color: b[4] >= b[1] ? up + "66" : dn + "66" }))); }
    main.priceScale("right").applyOptions({ scaleMargins: { top: 0.08, bottom: show.has("vol") ? 0.22 : 0.08 } });

    // Fibonacci retracement pada rentang yang sedang dilihat
    if (show.has("fib")) { let win = bars;
      if (!intra && state.rg > 0) { const f = new Date(bars[bars.length - 1][0]); f.setDate(f.getDate() - state.rg); const fs = f.toISOString().slice(0, 10); win = bars.filter((b) => b[0] >= fs); }
      else if (intra && state.rg > 0) { const days = [...new Set(bars.map((b) => tLabel(b[0]).slice(0, 10)))], first = days[Math.max(0, days.length - state.rg)]; win = bars.filter((b) => tLabel(b[0]).slice(0, 10) >= first); }
      const F = fibLevels(win); if (F) F.levels.forEach((L) => cs.createPriceLine({ price: L.price, color: L.f === 0.618 || L.f === 0.382 ? css("--c3") : muted, lineStyle: L.f === 0 || L.f === 1 ? 0 : 2, lineWidth: 1, axisLabelVisible: true, title: `Fib ${nf(1).format(L.f * 100)}%` })); }

    // panel osilator: RSI / MACD / Stochastic
    const osc = state.osc || "rsi";
    document.querySelectorAll("#oscTabs .tab").forEach((t) => t.classList.toggle("active", t.dataset.o === osc));
    const rWrap = $("rsiWrap"); rWrap.hidden = !show.has("rsi");
    const rel = $("rsi"), rchart = LightweightCharts.createChart(rel, { ...opts(rel.clientHeight || 110), width: rel.clientWidth || el.clientWidth, timeScale: { visible: false, borderColor: line } });
    const ser = (vals, color, w = 1.4) => { const x = rchart.addLineSeries({ color, lineWidth: w, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false });
      x.setData(bars.map((b, i) => (vals[i] == null ? { time: b[0] } : { time: b[0], value: vals[i] }))); return x; };
    const rv = rsi(closes), M = macd(closes), ST = stoch(bars);
    if (osc === "macd") {
      const h = rchart.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false });
      h.setData(bars.map((b, i) => (M.hist[i] == null ? { time: b[0] } : { time: b[0], value: M.hist[i], color: (M.hist[i] >= 0 ? up : dn) + "99" })));
      ser(M.m, css("--c1")); ser(M.sig, css("--c3"), 1.2);
      $("oscLbl").textContent = "MACD (12, 26, 9) · garis biru = MACD, kuning = sinyal, batang = selisih";
    } else if (osc === "stoch") {
      const k = ser(ST.K, css("--c1")); ser(ST.D, css("--c3"), 1.2);
      k.createPriceLine({ price: 80, color: dn, lineStyle: 2, lineWidth: 1, axisLabelVisible: false }); k.createPriceLine({ price: 20, color: up, lineStyle: 2, lineWidth: 1, axisLabelVisible: false });
      rchart.priceScale("right").applyOptions({ autoScale: false, scaleMargins: { top: 0.1, bottom: 0.1 } });
      $("oscLbl").textContent = "Stochastic (14, 3, 3) · %K biru, %D kuning · > 80 jenuh beli, < 20 jenuh jual";
    } else {
      const rs = ser(rv, ink);
      rs.createPriceLine({ price: 70, color: dn, lineStyle: 2, lineWidth: 1, axisLabelVisible: false });
      rs.createPriceLine({ price: 30, color: up, lineStyle: 2, lineWidth: 1, axisLabelVisible: false });
      rchart.priceScale("right").applyOptions({ autoScale: false, scaleMargins: { top: 0.1, bottom: 0.1 } });
      $("oscLbl").textContent = "RSI 14 · > 70 jenuh beli, < 30 jenuh jual";
    }
    main.timeScale().subscribeVisibleLogicalRangeChange((r) => r && rchart.timeScale().setVisibleLogicalRange(r));
    state.lw = { main, rsi: rchart, cs, n: bars.length };
    applyMarkers();

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
      $("ohlcLegend").innerHTML = `${tLabel(b[0])} · O ${fmtNum(b[1])} · H ${fmtNum(b[2])} · L ${fmtNum(b[3])} · C <span class="${cls(ch)}">${fmtNum(b[4])} (${spct(ch, 2)})</span> · Vol ${nf(0).format(b[5])}${rv[i] != null ? ` · RSI ${nf(0).format(rv[i])}` : ""}${M.m[i] != null ? ` · MACD ${fmtNum(M.m[i])}` : ""}${ST.K[i] != null ? ` · %K ${nf(0).format(ST.K[i])}` : ""}`; };
    const idxOf = new Map(bars.map((b, i) => [b[0], i]));
    legend(bars[bars.length - 1], bars.length - 1);
    main.subscribeClick((p) => { if (!p || p.time == null) return; const t = typeof p.time === "object" ? `${p.time.year}-${String(p.time.month).padStart(2, "0")}-${String(p.time.day).padStart(2, "0")}` : p.time;
      const i = idxOf.get(t); if (i == null) return; book.fp = { t, bar: bars[i], next: bars[i + 1] ? bars[i + 1][0] : null, tf: state.tf, off }; book.tab = "fp"; renderBook(); });
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
    const dM = macd(dc), dS = stoch(dO), mN = dM.m[dc.length - 1], sN = dM.sig[dc.length - 1], mP = dM.m[dc.length - 2], sP = dM.sig[dc.length - 2], kN = dS.K[dc.length - 1], dN = dS.D[dc.length - 1];
    const sd20 = dc.length >= 20 ? MCEngine.std(dc.slice(-20), 0) : null, bbU = sd20 != null ? ma20 + 2 * sd20 : null, bbL = sd20 != null ? ma20 - 2 * sd20 : null;
    const fib6 = fibLevels(dO.slice(-126)), fibN = fib6 ? fib6.levels.slice(1, -1).reduce((a, L) => (!a || Math.abs(L.price - last) < Math.abs(a.price - last) ? L : a), null) : null;
    const trs = dO.slice(-15).map((b, i, a) => (i ? Math.max(b[2] - b[3], Math.abs(b[2] - a[i - 1][4]), Math.abs(b[3] - a[i - 1][4])) : null)).filter((x) => x != null), atr = trs.length ? trs.reduce((x, y) => x + y, 0) / trs.length : null;
    $("techStats").innerHTML = [["Hari ini", `<span class="${cls(chg(1))}">${spct(chg(1), 2)}</span>`], ["1 minggu", `<span class="${cls(chg(5))}">${spct(chg(5))}</span>`],
      ["Tertinggi 52 mg", fmtNum(hi52)], ["Terendah 52 mg", fmtNum(lo52)], ["Dari puncak 52 mg", `<span class="${cls(last / hi52 - 1)}">${spct(last / hi52 - 1)}</span>`],
      ["MA20 / MA50", `${fmtNum(ma20)} / ${ma50 != null ? fmtNum(ma50) : "–"}`], ["MA200", ma200 != null ? fmtNum(ma200) : "–"], ["RSI 14", r != null ? nf(0).format(r) : "–"],
      ["MACD / sinyal", mN != null ? `<span class="${cls(mN - (sN ?? mN))}">${fmtNum(mN)}</span> / ${sN != null ? fmtNum(sN) : "–"}` : "–"], ["Stochastic %K / %D", kN != null ? `${nf(0).format(kN)} / ${dN != null ? nf(0).format(dN) : "–"}` : "–"],
      ["Bollinger (20, 2σ)", bbU != null ? `${fmtNum(bbL)} – ${fmtNum(bbU)}` : "–"], ["Posisi di pita Bollinger", bbU != null && bbU > bbL ? pct((last - bbL) / (bbU - bbL), 0) : "–"],
      ["Fib terdekat (6 bln)", fibN ? `${nf(1).format(fibN.f * 100)}% · ${fmtNum(fibN.price)}` : "–"], ["ATR 14 (rata-rata rentang)", atr != null ? `${fmtNum(atr)} (${pct(atr / last)})` : "–"],
      ["Volume vs rata-rata 20h", isFinite(volT / vol20) && vol20 > 0 ? nf(1).format(volT / vol20) + "×" : "–"]]
      .map(([a, b]) => `<div>${a}<b>${b}</b></div>`).join("");
    const t = [];
    if (ma20 && ma50) t.push(last > ma20 && ma20 > ma50 ? "Harga di atas MA20 dan MA50 dengan MA20 > MA50: <b>tren jangka pendek naik</b>." :
      last < ma20 && ma20 < ma50 ? "Harga di bawah MA20 dan MA50 dengan MA20 < MA50: <b>tren jangka pendek turun</b>." : "MA20 dan MA50 belum searah: <b>tren belum jelas / sideways</b>.");
    if (ma200) t.push(last > ma200 ? "Harga di atas MA200 (tren jangka panjang masih positif)." : "Harga di bawah MA200 (tren jangka panjang masih negatif).");
    if (r != null) t.push(r > 70 ? `RSI ${nf(0).format(r)}: jenuh beli, kenaikan sudah cepat.` : r < 30 ? `RSI ${nf(0).format(r)}: jenuh jual, penurunan sudah cepat.` : `RSI ${nf(0).format(r)}: netral.`);
    if (mN != null && sN != null && mP != null && sP != null) t.push(mP <= sP && mN > sN ? "MACD baru memotong ke atas garis sinyal (momentum membaik)." : mP >= sP && mN < sN ? "MACD baru memotong ke bawah garis sinyal (momentum melemah)." : mN > sN ? "MACD di atas garis sinyal." : "MACD di bawah garis sinyal.");
    if (kN != null) t.push(kN > 80 ? `Stochastic ${nf(0).format(kN)}: dekat puncak rentang 14 hari.` : kN < 20 ? `Stochastic ${nf(0).format(kN)}: dekat dasar rentang 14 hari.` : "");
    if (fibN && fib6) t.push(`Harga paling dekat dengan level Fibonacci ${nf(1).format(fibN.f * 100)}% (${fmtNum(fibN.price)}) dari ${fib6.up ? "kenaikan" : "penurunan"} 6 bulan terakhir (${fib6.up ? `${fmtNum(fib6.lo)} → ${fmtNum(fib6.hi)}` : `${fmtNum(fib6.hi)} → ${fmtNum(fib6.lo)}`}).`);
    if (vol20 > 0 && volT / vol20 > 2) t.push("Volume hari terakhir lebih dari 2× rata-rata: ada minat besar / berita.");
    $("techText").innerHTML = t.join(" ") + ' <span class="note">Ringkasan ini deskriptif, bukan sinyal beli/jual.</span>';
  }

  function drawBondCalc() {
    const y = (parseFloat($("bcY").value) || 0) / 100, c = (parseFloat($("bcC").value) || 0) / 100, m = Math.max(0.25, parseFloat($("bcM").value) || 1), N = parseFloat($("bcN").value) || 0, tax = (parseFloat($("bcTax").value) || 0) / 100;
    const K = MCEngine.bondRisk(y, c, m, 252), val = (N * K.P) / 100, cpn = N * c * (1 - tax);
    $("bcOut").innerHTML = `<div class="kpis compact">${[["Harga", nf(2).format(K.P), K.P > 100 ? "premium (di atas 100)" : K.P < 100 ? "diskon (di bawah 100)" : "par"], ["Nilai beli", big(val, "IDR"), `nominal ${big(N, "IDR")}`],
      ["Kupon bersih / th", big(cpn, "IDR"), `setelah pajak ${pct(tax, 0)}`], ["Current yield", pct(K.curYield, 2), "kupon ÷ harga"], ["Durasi modifikasi", nf(2).format(K.modD), `yield +1% → ${spct(K.scen.find((x) => x.bp === 100).now, 1)}`],
      ["DV01", big((N * K.dv01) / 100, "IDR"), "per 0,01% yield"], ["Impas 1 tahun", `+${nf(0).format(K.beBp)} bp`, "yield boleh naik segini"]].map(([k, v, s]) => `<div class="kpi"><div class="k">${k}</div><div class="v">${v}</div><div class="h">${s}</div></div>`).join("")}</div>
      <div class="table-wrap"><table><thead><tr><th>Yield berubah</th><th>Harga langsung</th><th>Untung/rugi langsung</th><th>Total return 1 th (kupon kotor + harga)</th></tr></thead><tbody>${K.scen.map((s) => `<tr><td>${s.bp > 0 ? "+" : ""}${s.bp} bp</td><td>${nf(2).format(K.P * (1 + s.now))}</td><td class="${cls(s.now)}">${big(val * s.now, "IDR")} (${spct(s.now, 1)})</td><td class="${cls(s.tr)}">${spct(s.tr, 1)}</td></tr>`).join("")}</tbody></table></div>
      <p class="note">Harga per 100 nominal, kupon dibayar 2× setahun. ORI/SR/SBR tidak bisa dijual sebelum masa minimum, jadi kolom "langsung" hanya relevan bila bisa diperdagangkan (FR, ST setelah holding, korporasi). Yield SBN terkini: cek PHEI/IBPA atau aplikasi sekuritasmu.</p>`;
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
    const grid = css("--grid"), muted = css("--muted");
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

  function chartTheme() { if (typeof Chart === "undefined") return; Chart.defaults.color = css("--muted"); Chart.defaults.borderColor = css("--grid"); Chart.defaults.font.size = 12;
    Chart.defaults.elements.point.borderColor = css("--ink"); Chart.defaults.elements.point.borderWidth = 1; }
  function baseOpts(extra) { chartTheme(); return Object.assign({ responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: "index", intersect: false } }, extra); }
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
      const j = await r.json(); state.news = (j.items || []).filter((x) => x.title); state.ai = null; $("aiOut").innerHTML = "";
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
  function aiOf(x) { if (!state.ai || !state.ai.items) return null; const i = state.news.indexOf(x); return state.ai.items.find((it) => it.id === i) || null; }
  function aiChip(x) { const a = aiOf(x); if (!a) return ""; const d = a.arah === "naik" ? "▲" : a.arah === "turun" ? "▼" : "◆";
    return `<span class="pill ai-chip">AI ${d} ${a.peluang != null ? a.peluang + "%" : ""} · dampak ${esc(a.dampak || "?")}</span>`; }
  function aiSum(x) { const a = aiOf(x); return a && a.ringkasan ? `<div class="ai-sum">${esc(a.ringkasan)}${a.alasan ? ` <span class="note">— ${esc(a.alasan)}</span>` : ""}</div>` : ""; }
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
      <div class="kpi"><div class="k">Gerak hari berita vs hari biasa</div><div class="v">${isFinite(avgAbs) && normAbs > 0 ? nf(1).format(avgAbs / normAbs) + "×" : "–"}</div><div class="h">rata-rata |reaksi abnormal|</div></div></div>` +
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
        <div class="imp">${s}${imp}${aiChip(x)}</div>${aiSum(x)}</div>`; }).join("") || '<p class="note">Tidak ada berita untuk filter ini.</p>';
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
    const d = state.data; state.val = null; $("valBody").hidden = true; $("valOut").innerHTML = ""; $("finCard").hidden = true;
    const eqLike = !isCrypto() && !/^\^/.test(d.symbol) && !/=F$|=X$/.test(d.symbol) && !/INDEX|CURRENCY|FUTURE|CRYPTO/i.test(d.type || "");
    if (!eqLike || state.csv) { $("valStatus").innerHTML = "Aset ini tidak punya arus kas (kripto, komoditas, kurs, atau indeks), jadi tidak bisa divaluasi secara intrinsik. Damodaran menyebutnya hanya bisa di-<i>pricing</i>, bukan di-<i>valuing</i>."; return; }
    $("valStatus").textContent = "Mengambil laporan keuangan…";
    try {
      const r = await apiFetch(`${API}?action=fundamentals&symbol=${encodeURIComponent(d.symbol)}`); const F = await r.json();
      if (F.error) throw new Error(F.error);
      state.fund = F; renderFinancials(F); buildValDefaults(F); $("valBody").hidden = false; renderValInputs(); computeValuation();
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
      state.valUpside = r.upside; setTimeout(renderSignal, 0);
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
    plan: ["headCard", "actCard", "planCard"], cmp: ["headCard", "cmpCard"], quant: ["headCard", "quantCard"], val: ["headCard", "finCard", "valCard"], news: ["headCard", "newsCard"],
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

  // =====================================================================
  // PORTOFOLIO SAYA (F5)
  // =====================================================================
  const PF_KEY = "sp_pf_v1";
  const pf = { list: [], res: null };
  function pfLoad() { try { pf.list = JSON.parse(localStorage.getItem(PF_KEY) || "[]"); } catch { pf.list = []; } }
  function pfSave() { try { localStorage.setItem(PF_KEY, JSON.stringify(pf.list)); } catch { /* */ } saveSettings({ portfolio: pf.list, pfCash: +$("pfCash").value || 0 }); }
  function renderPfList() {
    $("pfList").innerHTML = pf.list.length ? `<thead><tr><th>Ticker</th><th>Harga beli</th><th>Jumlah</th><th></th></tr></thead><tbody>` + pf.list.map((p, i) =>
      `<tr><td><span class="pf-sym" data-edit="${i}">${esc(p.s)}</span></td><td>${fmtNum(p.avg)}</td><td>${nf(p.qty % 1 ? 4 : 0).format(p.qty)} ${/\.JK$/.test(p.s) ? "lot" : "unit"}</td><td><button class="x-btn" data-del="${i}" title="Hapus">✕</button></td></tr>`).join("") + "</tbody>"
      : '<tbody><tr><td class="note">Belum ada posisi. Isi ticker, harga beli, dan jumlah di atas.</td></tr></tbody>';
  }
  function pfAdd() {
    const s = $("pfSym").value.trim().toUpperCase().replace(/,$/, ""), avg = parseFloat($("pfAvg").value), qty = parseFloat($("pfQty").value);
    if (!s || !(avg > 0) || !(qty > 0)) { $("pfStatus").textContent = "Isi ticker, harga beli (> 0), dan jumlah (> 0)."; $("pfStatus").classList.add("err"); return; }
    $("pfStatus").classList.remove("err");
    const i = pf.list.findIndex((p) => p.s === s); if (i >= 0) pf.list[i] = { s, avg, qty }; else pf.list.push({ s, avg, qty });
    $("pfSym").value = $("pfAvg").value = $("pfQty").value = ""; pfSave(); renderPfList(); $("pfStatus").textContent = `${s} disimpan. Klik Hitung portofolio.`;
  }
  async function runPortfolio() {
    if (!pf.list.length) { $("pfStatus").textContent = "Tambahkan minimal satu posisi."; return; }
    pfSave(); $("pfRun").disabled = true; $("pfStatus").classList.remove("err"); $("pfStatus").textContent = "Mengambil harga & riwayat…";
    try {
      const syms = pf.list.map((p) => p.s);
      const datas = await pool(syms, 4, async (s) => { try { return await fetchSymbol(s, "2y"); } catch (e) { return { error: e.message, symbol: s }; } });
      const curs = [...new Set(datas.filter((d) => !d.error && d.currency && d.currency !== "IDR").map((d) => (d.currency === "USDT" ? "USD" : d.currency)))];
      const fxSym = (c) => (c === "USD" ? "IDR=X" : `${c}IDR=X`);
      const q = await quotesFor([...syms, "^JKSE", ...curs.map(fxSym)]);
      const fxHist = {}; for (const c of curs) { try { fxHist[c] = await fetchSymbol(fxSym(c), "2y"); } catch { /* */ } }
      let ihsg = null; try { ihsg = await fetchSymbol("^JKSE", "2y"); } catch { /* */ }
      const pos = pf.list.map((p, i) => { const d = datas[i]; if (d.error) return { ...p, error: d.error };
        const c = d.currency === "USDT" ? "USD" : d.currency || "IDR", fx = c === "IDR" ? 1 : (q[fxSym(c)] || {}).price || (fxHist[c] ? fxHist[c].values[fxHist[c].values.length - 1] : NaN);
        const units = /\.JK$/i.test(p.s) ? p.qty * 100 : p.qty, qq = q[d.symbol] || q[p.s], px = qq ? qq.price : d.ohlc.length ? d.ohlc[d.ohlc.length - 1][4] : d.values[d.values.length - 1];
        const val = units * px * fx, cost = units * p.avg * fx, day = qq && qq.prevClose ? qq.price / qq.prevClose - 1 : d.values[d.values.length - 1] / d.values[d.values.length - 2] - 1;
        return { ...p, name: d.name, cur: c, fx, units, px, val, cost, pl: val - cost, plp: val / cost - 1, day, dayAbs: val - val / (1 + day), d, sig: quickSignal(d, DAMO.biRate, 252) }; });
      const ok = pos.filter((p) => !p.error && isFinite(p.val)), cash = Math.max(0, +$("pfCash").value || 0), total = ok.reduce((a, p) => a + p.val, 0) + cash;
      if (!ok.length) throw new Error("Tidak ada posisi yang datanya berhasil diambil.");
      ok.forEach((p) => (p.w = p.val / total));
      // seri harga dalam rupiah
      const idrSeries = ok.map((p) => { if (p.cur === "IDR" || !fxHist[p.cur]) return { dates: p.d.dates, values: p.d.values };
        const m = new Map(fxHist[p.cur].dates.map((x, i) => [x, fxHist[p.cur].values[i]])), dts = [], vs = []; let lastFx = null;
        p.d.dates.forEach((x, i) => { const f = m.get(x) ?? lastFx; if (f != null) { lastFx = f; dts.push(x); vs.push(p.d.values[i] * f); } }); return { dates: dts, values: vs }; });
      const A = MCEngine.alignSeries(idrSeries), R = A.R.slice(-504), T = R.length, N = ok.length;
      const wInv = ok.map((p) => p.val / (total - cash)), wTot = ok.map((p) => p.w);
      const rp = R.map((r) => r.reduce((s, x, j) => s + wTot[j] * (Math.exp(x) - 1), 0));
      const mu = new Array(N).fill(0); R.forEach((r) => r.forEach((x, j) => (mu[j] += x / T)));
      const S = Array.from({ length: N }, (_, a) => Array.from({ length: N }, (_, b) => R.reduce((s, r) => s + (r[a] - mu[a]) * (r[b] - mu[b]), 0) / (T - 1)));
      const Sw = S.map((row) => row.reduce((s, v, j) => s + v * wTot[j], 0)), varP = wTot.reduce((s, w, i) => s + w * Sw[i], 0), volP = Math.sqrt(varP * 252);
      const rc = wTot.map((w, i) => (varP > 0 ? (w * Sw[i]) / varP : NaN));
      const sorted = Float64Array.from(rp).sort(), var1 = -sorted[Math.floor(0.05 * sorted.length)] * total, cvar1 = -MCEngine.mean(Array.from(sorted.slice(0, Math.max(1, Math.floor(0.05 * sorted.length))))) * total;
      let beta = NaN; if (ihsg) { const m = new Map(ihsg.dates.map((x, i) => [x, ihsg.values[i]])), dts = A.dates.slice(-T - 1), a = [], b = [];
        for (let t = 1; t < dts.length; t++) { const v0 = m.get(dts[t - 1]), v1 = m.get(dts[t]); if (v0 && v1) { a.push(rp[t - 1]); b.push(v1 / v0 - 1); } }
        if (a.length > 40) { const ma = MCEngine.mean(a), mb = MCEngine.mean(b); let c = 0, vb = 0; for (let i = 0; i < a.length; i++) { c += (a[i] - ma) * (b[i] - mb); vb += (b[i] - mb) ** 2; } beta = c / vb; } }
      let eq = 1, pk = 1, mdd = 0; rp.slice(-252).forEach((r) => { eq *= 1 + r; pk = Math.max(pk, eq); mdd = Math.max(mdd, 1 - eq / pk); });
      const H = Math.max(1, Math.min(252, parseInt($("pfH").value, 10) || 21)), rng = MCEngine.makeRng(42), sims = 5000, end = new Float64Array(sims);
      for (let k = 0; k < sims; k++) { let v = 1; for (let h = 0; h < H; h++) v *= 1 + rp[rng.int(rp.length)]; end[k] = v; } end.sort();
      let maxC = { v: -2 }; for (let a = 0; a < N; a++) for (let b = a + 1; b < N; b++) { const c = S[a][b] / Math.sqrt(S[a][a] * S[b][b]); if (c > maxC.v) maxC = { v: c, a, b }; }
      pf.res = { pos, ok, cash, total, volP, rc, var1, cvar1, beta, mdd, H, end, T, maxC, wInv, from: A.dates[Math.max(0, A.dates.length - T - 1)] };
      $("pfOut").hidden = false; renderPortfolio();
      const bad = pos.filter((p) => p.error).map((p) => p.s);
      $("pfStatus").textContent = `${ok.length} posisi dihitung · risiko dari ${T} hari bersama sejak ${pf.res.from}${bad.length ? ` · gagal: ${bad.join(", ")}` : ""}`;
    } catch (e) { $("pfStatus").textContent = e.message; $("pfStatus").classList.add("err"); }
    finally { $("pfRun").disabled = false; }
  }
  function renderPortfolio() {
    const P = pf.res; if (!P) return; const { ok, total, cash } = P, R = (v) => big(v, "IDR");
    const cost = ok.reduce((a, p) => a + p.cost, 0), val = ok.reduce((a, p) => a + p.val, 0), pl = val - cost, day = ok.reduce((a, p) => a + p.dayAbs, 0);
    const q = (p) => P.end[Math.floor(p * (P.end.length - 1))];
    $("pfKpi").innerHTML = [["Nilai portofolio", R(total), cash ? `termasuk kas ${R(cash)}` : "tanpa kas"], ["Modal (harga beli)", R(cost), `${ok.length} posisi`],
      ["Untung / rugi belum terealisasi", `<span class="${cls(pl)}">${pl > 0 ? "+" : ""}${R(pl)}</span>`, `<span class="${cls(pl)}">${spct(pl / cost)}</span> dari modal`],
      ["Hari ini", `<span class="${cls(day)}">${day > 0 ? "+" : ""}${R(day)}</span>`, `<span class="${cls(day)}">${spct(day / (total - day), 2)}</span>`],
      ["Volatilitas tahunan", pct(P.volP), "dari pola 2 tahun"], [`VaR 95% 1 hari`, R(P.var1), `${pct(P.var1 / total, 2)} dari nilai`]]
      .map(([k, v, h]) => `<div class="kpi"><div class="k">${k}</div><div class="v">${v}</div><div class="h">${h}</div></div>`).join("");
    const rows = P.pos.map((p) => { if (p.error) return `<tr class="err-row"><td><b>${esc(p.s)}</b></td><td colspan="10">${esc(p.error)}</td></tr>`; const i = ok.indexOf(p);
      return `<tr><td><span class="pf-sym" data-s="${esc(p.s)}">${esc(p.s)}</span><div class="nm">${esc((p.name || "").slice(0, 26))}</div></td><td>${fmtNum(p.px)}${p.cur !== "IDR" ? ` <span class="note">${p.cur}</span>` : ""}</td><td>${pc(p.day, 2)}</td><td>${fmtNum(p.avg)}</td>
        <td>${nf(p.qty % 1 ? 4 : 0).format(p.qty)} ${/\.JK$/.test(p.s) ? "lot" : ""}</td><td>${R(p.val)}</td><td><span class="${cls(p.pl)}">${p.pl > 0 ? "+" : ""}${R(p.pl)}</span></td><td>${pc(p.plp)}</td>
        <td>${pct(p.w)}</td><td>${pct(P.rc[i])}</td><td>${sigPill(p.sig)}</td></tr>`; }).join("");
    $("pfTable").innerHTML = `<thead><tr><th>Aset</th><th>Harga</th><th>Hari ini</th><th>Harga beli</th><th>Jumlah</th><th>Nilai (Rp)</th><th>Untung/rugi</th><th>%</th><th>Bobot</th><th>Porsi risiko</th><th>Sinyal</th></tr></thead><tbody>${rows}</tbody>`;
    const labels = ok.map((p) => p.s.replace(/\.JK$/, "")).concat(cash ? ["Kas"] : []), data = ok.map((p) => p.val).concat(cash ? [cash] : []);
    drawChart("pfAlloc", { type: "doughnut", data: { labels, datasets: [{ data, backgroundColor: labels.map((_, i) => COLORS[i % COLORS.length]), borderColor: css("--card"), borderWidth: 2 }] },
      options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { position: "right", labels: { color: css("--muted"), boxWidth: 10 } }, tooltip: { callbacks: { label: (c) => `${c.label}: ${R(c.raw)} (${pct(c.raw / total)})` } } } } });
    const top = ok.slice().sort((a, b) => b.w - a.w)[0], hhi = ok.reduce((a, p) => a + p.w * p.w, 0);
    $("pfAllocTxt").innerHTML = `Posisi terbesar <b>${esc(top.s)}</b> ${pct(top.w)}. Jumlah posisi efektif ${nf(1).format(1 / hhi)} (1/Σw²)${top.w > 0.4 ? " — <b>sangat terkonsentrasi</b>." : "."}`;
    $("pfRisk").innerHTML = [["Beta vs IHSG", isFinite(P.beta) ? nf(2).format(P.beta) : "–", isFinite(P.beta) ? (P.beta > 1.1 ? "lebih agresif dari indeks" : P.beta < 0.9 ? "lebih tenang dari indeks" : "mirip indeks") : ""],
      ["CVaR 95% 1 hari", R(P.cvar1), "rata-rata rugi di 5% hari terburuk"], ["Max drawdown 1T", pct(P.mdd), "dengan bobot sekarang"],
      ["Korelasi tertinggi", P.maxC.v > -2 ? nf(2).format(P.maxC.v) : "–", P.maxC.v > -2 ? `${esc(ok[P.maxC.a].s)} & ${esc(ok[P.maxC.b].s)}` : "butuh ≥ 2 posisi"]]
      .map(([k, v, h]) => `<div class="kpi"><div class="k">${k}</div><div class="v">${v}</div><div class="h">${h}</div></div>`).join("");
    const rcRows = ok.map((p, i) => ({ p, w: p.w, rc: P.rc[i] })).sort((a, b) => b.rc - a.rc);
    $("pfRc").innerHTML = `<thead><tr><th>Aset</th><th>Bobot</th><th>Porsi risiko</th><th></th></tr></thead><tbody>` + rcRows.map((x) => `<tr><td>${esc(x.p.s)}</td><td>${pct(x.w)}</td><td>${pct(x.rc)}</td><td style="text-align:left"><span class="rcbar" style="width:${Math.max(0, Math.min(100, x.rc * 100)).toFixed(0)}px"></span>${x.rc > x.w * 1.5 ? '<span class="note">risiko jauh di atas bobotnya</span>' : ""}</td></tr>`).join("") + "</tbody>";
    const hot = rcRows[0];
    $("pfRiskTxt").innerHTML = `Sumber risiko terbesar: <b>${esc(hot.p.s)}</b> (${pct(hot.rc)} risiko dari bobot ${pct(hot.w)}). ${P.maxC.v > 0.7 ? `${esc(ok[P.maxC.a].s)} dan ${esc(ok[P.maxC.b].s)} bergerak sangat searah (korelasi ${nf(2).format(P.maxC.v)}), jadi diversifikasinya kecil.` : ""}`;
    const bins = 40, lo = q(0.005), hi = q(0.995), wdt = (hi - lo) / bins || 1, cnt = new Array(bins).fill(0); P.end.forEach((v) => { const b = Math.floor((v - lo) / wdt); if (b >= 0 && b < bins) cnt[b]++; });
    drawChart("pfSim", { type: "bar", data: { labels: cnt.map((_, i) => R(total * (lo + (i + 0.5) * wdt))), datasets: [{ data: cnt, backgroundColor: cnt.map((_, i) => (lo + (i + 0.5) * wdt < 1 ? css("--bad") : css("--good"))), borderWidth: 0, barPercentage: 1, categoryPercentage: 1 }] },
      options: baseOpts({ plugins: { legend: { display: false }, tooltip: { callbacks: { title: (c) => "Nilai ≈ " + c[0].label, label: (c) => c.raw + " skenario" } } }, scales: { x: { ticks: { maxTicksLimit: 6, color: css("--muted") }, grid: { display: false } }, y: { display: false } } }) });
    const pr = (P.end.filter((v) => v < 1).length / P.end.length);
    $("pfSimTxt").innerHTML = `Dalam ${P.H} hari bursa: median ${R(total * q(0.5))} (${spct(q(0.5) - 1)}), 90% skenario di antara ${R(total * q(0.05))} dan ${R(total * q(0.95))}. Peluang nilai turun: ${pct(pr, 0)}. Bootstrap ${nf(0).format(P.end.length)} skenario dari ${P.T} hari historis.`;
  }

  // =====================================================================
  // LAB MATEMATIKA (UI)
  // =====================================================================
  async function runMath() {
    const d = state.data; if (!d || state.mode !== "price" || d.values.length < 120) { $("mathCard").hidden = true; return; }
    $("mathCard").hidden = false; $("mathStatus").textContent = "Menghitung…";
    try { state.math = await compute("math", { px: d.values, o: { n: 1000, ppy: state.res ? state.res.ppy : 252 } }); renderMath(); renderIntro(); }
    catch (e) { $("mathStatus").textContent = "Gagal: " + e.message; }
  }
  function renderMath() {
    const M = state.math; if (!M) return; const ppy = M.ppy || 252, ann = Math.sqrt(ppy), muted = css("--muted"), grid = css("--grid"), ink = css("--ink");
    const p3 = (p) => (p < 0.001 ? "< 0,001" : nf(3).format(p)), sig = (p) => (p < 0.05 ? '<span class="neg">tolak Gaussian</span>' : '<span class="pos">konsisten Gaussian</span>');
    $("mathStatus").textContent = `${M.n} return harian`;
    $("mathKpi").innerHTML = [["Skewness", nf(2).format(M.skew), M.skew < -0.3 ? "ekor kiri lebih panjang" : M.skew > 0.3 ? "ekor kanan lebih panjang" : "hampir simetris"],
      ["Kurtosis berlebih", nf(2).format(M.kurt), M.kurt > 1 ? "ekor tebal" : M.kurt < -0.5 ? "ekor lebih tipis dari normal" : "mendekati normal"], ["Jarque–Bera p", p3(M.jbP), sig(M.jbP)], ["Kolmogorov–Smirnov p", p3(M.ksP), sig(M.ksP)],
      ["ν Student-t", nf(1).format(M.t.nu), M.t.nu < 6 ? "ekor sangat tebal" : M.t.nu < 15 ? "ekor agak tebal" : "mirip normal"],
      ["Indeks ekor rugi (Hill α)", isFinite(M.hillL) ? nf(2).format(M.hillL) : "–", isFinite(M.hillL) ? (M.hillL < 2 ? "ekor ekstrem (varians tak terhingga)" : M.hillL < 4 ? "ekor tebal (kurtosis tak terhingga)" : M.hillL < 6 ? "ekor sedang" : "ekor tipis") : ""],
      ["Kejadian > 4σ", `${M.sig4} kali`, `Gaussian memperkirakan ${nf(2).format(M.expected4)}`], ["Entropi vs Gaussian", nf(3).format(M.entropy - M.entropyN), "< 0 = lebih terkonsentrasi + ekor"]]
      .map(([k, v, h]) => `<div class="kpi"><div class="k">${k}</div><div class="v">${v}</div><div class="h">${h}</div></div>`).join("");
    const D = M.dens, lab = D.grid.map((x) => nf(1).format(x * 100) + "%"), logS = state.mathLog;
    drawChart("mathDens", { type: "line", data: { labels: lab, datasets: [
      { label: "Data (KDE Gaussian)", data: D.kde, borderColor: ink, borderWidth: 2.2, pointRadius: 0 },
      { label: "Gaussian", data: D.normal, borderColor: css("--c1"), borderWidth: 1.6, borderDash: [6, 4], pointRadius: 0 },
      { label: `Student-t (ν=${nf(1).format(M.t.nu)})`, data: D.t, borderColor: css("--c3"), borderWidth: 1.6, pointRadius: 0 },
      { label: "Campuran 2 Gaussian", data: D.gmm, borderColor: css("--c2"), borderWidth: 1.4, borderDash: [2, 3], pointRadius: 0 }] },
      options: baseOpts({ plugins: { legend: { labels: { boxWidth: 10 } } }, scales: { x: { ticks: { maxTicksLimit: 8 }, grid: { display: false } }, y: { type: logS ? "logarithmic" : "linear", ticks: { maxTicksLimit: 5 }, grid: { color: grid } } } }) });
    const mn = Math.min(...M.qq.map((p) => p[0])), mx = Math.max(...M.qq.map((p) => p[0]));
    drawChart("mathQQ", { type: "scatter", data: { datasets: [
      { label: "Data", data: M.qq.map(([x, y]) => ({ x, y })), backgroundColor: css("--c1"), pointRadius: 3, pointBorderWidth: 0 },
      { label: "Garis Gaussian", type: "line", data: [{ x: mn, y: mn }, { x: mx, y: mx }], borderColor: css("--bad"), borderWidth: 1.5, pointRadius: 0 }] },
      options: baseOpts({ interaction: { mode: "nearest", intersect: true }, plugins: { legend: { labels: { boxWidth: 10 } } },
        scales: { x: { type: "linear", title: { display: true, text: "Kuantil Gaussian teoretis" }, grid: { color: grid } }, y: { title: { display: true, text: "Kuantil data (z)" }, grid: { color: grid } } } }) });
    const mods = [["Gaussian", M.aicN, M.bicN, 2], ["Student-t", M.aicT, NaN, 3], ["Campuran 2 Gaussian", M.aicG, M.bicG, 5]], bestA = Math.min(...mods.map((x) => x[1]));
    $("mathModels").innerHTML = `<thead><tr><th>Model</th><th>Parameter</th><th>AIC</th><th>BIC</th><th>Selisih AIC dari terbaik</th></tr></thead><tbody>` + mods.map(([nm, a, b, k]) =>
      `<tr class="${a === bestA ? "best" : ""}"><td>${nm}${a === bestA ? " ✓" : ""}</td><td>${k}</td><td>${nf(0).format(a)}</td><td>${isFinite(b) ? nf(0).format(b) : "–"}</td><td>${nf(1).format(a - bestA)}</td></tr>`).join("") +
      `</tbody>`;
    const H = M.hmm, A = H.A;
    $("mathHmm").innerHTML = `<thead><tr><th>Rezim</th><th>Return/th</th><th>Volatilitas/th</th><th>Bertahan (hari)</th><th>→ tenang</th><th>→ bergejolak</th><th>Porsi jangka panjang</th></tr></thead><tbody>
      <tr><td>Tenang</td><td>${pc(H.mu[0] * ppy)}</td><td>${pct(H.sd[0] * ann)}</td><td>${nf(0).format(H.dur[0])}</td><td>${pct(A[0][0], 1)}</td><td>${pct(A[0][1], 1)}</td><td>${pct(1 - H.stationaryHigh, 0)}</td></tr>
      <tr><td>Bergejolak</td><td>${pc(H.mu[1] * ppy)}</td><td>${pct(H.sd[1] * ann)}</td><td>${nf(0).format(H.dur[1])}</td><td>${pct(A[1][0], 1)}</td><td>${pct(A[1][1], 1)}</td><td>${pct(H.stationaryHigh, 0)}</td></tr>
      <tr><td><b>Peluang rezim bergejolak</b></td><td colspan="6" class="txt">hari ini <b>${pct(H.probHighNow, 0)}</b> · 5 hari lagi ${pct(H.probHigh5, 0)} · 21 hari lagi ${pct(H.probHigh21, 0)} <span class="note">(Gaussian campuran tanpa urutan waktu memberi ${pct(M.gmm.postNow, 0)} untuk hari terakhir)</span></td></tr></tbody>`;
    const dts = state.data.dates.slice(-H.filt.length);
    drawChart("mathHmmChart", { type: "line", data: { labels: dts, datasets: [{ label: "P(rezim bergejolak)", data: H.filt.map((x) => x * 100), borderColor: css("--bad"), backgroundColor: css("--bad") + "33", fill: true, borderWidth: 1.2, pointRadius: 0 }] },
      options: baseOpts({ plugins: { legend: { display: false } }, scales: { x: { ticks: { maxTicksLimit: 6 }, grid: { display: false } }, y: { min: 0, max: 100, ticks: { callback: (v) => v + "%" }, grid: { color: grid } } } }) });
    const vrRow = M.vr.map((v) => `VR(${v.q}) ${nf(2).format(v.VR)} <span class="note">(p ${p3(v.p)})</span>`).join(" · ");
    $("mathDep").innerHTML = `<tbody>
      <tr><td>Eksponen Hurst (R/S)</td><td>${nf(3).format(M.hurst)}</td><td class="txt">H acak untuk sampel ini ≈ ${nf(3).format(M.hurstNull)} → ${M.hurst - M.hurstNull > 0.05 ? "<b>cenderung tren berlanjut</b>" : M.hurst - M.hurstNull < -0.05 ? "<b>cenderung berbalik ke rata-rata</b>" : "tidak beda dari acak"}</td></tr>
      <tr><td>Variance ratio</td><td colspan="2" class="txt">${vrRow}</td></tr>
      <tr><td>Ljung–Box Q(10) return</td><td>${nf(1).format(M.lb.Q)}</td><td class="txt">p ${p3(M.lb.p)} → ${M.lb.p < 0.05 ? "<b>ada pola autokorelasi</b> (bisa dimanfaatkan, atau tanda likuiditas rendah)" : "tidak ada pola yang bisa ditebak dari return kemarin"}</td></tr>
      <tr><td>Ljung–Box Q(10) return²</td><td>${nf(1).format(M.lb2.Q)}</td><td class="txt">p ${p3(M.lb2.p)} → ${M.lb2.p < 0.05 ? "<b>volatilitas menggerombol</b> (alasan GARCH lebih cocok)" : "volatilitas tidak menggerombol"}</td></tr>
      <tr><td>Indeks ekor untung (Hill)</td><td>${isFinite(M.hillR) ? nf(2).format(M.hillR) : "–"}</td><td class="txt">bandingkan dengan ekor rugi ${isFinite(M.hillL) ? nf(2).format(M.hillL) : "–"}: lebih kecil = ekor lebih tebal</td></tr></tbody>`;
    const band = 1.96 / Math.sqrt(M.n);
    drawChart("mathAcf", { type: "bar", data: { labels: M.acf.map((_, i) => i + 1), datasets: [{ label: "ACF return", data: M.acf, backgroundColor: css("--c1") }, { label: "ACF return²", data: M.acf2, backgroundColor: css("--c3") }] },
      options: baseOpts({ plugins: { legend: { labels: { boxWidth: 10 } }, tooltip: { callbacks: { footer: () => `batas signifikan ±${nf(3).format(band)}` } } }, scales: { x: { title: { display: true, text: "lag (hari)" }, grid: { display: false } }, y: { grid: { color: grid } } } }) });
    const L = [];
    L.push(M.jbP >= 0.05 ? `Return ${esc(state.data.symbol)} tidak bisa dibedakan dari Gaussian pada sampel ini.` : M.kurt > 0 ? `Return ${esc(state.data.symbol)} <b>tidak berdistribusi Gaussian</b>: ekor lebih tebal (kurtosis berlebih ${nf(1).format(M.kurt)}), ${M.sig4} gerakan > 4σ padahal Gaussian hanya memperkirakan ${nf(2).format(M.expected4)}. VaR berbasis normal akan meremehkan risiko.`
      : `Return ${esc(state.data.symbol)} <b>tidak berdistribusi Gaussian</b>, tapi justru ekornya lebih tipis dari normal (kurtosis ${nf(1).format(M.kurt)}). Ini jarang untuk harga pasar; periksa apakah datanya wajar.`);
    const best = mods.find((x) => x[1] === bestA)[0]; L.push(`Model distribusi terbaik menurut AIC: <b>${best}</b>.`);
    if (H.sd[1] / H.sd[0] < 1.3) L.push("HMM tidak menemukan perbedaan rezim yang jelas: volatilitas kedua keadaan hampir sama."); else L.push(`HMM menemukan rezim tenang (vol ${pct(H.sd[0] * ann, 0)}/th) dan bergejolak (vol ${pct(H.sd[1] * ann, 0)}/th); peluang sedang di rezim bergejolak <b>${pct(H.probHighNow, 0)}</b>.`);
    if (M.lb2.p < 0.05) L.push("Volatilitas menggerombol, jadi rentang proyeksi GARCH lebih bisa dipercaya daripada GBM.");
    $("mathRead").innerHTML = L.join(" ") + ' <span class="note">Deskriptif, bukan sinyal.</span>';
  }

  // =====================================================================
  // TRADING: akun demo (paper trading) + Indodax (uang asli, hanya pemilik)
  // =====================================================================
  const OWNER_EMAIL = "raafialmuchsin6805@gmail.com";
  const wib = (iso) => new Date(new Date(iso).getTime() + 7 * 3600e3).toISOString().slice(5, 16).replace("T", " ");
  const isOwner = () => !!session && (session.user.email || "").toLowerCase() === OWNER_EMAIL;
  const PP_KEY = "sp_paper_v1";
  const pp = { a: null, side: "buy", q: {}, fx: null, timer: null };
  const newPaper = (start) => ({ start, cash: start, pos: {}, orders: [], hist: [], eq: [], created: new Date().toISOString() });
  function ppLoad() { let a = settings.paper; if (!a) { try { a = JSON.parse(localStorage.getItem(PP_KEY) || "null"); } catch { /* */ } } pp.a = a && a.pos ? a : newPaper(100e6); }
  function ppSave() { try { localStorage.setItem(PP_KEY, JSON.stringify(pp.a)); } catch { /* */ } saveSettings({ paper: pp.a }); }
  const kindOf = (s) => (/\.JK$/i.test(s) ? "idx" : /-USDT?$|^(BTC|ETH|SOL|BNB|XRP|DOGE|ADA)-/i.test(s) ? "crypto" : "other");
  const FEE = { idx: [0.0015, 0.0025], crypto: [0.003, 0.003], other: [0.001, 0.001] };
  async function ppQuotes(syms) {
    const list = [...new Set(syms.filter(Boolean))]; if (!list.length) return;
    const q = await quotesFor([...list, "IDR=X"]); Object.assign(pp.q, q); if (q["IDR=X"]) pp.fx = q["IDR=X"].price;
  }
  const fxOf = (s) => { const q = pp.q[s]; const c = (q && q.currency) || (/\.JK$/i.test(s) ? "IDR" : "USD"); return c === "IDR" ? 1 : pp.fx || 16000; };
  function ppPreview() {
    const s = normTicker($("dSym").value.trim() || ""), k = kindOf(s), q = pp.q[s], lim = $("dType").value === "limit";
    $("dQtyLbl").textContent = k === "idx" ? "Jumlah (lot)" : "Jumlah (unit/koin)"; $("dLimitWrap").hidden = !lim;
    if (!s) { $("dPreview").innerHTML = "Isi ticker dulu."; return null; }
    if (!q) { $("dPreview").innerHTML = `Harga ${esc(s)} belum dimuat. <a href="#" id="dLoadPx">Muat harga</a>`; return null; }
    let px = lim ? parseFloat($("dLimit").value) : q.price; if (lim && k === "idx" && px > 0) px = MCEngine.roundTick(px, true, pp.side === "buy" ? -1 : 1);
    const qty = parseFloat($("dQty").value) || 0, units = k === "idx" ? Math.floor(qty) * 100 : qty, fx = fxOf(s), [fb, fs] = FEE[k];
    const gross = units * px * fx, fee = gross * (pp.side === "buy" ? fb : fs), pos = pp.a.pos[s];
    const lines = [`Harga sekarang <b>${fmtNum(q.price)}</b>${q.currency && q.currency !== "IDR" ? " " + esc(q.currency) : ""}${lim ? ` · limit <b>${fmtNum(px)}</b>` : ""}`];
    if (units > 0 && px > 0) lines.push(`${pp.side === "buy" ? "Biaya" : "Hasil"} ±<b>${big(pp.side === "buy" ? gross + fee : gross - fee, "IDR")}</b> (fee ${big(fee, "IDR")})`);
    lines.push(pp.side === "buy" ? `Kas tersedia ${big(pp.a.cash, "IDR")}${units > 0 && gross + fee > pp.a.cash ? ' — <span class="neg">tidak cukup</span>' : ""}` : `Dimiliki ${pos ? (k === "idx" ? nf(0).format(pos.units / 100) + " lot" : nf(6).format(pos.units)) : "0"}`);
    const buy = pp.side === "buy"; $("dBrkWrap").hidden = !buy;
    const num = (id) => { const v = parseFloat($(id).value); return v > 0 ? (k === "idx" ? MCEngine.roundTick(v, true, id === "dStop" ? -1 : 1) : v) : null; };
    let brk = null, bad = "";
    if (buy) { const sp = num("dStop"), t1 = num("dT1"), t2 = num("dT2"), ref = px > 0 ? px : q.price;
      if (sp != null && sp >= ref) bad = "stop harus di bawah harga beli"; else if (t1 != null && t1 <= ref) bad = "target 1 harus di atas harga beli"; else if (t2 != null && t1 != null && t2 < t1) bad = "target 2 harus ≥ target 1"; else if (t2 != null && t2 <= ref) bad = "target 2 harus di atas harga beli";
      if (!bad && (sp || t1 || t2)) { brk = { stop: sp, t1, t2 }; const R = sp ? ref - sp : NaN, rr = R > 0 && t1 ? (t1 - ref) / R : NaN;
        lines.push(`Dijaga otomatis: ${sp ? `stop <b class="neg">${fmtNum(sp)}</b> (${spct(sp / ref - 1, 1)})` : "tanpa stop"}${t1 ? ` · T1 <b class="pos">${fmtNum(t1)}</b> (${spct(t1 / ref - 1, 1)})` : ""}${t2 ? ` · T2 <b class="pos">${fmtNum(t2)}</b>` : ""}${isFinite(rr) ? ` · RR 1 : ${nf(1).format(rr)}` : ""}${units > 0 && R > 0 ? ` · rugi bila stop ±${big(units * R * fx, "IDR")}` : ""}`); }
      if (bad) lines.push(`<span class="neg">${bad}</span>`); }
    $("dPreview").innerHTML = lines.join("<br>");
    return { s, k, px, units, fx, fee, gross, lim, brk, bad };
  }
  function ppFill(o, px) {
    const a = pp.a, fx = fxOf(o.s), [fb, fs] = FEE[kindOf(o.s)], gross = o.units * px * fx;
    if (o.side === "buy") { const fee = gross * fb; if (gross + fee > a.cash + 1e-6) { o.status = "ditolak"; o.note = "kas tidak cukup"; return false; }
      a.cash -= gross + fee; const p = a.pos[o.s] || { units: 0, cost: 0, name: o.name || o.s }; p.units += o.units; p.cost += gross + fee; a.pos[o.s] = p; o.fee = fee;
      if (o.brk) p.brk = { ...o.brk, entry: px, hit1: false, at: new Date().toISOString() }; if (o.ap) p.ap = true; }
    else { const p = a.pos[o.s]; if (!p || p.units + 1e-9 < o.units) { o.status = "ditolak"; o.note = "posisi tidak cukup"; return false; } if (p.ap) o.ap = true;
      const fee = gross * fs, costPart = p.cost * (o.units / p.units); o.pl = gross - fee - costPart; a.cash += gross - fee; p.units -= o.units; p.cost -= costPart; o.fee = fee;
      if (p.units < 1e-9) delete a.pos[o.s]; }
    o.status = "terisi"; o.fillPx = px; o.fillAt = new Date().toISOString(); a.hist.unshift(o); return true;
  }
  async function ppSend() {
    $("dStatus").classList.remove("err"); await ppQuotes([normTicker($("dSym").value.trim())]); const P = ppPreview();
    if (!P) return; if (!(P.units > 0)) { $("dStatus").textContent = "Jumlah harus lebih dari 0" + (P.k === "idx" ? " lot." : "."); return; }
    if (P.lim && !(P.px > 0)) { $("dStatus").textContent = "Isi harga limit."; return; }
    if (P.bad) { $("dStatus").textContent = "Periksa stop/target: " + P.bad + "."; $("dStatus").classList.add("err"); return; }
    const o = { id: Date.now().toString(36), t: new Date().toISOString(), s: P.s, name: (pp.q[P.s] || {}).symbol || P.s, side: pp.side, type: P.lim ? "limit" : "market", units: P.units, limit: P.lim ? P.px : null, status: "terbuka", brk: P.brk || null };
    if (!P.lim) { ppFill(o, pp.q[P.s].price); $("dStatus").textContent = o.status === "terisi" ? `Order ${o.side === "buy" ? "beli" : "jual"} ${P.s} terisi di ${fmtNum(o.fillPx)}.` : `Ditolak: ${o.note}.`; if (o.status !== "terisi") $("dStatus").classList.add("err"); }
    else { pp.a.orders.push(o); $("dStatus").textContent = `Order limit ${o.side === "buy" ? "beli" : "jual"} ${P.s} @ ${fmtNum(P.px)} dipasang.`; checkLimits(); }
    if (o.status !== "ditolak") ["dStop", "dT1", "dT2"].forEach((id) => ($(id).value = ""));
    ppSnap(); ppSave(); renderPaper(); if (!$("detailView").hidden) renderTcPos();
  }
  function checkLimits() {
    let ch = false;
    for (const o of pp.a.orders.filter((x) => x.status === "terbuka")) { const q = pp.q[o.s]; if (!q) continue;
      if ((o.side === "buy" && q.price <= o.limit) || (o.side === "sell" && q.price >= o.limit)) { ppFill(o, o.limit); ch = true; toast(`Demo: order limit ${o.side === "buy" ? "beli" : "jual"} ${o.s} terisi di ${fmtNum(o.limit)}`); } }
    pp.a.orders = pp.a.orders.filter((x) => x.status === "terbuka"); if (checkBrackets()) ch = true; if (ch) { ppSnap(); ppSave(); } return ch;
  }
  // stop loss / target otomatis untuk posisi demo (diisi di harga yang terlihat saat dicek)
  const hasBrk = () => pp.a && Object.values(pp.a.pos).some((p) => p.brk);
  function checkBrackets() {
    let ch = false;
    for (const [s, p] of Object.entries({ ...pp.a.pos })) { const b = p.brk, q = pp.q[s]; if (!b || !q || !(q.price > 0)) continue; const x = q.price, idx = kindOf(s) === "idx";
      const sell = (units, why) => { const o = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), t: new Date().toISOString(), s, name: p.name || s, side: "sell", type: why, units, limit: null, status: "terbuka" };
        if (ppFill(o, x)) { ch = true; toast(`Demo: ${why} ${s} — jual ${idx ? nf(0).format(units / 100) + " lot" : nf(6).format(units)} di ${fmtNum(x)}`); return true; } return false; };
      if (b.stop && x <= b.stop) { sell(p.units, b.hit1 ? "stop impas" : "stop loss"); continue; }
      if (b.t2 && x >= b.t2) { sell(p.units, "target 2"); continue; }
      if (b.t1 && !b.hit1 && x >= b.t1) { const half = idx ? Math.floor(p.units / 200) * 100 : p.units / 2;
        if (!b.t2 || !(half > 0)) { sell(p.units, "target 1"); continue; }
        if (sell(half, "target 1")) { const np = pp.a.pos[s]; if (np) np.brk = { ...b, hit1: true, stop: Math.max(b.stop || 0, b.entry) }; } } }
    return ch;
  }
  function ppEquity() { let v = pp.a.cash; for (const f of pp.a.fut || []) { const q = pp.q[f.s]; v += f.margin + (q ? Math.max(-f.margin, futPnl(f, q.price)) : 0); } for (const [s, p] of Object.entries(pp.a.pos)) { const q = pp.q[s]; v += q ? p.units * q.price * fxOf(s) : p.cost; } return v; }
  function ppSnap() { const d = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10), e = ppEquity(), L = pp.a.eq; if (L.length && L[L.length - 1].d === d) L[L.length - 1].v = e; else L.push({ d, v: e }); if (L.length > 400) L.splice(0, L.length - 400); }
  async function refreshPaper() {
    await ppQuotes([...Object.keys(pp.a.pos), ...pp.a.orders.map((o) => o.s), normTicker($("dSym").value.trim() || "")]);
    checkLimits(); ppSnap(); renderPaper(); ppPreview();
  }
  function renderPaper() {
    const a = pp.a, eq = ppEquity(), pl = eq - a.start, R = (v) => big(v, "IDR"), first = a.eq.length > 1 ? a.eq[a.eq.length - 2].v : a.start, day = eq - first;
    const done = a.hist.filter((o) => o.side === "sell" && o.pl != null), wins = done.filter((o) => o.pl > 0).length;
    $("dKpi").innerHTML = [["Nilai akun demo", R(eq), `modal awal ${R(a.start)}`], ["Untung/rugi total", `<span class="${cls(pl)}">${pl >= 0 ? "+" : ""}${R(pl)}</span>`, `<span class="${cls(pl)}">${spct(pl / a.start)}</span>`],
      ["Perubahan sejak kemarin", `<span class="${cls(day)}">${day >= 0 ? "+" : ""}${R(day)}</span>`, ""], ["Kas", R(a.cash), `${pct(a.cash / eq, 0)} dari akun`],
      ["Transaksi jual", `${done.length}`, done.length ? `${pct(wins / done.length, 0)} untung` : "belum ada"]]
      .map(([k, v, h]) => `<div class="kpi"><div class="k">${k}</div><div class="v">${v}</div><div class="h">${h}</div></div>`).join("");
    const P = Object.entries(a.pos);
    $("dPos").innerHTML = P.length ? `<thead><tr><th>Aset</th><th>Jumlah</th><th>Harga rata-rata</th><th>Harga kini</th><th>Nilai</th><th>Untung/rugi</th><th>%</th><th>Dijaga otomatis</th><th></th></tr></thead><tbody>` + P.map(([s, p]) => {
      const q = pp.q[s], fx = fxOf(s), v = q ? p.units * q.price * fx : NaN, g = v - p.cost, avg = p.cost / p.units / fx, k = kindOf(s);
      return `<tr><td><span class="pf-sym" data-s="${esc(s)}">${esc(s)}</span></td><td>${k === "idx" ? nf(0).format(p.units / 100) + " lot" : nf(p.units < 1 ? 6 : 2).format(p.units)}</td><td>${fmtNum(avg)}</td><td>${q ? fmtNum(q.price) : "–"}</td><td>${R(v)}</td>
        <td><span class="${cls(g)}">${g >= 0 ? "+" : ""}${R(g)}</span></td><td>${pc(g / p.cost)}</td><td>${p.brk ? `<span class="brk">${p.brk.stop ? `<span class="neg">stop ${fmtNum(p.brk.stop)}${p.brk.hit1 ? " (impas)" : ""}</span>` : ""}${p.brk.t1 ? ` · T1 ${fmtNum(p.brk.t1)}${p.brk.hit1 ? " ✓" : ""}` : ""}${p.brk.t2 ? ` · T2 ${fmtNum(p.brk.t2)}` : ""}</span> <button class="x-btn" data-dbrk="${esc(s)}" title="Hapus stop/target">✕</button>` : '<span class="note">–</span>'}</td><td><button class="fn-key" data-sellall="${esc(s)}">Jual</button></td></tr>`; }).join("") + "</tbody>"
      : '<tbody><tr><td class="note">Belum ada posisi. Pasang order beli di tiket sebelah kiri.</td></tr></tbody>';
    const O = a.orders;
    $("dOpen").innerHTML = O.length ? `<thead><tr><th>Waktu</th><th>Aset</th><th>Sisi</th><th>Limit</th><th>Jumlah</th><th>Harga kini</th><th></th></tr></thead><tbody>` + O.map((o, i) => `<tr><td>${wib(o.t)}</td><td>${esc(o.s)}</td>
      <td class="${o.side === "buy" ? "pos" : "neg"}">${o.side === "buy" ? "BELI" : "JUAL"}</td><td>${fmtNum(o.limit)}</td><td>${kindOf(o.s) === "idx" ? nf(0).format(o.units / 100) + " lot" : nf(6).format(o.units)}</td><td>${pp.q[o.s] ? fmtNum(pp.q[o.s].price) : "–"}</td><td><button class="x-btn" data-dcancel="${i}">Batal</button></td></tr>`).join("") + "</tbody>"
      : '<tbody><tr><td class="note">Tidak ada order limit yang menunggu.</td></tr></tbody>';
    const H = a.hist.slice(0, 200), realized = done.reduce((x, o) => x + o.pl, 0);
    $("dStats").textContent = done.length ? `laba terealisasi ${R(realized)} · ${wins}/${done.length} jual untung` : "";
    $("dHist").innerHTML = H.length ? `<thead><tr><th>Waktu isi</th><th>Aset</th><th>Sisi</th><th>Jenis</th><th>Harga</th><th>Jumlah</th><th>Fee</th><th>Laba (jual)</th></tr></thead><tbody>` + H.map((o) => `<tr><td>${wib(o.fillAt || o.t)}</td><td>${esc(o.s)}</td>
      <td class="${o.side === "buy" ? "pos" : "neg"}">${o.side === "buy" ? "BELI" : "JUAL"}</td><td>${o.type}</td><td>${fmtNum(o.fillPx)}</td><td>${kindOf(o.s) === "idx" ? nf(0).format(o.units / 100) + " lot" : nf(6).format(o.units)}</td><td>${R(o.fee)}</td><td>${o.pl != null ? `<span class="${cls(o.pl)}">${R(o.pl)}</span>` : ""}</td></tr>`).join("") + "</tbody>"
      : '<tbody><tr><td class="note">Belum ada transaksi.</td></tr></tbody>';
    const E = a.eq.length ? a.eq : [{ d: "mulai", v: a.start }];
    drawChart("dEq", { type: "line", data: { labels: E.map((x) => x.d), datasets: [{ data: E.map((x) => x.v / 1e6), borderColor: css("--accent"), backgroundColor: css("--accent-soft"), fill: true, borderWidth: 1.8, pointRadius: E.length < 30 ? 3 : 0 }] },
      options: baseOpts({ plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => "Rp " + nf(2).format(c.raw) + " jt" } } }, scales: { x: { ticks: { maxTicksLimit: 6 }, grid: { display: false } }, y: { ticks: { callback: (v) => v + " jt" }, grid: { color: css("--grid") } } } }) });
  }
  function openTrade(sym, side = "buy") {
    if (state.data && state.data.symbol === sym && !$("detailView").hidden) { tcTab = "demo"; syncTradeCard(); pp.side = side; document.querySelectorAll("#dSide .seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.s === side));
      $("dSend").textContent = side === "buy" ? "Kirim order beli demo" : "Kirim order jual demo"; $("tradeCard").scrollIntoView({ behavior: "smooth", block: "center" }); flashCard($("tradeCard")); return; }
    setView("trade"); setTradeTab("demo"); pp.side = side; document.querySelectorAll("#dSide .seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.s === side));
    $("dSym").value = sym; ppQuotes([sym]).then(ppPreview); }
  function setTradeTab(t) { document.querySelectorAll("#trTabs .seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.t === t)); $("demoPane").hidden = t !== "demo"; $("idxPane").hidden = t !== "idx"; $("stratPane").hidden = t !== "strat"; $("apPane").hidden = t !== "ap"; if (t === "ap") { drawAp(); $("trHeadNote").innerHTML = "Autopilot memasang bid & offer sendiri berdasarkan ML, deep learning & RAM AI. Hanya berjalan selama web terbuka."; return; }
    if (t === "strat" && !$("sSym").value) $("sSym").value = state.data ? state.data.symbol : state.symbol;
    if (t === "strat") { $("trHeadNote").innerHTML = "Uji 50 strategi harian dan noise band intraday pada data historis. Hasil masa lalu tidak menjamin hasil ke depan."; return; }
    $("trHeadNote").innerHTML = t === "demo" ? "Akun demo memakai uang virtual dan harga live (saham IDX tertunda ±10–15 menit). Semua order tercatat di akunmu." : "<b>Uang asli.</b> Order dikirim ke akun Indodax milikmu. Hanya kripto berpasangan rupiah.";
    if (t === "idx") idxInit(); }

  // ---------- Indodax ----------
  const ix = { pairs: null, side: "buy", pair: null, log: [], cfg: null };
  // ---- Pengaman kepatuhan: anti-manipulasi & batas laju API. Jual tidak pernah diblok.
  const ixq = { last: 0, cancels: [] }, IX_MINVOL = 1e9, IX_MAXSHARE = 0.01, IX_MAXCANCEL = 20;
  async function idxGuard(params) {
    const side = String(params.side || "").toUpperCase(), base = String(params.symbol || "").replace(/idr$/i, "").toLowerCase(); await idxPairsLoad(); const p = coinOf(base);
    const px = +params.price || (p && p.last) || 0, val = +params.quoteOrderQty || (+params.quantity || 0) * px;
    let open = []; try { const L = await idxCall("openOrders", { symbol: base + "idr" }); open = (Array.isArray(L) ? L : []).filter((o) => String(o.symbol).toLowerCase() === base + "idr"); } catch { /* */ }
    if (side === "BUY") {
      if (!p) throw new Error("Diblok: koin tidak ditemukan di daftar Indodax.");
      if (!(p.volIdr >= IX_MINVOL)) throw new Error(`Diblok (anti-manipulasi): volume 24 jam ${p.base.toUpperCase()} hanya ${big(p.volIdr, "IDR")}, di bawah Rp 1 M. Koin sepi mudah tergerak oleh order kita sendiri.`);
      if (val > IX_MAXSHARE * p.volIdr) throw new Error(`Diblok (anti-manipulasi): order ${big(val, "IDR")} melebihi 1% volume 24 jam (${big(p.volIdr * IX_MAXSHARE, "IDR")}).`);
      if (params.price && Math.abs(px / p.last - 1) > 0.15) throw new Error("Diblok: harga limit lebih dari 15% dari harga terakhir.");
      const cut = Date.now() - 864e5; ixq.cancels = ixq.cancels.filter((t) => t > cut); if (ixq.cancels.length >= IX_MAXCANCEL) throw new Error(`Diblok: sudah ${ixq.cancels.length} pembatalan dalam 24 jam. Pola pasang-batal berulang bisa dianggap spoofing.`);
      const mySell = open.filter((o) => /SELL/i.test(o.side)).map((o) => +o.price).filter((x) => x > 0);
      if (mySell.length && (params.type === "MARKET" ? Math.min(...mySell) <= p.last * 1.01 : px >= Math.min(...mySell))) throw new Error("Diblok (anti self-trade): order beli ini bisa bertemu order jual milikmu sendiri. Batalkan order jualnya dulu.");
    } else if (side === "SELL") { // jual tidak diblok: order beli milik sendiri yang bisa bertemu dibatalkan dulu
      for (const o of open.filter((o) => /BUY/i.test(o.side) && (params.type === "MARKET" ? +o.price >= ((p && p.last) || 0) * 0.99 : +o.price >= px))) { try { await idxCall("cancelOrder", { symbol: base + "idr", orderId: String(o.orderId) }); } catch { /* */ } }
    } }
  async function idxCall(method, params = {}, confirm) { // Trade API v2 lewat fungsi indodax-menu
    const wait = ixq.last + 350 - Date.now(); if (wait > 0) await new Promise((r) => setTimeout(r, wait)); ixq.last = Date.now(); // batas laju: ≤ ±3 panggilan/detik
    if (method === "createOrder") { if (String(params.side).toUpperCase() === "BUY" && !reOk()) { if (ap.cfg && ap.cfg.on && document.hidden) throw new Error("perlu verifikasi password ulang (buka web untuk melanjutkan beli uang asli)"); if (!(await reauth())) throw new Error("dibatalkan: verifikasi password diperlukan untuk beli uang asli"); } await idxGuard(params); }
    const r = await apiFetch(`${API_IDX}?action=private`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method, params, confirm }) });
    const j = await r.json().catch(() => ({})); if (!r.ok || (j && j.error)) throw new Error((j && j.error) || `Gagal (${r.status})`);
    if (method === "cancelOrder") ixq.cancels.push(Date.now()); if (method === "myTrades") ledgerMerge(params.symbol, Array.isArray(j) ? j : j.data || []); return j; }
  // ---- Buku transaksi Indodax (untuk SPT & modal rata-rata). API hanya memberi 7 hari, jadi riwayat dikumpulkan tiap kali tersinkron.
  const led = { rows: null, sync: {} };
  function ledgerRows() { if (!led.rows) led.rows = ((settings && settings.idxLedger) || []).slice(); return led.rows; }
  function ledgerMerge(symbol, L) { if (!L || !L.length) return; const R0 = ledgerRows(), have = new Set(R0.map((r) => r.id)); let add = 0;
    for (const t of L) { const id = String(t.id ?? t.tradeId ?? `${t.time}-${t.qty}-${t.price}`); if (have.has(id)) continue; have.add(id);
      R0.push({ id, t: +t.time || Date.now(), pair: String(t.symbol || symbol || "").toLowerCase(), side: t.isBuyer ? "beli" : "jual", qty: +t.qty || 0, px: +t.price || 0, val: +t.quoteQty || (+t.qty || 0) * (+t.price || 0), fee: +t.commission || 0, feeA: String(t.commissionAsset || "").toUpperCase() }); add++; }
    if (add) { R0.sort((x, y) => x.t - y.t); if (R0.length > 4000) R0.splice(0, R0.length - 4000); saveSettings({ idxLedger: R0 }); } }
  async function ledgerSync(bases) { for (const b of bases) { const k = b + "idr"; if (led.sync[k] && Date.now() - led.sync[k] < 6 * 3600e3) continue; led.sync[k] = Date.now(); try { await idxCall("myTrades", { symbol: k }); } catch { /* */ } } }
  function ledgerCost(base) { // modal rata-rata bergerak dari buku transaksi; null bila riwayat belum lengkap
    let q = 0, c = 0, real = 0; for (const r of ledgerRows().filter((r) => r.pair === base + "idr")) { const feeIdr = r.feeA === "IDR" ? r.fee : r.fee * r.px;
      if (r.side === "beli") { q += r.qty; c += r.val + feeIdr; } else if (q > 0) { const part = Math.min(1, r.qty / q), cp = c * part; real += r.val - feeIdr - cp; c -= cp; q -= Math.min(q, r.qty); } }
    return { q, c, real }; }
  function ledgerCsv() { const R0 = ledgerRows(); if (!R0.length) { toast("Buku transaksi masih kosong. Buka Indodax › Riwayat atau Manajemen aset untuk sinkron."); return; }
    const yr = new Date().getFullYear(), years = [...new Set(R0.map((r) => new Date(r.t).getFullYear()))].sort();
    const head = "tanggal,pair,sisi,jumlah,harga_rp,nilai_rp,fee,fee_aset\n", line = (r) => [new Date(r.t + 7 * 3600e3).toISOString().slice(0, 19).replace("T", " "), r.pair.toUpperCase(), r.side, r.qty, r.px, Math.round(r.val), r.fee, r.feeA].join(",");
    const sum = {}; for (const r of R0) { const k = r.pair, s = sum[k] || (sum[k] = { b: 0, j: 0, f: 0 }); if (r.side === "beli") s.b += r.val; else s.j += r.val; s.f += r.feeA === "IDR" ? r.fee : r.fee * r.px; }
    const csv = head + R0.map(line).join("\n") + "\n\nringkasan,pair,total_beli_rp,total_jual_rp,total_fee_rp\n" + Object.entries(sum).map(([k, s]) => ["", k.toUpperCase(), Math.round(s.b), Math.round(s.j), Math.round(s.f)].join(",")).join("\n") + `\n\ncatatan,"Dikumpulkan dari API Indodax (7 hari per sinkron) sejak ${new Date(R0[0].t).toLocaleDateString("id-ID")}. Pajak final kripto dipotong otomatis oleh Indodax; cocokkan dengan laporan resmi Indodax sebelum mengisi SPT."\n`;
    const el = document.createElement("a"); el.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); el.download = `transaksi_indodax_${years[0] || yr}-${years[years.length - 1] || yr}.csv`; el.click(); setTimeout(() => URL.revokeObjectURL(el.href), 2000); }
  const idxRead = (method, params = {}) => idxCall(method, params);
  async function idxInit() {
    if (!isOwner()) { $("xStatus").textContent = "Fitur Indodax hanya untuk akun pemilik."; return; }
    try { ix.cfg = await idxCall("status"); const c = ix.cfg;
      $("xStatus").innerHTML = !c.configured ? '<span class="neg">Belum dikonfigurasi.</span> Ikuti langkah di tab Setup.' : !c.ok ? `<span class="neg">Key ditolak Indodax:</span> ${esc(c.error || "")}` :
        `<span class="pos">Tersambung (Trade API v2).</span> Izin trade: ${c.canTrade ? '<b class="pos">ya</b>' : '<b class="neg">tidak</b>'}${c.canWithdraw ? ' · <b class="neg">izin withdraw AKTIF — sebaiknya buat key tanpa withdraw</b>' : ""} · batas per order Rp ${nf(0).format(c.maxIdr)}.`; ix.cfg.configured = c.configured && c.ok; }
    catch (e) { $("xStatus").textContent = e.message; }
    await idxPairsLoad(); $("xPair").placeholder = `ketik: btc, eth… (${(ix.pairs || []).length} koin)`;
    renderIdxLog(); if (ix.cfg && ix.cfg.configured && !ix.tabInit) { ix.tabInit = true; setXTab("pf"); } else if (ix.cfg && !ix.cfg.configured) setXTab("setup");
  }
  function idxPreview() {
    const p = ix.pair, lim = $("xType").value === "limit"; $("xPriceWrap").hidden = !lim;
    $("xAmtLbl").textContent = ix.side === "buy" && !lim ? "Jumlah rupiah (Rp)" : `Jumlah koin${p ? " (" + p.base.toUpperCase() + ")" : ""}`;
    if (!p) { $("xPreview").textContent = "Pilih koin dulu."; return null; }
    const px = lim ? parseFloat($("xPrice").value) : p.last, amt = parseFloat($("xAmt").value) || 0, value = ix.side === "buy" && !lim ? amt : amt * (px || 0);
    $("xPreview").innerHTML = `${esc(p.base.toUpperCase())}/IDR terakhir <b>Rp ${fmtNum(p.last)}</b> · 24 jam: ${fmtNum(p.low)} – ${fmtNum(p.high)} · volume Rp ${big(p.volIdr)}<br>` +
      (value > 0 ? `Nilai order ±<b>Rp ${nf(0).format(value)}</b>${ix.cfg && value > ix.cfg.maxIdr ? ' — <span class="neg">melebihi batas per order</span>' : ""}` : "Isi jumlah.") + (p.minIdr ? ` · minimal ±Rp ${nf(0).format(p.minIdr)}` : "");
    return { p, lim, px, amt, value };
  }
  function idxReview() {
    const P = idxPreview(); if (!P || !(P.amt > 0) || (P.lim && !(P.px > 0))) return;
    const word = `${ix.side} ${P.p.pair}`;
    $("xPreview").insertAdjacentHTML("beforeend", `<div class="confirm-box" id="xConfirm"><b>Konfirmasi order UANG ASLI</b><br>${ix.side === "buy" ? "BELI" : "JUAL"} ${esc(P.p.base.toUpperCase())} · ${P.lim ? `limit Rp ${fmtNum(P.px)}` : "market"} · ${ix.side === "buy" && !P.lim ? "Rp " + nf(0).format(P.amt) : nf(8).format(P.amt) + " " + esc(P.p.base.toUpperCase())} · ±Rp ${nf(0).format(P.value)}
      <br>Ketik <code>${esc(word)}</code> lalu tekan Kirim.<input id="xWord" autocomplete="off"><button class="run" id="xGo" style="background:var(--bad)">Kirim ke Indodax</button></div>`);
    $("xGo").onclick = async () => { if ($("xWord").value.trim() !== word) { toast("Teks konfirmasi tidak cocok."); return; }
      const params = { symbol: P.p.base + "idr", side: ix.side.toUpperCase(), type: P.lim ? "LIMIT" : "MARKET" }; if (P.lim) params.price = String(P.px);
      if (ix.side === "buy" && !P.lim) params.quoteOrderQty = String(Math.floor(P.amt)); else params.quantity = String(P.amt); params.order_type = P.lim ? "limit" : "market";
      $("xGo").disabled = true;
      try { const j = await idxCall("createOrder", params, word); const ret = { order_id: j.orderId || j.fullOrderId || "" }; ix.log.unshift({ t: new Date().toISOString(), side: ix.side, pair: P.p.pair, type: params.order_type, price: P.px, amt: P.amt, value: P.value, id: ret.order_id || "", ok: true });
        toast(`Indodax: order ${ix.side === "buy" ? "beli" : "jual"} ${P.p.base.toUpperCase()} terkirim${ret.order_id ? " (#" + ret.order_id + ")" : ""}`); }
      catch (e) { ix.log.unshift({ t: new Date().toISOString(), side: ix.side, pair: P.p.pair, type: params.order_type, price: P.px, amt: P.amt, value: P.value, ok: false, err: e.message }); toast("Indodax gagal: " + e.message); }
      saveSettings({ idxLog: ix.log.slice(0, 100) }); renderIdxLog(); idxPreview(); setTimeout(() => { if (ix.tab === "pf") idxBalance(); else if (ix.tab === "open") idxOpenOrders(); }, 1200); };
  }
  function renderIdxLog() {
    $("xLog").innerHTML = ix.log.length ? `<thead><tr><th>Waktu</th><th>Pair</th><th>Sisi</th><th>Jenis</th><th>Harga</th><th>Jumlah</th><th>Nilai</th><th>Hasil</th></tr></thead><tbody>` + ix.log.map((o) => `<tr><td>${wib(o.t)}</td><td>${esc(o.pair)}</td>
      <td class="${o.side === "buy" ? "pos" : "neg"}">${o.side === "buy" ? "BELI" : "JUAL"}</td><td>${o.type}</td><td>${o.price ? fmtNum(o.price) : "market"}</td><td>${nf(8).format(o.amt)}</td><td>Rp ${nf(0).format(o.value)}</td><td class="txt">${o.ok ? `terkirim ${esc(String(o.id))}` : `<span class="neg">${esc(o.err || "")}</span>`}</td></tr>`).join("") + "</tbody>"
      : '<tbody><tr><td class="note">Belum ada order dari web ini.</td></tr></tbody>';
  }
  async function idxPairsLoad(force = false) { if (ix.pairs && ix.pairsAt && !force && Date.now() - ix.pairsAt < 60e3) return ix.pairs;
    try { let j = await (await apiFetch(`${API_IDX}?action=pairs`)).json().catch(() => ({})); if (!j.pairs) j = await (await apiFetch(`${API}?action=indodax_pairs`)).json(); if (j.pairs) { ix.pairs = j.pairs; ix.pairsAt = Date.now(); if (ix.pair) ix.pair = ix.pairs.find((p) => p.pair === ix.pair.pair) || ix.pair; } } catch { ix.pairs = ix.pairs || []; } return ix.pairs; }
  const coinOf = (c) => (ix.pairs || []).find((p) => p.base === c);
  async function idxBalance() {
    $("xBalTable").innerHTML = '<tbody><tr><td class="status">Memuat saldo…</td></tr></tbody>';
    try { await idxPairsLoad(); const j = await idxRead("account"); const bal = {}, hold = {}; for (const x of j.balances || []) { const c = String(x.asset || "").toLowerCase(); bal[c] = +x.free || 0; hold[c] = +x.locked || 0; }
      const px = (c) => (c === "idr" ? 1 : (coinOf(c) || {}).last || 0);
      const rows = Object.keys(bal).map((c) => ({ c, b: +bal[c] || 0, h: +hold[c] || 0 })).filter((x) => x.b > 0 || x.h > 0).map((x) => ({ ...x, px: px(x.c), v: (x.b + x.h) * px(x.c), chg: x.c === "idr" ? 0 : (coinOf(x.c) || {}).chg24 })).sort((a, b) => b.v - a.v);
      const tot = rows.reduce((a, x) => a + x.v, 0), cash = rows.filter((x) => x.c === "idr").reduce((a, x) => a + x.v, 0), d24 = rows.reduce((a, x) => a + (isFinite(x.chg) && x.chg != null ? x.v - x.v / (1 + x.chg) : 0), 0);
      ix.bal = Object.fromEntries(rows.map((x) => [x.c, x.b]));
      $("xPfKpi").innerHTML = [["Total aset", "Rp " + nf(0).format(tot), `${rows.length} aset`], ["Rupiah (kas)", "Rp " + nf(0).format(cash), tot ? pct(cash / tot, 0) + " dari total" : ""], ["Kripto", "Rp " + nf(0).format(tot - cash), tot ? pct((tot - cash) / tot, 0) : ""],
        ["Perubahan 24 jam", `<span class="${cls(d24)}">${d24 >= 0 ? "+" : "−"}Rp ${nf(0).format(Math.abs(d24))}</span>`, tot - cash > 0 ? spct(d24 / (tot - cash - d24 || 1), 1) + " kripto" : ""]].map(([k, v, s]) => `<div class="kpi"><div class="k">${k}</div><div class="v">${v}</div><div class="h">${s}</div></div>`).join("");
      $("xBalTable").innerHTML = `<thead><tr><th>Aset</th><th>Tersedia</th><th>Di order</th><th>Harga</th><th>24j</th><th>Nilai (Rp)</th><th>Porsi</th><th></th></tr></thead><tbody>` + rows.map((x) => `<tr><td><b>${esc(x.c.toUpperCase())}</b></td><td>${x.c === "idr" ? nf(0).format(x.b) : nf(8).format(x.b)}</td><td>${x.h ? (x.c === "idr" ? nf(0).format(x.h) : nf(8).format(x.h)) : ""}</td>
        <td>${x.c === "idr" ? "" : fmtNum(x.px)}</td><td class="${cls(x.chg)}">${x.c === "idr" || x.chg == null ? "" : spct(x.chg, 1)}</td><td>${nf(0).format(x.v)}</td><td>${tot ? pct(x.v / tot, 0) : ""}</td>
        <td class="x-acts">${x.c === "idr" ? "" : `<button class="fn-key" data-xsell="${esc(x.c)}">Jual</button><button class="fn-key" data-xbook="${esc(x.c)}">Book</button><button class="fn-key" data-xana="${esc(x.c)}">Analisis</button>`}</td></tr>`).join("") +
        `<tr><td><b>Total</b></td><td></td><td></td><td></td><td></td><td><b>${nf(0).format(tot)}</b></td><td></td><td></td></tr></tbody>`;
    } catch (e) { $("xBalTable").innerHTML = `<tbody><tr><td class="status err">${esc(e.message)}</td></tr></tbody>`; }
  }
  function idxPick(base, side, opts = {}) { const p = coinOf(base); if (!p) return; ix.pair = p; $("xPair").value = p.base.toUpperCase();
    if (side) { ix.side = side; document.querySelectorAll("#xSide .seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.s === side)); }
    if (opts.price) { $("xType").value = "limit"; $("xPrice").value = opts.price; } else if (!$("xPrice").value || opts.reset) $("xPrice").value = p.last || "";
    if (opts.amt != null) $("xAmt").value = opts.amt; $("xBookPair").textContent = p.base.toUpperCase() + "/IDR"; $("xHistPair").textContent = p.base.toUpperCase() + "/IDR"; idxPreview();
    $("idxTicket").scrollIntoView({ behavior: "smooth", block: "nearest" }); }
  async function idxMarket() {
    await idxPairsLoad(); const q = ($("xMktQ").value || "").trim().toLowerCase(), key = ix.mktSort || "volIdr";
    const L = (ix.pairs || []).filter((p) => !q || p.base.includes(q) || String(p.name || "").toLowerCase().includes(q)).sort((a, b) => (b[key] ?? -1e18) - (a[key] ?? -1e18)).slice(0, 150);
    $("xMktN").textContent = `${(ix.pairs || []).length} koin IDR`;
    const th = (k, l) => `<th class="sortable${key === k ? " sorted" : ""}" data-xs="${k}">${l}</th>`;
    $("xMkt").innerHTML = `<thead><tr><th>Koin</th>${th("last", "Harga")}${th("chg24", "24j")}${th("chg7", "7h")}<th>Rendah – tinggi 24j</th>${th("volIdr", "Volume")}<th></th></tr></thead><tbody>` + L.map((p) => `<tr class="${ix.pair && ix.pair.pair === p.pair ? "best" : ""}"><td><b>${esc(p.base.toUpperCase())}</b> <span class="note">${esc(String(p.name || "").slice(0, 18))}</span>${p.suspended ? ' <span class="neg">maint.</span>' : ""}</td>
      <td>${fmtNum(p.last)}</td><td class="${cls(p.chg24)}">${p.chg24 == null ? "–" : spct(p.chg24, 1)}</td><td class="${cls(p.chg7)}">${p.chg7 == null ? "–" : spct(p.chg7, 1)}</td><td class="note">${fmtNum(p.low)} – ${fmtNum(p.high)}</td><td>${big(p.volIdr)}</td>
      <td class="x-acts"><button class="fn-key" data-xbuy="${esc(p.base)}">Beli</button><button class="fn-key" data-xbook="${esc(p.base)}">Book</button><button class="fn-key" data-xana="${esc(p.base)}">Analisis</button></td></tr>`).join("") + "</tbody>";
  }
  async function idxBook() {
    await idxPairsLoad(); if (!ix.pair) ix.pair = coinOf("btc"); const p = ix.pair; if (!p) return; $("xBookPair").textContent = p.base.toUpperCase() + "/IDR";
    try { const j = await (await apiFetch(`${API_IDX}?action=book&pair=${encodeURIComponent(p.pair)}`)).json(); if (j.error) throw new Error(j.error);
      const mx = Math.max(1e-9, ...j.bids.map((x) => x[0] * x[1]), ...j.asks.map((x) => x[0] * x[1])), bb = j.bids[0] && j.bids[0][0], ba = j.asks[0] && j.asks[0][0];
      const side = (L, c) => `<tbody>${L.map(([px, q]) => `<tr class="x-lv" data-xpx="${px}"><td class="${c}">${fmtNum(px)}</td><td>${nf(q < 1 ? 6 : 2).format(q)}</td><td class="x-bar"><i class="${c}" style="width:${Math.max(2, ((px * q) / mx) * 100).toFixed(0)}%"></i>${big(px * q)}</td></tr>`).join("")}</tbody>`;
      $("xBids").innerHTML = `<thead><tr><th>Harga</th><th>Jumlah</th><th>Rp</th></tr></thead>` + side(j.bids, "pos"); $("xAsks").innerHTML = `<thead><tr><th>Harga</th><th>Jumlah</th><th>Rp</th></tr></thead>` + side(j.asks, "neg");
      const sb = j.bids.slice(0, 10).reduce((a, x) => a + x[0] * x[1], 0), sa = j.asks.slice(0, 10).reduce((a, x) => a + x[0] * x[1], 0);
      $("xBookInfo").innerHTML = bb && ba ? `spread ${pct((ba - bb) / ba, 2)} · tekanan 10 level: <b class="${sb > sa ? "pos" : "neg"}">${pct(sb / (sb + sa), 0)} beli</b> · klik harga untuk isi limit` : "";
      $("xTrades").innerHTML = `<thead><tr><th>Waktu</th><th>Sisi</th><th>Harga</th><th>Jumlah</th><th>Rp</th></tr></thead><tbody>` + j.trades.map((t) => `<tr><td>${new Date(t.t * 1000).toLocaleTimeString("id-ID")}</td><td class="${t.side === "buy" ? "pos" : "neg"}">${t.side === "buy" ? "beli" : "jual"}</td><td>${fmtNum(t.px)}</td><td>${nf(t.amt < 1 ? 6 : 2).format(t.amt)}</td><td>${big(t.px * t.amt)}</td></tr>`).join("") + "</tbody>";
    } catch (e) { $("xBookInfo").innerHTML = `<span class="neg">${esc(e.message)}</span>`; }
  }
  async function idxHist(kind) {
    document.querySelectorAll("#xHistTabs .seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.h === kind)); const p = ix.pair, el = $("xHist");
    if (!p) { el.innerHTML = '<tbody><tr><td class="note">Pilih koin dulu (tiket order, tab Pasar, atau Portofolio).</td></tr></tbody>'; return; }
    el.innerHTML = '<tbody><tr><td class="status">Memuat…</td></tr></tbody>'; const T = (s) => (s ? new Date(+s).toLocaleString("id-ID") : ""), sym = p.base + "idr", B = p.base.toUpperCase();
    try {
      if (kind === "orderHistory") { const j = await idxRead("orderHistory", { symbol: sym }), L = Array.isArray(j) ? j : j.data || [];
        el.innerHTML = L.length ? `<thead><tr><th>Waktu</th><th>Sisi</th><th>Jenis</th><th>Harga</th><th>Jumlah</th><th>Terisi</th><th>Status</th></tr></thead><tbody>` + L.map((o) => `<tr><td>${T(o.submitTime || o.time)}</td><td class="${/BUY/i.test(o.side) ? "pos" : "neg"}">${esc(o.side)}</td><td>${esc(o.type || "")}</td><td>${fmtNum(+o.price)}</td><td>${esc(String(o.origQty ?? o.oriQty ?? ""))}</td><td>${esc(String(o.executedQty ?? ""))}</td><td>${esc(o.status || "")}</td></tr>`).join("") + "</tbody>"
          : `<tbody><tr><td class="note">Tidak ada order ${B} dalam 7 hari terakhir (batas API Indodax v2).</td></tr></tbody>`; }
      else if (kind === "tradeHistory") { const j = await idxRead("myTrades", { symbol: sym }), L = Array.isArray(j) ? j : j.data || []; let bq = 0, bi = 0, sq = 0, si = 0, fee = 0;
        for (const t of L) { const q = +t.qty || 0, v = +t.quoteQty || q * +t.price; fee += +t.commission || 0; if (t.isBuyer) { bq += q; bi += v; } else { sq += q; si += v; } }
        el.innerHTML = L.length ? `<thead><tr><th>Waktu</th><th>Sisi</th><th>Harga</th><th>Jumlah</th><th>Nilai (Rp)</th><th>Fee</th></tr></thead><tbody>` + L.map((t) => `<tr><td>${T(t.time)}</td><td class="${t.isBuyer ? "pos" : "neg"}">${t.isBuyer ? "beli" : "jual"}</td><td>${fmtNum(+t.price)}</td><td>${nf(8).format(+t.qty || 0)}</td><td>${nf(0).format(+t.quoteQty || 0)}</td><td>${esc(String(t.commission ?? ""))} ${esc(String(t.commissionAsset || ""))}</td></tr>`).join("") +
          `<tr><td colspan="6" class="note">Rata-rata beli ${bq ? "Rp " + fmtNum(bi / bq) : "–"} (${nf(8).format(bq)}) · rata-rata jual ${sq ? "Rp " + fmtNum(si / sq) : "–"} (${nf(8).format(sq)})${bq && p.last ? ` · harga kini vs rata-rata beli: <b class="${cls(p.last / (bi / bq) - 1)}">${spct(p.last / (bi / bq) - 1, 1)}</b>` : ""} · total fee ${nf(0).format(fee)}</td></tr></tbody>`
          : `<tbody><tr><td class="note">Tidak ada trade ${B} dalam 7 hari terakhir (batas API Indodax v2).</td></tr></tbody>`; }
      else { const [dp, wd] = await Promise.all([idxRead("deposits", { coin: B }).catch((e) => ({ err: e.message })), idxRead("withdrawals", { coin: B }).catch((e) => ({ err: e.message }))]);
        const rows = [...(Array.isArray(dp) ? dp : []).map((x) => ({ k: "deposit", t: x.insertTime, amt: x.amount, fee: "", st: x.status })), ...(Array.isArray(wd) ? wd : []).map((x) => ({ k: "penarikan", t: x.applyTime, amt: x.amount, fee: x.transactionFee, st: x.status }))].sort((a, b) => (+b.t || 0) - (+a.t || 0));
        el.innerHTML = rows.length ? `<thead><tr><th>Waktu</th><th>Jenis</th><th>Jumlah ${esc(B)}</th><th>Fee</th><th>Status</th></tr></thead><tbody>` + rows.map((x) => `<tr><td>${T(x.t)}</td><td class="${x.k === "deposit" ? "pos" : "neg"}">${x.k}</td><td>${esc(String(x.amount ?? x.amt ?? ""))}</td><td>${esc(String(x.fee ?? ""))}</td><td>${esc(String(x.st ?? ""))}</td></tr>`).join("") + "</tbody>"
          : `<tbody><tr><td class="note">Tidak ada deposit/penarikan ${B} dalam 90 hari.${dp.err || wd.err ? " " + esc(dp.err || wd.err) : ""}</td></tr></tbody>`; }
    } catch (e) { el.innerHTML = `<tbody><tr><td class="status err">${esc(e.message)}</td></tr></tbody>`; }
  }
  function setXTab(t) { ix.tab = t; document.querySelectorAll("#xTabs .tab").forEach((b) => b.classList.toggle("active", b.dataset.xt === t)); document.querySelectorAll("#idxPane .x-pane").forEach((p) => (p.hidden = p.dataset.xp !== t));
    if (t === "pf") idxBalance(); else if (t === "mkt") idxMarket(); else if (t === "book") idxBook(); else if (t === "open") idxOpenOrders(); else if (t === "hist" && ix.pair) idxHist(ix.histKind || "tradeHistory"); else if (t === "auto") { drawAuto(); auLoop(); } }
  function bindIdxMenu() {
    $("xTabs").addEventListener("click", (e) => { const b = e.target.closest(".tab[data-xt]"); if (b) setXTab(b.dataset.xt); });
    $("xHistTabs").addEventListener("click", (e) => { const b = e.target.closest("[data-h]"); if (b) { ix.histKind = b.dataset.h; idxHist(b.dataset.h); } });
    $("xMktQ").addEventListener("input", () => idxMarket());
    $("idxPane").addEventListener("click", (e) => { const t = e.target;
      const s = t.closest("[data-xs]"); if (s) { ix.mktSort = s.dataset.xs; idxMarket(); return; }
      const by = t.closest("[data-xbuy]"); if (by) { idxPick(by.dataset.xbuy, "buy", { reset: true }); return; }
      const sl = t.closest("[data-xsell]"); if (sl) { const c = sl.dataset.xsell; idxPick(c, "sell", { reset: true, amt: ix.bal && ix.bal[c] ? ix.bal[c] : null }); return; }
      const bk = t.closest("[data-xbook]"); if (bk) { const p = coinOf(bk.dataset.xbook); if (p) { ix.pair = p; idxPick(p.base); } setXTab("book"); return; }
      const an = t.closest("[data-xana]"); if (an) { openDetail(an.dataset.xana.toUpperCase() + "-USD"); return; }
      const lv = t.closest("tr.x-lv"); if (lv) { idxPick(ix.pair.base, null, { price: lv.dataset.xpx }); return; } });
    setInterval(() => { if ($("idxPane").hidden || document.hidden || !isOwner()) return; if (ix.tab === "book") idxBook(); else if (ix.tab === "mkt") { idxPairsLoad(true).then(idxMarket); } }, 15000);
  }
  async function idxOpenOrders() {
    try { const L = await idxRead("openOrders"), rows = Array.isArray(L) ? L : [];
      $("xOpen").innerHTML = rows.length ? `<thead><tr><th>Pair</th><th>Sisi</th><th>Jenis</th><th>Harga</th><th>Jumlah</th><th>Terisi</th><th>Waktu</th><th></th></tr></thead><tbody>` + rows.map((x) => `<tr><td>${esc(String(x.symbol).toUpperCase())}</td><td class="${/BUY/i.test(x.side) ? "pos" : "neg"}">${esc(x.side)}</td><td>${esc(x.type || "")}</td><td>${fmtNum(+x.price)}</td>
        <td>${esc(String(x.origQty ?? ""))}</td><td>${esc(String(x.executedQty ?? ""))}</td><td>${x.time ? new Date(+x.time).toLocaleString("id-ID") : ""}</td>
        <td><button class="x-btn" data-xcancel="${esc(String(x.orderId))}" data-sym="${esc(String(x.symbol).toLowerCase())}">Batal</button></td></tr>`).join("") + "</tbody>" : '<tbody><tr><td class="note">Tidak ada order terbuka.</td></tr></tbody>';
    } catch (e) { $("xOpen").innerHTML = `<tbody><tr><td class="status err">${esc(e.message)}</td></tr></tbody>`; }
  }


  // ---------- tiket order di dalam Analisis 1 aset ----------
  // Tiket yang sama dipindah antara F6 dan kartu Order di Analisis, jadi aturan & riwayatnya satu.
  let tcTab = "demo";
  function idxPairFor(sym) { const m = String(sym || "").toUpperCase().match(/^([A-Z0-9]+)-(USDT?|IDR)$/); if (!m || !ix.pairs) return null; return ix.pairs.find((p) => p.base === m[1].toLowerCase()) || null; }
  function mountTicket(where) {
    const demo = $("demoTicket"), idx = $("idxTicket");
    if (where === "analysis") { const want = tcTab === "idx" && !$("tcTabIdx").hidden ? idx : demo; const other = want === demo ? idx : demo;
      $("tcBody").appendChild(want); (other === demo ? $("demoPane") : $("idxPane")).prepend(other); }
    else { $("demoPane").prepend(demo); $("idxPane").prepend(idx); }
  }
  async function syncTradeCard() {
    if (!state.data || state.mode !== "price" || !pp.a) return;
    const sym = state.data.symbol; $("tcSym").textContent = sym;
    if (isOwner() && !ix.pairs) { try { const j = await (await apiFetch(`${API}?action=indodax_pairs`)).json(); ix.pairs = j.pairs || []; } catch { ix.pairs = []; } }
    const pair = isOwner() ? idxPairFor(sym) : null; $("tcTabIdx").hidden = !pair; if (!pair && tcTab === "idx") tcTab = "demo";
    document.querySelectorAll("#tcTabs .seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.t === tcTab));
    if (!$("detailView").hidden) mountTicket("analysis");
    if ($("dSym").value !== sym) { $("dSym").value = sym; $("dQty").value = ""; }
    pp.q[sym] = pp.q[sym] || (state.res ? { symbol: sym, price: state.res.s0, currency: state.data.currency } : undefined);
    if (pair) { ix.pair = pair; $("xPair").value = pair.base.toUpperCase(); if (!$("xPrice").value) $("xPrice").value = pair.last || ""; if (tcTab === "idx") idxInit(); }
    ppQuotes([sym]).then(() => { ppPreview(); renderTcPos(); if (pair) idxPreview(); });
    renderTcPos();
  }
  function renderTcPos() {
    const sym = state.data && state.data.symbol, p = pp.a && pp.a.pos[sym], q = pp.q[sym], open = pp.a ? pp.a.orders.filter((o) => o.s === sym).length : 0;
    if (!p) { $("tcPos").innerHTML = `Belum punya posisi demo di ${esc(sym || "")}. Kas demo ${big(pp.a ? pp.a.cash : 0, "IDR")}.${open ? ` ${open} order limit menunggu.` : ""}`; }
    else { const fx = fxOf(sym), v = q ? p.units * q.price * fx : NaN, g = v - p.cost;
      $("tcPos").innerHTML = `Posisi demo: <b>${kindOf(sym) === "idx" ? nf(0).format(p.units / 100) + " lot" : nf(6).format(p.units)}</b> · rata-rata ${fmtNum(p.cost / p.units / fx)} · nilai ${big(v, "IDR")} · <span class="${cls(g)}">${g >= 0 ? "+" : ""}${big(g, "IDR")} (${spct(g / p.cost)})</span>${open ? ` · ${open} order limit menunggu` : ""}`; }
    const sig = state.sig && state.sig.now ? state.sig.now.score : null;
    $("tcNote").innerHTML = tcTab === "idx" ? "<b>Uang asli</b> lewat Indodax (pasangan IDR). Konfirmasi ketik ulang wajib." : `Order demo memakai harga live; tercatat di akun demo.${act.plan && act.plan.px ? ` Rencana aksi: <b>${act.plan.action}</b>${act.plan.action !== "JUAL" ? ` · antre ${fmtNum(act.plan.entry)} · stop ${fmtNum(act.plan.stop)} · target ${fmtNum(act.plan.t1)}` : ""}.` : sig != null ? ` Sinyal teknikal: <b>${sig >= 2 ? "BELI" : sig <= -2 ? "JUAL" : "TAHAN"}</b>.` : ""}`;
  }
  function bindTrade() {
    ppLoad(); if (Array.isArray(settings.idxLog)) ix.log = settings.idxLog;
    $("trTabIdx").hidden = !isOwner();
    $("tcTabs").addEventListener("click", (e) => { const b = e.target.closest(".seg-btn[data-t]"); if (!b || b.hidden) return; tcTab = b.dataset.t; syncTradeCard(); });
    $("trTabs").addEventListener("click", (e) => { const b = e.target.closest(".seg-btn[data-t]"); if (b) setTradeTab(b.dataset.t); });
    $("dSide").addEventListener("click", (e) => { const b = e.target.closest(".seg-btn"); if (!b) return; pp.side = b.dataset.s; document.querySelectorAll("#dSide .seg-btn").forEach((x) => x.classList.toggle("active", x === b)); $("dSend").textContent = pp.side === "buy" ? "Kirim order beli demo" : "Kirim order jual demo"; ppPreview(); });
    attachAC($("dSym"), { onPick: (sym) => { $("dSym").value = sym; ppQuotes([sym]).then(ppPreview); } });
    ["dType", "dLimit", "dQty", "dStop", "dT1", "dT2"].forEach((id) => $(id).addEventListener("input", ppPreview));
    $("dSym").addEventListener("change", () => ppQuotes([normTicker($("dSym").value.trim())]).then(ppPreview));
    $("dPreview").addEventListener("click", (e) => { if (e.target.id === "dLoadPx") { e.preventDefault(); ppQuotes([normTicker($("dSym").value.trim())]).then(ppPreview); } });
    $("dSend").onclick = ppSend; $("dRefresh").onclick = refreshPaper;
    $("dReset").onclick = () => { const v = Math.max(1e6, parseFloat($("dStart").value) || 100e6); if (!confirmReset()) return; pp.a = newPaper(v); ppSave(); renderPaper(); toast("Akun demo direset."); };
    $("tradeView").addEventListener("click", (e) => {
      const s = e.target.closest(".pf-sym[data-s]"); if (s) { openDetail(s.dataset.s); return; }
      const sa = e.target.closest("[data-sellall]"); if (sa) { const sym = sa.dataset.sellall, p = pp.a.pos[sym]; pp.side = "sell"; document.querySelectorAll("#dSide .seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.s === "sell"));
        $("dSym").value = sym; $("dType").value = "market"; $("dQty").value = kindOf(sym) === "idx" ? p.units / 100 : p.units; ppPreview(); $("dSym").scrollIntoView({ block: "center" }); return; }
      const dc = e.target.closest("[data-dcancel]"); if (dc) { pp.a.orders.splice(+dc.dataset.dcancel, 1); ppSave(); renderPaper(); return; }
      const db = e.target.closest("[data-dbrk]"); if (db) { const p = pp.a.pos[db.dataset.dbrk]; if (p) { delete p.brk; ppSave(); renderPaper(); } return; }
      const xc = e.target.closest("[data-xcancel]"); if (xc) { idxCall("cancelOrder", { symbol: xc.dataset.sym, orderId: xc.dataset.xcancel }).then(() => { toast("Order Indodax dibatalkan."); idxOpenOrders(); }).catch((er) => toast("Gagal batal: " + er.message)); } });
    // Indodax
    $("xSide").addEventListener("click", (e) => { const b = e.target.closest(".seg-btn"); if (!b) return; ix.side = b.dataset.s; document.querySelectorAll("#xSide .seg-btn").forEach((x) => x.classList.toggle("active", x === b)); idxPreview(); });
    $("xPair").addEventListener("input", () => { const v = $("xPair").value.trim().toLowerCase(), ul = $("xSugg"); if (!v || !ix.pairs) { ul.hidden = true; return; }
      const m = ix.pairs.filter((p) => p.base.startsWith(v) || String(p.name).toLowerCase().includes(v)).slice(0, 10);
      ul.innerHTML = m.map((p) => `<li data-pair="${esc(p.pair)}"><div class="left"><b>${esc(p.base.toUpperCase())}</b></div><span>Rp ${fmtNum(p.last)} · vol Rp ${big(p.volIdr)}</span></li>`).join(""); ul.hidden = !m.length; });
    $("xSugg").addEventListener("mousedown", (e) => { const li = e.target.closest("li[data-pair]"); if (!li) return; e.preventDefault(); ix.pair = ix.pairs.find((p) => p.pair === li.dataset.pair); $("xPair").value = ix.pair.base.toUpperCase(); $("xSugg").hidden = true;
      if (!$("xPrice").value) $("xPrice").value = ix.pair.last || ""; idxPreview(); });
    $("xPair").addEventListener("blur", () => setTimeout(() => ($("xSugg").hidden = true), 150));
    ["xType", "xPrice", "xAmt"].forEach((id) => $(id).addEventListener("input", idxPreview));
    $("xSend").onclick = idxReview; $("xBal").onclick = idxBalance; $("xOpenBtn").onclick = idxOpenOrders; bindIdxMenu(); bindAuto(); bindAp(); bindAm();
    $("wiDemo").onclick = () => { const amt = parseFloat($("wiAmt").value) || 0, s = state.data.symbol, px = state.res.s0, k = kindOf(s);
      openTrade(s, "buy"); $("dType").value = "market"; $("dQty").value = k === "idx" ? Math.floor(amt / (px * 100 * 1.0015)) : +(amt / px / (k === "crypto" ? (pp.fx || 16000) : state.data.currency === "IDR" ? 1 : (pp.fx || 16000))).toFixed(6); setTimeout(ppPreview, 400); };
    pp.timer = setInterval(() => { if (!document.hidden && (pp.a.orders.length || hasBrk())) refreshPaper(); }, 60000);
  }
  const confirmReset = () => window.confirm("Reset akun demo? Semua posisi dan riwayat demo akan dihapus.");

  // =====================================================================
  // STRATEGI (50 harian + noise band intraday)
  // =====================================================================
  const st = { res: null, all: null, nb: null, ror: "s", D: null, sym: null };
  function buildD(d) { // OHLCV disesuaikan dividen/split memakai rasio adjclose/close
    const adj = new Map(d.dates.map((x, i) => [x, d.values[i]])), D = { d: [], o: [], h: [], l: [], c: [], v: [] };
    for (const b of d.ohlc) { const a = adj.get(b[0]); const f = a && b[4] ? a / b[4] : 1; D.d.push(b[0]); D.o.push(b[1] * f); D.h.push(b[2] * f); D.l.push(b[3] * f); D.c.push(b[4] * f); D.v.push(b[5] || 0); }
    if (!D.c.length) { d.dates.forEach((x, i) => { const v = d.values[i]; D.d.push(x); D.o.push(v); D.h.push(v); D.l.push(v); D.c.push(v); D.v.push(0); }); }
    D.n = D.c.length; return D;
  }
  function stratOpts() { return { costBps: Math.max(0, parseFloat($("sCost").value) || 0), short: $("sShort").checked, split: 0.7, rf: DAMO.biRate }; }
  async function stratData() {
    const sym = normTicker($("sSym").value.trim() || state.symbol); $("sSym").value = sym;
    const d = await fetchSymbol(sym, $("sRange").value); st.sym = d.symbol; st.D = buildD(d); st.cur = d.currency; return st.D;
  }
  async function runOneStrategy() {
    $("sRun").disabled = true; $("sStatus").classList.remove("err"); $("sStatus").textContent = "Mengambil data & menjalankan…";
    try { const D = await stratData(); if (D.n < 120) throw new Error("Data terlalu pendek (butuh ≥ 120 hari).");
      st.res = await compute("strat", { id: $("sPick").value, D, o: stratOpts() }); st.nb = null; renderStratResult();
      $("sStatus").textContent = `${st.res.name} · ${esc(st.sym)} · ${D.d[0]} s/d ${D.d[D.n - 1]}`;
    } catch (e) { $("sStatus").textContent = e.message; $("sStatus").classList.add("err"); }
    finally { $("sRun").disabled = false; }
  }
  async function runAllStrats() {
    $("sAll").disabled = true; $("sStatus").classList.remove("err"); $("sStatus").textContent = "Menjalankan 50 strategi…";
    try { const D = await stratData(); st.all = await compute("stratAll", { D, o: stratOpts() }); st.allSort = st.allSort || "oosSharpe"; renderStratAll(); $("sStatus").textContent = `50 strategi diuji pada ${esc(st.sym)}.`; }
    catch (e) { $("sStatus").textContent = e.message; $("sStatus").classList.add("err"); }
    finally { $("sAll").disabled = false; }
  }
  const kpiHtml = (L) => L.map(([k, v, h]) => `<div class="kpi"><div class="k">${k}</div><div class="v">${v}</div><div class="h">${h || ""}</div></div>`).join("");
  function renderStratResult() {
    const R = st.res; if (!R) return; const A = R.all, B = R.bh;
    $("sKpi").innerHTML = kpiHtml([["Rate of return total", pc(A.total), `beli & tahan ${spct(B.total)}`], ["CAGR (per tahun)", pc(A.cagr), `beli & tahan ${spct(B.cagr)}`],
      ["Sharpe", nf(2).format(A.sharpe), `OOS ${nf(2).format(R.oos.sharpe)} vs B&H ${nf(2).format(R.oosBh.sharpe)}`], ["Max drawdown", pct(A.maxDD), `beli & tahan ${pct(B.maxDD)}`],
      ["Transaksi", `${R.nTrades}`, isFinite(R.winRate) ? `${pct(R.winRate, 0)} untung · rata-rata ${spct(R.avgTrade)}` : "–"], ["Waktu di pasar", pct(R.exposure, 0), isFinite(R.avgDays) ? `rata-rata pegang ${nf(0).format(R.avgDays)} hari` : ""],
      ["Profit factor", isFinite(R.profitFactor) ? nf(2).format(R.profitFactor) : "–", "> 1,5 bagus"], ["Sortino / Calmar", `${nf(2).format(A.sortino)} / ${nf(2).format(A.calmar)}`, ""],
      ["Peluang untung asli", isFinite(R.dsr) ? pct(R.dsr, 0) : "–", "PSR: Sharpe > 0 bukan kebetulan"], ["Konsisten", `${R.consist.k}/${R.consist.of} periode`, "≥ beli-dan-tahan per potongan waktu"],
      ["Biaya impas", isFinite(R.beBps) ? (R.beBps > 0 ? `${nf(0).format(R.beBps)} bps` : "rugi sebelum biaya") : "tidak bertransaksi", `biayamu ${nf(0).format(stratOpts().costBps)} bps per transaksi`]]);
    const beat = R.oos.sharpe > R.oosBh.sharpe;
    $("sNowCard").hidden = false; $("sNowTag").textContent = R.name;
    const pos = R.pos, act = pos > 0 && !(R.posPrev > 0) ? "BELI (sinyal baru)" : pos > 0 ? "PEGANG" : pos < 0 ? "SHORT" : R.posPrev > 0 ? "JUAL (sinyal baru)" : "DI LUAR PASAR";
    $("sNow").innerHTML = `<div class="sig-verdict ${pos > 0 ? "buy" : pos < 0 || R.posPrev > 0 ? "sell" : "hold"}" style="max-width:360px"><div class="big" style="font-size:24px">${act}</div><div class="note">${esc(st.sym)} · posisi untuk hari bursa berikutnya${pos > 0 && pos < 1 ? ` · ukuran ${pct(pos, 0)}` : ""}</div></div>
      <p class="${beat ? "" : "neg"}">${beat ? "Di periode out-of-sample strategi ini mengalahkan beli-dan-tahan untuk aset ini." : "Di periode out-of-sample strategi ini <b>tidak</b> mengalahkan beli-dan-tahan untuk aset ini. Jadikan info tambahan, bukan perintah."}</p>
      <div class="fn-actions">${pos > 0 ? `<button class="fn-key" data-sorder="buy">Beli di akun demo</button>` : ""}${pos <= 0 ? `<button class="fn-key" data-sorder="sell">Jual posisi demo</button>` : ""}<button class="fn-key" data-cmd="${esc(st.sym)}">Buka analisis ${esc(st.sym)}</button></div>`;
    // kurva Rp 1
    const step = Math.max(1, Math.floor(R.dates.length / 600)), lab = R.dates.filter((_, i) => i % step === 0);
    $("sEqCard").hidden = false; $("sEqNote").textContent = `Garis putus = pemisah in-sample / out-of-sample (${R.splitDate}). Skala logaritmik.`;
    const split = { id: "split", afterDatasetsDraw(ch) { const i = lab.findIndex((d) => d >= R.splitDate); if (i < 0) return; const x = ch.scales.x.getPixelForValue(i), c = ch.ctx; c.save(); c.strokeStyle = css("--muted"); c.setLineDash([4, 4]); c.beginPath(); c.moveTo(x, ch.chartArea.top); c.lineTo(x, ch.chartArea.bottom); c.stroke(); c.restore(); } };
    if (state.charts.sEq) state.charts.sEq.destroy();
    state.charts.sEq = new Chart($("sEq"), { type: "line", plugins: [split], data: { labels: lab, datasets: [
      { label: R.name, data: A.curve.slice(1).filter((_, i) => i % step === 0), borderColor: css("--accent"), borderWidth: 1.8, pointRadius: 0 },
      { label: "Beli & tahan", data: B.curve.slice(1).filter((_, i) => i % step === 0), borderColor: css("--muted"), borderWidth: 1.2, pointRadius: 0 }] },
      options: baseOpts({ plugins: { legend: { labels: { boxWidth: 10 } }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: Rp ${nf(2).format(c.raw)}` } } }, scales: { x: { ticks: { maxTicksLimit: 7 }, grid: { display: false } }, y: { type: "logarithmic", grid: { color: css("--grid") } } } }) });
    renderRor(R.periods, R.periodsBh);
    const T = R.trades.slice(-60).reverse(); $("sTrCard").hidden = !T.length;
    $("sTrades").innerHTML = `<thead><tr><th>Masuk</th><th>Keluar</th><th>Sisi</th><th>Harga masuk</th><th>Harga keluar</th><th>Lama</th><th>Return</th></tr></thead><tbody>` + T.map((t) => `<tr><td>${t.in}</td><td>${t.out || "masih terbuka"}</td><td>${t.side > 0 ? "beli" : "short"}</td><td>${fmtNum(t.px)}</td><td>${fmtNum(t.pxOut)}</td><td>${nf(0).format(t.days)} hr</td><td>${pc(t.ret)}</td></tr>`).join("") + "</tbody>";
    $("nbCard").hidden = true;
  }
  function renderRor(P, Pb) {
    st.P = P; st.Pb = Pb; const X = st.ror === "s" ? P : Pb; if (!X) return; $("sRorCard").hidden = false;
    const years = Object.keys(X.yearly).sort(), mon = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
    const heat = (v) => (v == null ? "" : `background:${v >= 0 ? `rgba(46,196,169,${Math.min(0.55, Math.abs(v) * 4).toFixed(2)})` : `rgba(255,107,104,${Math.min(0.55, Math.abs(v) * 4).toFixed(2)})`}`);
    $("sRor").className = "heat ror";
    $("sRor").innerHTML = `<thead><tr><th>Tahun</th>${mon.map((m) => `<th>${m}</th>`).join("")}<th>Setahun</th></tr></thead><tbody>` + years.map((y) => `<tr><td>${y}</td>${mon.map((_, i) => { const k = `${y}-${String(i + 1).padStart(2, "0")}`, v = X.monthly[k]; return `<td style="${heat(v)}">${v == null ? "" : spct(v, 1)}</td>`; }).join("")}<td style="${heat(X.yearly[y])}"><b>${spct(X.yearly[y], 1)}</b></td></tr>`).join("") + "</tbody>";
  }
  function renderStratAll() {
    const A = st.all; if (!A) return; $("sAllCard").hidden = false; const k = st.allSort, L = A.list.filter((x) => !x.error).slice().sort((a, b) => (b[k] ?? -9) - (a[k] ?? -9));
    const cols = [["name", "Strategi"], ["cat", "Jenis"], ["total", "Return total"], ["cagr", "CAGR"], ["sharpe", "Sharpe"], ["oosSharpe", "Sharpe OOS"], ["dsr", "DSR"], ["ck", "Konsisten"], ["maxDD", "Max DD"], ["nTrades", "Transaksi"], ["pos", "Sinyal kini"]];
    L.forEach((x) => (x.ck = x.consist ? x.consist.k + (x.pass ? 10 : 0) : 0));
    $("sAllTable").innerHTML = `<thead><tr>${cols.map(([c, n]) => `<th data-s="${c}" class="${c === k ? "sorted" : ""}" style="cursor:pointer">${n}${c === k ? " ↓" : ""}</th>`).join("")}</tr></thead><tbody>` +
      `<tr class="best"><td><b>Beli & tahan</b></td><td>patokan</td><td>${pc(A.bh.total)}</td><td>${pc(A.bh.cagr)}</td><td>${nf(2).format(A.bh.sharpe)}</td><td>${nf(2).format(A.bh.oosSharpe)}</td><td></td><td></td><td>${pct(A.bh.maxDD)}</td><td>1</td><td>BELI</td></tr>` +
      L.map((x) => `<tr${x.pass ? ' class="pass"' : ""}><td><a href="#" data-spick="${x.id}">${esc(x.name)}</a>${x.pass ? ' <span class="pill pos" title="Lolos: DSR ≥ 90%, konsisten ≥ 3/5, Sharpe penuh & OOS > beli-dan-tahan, ≥ 5 transaksi">lolos</span>' : ""}</td><td>${esc(x.cat)}</td><td>${pc(x.total)}</td><td>${pc(x.cagr)}</td><td>${nf(2).format(x.sharpe)}</td><td class="${x.oosSharpe > A.bh.oosSharpe ? "pos" : ""}">${nf(2).format(x.oosSharpe)}</td>
        <td class="${x.dsr >= 0.9 ? "pos" : x.dsr < 0.5 ? "neg" : ""}">${isFinite(x.dsr) ? pct(x.dsr, 0) : "–"}</td><td>${x.consist ? `${x.consist.k}/${x.consist.of}` : "–"}</td><td>${pct(x.maxDD)}</td><td>${x.nTrades}</td>
        <td>${x.pos > 0 && !(x.posPrev > 0) ? '<span class="pill pos">BELI baru</span>' : x.pos > 0 ? '<span class="pos">pegang</span>' : x.posPrev > 0 ? '<span class="pill neg">JUAL baru</span>' : '<span class="note">di luar</span>'}</td></tr>`).join("") + "</tbody>";
    const best = L.slice().sort((a, b) => b.oosSharpe - a.oosSharpe)[0], beatLuck = L.filter((x) => x.oosSharpe > A.luckSharpe).length, beatBh = L.filter((x) => x.oosSharpe > A.bh.oosSharpe).length;
    const buys = L.filter((x) => x.pos > 0).length;
    $("sAllNote").textContent = `OOS sejak ${A.splitDate} (${nf(1).format(A.yrsOos)} th) · ${buys}/50 strategi sedang di posisi beli`;
    $("sLuck").innerHTML = `Dengan 50 strategi dan ${nf(1).format(A.yrsOos)} tahun data out-of-sample, Sharpe OOS sekitar <b>${nf(2).format(A.luckSharpe)}</b> bisa muncul <b>hanya karena kebetulan</b> walau tidak ada strategi yang benar-benar bagus. ` +
      `Terbaik di sini: <b>${esc(best.name)}</b> (${nf(2).format(best.oosSharpe)}). ${beatLuck ? `${beatLuck} strategi melewati ambang kebetulan.` : "Tidak ada yang melewati ambang kebetulan."} ${beatBh}/50 mengalahkan beli-dan-tahan di OOS.<br>` +
      `<b>Lolos uji keandalan: ${A.nPass}/50.</b> Syarat lolos: DSR ≥ 90% (Sharpe dikoreksi untuk 50 percobaan, kemencengan & ekor gemuk), konsisten di ≥ 3 dari 5 potongan waktu, dan mengalahkan beli-dan-tahan di seluruh data maupun OOS. ${A.nPass ? "Hanya strategi berlabel <b>lolos</b> yang dipakai Rencana aksi di layar Analisis." : "Karena tidak ada yang lolos, Rencana aksi di Analisis akan memberi tingkat keyakinan <b>rendah</b>."}` +
      (A.wf ? `<br><b>Uji jujur "pilih yang teratas":</b> sejak ${A.wf.from}, kalau tiap periode kamu memakai strategi dengan Sharpe terbaik <i>sampai saat itu</i>, hasilnya Sharpe <b class="${A.wf.s.sharpe > A.wf.b.sharpe ? "pos" : "neg"}">${nf(2).format(A.wf.s.sharpe)}</b> (return ${spct(A.wf.s.total)}) vs beli-dan-tahan ${nf(2).format(A.wf.b.sharpe)} (${spct(A.wf.b.total)}). ${A.wf.s.sharpe > A.wf.b.sharpe ? "Memilih dari peringkat ini pernah memberi nilai tambah untuk aset ini." : "Artinya memilih juara peringkat <b>tidak</b> menambah nilai untuk aset ini — juara masa lalu jarang tetap juara."} <span class="note">Pilihan per periode: ${A.wf.picks.map((p) => `${p.from}: ${esc(p.name)}`).join(" · ")}</span>` : "");
  }
  async function runNoise() {
    $("nbRun").disabled = true; $("sStatus").classList.remove("err"); const iv = $("nbIv").value, sym = normTicker($("sSym").value.trim() || state.symbol); $("sSym").value = sym;
    $("sStatus").textContent = `Mengambil data ${iv}…`;
    try { let j = null; const crypto = /-USDT?$/i.test(sym);
      if (crypto) { const days = { "5m": 60, "15m": 180, "30m": 365, "60m": 730 }[iv] || 365, end = Math.floor(Date.now() / 1000);
        try { j = await (await apiFetch(`${API}?action=flow&symbol=${encodeURIComponent(sym)}&interval=${iv}&start=${end - days * 86400}&end=${end}`)).json(); if (j.error) j = null; } catch { j = null; } }
      if (!j) j = await (await apiFetch(`${API}?action=intraday&symbol=${encodeURIComponent(sym)}&interval=${iv}`)).json();
      if (j.error || !Array.isArray(j.bars) || j.bars.length < 50) throw new Error(j.error || "Data intraday terlalu sedikit.");
      const mins = { "5m": 5, "15m": 15, "30m": 30, "60m": 60 }[iv], every = Math.max(1, Math.round(parseInt($("nbEvery").value, 10) / mins));
      const R = await compute("noise", { bars: j.bars, o: { lookback: parseInt($("nbLook").value, 10) || 14, every, vwapStop: $("nbVwap").checked, short: $("nbShort").checked, costBps: Math.max(0, parseFloat($("sCost").value) || 0) / 2, gmtoffset: j.gmtoffset || 0 } });
      if (!R.nDays) throw new Error("Belum cukup hari untuk lookback; coba data per jam.");
      st.nb = R; st.res = null; renderNoise(R, sym, iv, j);
      $("sStatus").textContent = `Noise band · ${esc(sym)} · ${R.nDays} hari diuji (${iv})`;
    } catch (e) { $("sStatus").textContent = e.message; $("sStatus").classList.add("err"); }
    finally { $("nbRun").disabled = false; }
  }
  function renderNoise(R, sym, iv, j) {
    const A = R.all, B = R.bh;
    $("sKpi").innerHTML = kpiHtml([["Rate of return total", pc(A.total), `beli & tahan ${spct(B.total)}`], ["CAGR (setahun)", pc(A.cagr), `${R.nDays} hari diuji`], ["Sharpe", nf(2).format(A.sharpe), `beli & tahan ${nf(2).format(B.sharpe)}`],
      ["Max drawdown", pct(A.maxDD), `beli & tahan ${pct(B.maxDD)}`], ["Transaksi", `${R.nTrades}`, isFinite(R.winRate) ? `${pct(R.winRate, 0)} untung · rata-rata ${spct(R.avgTrade, 2)}` : ""],
      ["Biaya impas", isFinite(R.beBps) ? (R.beBps > 0 ? `${nf(1).format(R.beBps)} bps` : "rugi sebelum biaya") : "–", `per sisi transaksi; biayamu ${nf(1).format(Math.max(0, parseFloat($("sCost").value) || 0) / 2)} bps`]]);
    $("sNowCard").hidden = false; $("sNowTag").textContent = "Noise band";
    const ageMin = (Date.now() / 1000 - (R.lastT || 0)) / 60, src = j.source === "binance" ? "Binance (real-time)" : "Yahoo";
    const N = R.now; $("sNow").innerHTML = N ? `<p>Harga terakhir <b>${fmtNum(N.px)}</b> · batas atas <b class="pos">${fmtNum(N.up)}</b> · batas bawah <b class="neg">${fmtNum(N.lo)}</b> · VWAP ${fmtNum(N.vwap)}</p><p>Status: <b>${N.state}</b>. Strategi ini <b>intraday</b>: posisi selalu ditutup sebelum pasar tutup.</p>` : "";
    $("sNow").innerHTML += `<p class="note">Sumber ${src} · bar terakhir ${new Date(((R.lastT || 0) + (j.gmtoffset || 0)) * 1000).toISOString().slice(0, 16).replace("T", " ")} waktu bursa (${ageMin < 90 ? `${nf(0).format(ageMin)} menit lalu` : "pasar tutup / data lama"}).${j.source !== "binance" ? " Data saham Yahoo bisa tertunda ±10–15 menit, jadi pakai untuk menguji strategi, bukan untuk eksekusi detik-per-detik." : ""}
      ${isFinite(R.beBps) && R.beBps > 0 && R.beBps < Math.max(0, parseFloat($("sCost").value) || 0) / 2 * 1.5 ? " <b class='neg'>Biaya transaksimu mendekati/melewati biaya impas — keunggulannya habis dimakan biaya.</b>" : ""}</p>`;
    $("sEqCard").hidden = false; $("sEqNote").textContent = "Strategi intraday (tidak menginap) vs menahan aset. Skala logaritmik.";
    const lab = R.days.map((x) => x.d);
    if (state.charts.sEq) state.charts.sEq.destroy();
    state.charts.sEq = new Chart($("sEq"), { type: "line", data: { labels: lab, datasets: [{ label: "Noise band", data: A.curve.slice(1), borderColor: css("--accent"), borderWidth: 1.8, pointRadius: 0 }, { label: "Beli & tahan", data: B.curve.slice(1), borderColor: css("--muted"), borderWidth: 1.2, pointRadius: 0 }] },
      options: baseOpts({ plugins: { legend: { labels: { boxWidth: 10 } } }, scales: { x: { ticks: { maxTicksLimit: 7 }, grid: { display: false } }, y: { type: "logarithmic", grid: { color: css("--grid") } } } }) });
    renderRor(R.periods, null); st.ror = "s";
    const L = R.lastDay, off = j.gmtoffset || 0, tl = L.t.map((t) => new Date((t + off) * 1000).toISOString().slice(11, 16)), px = j.bars.slice(-L.t.length).map((b) => b[4]);
    $("nbCard").hidden = false; $("nbNow").textContent = `Hari ${R.days.length ? R.days[R.days.length - 1].d : ""}: harga keluar dari pita = sinyal momentum; di dalam pita = noise, tidak ada transaksi.`;
    drawChart("nbChart", { type: "line", data: { labels: tl, datasets: [{ label: "Harga", data: px, borderColor: css("--ink"), borderWidth: 1.8, pointRadius: 0 }, { label: "Batas atas", data: L.up, borderColor: css("--good"), borderDash: [5, 4], borderWidth: 1.4, pointRadius: 0 },
      { label: "Batas bawah", data: L.lo, borderColor: css("--bad"), borderDash: [5, 4], borderWidth: 1.4, pointRadius: 0 }, { label: "VWAP", data: L.vwap, borderColor: css("--c3"), borderWidth: 1.2, pointRadius: 0 }] },
      options: baseOpts({ plugins: { legend: { labels: { boxWidth: 10 } } }, scales: { x: { grid: { display: false } }, y: { grid: { color: css("--grid") } } } }) });
    const T = R.trades.slice(-60).reverse(); $("sTrCard").hidden = !T.length;
    $("sTrades").innerHTML = `<thead><tr><th>Tanggal</th><th>Sisi</th><th>Masuk</th><th>Keluar</th><th>Alasan keluar</th><th>Return</th></tr></thead><tbody>` + T.map((t) => `<tr><td>${t.d}</td><td>${t.side > 0 ? "beli" : "short"}</td><td>${fmtNum(t.in)}</td><td>${fmtNum(t.out)}</td><td>${t.why}</td><td>${pc(t.ret, 2)}</td></tr>`).join("") + "</tbody>";
  }
  function bindStrat() {
    const groups = {}; MCEngine.STRAT_LIST.forEach((s) => (groups[s.cat] = groups[s.cat] || []).push(s));
    let n = 0; $("sPick").innerHTML = Object.entries(groups).map(([g, L]) => `<optgroup label="${esc(g)} (${L.length})">${L.map((s) => `<option value="${s.id}">${++n}. ${esc(s.name)}</option>`).join("")}</optgroup>`).join("");
    const desc = () => { const s = MCEngine.STRAT_LIST.find((x) => x.id === $("sPick").value); $("sDesc").textContent = s ? s.desc : ""; }; desc();
    $("sPick").addEventListener("change", desc); attachAC($("sSym"), { onPick: (sym) => { $("sSym").value = sym; } });
    $("sRun").onclick = runOneStrategy; $("sAll").onclick = runAllStrats; $("nbRun").onclick = runNoise;
    $("sRorTabs").addEventListener("click", (e) => { const t = e.target.closest(".tab[data-w]"); if (!t || !st.P) return; st.ror = t.dataset.w; document.querySelectorAll("#sRorTabs .tab").forEach((x) => x.classList.toggle("active", x === t)); renderRor(st.P, st.Pb); });
    $("stratPane").addEventListener("click", (e) => {
      const th = e.target.closest("#sAllTable th[data-s]"); if (th && st.all) { st.allSort = th.dataset.s === "name" || th.dataset.s === "cat" ? st.allSort : th.dataset.s; renderStratAll(); return; }
      const sp = e.target.closest("[data-spick]"); if (sp) { e.preventDefault(); $("sPick").value = sp.dataset.spick; desc(); runOneStrategy(); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
      const so = e.target.closest("[data-sorder]"); if (so && st.sym) { openTrade(st.sym, so.dataset.sorder); } });
  }

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


  // =====================================================================
  // SINYAL BELI / JUAL
  // =====================================================================
  function renderSignal() {
    if (!state.res || state.res.mode !== "price" || !state.data) return;
    setTimeout(renderIntro, 0); setTimeout(syncTradeCard, 0); setTimeout(renderAction, 0);
    setTimeout(() => { let src = state.chartSrc; if (!src) try { src = localStorage.getItem("sp_chart_src") || "ram"; } catch { src = "ram"; } if (src === "tv") setChartSrc("tv", false); }, 0);
    const d = state.data, rf = (parseFloat($("rf") && $("rf").value) || DAMO.biRate * 100) / 100;
    const B = MCEngine.signalBacktest(d.dates, d.values, { rf, ppy: state.res.ppy || 252 });
    state.sig = B; const c = B.now;
    if (!c) { $("sigOut").innerHTML = '<p class="note">Data terlalu pendek untuk sinyal (butuh ≥ 64 hari).</p>'; return; }
    const parts = [
      ["Tren (MA20/MA50)", c.tr, c.tr > 0 ? "harga & MA20 di atas MA50" : c.tr < 0 ? "harga & MA20 di bawah MA50" : "belum searah"],
      ["Momentum 3 bulan", c.mo, `${spct(c.momRet)} dalam 63 hari`],
      ["RSI 14", c.rs, `RSI ${nf(0).format(c.rsi)}${c.rs > 0 ? " — jenuh jual" : c.rs < 0 ? " — jenuh beli" : " — netral"}`]];
    const vu = state.valUpside; if (vu != null && isFinite(vu)) parts.push(["Valuasi Damodaran", vu > 0.2 ? 1 : vu < -0.2 ? -1 : 0, `nilai intrinsik ${spct(vu)} vs harga`]);
    const ai = state.ai && state.ai.overall; if (ai) parts.push(["AI berita", ai.arah === "naik" ? 1 : ai.arah === "turun" ? -1 : 0, `${ai.arah}, keyakinan ${ai.keyakinan || "?"}`]);
    const total = parts.reduce((a, p) => a + p[1], 0), maxAbs = parts.length;
    const verdict = total >= 2 ? ["BELI", "buy"] : total <= -2 ? ["JUAL", "sell"] : ["TAHAN", "hold"];
    // zona harga
    const m = state.res.models[state.sel], px = d.values, n = px.length, s0 = state.res.s0;
    const w = px.slice(-20), ma20 = MCEngine.mean(w), sd20 = MCEngine.std(w, 0), bbLow = ma20 - 2 * sd20;
    const i5 = Math.min(5, m.fan[0].length) - 1, q25 = m.fan[2][i5];
    const lo = Math.max(bbLow, q25), zoneLo = Math.min(lo, ma20), zoneHi = Math.max(lo, ma20);
    const rt = (v, dir) => (isIdx() ? MCEngine.roundTick(v, true, dir) : v);
    const P = state.planRes && state.planRes.pr;
    const tgt = P && P.targets.length ? P.targets.map((t) => `${fmtNum(t.price)} <span class="note">(${pct(t.prob, 0)})</span>`).join(" · ") : `${fmtNum(m.fan[4][m.fan[0].length - 1])} · ${fmtNum(m.fan[5][m.fan[0].length - 1])}`;
    const stop = P && P.stop ? `${fmtNum(P.stop.price)} <span class="note">(${pct(P.stop.prob, 0)} tersentuh)</span>` : fmtNum(m.fan[1][m.fan[0].length - 1]);
    const inZone = s0 >= zoneLo && s0 <= zoneHi;
    const last = B.events.slice(-8).reverse();
    const beat = B.oos.strat.sharpe > B.oos.bh.sharpe;
    $("sigOut").innerHTML = `
      <div class="sig-top">
        <div class="sig-verdict ${verdict[1]}"><div class="note">Sinyal gabungan saat ini</div><div class="big">${verdict[0]}</div><div class="note">skor ${total > 0 ? "+" : ""}${total} dari ±${maxAbs}</div>
          <div class="note" style="margin-top:6px">Sistem teknikal: ${B.position ? `<span class="pos">sedang BELI sejak ${B.entryDate} @ ${fmtNum(B.entryPx)} (${spct(s0 / B.entryPx - 1)})</span>` : "sedang di luar pasar"}</div></div>
        <div><div class="table-wrap"><table><thead><tr><th>Komponen</th><th>Nilai</th><th>Keterangan</th></tr></thead><tbody>
          ${parts.map(([nm, v, why]) => `<tr><td>${nm}</td><td class="${cls(v)}">${v > 0 ? "+1 beli" : v < 0 ? "−1 jual" : "0"}</td><td>${esc(why)}</td></tr>`).join("")}</tbody></table></div>
          ${vu == null ? '<p class="note">Valuasi & AI ikut dihitung setelah bagian Valuasi termuat dan tombol "Analisis berita dengan AI" dijalankan.</p>' : ""}</div>
      </div>
      <div class="sig-zones">
        <div>Area beli${inZone ? ' <span class="pos">· harga di zona</span>' : s0 > zoneHi ? ' <span class="note">· harga di atas zona</span>' : ' <span class="neg">· di bawah zona</span>'}<b>${fmtNum(rt(zoneLo, -1))} – ${fmtNum(rt(zoneHi, 1))}</b></div>
        <div>Target jual (peluang)<b>${tgt}</b></div><div>Stop loss<b>${stop}</b></div>
        <div>Harga sekarang<b>${fmtNum(s0)}</b></div></div>
      <div class="subh">Backtest aturan teknikal di ${esc(d.symbol)} (beli skor ≥ 2, jual skor ≤ −1, biaya 20 bps)</div>
      <div class="table-wrap"><table><thead><tr><th></th><th>Sharpe IS</th><th>Sharpe OOS</th><th>CAGR</th><th>Max DD</th><th>Transaksi</th><th>Menang</th><th>Rata-rata/transaksi</th><th>Lama pegang</th></tr></thead><tbody>
        <tr><td>Aturan sinyal</td><td>${nf(2).format(B.is.strat.sharpe)}</td><td class="${beat ? "pos" : "neg"}">${nf(2).format(B.oos.strat.sharpe)}</td><td>${spct(B.all.strat.cagr)}</td><td>${pct(B.all.strat.maxDD)}</td><td>${B.trades.length}</td><td>${pct(B.winRate, 0)}</td><td class="${cls(B.avgTrade)}">${spct(B.avgTrade)}</td><td>${nf(0).format(B.avgDays)} hari</td></tr>
        <tr><td>Beli & tahan</td><td>${nf(2).format(B.is.bh.sharpe)}</td><td>${nf(2).format(B.oos.bh.sharpe)}</td><td>${spct(B.all.bh.cagr)}</td><td>${pct(B.all.bh.maxDD)}</td><td>1</td><td>–</td><td>–</td><td>–</td></tr></tbody></table></div>
      <div class="verdict">${beat ? "Di periode out-of-sample, aturan ini <b>lebih baik</b> dari beli-dan-tahan untuk aset ini. Tetap perlakukan sebagai petunjuk: jumlah transaksinya sedikit, sehingga hasilnya bisa kebetulan." :
        "Di periode out-of-sample, aturan ini <b>tidak lebih baik</b> dari beli-dan-tahan untuk aset ini. Jadikan sinyal sebagai informasi pendukung, bukan perintah beli/jual."}</div>
      <div class="subh">Sinyal terakhir</div>
      <div class="table-wrap"><table><thead><tr><th>Tanggal</th><th>Aksi</th><th>Harga</th><th>Skor</th><th>Hasil transaksi</th></tr></thead><tbody>
        ${last.map((e) => `<tr><td>${e.date}</td><td class="${e.type === "buy" ? "pos" : "neg"}">${e.type === "buy" ? "BELI" : "JUAL"}</td><td>${fmtNum(e.price)}</td><td>${e.score > 0 ? "+" : ""}${e.score}</td><td class="${cls(e.ret)}">${e.ret != null ? spct(e.ret) : ""}</td></tr>`).join("") || '<tr><td colspan="5">Belum ada sinyal.</td></tr>'}</tbody></table></div>
      <p class="note">Bukan saran investasi. Aturan & parameter sengaja sederhana dan tetap (tidak dioptimasi) supaya backtest-nya jujur.</p>`;
    if (state.lw) applyMarkers();
  }
  function applyMarkers() {
    if (!state.lw || !state.sig || state.tf !== "D") return;
    const have = new Set(state.data.ohlc.map((b) => b[0]));
    const mk = state.sig.events.filter((e) => have.has(e.date)).map((e) => ({ time: e.date, position: e.type === "buy" ? "belowBar" : "aboveBar", color: e.type === "buy" ? css("--good") : css("--bad"), shape: e.type === "buy" ? "arrowUp" : "arrowDown", text: e.type === "buy" ? "B" : "S" }));
    try { state.lw.cs.setMarkers(mk); } catch { /* */ }
  }

  // =====================================================================
  // RENCANA AKSI (beli/jual/tahan + harga + waktu) & MODE QUICK
  // =====================================================================
  const act = { key: null, all: null, plan: null, goal: null, ai: null, aiKey: null, busy: false, ml: null, mlKey: null };
  const marketOf = () => (isIdx() ? "IDX" : isCrypto() ? null : (state.data && state.data.currency) === "USD" ? "US" : null);
  const fmtDay = (d) => new Date(d + "T00:00:00Z").toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });
  const actFx = () => ((state.data && state.data.currency) === "IDR" ? 1 : pp.fx || 16000);
  function actStartInfo(lastDate) {
    const now = new Date(Date.now() + 7 * 3600e3), today = now.toISOString().slice(0, 10), h = now.getUTCHours() + now.getUTCMinutes() / 60, w = now.getUTCDay();
    if (isCrypto()) return { date: today, when: "sekarang — pasar kripto buka 24 jam" };
    if (isIdx()) { const wk = w >= 1 && w <= 5 && !MCEngine.isHoliday(today, "IDX");
      if (wk && h < 9) return { date: today, when: `hari ini (${fmtDay(today)}) sebelum pasar buka 09:00 WIB` };
      if (wk && h < 15.8) return { date: today, when: `hari ini (${fmtDay(today)}) — pasar sedang buka` };
      const d = MCEngine.addBiz(today, 1, false, "IDX"); return { date: d, when: `${fmtDay(d)}, pasang sebelum 09:00 WIB${MCEngine.isHoliday(today, "IDX") ? " (hari ini libur bursa)" : ""}` }; }
    const d = MCEngine.addBiz(lastDate > today ? lastDate : today, 1, false, marketOf()); return { date: d, when: `${fmtDay(d)} (jam bursa setempat)` };
  }
  function rawD(d) { const D = { d: [], o: [], h: [], l: [], c: [], v: [] };
    for (const b of d.ohlc) { D.d.push(b[0]); D.o.push(b[1]); D.h.push(b[2]); D.l.push(b[3]); D.c.push(b[4]); D.v.push(b[5] || 0); } D.n = D.c.length; return D; }
  async function renderAction() {
    const d = state.data; if (!d || !state.res || state.res.mode !== "price" || !d.ohlc || d.ohlc.length < 130) { $("actCard").hidden = true; return; }
    $("actCard").hidden = false;
    const D = buildD(d), key = `${d.symbol}|${D.d[D.n - 1]}|${D.n}|${stratOpts().costBps}`;
    if (lv.sym !== d.symbol || (!lv.timer && isCrypto())) { lv.sym = d.symbol; liveStart(); }
    if (act.key !== key) { act.key = key; act.all = null; act.plan = null; act.ml = null; act.mlKey = null; $("actBody").innerHTML = '<p class="status">Menguji 50 strategi di aset ini untuk menyusun rencana…</p>';
      try { const A = await compute("stratAll", { D, o: { ...stratOpts(), short: false } }); if (act.key !== key) return; act.all = A; }
      catch (e) { $("actBody").innerHTML = `<p class="status err">${esc(e.message)}</p>`; return; } }
    if (!act.all) return;
    const mH = parseInt($("mlH").value, 10) || 5, mk = `${key}|${mH}`;
    if (act.mlKey !== mk) { act.mlKey = mk; $("mlCard").hidden = false; $("mlBody").innerHTML = '<p class="status">Melatih 4 model ML + deep learning (konvolusi + attention) + triple barrier, walk-forward (±15 detik)…</p>';
      if (act.plan === null) $("actBody").innerHTML = '<p class="status">Melatih ML + deep learning (±15 detik)…</p>';
      try { // ML memakai riwayat terpanjang (10 tahun) terlepas dari rentang analisis yang dipilih
        const news = await newsHist(d.symbol);
        let DM = D, vote = act.all.votes.all; if (D.n < 2000) { try { const dl = await fetchSymbol(d.symbol, "10y"); const D2 = buildD(dl); if (D2.n > D.n + 100) { DM = D2; vote = null; } } catch { /* pakai data yang ada */ } }
        const ext = await mlExt(d.symbol);
        if (DM.n > 2600) { const k = DM.n - 2600; DM = { d: DM.d.slice(k), o: DM.o.slice(k), h: DM.h.slice(k), l: DM.l.slice(k), c: DM.c.slice(k), v: DM.v.slice(k), n: 2600 }; if (vote) vote = vote.slice(k); } // ±10 tahun bursa cukup; lebih panjang hanya memperlambat
        const t0 = Date.now(), onP = (msg, f) => { if (act.mlKey !== mk) return; const s = `${msg} · ${Math.round((f || 0) * 100)}% · ${Math.round((Date.now() - t0) / 1000)} dtk`; const mb = $("mlBody"); if (mb) mb.innerHTML = `<p class="status">${esc(s)}</p><div class="bar"><div style="width:${Math.round((f || 0) * 100)}%"></div></div>`; act.mlProg = s; drawBrain(); };
        const M = await compute("ml", { D: DM, o: { horizon: mH, costBps: stratOpts().costBps, vote, news: news.map, ext } }, onP); M.newsInfo = news; act.mlProg = null; if (act.mlKey !== mk) return; M.yrs = DM.n / (isCrypto() ? 365 : 252);
        if (M.fc && state.res && state.res.s0 > 0) { const k = state.res.s0 / M.fc.lastPx; M.fc.px *= k; M.fc.bands.forEach((b) => { b.lo *= k; b.hi *= k; }); M.fc.lastPx = state.res.s0; if (M.tb) { M.tb.tgt *= k; M.tb.stp *= k; } } // jangkarkan ke harga terkini
        act.ml = M; act.mlSym = d.symbol; if ($("drift").value === "ml" && state.data && state.data.symbol === d.symbol && !(state.mlDrift && state.mlDrift.ok)) setTimeout(() => $("run") && $("run").click(), 300); }
      catch (e) { if (act.mlKey !== mk) return; act.ml = { error: e.message }; }
      renderML(); }
    else renderForecast();
    const R = rawD(d), st0 = actStartInfo(R.d[R.n - 1]), cap = Math.max(0, parseFloat($("actCap").value) || 0), risk = parseFloat($("actRisk").value) || 0.01;
    // harga live terbaru menggantikan tutup terakhir bila ada
    if (state.res.s0 && Math.abs(state.res.s0 / R.c[R.n - 1] - 1) < 0.25) R.c[R.n - 1] = state.res.s0;
    const ck0 = `${key}|${act.all ? 1 : 0}`; // konfluensi dihitung sebelum rencana supaya setup A+ ikut memutuskan
    if (act.confKey0 !== ck0 || !act.conf) { act.confKey0 = ck0; act.confKey = null; }
    act.plan = MCEngine.actionPlan(R, { isIdx: isIdx(), crypto: isCrypto(), strats: act.all.list, votes: act.all.votes, score: state.sig && state.sig.now ? state.sig.now.score : 0,
      capital: cap / actFx(), riskPct: risk, unit: isIdx() ? 100 : 1, start: st0.date, costBps: stratOpts().costBps, market: marketOf(), ml: act.ml && !act.ml.error ? act.ml : null });
    const ck = `${key}|${act.plan.H}`; if (act.confKey !== ck) { act.confKey = ck; try { act.conf = MCEngine.confluence(D, { H: act.plan.H, costBps: stratOpts().costBps, ppy: isCrypto() ? 365 : 252 }); act.mtfD = MCEngine.mtfDaily(D); } catch (e) { act.conf = { error: e.message }; } mtfLoad(d.symbol); }
    if (act.conf && act.conf.sel && act.conf.sel.active) act.plan = MCEngine.actionPlan(R, { isIdx: isIdx(), crypto: isCrypto(), strats: act.all.list, votes: act.all.votes, score: state.sig && state.sig.now ? state.sig.now.score : 0,
      capital: cap / actFx(), riskPct: risk, unit: isIdx() ? 100 : 1, start: st0.date, costBps: stratOpts().costBps, market: marketOf(), ml: act.ml && !act.ml.error ? act.ml : null, sel: act.conf.sel });
    act.plan.when = st0.when; try { trkEval(); act.trk = trkRecord(act.plan); } catch { /* */ }
    const hk = `${key}|${act.mlKey}|${act.plan.H}`; if (act.histKey !== hk) { act.histKey = hk; act.hist = null;
      try { const mlOos = {}; if (act.ml && act.ml.oosP) for (const r of act.ml.oosP) mlOos[r.d] = r.p;
        act.hist = MCEngine.planHistory(R, { isIdx: isIdx(), crypto: isCrypto(), market: marketOf(), votes: act.all.votes, mlOos, mlMeta: act.ml && !act.ml.error ? { valid: act.ml.valid, auc: act.ml.auc, H: act.ml.H } : null, costBps: stratOpts().costBps, H: act.plan.H, step: 5 }); } catch (e) { act.hist = { error: e.message }; } }
    try { const B = brain(); if (B && B.why && act.plan.action === "BELI") { act.plan.action = "TAHAN"; act.plan.basis += "; " + B.why; } } catch { /* */ }
    drawAction(); renderTcPos();
  }
  const CORE_T = ["Keyakinan keputusan", "Peluang kena target 1", "Risk : Reward", "Ekspektasi / transaksi", "Ukuran posisi", "Risiko optimal (¼ Kelly)", "Horizon", "Prediksi harga"];
  const isCore = (t) => CORE_T.some((c) => String(t[0]).startsWith(c));
  const tileH = ([k, v, h, c]) => `<div class="kpi ${c}"><div class="k">${k}</div><div class="v">${v}</div><div class="h">${h}</div></div>`;
  function setActTab(t) { document.querySelectorAll("#actTabs .tab").forEach((b) => b.classList.toggle("active", b.dataset.at === t)); document.querySelectorAll("#actCard .act-pane").forEach((p) => (p.hidden = p.dataset.ap !== t)); try { localStorage.setItem("sp_act_tab", t); } catch { /* */ } }
  function kellyCap(P) { const tested = P.nRobust > 0 || (P.ml && P.ml.valid) || !!P.fuse || !!P.sel; return tested ? 0.02 : 0.005; }
  function kellyTile(P) { const K = P.kelly, cap = kellyCap(P);
    if (P.action !== "BELI") return ["Risiko optimal (¼ Kelly)", "–", "hanya dihitung saat BELI", ""];
    if (K.f <= 0) return ["Risiko optimal (¼ Kelly)", "0%", "distribusi hasil tidak menguntungkan", ""];
    return ["Risiko optimal (¼ Kelly)", `${pct(Math.min(K.q, cap), 1)} modal`, `¼ Kelly ${pct(K.q, 1)}${K.q > cap ? ` → dibatasi ${pct(cap, 1)}${cap < 0.01 ? " (bukti belum teruji)" : ""}` : ""} · kamu ${pct(parseFloat($("actRisk").value) || 0.01, 1)}`, "hl"]; }
  function drawAction() {
    const P = act.plan; if (!P) return; const A = act.all, idx = isIdx(), cur = state.data.currency || "", fx = actFx(), unitW = idx ? "lot" : "unit";
    const vcls = P.action === "BELI" ? "buy" : P.action === "JUAL" ? "sell" : "hold", pr = P.pr, acc = P.acc, rp = (v) => big(v * fx, "IDR");
    const money = (v) => (cur === "IDR" ? rp(v) : `${fmtNum(v)} ${cur} (≈ ${rp(v)})`);
    $("actTag").textContent = `${state.data.symbol} · ${P.action}`; $("actAsOf").textContent = `harga ${fmtNum(P.px)} · data s/d ${state.data.dates[state.data.dates.length - 1]}`;
    const accTxt = acc && isFinite(acc.p) ? `${pct(acc.p, 0)}` : "–", ml = P.ml, fc = act.ml && act.ml.fc, aiAdj = aiAdjusted();
    const tiles = [
      ["Keyakinan keputusan", isFinite(P.confPct) ? pct(P.confPct, 0) : "–", isFinite(P.confPct) ? `dari ${P.confSrc}` : "belum ada ukuran yang teruji", "hl"],
      [`Peluang naik ${ml ? ml.H : ""} hari (ML)`, ml ? pct(ml.p, 0) : "–", ml ? `AUC ${nf(2).format(ml.auc)} · ${ml.valid ? "teruji" : "belum teruji"}` : "model belum siap", ml && ml.valid ? "hl" : ""],
      [`Prediksi harga ${fc ? act.ml.H + " hari" : ""}`, fc ? fmtNum(fc.px) : "–", fc ? `80%: ${fmtNum(fc.bands[1].lo)}–${fmtNum(fc.bands[1].hi)} (teruji ${pct(fc.bands[1].cover, 0)})` : "", ""],
      ["Akurasi historis", accTxt, acc && isFinite(acc.p) ? `dasar ${pct(acc.base, 0)} · ≈${acc.nInd} kejadian · out-of-sample` : "belum cukup kejadian serupa", ""],
      ["Keyakinan AI", aiAdj ? `${nf(0).format(aiAdj.v)}%` : "–", aiAdj ? (aiAdj.v !== aiAdj.raw ? `AI bilang ${aiAdj.raw}% → disesuaikan ke bukti teruji` : `sikap: ${esc(act.ai.sikap || "?")}`) : "opsional: Pendapat Gemini", ""],
      ["Peluang kena target 1", pr ? pct(pr.t1, 0) : "–", pr ? `sebelum stop · stop ${pct(pr.stop, 0)} (bootstrap)` : "", ""],
      ...(ml && ml.tb ? [["Peluang menang (ML)", pct(ml.tb.p, 0), `+${ml.tb.up}×ATR sebelum −${ml.tb.dn}×ATR · ${ml.tb.valid ? "teruji" : "belum teruji"} · dasar ${pct(ml.tb.base, 0)}`, ml.tb.valid ? "hl" : ""]] : []),
      ["Risk : Reward", `1 : ${nf(1).format(P.rr1)} / 1 : ${nf(1).format(P.rr2)}`, `risiko −${pct(P.riskPctPx, 1)} · target +${pct(P.rewPct1, 1)} / +${pct(P.rewPct2, 1)}`, ""],
      ["Ekspektasi / transaksi", pr ? `${pr.expR >= 0 ? "+" : ""}${nf(2).format(pr.expR)} R` : "–", pr && P.qty > 0 ? `≈ ${pr.expR >= 0 ? "+" : "−"}${rp(Math.abs(pr.expR) * P.R * P.qty * (idx ? 100 : 1))} · menang ${pct(pr.win, 0)}` : "", pr && pr.expR > 0 ? "hl" : ""],
      ["Ukuran posisi", P.qty > 0 ? `${idx ? nf(0).format(P.qty) : nf(4).format(P.qty)} ${unitW}` : "–", P.qty > 0 ? `≈ ${rp(P.cost)} · rugi maks ≈ ${rp(P.riskAmt)}` : "modal terlalu kecil untuk 1 lot", ""],
      ["Horizon", `${P.H} ${isCrypto() ? "hari" : "hari bursa"}`, `evaluasi paling lambat ${fmtDay(P.review)}`, ""],
      ...(P.kelly ? [kellyTile(P)] : [])];
    const L = (lab, v, c = "") => `<tr class="${c}"><td>${lab}</td><td>${v}</td></tr>`;
    const tp = MCEngine.roundTick(Math.max(P.hi20, P.px + 2 * P.atr), idx, 1);
    const ladderOf = { JUAL: [L("Beli lagi bila harga tutup di atas", fmtNum(P.trigUp)), L("Harga sekarang", fmtNum(P.px), "cur"), L(`<b>Jual (limit)</b> — paling lambat ${fmtDay(P.expire)}`, `<b>${fmtNum(P.entryHi)}</b>`), L("Sisa dijual bila harga <b>tutup</b> di bawah", `<span class="neg">${fmtNum(P.trail)}</span>`)],
      TAHAN: [L("Pemegang: ambil untung sebagian", fmtNum(tp)), L("Beli baru bila harga tutup di atas", fmtNum(P.trigUp)), L("Harga sekarang", fmtNum(P.px), "cur"), ...(P.pull ? [L("Atau antre beli saat koreksi", fmtNum(P.pull))] : []), L("Pemegang: jual bila harga <b>tutup</b> di bawah", `<span class="neg">${fmtNum(P.trail)}</span>`)] };
    const ladder = ladderOf[P.action] ? ladderOf[P.action].join("") : [L("Target 2 — jual sisa", fmtNum(P.t2)), L("Target 1 — jual ½, stop naik ke harga masuk", fmtNum(P.t1)), L("Batal beli bila harga sudah lewat (jangan kejar)", fmtNum(P.chase)),
      L("Harga sekarang", fmtNum(P.px), "cur"), L("Boleh beli sampai", fmtNum(P.entryHi)), L("<b>Antre beli (limit)</b>", `<b>${fmtNum(P.entry)}</b>`), L("Stop — jual bila harga <b>tutup</b> di bawah", `<span class="neg">${fmtNum(P.stop)}</span>`)].join("");
    const steps = {
      BELI: [[`Pasang <b>order limit beli ${P.qty > 0 ? `${idx ? nf(0).format(P.qty) : nf(4).format(P.qty)} ${unitW}` : ""}</b> di <b>${fmtNum(P.entry)}</b> — ${P.when}. Kalau takut ketinggalan, boleh sampai ${fmtNum(P.entryHi)}.`,
          `Order berlaku sampai <b>${fmtDay(P.expire)}</b>. Kalau belum terisi dan harga sudah di atas ${fmtNum(P.chase)}, batalkan — jangan kejar.`,
          `Setelah terisi: jual ½ di <b>${fmtNum(P.t1)}</b> lalu naikkan stop ke harga masuk; sisanya di <b>${fmtNum(P.t2)}</b>.`,
          `Jual semua bila harga <b>tutup</b> di bawah <b class="neg">${fmtNum(P.stop)}</b>, atau paling lambat <b>${fmtDay(P.review)}</b> bila belum ke mana-mana.`],
        [`<b>Tahan.</b> Tambah posisi hanya di sekitar ${fmtNum(P.entry)}, bukan di harga sekarang.`, `Ambil untung sebagian di ${fmtNum(P.t1)} / ${fmtNum(tp)}.`, `Jual bila harga tutup di bawah <b class="neg">${fmtNum(P.trail)}</b>.`]],
      JUAL: [[`<b>Jangan beli dulu.</b> Mayoritas strategi sedang di luar pasar.`, `Pertimbangkan beli lagi bila harga <b>tutup</b> di atas <b>${fmtNum(P.trigUp)}</b> atau rencana ini berubah jadi BELI (cek tiap hari bursa).`],
        [`<b>Jual</b> ${P.when} — order limit di ${fmtNum(P.entryHi)} atau harga pasar, paling lambat <b>${fmtDay(P.expire)}</b>.`, `Kalau mau bertahap: jual ½ sekarang, sisanya bila tutup di bawah <b class="neg">${fmtNum(P.trail)}</b>.`]],
      TAHAN: [[`<b>Tunggu.</b> Belum ada keunggulan yang jelas untuk masuk.`, `Beli bila harga <b>tutup</b> di atas <b>${fmtNum(P.trigUp)}</b> (tembus ke atas)${P.pull ? `, atau antre di <b>${fmtNum(P.pull)}</b> selama tren masih naik` : ""}. Pakai stop & target seperti di tabel.`],
        [`<b>Tahan.</b> Jual bila harga tutup di bawah <b class="neg">${fmtNum(P.trail)}</b>.`, `Ambil untung sebagian di <b>${fmtNum(tp)}</b>.`, `Evaluasi lagi paling lambat ${fmtDay(P.review)}.`]] }[P.action];
    const probBar = pr ? `<div class="act-prob"><i style="width:${(pr.t1 * 100).toFixed(1)}%;background:${css("--good")}"></i><i style="width:${(pr.time * 100).toFixed(1)}%;background:${css("--muted")}"></i><i style="width:${(pr.stop * 100).toFixed(1)}%;background:${css("--bad")}"></i></div>
      <div class="act-prob-l"><span class="pos">Target 1 dulu ${pct(pr.t1, 0)}${pr.medT1 ? ` (median ${pr.medT1} hari)` : ""}</span><span class="note">belum ke mana-mana saat batas waktu ${pct(pr.time, 0)}</span><span class="neg">stop dulu ${pct(pr.stop, 0)}</span><span>target 2 ${pct(pr.t2, 0)}</span></div>` : "";
    const warn = [];
    if (!P.nRobust) warn.push("Tidak ada strategi yang lolos uji keandalan untuk aset ini, jadi keputusan di atas <b>lemah</b>.");
    if (acc && isFinite(acc.p) && acc.p - acc.base < 0.03) warn.push(`Keputusan seperti ini di masa lalu benar ${pct(acc.p, 0)}, hampir sama dengan peluang dasar ${pct(acc.base, 0)} — sinyalnya belum menambah keunggulan.`);
    if (ml && !ml.valid) warn.push(`Model ML belum lolos uji untuk aset ini (AUC ${nf(2).format(ml.auc)}), jadi hanya jadi informasi dan tidak mengubah keputusan.`);
    if (pr && pr.expR <= 0) warn.push("Ekspektasi per transaksi ≤ 0 setelah biaya: secara historis rencana harga ini tidak menghasilkan untung.");
    $("actBody").innerHTML = `<div class="act-top"><div class="sig-verdict ${vcls}"><div class="note">Yang sebaiknya dilakukan</div><div class="big">${P.action}</div><div class="note">keyakinan ${P.conf}</div></div>
        <div class="act-tiles">${tiles.filter(isCore).map(tileH).join("")}</div></div>
      ${P.action !== "BELI" ? `<p class="note" style="margin:10px 0 0">Peluang, RR, ekspektasi & ukuran posisi di atas dihitung untuk skenario <b>tetap beli di ${fmtNum(P.entry)}</b> (stop ${fmtNum(P.stop)}, target ${fmtNum(P.t1)} / ${fmtNum(P.t2)}) — berguna kalau kamu tetap ingin masuk.</p>` : ""}
      ${probBar}
      <div class="act-grid"><div><table class="act-ladder">${ladder}</table><p class="note">Order mulai: ${P.when}. ATR ${fmtNum(P.atr)} (gerak harian wajar). Stop memakai harga tutup supaya tidak kena “sapuan” sesaat. Tanggal sudah melewati akhir pekan & libur bursa.${act.holNote ? " " + esc(act.holNote) : ""}</p></div>
        <div style="display:grid;gap:10px"><div class="act-col"><h4>Kalau belum punya</h4><ol>${steps[0].map((x) => `<li>${x}</li>`).join("")}</ol></div><div class="act-col"><h4>Kalau sudah punya</h4><ol>${steps[1].map((x) => `<li>${x}</li>`).join("")}</ol></div></div></div>
      <div class="act-btns">${P.action === "JUAL" && pp.a && pp.a.pos[state.data.symbol] ? `<button class="btn" id="actSell">Isi tiket demo: jual posisi demo</button>` : ""}${P.action === "BELI" && P.qty > 0 ? `<button class="btn primary" id="actDemo">Isi tiket demo: beli ${idx ? nf(0).format(P.qty) : nf(4).format(P.qty)} ${unitW} @ ${fmtNum(P.entry)}</button>` : ""}<button class="btn" data-cmd="${esc(state.data.symbol)} STRAT">Lihat 50 strategi</button></div>`;
    $("actEvid").innerHTML = `<div class="act-tiles">${tiles.filter((t) => !isCore(t)).map(tileH).join("")}</div>
      ${warn.length ? `<div class="verdict">${warn.join(" ")}</div>` : ""}
      <p class="note keep" style="margin:10px 0 0"><b>Dasar keputusan:</b> ${esc(P.basis)}.${acc && isFinite(acc.p) ? ` Keyakinan teruji = ${esc(acc.rule)} pada ${nf(0).format(acc.n)} hari dengan keputusan yang sama.` : ""}</p>`;
    const dm = $("actDemo"); if (dm) dm.onclick = actToDemo;
    const ds = $("actSell"); if (ds) ds.onclick = () => { const sym = state.data.symbol, p = pp.a.pos[sym]; if (!p) return; openTrade(sym, "sell");
      setTimeout(() => { $("dType").value = "market"; $("dQty").value = isIdx() ? Math.floor(p.units / 100) : p.units; ppPreview(); }, 350); };
    drawGoal(); drawTrack(); drawConf(); drawBrain(); drawLive();
    if (act.ai && act.aiKey === aiKeyOf()) drawBrief(); else if (act.busy) { /* biarkan status "sedang membaca" */ } else if (act.aiErr) drawAiErr(); else { $("actAi").innerHTML = ""; }
  }
  function actToDemo() { const P = act.plan; if (!P) return; openTrade(state.data.symbol, "buy");
    setTimeout(() => { $("dType").value = "limit"; $("dLimit").value = P.entry; $("dQty").value = P.qty; $("dStop").value = P.stop; $("dT1").value = P.t1; $("dT2").value = P.t2; ppPreview(); $("dQty").scrollIntoView({ block: "center" }); }, 350); }

  // ---------- Konfluensi 9 faktor + multi-timeframe ----------
  const mtfCache = new Map();
  async function mtfLoad(sym) {
    const c = mtfCache.get(sym); if (c && Date.now() - c.at < 600e3) { act.mtf = c.v; drawConf(); return; }
    act.mtf = { loading: true }; let v = { error: "intraday tidak tersedia" };
    try { const j = await (await apiFetch(`${API}?action=intraday&symbol=${encodeURIComponent(sym)}&interval=60m`)).json();
      if (j && Array.isArray(j.bars) && j.bars.length >= 40) { const B = j.bars.filter((b) => b && b[4] > 0); const off = j.gmtoffset || 0; v = { h1: MCEngine.mtfTrend(B, 1, off), h4: MCEngine.mtfTrend(B, 4, off), n: B.length }; } else v = { error: (j && j.error) || "data per jam terlalu sedikit" }; } catch (e) { v = { error: e.message }; }
    mtfCache.set(sym, { at: Date.now(), v }); if (state.data && state.data.symbol === sym) { act.mtf = v; drawConf(); drawBrain(); }
  }
  function confExtras() { // faktor non-teknikal: hanya kondisi sekarang, tidak ikut uji historis skor
    const P = act.plan, M = act.ml && !act.ml.error ? act.ml : null, X = [];
    if (P) { const v = isFinite(P.vRob) ? P.vRob : P.vAll; if (isFinite(v)) X.push(["Strategi " + (isFinite(P.vRob) ? `lolos uji (${P.nRobust})` : `semua (${P.nAll})`), v >= 0.55 ? 1 : v <= 0.4 ? -1 : 0, `${pct(v, 0)} bobot sedang beli`]); }
    if (M) { X.push([`Machine learning ${M.H} hari`, !M.valid ? 0 : M.p >= 0.55 ? 1 : M.p <= 0.45 ? -1 : 0, `peluang naik ${pct(M.p, 0)} · ${M.valid ? "teruji" : "belum teruji → netral"}`]);
      if (M.tb) X.push(["Triple barrier (ML)", !M.tb.valid ? 0 : M.tb.p >= M.tb.base + 0.05 ? 1 : M.tb.p <= M.tb.base - 0.05 ? -1 : 0, `menang ${pct(M.tb.p, 0)} vs dasar ${pct(M.tb.base, 0)} · ${M.tb.valid ? "teruji" : "belum teruji → netral"}`]); }
    const V = act.val || (typeof valEnsemble === "function" ? valEnsemble() : null); if (V && V.methods && V.methods.length) X.push(["Valuasi gabungan", V.upside > 0.2 && V.agree >= 0.6 ? 1 : V.upside < -0.2 && V.agree >= 0.6 ? -1 : 0, `nilai wajar ${fmtNum(V.med)} (${spct(V.upside, 0)}) · ${V.methods.length} metode`]);
    const N = act.news; if (N) X.push(["Berita 7 hari", N.net > 1 ? 1 : N.net < -1 ? -1 : 0, `${N.nRecent} berita · bersih ${N.net > 0 ? "+" : ""}${N.net}${N.reliable ? " · dampaknya teruji" : ""}`]);
    if (state.math && state.math.hmm) { const p = state.math.hmm.probHighNow; X.push(["Rezim (HMM)", p < 0.3 ? 1 : p > 0.6 ? -1 : 0, `peluang bergejolak ${pct(p, 0)}`]); }
    return X;
  }
  function selBox(C) {
    const S = C.sel; if (!S) return ""; const B = S.best, H = C.H;
    if (!B) return `<div class="cf-sel"><b>Setup A+:</b> belum ada versi yang teruji di aset ini (skor tinggi + tren harian & mingguan naik tidak terbukti lebih sering benar dari peluang dasar ${pct(C.base, 0)}). Keyakinan tinggi yang jujur tidak tersedia untuk aset ini; pertimbangkan aset lain di Watchlist.</div>`;
    const N = S.need, miss = []; if (N.s < B.thr) miss.push(`skor ≥ +${B.thr} (sekarang ${N.s > 0 ? "+" : ""}${N.s})`); if (N.trend !== 1) miss.push("tren harian naik"); if (N.week !== 1) miss.push("tren mingguan naik");
    return `<div class="cf-sel ${S.active ? "on" : ""}"><div><b>Setup A+ ${S.active ? '<span class="pos">TERPENUHI</span>' : "belum terpenuhi"}</b> · skor ≥ +${B.thr} dan tren harian & mingguan naik</div>
      <div>Historis di aset ini: harga naik dalam ${H} hari <b>${pct(B.up, 0)}</b> dari waktu (batas bawah 95% ${pct(B.low, 0)}) vs dasar ${pct(C.base, 0)}, ≈${B.nEff} kejadian independen, muncul ±${nf(1).format(B.perYear)}× per tahun.</div>
      <div class="note">${S.active ? "Keyakinan Rencana aksi memakai angka ini." : `Yang kurang: ${miss.join(", ")}. Keyakinan tinggi hanya muncul saat semuanya terpenuhi, jadi lebih jarang masuk tapi lebih sering benar.`}</div></div>`;
  }
  function drawConf() {
    const el = $("actConf"); if (!el) return; const C = act.conf, P = act.plan;
    if (!C || C.error || !P) { el.innerHTML = C && C.error ? `<p class="status err">Konfluensi gagal: ${esc(C.error)}</p>` : ""; return; }
    const ar = (x) => (x > 0 ? '<b class="pos">▲</b>' : x < 0 ? '<b class="neg">▼</b>' : '<span class="note">•</span>');
    const s = C.sNow, b = C.bNow, X = confExtras(), xs = X.reduce((a, x) => a + x[1], 0), H = C.H;
    const facRows = C.facs.map((f) => `<tr><td>${esc(f.name)}</td><td class="c">${f.now == null ? '<span class="note">–</span>' : ar(f.now)}</td><td>${f.k === "trend" || f.k === "big" || f.k === "rsi" || f.k === "mom" ? esc(C.why[f.k]) : ""}</td>
      <td class="num">${isFinite(f.upP) ? pct(f.upP, 0) : "–"} / ${isFinite(f.upM) ? pct(f.upM, 0) : "–"}</td><td class="num ${f.edge > 0.03 ? "pos" : f.edge < -0.03 ? "neg" : ""}">${isFinite(f.edge) ? (f.edge > 0 ? "+" : "") + nf(0).format(f.edge * 100) + " poin" : "–"}</td></tr>`).join("");
    const bRows = C.buckets.map((x) => `<tr class="${x === b ? "best" : ""}"><td>${x.lab}${x === b ? " ← sekarang" : ""}</td><td class="num">${nf(0).format(x.n)} (≈${x.nEff})</td><td class="num ${x.up - C.base > 0.04 ? "pos" : x.up - C.base < -0.04 ? "neg" : ""}">${isFinite(x.up) ? pct(x.up, 0) : "–"}</td><td class="num">${isFinite(x.ret) ? spct(x.ret, 1) : "–"}</td></tr>`).join("");
    const M = act.mtf || {}, Dd = act.mtfD || {}, tf = [["Mingguan", Dd.week], ["Harian", Dd.day], ["4 jam", M.h4], ["1 jam", M.h1]];
    const tfOk = tf.filter(([, x]) => x), nUp = tfOk.filter(([, x]) => x.dir > 0).length, nDn = tfOk.filter(([, x]) => x.dir < 0).length;
    const tfCells = tf.map(([lab, x]) => `<div class="cf-tf ${x ? (x.dir > 0 ? "up" : x.dir < 0 ? "dn" : "") : "na"}"><div class="k">${lab}</div><div class="v">${x ? (x.dir > 0 ? "▲ naik" : x.dir < 0 ? "▼ turun" : "• datar") : M.loading && /jam/.test(lab) ? "memuat…" : "–"}</div><div class="h">${x && isFinite(x.rsi) ? "RSI " + nf(0).format(x.rsi) : ""}</div></div>`).join("");
    const mtfTxt = tfOk.length < 2 ? "" : nUp === tfOk.length ? `Semua ${nUp} timeframe searah <b class="pos">naik</b>: kondisi paling bersih untuk beli.` : nDn === tfOk.length ? `Semua ${nDn} timeframe searah <b class="neg">turun</b>: jangan melawan arus.` :
      Dd.week && Dd.day && Dd.week.dir > 0 && Dd.day.dir < 0 ? "Mingguan naik tapi harian turun: biasanya koreksi dalam tren naik. Tunggu harian/4 jam berbalik naik sebelum masuk." :
      Dd.week && Dd.day && Dd.week.dir < 0 && Dd.day.dir > 0 ? "Harian naik tapi mingguan turun: kenaikan melawan tren besar. Kalau mau masuk, posisi kecil dan target dekat." : `Campuran: ${nUp} naik, ${nDn} turun, ${tfOk.length - nUp - nDn} datar. Belum ada kesepakatan antar-timeframe.`;
    const warn = [];
    if (P.action === "BELI" && s <= 0) warn.push(`Rencana bilang BELI tapi skor konfluensi ${s > 0 ? "+" : ""}${s}: sinyal tidak didukung mayoritas faktor. Kecilkan posisi atau tunggu.`);
    if (P.action === "BELI" && Dd.week && Dd.week.dir < 0) warn.push("BELI melawan tren mingguan yang turun.");
    if (P.action === "JUAL" && s >= 4) warn.push(`Rencana bilang JUAL padahal skor konfluensi +${s}: kemungkinan hanya koreksi; pemegang bisa jual bertahap.`);
    const verdict = C.valid ? `<b class="pos">Teruji di aset ini.</b> Makin tinggi skor, makin sering harga naik dalam ${H} hari (korelasi peringkat ${nf(2).format(C.ic)}, p = ${nf(3).format(C.icP)}, ≈${C.nEff} kejadian independen sejak ${esc(C.from || "")}).`
      : `<b>Belum terbukti memprediksi di aset ini</b> (korelasi skor–return ${isFinite(C.ic) ? nf(2).format(C.ic) : "–"}${isFinite(C.icP) ? `, p = ${nf(2).format(C.icP)}` : ""}${b && b.nEff < 10 ? `, kejadian skor seperti sekarang hanya ≈${b.nEff}` : ""}). Pakai sebagai checklist, bukan sinyal.`;
    el.innerHTML = `<div class="cf-h"><h3>Konfluensi & multi-timeframe</h3><span class="note">9 faktor teknikal, bobot sama, ambang tetap (tidak di-fit ke data)</span></div>
      <div class="cf-top"><div class="cf-score ${s >= 3 ? "up" : s <= -3 ? "dn" : ""}"><div class="note">Skor teknikal</div><div class="big">${s > 0 ? "+" : ""}${s}<small> / ${C.nNow}</small></div><div class="note">${C.facs.filter((f) => f.now > 0).length} naik · ${C.facs.filter((f) => f.now < 0).length} turun</div></div>
        <div class="cf-hist"><p>Saat skor <b>${b ? b.lab : s}</b> di masa lalu, harga ${H} hari kemudian naik <b>${b && isFinite(b.up) ? pct(b.up, 0) : "–"}</b> dari waktu (rata-rata ${b && isFinite(b.ret) ? spct(b.ret, 1) : "–"} setelah biaya), dibanding peluang dasar <b>${pct(C.base, 0)}</b>.</p><p class="note keep">${verdict}</p>
          <div class="cf-tfs">${tfCells}</div><p class="note">${mtfTxt}${M.error ? ` Data per jam: ${esc(M.error)}.` : ""}${isIdx() ? " Data jam saham IDX tertunda ±15 menit." : ""}</p></div></div>
      ${selBox(C)}
      ${warn.length ? `<div class="verdict">${warn.join(" ")}</div>` : ""}
      <details class="cf-more"><summary>Rincian 9 faktor, uji historis per skor, dan faktor lain (${X.length})</summary>
        <div class="table-wrap"><table class="cf-t"><thead><tr><th>Faktor</th><th>Sekarang</th><th>Keterangan</th><th>Naik ${H}h saat ▲ / saat ▼</th><th>Keunggulan</th></tr></thead><tbody>${facRows}</tbody></table></div>
        <p class="note">Keunggulan = selisih peluang naik saat faktor ▲ dibanding saat ▼ di riwayat aset ini. Faktor dengan keunggulan negatif justru menyesatkan untuk aset ini.${C.hasV ? "" : " Volume tidak tersedia untuk aset ini, jadi OBV & CMF dilewati."}</p>
        <div class="table-wrap"><table class="cf-t"><thead><tr><th>Skor</th><th>Hari (≈ independen)</th><th>Naik dalam ${H} hari</th><th>Rata-rata return</th></tr></thead><tbody>${bRows}</tbody></table></div>
        <div class="subh">Setup A+ per ambang (skor ≥ ambang dan tren harian & mingguan naik)</div>
        <div class="table-wrap"><table class="cf-t"><thead><tr><th>Ambang skor</th><th>Muncul / tahun</th><th>Kejadian (≈ independen)</th><th>Naik dalam ${H} hari</th><th>Batas bawah 95%</th><th>Teruji</th><th>Sekarang</th></tr></thead><tbody>${C.sel.tiers.map((t) => `<tr class="${C.sel.best === t ? "best" : ""}"><td>≥ +${t.thr}</td><td class="num">${nf(1).format(t.perYear)}</td><td class="num">${t.n} (≈${t.nEff})</td><td class="num">${isFinite(t.up) ? pct(t.up, 0) : "–"}</td><td class="num">${isFinite(t.low) ? pct(t.low, 0) : "–"}</td><td>${t.ok ? '<b class="pos">ya</b>' : "tidak"}</td><td>${t.now ? '<b class="pos">terpenuhi</b>' : "–"}</td></tr>`).join("")}</tbody></table></div>
        <p class="note">Teruji = minimal ≈10 kejadian independen, peluang naik ≥ dasar + 5 poin, dan selisihnya signifikan (z ≥ 1,96). Dari ambang yang teruji dipilih yang batas bawah 95%-nya tertinggi. Karena 4 ambang dicoba, angka ini sedikit optimistis.</p>
        <div class="subh">Faktor lain (kondisi sekarang, tidak ikut uji historis) · bersih ${xs > 0 ? "+" : ""}${xs}</div>
        <div class="table-wrap"><table class="cf-t"><tbody>${X.map(([k, v, h]) => `<tr><td>${esc(k)}</td><td class="c">${ar(v)}</td><td>${h}</td></tr>`).join("")}</tbody></table></div>
        <p class="note">Total semua faktor: <b>${s + xs > 0 ? "+" : ""}${s + xs}</b> dari ${C.nNow + X.length}. Model yang belum teruji dihitung netral supaya tidak menambah keyakinan palsu.</p>
      </details>`;
  }
  function drawGoal() {
    const P = act.plan, pr = P && P.pr; if (!pr) { $("actGoalOut").innerHTML = ""; return; }
    const cap = Math.max(0, parseFloat($("actCap").value) || 0), goal = Math.max(0, parseFloat($("actGoal").value) || 0), rk = parseFloat($("actRisk").value) || 0.01;
    const capTpy = (isCrypto() ? 365 : 252) / Math.max(3, pr.avgDur), sTpy = P.setupsPerYear, tpy = isFinite(sTpy) && sTpy > 0 ? Math.min(capTpy, sTpy) : capTpy;
    const tpyTxt = isFinite(sTpy) && sTpy > 0 ? `±${nf(1).format(tpy)} transaksi/tahun (setup BELI muncul ±${nf(1).format(sTpy)}× per tahun di aset ini)` : `±${nf(0).format(tpy)} transaksi/tahun (anggap selalu ada posisi)`;
    if (!(goal > cap)) { $("actGoalOut").innerHTML = `<p class="note">Isi modal dan target (target harus lebih besar dari modal).</p>`; return; }
    const base = { rDist: pr.rDist, capital: cap, target: goal, riskPct: rk, tradesPerYear: tpy };
    const depRows = [1, 3, 5].map((y) => ({ y, save: Math.max(0, (goal - cap) / (12 * y)), m50: pr.expR > 0 ? MCEngine.goalMonthly(base, y, 0.5) : NaN, m80: pr.expR > 0 ? MCEngine.goalMonthly(base, y, 0.8) : NaN }));
    const depTbl = `<div class="subh">Kalau ditambah setoran rutin tiap bulan</div><div class="table-wrap"><table><thead><tr><th>Target tercapai dalam</th><th>Hanya menabung (tanpa trading)</th><th>Menabung + rencana ini, peluang 50%</th><th>… peluang 80%</th></tr></thead><tbody>${depRows.map((r) => `<tr><td>${r.y} tahun</td><td>${big(r.save, "IDR")}/bln</td><td>${isFinite(r.m50) ? big(r.m50, "IDR") + "/bln" : "–"}</td><td>${isFinite(r.m80) ? big(r.m80, "IDR") + "/bln" : "–"}</td></tr>`).join("")}</tbody></table></div>
      <p class="note">Setoran dihitung dengan simulasi (setoran dibagi rata per transaksi, bunga majemuk). Ini cara paling realistis mencapai target besar: setoran rutin + risiko kecil, bukan menaikkan risiko.</p>`;
    if (pr.expR <= 0) { $("actGoalOut").innerHTML = `<div class="verdict"><b>Target ${big(goal, "IDR")}:</b> dengan rencana ini ekspektasi per transaksi negatif setelah biaya (${nf(2).format(pr.expR)} R). Mengulanginya terus justru menjauhkan modal dari target, dan menaikkan risiko per transaksi hanya mempercepat rugi.</div>${depTbl}`; return; }
    const rows = [0.005, 0.01, 0.02, 0.05].map((r) => [r, MCEngine.goalSim({ rDist: pr.rDist, capital: cap, target: goal, riskPct: r, tradesPerYear: tpy, years: 5 })]);
    const G = MCEngine.goalSim({ rDist: pr.rDist, capital: cap, target: goal, riskPct: rk, tradesPerYear: tpy, years: 5 });
    const yrs = isFinite(G.tradesNeeded) ? G.tradesNeeded / tpy : Infinity;
    $("actGoalOut").innerHTML = `<p><b>Target ${big(goal, "IDR")}</b> dari modal ${big(cap, "IDR")} (×${nf(1).format(goal / cap)}). Dengan risiko ${pct(rk, 1)} per transaksi, rata-rata modal tumbuh <b>${spct(G.growthPerTrade, 2)}</b> per transaksi → butuh ±<b>${isFinite(G.tradesNeeded) ? nf(0).format(G.tradesNeeded) : "∞"} transaksi</b>${isFinite(yrs) ? ` (≈ ${nf(1).format(yrs)} tahun pada ${tpyTxt})` : ""}. Peluang tercapai dalam 1 tahun <b>${pct(G.p1, 0)}</b>, 3 tahun <b>${pct(G.p3, 0)}</b>. Agar target tercapai dalam ±1 tahun (median), modal awal yang dibutuhkan ≈ <b>${big(G.capFor1y, "IDR")}</b>.</p>
      <div class="table-wrap"><table><thead><tr><th>Risiko / transaksi</th><th>Tumbuh / transaksi</th><th>Tercapai ≤ 1 th</th><th>≤ 3 th</th><th>≤ 5 th</th><th>Sempat turun 50% dari puncak</th></tr></thead><tbody>${rows.map(([r, g]) => `<tr${r === rk ? ' class="best"' : ""}><td>${pct(r, 1)}</td><td>${spct(g.growthPerTrade, 2)}</td><td>${pct(g.p1, 0)}</td><td>${pct(g.p3, 0)}</td><td>${pct(g.p5, 0)}</td><td class="${g.pRuin > 0.2 ? "neg" : ""}">${pct(g.pRuin, 0)}</td></tr>`).join("")}</tbody></table></div>
      <p class="note">Simulasi mengulang pola hasil rencana ini (dari jalur bootstrap) dengan bunga majemuk, memakai frekuensi setup yang benar-benar muncul di riwayat aset ini. Menaikkan risiko mempercepat target hanya di atas kertas: peluang turun 50% naik tajam.</p>${depTbl}`;
    act.goal = G;
  }
  const aiKeyOf = () => (act.plan ? `${state.data.symbol}|${act.plan.action}|${act.plan.entry}|${act.key}` : "");
  function briefData() {
    const P = act.plan, d = state.data, r = state.res, m = r && (r.models[state.sel] || Object.values(r.models)[0]), q = m && m.summary.q, c = state.sig && state.sig.now, pr = P.pr || {};
    const rnd = (x, k = 4) => (isFinite(x) ? +(+x).toPrecision(k) : null);
    return { aset: d.symbol, nama: d.name, mata_uang: d.currency, tanggal_data: d.dates[d.dates.length - 1], harga: rnd(P.px, 6),
      rencana: { aksi: P.action, keyakinan_aturan: P.conf, dasar: P.basis, mulai: P.when, antre_beli: P.entry, boleh_sampai: P.entryHi, batal_bila_di_atas: P.chase, stop_tutup_di_bawah: P.stop, target1: P.t1, target2: P.t2,
        rr1: rnd(P.rr1, 2), rr2: rnd(P.rr2, 2), risiko_persen: rnd(P.riskPctPx * 100, 3), reward1_persen: rnd(P.rewPct1 * 100, 3), horizon_hari: P.H, order_berlaku_sampai: P.expire, evaluasi_paling_lambat: P.review },
      peluang_bootstrap: { target1_sebelum_stop: rnd(pr.t1, 3), stop_dulu: rnd(pr.stop, 3), belum_kemana: rnd(pr.time, 3), target2: rnd(pr.t2, 3), ekspektasi_R: rnd(pr.expR, 3), peluang_untung: rnd(pr.win, 3) },
      konfluensi: act.conf && !act.conf.error ? { skor: act.conf.sNow, dari: act.conf.nNow, teruji: act.conf.valid, korelasi_skor_return: rnd(act.conf.ic, 3), p: rnd(act.conf.icP, 3),
        historis_skor_ini: act.conf.bNow ? { naik: rnd(act.conf.bNow.up, 3), return_rata: rnd(act.conf.bNow.ret, 3), kejadian_independen: act.conf.bNow.nEff } : null, peluang_dasar: rnd(act.conf.base, 3), setup_aplus: act.conf.sel && act.conf.sel.best ? { aktif: act.conf.sel.active, ambang_skor: act.conf.sel.best.thr, naik_historis: rnd(act.conf.sel.best.up, 3), batas_bawah95: rnd(act.conf.sel.best.low, 3), kejadian_independen: act.conf.sel.best.nEff, per_tahun: rnd(act.conf.sel.best.perYear, 2) } : "tidak teruji di aset ini",
        faktor: Object.fromEntries(act.conf.facs.map((f) => [f.k, { sekarang: f.now, keunggulan_historis: rnd(f.edge, 2) }])),
        timeframe: { mingguan: act.mtfD && act.mtfD.week.dir, harian: act.mtfD && act.mtfD.day.dir, jam4: act.mtf && act.mtf.h4 ? act.mtf.h4.dir : null, jam1: act.mtf && act.mtf.h1 ? act.mtf.h1.dir : null },
        faktor_lain: confExtras().map(([k, v, h]) => ({ faktor: k, arah: v, ket: h.replace(/<[^>]+>/g, "") })) } : null,
      akurasi_historis: P.acc && isFinite(P.acc.p) ? { benar: rnd(P.acc.p, 3), dasar_tanpa_sinyal: rnd(P.acc.base, 3), kejadian_independen: P.acc.nInd, aturan: P.acc.rule, bias_in_sample: P.acc.inSample } : "belum cukup data",
      strategi: { lolos_uji: P.nRobust, dari: P.nAll, nama_lolos: P.robust.slice(0, 6).map((x) => x.name), suara_beli_semua: rnd(P.vAll, 2),
        pilih_teratas_walkforward: act.all.wf ? { sharpe: rnd(act.all.wf.s.sharpe, 3), sharpe_beli_tahan: rnd(act.all.wf.b.sharpe, 3) } : null },
      teknikal: c ? { skor: c.score, tren: c.tr, momentum_3bln: rnd(c.momRet, 3), rsi14: rnd(c.rsi, 3) } : null, atr14: rnd(P.atr, 4), tertinggi_52mg: rnd(P.hi52, 5),
      simulasi_monte_carlo: q ? { horizon_hari: state.cfg && state.cfg.days, rentang90: [rnd(q[0], 5), rnd(q[6], 5)], median: rnd(q[3], 5), peluang_naik: m.probUp ? rnd(m.probUp[m.probUp.length - 1], 3) : null } : null,
      volatilitas_tahunan: r && r.stats ? rnd(r.stats.volAnn, 3) : null, rezim_bergejolak: state.math && state.math.hmm ? rnd(state.math.hmm.probHighNow, 3) : null,
      valuasi_upside: state.valUpside != null && isFinite(state.valUpside) ? rnd(state.valUpside, 3) : null,
      ai_berita: state.ai && state.ai.overall ? { arah: state.ai.overall.arah, peluang_naik: state.ai.overall.peluang_naik, ringkasan: String(state.ai.overall.ringkasan || "").slice(0, 300) } : null,
      machine_learning: mlForAi(),
      deep_learning: act.ml && act.ml.dl && !act.ml.dl.error ? { peluang_naik: act.ml.dl.p, auc: act.ml.dl.auc, p: act.ml.dl.aucP, teruji: act.ml.dl.valid, arsitektur: act.ml.dl.arch } : null,
      fusi_3_kecerdasan: act.ml && act.ml.fuse && !act.ml.fuse.error ? { peluang_naik: act.ml.fuse.p, auc: act.ml.fuse.auc, teruji: act.ml.fuse.valid, bobot: act.ml.fuse.w } : null,
      kelly: act.plan && act.plan.kelly ? { penuh: act.plan.kelly.f, seperempat: act.plan.kelly.q } : null,
      indodax_live: lv.data && !lv.data.err && state.data && lv.sym === state.data.symbol ? { harga_idr: lv.data.p.last, spread: lv.data.spread, tekanan_antrean_beli: lv.data.imb, aliran_transaksi_beli: lv.data.flow, premium_vs_global: lv.data.prem } : null,
      ai_lokal: act.brain ? { kesimpulan: act.brain.action, skor_aturan: act.brain.score, alasan: act.brain.reasons.map((r) => r.txt), risiko: act.brain.risk } : null,
      rekam_jejak_historis: act.hist && act.hist.n ? { rencana_dinilai: act.hist.n, benar: rnd(act.hist.ok, 3), keyakinan_dijanjikan: rnd(act.hist.cpPred, 3), keyakinan_terjadi: rnd(act.hist.cpAct, 3),
        per_aksi: Object.fromEntries(Object.entries(act.hist.by).map(([k, v]) => [k, { n: v.n, benar: rnd(v.ok, 3) }])), sejak: act.hist.from } : null,
      prediksi_harga: act.ml && act.ml.fc ? { horizon_hari: act.ml.H, titik_tengah: rnd(act.ml.fc.px, 6), rentang: act.ml.fc.bands.map((b) => ({ keyakinan: b.q, bawah: rnd(b.lo, 6), atas: rnd(b.hi, 6), terbukti: rnd(b.cover, 3) })), arah_benar_oos: rnd(act.ml.fc.dirHit, 3), r2_oos: rnd(act.ml.fc.r2, 3) } : null,
      keyakinan_keputusan: isFinite(P.confPct) ? { nilai: rnd(P.confPct, 3), sumber: P.confSrc } : null,
      valuasi_gabungan: act.val && act.val.methods && act.val.methods.length ? { median: rnd(act.val.med, 6), rentang: [rnd(act.val.lo, 6), rnd(act.val.hi, 6)], upside: rnd(act.val.upside, 3), kesepakatan: rnd(act.val.agree, 2), metode: act.val.methods.map(([nm, v]) => [nm, rnd(v, 6)]) } : null,
      berita: act.news ? { sentimen_7_hari: act.news.net, jumlah_7_hari: act.news.nRecent, dampak_positif_3h: rnd(act.news.pos.m, 3), t_positif: rnd(act.news.pos.t, 2), dampak_negatif_3h: rnd(act.news.neg.m, 3), t_negatif: rnd(act.news.neg.t, 2), pola_teruji: act.news.reliable, terbaru: act.news.top } : null,
      volume: (() => { const v = state.data.ohlc.slice(-60).map((b) => b[5] || 0), a5 = MCEngine.mean(v.slice(-5)), a60 = MCEngine.mean(v); return a60 > 0 ? { rasio_5h_vs_60h: rnd(a5 / a60, 3), hari_ini_vs_60h: rnd(v[v.length - 1] / a60, 3) } : null; })(),
      target_uang: act.goal ? { modal_rp: parseFloat($("actCap").value) || 0, target_rp: parseFloat($("actGoal").value) || 0, risiko_per_transaksi: parseFloat($("actRisk").value), peluang_1th: rnd(act.goal.p1, 3), peluang_3th: rnd(act.goal.p3, 3), transaksi_dibutuhkan: isFinite(act.goal.tradesNeeded) ? act.goal.tradesNeeded : "tidak tercapai" } : null };
  }
  // ringkasan lengkap machine learning yang dibaca AI (angka saja; AI diminta tidak mengarang di luar ini)
  function mlForAi() { const M = act.ml; if (!M || M.error) return null; const r = (x, k = 3) => (isFinite(x) ? +(+x).toPrecision(k) : null), fv = Object.fromEntries((M.feats || []).map((f) => [f.name, f.v]));
    return { horizon_hari: M.H, target: `harga ${M.H} hari bursa lagi > harga sekarang + biaya pulang-pergi`, peluang_naik_terkalibrasi: r(M.p), peluang_dasar_historis: r(M.base),
      teruji: M.valid, syarat_teruji: "AUC ≥ 0,53, nilai-p < 0,05, Brier skill > 0", auc_gabungan: r(M.auc), p_value: r(M.aucP), brier_skill: r(M.bss), akurasi: r(M.acc), sampel_uji_independen: M.nEff,
      model: (M.models || []).map(([nm, a, w]) => ({ nama: nm, auc: r(a), bobot: r(w, 2) })), peluang_per_model_hari_ini: { logistik: r(M.pLog), boosting: r(M.pGb), pola_mirip: r(M.pKnn), jaringan_saraf: r(M.pMlp) },
      fitur_terpenting: M.imp.slice(0, 8).map((f) => ({ nama: f.name, turun_auc_bila_diacak: r(f.v), arah: f.dir > 0 ? "nilai tinggi → peluang naik" : f.dir < 0 ? "nilai tinggi → peluang turun" : "netral", nilai_hari_ini: r(fv[f.name], 4) })),
      kalibrasi: (M.calib || []).map((c) => ({ dijanjikan: r(c.pred), terjadi: r(c.act), n: c.n })), ketidakpastian_antar_model: r(M.disagree),
      triple_barrier: M.tb ? { arti: `peluang kena +${M.tb.up}×ATR sebelum −${M.tb.dn}×ATR dalam ${M.tb.H} hari`, peluang: r(M.tb.p), dasar: r(M.tb.base), auc: r(M.tb.auc), p_value: r(M.tb.aucP), teruji: M.tb.valid } : null,
      struktur_waktu: (M.term || []).map((t) => ({ hari: t.h, peluang_naik: r(t.p), rata_rata: r(t.base) })), data_lintas_pasar: M.ext, berita_sebagai_fitur: M.newsUsed ? `${M.newsDays} hari` : "tidak (riwayat belum cukup)",
      uji_trading_oos: M.bt ? { sharpe_ml: r(M.bt.s.sharpe), sharpe_beli_tahan: r(M.bt.b.sharpe), return_ml: r(M.bt.s.total), return_beli_tahan: r(M.bt.b.total) } : null,
      prediksi_harga: M.fc ? { titik_tengah: r(M.fc.px, 6), penyusutan_ke_tidak_berubah: r(M.fc.shrink, 2), r2_oos: r(M.fc.r2), arah_benar_oos: r(M.fc.dirHit),
        rentang: M.fc.bands.map((b) => ({ keyakinan: b.q, bawah: r(b.lo, 6), atas: r(b.hi, 6), terbukti: r(b.cover) })) } : null }; }
  async function askAi(q) {
    if (!act.plan || !q) return; const log = $("actQa"), id = "qa" + Date.now();
    const loc = localAnswer(q); log.insertAdjacentHTML("afterbegin", `<div><div class="q">❯ ${esc(q)}</div><div class="a">${loc || "Belum ada jawaban di data maupun panduan. Coba centang + Gemini."}<div class="note">RAM AI (lokal)</div></div></div>`);
    if (!$("actAskGem").checked) return;
    log.insertAdjacentHTML("afterbegin", `<div id="${id}"><div class="q">❯ ${esc(q)}</div><div class="a note">AI sedang membaca hasil analisis & machine learning…</div></div>`); $("actAskB").disabled = true;
    try { const res = await apiFetch(`${API}?action=brief`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: state.data.symbol, data: briefData(), q }) });
      const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || `AI gagal (${res.status})`);
      $(id).querySelector(".a").className = "a"; $(id).querySelector(".a").innerHTML = esc(j.jawaban || "") + (j.dasar ? `<div class="note">Dasar angka: ${esc(j.dasar)}</div>` : "") + `<div class="note">${esc(j.model || "")}${j.cached ? " · tersimpan" : ""}</div>`; }
    catch (e) { $(id).querySelector(".a").innerHTML = `<span class="neg">AI gagal: ${esc(e.message)}</span>`; }
    finally { $("actAskB").disabled = false; } }
  async function runBrief(auto = false) {
    if (!act.plan || act.busy) return; const k = aiKeyOf(); if (auto && act.aiTried === k) return; act.aiTried = k;
    act.busy = true; act.aiErr = null; $("actAiRun").disabled = true; $("actAiRun").textContent = "AI sedang membaca…"; $("actAi").innerHTML = '<p class="status">AI sedang membaca semua hasil analisis… (bisa sampai ±40 detik)</p>';
    try { const res = await apiFetch(`${API}?action=brief`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: state.data.symbol, data: briefData() }) });
      const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || `AI gagal (${res.status})`);
      if (k !== aiKeyOf()) return; act.ai = j; act.aiKey = k;
      try { const L = trkLoad(), e = L.find((x) => act.trk && x.s === act.trk.s && x.d === act.trk.d); const adj = aiAdjusted(); if (e && adj) { e.ai = adj.raw; e.aiAdj = adj.v; trkSave(L); } } catch { /* */ }
      drawAction(); }
    catch (e) { act.aiErr = /Failed to fetch|NetworkError|timeout/i.test(e.message) ? "Koneksi ke server AI terputus atau terlalu lama. Klik lagi untuk mencoba." : e.message; drawAiErr(); }
    finally { act.busy = false; $("actAiRun").disabled = false; $("actAiRun").textContent = "Pendapat Gemini"; }
  }
  // keyakinan AI dijangkarkan ke bukti yang teruji: maks ±15 poin dari keyakinan keputusan (atau ±20 dari akurasi historis); tanpa bukti teruji maks 60%
  function aiAdjusted() { const a = act.ai, P = act.plan; if (!a || a.keyakinan == null || !P) return null; const raw = Math.round(a.keyakinan);
    const ref = isFinite(P.confPct) ? P.confPct * 100 : null, w = P.ml && P.ml.valid ? 15 : 20;
    const v = ref != null ? Math.round(Math.max(ref - w, Math.min(ref + w, raw))) : Math.min(60, raw); return { raw, v }; }
  function drawAiErr() { $("actAi").innerHTML = `<p class="status err">AI gagal: ${esc(act.aiErr || "")}</p><p class="note">Angka-angka lain di kartu ini tetap valid tanpa AI. Kalau terus gagal: cek secret GEMINI_API_KEY di Supabase → Edge Functions → Secrets, atau coba lagi 1–2 menit lagi (server Gemini kadang penuh).</p>`; }
  function drawBrief() {
    const a = act.ai; if (!a) return; const sc = /tidak/i.test(a.sikap) ? "neg" : /setuju/i.test(a.sikap) ? "pos" : "";
    $("actAi").innerHTML = `<p><span class="ai-stance ${sc}">${esc((a.sikap || "?").toUpperCase())}</span> &nbsp;keyakinan AI <b>${nf(0).format(a.keyakinan)}%</b></p><p>${esc(a.ringkasan)}</p>
      ${a.poin && a.poin.length ? `<b>Pendukung</b><ul>${a.poin.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}${a.risiko && a.risiko.length ? `<b>Risiko</b><ul>${a.risiko.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
      ${a.alasan_keyakinan ? `<p class="note">Alasan keyakinan: ${esc(a.alasan_keyakinan)}</p>` : ""}${a.pemicu_batal ? `<p><b>Batalkan rencana bila:</b> ${esc(a.pemicu_batal)}</p>` : ""}${a.catatan_target ? `<p><b>Target uang:</b> ${esc(a.catatan_target)}</p>` : ""}
      ${a.prediksi ? `<p><b>Prediksi AI ${esc(String(act.ml && act.ml.H || ""))} hari:</b> ${esc(a.prediksi)}</p>` : ""}
      <p class="note">${esc(a.model || "")}${a.cached ? " · tersimpan" : ""}. Keyakinan AI adalah penilaian model bahasa, jadi dijangkarkan ke bukti yang teruji (maks ±15 poin dari keyakinan keputusan) dan dicatat di rekam jejak untuk dicek ketepatannya.</p>`;
  }
  // =====================================================================
  // AI LOKAL ("RAM AI"): sistem pakar dari aturan Buku Panduan — jalan di browser, tanpa Gemini.
  // 3 kecerdasan: Machine learning (stack 4 model) · Deep learning (CNN + attention) · AI lokal (aturan) → satu kesimpulan.
  // =====================================================================
  function brain() {
    const P = act.plan; if (!P) return null; const M = act.ml && !act.ml.error ? act.ml : null, DL = M && M.dl && !M.dl.error ? M.dl : null, C = act.conf && !act.conf.error ? act.conf : null;
    const dirP = (m) => (!m || !isFinite(m.p) ? 0 : !m.valid ? 0 : m.p >= 0.55 ? 1 : m.p <= 0.45 ? -1 : 0);
    const R = [], risk = [], add = (w, txt) => R.push({ w, txt });
    // aturan Bab 7A, 8, 14
    if (P.nRobust) add(P.voteAction === "BELI" ? 2 : P.voteAction === "JUAL" ? -2 : 0, `${P.nRobust} strategi lolos uji: ${P.voteAction}`); else add(0, "Tak ada strategi lolos uji");
    if (C) { if (C.sel && C.sel.active) add(3, `Setup A+ aktif (${pct(C.sel.best.up, 0)} historis)`);
      else if (C.valid) add(C.sNow >= 3 ? 1.5 : C.sNow <= -3 ? -1.5 : 0, `Konfluensi ${C.sNow > 0 ? "+" : ""}${C.sNow}/${C.nNow} (teruji)`);
      else add(C.sNow >= 4 ? 0.5 : C.sNow <= -4 ? -0.5 : 0, `Konfluensi ${C.sNow > 0 ? "+" : ""}${C.sNow}/${C.nNow} (belum teruji)`); }
    const Dd = act.mtfD, Mt = act.mtf || {}; if (Dd) { const tf = [Dd.week, Dd.day, Mt.h4, Mt.h1].filter(Boolean), up = tf.filter((x) => x.dir > 0).length, dn = tf.filter((x) => x.dir < 0).length;
      if (up === tf.length && tf.length >= 3) add(1, "Semua timeframe naik"); else if (dn === tf.length && tf.length >= 3) add(-1, "Semua timeframe turun");
      if (Dd.week.dir < 0 && Dd.day.dir > 0) risk.push("Harian naik melawan tren mingguan"); if (Dd.week.dir > 0 && Dd.day.dir < 0) risk.push("Koreksi dalam tren naik mingguan"); }
    const pr = P.pr; if (pr) { if (pr.expR > 0.15) add(1, `Ekspektasi +${nf(2).format(pr.expR)}R`); else if (pr.expR <= 0) add(-2, `Ekspektasi ${nf(2).format(pr.expR)}R`); }
    if (P.rr1 < 1.5) risk.push(`RR 1:${nf(1).format(P.rr1)} < 1,5`);
    const V = act.val; if (V && V.methods && V.methods.length >= 3 && V.agree >= 0.6) { if (V.upside > 0.2) add(1, `Murah ${spct(V.upside, 0)} vs nilai wajar`); else if (V.upside < -0.2) add(-1, `Mahal ${spct(V.upside, 0)} vs nilai wajar`); }
    const N = act.news; if (N && N.reliable) add(N.effect > 0 ? 1 : -1, `Dampak berita teruji ${spct(N.effect, 1)}`);
    if (state.math && state.math.hmm && state.math.hmm.probHighNow > 0.6) risk.push("Rezim bergejolak → kecilkan posisi");
    const Lq = lv.data && !lv.data.err && state.data && lv.sym === state.data.symbol ? lv.data : null;
    if (Lq) { if (Lq.imb > 0.65 && Lq.flow > 0.55) add(0.5, `Indodax: antrean ${pct(Lq.imb, 0)} & transaksi ${pct(Lq.flow, 0)} beli`); else if (Lq.imb < 0.35 && Lq.flow < 0.45) add(-0.5, `Indodax: antrean ${pct(1 - Lq.imb, 0)} & transaksi ${pct(1 - Lq.flow, 0)} jual`);
      if (isFinite(Lq.prem) && Math.abs(Lq.prem) > 0.02) risk.push(`Harga Indodax ${spct(Lq.prem, 1)} vs global`); if (Lq.spread > 0.005) risk.push(`Spread Indodax ${pct(Lq.spread, 2)}`); if (Lq.wa && P.action === "BELI" && Lq.wa.px < P.t1 * (Lq.ratio || 0)) risk.push(`Tembok jual Rp ${fmtNum(Lq.wa.px)} sebelum target 1`); }
    if (M && M.disagree > 0.12) risk.push("4 model ML berbeda pendapat");
    if (P.acc && isFinite(P.acc.p) && P.acc.p - P.acc.base < 0.03) risk.push("Akurasi historis ≈ peluang dasar");
    const score = R.reduce((s, r) => s + r.w, 0), aiDir = score >= 2 ? 1 : score <= -2 ? -1 : 0;
    let action = P.action, why = "";
    if (action === "BELI" && score <= -3) { action = "TAHAN"; why = "AI lokal menolak (skor aturan ≤ −3)"; }
    const mErr = act.ml && act.ml.error ? "data kurang" : null, dErr = mErr || (M && (!M.dl || M.dl.error) ? "data kurang" : null);
    const parts = [{ k: "ML", dir: dirP(M), p: M ? M.p : NaN, valid: !!(M && M.valid), auc: M ? M.auc : NaN, err: mErr }, { k: "DL", dir: dirP(DL), p: DL ? DL.p : NaN, valid: !!(DL && DL.valid), auc: DL ? DL.auc : NaN, err: dErr },
      { k: "AI", dir: aiDir, score, valid: true }];
    const want = action === "BELI" ? 1 : action === "JUAL" ? -1 : 0, live = parts.filter((x) => x.valid), agree = live.filter((x) => x.dir === want).length;
    return { action, why, conf: P.confPct, confSrc: P.confSrc, parts, agree, nLive: live.length, score, reasons: R.filter((r) => r.w).sort((a, b) => Math.abs(b.w) - Math.abs(a.w)), risk };
  }
  function drawBrain() {
    const el = $("actBrain"); if (!el) return; const B = brain(); if (!B) { el.innerHTML = ""; return; } act.brain = B;
    const arrow = (d) => (d > 0 ? '<b class="pos">▲</b>' : d < 0 ? '<b class="neg">▼</b>' : '<span class="note">•</span>');
    const cell = (x) => x.k === "AI" ? `<div class="br-c"><div class="k">AI lokal</div><div class="v">${arrow(x.dir)} ${x.score > 0 ? "+" : ""}${nf(1).format(x.score)}</div><div class="h">aturan</div></div>`
      : `<div class="br-c ${x.valid ? "ok" : "off"}"><div class="k">${x.k === "ML" ? "Machine learning" : "Deep learning"}</div><div class="v">${isFinite(x.p) ? `${arrow(x.dir)} ${pct(x.p, 0)}` : x.err ? "–" : "…"}</div><div class="h">${isFinite(x.auc) ? `AUC ${nf(2).format(x.auc)} · ${x.valid ? "teruji" : "abaikan"}` : x.err || esc(act.mlProg || "melatih…")}</div></div>`;
    const vc = B.action === "BELI" ? "buy" : B.action === "JUAL" ? "sell" : "hold";
    const P = act.plan, f = fmtNum, idx = isIdx();
    const line = B.action === "BELI" ? [["Antre beli", f(P.entry)], ["Stop", `<span class="neg">${f(P.stop)}</span>`], ["Target", `<span class="pos">${f(P.t1)} / ${f(P.t2)}</span>`], ["RR", `1:${nf(1).format(P.rr1)}`], ["Jumlah", P.qty > 0 ? (idx ? nf(0).format(P.qty) + " lot" : nf(4).format(P.qty)) : "–"], ["Sampai", fmtDay(P.expire)]]
      : B.action === "JUAL" ? [["Jual di", f(P.entryHi)], ["Sisa jual bila tutup <", `<span class="neg">${f(P.trail)}</span>`], ["Beli lagi bila tutup >", f(P.trigUp)], ["Paling lambat", fmtDay(P.expire)]]
      : [["Beli bila tutup >", f(P.trigUp)], ...(P.pull ? [["Atau antre di", f(P.pull)]] : []), ["Pemegang jual bila tutup <", `<span class="neg">${f(P.trail)}</span>`], ["Evaluasi", fmtDay(P.review)]];
    el.innerHTML = `<div class="br"><div class="br-f ${vc}"><div class="k">Kesimpulan 3 kecerdasan</div><div class="v">${B.action}</div><div class="h">keyakinan ${isFinite(B.conf) ? `<b>${pct(B.conf, 0)}</b>` : "–"} · ${B.agree}/${B.nLive} teruji mendukung${act.plan && act.plan.fuse ? " · fusi" : ""}</div></div>${B.parts.map(cell).join("")}</div>
      <div class="br-line">${line.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join("")}<div class="br-act"><button class="btn" data-goat="ask">Tanya AI</button></div></div><div id="qkBox"></div>
      <div class="br-why">${B.reasons.slice(0, 4).map((r) => `<span class="${r.w > 0 ? "pos" : "neg"}">${r.w > 0 ? "+" : "−"} ${esc(r.txt)}</span>`).join("")}${B.risk.slice(0, 3).map((r) => `<span class="warn">! ${esc(r)}</span>`).join("")}${B.why ? `<span class="neg">${esc(B.why)}</span>` : ""}</div>`; drawQuick();
  }
  document.addEventListener("click", (e) => { const t = e.target; if (!t || !t.closest) return; if (t.id === "brDemo") actToDemo();
    const m = t.closest("[data-qm]"); if (m) { qk.mode = m.dataset.qm; qk.arm = null; if (qk.mode === "idx" && !ix.bal) idxBalance().then(drawQuick).catch(() => {}); drawQuick(); return; }
    if (t.closest("#qkIn")) qkGo("in"); else if (t.closest("#qkOut")) qkGo("out");
    if (t.closest("#qkAp")) { e.preventDefault(); const L = apList(); if (state.data && !L.includes(state.data.symbol)) { $("apList").value = [...L, state.data.symbol].slice(0, 8).join(", "); apRead(); apSave(); } setView("trade"); setTradeTab("ap"); } });
  // tanya-jawab lokal: niat pertanyaan → jawaban dari angka di halaman; selain itu cari di Buku Panduan
  function localAnswer(q, dataOnly = false) {
    const P = act.plan, B = act.brain || brain(), s = String(q).toLowerCase(), M = act.ml && !act.ml.error ? act.ml : null, DL = M && M.dl && !M.dl.error ? M.dl : null, C = act.conf, idx = isIdx();
    if (!P) return null; const f = fmtNum, lines = [];
    const has = (re) => re.test(s);
    if (has(/\b(stop|cut ?loss|sl)\b/)) lines.push(`Stop${P.action !== "BELI" ? " (bila tetap beli)" : ""}: jual bila harga <b>tutup</b> di bawah <b class="neg">${f(P.stop)}</b> (−${pct(P.riskPctPx, 1)} dari harga masuk ${f(P.entry)}).${P.qty > 0 ? ` Rugi maks ±${big(P.riskAmt * actFx(), "IDR")}.` : ""}`);
    if (has(/target|tp\b|take profit|jual di|ambil untung/)) lines.push(`Target 1 <b>${f(P.t1)}</b> (jual ½, stop naik ke ${f(P.entry)}), target 2 <b>${f(P.t2)}</b>. RR 1:${nf(1).format(P.rr1)} / 1:${nf(1).format(P.rr2)}.`);
    if (has(/kapan|waktu|tanggal|berapa lama|hari/)) lines.push(`Order mulai ${P.when}, berlaku sampai ${fmtDay(P.expire)}, evaluasi paling lambat ${fmtDay(P.review)} (horizon ${P.H} hari).`);
    if (has(/risiko|bahaya|rugi|aman/)) lines.push(B.risk.length ? `Risiko: ${B.risk.map(esc).join("; ")}.` : "Tidak ada peringatan risiko khusus selain stop.");
    if (has(/\bml\b|machine|model|auc|pembelajaran/)) lines.push(M ? `ML: peluang naik ${M.H} hari <b>${pct(M.p, 0)}</b>, AUC ${nf(3).format(M.auc)} (p ${nf(3).format(M.aucP)}) → ${M.valid ? "teruji, ikut memutuskan" : "belum teruji, hanya informasi"}. Fitur terkuat: ${M.imp.slice(0, 3).map((x) => esc(x.name)).join(", ")}.` : "ML belum selesai dilatih.");
    if (has(/deep|\bdl\b|saraf|neural|cnn|attention|perhatian/)) lines.push(DL && isFinite(DL.p) ? `Deep learning: peluang naik <b>${pct(DL.p, 0)}</b>, AUC ${nf(3).format(DL.auc)} → ${DL.valid ? "teruji" : "belum teruji"}. Hari yang paling diperhatikan: ${DL.att ? DL.att.slice().sort((a, b) => b.w - a.w).slice(0, 3).map((x) => x.d.slice(5)).join(", ") : "–"}.` : "Deep learning belum tersedia untuk aset ini.");
    if (has(/valuasi|wajar|murah|mahal|intrinsik|fundamental/)) { const V = act.val; lines.push(V && V.methods && V.methods.length ? `Nilai wajar gabungan ${f(V.med)} (${spct(V.upside, 0)}), ${V.methods.length} metode, kesepakatan ${pct(V.agree, 0)} → ${esc(V.side)}.` : "Valuasi belum tersedia (aset tanpa data fundamental)."); }
    if (has(/berita|news|sentimen/)) { const N = act.news; lines.push(N ? `Berita 7 hari: ${N.nRecent}, bersih ${N.net > 0 ? "+" : ""}${N.net}. ${N.reliable ? `Dampak teruji ${spct(N.effect, 1)}.` : "Dampaknya belum teruji."}` : "Belum ada cukup berita."); }
    if (has(/konfluensi|timeframe|mingguan|a\+|setup|skor/)) lines.push(C && !C.error ? `Konfluensi ${C.sNow > 0 ? "+" : ""}${C.sNow}/${C.nNow} (${C.valid ? "teruji" : "belum teruji"}). Setup A+: ${C.sel && C.sel.active ? "<b class='pos'>aktif</b>" : C.sel && C.sel.best ? "belum terpenuhi" : "tidak teruji di aset ini"}.` : "Konfluensi belum dihitung.");
    if (has(/kelly|ukuran posisi|berapa lot|berapa banyak|porsi|alokasi/) && P.kelly) lines.push(P.action !== "BELI" ? `Keputusan sekarang ${P.action}, jadi tidak ada ukuran posisi beli yang disarankan.` : P.kelly.f <= 0 ? "Kelly 0%: distribusi hasil rencana ini tidak menguntungkan, jangan ambil posisi." : `Risiko optimal ${pct(Math.min(P.kelly.q, kellyCap(P)), 1)} modal per transaksi (¼ Kelly ${pct(P.kelly.q, 1)}, Kelly penuh ${pct(P.kelly.f, 1)}). Dibatasi ${pct(kellyCap(P), 1)} karena Kelly dari data historis cenderung terlalu optimistis${kellyCap(P) < 0.01 ? " dan buktinya belum teruji" : ""}. Rencana saat ini: ${P.qty > 0 ? (isIdx() ? nf(0).format(P.qty) + " lot" : nf(4).format(P.qty)) : "–"} pada risiko yang kamu pilih.`);
    if (has(/order ?book|indodax|antrean|antrian|\bbid\b|\bask\b|spread|premium|transaksi real|real ?time/)) { const Lq = lv.data && !lv.data.err ? lv.data : null; lines.push(Lq ? `Indodax ${esc(Lq.p.base.toUpperCase())}/IDR: Rp ${fmtNum(Lq.p.last)}, spread ${pct(Lq.spread, 2)}, antrean 10 level ${pct(Lq.imb, 0)} beli, 30 transaksi terakhir ${pct(Lq.flow, 0)} beli, premium vs global ${isFinite(Lq.prem) ? spct(Lq.prem, 2) : "–"}.${Lq.ratio ? ` Antre beli versi Indodax ±Rp ${fmtNum(P.entry * Lq.ratio)}.` : ""}` : isCrypto() ? "Data Indodax belum termuat untuk koin ini." : "Order book riil hanya tersedia untuk kripto di Indodax; antrean saham IDX hanya ada di aplikasi sekuritasmu."); }
    if (has(/yakin|keyakinan|persen|confidence|percaya/)) lines.push(`Keyakinan ${isFinite(P.confPct) ? `<b>${pct(P.confPct, 0)}</b> dari ${esc(P.confSrc)}` : "belum ada ukuran teruji"}. Angka ini dikalibrasi: naik hanya kalau buktinya lebih kuat (setup A+, ML/DL teruji), bukan diatur manual.`);
    const defn = /^(apa itu|apa arti|arti|jelaskan|definisi|maksud)/.test(s.trim());
    if (!defn && (has(/\b(beli|jual|tahan|harus|lakukan|sebaiknya|kenapa|mengapa|alasan|kesimpulan|masuk|entry)\b/) || (!lines.length && has(/gimana|bagaimana|gmn/)))) { const L0 = lines.splice(0);
      lines.push(`<b>${B.action}</b>${isFinite(B.conf) ? ` · keyakinan ${pct(B.conf, 0)}` : ""} · ${B.agree}/3 kecerdasan searah.`);
      if (B.reasons.length) lines.push("Alasan: " + B.reasons.slice(0, 4).map((r) => `${r.w > 0 ? "+" : "−"} ${esc(r.txt)}`).join("; ") + ".");
      if (B.action === "BELI") lines.push(`Antre beli ${f(P.entry)}${P.qty > 0 ? ` (${idx ? nf(0).format(P.qty) + " lot" : nf(4).format(P.qty)})` : ""}, stop ${f(P.stop)}, target ${f(P.t1)} / ${f(P.t2)}.`);
      else if (B.action === "TAHAN") lines.push(`Beli baru bila tutup di atas ${f(P.trigUp)}; pemegang jual bila tutup di bawah ${f(P.trail)}.`);
      else lines.push(`Pemegang: jual di ±${f(P.entryHi)}; beli lagi bila tutup di atas ${f(P.trigUp)}.`);
      if (B.risk.length) lines.push("Risiko: " + B.risk.slice(0, 3).map(esc).join("; ") + "."); lines.push(...L0.filter((x) => !/^Stop/.test(x) || B.action !== "BELI")); }
    if (lines.length) return lines.join("<br>"); if (dataOnly) return null;
    const h = kbSearch(q); return h.length ? `<b>${esc(h[0].t)}</b><br>${h[0].a}` : null;
  }

  // =====================================================================
  // RADAR: scan banyak aset sekaligus → mana yang diperhatikan / diuji / diabaikan
  // =====================================================================
  const RD_UNI = { us: ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "AVGO", "JPM", "V", "LLY", "BRK-B"], crypto: ["BTC-USD", "ETH-USD", "SOL-USD", "BNB-USD", "XRP-USD", "ADA-USD", "DOGE-USD", "AVAX-USD"] };
  const rd = { rows: [], busy: false, sort: "score" };
  function rdUniverse() { const u = $("rdUni").value; if (u === "idx") return MK.stocks.slice(); if (u === "wl") return $("wlQ").value.split(/[,\s]+/).map((s) => normTicker(s.trim())).filter(Boolean);
    if (u === "all") return [...MK.stocks, ...RD_UNI.us, ...RD_UNI.crypto]; if (GM_UNI[u]) return GM_UNI[u].slice(); return RD_UNI[u].slice(); }
  function rdScore(r) { // skor 0-100-an dari bukti; status hanya "Perhatikan" bila ada bukti yang teruji
    let s = 0; const why = [], C = r.conf, B = r.bin, F = r.ml, V = r.val;
    if (C) { if (C.aplus) { s += 30; why.push("A+ aktif"); } else if (C.valid && C.s >= 3) { s += 12; why.push(`konfluensi +${C.s} teruji`); } else s += (C.s / 9) * 8; if (C.trend > 0 && C.week > 0) s += 4; if (C.week < 0) s -= 4; }
    if (B) { const e = Math.max(-15, Math.min(15, B.ev * 12)); s += e; if (B.ev > 0.4) why.push(`binomial ${pct(B.pUp, 0)} target dulu`); }
    if (F && F.valid) { const e = (F.p - F.base) * 100; s += Math.max(-20, Math.min(20, e)); if (e >= 5) why.push(`ML ${pct(F.p, 0)} teruji`); else if (e <= -5) why.push(`ML ${pct(F.p, 0)} lemah`); }
    if (V && isFinite(V.upside) && (V.upside > 3 || V.upside < -0.95)) { why.push("valuasi tidak wajar (cek data)"); V.bad = true; }
    else if (V && V.methods && V.methods.length >= 2 && V.agree >= 0.6) { s += Math.max(-12, Math.min(12, V.upside * 40)); if (V.upside > 0.2) why.push(`murah ${spct(V.upside, 0)}`); else if (V.upside < -0.2) why.push(`mahal ${spct(V.upside, 0)}`); }
    if (r.deep) { const M = r.deep; if (M.valid && M.p - M.base >= 0.05) { s += 10; why.push(`ML penuh ${pct(M.p, 0)}`); } if (M.dl && M.dl.valid && M.dl.p - M.dl.base >= 0.05) { s += 8; why.push(`DL ${pct(M.dl.p, 0)}`); } }
    const tested = (C && (C.aplus || C.valid)) || (F && F.valid) || (r.deep && (r.deep.valid || (r.deep.dl && r.deep.dl.valid)));
    const st = s >= 20 && tested ? "Perhatikan" : s >= 12 ? "Uji dulu" : s <= -12 ? "Lemah" : "Abaikan";
    return { sc: s, st, why };
  }
  async function runRadar() {
    if (rd.busy) return; rd.busy = true; $("rdRun").disabled = true; const syms = [...new Set(rdUniverse())].slice(0, 80), N = syms.length, wantF = $("rdFund").checked; let done = 0;
    const tick = (m) => { done++; $("rdBar").style.width = Math.round((100 * done) / (N + ($("rdDeep").checked ? 3 : 0))) + "%"; $("rdStatus").textContent = m; };
    rd.rows = []; $("rdStatus").textContent = `Memindai ${N} aset…`; await ensureUsRf(); try { await idxPairsLoad(); } catch { /* */ }
    try {
      await pool(syms, 4, async (s) => {
        try { const d = await fetchSymbol(s, "5y"); if (!d.ohlc || d.ohlc.length < 300) throw new Error("data < 300 hari");
          const crypto = /CRYPTO/i.test(d.type || "") || /-USDT?$/.test(s), R = await compute("radar", { D: buildD(d), o: { ppy: crypto ? 365 : 252, H: 10, isIdx: /\.JK$/.test(s) } });
          let val = null; const eq = !crypto && !/^\^/.test(s) && !/=/.test(s);
          if (wantF && eq) { try { const F = await (await apiFetch(`${API}?action=fundamentals&symbol=${encodeURIComponent(s)}`)).json(); val = valEnsemble(F, R.px, (d.currency || "") !== "IDR", null); } catch { /* */ } }
          const row = { s, name: d.name, cur: d.currency, ...R, val }; Object.assign(row, rdScore(row)); rd.rows.push(row); tick(`${s} ✓`); drawRadar(); }
        catch (e) { rd.rows.push({ s, err: e.message, st: "Gagal", why: [], sc: -99 }); tick(`${s} gagal`); } });
      if ($("rdDeep").checked) { // uji mendalam: ML penuh (4 model + deep learning) untuk 3 kandidat teratas
        const top = rd.rows.filter((r) => !r.err && r.st !== "Lemah").sort((a, b) => b.sc - a.sc).slice(0, 3);
        for (const r of top) { $("rdStatus").textContent = `Uji mendalam ${r.s}: ML + deep learning…`;
          try { const d = await fetchSymbol(r.s, "10y"); const M = await compute("ml", { D: buildD(d), o: { horizon: 10 } }); r.deep = { valid: M.valid, p: M.p, base: M.base, auc: M.auc, dl: M.dl && !M.dl.error ? { valid: M.dl.valid, p: M.dl.p, base: M.dl.base, auc: M.dl.auc } : null }; Object.assign(r, rdScore(r)); }
          catch (e) { r.deep = { err: e.message }; } tick(`Uji mendalam ${r.s} ✓`); drawRadar(); } }
      const k = rd.rows.filter((r) => r.st === "Perhatikan").length; $("rdStatus").textContent = `Selesai: ${N} aset · ${k} perlu diperhatikan · data s/d ${(rd.rows.find((r) => r.d) || {}).d || "–"}`;
      try { localStorage.setItem("sp_radar_v1", JSON.stringify({ at: Date.now(), uni: $("rdUni").value, rows: rd.rows.map((r) => { const o = { ...r }; if (o.val) o.val = { upside: o.val.upside, med: o.val.med, agree: o.val.agree, methods: o.val.methods.map((m) => [m[0], m[1]]) }; return o; }) })); } catch { /* */ }
    } finally { rd.busy = false; $("rdRun").disabled = false; $("rdBar").style.width = "100%"; }
  }
  function drawRadar() {
    const ord = { Perhatikan: 0, "Uji dulu": 1, Abaikan: 2, Lemah: 3, Gagal: 4 }, R = rd.rows.slice().sort((a, b) => ord[a.st] - ord[b.st] || b.sc - a.sc);
    const cnt = (k) => rd.rows.filter((r) => r.st === k).length;
    $("rdSum").innerHTML = ["Perhatikan", "Uji dulu", "Abaikan", "Lemah"].map((k) => `<span class="rd-pill rd-${k.replace(" ", "")}">${k} <b>${cnt(k)}</b></span>`).join("");
    const mlc = (r) => { const F = r.deep && !r.deep.err ? r.deep : r.ml; if (!F) return "–"; const dl = r.deep && r.deep.dl; return `<span class="${F.valid ? (F.p > F.base ? "pos" : "neg") : "note"}">${pct(F.p, 0)}</span>${F.valid ? "" : '<span class="note">·x</span>'}${dl ? ` <span class="note">DL</span> <span class="${dl.valid ? (dl.p > dl.base ? "pos" : "neg") : "note"}">${pct(dl.p, 0)}</span>` : ""}`; };
    $("rdTable").innerHTML = `<thead><tr><th>Aset</th><th>Status</th><th>Skor</th><th>Konfl.</th><th>Binomial T/S</th><th>ML</th><th>Nilai wajar</th><th>3B</th><th>Rencana harga</th><th>Kenapa</th></tr></thead><tbody>${R.map((r) => r.err ? `<tr class="note"><td>${esc(r.s)}</td><td colspan="9">${esc(r.err)}</td></tr>` :
      `<tr class="rd-row" data-s="${esc(r.s)}"><td><b>${esc(r.s.replace(".JK", ""))}</b></td><td><span class="rd-pill rd-${r.st.replace(" ", "")}">${r.st}</span></td><td class="num">${nf(0).format(r.sc)}</td>
        <td class="num">${r.conf ? `${r.conf.s > 0 ? "+" : ""}${r.conf.s}${r.conf.aplus ? ' <b class="pos">A+</b>' : r.conf.valid ? " ✓" : ""}` : "–"}</td>
        <td class="num">${r.bin ? `<span class="pos">${pct(r.bin.pUp, 0)}</span>/<span class="neg">${pct(r.bin.pDn, 0)}</span>` : "–"}</td><td class="num">${mlc(r)}</td>
        <td class="num">${r.val && r.val.methods && r.val.methods.length ? (r.val.upside > 3 || r.val.upside < -0.95 ? '<span class="note" title="Kemungkinan data fundamental salah kelas saham/mata uang; diabaikan dari skor">? data</span>' : `<span class="${r.val.upside > 0 ? "pos" : "neg"}">${spct(r.val.upside, 0)}</span>`) : "–"}</td><td class="num ${cls(r.ret3m)}">${spct(r.ret3m, 0)}</td>
        <td>${planCell(r)}</td><td class="rd-why">${r.why.slice(0, 3).map(esc).join(" · ")}</td></tr>`).join("")}</tbody>`;
  }
  function bindRadar() {
    $("rdRun").onclick = runRadar;
    $("rdTable").addEventListener("click", (e) => { if (e.target.closest("button")) return; const tr = e.target.closest(".rd-row"); if (tr) openDetail(tr.dataset.s); });
    try { const j = JSON.parse(localStorage.getItem("sp_radar_v1") || "null"); if (j && j.rows && Date.now() - j.at < 3 * 864e5) { rd.rows = j.rows; $("rdUni").value = j.uni || "idx"; drawRadar(); $("rdStatus").textContent = `Hasil scan terakhir ${new Date(j.at).toLocaleString("id-ID")} · klik Scan untuk memperbarui`; } } catch { /* */ }
  }

  // =====================================================================
  // LIVE INDODAX di Analisis: order book & transaksi riil koin ini → metrik mikrostruktur, harga rencana dalam rupiah, faktor RAM AI
  // =====================================================================
  const lv = { sym: null, data: null, timer: null, busy: false };
  async function liveLoad() {
    const d = state.data; if (!d || !isCrypto() || lv.busy) return; lv.busy = true;
    try { await idxPairsLoad(); const p = idxPairFor(d.symbol); $("actTabLive").hidden = !p; if (!p) { lv.data = null; return; }
      const j = await (await apiFetch(`${API_IDX}?action=book&pair=${encodeURIComponent(p.pair)}`)).json(); if (j.error) throw new Error(j.error);
      if (!pp.fx) { try { await ppQuotes([]); } catch { /* */ } }
      const bid = j.bids[0] && j.bids[0][0], ask = j.asks[0] && j.asks[0][0], mid = bid && ask ? (bid + ask) / 2 : p.last, sum = (L, k) => L.slice(0, k).reduce((s, x) => s + x[0] * x[1], 0);
      const b10 = sum(j.bids, 10), a10 = sum(j.asks, 10), near = (L) => L.filter((x) => Math.abs(x[0] / mid - 1) <= 0.02);
      const wall = (L) => { const N = near(L); if (!N.length) return null; const avg = N.reduce((s, x) => s + x[0] * x[1], 0) / N.length, m = N.reduce((a, x) => (x[0] * x[1] > a[0] * a[1] ? x : a)); return m[0] * m[1] > 3 * avg ? { px: m[0], v: m[0] * m[1] } : null; };
      let bv = 0, sv = 0; for (const t of j.trades) { const v = t.px * t.amt; if (t.side === "buy") bv += v; else sv += v; }
      const usd = state.res && state.res.s0 > 0 ? state.res.s0 : null, fx = pp.fx || null, prem = usd && fx && p.last ? p.last / (usd * fx) - 1 : NaN;
      lv.sym = d.symbol; lv.data = { p, j, bid, ask, mid, spread: bid && ask ? (ask - bid) / ask : NaN, imb: b10 + a10 > 0 ? b10 / (b10 + a10) : NaN, b10, a10, flow: bv + sv > 0 ? bv / (bv + sv) : NaN, bv, sv,
        wb: wall(j.bids), wa: wall(j.asks), prem, ratio: usd && p.last ? p.last / usd : null, at: Date.now() };
    } catch (e) { lv.data = { err: e.message }; } finally { lv.busy = false; }
    drawLive(); drawBrain();
  }
  function liveStart() { clearInterval(lv.timer); lv.data = null; $("actTabLive").hidden = true; if (!isCrypto()) return; liveLoad(); if (isOwner() && !ix.bal) idxBalance().then(drawQuick).catch(() => {});
    lv.timer = setInterval(() => { if (document.hidden || $("detailView").hidden || !state.data || state.data.symbol !== lv.sym) return; liveLoad(); }, 15000); }
  function drawLive() {
    const el = $("actLive"); if (!el) return; const L = lv.data, P = act.plan; if (!L) { el.innerHTML = ""; return; }
    if (L.err) { el.innerHTML = `<p class="status err">Indodax: ${esc(L.err)}</p>`; return; }
    const r = L.ratio, idr = (v) => (r ? "Rp " + fmtNum(v * r) : "–"), k = (a, b, c, cl = "") => `<div class="kpi ${cl}"><div class="k">${a}</div><div class="v">${b}</div><div class="h">${c}</div></div>`;
    const side = (A, c) => A.slice(0, 8).map(([px, q]) => `<tr><td class="${c}">${fmtNum(px)}</td><td>${nf(q < 1 ? 6 : 2).format(q)}</td><td>${big(px * q)}</td></tr>`).join("");
    el.innerHTML = `<div class="act-tiles">${k("Harga Indodax", "Rp " + fmtNum(L.p.last), `bid ${fmtNum(L.bid)} · ask ${fmtNum(L.ask)} · spread ${pct(L.spread, 2)}`)}
        ${k("Tekanan antrean (10 level)", pct(L.imb, 0) + " beli", `beli ${big(L.b10)} vs jual ${big(L.a10)}`, L.imb > 0.65 ? "hl" : "")}
        ${k("Aliran transaksi (30 terakhir)", pct(L.flow, 0) + " beli", `beli ${big(L.bv)} · jual ${big(L.sv)}`, L.flow > 0.65 ? "hl" : "")}
        ${k("Premium vs global", isFinite(L.prem) ? spct(L.prem, 2) : "–", isFinite(L.prem) ? (Math.abs(L.prem) > 0.02 ? "selisih besar, hati-hati" : "wajar") : "kurs belum dimuat")}
        ${k("Tembok antrean ±2%", L.wb || L.wa ? `${L.wb ? `<span class="pos">B ${fmtNum(L.wb.px)}</span>` : ""} ${L.wa ? `<span class="neg">J ${fmtNum(L.wa.px)}</span>` : ""}` : "–", "level > 3× rata-rata: cenderung menahan harga")}
        ${k("24 jam", spct(L.p.chg24, 1), `vol Rp ${big(L.p.volIdr)}`)}</div>
      ${P && r ? `<div class="subh">Rencana aksi dalam harga Indodax (Rp)</div><div class="br-line">${[["Antre beli", idr(P.entry)], ["Stop", `<span class="neg">${idr(P.stop)}</span>`], ["Target 1", `<span class="pos">${idr(P.t1)}</span>`], ["Target 2", `<span class="pos">${idr(P.t2)}</span>`], ["Beli bila tutup >", idr(P.trigUp)], ["Pemegang jual bila <", idr(P.trail)]].map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join("")}
        <div class="br-act">${isOwner() ? `<button class="btn primary" id="liveTicket">Isi tiket Indodax</button><button class="btn" id="liveAuto">Order otomatis</button>` : ""}<button class="btn" data-cmd="DEMO">Order book penuh (F6)</button></div></div>` : ""}
      <div class="x-book"><div><div class="subh">Beli (bid)</div><table class="x-mini"><tbody>${side(L.j.bids, "pos")}</tbody></table></div><div><div class="subh">Jual (ask)</div><table class="x-mini"><tbody>${side(L.j.asks, "neg")}</tbody></table></div></div>
      <p class="note">Data riil Indodax, diperbarui tiap 15 detik. Angka-angka ini hanya kondisi saat ini (belum ada riwayat untuk diuji), jadi dipakai RAM AI sebagai faktor kecil dan peringatan, bukan penentu. Harga rencana dikonversi memakai rasio harga Indodax ÷ harga global.</p>`;
    const ab = $("liveAuto"); if (ab) ab.onclick = () => autoArmFrom(state.data.symbol, { entry: P.entry, stop: P.stop, t1: P.t1, t2: P.t2, px: state.res && state.res.s0 ? state.res.s0 : P.px });
    const b = $("liveTicket"); if (b) b.onclick = () => { const p = L.p; setView("trade"); setTradeTab("idx"); setTimeout(() => { ix.pair = p; idxPick(p.base, "buy", { price: String(Math.round(P.entry * r)) });
      if (P.qty > 0) $("xAmt").value = (+P.qty).toFixed(8).replace(/0+$/, "").replace(/\.$/, ""); idxPreview(); }, 400); };
  }

  // =====================================================================
  // HIDDEN GEMS: screening nilai + pembalikan + akumulasi + model (ML/DL) + tesis RAM AI
  // =====================================================================
  const GM_UNI = {
    idxs: ["ACES", "AKRA", "AUTO", "AVIA", "BBYB", "BFIN", "BIRD", "BJBR", "BJTM", "BMTR", "BNGA", "BNLI", "BRMS", "BSDE", "BTPS", "CLEO", "CMRY", "CTRA", "DEWA", "DMAS", "DOID", "DSNG", "ELSA", "ENRG", "ERAA", "ESSA",
      "GJTL", "HEAL", "HMSP", "HRUM", "INDY", "INKP", "INTP", "ISAT", "JPFA", "JSMR", "KIJA", "LPKR", "LPPF", "LSIP", "MAPA", "MAPI", "MARK", "MBMA", "MEDC", "MIKA", "MNCN", "MPMX", "MTEL", "MYOR", "NCKL", "NISP",
      "PGEO", "PNLF", "PTBA", "PTPP", "PWON", "RAJA", "SCMA", "SIDO", "SILO", "SMDR", "SMGR", "SMRA", "SMSM", "SRTG", "SSIA", "TAPG", "TBIG", "TINS", "TKIM", "TMAS", "TOWR", "WIKA", "ADMR", "AADI", "PTRO", "ARTO",
      "BUKA", "EMTK", "KLBF", "CPIN", "ITMG", "INCO", "MDKA", "ANTM", "PGAS", "UNTR"].map((s) => s + ".JK"),
    meme: ["DOGE", "SHIB", "PEPE", "WIF", "BONK", "FLOKI", "BOME", "MEME", "PEOPLE", "TURBO", "NEIRO", "PNUT", "TRUMP", "1000SATS", "ORDI", "DOGS", "NOT", "ACT"].map((s) => s + "-USDT"),
    ai: ["FET", "RENDER", "TAO", "WLD", "ARKM", "GRT", "NEAR", "ICP", "IO", "THETA", "AR", "FIL"].map((s) => s + "-USDT"),
    defi: ["UNI", "AAVE", "MKR", "LDO", "CRV", "COMP", "SNX", "SUSHI", "1INCH", "DYDX", "PENDLE", "JUP", "RAY", "CAKE", "GMX", "ENA"].map((s) => s + "-USDT"),
    l1: ["ETH", "SOL", "ADA", "AVAX", "DOT", "ATOM", "NEAR", "APT", "SUI", "SEI", "ARB", "OP", "POL", "STX", "TIA", "INJ", "TON", "HBAR", "ALGO", "TRX"].map((s) => s + "-USDT"),
    game: ["AXS", "SAND", "MANA", "GALA", "IMX", "ENJ", "APE", "ILV", "YGG", "PIXEL", "MAGIC", "FLOW"].map((s) => s + "-USDT"),
    alt: ["LINK", "AVAX", "DOT", "ATOM", "NEAR", "APT", "ARB", "OP", "INJ", "FIL", "ALGO", "HBAR", "VET", "AAVE", "UNI", "MKR", "LDO", "RNDR", "GRT", "SAND", "MANA", "AXS", "IMX", "XLM", "ETC", "LTC", "BCH", "TRX", "SUI", "SEI"].map((s) => s + "-USD"),
    usm: ["PLTR", "CRWD", "SNOW", "DDOG", "NET", "ZS", "MDB", "SHOP", "SQ", "ROKU", "ETSY", "PINS", "SNAP", "U", "RBLX", "AFRM", "SOFI", "HOOD", "COIN", "DKNG", "ENPH", "FSLR", "RIVN", "LCID", "CELH", "DUOL", "TTD", "OKTA", "TWLO", "PATH"] };
  const gm = { rows: [], busy: false };
  function gmScore(r) {
    const G = r.gem, V = r.val, F = r.F, ML = r.ml, C = r.conf, D = r.deep; let s = 0, max = 0; const pro = [], con = [];
    if (V && V.methods && V.methods.length >= 2) { max += 25; if (V.agree >= 0.6 && V.upside > 0) { const k = Math.min(20, V.upside * 50); s += k; if (V.upside > 0.2) pro.push(`murah ${spct(V.upside, 0)} vs nilai wajar`); } if (F && F.priceToBook > 0 && F.priceToBook < 1 && F.roe > 0.08) { s += 5; pro.push(`P/BV ${nf(2).format(F.priceToBook)}`); } if (V.upside < -0.25 && V.agree >= 0.6) con.push(`mahal ${spct(V.upside, 0)}`); }
    if (F && (F.roe != null || F.revenueGrowth != null)) { max += 15; if (F.roe > 0.15) { s += 8; pro.push(`ROE ${pct(F.roe, 0)}`); } else if (F.roe > 0.1) s += 5; else if (F.roe != null && F.roe < 0) con.push("rugi (ROE negatif)");
      if (F.revenueGrowth > 0.1) { s += 4; pro.push(`pendapatan +${pct(F.revenueGrowth, 0)}`); } else if (F.revenueGrowth > 0) s += 2;
      const de = F.totalDebt != null && F.bookValuePerShare && F.shares ? F.totalDebt / (F.bookValuePerShare * F.shares) : NaN; if (isFinite(de)) { if (de < 1) s += 3; else if (de > 2.5) con.push(`utang ${nf(1).format(de)}× ekuitas`); } }
    if (G) { max += 40; s += G.turn * 14 + (G.near ? 6 : 0) + G.accum * 15 + (G.squeeze < 0.7 ? 5 : 0);
      if (G.near) pro.push(`turun ${pct(G.dd, 0)} dari puncak`); if (G.turn >= 0.7) pro.push(G.cross ? "golden cross MA20/50 baru" : "mulai berbalik naik"); if (G.accum >= 0.45) pro.push(G.obvD > 0.05 ? "akumulasi diam-diam (OBV naik)" : "aliran dana masuk"); if (G.squeeze < 0.7) pro.push("volatilitas menyempit");
      if (G.dd > 0.85 && G.turn < 0.7) { s -= 10; con.push("pisau jatuh (−85% dan belum berbalik)"); } }
    max += 20; let m = 0; if (ML && ML.valid && ML.p > ML.base) { m += Math.min(10, (ML.p - ML.base) * 200); pro.push(`ML ${pct(ML.p, 0)} teruji`); } if (C && C.aplus) { m += 6; pro.push("setup A+"); } else if (C && C.valid && C.s >= 3) m += 4;
    if (G && G.hist.valid) { m += 6; pro.push(`pola gem teruji (${pct(G.hist.up, 0)} naik ${G.F} hari)`); }
    if (D && !D.err) { if (D.valid && D.p > D.base + 0.03) { m += 5; pro.push(`ML penuh ${pct(D.p, 0)}`); } if (D.dl && D.dl.valid && D.dl.p > D.dl.base + 0.03) { m += 5; pro.push(`deep learning ${pct(D.dl.p, 0)}`); } if (D.valid && D.p < D.base - 0.05) con.push("ML penuh condong turun"); }
    s += Math.min(20, m);
    const idx = /\.JK$/.test(r.s), liqIdr = G ? G.liq * (idx ? 1 : pp.fx || 16000) : NaN, illiq = isFinite(liqIdr) && liqIdr < (idx ? 3e8 : 1e9);
    if (illiq) { s -= 15; con.push(`tidak likuid (±${big(liqIdr, "IDR")}/hari)`); } if (ML && !ML.valid) con.push("ML belum teruji");
    const sc = max ? Math.max(0, (s / max) * 100) : 0, tested = (ML && ML.valid && ML.p > ML.base) || (C && C.aplus) || (G && G.hist.valid) || (D && (D.valid || (D.dl && D.dl.valid)));
    const st = sc >= 55 && tested && !illiq ? "Kandidat kuat" : sc >= 40 && !illiq ? (tested ? "Pantau" : "Spekulatif") : sc >= 40 ? "Spekulatif" : "Lewati";
    return { gs: sc, st, pro, con, liqIdr, tested };
  }
  function idxRatioFor(s, px) { const p = /-USDT?$/.test(s) && ix.pairs ? idxPairFor(s) : null; return p && p.last && px > 0 ? { p, k: p.last / px } : null; }
  function planCell(r) { const P = r.plan; if (!P || !(P.entry > 0)) return "–"; const X = idxRatioFor(r.s, P.px), k = X ? X.k : 1, f = (v) => (X ? "Rp " : "") + fmtNum(v * k);
    return `<div class="pl-c"><span>Masuk ≤ <b>${f(P.entry)}</b></span><span>Stop <b class="neg">${f(P.stop)}</b></span><span>Jual <b class="pos">${f(P.t1)}</b> / <b class="pos">${f(P.t2)}</b></span><span class="note">RR 1:${nf(1).format(P.rr1)}${P.pT1 != null ? ` · T1 dulu ${pct(P.pT1, 0)}` : ""}${X ? " · Indodax" : ""}</span></div>`; }
  function gmThesis(r) { const p = r.pro.slice(0, 4), c = r.con.slice(0, 2); return (p.length ? p.join(", ") : "belum ada alasan kuat") + (c.length ? `. Risiko: ${c.join(", ")}` : "") + "."; }
  async function runGems() {
    if (gm.busy) return; gm.busy = true; $("gmRun").disabled = true; $("gmNote").hidden = false;
    const u = $("gmUni").value; let uni = GM_UNI[u];
    if (u === "wl") uni = $("wlQ").value.split(/[,\s]+/).map((s) => normTicker(s.trim())).filter(Boolean);
    if (u === "idxc") { await idxPairsLoad(); uni = (ix.pairs || []).filter((p) => p.base !== "usdt" && p.base !== "usdc" && !p.suspended && p.volIdr > 5e7).slice(0, 80).map((p) => p.base.toUpperCase() + "-USDT"); }
    if ($("gmIdxOnly").checked && u !== "idxs" && u !== "usm" && u !== "wl") { await idxPairsLoad(); uni = (uni || []).filter((s) => !/-USDT?$/.test(s) || idxPairFor(s)); }
    const syms = [...new Set(uni || [])].slice(0, 100), N = syms.length, deep = $("gmDeep").checked; let done = 0; if (!N) { $("gmStatus").textContent = "Tidak ada koin di daftar ini yang listing di Indodax."; gm.busy = false; $("gmRun").disabled = false; return; }
    const tick = (m) => { done++; $("gmBar").style.width = Math.round((100 * done) / (N + (deep ? 5 : 0))) + "%"; $("gmStatus").textContent = m; };
    gm.rows = []; $("gmStatus").textContent = `Menyaring ${N} aset…`; await ensureUsRf(); try { await idxPairsLoad(); } catch { /* */ } if (!pp.fx) { try { await ppQuotes([]); } catch { /* */ } }
    try {
      await pool(syms, 4, async (s) => {
        try { const d = await fetchSymbol(s, "5y"); if (!d.ohlc || d.ohlc.length < 300) throw new Error("data < 300 hari"); const crypto = /-USDT?$/.test(s) || /CRYPTO/i.test(d.type || "");
          const R = await compute("gem", { D: buildD(d), o: { ppy: crypto ? 365 : 252, H: 10, F: 40, isIdx: /\.JK$/.test(s) } }); let F = null, val = null;
          if (!crypto) { try { F = await (await apiFetch(`${API}?action=fundamentals&symbol=${encodeURIComponent(s)}`)).json(); val = valEnsemble(F, R.px, (d.currency || "") !== "IDR", null); } catch { /* */ } }
          const row = { s, name: d.name, ...R, F, val }; Object.assign(row, gmScore(row)); gm.rows.push(row); tick(`${s} ✓`); drawGems(); }
        catch (e) { gm.rows.push({ s, err: e.message, st: "Gagal", gs: -1, pro: [], con: [] }); tick(`${s} dilewati`); } });
      if (deep) { const top = gm.rows.filter((r) => !r.err && r.st !== "Lewati").sort((a, b) => b.gs - a.gs).slice(0, 5);
        for (const r of top) { $("gmStatus").textContent = `Uji mendalam ${r.s}: ML + deep learning…`;
          try { const d = await fetchSymbol(r.s, "10y"); const M = await compute("ml", { D: buildD(d), o: { horizon: 10 } }); r.deep = { valid: M.valid, p: M.p, base: M.base, auc: M.auc, dl: M.dl && !M.dl.error ? { valid: M.dl.valid, p: M.dl.p, base: M.dl.base, auc: M.dl.auc } : null }; Object.assign(r, gmScore(r)); }
          catch (e) { r.deep = { err: e.message }; } tick(`Uji mendalam ${r.s} ✓`); drawGems(); } }
      const k = gm.rows.filter((r) => r.st === "Kandidat kuat").length; $("gmStatus").textContent = `Selesai: ${N} aset · ${k} kandidat kuat · ${gm.rows.filter((r) => r.st === "Pantau").length} pantau`;
      try { localStorage.setItem("sp_gems_v1", JSON.stringify({ at: Date.now(), uni: u, rows: gm.rows.map((r) => ({ s: r.s, name: r.name, gs: r.gs, st: r.st, pro: r.pro, con: r.con, liqIdr: r.liqIdr, err: r.err, gem: r.gem ? { dd: r.gem.dd, turn: r.gem.turn, accum: r.gem.accum, hist: r.gem.hist, F: r.gem.F } : null, val: r.val ? { upside: r.val.upside, methods: r.val.methods.length } : null, ml: r.ml, deep: r.deep, ret3m: r.ret3m, plan: r.plan })) })); } catch { /* */ }
    } finally { gm.busy = false; $("gmRun").disabled = false; $("gmBar").style.width = "100%"; }
  }
  function drawGems() {
    const ord = { "Kandidat kuat": 0, Pantau: 1, Spekulatif: 2, Lewati: 3, Gagal: 4 }, R = gm.rows.slice().sort((a, b) => ord[a.st] - ord[b.st] || b.gs - a.gs), cnt = (k) => gm.rows.filter((r) => r.st === k).length;
    $("gmSum").innerHTML = ["Kandidat kuat", "Pantau", "Spekulatif", "Lewati"].map((k) => `<span class="rd-pill gm-${k.replace(" ", "")}">${k} <b>${cnt(k)}</b></span>`).join("");
    const bar = (v) => `<i class="gm-b"><i style="width:${Math.max(2, Math.min(100, v * 100)).toFixed(0)}%"></i></i>`;
    $("gmTable").innerHTML = `<thead><tr><th>#</th><th>Aset</th><th>Status</th><th>Gem</th><th>Turun dari puncak</th><th>Berbalik</th><th>Akumulasi</th><th>Nilai</th><th>Model</th><th>Rencana harga</th><th>Tesis RAM AI</th></tr></thead><tbody>` + R.filter((r) => r.st !== "Gagal").slice(0, 60).map((r, i) => {
      const G = r.gem || {}, F = r.deep && !r.deep.err ? r.deep : r.ml, dl = r.deep && r.deep.dl;
      return `<tr class="rd-row" data-s="${esc(r.s)}"><td>${i + 1}</td><td><b>${esc(r.s.replace(".JK", "").replace(/-USDT?$/, ""))}</b><div class="note">${esc(String(r.name || "").slice(0, 22))}</div></td><td><span class="rd-pill gm-${r.st.replace(" ", "")}">${r.st}</span></td><td class="num"><b>${nf(0).format(r.gs)}</b></td>
        <td class="num">${isFinite(G.dd) ? pct(G.dd, 0) : "–"}</td><td>${bar(G.turn || 0)}</td><td>${bar(G.accum || 0)}</td><td class="num">${r.val && r.val.methods && (r.val.methods.length || r.val.methods) ? `<span class="${r.val.upside > 0 ? "pos" : "neg"}">${spct(r.val.upside, 0)}</span>` : "–"}</td>
        <td class="num">${F ? `<span class="${F.valid ? (F.p > F.base ? "pos" : "neg") : "note"}">${pct(F.p, 0)}${F.valid ? "" : "·x"}</span>` : "–"}${dl ? ` <span class="note">DL</span> <span class="${dl.valid ? (dl.p > dl.base ? "pos" : "neg") : "note"}">${pct(dl.p, 0)}</span>` : ""}${G.hist && G.hist.valid ? ' <b class="pos" title="pola gem teruji di aset ini">◆</b>' : ""}</td>
        <td>${planCell(r)}${r.plan && r.plan.entry > 0 ? `<button class="fn-key" data-auto="${esc(r.s)}" title="${demoGate().pass && idxRatioFor(r.s, r.plan.px) && isOwner() ? "Indodax (uang asli)" : "akun demo"}">Order otomatis${demoGate().pass && idxRatioFor(r.s, r.plan.px) && isOwner() ? " · Indodax" : " · demo"}</button>` : ""}</td><td class="gm-th">${esc(gmThesis(r))}</td></tr>`; }).join("") + "</tbody>";
  }
  function bindGems() { $("gmRun").onclick = runGems; $("gmTable").addEventListener("click", (e) => { const ab = e.target.closest("[data-auto]"); if (ab) { const r = gm.rows.find((x) => x.s === ab.dataset.auto); if (r) autoArmFrom(r.s, r.plan); return; } const tr = e.target.closest(".rd-row"); if (tr) openDetail(tr.dataset.s); });
    try { const j = JSON.parse(localStorage.getItem("sp_gems_v1") || "null"); if (j && j.rows && Date.now() - j.at < 3 * 864e5) { gm.rows = j.rows; $("gmUni").value = j.uni || "idxs"; drawGems(); $("gmNote").hidden = false; $("gmStatus").textContent = `Hasil terakhir ${new Date(j.at).toLocaleString("id-ID")} · klik Cari gems untuk memperbarui`; } } catch { /* */ } }


  // =====================================================================
  // SYARAT INDODAX: buka beli otomatis / quick IN Indodax hanya setelah terbukti di demo
  // =====================================================================
  const GATE = { n: 20, wr: 0.8 };
  function demoGate() { const H = (pp.a && pp.a.hist) || [], done = H.filter((o) => o.side === "sell" && o.pl != null), n = done.length, w = done.filter((o) => o.pl > 0).length, pl = done.reduce((s, o) => s + o.pl, 0), wr = n ? w / n : 0;
    return { n, w, wr, pl, pass: n >= GATE.n && wr >= GATE.wr && pl > 0 }; }
  function gateText(g = demoGate()) { return g.pass ? `<span class="pos">Syarat terpenuhi</span>: ${g.n} transaksi demo, ${pct(g.wr, 0)} untung, total ${g.pl >= 0 ? "+" : "−"}Rp ${big(Math.abs(g.pl))}.`
    : `<b>Indodax otomatis terkunci.</b> Syarat: ≥ ${GATE.n} transaksi demo selesai, ≥ ${pct(GATE.wr, 0)} untung, dan total untung > 0. Sekarang: ${g.n} transaksi, ${pct(g.wr, 0)} untung, total ${g.pl >= 0 ? "+" : "−"}Rp ${big(Math.abs(g.pl))}.`; }
  // QUICK IN / OUT di Analisis: harga & jumlah dari rencana → eksekusi 2 klik (demo, atau Indodax untuk kripto yang listing)
  const qk = { mode: null, arm: null, t: null };
  function qkCtx() { const P = act.plan, d = state.data; if (!P || !d) return null; const crypto = isCrypto(), p = crypto && ix.pairs ? idxPairFor(d.symbol) : null, usd = state.res && state.res.s0 > 0 ? state.res.s0 : P.px;
    const k = p && p.last && usd ? p.last / usd : null, idxOk = !!(p && k && isOwner()), mode = qk.mode && (qk.mode !== "idx" || idxOk) ? qk.mode : "demo";
    return { P, d, p, k, idxOk, mode, pos: pp.a && pp.a.pos[d.symbol], unit: isIdx() ? 100 : 1, crypto, gate: demoGate() }; }
  function drawQuick() {
    const el = $("qkBox"); if (!el) return; const C = qkCtx(); if (!C) { el.innerHTML = ""; return; } const { P, mode, pos, k, p, gate } = C, idx = isIdx(), cur = mode === "idx" ? "Rp " : "", I = mode === "idx";
    const pxIn = I ? P.entry * k : P.entry, qIn = P.qty > 0 ? P.qty : 0, unitW = I ? p.base.toUpperCase() : idx ? "lot" : "unit";
    const held = I ? (ix.bal && ix.bal[p.base]) || 0 : pos ? (idx ? Math.floor(pos.units / 100) : pos.units) : 0, last = I ? p.last : state.res && state.res.s0;
    const valIn = I ? qIn * pxIn : qIn * pxIn * C.unit * actFx(), valOut = I ? held * (last || 0) : held * (last || 0) * C.unit * actFx(), lockIn = I && !gate.pass;
    const fq = (q) => (I ? String(+(+q).toFixed(8)) : idx ? nf(0).format(q) : nf(4).format(q));
    el.innerHTML = `<div class="qk"><div class="qk-mode"><a data-qm="demo" class="${!I ? "on" : ""}">Demo</a>${C.idxOk ? `<a data-qm="idx" class="${I ? "on" : ""}">Indodax (uang asli)${gate.pass ? "" : " 🔒"}</a>` : ""}</div>
      <button class="qk-in ${qk.arm === "in" ? "arm" : ""} ${P.action !== "BELI" ? "weak" : ""}" id="qkIn" ${qIn > 0 && !lockIn ? "" : "disabled"}>${qk.arm === "in" ? "KLIK LAGI: BELI" : "IN · BELI"}<small>${lockIn ? "terkunci: buktikan dulu di demo" : qIn > 0 ? `${fq(qIn)} ${unitW} @ ${cur}${fmtNum(pxIn)} (limit) · ±Rp ${big(valIn)}${P.action !== "BELI" ? ` · rencana: ${P.action}, tidak disarankan` : ""}` : "modal terlalu kecil"}</small></button>
      <button class="qk-out ${qk.arm === "out" ? "arm" : ""}" id="qkOut" ${held > 0 ? "" : "disabled"}>${qk.arm === "out" ? "KLIK LAGI: JUAL" : "OUT · JUAL"}<small>${held > 0 ? `${fq(held)} ${unitW} @ market ±${cur}${fmtNum(last)} · ±Rp ${big(valOut)}` : I ? "tidak ada saldo koin ini" : "belum punya posisi demo"}</small></button>
      <div class="qk-info">Stop <b class="neg">${cur}${fmtNum(I ? P.stop * k : P.stop)}</b> · T1 <b class="pos">${cur}${fmtNum(I ? P.t1 * k : P.t1)}</b> · T2 <b class="pos">${cur}${fmtNum(I ? P.t2 * k : P.t2)}</b>${!I ? " · stop & target otomatis ikut dipasang" : ""}</div>
      ${C.idxOk ? `<div class="qk-gate">${gateText(gate)}</div>` : ""}<div class="qk-info"><a href="#" id="qkAp">+ Pantau aset ini dengan Autopilot</a></div></div>`;
  }
  function qkArm(which) { if (qk.arm !== which) { qk.arm = which; clearTimeout(qk.t); qk.t = setTimeout(() => { qk.arm = null; drawQuick(); }, 4000); drawQuick(); return false; } qk.arm = null; clearTimeout(qk.t); return true; }
  async function qkGo(which) {
    const C = qkCtx(); if (!C || !qkArm(which)) return; const { P, mode, p, k, d } = C;
    try {
      if (mode === "idx") { const pd = Math.min(8, decOf(p.last)), vp = isFinite(p.volPrec) ? p.volPrec : 8;
        if (which === "in") { if (!C.gate.pass) throw new Error("Indodax terkunci sampai syarat demo terpenuhi"); const px = floorTo(P.entry * k, pd), q = floorTo(P.qty, vp);
          const j = await idxCall("createOrder", { symbol: p.base + "idr", side: "BUY", type: "LIMIT", price: String(px), quantity: String(q) }, `buy ${p.pair}`); toast(`Indodax: beli ${q} ${p.base.toUpperCase()} @ ${fmtNum(px)} dipasang (#${j.orderId || ""})`);
          ix.log.unshift({ t: new Date().toISOString(), side: "buy", pair: p.pair, type: "limit", price: px, amt: q, value: px * q, id: j.orderId || "", ok: true }); }
        else { const q = floorTo((ix.bal && ix.bal[p.base]) || 0, vp); if (!(q > 0)) throw new Error("saldo koin kosong");
          const j = await idxCall("createOrder", { symbol: p.base + "idr", side: "SELL", type: "MARKET", quantity: String(q) }, `sell ${p.pair}`); toast(`Indodax: jual ${q} ${p.base.toUpperCase()} market terkirim (#${j.orderId || ""})`);
          ix.log.unshift({ t: new Date().toISOString(), side: "sell", pair: p.pair, type: "market", price: 0, amt: q, value: q * p.last, id: j.orderId || "", ok: true }); }
        saveSettings({ idxLog: ix.log.slice(0, 100) }); setTimeout(() => idxBalance().then(drawQuick), 1500); }
      else { openTrade(d.symbol, which === "in" ? "buy" : "sell"); await new Promise((r) => setTimeout(r, 300)); await ppQuotes([d.symbol]);
        if (which === "in") { $("dType").value = "limit"; $("dLimit").value = P.entry; $("dQty").value = P.qty; $("dStop").value = P.stop; $("dT1").value = P.t1; $("dT2").value = P.t2; }
        else { const pos = pp.a.pos[d.symbol]; $("dType").value = "market"; $("dQty").value = isIdx() ? Math.floor(pos.units / 100) : pos.units; ["dStop", "dT1", "dT2"].forEach((id) => ($(id).value = "")); }
        ppPreview(); await ppSend(); toast($("dStatus").textContent || "Order demo dikirim."); }
    } catch (e) { toast("Gagal: " + e.message); }
    drawQuick(); }
  // =====================================================================
  // ORDER OTOMATIS INDODAX (bracket) — hanya pemilik; dipersenjatai sekali dengan konfirmasi ketik
  // =====================================================================
  const au = { list: [], busy: false };
  const AU_MAX = 3, auActive = () => au.list.filter((x) => x.st === "menunggu" || x.st === "terisi");
  const auSave = () => saveSettings({ idxAuto: au.list.slice(0, 30) });
  const decOf = (v) => { const s = String(v); if (s.includes("e-")) return +s.split("e-")[1]; return (s.split(".")[1] || "").length; };
  const floorTo = (v, d) => { const k = 10 ** Math.max(0, Math.min(10, d)); return Math.floor(v * k + 1e-9) / k; };
  const roundTo = (v, d) => { const k = 10 ** Math.max(0, Math.min(10, d)); return Math.round(v * k) / k; };
  const auLog = (x, m) => { x.log = [`${new Date().toLocaleString("id-ID")} · ${m}`, ...(x.log || [])].slice(0, 30); };
  async function autoDemo(sym, plan) { // versi demo: beli limit + stop + target otomatis di akun demo (harga dalam mata uang aset)
    openTrade(sym, "buy"); await new Promise((r) => setTimeout(r, 350)); await ppQuotes([sym]); const cap = Math.max(0, parseFloat($("actCap").value) || 1e7) / ((/\.JK$/.test(sym) ? 1 : pp.fx || 16000));
    const R = plan.entry - plan.stop, risk = cap * (parseFloat($("actRisk").value) || 0.01), unit = /\.JK$/.test(sym) ? 100 : 1; let q = R > 0 ? risk / R / unit : 0; q = Math.min(q, cap / (plan.entry * unit)); q = unit === 100 ? Math.floor(q) : +q.toFixed(6);
    $("dType").value = "limit"; $("dLimit").value = plan.entry; $("dQty").value = q; $("dStop").value = plan.stop; $("dT1").value = plan.t1; $("dT2").value = plan.t2; ppPreview(); await ppSend(); toast("Demo: " + ($("dStatus").textContent || "order dipasang")); }
  async function autoArmFrom(sym, plan) {
    try { await idxPairsLoad(); } catch { /* */ }
    if (!isOwner() || !demoGate().pass || !/-USDT?$/.test(sym) || !idxPairFor(sym)) { if (isOwner() && /-USDT?$/.test(sym) && !demoGate().pass) toast("Indodax otomatis masih terkunci (syarat demo belum terpenuhi). Dipasang di akun demo."); return autoDemo(sym, plan); }
    await idxPairsLoad(); const p = idxPairFor(sym); if (!p || !plan || !(plan.px > 0)) { toast("Koin ini tidak listing di Indodax / rencana belum ada."); return; }
    if (!ix.cfg) { try { ix.cfg = await idxCall("status"); } catch { /* */ } } if (!ix.cfg || !ix.cfg.configured || ix.cfg.ok === false) { toast("Indodax belum tersambung (cek tab Setup)."); return; }
    if (ix.cfg.canTrade === false) { toast("API key tidak punya izin trade."); return; }
    if (auActive().length >= AU_MAX) { toast(`Maksimal ${AU_MAX} rencana otomatis aktif.`); return; }
    const k = p.last / plan.px, bk = await (await apiFetch(`${API_IDX}?action=book&pair=${encodeURIComponent(p.pair)}`)).json().catch(() => ({}));
    const pd = Math.min(8, Math.max(decOf(p.last), ...((bk.bids || []).slice(0, 5).map((x) => decOf(x[0]))), ...((bk.asks || []).slice(0, 5).map((x) => decOf(x[0]))))), vp = isFinite(p.volPrec) ? p.volPrec : 8;
    const L = { entry: floorTo(plan.entry * k, pd), stop: roundTo(plan.stop * k, pd), t1: roundTo(plan.t1 * k, pd), t2: roundTo(plan.t2 * k, pd) }, max = ix.cfg.maxIdr || 2e6, def = Math.min(max, 200000), B = p.base.toUpperCase();
    if (!(L.stop < L.entry && L.entry < L.t1 && L.t1 <= L.t2)) { toast("Level harga tidak valid untuk otomatis."); return; }
    openFn(`ORDER OTOMATIS <span class='note'>· ${esc(B)}/IDR · uang asli</span>`, `<div class="au-arm">
      <div class="kpis compact">${[["Harga sekarang", "Rp " + fmtNum(p.last)], ["Beli limit di", "Rp " + fmtNum(L.entry)], ["Stop (dipantau)", `<span class="neg">Rp ${fmtNum(L.stop)}</span>`], ["Jual ½ di T1", `<span class="pos">Rp ${fmtNum(L.t1)}</span>`], ["Jual sisa di T2", `<span class="pos">Rp ${fmtNum(L.t2)}</span>`]].map(([a, b]) => `<div class="kpi"><div class="k">${a}</div><div class="v">${b}</div></div>`).join("")}</div>
      <label class="lbl" for="auAmt">Nilai beli (Rp, maks ${nf(0).format(max)})</label><input id="auAmt" type="number" min="10000" max="${max}" step="10000" value="${def}">
      <div id="auPrev" class="verdict"></div>
      <label class="lbl" for="auWord">Ketik <code>OTOMATIS ${esc(B)}</code> untuk mempersenjatai</label><input id="auWord" autocomplete="off">
      <button class="run" id="auGo" style="background:var(--bad)">Pasang order otomatis</button>
      <p class="note">Order beli limit langsung dikirim ke Indodax. Jual target dipasang otomatis setelah beli terisi. Stop hanya dijalankan selama web terbuka.</p></div>`);
    const prev = () => { const v = Math.min(max, Math.max(0, parseFloat($("auAmt").value) || 0)), q = floorTo(v / L.entry, vp), loss = q * (L.entry - L.stop), gain = q * (L.t1 - L.entry) / 2 + q * (L.t2 - L.entry) / 2;
      $("auPrev").innerHTML = `Jumlah ±<b>${nf(Math.min(8, vp)).format(q)} ${esc(B)}</b> · rugi bila stop ±<b class="neg">Rp ${nf(0).format(loss)}</b> · untung bila kedua target ±<b class="pos">Rp ${nf(0).format(gain)}</b> · RR 1:${nf(1).format(gain / (loss || 1))}${p.minIdr && v < p.minIdr ? ' · <span class="neg">di bawah minimal Indodax</span>' : ""}`; return { v, q }; };
    $("auAmt").oninput = prev; prev();
    $("auGo").onclick = async () => { if ($("auWord").value.trim().toUpperCase() !== `OTOMATIS ${B}`) { toast("Teks konfirmasi tidak cocok."); return; } const { v, q } = prev(); if (!(q > 0) || v < 10000) { toast("Jumlah terlalu kecil."); return; }
      $("auGo").disabled = true; const x = { id: Date.now().toString(36), sym, base: p.base, symbol: p.base + "idr", pair: p.pair, ...L, qty: q, vp, pd, st: "menunggu", created: Date.now(), expire: Date.now() + 3 * 864e5, sells: [], log: [] };
      try { const j = await idxCall("createOrder", { symbol: x.symbol, side: "BUY", type: "LIMIT", price: String(L.entry), quantity: String(q) }, `buy ${p.pair}`); x.buyId = String(j.orderId || ""); auLog(x, `beli limit ${q} @ ${fmtNum(L.entry)} terkirim (#${x.buyId})`);
        au.list.unshift(x); auSave(); closeFn(); toast(`Order otomatis ${B} aktif.`); setView("trade"); setTradeTab("idx"); setXTab("auto"); }
      catch (e) { toast("Gagal: " + e.message); $("auGo").disabled = false; } };
  }
  const isDone = (o) => /^FILLED$/i.test(String(o && o.status)), isDead = (o) => /CANCEL|REJECT|EXPIRE/i.test(String(o && o.status));
  async function auLoop() {
    if (au.busy || !isOwner() || !auActive().length) return; au.busy = true; let ch = false;
    try { for (const x of auActive()) {
      try { const bk = await (await apiFetch(`${API_IDX}?action=book&pair=${encodeURIComponent(x.pair)}`)).json(); const last = bk.trades && bk.trades[0] ? bk.trades[0].px : bk.bids && bk.bids[0] ? bk.bids[0][0] : NaN; x.last = last;
        if (x.st === "menunggu") { const o = await idxCall("getOrder", { symbol: x.symbol, orderId: x.buyId });
          if (isDone(o)) { const q = floorTo(+o.executedQty || x.qty, x.vp); x.filled = q; x.st = "terisi"; auLog(x, `beli terisi ${q}`); ch = true;
            const q1 = floorTo(q / 2, x.vp), q2 = floorTo(q - q1, x.vp), plan = q1 > 0 && q1 * x.t1 >= 10000 && q2 * x.t2 >= 10000 ? [[x.t1, q1, "T1"], [x.t2, q2, "T2"]] : [[x.t1, q, "T1"]];
            for (const [px, qq, nm] of plan) { try { const j = await idxCall("createOrder", { symbol: x.symbol, side: "SELL", type: "LIMIT", price: String(px), quantity: String(qq) }, `sell ${x.pair}`); x.sells.push({ id: String(j.orderId || ""), px, q: qq, nm }); auLog(x, `jual ${nm} ${qq} @ ${fmtNum(px)} dipasang`); }
              catch (e) { auLog(x, `gagal pasang jual ${nm}: ${e.message}`); } } }
          else if (isDead(o)) { x.st = "batal"; auLog(x, "order beli dibatalkan/ditolak di Indodax"); ch = true; }
          else if (Date.now() > x.expire) { try { await idxCall("cancelOrder", { symbol: x.symbol, orderId: x.buyId }); } catch { /* */ } x.st = "kedaluwarsa"; auLog(x, "beli tidak terisi 3 hari → dibatalkan"); ch = true; } }
        else if (x.st === "terisi") { let soldQ = 0, allDone = x.sells.length > 0;
          for (const s of x.sells) { if (s.done) { soldQ += s.q; continue; } const o = await idxCall("getOrder", { symbol: x.symbol, orderId: s.id }).catch(() => null);
            if (isDone(o)) { s.done = true; s.at = Date.now(); soldQ += s.q; auLog(x, `${s.nm} terisi @ ${fmtNum(s.px)}`); ch = true; if (s.nm === "T1" && !x.be) { x.be = true; x.stop = x.entry; auLog(x, "stop naik ke harga masuk (impas)"); } }
            else { allDone = false; if (isDead(o)) s.dead = true; } }
          if (allDone) { x.st = "selesai"; auLog(x, "semua target terisi"); ch = true; }
          else if (isFinite(last) && last <= x.stop) { for (const s of x.sells) if (!s.done && !s.dead) { try { await idxCall("cancelOrder", { symbol: x.symbol, orderId: s.id }); } catch { /* */ } }
            const rem = floorTo((x.filled || x.qty) - soldQ, x.vp); if (rem > 0) { try { await idxCall("createOrder", { symbol: x.symbol, side: "SELL", type: "MARKET", quantity: String(rem) }, `sell ${x.pair}`); auLog(x, `STOP: harga ${fmtNum(last)} ≤ ${fmtNum(x.stop)} → jual market ${rem}`); } catch (e) { auLog(x, `STOP gagal jual market: ${e.message}`); continue; } }
            x.st = "stop"; ch = true; toast(`Order otomatis ${x.base.toUpperCase()}: stop dijalankan.`); } } }
      catch (e) { auLog(x, `cek gagal: ${e.message}`); } }
    } finally { au.busy = false; if (ch) auSave(); if (ix.tab === "auto") drawAuto(); }
  }
  async function auCancel(x) { const ids = [x.st === "menunggu" ? x.buyId : null, ...(x.sells || []).filter((s) => !s.done).map((s) => s.id)].filter(Boolean);
    for (const id of ids) { try { await idxCall("cancelOrder", { symbol: x.symbol, orderId: id }); } catch { /* */ } } x.st = "batal"; auLog(x, "dibatalkan manual (order terbuka dibatalkan; koin yang sudah dibeli tetap di saldo)"); auSave(); drawAuto(); }
  function drawAuto() { if (ap.cfg && !$("apPane").hidden) drawApOrdersX(); const el = $("auTable"); if (!el) return; const L = au.list; const gt = $("auGate"); if (gt) gt.innerHTML = gateText();
    el.innerHTML = L.length ? `<thead><tr><th>Koin</th><th>Status</th><th>Masuk</th><th>Stop</th><th>T1 / T2</th><th>Jumlah</th><th>Harga kini</th><th>Catatan terakhir</th><th></th></tr></thead><tbody>` + L.map((x) => `<tr><td><b>${esc(x.base.toUpperCase())}</b></td><td><span class="rd-pill au-${x.st}">${x.st}</span></td><td>${fmtNum(x.entry)}</td><td class="neg">${fmtNum(x.stop)}${x.be ? " (impas)" : ""}</td><td class="pos">${fmtNum(x.t1)} / ${fmtNum(x.t2)}</td><td>${nf(Math.min(8, x.vp || 8)).format(x.filled || x.qty)}</td><td>${x.last ? fmtNum(x.last) : "–"}</td>
      <td class="note" title="${esc((x.log || []).join("\n"))}">${esc((x.log || [])[0] || "")}</td><td>${x.st === "menunggu" || x.st === "terisi" ? `<button class="x-btn" data-aucancel="${esc(x.id)}">Batalkan</button>` : ""}</td></tr>`).join("") + "</tbody>"
      : '<tbody><tr><td class="note">Belum ada order otomatis. Pasang dari tab Live Indodax di Analisis, atau tombol "Order otomatis" di Hidden gems.</td></tr></tbody>'; }
  function bindAuto() { au.list = ((typeof settings !== "undefined" && settings && settings.idxAuto) || []).slice(0, 30);
    $("auKill").onclick = async () => { if (!auActive().length) return; for (const x of auActive()) await auCancel(x); toast("Semua order otomatis dimatikan."); };
    $("auTable").addEventListener("click", (e) => { const b = e.target.closest("[data-aucancel]"); if (b) { const x = au.list.find((y) => y.id === b.dataset.aucancel); if (x) auCancel(x); } });
    setInterval(() => { if (!document.hidden) auLoop(); }, 15000); setTimeout(auLoop, 4000); }

  // =====================================================================
  // AUTOPILOT: bid & offer otomatis dari ML + deep learning + RAM AI (centang mana yang wajib sepakat)
  // =====================================================================
  const ap = { cfg: null, st: {}, log: [], busy: false, timer: null, ext: {} };
  const AP_DEF = { on: false, ml: true, dl: true, ai: true, target: "demo", thr: 0.75, mode: "asset", budget: 1e9, run: null, health: true, brains: 0, style: "swing", dayBias: false, fut: false, lev: 2, tgOn: false, tgAmt: 5e7, tgAgg: 0.03, tgSafe: 0.005, tgBrake: 0.25, scope: "list", news: true, exp: true, autoPick: false, pickAt: 0, pickSrc: "all", maxW: 0.35, maxPos: 5, maxDay: 50, val: 100000, every: 30, list: "", cool: {}, day: "", nDay: 0 };
  function apLoad() { ap.cfg = { ...AP_DEF, ...((settings && settings.autopilot) || {}) }; ap.cfg.thr = Math.max(0.75, +ap.cfg.thr || 0.75); ap.log = ((settings && settings.apLog) || []).slice(0, 200);
    const c = ap.cfg; $("apOn").checked = c.on; $("apUseML").checked = c.ml; $("apUseDL").checked = c.dl; $("apUseAI").checked = c.ai; $("apTarget").value = c.target; $("apThr").value = String(c.thr); $("apMaxPos").value = String(c.maxPos); $("apMaxDay").value = String(c.maxDay); $("apVal").value = c.val; $("apEvery").value = String(c.every); $("apList").value = c.list; $("apMode").value = c.mode; $("apHealth").checked = c.health !== false; $("apBrains").value = String(c.brains || 0); apSetBrains(c.brains); $("apStyle").value = c.style || "swing"; $("apDayBias").checked = !!c.dayBias; $("apFut1").checked = !!c.fut; $("apLev").value = String(c.lev || 2); $("tgOn").checked = !!c.tgOn; $("tgAmt").value = c.tgAmt; $("tgAgg").value = String(c.tgAgg); $("tgSafe").value = String(c.tgSafe); $("tgBrake").value = String(c.tgBrake); $("apScope").value = c.scope || "list"; $("apUseNews").checked = c.news !== false; $("apUseExp").checked = c.exp !== false; $("apAutoPick").checked = !!c.autoPick; $("apPickSrc").value = c.pickSrc || "all"; $("apBudget").value = c.budget; $("apMaxW").value = String(c.maxW); }
  function apRead() { const c = ap.cfg; c.on = $("apOn").checked; c.ml = $("apUseML").checked; c.dl = $("apUseDL").checked; c.ai = $("apUseAI").checked; c.target = $("apTarget").value; c.thr = +$("apThr").value; c.maxPos = +$("apMaxPos").value; c.maxDay = Math.min(50, +$("apMaxDay").value || 50); c.val = Math.max(10000, +$("apVal").value || 100000); c.every = +$("apEvery").value; c.list = $("apList").value; c.mode = $("apMode").value; c.health = $("apHealth").checked; c.brains = +$("apBrains").value || 0; apSetBrains(c.brains); c.style = $("apStyle").value; c.dayBias = $("apDayBias").checked; if (c.style !== "swing") c.mode = "asset"; c.fut = $("apFut1").checked; c.lev = Math.min(5, +$("apLev").value || 2); c.tgOn = $("tgOn").checked; c.tgAmt = Math.max(1e6, +$("tgAmt").value || 5e7); c.tgAgg = Math.min(0.05, +$("tgAgg").value); c.tgSafe = +$("tgSafe").value; c.tgBrake = +$("tgBrake").value; if (c.tgOn) c.mode = "asset"; c.scope = $("apScope").value; c.news = $("apUseNews").checked; c.exp = $("apUseExp").checked; c.autoPick = $("apAutoPick").checked; c.pickSrc = $("apPickSrc").value; c.budget = Math.min(AP_CAP, Math.max(1e6, +$("apBudget").value || AP_CAP)); c.maxW = +$("apMaxW").value; c.thr = Math.max(AP_MIN, c.thr); }
  const fmtIdr = (v) => "Rp " + (Math.abs(v) >= 1e9 ? nf(2).format(v / 1e9) + " M" : Math.abs(v) >= 1e6 ? nf(1).format(v / 1e6) + " jt" : nf(0).format(v));
  const AP_CAP = 1e9, AP_FAIL = 0.5; // dana uji per run & batas gagal
  const AP_MIN = 0.75; // keyakinan di bawah 75% tidak pernah dieksekusi
  const apSave = () => saveSettings({ autopilot: ap.cfg, apLog: ap.log.slice(0, 200) });
  const apSyms = () => (ap.cfg.scope === "all" && ap.cfg.target === "demo" ? apAll() : apList());
  const apList = () => [...new Set(ap.cfg.list.split(/[,\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean))].slice(0, 8); // simbol sudah lengkap (dari klik/saran)
  function apLogAdd(sym, msg, kind = "") { ap.log.unshift({ t: new Date().toISOString(), s: sym, m: msg, k: kind }); ap.log.length = Math.min(ap.log.length, 200); }
  const idxOpen = () => { const n = new Date(Date.now() + 7 * 3600e3), d = n.getUTCDay(), m = n.getUTCHours() * 60 + n.getUTCMinutes(), day = n.toISOString().slice(0, 10); return d >= 1 && d <= 5 && !MCEngine.isHoliday(day, "IDX") && m >= 9 * 60 + 5 && m <= 15 * 60 + 45; };
  // keputusan tanpa membuka halaman analisis: 50 strategi + ML/DL + konfluensi/A+ + rencana harga + aturan RAM AI
  // otak kedua & ketiga: worker terpisah khusus autopilot, supaya beberapa aset dianalisis bersamaan (paralel di inti CPU lain)
  const CORES = navigator.hardwareConcurrency || 4, AP_AUTO = Math.max(1, Math.min(5, CORES - 1)); let apPool = null, AP_PAR = AP_AUTO;
  function apSetBrains(n) { const want = Math.max(1, Math.min(5, n || AP_AUTO)); if (apPool && apPool.length !== want) { apPool.forEach((w) => w && w.terminate()); apPool = null; } AP_PAR = want; }
  const apWorker = (slot) => { if (!apPool) apPool = Array.from({ length: AP_PAR }, () => mkWorker()); return apPool[slot % AP_PAR] || null; };
  async function apDecide(sym, slot = 0) { const t0 = performance.now(), W = apWorker(slot);
    const d = await fetchSymbol(sym, "5y"); if (!d.ohlc || d.ohlc.length < 300) throw new Error("data < 300 hari");
    const D = buildD(d), R = rawD(d), crypto = /CRYPTO/i.test(d.type || "") || /-USDT?$/.test(sym), idx = /\.JK$/.test(sym), so = stratOpts();
    const all = await compute("stratAll", { D, o: { ...so, short: false } }, undefined, W);
    let DM = D; try { const dl = await fetchSymbol(sym, "10y"); const D2 = buildD(dl); if (D2.n > D.n + 100) DM = D2; } catch { /* */ }
    if (DM.n > 2600) { const k = DM.n - 2600; DM = { d: DM.d.slice(k), o: DM.o.slice(k), h: DM.h.slice(k), l: DM.l.slice(k), c: DM.c.slice(k), v: DM.v.slice(k), n: 2600 }; }
    const ek = idx ? "idx" : crypto ? "c" : "us"; if (!ap.ext[ek]) ap.ext[ek] = await mlExt(sym).catch(() => []);
    const mk = `${sym}|${DM.d[DM.n - 1]}`, mc = (ap.mlc || (ap.mlc = new Map())).get(mk); let M = null; // model ML/DL dilatih sekali per aset per hari bar; dalam hari yang sama dipakai ulang
    const news = await newsHist(sym).catch(() => ({ map: null }));
    if (mc) M = mc; else { try { M = await compute("ml", { D: DM, o: { horizon: 5, costBps: so.costBps, ext: ap.ext[ek], news: news.map } }, undefined, W); if (M && !M.error) { ap.mlc.set(mk, M); if (ap.mlc.size > 60) ap.mlc.delete(ap.mlc.keys().next().value); } } catch (e) { M = { error: e.message }; } }
    const C = MCEngine.confluence(D, { H: 10, costBps: so.costBps, ppy: crypto ? 365 : 252 }), fx = (d.currency || "") === "IDR" ? 1 : pp.fx || 16000;
    const cap = ap.cfg.target === "demo" ? apRun().free : Math.max(0, parseFloat($("actCap").value) || 1e7), risk = ap.cfg.tgOn && ap.cfg.target === "demo" ? apPhase().risk : parseFloat($("actRisk").value) || 0.01;
    const SG = MCEngine.signalBacktest(d.dates, d.values, { ppy: crypto ? 365 : 252 }), sgScore = SG && SG.now ? SG.now.score : 0;
    const P = MCEngine.actionPlan(R, { isIdx: idx, crypto, strats: all.list, votes: all.votes, score: sgScore, capital: cap / fx, riskPct: risk, unit: idx ? 100 : 1, costBps: so.costBps, market: idx ? "IDX" : crypto ? null : "US", ml: M && !M.error ? M : null, sel: C && C.sel }); if (M && M.error) M = null;
    // Valuasi (saham saja, sekali per hari): penyaring "jauh terlalu mahal"
    let val = null; const eqty = !crypto && !/^\^/.test(sym) && !/=/.test(sym), vk = `${sym}|${new Date().toISOString().slice(0, 10)}`;
    if (eqty) { const vc = (ap.valc || (ap.valc = new Map())).get(vk); if (vc !== undefined) val = vc; else { try { const F = await (await apiFetch(`${API}?action=fundamentals&symbol=${encodeURIComponent(sym)}`)).json(); const V = valEnsemble(F, d.values[d.values.length - 1], (d.currency || "") !== "IDR", null);
          val = V && V.methods && V.methods.length ? { up: V.upside, n: V.methods.length, agree: V.agree, bad: !(V.upside <= 3 && V.upside >= -0.95) } : null; } catch { val = null; } ap.valc.set(vk, val); } }
    // Monte Carlo (bootstrap 2.000 jalur) & binomial: peluang kena target 1 sebelum stop dalam 20 bar
    let mcP = null, bnP = null; if (P.entry > 0 && P.stop > 0 && P.t1 > P.entry) { const px0 = P.entry, c0 = d.values, lr = []; for (let i = Math.max(1, c0.length - 504); i < c0.length; i++) lr.push(Math.log(c0[i] / c0[i - 1]));
      if (lr.length > 100) { const m0 = lr.reduce((s, x) => s + x, 0) / lr.length, L2 = lr.map((x) => x - m0 * 0.5); let hit = 0, stp = 0, seed = 11; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
        for (let k = 0; k < 2000; k++) { let v = px0; for (let t = 0; t < 20; t++) { v *= Math.exp(L2[Math.floor(rnd() * L2.length)]); if (v >= P.t1) { hit++; break; } if (v <= P.stop) { stp++; break; } } }
        const p = hit / 2000, q = stp / 2000, cst = (so.costBps * 2) / 1e4 * px0; mcP = { p, q, ev: (p * (P.t1 - px0) - q * (px0 - P.stop) - cst) / px0 };
        const ppy = crypto ? 365 : 252, sig = Math.sqrt(lr.reduce((s, x) => s + (x - m0) ** 2, 0) / lr.length) * Math.sqrt(ppy), mu = Math.max(-0.3, Math.min(0.3, 0.5 * m0 * ppy));
        const B = MCEngine.binomialBarrier(px0, P.t1, P.stop, sig, mu, 20, ppy); bnP = { p: B.pUp, q: B.pDn, ev: (B.pUp * (P.t1 - px0) - B.pDn * (px0 - P.stop) - cst) / px0 }; } }
    // RAM AI (aturan ringkas, sama dengan kotak 3 kecerdasan tanpa berita/valuasi)
    let sc = 0; const why = []; if (P.nRobust) { const w = P.voteAction === "BELI" ? 2 : P.voteAction === "JUAL" ? -2 : 0; sc += w; if (w) why.push(`strategi ${P.voteAction}`); }
    if (C) { if (C.sel && C.sel.active) { sc += 3; why.push("A+"); } else if (C.valid) sc += C.sNow >= 3 ? 1.5 : C.sNow <= -3 ? -1.5 : 0; else sc += C.sNow >= 4 ? 0.5 : C.sNow <= -4 ? -0.5 : 0; }
    const T = MCEngine.mtfDaily(D); if (T.week.dir > 0 && T.day.dir > 0) sc += 1; if (T.week.dir < 0 && T.day.dir < 0) sc -= 1;
    if (P.pr) { if (P.pr.expR > 0.15) sc += 1; else if (P.pr.expR <= 0) sc -= 2; }
    const thr = Math.max(AP_MIN, ap.cfg.thr), dir = (m) => (!m || !isFinite(m.p) || !m.valid ? 0 : m.p >= thr ? 1 : m.p <= 1 - thr ? -1 : 0), DLm = M && M.dl && !M.dl.error ? M.dl : null;
    const N = await apNews(sym, d); if (N && N.shock && !ap.cfg.news) N.shockOff = true; if (N && N.shock && ap.cfg.news) { sc -= 3; why.push("berita kejutan"); }
    const aic = [P.nRobust ? (P.voteAction === "BELI" ? 1 : P.voteAction === "JUAL" ? -1 : 0) : 0, C && C.sel && C.sel.active ? 1 : 0, C ? (C.valid ? (C.sNow >= 3 ? 1 : C.sNow <= -3 ? -1 : 0) : C.sNow >= 4 ? 0.33 : C.sNow <= -4 ? -0.33 : 0) : 0,
      T.week.dir > 0 && T.day.dir > 0 ? 1 : T.week.dir < 0 && T.day.dir < 0 ? -1 : 0, P.pr ? (P.pr.expR > 0.15 ? 1 : P.pr.expR <= 0 ? -1 : 0) : 0, N && N.shock ? 1 : 0];
    const AIL = aiTrain(), aiP = AIL.valid ? AIL.p(aic) : NaN, aiDir = AIL.valid ? (aiP >= 0.6 ? 1 : aiP <= 0.4 ? -1 : 0) : sc >= 2 ? 1 : sc <= -2 ? -1 : 0;
    const atr = (() => { const o = d.ohlc || [], n = o.length; if (n < 20) return NaN; let s = 0; for (let i = n - 14; i < n; i++) s += Math.max(o[i][2] - o[i][3], Math.abs(o[i][2] - o[i - 1][4]), Math.abs(o[i][3] - o[i - 1][4])); return s / 14; })();
    const RB = rightBrain(d.values, P, crypto);
    if (RB && RB.size < 1 && P.qty > 0) P.qty = idx ? Math.floor((P.qty * RB.size)) : +(P.qty * RB.size).toFixed(6); // otak kanan hanya boleh MENGECILKAN posisi, tidak pernah membesarkan
    const X0 = { T, cs: C ? C.sNow : 0, val, mcP, bnP, sgScore, RB, atr, px: d.values[d.values.length - 1] };
    return { sym, d, P, M, C, N, ...X0, ms: performance.now() - t0, cached: !!mc, ml: dir(M), dl: dir(DLm), ai: aiDir, aic, aiP, aiLearned: AIL.valid, aiScore: sc, mlP: M ? M.p : NaN, dlP: DLm ? DLm.p : NaN, mlV: !!(M && M.valid), dlV: !!(DLm && DLm.valid), at: Date.now(), crypto, idx, fx };
  }
  function apVerdict(X) { const c = ap.cfg, use = [["ML", c.ml, X.ml], ["DL", c.dl, X.dl], ["AI", c.ai, X.ai]].filter((u) => u[1]);
    if (c.news && X.N && X.N.shock) return { act: "JUAL", why: `berita kejutan "${X.N.shock.word}"` };
    if (!use.length) return { act: "–", why: "tidak ada kecerdasan dicentang" };
    const allUp = use.every((u) => u[2] > 0), allDn = use.every((u) => u[2] < 0), P = X.P;
    const E = c.exp ? apExpPredict(X) : null; X.exp = E;
    const okBuy = allUp && P.action === "BELI" && isFinite(P.confPct) && P.confPct >= c.thr && P.pr && P.pr.expR > 0;
    if (okBuy && X.val && !X.val.bad && X.val.n >= 2 && X.val.agree >= 0.6 && X.val.up < -0.3) return { act: "TUNGGU", why: `semua sepakat, tapi saham jauh terlalu mahal (nilai wajar ${spct(X.val.up, 0)})` };
    if (okBuy && X.RB && X.RB.veto) return { act: "TUNGGU", why: `otak kanan: ${X.RB.veto}` };
    const BR = c.exp ? brainPredict(X) : null; X.brain = BR;
    if (okBuy && BR && BR.valid && BR.p < 0.55) return { act: "TUNGGU", why: `otak gabungan hanya ${pct(BR.p, 0)} pada pola seperti ini` };
    if (okBuy && X.mcP && X.bnP && X.mcP.ev < 0 && X.bnP.ev < 0) return { act: "TUNGGU", why: `semua sepakat, tapi Monte Carlo (${pct(X.mcP.p, 0)}) & binomial (${pct(X.bnP.p, 0)}) peluang target-dulu di bawah impas setelah biaya` };
    if (allUp && P.action === "BELI" && isFinite(P.confPct) && P.confPct >= c.thr && P.pr && P.pr.expR > 0 && E && E.valid && E.p < 0.55) return { act: "TUNGGU", why: `semua sepakat, tapi pengalaman demo hanya ${pct(E.p, 0)} untung pada pola seperti ini` };
    if (allUp && P.action === "BELI" && isFinite(P.confPct) && P.confPct >= c.thr && P.pr && P.pr.expR > 0) return { act: "BELI", why: `${use.map((u) => u[0]).join("+")} sepakat naik · keyakinan ${pct(P.confPct, 0)}` };
    if (c.fut && X.crypto && allDn && P.action === "JUAL" && use.some((u) => u[0] !== "AI")) return { act: "SHORT", why: `${use.map((u) => u[0]).join("+")} sepakat turun (peluang naik ≤ ${pct(1 - Math.max(AP_MIN, c.thr), 0)}) · rencana JUAL` };
    if (allDn || P.action === "JUAL") return { act: "JUAL", why: allDn ? `${use.map((u) => u[0]).join("+")} sepakat turun` : "rencana berubah JUAL" };
    const miss = use.filter((u) => u[2] <= 0).map((u) => `${u[0]} ${u[2] < 0 ? "turun" : u[0] === "AI" ? "netral" : "belum teruji/< ambang"}`); if (P.action !== "BELI") miss.push(`rencana ${P.action}`); if (!(P.confPct >= c.thr)) miss.push(`keyakinan ${isFinite(P.confPct) ? pct(P.confPct, 0) : "–"}`);
    return { act: "TUNGGU", why: miss.join(", ") }; }
  const apPositions = () => { const demo = [...Object.entries((pp.a && pp.a.pos) || {}).filter(([, p]) => p.ap).map(([s]) => s), ...((pp.a && pp.a.fut) || []).filter((f) => f.ap).map((f) => f.s)], live = au.list.filter((x) => x.ap && (x.st === "menunggu" || x.st === "terisi" || x.st === "harian")).map((x) => x.sym); return [...new Set([...demo, ...live])]; };
  async function apBuy(X, valIdr) {
    const c = ap.cfg, P = X.P; if (!valIdr && !(P.qty > 0)) throw new Error("modal terlalu kecil untuk 1 lot/unit");
    if (c.target === "idx") { if (!demoGate().pass) throw new Error("Indodax terkunci (syarat demo belum terpenuhi)"); await idxPairsLoad(); const p = idxPairFor(X.sym); if (!p) throw new Error("tidak listing di Indodax");
      const usd = X.d.values[X.d.values.length - 1], k = p.last / usd, pd = Math.min(8, decOf(p.last)), vp = isFinite(p.volPrec) ? p.volPrec : 8, max = (ix.cfg && ix.cfg.maxIdr) || 2e6, v = Math.min(valIdr || c.val, max);
      const L = { entry: floorTo(P.entry * k, pd), stop: roundTo(P.stop * k, pd), t1: roundTo(P.t1 * k, pd), t2: roundTo(P.t2 * k, pd) }, q = floorTo(v / L.entry, vp); if (!(q > 0)) throw new Error("jumlah terlalu kecil");
      const j = await idxCall("createOrder", { symbol: p.base + "idr", side: "BUY", type: "LIMIT", price: String(L.entry), quantity: String(q) }, `buy ${p.pair}`);
      const x = { id: Date.now().toString(36), ap: true, sym: X.sym, base: p.base, symbol: p.base + "idr", pair: p.pair, ...L, qty: q, vp, pd, st: "menunggu", created: Date.now(), expire: Date.now() + 2 * 864e5, sells: [], log: [], buyId: String(j.orderId || "") };
      auLog(x, `AUTOPILOT beli limit ${q} @ ${fmtNum(L.entry)} (#${x.buyId})`); au.list.unshift(x); auSave(); return `Indodax: beli limit ${q} ${p.base.toUpperCase()} @ Rp ${fmtNum(L.entry)}`; }
    const s = X.sym, unit = X.idx ? 100 : 1, fxs = fxOf(s), units = valIdr ? (X.idx ? Math.floor(valIdr / fxs / P.entry / 100) * 100 : +(valIdr / fxs / P.entry).toFixed(6)) : X.idx ? Math.floor(P.qty) * 100 : P.qty, lim = X.idx ? MCEngine.roundTick(P.entry, true, -1) : P.entry;
    const o = { id: Date.now().toString(36), t: new Date().toISOString(), s, name: s, side: "buy", type: "limit", units, limit: lim, status: "terbuka", brk: { stop: P.stop, t1: P.t1, t2: P.t2 }, ap: true };
    if (!(units > 0)) throw new Error("dana terlalu kecil untuk 1 lot/unit"); pp.a.orders.push(o); await ppQuotes([s]); checkLimits(); ppSnap(); ppSave(); renderPaper(); return `${o.status === "terisi" ? "Demo TEREKSEKUSI" : "Demo order MENUNGGU"}: beli limit ${X.idx ? units / unit + " lot" : nf(6).format(units)} ${s} @ ${fmtNum(lim)} (stop ${fmtNum(P.stop)}, target ${fmtNum(P.t1)}/${fmtNum(P.t2)})`; }
  async function apSell(X, frac = 1, only) { // only: "swing" | "day" | undefined (semua)
    const s = X.sym, out = []; if (only !== "swing") { const rx = realDay(s); if (rx) { try { out.push(await realDaySell(rx, "autopilot")); } catch { /* */ } } } for (const f of futList().filter((y) => y.ap && y.s === s && (!only || (only === "day") === !!y.day))) { await ppQuotes([s]); const q = pp.q[s]; if (q) { const pl = futClose(f, q.price, "autopilot"); out.push(`Futures demo: tutup ${f.dir > 0 ? "LONG" : "SHORT"} ${s} @ ${fmtNum(q.price)} · ${big(pl, "IDR")}`); ppSnap(); ppSave(); renderPaper(); } } const pos = only === "day" ? null : pp.a.pos[s]; if (pos && pos.ap) { await ppQuotes([s]); const q = pp.q[s]; const u = frac >= 0.999 ? pos.units : /\.JK$/.test(s) ? Math.floor(pos.units * frac / 100) * 100 : +(pos.units * frac).toFixed(6); if (q && u > 0) { const o = { id: Date.now().toString(36), t: new Date().toISOString(), s, name: s, side: "sell", type: "autopilot", units: u, limit: null, status: "terbuka" }; if (ppFill(o, q.price)) out.push(`Demo: jual ${s} @ ${fmtNum(q.price)}`); ppSnap(); ppSave(); renderPaper(); } }
    if (frac < 0.999 || only === "day") { if (out.length) auSave(); return out.join(" · "); }
    pp.a.orders = pp.a.orders.filter((o) => !(o.ap && o.s === s && o.status === "terbuka"));
    for (const x of au.list.filter((y) => y.ap && y.sym === s && (y.st === "menunggu" || y.st === "terisi"))) {
      if (x.st === "menunggu") { try { await idxCall("cancelOrder", { symbol: x.symbol, orderId: x.buyId }); } catch { /* */ } x.st = "batal"; auLog(x, "AUTOPILOT: sinyal turun → beli dibatalkan"); out.push(`Indodax: beli ${x.base.toUpperCase()} dibatalkan`); continue; }
      let sold = 0; for (const sx of x.sells) { if (sx.done) { sold += sx.q; continue; } try { await idxCall("cancelOrder", { symbol: x.symbol, orderId: sx.id }); } catch { /* */ } }
      const rem = floorTo((x.filled || x.qty) - sold, x.vp); if (rem > 0) { await idxCall("createOrder", { symbol: x.symbol, side: "SELL", type: "MARKET", quantity: String(rem) }, `sell ${x.pair}`); }
      x.st = "keluar"; auLog(x, `AUTOPILOT: sinyal turun → jual market ${rem}`); out.push(`Indodax: jual ${rem} ${x.base.toUpperCase()} market`); }
    if (out.length) auSave(); return out.join(" · "); }
  // akuntansi run demo: modal awal + untung/rugi terealisasi transaksi autopilot + untung/rugi berjalan posisi autopilot
  function apRun() { const c = ap.cfg; if (!c.run) c.run = { start: new Date().toISOString(), cap: c.budget, n: 1 };
    const r = c.run; let real = 0, used = 0, unreal = 0; for (const o of pp.a.hist) if (o.ap && o.side === "sell" && o.fillAt >= r.start) real += o.pl || 0;
    for (const [s, p] of Object.entries(pp.a.pos)) if (p.ap) { const q = pp.q[s], v = q ? p.units * q.price * fxOf(s) : p.cost; used += p.cost; unreal += v - p.cost; }
    for (const o of pp.a.orders) if (o.ap && o.side === "buy" && o.status === "terbuka") used += o.units * o.limit * fxOf(o.s);
    for (const f of pp.a.fut || []) if (f.ap) { const q = pp.q[f.s]; used += f.margin; unreal += q ? Math.max(-f.margin, futPnl(f, q.price)) : 0; }
    const eq = r.cap + real + unreal; return { ...r, real, unreal, eq, used, free: Math.max(0, Math.min(r.cap + real - used, pp.a.cash)), ratio: eq / r.cap }; }
  async function apFailCheck() { const c = ap.cfg; if (c.target !== "demo" || !c.on) return false; const R = apRun(); if (R.ratio > AP_FAIL) return false;
    c.on = false; $("apOn").checked = false; for (const s of apPositions()) { try { await apSell({ sym: s }); } catch { /* */ } }
    c.run.failed = new Date().toISOString(); apLogAdd("—", `RUN #${c.run.n} GAGAL: dana uji ${fmtIdr(c.run.cap)} tinggal ${fmtIdr(R.eq)} (≤ ${pct(AP_FAIL, 0)}). Autopilot dianggap tidak bisa memprediksi, dimatikan & posisi ditutup.`, "err"); toast("Autopilot gagal: run turun 50%, dimatikan."); return true; }
  // ---- Berita kejutan: judul berbahaya dalam 24 jam → jual posisi autopilot & blok beli 24 jam
  const SHOCK = ["hack", "hacked", "diretas", "peretasan", "exploit", "dibobol", "bangkrut", "pailit", "pkpu", "bankrupt", "bankruptcy", "insolven", "insolvency", "gagal bayar", "default", "delisting", "delist", "suspensi", "suspended", "suspend", "fraud", "penipuan", "manipulasi", "korupsi", "ditangkap", "tersangka", "investigasi", "investigation", "sec sues", "charged", "lawsuit", "gugatan", "sanksi", "sanction", "dilarang", "larangan", "ban ", "banned", "rug pull", "rugpull", "depeg", "de-peg", "halt", "dibekukan", "freeze", "frozen", "withdrawals paused", "crash", "ambruk", "anjlok", "arb", "auto reject bawah", "profit warning", "restatement", "resign", "mundur"];
  const apNewsCache = new Map();
  async function apNews(sym, d) { const c = apNewsCache.get(sym); if (c && Date.now() - c.at < 5 * 60e3) return c.v;
    const code = sym.replace(/\.JK$/i, "").replace(/^\^/, "").replace(/-USDT?$/, ""), q = /\.JK$/i.test(sym) ? `saham ${code}` : d && d.name ? d.name.replace(/ USD$/i, "") : code;
    let v = { n: 0, neg: 0, shock: null, items: [] };
    try { const j = await (await apiFetch(`${API}?action=news&symbol=${encodeURIComponent(sym)}&q=${encodeURIComponent(q)}`)).json(); const now = Date.now() / 1000;
      const it = (j.items || []).filter((x) => x.title && (!x.time || now - x.time < 86400));
      let net = 0, wS = 0, wT = 0, pos = 0; for (const x of it) { const t = " " + (x.title + " " + (x.summary || "")).toLowerCase() + " ", s = sentiment(x.title + " " + (x.summary || "")); net += s.score; if (s.label === "neg") v.neg++; if (s.label === "pos") pos++;
        const age = x.time ? (now - x.time) / 3600 : 12, w = Math.exp(-age / 6); wS += w * Math.max(-1, Math.min(1, s.score / 2)); wT += w; // mata: berita lebih baru lebih berat (paruh ±4 jam)
        const hit = SHOCK.find((w) => t.includes(w.length <= 4 ? " " + w.trim() + " " : w)); if (hit && s.score <= 0 && !v.shock) v.shock = { word: hit.trim(), title: x.title, link: x.link, time: x.time }; }
      v.n = it.length; v.net = net; if (!v.shock && v.neg >= 3 && net <= -4) v.shock = { word: `${v.neg} berita negatif`, title: it.find((x) => sentiment(x.title).label === "neg").title };
      v.items = it.slice(0, 3); v.pos = pos; v.eye = { sent: it.length ? (pos - v.neg) / it.length : 0, buzz: Math.log1p(it.length), recent: wT ? wS / wT : 0, shock: v.shock ? 1 : 0 }; } catch { /* berita gagal: tidak memicu apa-apa */ }
    apNewsCache.set(sym, { at: Date.now(), v }); return v; }
  async function apNewsGuard() { const c = ap.cfg; if (!c.news) return;
    for (const s of apPositions()) { const N = await apNews(s, (ap.st[s] && ap.st[s].X && ap.st[s].X.d) || null); if (!N.shock) continue;
      const st = ap.st[s] || (ap.st[s] = {}); if (st.shockAt && Date.now() - st.shockAt < 3600e3) continue; st.shockAt = Date.now();
      try { const m = await apSell({ sym: s }); c.cool[s] = Date.now(); st.note = "dijual: berita kejutan"; apLogAdd(s, `JUAL DARURAT · berita kejutan "${N.shock.word}": ${N.shock.title} · ${m || "–"}`, "sell"); toast(`Autopilot: berita kejutan ${s}, posisi dijual.`); } catch (e) { apLogAdd(s, "gagal jual darurat: " + e.message, "err"); } } }

  // ---- Memori autopilot: setiap keputusan disimpan bersama fiturnya, lalu diberi label hasil 5 bar kemudian.
  //      Model "pengalaman demo" (regresi logistik) belajar ulang dari memori ini setiap ada label baru.
  const AP_H = 5, AP_MEMCAP = 1500, EXP_F = ["ML p", "DL p", "ML teruji", "DL teruji", "skor AI", "keyakinan", "ekspektasi R", "konfluensi", "berita negatif", "tren minggu", "tren hari"];
  const apMem = () => (ap.mem || (ap.mem = ((settings && settings.apMem) || []).slice()));
  const r3 = (v) => (isFinite(v) ? Math.round(v * 1000) / 1000 : null);
  function apFeat(X) { const P = X.P || {}; return [X.mlP, X.dlP, X.mlV ? 1 : 0, X.dlV ? 1 : 0, X.aiScore, P.confPct, P.pr ? P.pr.expR : NaN, X.cs, X.N ? X.N.neg : 0, X.T ? X.T.week.dir : 0, X.T ? X.T.day.dir : 0].map(r3); }
  function apRemember(X, V) { const M = apMem(), d = X.d, n = d.dates.length, day = d.dates[n - 1], f = apFeat(X);
    const i = M.findIndex((m) => m.s === X.sym && m.d === day), rec = { s: X.sym, d: day, px: r3(d.values[n - 1]), f, c: X.aic ? X.aic.map(r3) : undefined, rb: X.RB ? [X.RB.pA, X.RB.medA, X.RB.tailA, X.RB.stressStop].map(r3) : undefined, eye: X.N && X.N.eye ? [X.N.eye.sent, X.N.eye.buzz, X.N.eye.recent, X.N.eye.shock].map(r3) : undefined, v: V.act, y: null, r: null };
    if (i >= 0) { if (M[i].y == null) M[i] = rec; } else M.push(rec);
    // beri label rekaman lama simbol ini memakai harga aktual AP_H bar setelahnya
    const ix = new Map(d.dates.map((x, k) => [x, k])), cost = apCostRT(X.sym); let lab = 0;
    for (const m of M) if (m.s === X.sym && m.y == null) { const k = ix.get(m.d); if (k != null && k + AP_H < n) { m.r = r3(d.values[k + AP_H] / d.values[k] - 1); m.y = m.r > cost ? 1 : 0; lab++; } }
    if (M.length > AP_MEMCAP) M.splice(0, M.length - AP_MEMCAP);
    if (lab) { ap.expModel = null; ap.aiModel = null; ap.brain = null; } saveSettings({ apMem: M }); }

  // ---- RAM AI yang belajar: bobot 6 aturannya dipelajari dari hasil keputusan autopilot (regresi logistik, ditarik ke bobot awal).
  //      Dipakai hanya bila lolos uji pada 30% catatan terbaru (AUC ≥ 0,55); kalau belum, memakai bobot tetap.
  const AI_F = ["Strategi teruji", "Setup A+", "Konfluensi", "Tren minggu+hari", "Ekspektasi rencana", "Berita kejutan"], AI_W0 = [2, 3, 1.5, 1, 1.5, -3].map((w) => w / 3);
  function aiTrain() { if (ap.aiModel) return ap.aiModel; const L = apMem().filter((m) => m.y != null && Array.isArray(m.c)).sort((x, y) => (x.d < y.d ? -1 : 1)), n = L.length, k = AI_F.length, out = { n, valid: false, w: AI_W0.slice(), b: 0 };
    const fit = (rows, ys) => { const w = AI_W0.slice(); let b = 0; const lam = 0.5;
      for (let it = 0; it < 500; it++) { const g = Array(k).fill(0); let gb = 0; for (let i = 0; i < rows.length; i++) { const z = b + rows[i].reduce((s, v, j) => s + v * w[j], 0), e = 1 / (1 + Math.exp(-z)) - ys[i]; for (let j = 0; j < k; j++) g[j] += e * rows[i][j]; gb += e; }
        for (let j = 0; j < k; j++) w[j] -= 0.3 * (g[j] / rows.length + lam * (w[j] - AI_W0[j])); b -= 0.3 * (gb / rows.length); } return { w, b }; };
    const auc = (ps, ys) => { let pos = 0, neg = 0, s = 0; ps.map((p, i) => [p, ys[i]]).sort((a1, b1) => a1[0] - b1[0]).forEach(([, y], i) => { if (y) { pos++; s += i + 1; } else neg++; }); return pos && neg ? (s - (pos * (pos + 1)) / 2) / (pos * neg) : NaN; };
    const P = (m, r) => 1 / (1 + Math.exp(-(m.b + r.reduce((s, v, j) => s + v * m.w[j], 0))));
    if (n >= 40) { const cut = Math.floor(n * 0.7), tr = L.slice(0, cut), te = L.slice(cut), m1 = fit(tr.map((m) => m.c), tr.map((m) => m.y));
      out.auc = auc(te.map((m) => P(m1, m.c)), te.map((m) => m.y)); out.aucFixed = auc(te.map((m) => P({ w: AI_W0, b: 0 }, m.c)), te.map((m) => m.y)); out.nTest = te.length;
      const m2 = fit(L.map((m) => m.c), L.map((m) => m.y)); out.w = m2.w; out.b = m2.b; out.valid = te.length >= 12 && out.auc >= 0.55 && !(out.aucFixed > out.auc); }
    out.p = (r) => P(out, r); ap.aiModel = out; return out; }
  function apExpTrain() { if (ap.expModel) return ap.expModel;
    const L = apMem().filter((m) => m.y != null).sort((x, y) => (x.d < y.d ? -1 : 1)), n = L.length, k = EXP_F.length, out = { n, valid: false };
    const fill = [0.5, 0.5, 0, 0, 0, 0.5, 0, 0, 0, 0, 0], row = (m) => m.f.map((v, j) => (v == null || !isFinite(v) ? fill[j] : v));
    const fit = (rows, ys) => { const mu = Array(k).fill(0), sd = Array(k).fill(1); for (let j = 0; j < k; j++) { const c = rows.map((r) => r[j]); mu[j] = c.reduce((a, b) => a + b, 0) / c.length; sd[j] = Math.sqrt(c.reduce((a, b) => a + (b - mu[j]) ** 2, 0) / c.length) || 1; }
      const Z = rows.map((r) => r.map((v, j) => (v - mu[j]) / sd[j])), w = Array(k + 1).fill(0), lam = 0.3;
      for (let it = 0; it < 400; it++) { const g = Array(k + 1).fill(0); for (let i = 0; i < Z.length; i++) { const z = w[k] + Z[i].reduce((a, v, j) => a + v * w[j], 0), e = 1 / (1 + Math.exp(-z)) - ys[i]; for (let j = 0; j < k; j++) g[j] += e * Z[i][j]; g[k] += e; }
        for (let j = 0; j <= k; j++) w[j] -= 0.5 * (g[j] / Z.length + (j < k ? lam * w[j] : 0)); }
      return { mu, sd, w, p: (r) => 1 / (1 + Math.exp(-(w[k] + r.reduce((a, v, j) => a + ((v - mu[j]) / sd[j]) * w[j], 0)))) }; };
    const auc = (ps, ys) => { let pos = 0, neg = 0, s = 0; const o = ps.map((p, i) => [p, ys[i]]).sort((a, b) => a[0] - b[0]); o.forEach(([, y], i) => { if (y) { pos++; s += i + 1; } else neg++; }); return pos && neg ? (s - (pos * (pos + 1)) / 2) / (pos * neg) : NaN; };
    out.base = n ? L.reduce((a, m) => a + m.y, 0) / n : NaN;
    const by = (v) => { const S = L.filter((m) => m.v === v); return { n: S.length, win: S.length ? S.reduce((a, m) => a + m.y, 0) / S.length : NaN, r: S.length ? S.reduce((a, m) => a + m.r, 0) / S.length : NaN }; };
    out.byV = { BELI: by("BELI"), TUNGGU: by("TUNGGU"), JUAL: by("JUAL") };
    if (n >= 40) { const cut = Math.floor(n * 0.7), tr = L.slice(0, cut), te = L.slice(cut), m1 = fit(tr.map(row), tr.map((m) => m.y));
      out.auc = auc(te.map((m) => m1.p(row(m))), te.map((m) => m.y)); out.nTest = te.length; out.valid = te.length >= 12 && out.auc >= 0.55;
      const m2 = fit(L.map(row), L.map((m) => m.y)); out.model = m2; out.row = row; out.w = EXP_F.map((nm, j) => [nm, m2.w[j]]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])); }
    ap.expModel = out; return out; }

  // =====================================================================
  // OTAK: kiri (analisis) + kanan (imajinasi berbasis data) + saraf penghubung (jaringan saraf kecil).
  // Aturan keras: otak kanan tidak pernah memicu transaksi sendiri. Ia hanya membayangkan skenario dari data historis nyata,
  // lalu boleh MEMVETO atau MENGECILKAN posisi. Tanpa cukup data, otak kanan diam.
  // =====================================================================
  function rightBrain(px, P, crypto) { const n = px.length; if (n < 400) return null; const W = 20, H = 10, lr = []; for (let i = 1; i < n; i++) lr.push(Math.log(px[i] / px[i - 1]));
    const z = (a1) => { const m = a1.reduce((s, x) => s + x, 0) / a1.length, s2 = Math.sqrt(a1.reduce((s, x) => s + (x - m) ** 2, 0) / a1.length) || 1e-9; return a1.map((x) => (x - m) / s2); };
    const cur = z(lr.slice(-W)), cand = [];
    for (let e = W; e < lr.length - H - 5; e++) { const w = z(lr.slice(e - W, e)); let d2 = 0; for (let j = 0; j < W; j++) d2 += (w[j] - cur[j]) ** 2; cand.push([d2, e]); } // analog: 20 hari yang polanya mirip
    cand.sort((x, y) => x[0] - y[0]); const K = Math.min(40, cand.length), top = cand.slice(0, K), sim = top.length ? Math.exp(-top[top.length - 1][0] / (2 * W)) : 0;
    if (K < 20) return null; const fw = top.map(([, e]) => Math.exp(lr.slice(e, e + H).reduce((s, x) => s + x, 0)) - 1).sort((x, y) => x - y);
    const pA = fw.filter((x) => x > 0).length / fw.length, medA = fw[Math.floor(fw.length / 2)], tailA = fw[Math.floor(fw.length * 0.1)];
    // stres: volatilitas ×1,5 + satu hari terburuk historis disisipkan → peluang stop tersentuh dulu
    let stressStop = NaN; if (P && P.entry > 0 && P.stop > 0 && P.t1 > P.entry) { const recent = lr.slice(-504), worst = Math.min(...recent), m0 = recent.reduce((s, x) => s + x, 0) / recent.length; let stp = 0, seed = 5; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
      for (let k = 0; k < 1500; k++) { let v = P.entry; const shockAt = Math.floor(rnd() * 20); for (let t = 0; t < 20; t++) { const r0 = t === shockAt ? worst : m0 + (recent[Math.floor(rnd() * recent.length)] - m0) * 1.5; v *= Math.exp(r0); if (v <= P.stop) { stp++; break; } if (v >= P.t1) break; } }
      stressStop = stp / 1500; }
    const risk = P && P.entry > 0 && P.stop > 0 ? (P.entry - P.stop) / P.entry : 0.05; let veto = null, size = 1;
    if (tailA < -2.5 * risk) veto = `di ${K} pola mirip, 10% terburuk turun ${spct(tailA, 1)} dalam ${H} hari (> 2,5× jarak stop)`;
    else if (isFinite(stressStop) && stressStop > 0.7) veto = `skenario stres: stop tersentuh duluan di ${pct(stressStop, 0)} jalur`;
    else { if (pA < 0.45) size *= 0.5; if (isFinite(stressStop) && stressStop > 0.5) size *= 0.75; }
    return { pA, medA, tailA, stressStop, K, sim, veto, size: Math.max(0.25, size), H }; }
  // saraf penghubung: jaringan saraf 1 lapis tersembunyi (8 neuron tanh) yang belajar menggabungkan otak kiri & kanan dari hasil nyata demo
  const BR_F = ["ML p", "DL p", "ML teruji", "DL teruji", "skor AI", "keyakinan", "ekspektasi R", "konfluensi", "berita negatif", "tren minggu", "tren hari", "analog naik", "analog median", "analog terburuk", "stres stop", "mata: sentimen", "mata: ramai berita", "mata: sentimen terbaru", "mata: kejutan"];
  function brainRow(m) { const f = m.f || [], rb = m.rb || [], fill = [0.5, 0.5, 0, 0, 0, 0.5, 0, 0, 0, 0, 0], left = fill.map((v, j) => (f[j] == null || !isFinite(f[j]) ? v : f[j])), right = [0.5, 0, 0, 0.5].map((v, j) => (rb[j] == null || !isFinite(rb[j]) ? v : rb[j])), ey = m.eye || [], eye = [0, 0, 0, 0].map((v, j) => (ey[j] == null || !isFinite(ey[j]) ? v : ey[j])); return [...left, ...right, ...eye]; }
  function brainTrain() { if (ap.brain) return ap.brain; const L = apMem().filter((m) => m.y != null && Array.isArray(m.rb)).sort((x, y) => (x.d < y.d ? -1 : 1)), n = L.length, out = { n, valid: false };
    if (n < 60) { ap.brain = out; return out; }
    const X = L.map(brainRow), Y = L.map((m) => m.y), k = X[0].length, H = 8, mu = Array(k).fill(0), sd = Array(k).fill(1);
    for (let j = 0; j < k; j++) { const c = X.map((r) => r[j]); mu[j] = c.reduce((s, v) => s + v, 0) / c.length; sd[j] = Math.sqrt(c.reduce((s, v) => s + (v - mu[j]) ** 2, 0) / c.length) || 1; }
    const Z = X.map((r) => r.map((v, j) => (v - mu[j]) / sd[j]));
    const fit = (idx) => { let seed = 3; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) - 0.5; const W1 = Array.from({ length: H }, () => Array.from({ length: k }, () => rnd() * 0.4)), b1 = Array(H).fill(0), W2 = Array.from({ length: H }, () => rnd() * 0.4); let b2 = 0; const lam = 0.01, lr = 0.05;
      for (let ep = 0; ep < 150; ep++) for (const i of idx) { const h = W1.map((w, q) => Math.tanh(b1[q] + w.reduce((s, v, j) => s + v * Z[i][j], 0))), o = 1 / (1 + Math.exp(-(b2 + h.reduce((s, v, q) => s + v * W2[q], 0)))), e = o - Y[i];
        for (let q = 0; q < H; q++) { const gh = e * W2[q] * (1 - h[q] * h[q]); W2[q] -= lr * (e * h[q] + lam * W2[q]); for (let j = 0; j < k; j++) W1[q][j] -= lr * (gh * Z[i][j] + lam * W1[q][j]); b1[q] -= lr * gh; } b2 -= lr * e; }
      return (r) => { const zr = r.map((v, j) => (v - mu[j]) / sd[j]), h = W1.map((w, q) => Math.tanh(b1[q] + w.reduce((s, v, j) => s + v * zr[j], 0))); return 1 / (1 + Math.exp(-(b2 + h.reduce((s, v, q) => s + v * W2[q], 0)))); }; };
    const auc = (ps, ys) => { let pos = 0, neg = 0, s = 0; ps.map((p, i) => [p, ys[i]]).sort((a1, b1) => a1[0] - b1[0]).forEach(([, y], i) => { if (y) { pos++; s += i + 1; } else neg++; }); return pos && neg ? (s - (pos * (pos + 1)) / 2) / (pos * neg) : NaN; };
    const cut = Math.floor(n * 0.7), tr = [...Array(cut).keys()], te = [...Array(n - cut).keys()].map((i) => i + cut), f1 = fit(tr);
    out.auc = auc(te.map((i) => f1(X[i])), te.map((i) => Y[i])); out.nTest = te.length; const E = apExpTrain(); out.aucExp = E.auc;
    out.valid = te.length >= 18 && out.auc >= 0.55 && !(isFinite(E.auc) && E.valid && E.auc >= out.auc); out.p = fit([...Array(n).keys()]); ap.brain = out; return out; }
  function brainPredict(X) { const B = brainTrain(); if (!B.p) return { valid: false, n: B.n }; return { valid: B.valid, p: B.p(brainRow({ f: apFeat(X), rb: X.RB ? [X.RB.pA, X.RB.medA, X.RB.tailA, X.RB.stressStop] : null, eye: X.N && X.N.eye ? [X.N.eye.sent, X.N.eye.buzz, X.N.eye.recent, X.N.eye.shock] : null })), n: B.n, auc: B.auc }; }
  function apExpPredict(X) { const E = apExpTrain(); if (!E.model) return { valid: false, n: E.n }; const p = E.model.p(E.row({ f: apFeat(X) })); return { valid: E.valid, p, n: E.n, auc: E.auc }; }
  function drawApLearn() { const E = apExpTrain(), M = apMem(), tr = pp.a.hist.filter((o) => o.ap && o.side === "sell" && o.pl != null), w = tr.filter((o) => o.pl > 0).length;
    $("apLearnN").textContent = `${M.length} keputusan tersimpan · ${E.n} sudah berlabel`;
    const b = (v) => { const x = E.byV[v]; return x.n ? `<td>${x.n}</td><td>${pct(x.win, 0)}</td><td class="${cls(x.r)}">${spct(x.r, 2)}</td>` : '<td>0</td><td>–</td><td>–</td>'; };
    $("apLearnBody").innerHTML = `<div class="act-tiles">
      <div class="kpi"><div class="k">Model pengalaman</div><div class="v">${E.valid ? '<span class="pos">teruji</span>' : E.n >= 40 ? '<span class="note">belum teruji</span>' : `<span class="note">${E.n}/40 label</span>`}</div><div class="h">${isFinite(E.auc) ? `AUC uji ${nf(2).format(E.auc)} (${E.nTest} sampel terbaru)` : "butuh ≥ 40 keputusan berlabel"}</div></div>
      <div class="kpi"><div class="k">Transaksi autopilot demo</div><div class="v">${tr.length}</div><div class="h">${tr.length ? `${pct(w / tr.length, 0)} untung · ${big(tr.reduce((t, o) => t + o.pl, 0), "IDR")}` : "belum ada yang selesai"}</div></div>
      <div class="kpi"><div class="k">Peluang dasar untung ${AP_H} bar</div><div class="v">${isFinite(E.base) ? pct(E.base, 0) : "–"}</div><div class="h">setelah biaya</div></div></div>
      ${E.n ? `<div class="table-wrap"><table><thead><tr><th>Keputusan</th><th>Jumlah</th><th>Untung ${AP_H} bar</th><th>Rata-rata return</th></tr></thead><tbody><tr><td><b class="pos">BELI</b></td>${b("BELI")}</tr><tr><td>TUNGGU</td>${b("TUNGGU")}</tr><tr><td><b class="neg">JUAL</b></td>${b("JUAL")}</tr></tbody></table></div>` : ""}
      ${(() => { const B = brainTrain(); return `<div class="subh">🧠 Otak gabungan (saraf penghubung) · ${B.valid ? '<span class="pos">aktif</span>' : B.n >= 60 ? "belum lebih baik dari model pengalaman" : `belajar setelah ${B.n}/60 catatan berlabel`}</div>
        <p class="note keep">Otak kiri = ML, DL, RAM AI, konfluensi, rencana, berita. Otak kanan = imajinasi dari data: mencari 40 pola 20 hari paling mirip di riwayat aset lalu melihat apa yang terjadi sesudahnya, plus skenario stres (volatilitas ×1,5 + hari terburuk). Saraf penghubung = jaringan saraf 19→8→1 yang belajar dari hasil demomu. Mata = berita 24 jam terbaru (sentimen, seberapa ramai, sentimen paling baru, kejutan), dibaca ulang tiap 5 menit dan ikut diproses saraf penghubung. Otak kanan hanya boleh memveto atau mengecilkan posisi.${isFinite(B.auc) ? ` Uji ${B.nTest} catatan terbaru: AUC ${nf(2).format(B.auc)}${isFinite(B.aucExp) ? ` (model pengalaman ${nf(2).format(B.aucExp)})` : ""}.` : ""}</p>`; })()}
      ${(() => { const A = aiTrain(); return `<div class="subh">RAM AI · ${A.valid ? '<span class="pos">bobot dipelajari dari hasilmu</span>' : A.n >= 40 ? "bobot tetap (bobot dipelajari belum lebih baik)" : `bobot tetap · belajar setelah ${A.n}/40 catatan berlabel`}</div>
        <div class="table-wrap"><table><thead><tr><th>Aturan</th><th>Bobot awal</th><th>Bobot sekarang</th></tr></thead><tbody>${AI_F.map((nm, j) => `<tr><td>${esc(nm)}</td><td>${nf(2).format(AI_W0[j])}</td><td class="${A.w[j] > AI_W0[j] + 0.05 ? "pos" : A.w[j] < AI_W0[j] - 0.05 ? "neg" : ""}"><b>${nf(2).format(A.w[j])}</b></td></tr>`).join("")}</tbody></table></div>
        ${isFinite(A.auc) ? `<p class="note keep">Uji ${A.nTest} catatan terbaru: AUC bobot dipelajari ${nf(2).format(A.auc)} vs bobot tetap ${nf(2).format(A.aucFixed)}.</p>` : ""}`; })()}
      ${E.w ? `<p class="note keep">Faktor yang paling menentukan menurut pengalamanmu: ${E.w.slice(0, 4).map(([nm, v]) => `${esc(nm)} <b class="${v > 0 ? "pos" : "neg"}">${v > 0 ? "▲" : "▼"}</b>`).join(" · ")}</p>` : ""}
      <p class="note">Setiap pemeriksaan (autopilot hidup atau mati, termasuk Uji cepat) disimpan ke akunmu bersama nilai ML, DL, AI, keyakinan, konfluensi, tren, dan berita. ${AP_H} bar kemudian hasil aslinya dicatat. Model pengalaman dilatih ulang dari semua catatan itu dan diuji pada ${pct(0.3, 0)} catatan terbaru. Setelah teruji (AUC ≥ 0,55), autopilot menahan beli bila pola serupa di masa lalu peluang untungnya &lt; 55%.</p>`; }
  async function apLabelSweep() { if (ap.sweepAt && Date.now() - ap.sweepAt < 6 * 3600e3) return; ap.sweepAt = Date.now();
    const M = apMem(), old = Date.now() - 6 * 864e5, S = [...new Set(M.filter((m) => m.y == null && Date.parse(m.d) < old).map((m) => m.s))].slice(0, 15); let lab = 0;
    for (const s of S) { try { const d = await fetchSymbol(s, "6mo"), ix = new Map(d.dates.map((x, k) => [x, k])), n = d.dates.length, cost = apCostRT(s);
        for (const m of M) if (m.s === s && m.y == null) { const k = ix.get(m.d); if (k != null && k + AP_H < n) { m.r = r3(d.values[k + AP_H] / d.values[k] - 1); m.y = m.r > cost ? 1 : 0; lab++; } } } catch { /* */ } }
    if (lab) { ap.expModel = null; ap.aiModel = null; ap.brain = null; saveSettings({ apMem: M }); } }
  const AP_QUICK = ["BBCA.JK", "BBRI.JK", "BMRI.JK", "TLKM.JK", "ASII.JK", "BTC-USD", "ETH-USD", "SOL-USD", "BNB-USD", "AAPL", "NVDA", "MSFT"];
  async function apQuick() { if (ap.busy) { toast("Autopilot sedang memeriksa, tunggu sebentar."); return; } ap.busy = true; ap.scan = AP_QUICK.slice(); const btn = $("apQuick"); btn.disabled = true;
    try { for (const [i, s] of AP_QUICK.entries()) { btn.textContent = `Menguji ${i + 1}/${AP_QUICK.length}…`; const st = ap.st[s] || (ap.st[s] = {}); st.note = "menganalisis…"; drawAp();
        try { const X = await apDecide(s), V = apVerdict(X); Object.assign(st, { at: Date.now(), X, V, note: V.act === "BELI" ? "lolos semua syarat" : "" }); apRemember(X, V); } catch (e) { st.at = Date.now(); st.note = "gagal: " + e.message; } drawAp(); }
      const ok = AP_QUICK.filter((s) => ap.st[s] && ap.st[s].V && ap.st[s].V.act === "BELI"); apLogAdd("—", `Uji cepat ${AP_QUICK.length} aset: ${ok.length ? "lolos " + ok.join(", ") : "tidak ada yang lolos semua syarat"}`); }
    finally { ap.busy = false; btn.disabled = false; btn.textContent = "Uji cepat 12 aset"; apSave(); drawAp(); } }

  // ---- Pilih aset otomatis: pindai kandidat, beri skor, isi daftar dengan 8 terbaik (posisi autopilot yang terbuka selalu dipertahankan)
  async function apPickUniverse() { const c = ap.cfg;
    if (c.pickSrc === "rdc") { const rows = ap.rdc && Date.now() - ap.rdc.at < 5 * 3600e3 ? ap.rdc.rows : await apRadarCrypto(); const P = apRdPick(rows); return P.length ? P.slice(0, 16) : []; }
    if (c.target === "idx") { await idxPairsLoad(); return (ix.pairs || []).filter((p) => p.volIdr >= 1e9).sort((a, b) => b.volIdr - a.volIdr).slice(0, 14).map((p) => p.base.toUpperCase() + "-USD"); }
    const G = (gm.rows || []).filter((r) => r.st === "Kandidat kuat").map((r) => r.s);
    return [...new Set([...apWatch().slice(0, 20), ...AP_QUICK, ...G])].slice(0, 32); }
  const apRank = (st) => { const X = st && st.X, V = st && st.V; if (!X || !V) return -1e9; if (X.N && X.N.shock) return -1e8;
    return (V.act === "BELI" ? 100 : V.act === "JUAL" ? -100 : 0) + (isFinite(X.P.confPct) ? X.P.confPct * 20 : 0) + X.aiScore * 2 + (X.mlV && isFinite(X.mlP) ? (X.mlP - 0.5) * 40 : 0) + (X.dlV && isFinite(X.dlP) ? (X.dlP - 0.5) * 40 : 0) + (X.exp && X.exp.valid ? (X.exp.p - 0.5) * 40 : 0); };
  async function apAutoPick(force = false) { const c = ap.cfg; if (!c.autoPick || ap.picking || (c.scope === "all" && c.target === "demo")) return; if (!force && Date.now() - (c.pickAt || 0) < 6 * 3600e3) return;
    ap.picking = true; c.pickAt = Date.now(); const U = await apPickUniverse(), keep = apPositions();
    try { for (const [i, s] of U.entries()) { const st = ap.st[s] || (ap.st[s] = {}); if (st.at && Date.now() - st.at < 3 * 3600e3 && st.X) continue; st.note = `memindai ${i + 1}/${U.length}…`; drawAp();
        try { const X = await apDecide(s), V = apVerdict(X); Object.assign(st, { at: Date.now(), X, V, note: "" }); apRemember(X, V); } catch (e) { st.at = Date.now(); st.note = "gagal: " + e.message; } drawAp(); }
      const best = U.filter((s) => ap.st[s] && ap.st[s].X).sort((a, b) => apRank(ap.st[b]) - apRank(ap.st[a])).filter((s) => apRank(ap.st[s]) > -50);
      const L = [...new Set([...keep, ...best])].slice(0, 8); $("apList").value = L.join(", "); apRead(); ap.scan = U;
      apLogAdd("—", `Pilih otomatis dari ${U.length} kandidat: ${L.join(", ") || "tidak ada kandidat layak"}`); }
    finally { ap.picking = false; apSave(); drawAp(); } }

  // ---- Order autopilot di akun demo: dipisah antara yang masih menunggu dan yang sudah tereksekusi
  function drawApOrders() { const pend = pp.a.orders.filter((o) => o.ap && o.status === "terbuka"), done = pp.a.hist.filter((o) => o.ap).slice(0, 60);
    const seen = ap.seenFill || (ap.seenFill = new Set(done.map((o) => o.id + o.side)));
    for (const o of done) { const k = o.id + o.side; if (!seen.has(k)) { seen.add(k); apLogAdd(o.s, `TEREKSEKUSI ${o.fut ? o.type : o.side === "buy" ? "beli" : "jual"} @ ${fmtNum(o.fillPx)}${o.pl != null ? ` · laba ${big(o.pl, "IDR")}` : ""}`, o.side === "buy" ? "buy" : "sell"); } }
    const qty = (o) => (kindOf(o.s) === "idx" ? nf(0).format(o.units / 100) + " lot" : nf(6).format(o.units));
    $("apOrdN").textContent = `${pend.length} menunggu · ${done.length} tereksekusi`;
    $("apPend").innerHTML = pend.length ? `<thead><tr><th>Dipasang</th><th>Aset</th><th>Sisi</th><th>Harga limit</th><th>Harga kini</th><th>Jarak</th><th>Jumlah</th><th>Stop / target</th><th></th></tr></thead><tbody>` + pend.map((o) => { const q = pp.q[o.s], d = q ? q.price / o.limit - 1 : NaN;
      return `<tr class="ap-pend"><td>${wib(o.t)}</td><td><b>${esc(o.s)}</b></td><td class="${o.side === "buy" ? "pos" : "neg"}">${o.side === "buy" ? "BELI" : "JUAL"}</td><td>${fmtNum(o.limit)}</td><td>${q ? fmtNum(q.price) : "–"}</td>
        <td class="note">${isFinite(d) ? (o.side === "buy" ? `turun ${pct(Math.max(0, d), 1)} lagi` : `naik ${pct(Math.max(0, -d), 1)} lagi`) : "–"}</td><td>${qty(o)}</td><td class="note">${o.brk ? `${fmtNum(o.brk.stop)} / ${fmtNum(o.brk.t1)} · ${fmtNum(o.brk.t2)}` : "–"}</td>
        <td><span class="pill ap-wait">menunggu</span> <button class="x-btn" data-apcx="${esc(o.id)}" title="Batalkan order">✕</button></td></tr>`; }).join("") + "</tbody>" : '<tbody><tr><td class="note">Tidak ada order yang menunggu.</td></tr></tbody>';
    $("apDone").innerHTML = done.length ? `<thead><tr><th>Tereksekusi</th><th>Aset</th><th>Sisi</th><th>Harga isi</th><th>Jumlah</th><th>Fee</th><th>Laba (jual)</th><th></th></tr></thead><tbody>` + done.map((o) => `<tr><td>${wib(o.fillAt || o.t)}</td><td><b>${esc(o.s)}</b></td><td class="${o.side === "buy" ? "pos" : "neg"}">${o.side === "buy" ? "BELI" : "JUAL"}</td><td>${fmtNum(o.fillPx)}</td><td>${qty(o)}</td><td>${big(o.fee, "IDR")}</td>
      <td>${o.pl != null ? `<span class="${cls(o.pl)}">${o.pl >= 0 ? "+" : "−"}${big(Math.abs(o.pl), "IDR")}</span>` : "–"}</td><td><span class="pill ap-ok">${o.type === "limit" ? "limit terisi" : o.type === "stop" || o.type === "target" ? o.type : "tereksekusi"}</span></td></tr>`).join("") + "</tbody>" : '<tbody><tr><td class="note">Belum ada order autopilot yang tereksekusi.</td></tr></tbody>'; }

  // ---- Order otomatis Indodax (uang asli): order yang masih terpasang vs yang sudah terisi, dari catatan order otomatis & autopilot
  function drawApOrdersX() { const on = isOwner() && au.list.length; $("apOrdX").hidden = !on; if (!on) return;
    const pend = [], done = [], src = (x) => (x.ap ? "autopilot" : "otomatis");
    for (const x of au.list) { const B = x.base.toUpperCase();
      if (x.st === "menunggu") pend.push({ t: x.created, c: B, side: "BELI", px: x.entry, q: x.qty, why: `beli limit · ${src(x)}`, id: x.buyId });
      if (x.filled) done.push({ t: (x.log.find((l) => /beli terisi/.test(l.m)) || {}).t || x.created, c: B, side: "BELI", px: x.entry, q: x.filled, why: src(x) });
      for (const s of x.sells || []) { if (s.done) done.push({ t: s.at || x.created, c: B, side: "JUAL", px: s.px, q: s.q, why: s.nm || "target" }); else if (!s.dead && (x.st === "terisi")) pend.push({ t: x.created, c: B, side: "JUAL", px: s.px, q: s.q, why: `${s.nm || "target"} · ${src(x)}`, id: s.id }); }
      if (x.st === "stop" || x.st === "keluar") done.push({ t: (x.log[x.log.length - 1] || {}).t || x.created, c: B, side: "JUAL", px: NaN, q: NaN, why: x.st === "stop" ? "stop (market)" : "keluar autopilot (market)" }); }
    const T = (t) => (t ? wib(typeof t === "number" ? new Date(t).toISOString() : t) : "–"), qf = (q) => (isFinite(q) ? nf(8).format(q) : "sisa");
    $("apOrdXN").textContent = `${pend.length} menunggu · ${done.length} tereksekusi · status dicek tiap 15 detik selama web terbuka`;
    $("apPendX").innerHTML = pend.length ? `<thead><tr><th>Dipasang</th><th>Koin</th><th>Sisi</th><th>Harga</th><th>Jumlah</th><th>Keterangan</th><th></th></tr></thead><tbody>` + pend.map((r) => `<tr class="ap-pend"><td>${T(r.t)}</td><td><b>${esc(r.c)}</b></td><td class="${r.side === "BELI" ? "pos" : "neg"}">${r.side}</td><td>Rp ${fmtNum(r.px)}</td><td>${qf(r.q)}</td><td class="note">${esc(r.why)}${r.id ? " #" + esc(r.id) : ""}</td><td><span class="pill ap-wait">menunggu</span></td></tr>`).join("") + "</tbody>" : '<tbody><tr><td class="note">Tidak ada order otomatis yang menunggu di Indodax.</td></tr></tbody>';
    done.sort((x, y) => (Date.parse(y.t) || y.t || 0) - (Date.parse(x.t) || x.t || 0));
    $("apDoneX").innerHTML = done.length ? `<thead><tr><th>Waktu</th><th>Koin</th><th>Sisi</th><th>Harga</th><th>Jumlah</th><th>Keterangan</th><th></th></tr></thead><tbody>` + done.slice(0, 60).map((r) => `<tr><td>${T(r.t)}</td><td><b>${esc(r.c)}</b></td><td class="${r.side === "BELI" ? "pos" : "neg"}">${r.side}</td><td>${isFinite(r.px) ? "Rp " + fmtNum(r.px) : "market"}</td><td>${qf(r.q)}</td><td class="note">${esc(r.why)}</td><td><span class="pill ap-ok">tereksekusi</span></td></tr>`).join("") + "</tbody>" : '<tbody><tr><td class="note">Belum ada order otomatis yang terisi di Indodax.</td></tr></tbody>';
  }

  // ---- Kripto "Perhatikan / Uji dulu" dari Radar: dipindai sendiri (tanpa mengubah kartu Radar) untuk mengisi autopilot demo
  async function apRadarCrypto(onP) {
    let U; if (ap.cfg.target === "idx") { await idxPairsLoad(); U = (ix.pairs || []).filter((p) => p.volIdr >= 1e9).sort((a, b) => b.volIdr - a.volIdr).slice(0, 24).map((p) => p.base.toUpperCase() + "-USD"); }
    else U = [...new Set([...RD_UNI.crypto, ...(GM_UNI.alt || []), ...(GM_UNI.l1 || []), ...(GM_UNI.ai || [])])].slice(0, 36);
    const out = []; let k = 0;
    await pool(U, 4, async (s) => { try { const d = await fetchSymbol(s, "5y"); if (!d.ohlc || d.ohlc.length < 300) throw 0; const R0 = await compute("radar", { D: buildD(d), o: { ppy: 365, H: 10, isIdx: false } }); const row = { s, ...R0 }; Object.assign(row, rdScore(row)); out.push(row); } catch { /* */ } k++; if (onP) onP(k, U.length); });
    ap.rdc = { at: Date.now(), rows: out }; return out; }
  const apRdPick = (rows) => rows.filter((r) => r.st === "Perhatikan" || r.st === "Uji dulu").sort((a, b) => (a.st === b.st ? b.sc - a.sc : a.st === "Perhatikan" ? -1 : 1)).map((r) => r.s);
  async function apAddRadarCrypto() { const btn = $("apAddRd"); btn.disabled = true;
    try { let rows = (rd.rows || []).filter((r) => !r.err && /-USDT?$/.test(r.s));
      if (!apRdPick(rows).length) rows = ap.rdc && Date.now() - ap.rdc.at < 3 * 3600e3 ? ap.rdc.rows : await apRadarCrypto((i, n) => (btn.textContent = `Memindai kripto ${i}/${n}…`));
      const P = apRdPick(rows); if (!P.length) { toast("Tidak ada kripto berstatus Perhatikan / Uji dulu saat ini."); apLogAdd("—", "Radar kripto: tidak ada yang berstatus Perhatikan / Uji dulu"); return; }
      const L = apList(), add = P.filter((s) => !L.includes(s)); apSetList([...L, ...add]); apLogAdd("—", `Radar kripto (Perhatikan/Uji dulu): ${P.slice(0, 10).join(", ")}${L.length + add.length > 8 ? " · hanya 8 pertama yang masuk" : ""}`); }
    finally { btn.disabled = false; btn.textContent = "+ Kripto “Uji dulu” dari Radar"; apSave(); drawAp(); } }

  // ---- Supaya bisa jalan terus selama web terbuka: kunci layar agar tidak tidur, dan lanjut otomatis saat web dibuka lagi
  async function apWakeSync() { const want = ap.cfg && ap.cfg.on && $("apWake").checked && !document.hidden;
    try { if (want && !ap.wl && navigator.wakeLock) { ap.wl = await navigator.wakeLock.request("screen"); ap.wl.addEventListener("release", () => { ap.wl = null; }); }
      else if (!want && ap.wl) { await ap.wl.release(); ap.wl = null; } } catch { ap.wl = null; } }

  // ---- Mode target compounding: risiko besar sampai target tercapai, lalu kecil. Ukuran posisi selalu dari nilai run sekarang (bunga berbunga).
  function apPhase() { const c = ap.cfg, R0 = apRun(), r = c.run; r.peak = Math.max(r.peak || r.cap, R0.eq);
    if (R0.eq >= c.tgAmt && !r.reached) { r.reached = new Date().toISOString(); apLogAdd("—", `TARGET ${fmtIdr(c.tgAmt)} TERCAPAI (nilai ${fmtIdr(R0.eq)}). Mulai mode hati-hati: risiko ${pct(c.tgSafe, 2)} per transaksi.`, "buy"); }
    if (r.reached) return { ph: "hati-hati", risk: c.tgSafe, eq: R0.eq, peak: r.peak, why: "target sudah tercapai" };
    if (R0.eq < r.peak * (1 - c.tgBrake)) return { ph: "rem", risk: c.tgSafe, eq: R0.eq, peak: r.peak, why: `turun ${pct(1 - R0.eq / r.peak, 0)} dari puncak; risiko diperkecil sampai pulih` };
    return { ph: "agresif", risk: c.tgAgg, eq: R0.eq, peak: r.peak, why: "di bawah target" }; }
  function apTgOdds() { const c = ap.cfg, tr = pp.a.hist.filter((o) => o.ap && o.side === "sell" && o.pl != null), cost = (o) => o.units * o.fillPx * fxOf(o.s);
    let p = 0.55, w = 4 / 3 - 0.2, l = 1.2, src = "asumsi: 55% menang, untung 4% / rugi 3% per transaksi, fee 0,6%";
    if (tr.length >= 20) { const W = tr.filter((o) => o.pl > 0), L = tr.filter((o) => o.pl <= 0); p = W.length / tr.length;
      const avgW = W.length ? W.reduce((s, o) => s + o.pl / cost(o), 0) / W.length : 0, avgL = L.length ? -L.reduce((s, o) => s + o.pl / cost(o), 0) / L.length : 0.03; w = avgW / 0.03; l = Math.max(0.2, avgL / 0.03); src = `dari ${tr.length} transaksi autopilot demo: ${pct(p, 0)} menang`; }
    const start = (c.run && c.run.cap) || c.budget, out = []; let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (const yrs of [1, 3, 5]) { let hit = 0, ruin = 0; const N = 3000, T = 96 * yrs;
      for (let i = 0; i < N; i++) { let v = start, pk = start, reached = false;
        for (let t = 0; t < T; t++) { const f = v < pk * (1 - c.tgBrake) ? c.tgSafe : c.tgAgg; v *= 1 + (rnd() < p ? f * w : -f * l); pk = Math.max(pk, v); if (v >= c.tgAmt) { reached = true; break; } if (v <= start * AP_FAIL) break; }
        if (reached) hit++; else if (v <= start * AP_FAIL) ruin++; }
      out.push({ yrs, hit: hit / N, ruin: ruin / N }); }
    return { out, src }; }
  function drawTg() { const c = ap.cfg, el = $("tgStat"); if (!c.tgOn) { el.innerHTML = ""; return; } if (c.target !== "demo") { el.innerHTML = '<p class="note">Mode target hanya untuk akun demo. Indodax tetap memakai nilai per order tetap.</p>'; return; }
    const st = (c.run && c.run.cap) || 1, P = apPhase(), prog = Math.min(1, Math.max(0, Math.log(P.eq / st) / Math.log(c.tgAmt / st))), O = ap.tgOdds && ap.tgOddsAt > Date.now() - 600e3 ? ap.tgOdds : ((ap.tgOdds = apTgOdds()), (ap.tgOddsAt = Date.now()), ap.tgOdds);
    el.innerHTML = `<div class="tg-ph tg-${P.ph}">Fase: <b>${P.ph.toUpperCase()}</b> · risiko ${pct(P.risk, 2)} per transaksi · ${esc(P.why)}</div>
      <div class="tg-bar"><i style="width:${(prog * 100).toFixed(1)}%"></i></div><div class="note keep">${fmtIdr(P.eq)} dari target ${fmtIdr(c.tgAmt)} (${pct(prog, 0)} jalan, skala log) · puncak ${fmtIdr(P.peak)}</div>
      <table class="tg-odds"><thead><tr><th>Dalam</th><th>Peluang capai target</th><th>Peluang run gagal (−50%)</th></tr></thead><tbody>${O.out.map((o) => `<tr><td>${o.yrs} tahun</td><td class="${o.hit >= 0.5 ? "pos" : ""}"><b>${o.hit < 0.001 ? "< 0,1%" : pct(o.hit, 1)}</b></td><td class="${o.ruin >= 0.2 ? "neg" : ""}">${pct(o.ruin, 1)}</td></tr>`).join("")}</tbody></table>
      <p class="note keep">Simulasi ${esc(O.src)}, ±8 transaksi/bulan. Angka ini dihitung ulang otomatis setelah ada ≥ 20 transaksi autopilot demo.</p>`; }

  // =====================================================================
  // FUTURES DEMO (kripto): long & short dengan leverage, margin terisolasi, likuidasi, fee & funding.
  // Uang virtual saja: Indodax (API yang tersambung) tidak menyediakan futures.
  // =====================================================================
  const FUT_FEE = 0.0005, FUT_FUND8H = 0.0001, FUT_MM = 0.9; // fee taker 0,05%/sisi, funding 0,01%/8 jam, likuidasi saat rugi 90% margin
  const futList = () => (pp.a.fut || (pp.a.fut = []));
  const futLiq = (f) => f.entry * (1 - f.dir * (FUT_MM / f.lev));
  function futPnl(f, px) { const fx = fxOf(f.s), hrs = (Date.now() - Date.parse(f.t)) / 3600e3; return f.dir * (px - f.entry) * f.units * fx - (f.spot ? 0 : f.entry * f.units * fx * FUT_FUND8H * Math.floor(hrs / 8)); }
  function futOpen(s, dir, px, units, lev, brk, ap1, opt = {}) { const fx = fxOf(s), notional = units * px * fx, margin = notional / lev, feeR = opt.feeR || FUT_FEE, fee = notional * feeR;
    if (margin + fee > pp.a.cash) throw new Error("kas demo tidak cukup untuk margin"); pp.a.cash -= margin + fee;
    const f = { id: Date.now().toString(36), t: new Date().toISOString(), s, dir, entry: px, units, lev, margin, fee, brk, ap: !!ap1, day: !!opt.day, spot: !!opt.spot, feeR, feeR2: opt.feeR2 || feeR }; futList().push(f);
    const lab = f.spot ? `day trade beli` : `futures ${dir > 0 ? "LONG" : "SHORT"} ${lev}x${f.day ? " day" : ""} buka`;
    pp.a.hist.unshift({ id: f.id, t: f.t, s, name: s, side: dir > 0 ? "buy" : "sell", type: lab, units, fillPx: px, fillAt: f.t, fee, status: "terisi", ap: !!ap1, fut: true, eng: f.day ? "day" : "swing" }); return f; }
  function futClose(f, px, why) { const fx = fxOf(f.s), pnl = Math.max(-f.margin, futPnl(f, px)), fee = f.units * px * fx * (f.feeR2 || FUT_FEE), back = Math.max(0, f.margin + pnl - fee);
    pp.a.cash += back; pp.a.fut = futList().filter((x) => x !== f);
    pp.a.hist.unshift({ id: f.id + "c", t: new Date().toISOString(), s: f.s, name: f.s, side: f.dir > 0 ? "sell" : "buy", type: f.spot ? `day trade jual · ${why}` : `futures ${f.dir > 0 ? "LONG" : "SHORT"} ${f.lev}x${f.day ? " day" : ""} tutup · ${why}`, units: f.units, fillPx: px, fillAt: new Date().toISOString(), fee, pl: back - f.margin - f.fee, status: "terisi", ap: f.ap, fut: true, side2: "close", eng: f.day ? "day" : "swing" });
    return back - f.margin - f.fee; }
  async function futCheck() { const L = futList(); if (!L.length) return; await ppQuotes(L.map((f) => f.s)); let ch = false;
    for (const f of L.slice()) { const q = pp.q[f.s]; if (!q) continue; const px = q.price, b = f.brk || {};
      if (f.dir * (px - futLiq(f)) <= 0) { futClose(f, futLiq(f), "LIKUIDASI"); apLogAdd(f.s, `FUTURES ${f.dir > 0 ? "LONG" : "SHORT"} ${f.lev}x DILIKUIDASI @ ${fmtNum(futLiq(f))} · margin hilang`, "err"); ch = true; continue; }
      if (b.stop && f.dir * (px - b.stop) <= 0) { const pl = futClose(f, px, "stop"); apLogAdd(f.s, `FUTURES stop @ ${fmtNum(px)} · ${big(pl, "IDR")}`, "sell"); ch = true; continue; }
      if (b.t2 && f.dir * (px - b.t2) >= 0) { const pl = futClose(f, px, "target"); apLogAdd(f.s, `FUTURES target @ ${fmtNum(px)} · ${big(pl, "IDR")}`, "buy"); ch = true; continue; }
      if (b.t1 && !f.hit1 && f.dir * (px - b.t1) >= 0) { f.hit1 = true; b.stop = f.entry; apLogAdd(f.s, `FUTURES T1 tersentuh @ ${fmtNum(px)} → stop dipindah ke harga masuk`); ch = true; } }
    if (ch) { ppSnap(); ppSave(); renderPaper(); } }
  async function apShort(X, valIdr) { await ppQuotes([X.sym]); const c = ap.cfg, px = (pp.q[X.sym] && pp.q[X.sym].price) || X.px, atr = isFinite(X.atr) && X.atr > 0 ? X.atr : px * 0.03, fx = fxOf(X.sym);
    const brk = { stop: px + 1.5 * atr, t1: px - 2 * atr, t2: px - 3 * atr }, eq = apRun().eq, risk = c.tgOn ? apPhase().risk : parseFloat($("actRisk").value) || 0.01;
    let units = valIdr ? valIdr / fx / px : (eq * risk) / ((brk.stop - px) * fx); units = Math.min(units, (apRun().free * c.lev * 0.95) / (px * fx)); units = +units.toFixed(6);
    if (!(units > 0)) throw new Error("dana terlalu kecil"); const f = futOpen(X.sym, -1, px, units, c.lev, brk, true);
    return `Futures demo: SHORT ${c.lev}x ${nf(6).format(units)} ${X.sym} @ ${fmtNum(px)} (stop ${fmtNum(brk.stop)}, target ${fmtNum(brk.t1)}/${fmtNum(brk.t2)}, likuidasi ${fmtNum(futLiq(f))})`; }
  function drawFut() { const L = futList(), el = $("apFut"); if (!el) return; $("apFutCard").hidden = !(ap.cfg.fut || L.length);
    el.innerHTML = L.length ? `<thead><tr><th>Dibuka</th><th>Aset</th><th>Arah</th><th>Lev</th><th>Masuk</th><th>Kini</th><th>Likuidasi</th><th>Stop / target</th><th>Margin</th><th>Untung/rugi</th><th></th></tr></thead><tbody>` + L.map((f) => { const q = pp.q[f.s], pl = q ? futPnl(f, q.price) : NaN, b = f.brk || {};
      return `<tr><td>${wib(f.t)}</td><td><b>${esc(f.s)}</b></td><td class="${f.dir > 0 ? "pos" : "neg"}"><b>${f.dir > 0 ? "LONG" : "SHORT"}</b></td><td>${f.lev}x</td><td>${fmtNum(f.entry)}</td><td>${q ? fmtNum(q.price) : "–"}</td><td class="neg">${fmtNum(futLiq(f))}</td><td class="note">${b.stop ? fmtNum(b.stop) : "–"} / ${b.t1 ? fmtNum(b.t1) : "–"} · ${b.t2 ? fmtNum(b.t2) : "–"}</td><td>${big(f.margin, "IDR")}</td>
        <td>${isFinite(pl) ? `<span class="${cls(pl)}">${pl >= 0 ? "+" : "−"}${big(Math.abs(pl), "IDR")} (${spct(pl / f.margin, 0)})</span>` : "–"}</td><td><button class="x-btn" data-futx="${esc(f.id)}" title="Tutup posisi">Tutup</button></td></tr>`; }).join("") + "</tbody>" : '<tbody><tr><td class="note">Belum ada posisi futures.</td></tr></tbody>'; }

  // =====================================================================
  // GAYA HARIAN (day trading): masuk saat harga menembus noise band intraday, keluar saat jatuh di bawah VWAP/batas,
  // dan SEMUA posisi ditutup sebelum sesi berakhir (tidak ada posisi menginap). Hanya aset yang uji intraday-nya untung setelah biaya.
  // =====================================================================
  const tzParts = (tz) => { const p = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date()), g = (t) => (p.find((x) => x.type === t) || {}).value;
    return { wd: g("weekday"), m: (+g("hour") % 24) * 60 + +g("minute") }; };
  function daySession(s) { // { open: boleh masuk, close: wajib tutup sekarang, label }
    if (/-USDT?$/.test(s)) { const t = tzParts("Asia/Jakarta"); return { open: t.m < 23 * 60, close: t.m >= 23 * 60 + 50, label: "kripto: hari WIB, tutup 23.50" }; }
    if (/\.JK$/.test(s) || /^\^JK/.test(s)) { const t = tzParts("Asia/Jakarta"), wk = !["Sat", "Sun"].includes(t.wd) && idxOpen(); return { open: wk && t.m >= 9 * 60 + 15 && t.m <= 15 * 60, close: !wk || t.m >= 15 * 60 + 45, label: "IDX: tutup 15.45 WIB" }; }
    const t = tzParts("America/New_York"), wk = !["Sat", "Sun"].includes(t.wd) && t.m >= 9 * 60 + 30 && t.m < 16 * 60; return { open: wk && t.m >= 9 * 60 + 45 && t.m <= 15 * 60, close: !wk || t.m >= 15 * 60 + 50, label: "AS: tutup 15.50 New York" }; }
  const dayHeld = (s) => futList().some((f) => f.ap && f.day && f.s === s);
  const swingHeld = (s) => !!((pp.a.pos[s] && pp.a.pos[s].ap) || futList().some((f) => f.ap && !f.day && f.s === s) || au.list.some((x) => x.ap && x.sym === s && (x.st === "menunggu" || x.st === "terisi")));
  async function dayIntraday(s) { const c = ap.dayc || (ap.dayc = new Map()), k = c.get(s); if (k && Date.now() - k.at < 4 * 60e3) return k.v;
    let j = null; if (/-USDT?$/.test(s)) { const end = Math.floor(Date.now() / 1000); try { j = await (await apiFetch(`${API}?action=flow&symbol=${encodeURIComponent(s)}&interval=15m&start=${end - 120 * 86400}&end=${end}`)).json(); if (j.error || !Array.isArray(j.bars) || j.bars.length < 200) j = null; } catch { j = null; } }
    if (!j) j = await (await apiFetch(`${API}?action=intraday&symbol=${encodeURIComponent(s)}&interval=15m`)).json();
    if (j.error || !Array.isArray(j.bars) || j.bars.length < 200) throw new Error(j.error || "data intraday kurang");
    const crypto = /-USDT?$/.test(s), cost = (crypto ? (ap.cfg.fut ? FUT_FEE * 1e4 : 30) : /\.JK$/.test(s) ? 20 : 10);
    const NB = await compute("noise", { bars: j.bars, o: { lookback: 14, every: 2, vwapStop: true, short: !!(ap.cfg.fut && crypto), costBps: cost, gmtoffset: j.gmtoffset, ppy: crypto ? 365 : 252 } });
    const v = { NB, ok: NB.nTrades >= 30 && NB.avgTrade > 0 && NB.all && NB.all.sharpe > 0.5 }; c.set(s, { at: Date.now(), v }); return v; }
  async function dayStep(s, st) { const c = ap.cfg, S = daySession(s), rx = c.target === "idx" ? realDay(s) : null, held = dayHeld(s) || !!rx;
    if (c.target === "idx" && !/-USDT?$/.test(s)) { st.dnote = "harian uang asli hanya kripto Indodax"; return; }
    if (rx && S.close) { const m = await realDaySell(rx, "tutup sesi 23.50"); apLogAdd(s, `TUTUP SESI (Indodax) · ${m}`, "sell"); st.dnote = "sesi selesai"; return; }
    if (S.close) { if (held) { const m = await apSell({ sym: s }, 1, "day"); apLogAdd(s, `TUTUP SESI (day trade) · ${S.label} · ${m}`, "sell"); } st.dnote = `sesi selesai · ${S.label}`; return; }
    const { NB, ok } = await dayIntraday(s), n = NB.now || {}; await ppQuotes([s]); const q = pp.q[s], px = q ? q.price : n.px;
    st.day = { ok, sh: NB.all ? NB.all.sharpe : NaN, wr: NB.winRate, avg: NB.avgTrade, nT: NB.nTrades, up: n.up, lo: n.lo, vwap: n.vwap, px };
    if (rx && px < Math.max(n.up, n.vwap)) { const m = await realDaySell(rx, "di bawah batas/VWAP"); apLogAdd(s, `DAY keluar (Indodax) · ${m}`, "sell"); st.dnote = "keluar (stop intraday)"; return; }
    const f = futList().find((y) => y.ap && y.day && y.s === s), p = f && f.dir > 0 ? f : rx;
    if (p && px < Math.max(n.up, n.vwap)) { const m = await apSell({ sym: s }, 1, "day"); apLogAdd(s, `DAY keluar LONG · harga ${fmtNum(px)} di bawah batas/VWAP ${fmtNum(Math.max(n.up, n.vwap))} · ${m}`, "sell"); st.dnote = "keluar (stop intraday)"; return; }
    if (f && f.dir < 0 && px > Math.min(n.lo, n.vwap)) { const m = await apSell({ sym: s }, 1, "day"); apLogAdd(s, `DAY tutup SHORT · harga ${fmtNum(px)} di atas batas/VWAP ${fmtNum(Math.min(n.lo, n.vwap))} · ${m}`, "buy"); st.dnote = "keluar (stop intraday)"; return; }
    if (held) { st.dnote = `posisi day trade dijaga · stop ${fmtNum(p ? Math.max(n.up, n.vwap) : Math.min(n.lo, n.vwap))}`; return; }
    if (!ok) { st.dnote = `uji intraday tidak lolos (Sharpe ${nf(2).format(st.day.sh)}, rata-rata ${spct(NB.avgTrade, 2)}/transaksi setelah biaya)`; return; }
    if (!S.open) { st.dnote = `di luar jam masuk · ${S.label}`; return; }
    if (!apEngAllow(s, "day")) { st.dnote = `harian tidak dipakai untuk aset ini (${c.target === "idx" ? "belum terbukti untung di demo" : "swing lebih efektif / harian rugi"})`; return; }
    const X = st.X, against = (dir) => X && [[c.ml, X.ml], [c.dl, X.dl], [c.ai, X.ai]].some(([on, v]) => on && v === -dir);
    const bias = (dir) => !c.dayBias || (X && [[c.ml, X.ml], [c.dl, X.dl]].filter(([on]) => on).every(([, v]) => v === dir));
    const longSig = px > n.up && px > n.vwap, shortSig = c.fut && /-USDT?$/.test(s) && px < n.lo && px < n.vwap;
    if (!longSig && !shortSig) { st.dnote = `menunggu tembus batas (${fmtNum(n.lo)} – ${fmtNum(n.up)}) · harga ${fmtNum(px)}`; return; }
    if (c.target === "idx" && !longSig) { st.dnote = "Indodax spot: tidak bisa short"; return; }
    const dir = longSig ? 1 : -1; if (against(dir)) { st.dnote = `tembus ${dir > 0 ? "atas" : "bawah"}, tapi model harian berlawanan`; return; } if (!bias(dir)) { st.dnote = "tembus, tapi bias harian ML/DL belum ≥ ambang"; return; }
    if (c.news && X && X.N && X.N.shock) { st.dnote = "ada berita kejutan"; return; } if (c.dayHalt) { st.dnote = "rugi harian ≥ 5%: diblok"; return; } if (apPositions().length >= c.maxPos) { st.dnote = "maks posisi tercapai"; return; } if (c.nDay >= c.maxDay) { st.dnote = "maks order harian tercapai"; return; }
    if (c.target === "idx") return realDayBuy(s, st);
    const eq = apRun().eq, risk = c.tgOn ? apPhase().risk : parseFloat($("actRisk").value) || 0.01, fx = fxOf(s), stop = dir > 0 ? Math.max(n.up, n.vwap) * 0.995 : Math.min(n.lo, n.vwap) * 1.005, dist = Math.max(Math.abs(px - stop), px * 0.004);
    let units = (eq * risk) / (dist * fx); units = Math.min(units, (apRun().free * (dir < 0 ? c.lev : 1) * 0.95) / (px * fx));
    if (dir > 0) { units = /\.JK$/.test(s) ? Math.floor(units / 100) * 100 : +units.toFixed(6); if (!(units > 0)) { st.dnote = "dana kurang untuk 1 lot/unit"; return; }
      const [fb, fs] = FEE[kindOf(s)]; try { futOpen(s, 1, px, units, 1, null, true, { day: true, spot: true, feeR: fb, feeR2: fs }); } catch (e) { st.dnote = "ditolak: " + e.message; return; } ppSnap(); ppSave(); renderPaper();
      c.nDay++; apLogAdd(s, `DAY BELI ${/\.JK$/.test(s) ? units / 100 + " lot" : nf(6).format(units)} @ ${fmtNum(px)} · tembus batas atas ${fmtNum(n.up)} & VWAP · uji intraday ${pct(NB.winRate, 0)} menang, ${spct(NB.avgTrade, 2)}/transaksi`, "buy"); st.dnote = "day trade LONG dibuka"; }
    else { units = +units.toFixed(6); const fpos = futOpen(s, -1, px, units, c.lev, null, true, { day: true }); ppSnap(); ppSave(); renderPaper(); c.nDay++;
      apLogAdd(s, `DAY SHORT ${c.lev}x ${nf(6).format(units)} @ ${fmtNum(px)} · tembus batas bawah ${fmtNum(n.lo)} & VWAP · likuidasi ${fmtNum(futLiq(fpos))}`, "sell"); st.dnote = "day trade SHORT dibuka"; } }

  // ---- Perbandingan efektivitas per aset: swing (model) vs harian (day trade), dari transaksi autopilot demo yang sudah ditutup
  function drawApCmp() { const el = $("apCmp"); if (!el) return; const T = pp.a.hist.filter((o) => o.ap && o.pl != null && (o.side === "sell" || o.side2 === "close")), by = {};
    for (const o of T) { const e = o.eng === "day" ? "day" : "swing", r = by[o.s] || (by[o.s] = { swing: { n: 0, w: 0, pl: 0 }, day: { n: 0, w: 0, pl: 0 } }); r[e].n++; r[e].pl += o.pl; if (o.pl > 0) r[e].w++; }
    const S = Object.entries(by).sort((x, y) => (y[1].swing.n + y[1].day.n) - (x[1].swing.n + x[1].day.n)), tot = { swing: { n: 0, w: 0, pl: 0 }, day: { n: 0, w: 0, pl: 0 } };
    for (const [, r] of S) for (const e of ["swing", "day"]) { tot[e].n += r[e].n; tot[e].w += r[e].w; tot[e].pl += r[e].pl; }
    const cell = (x) => (x.n ? `<td>${x.n}</td><td>${pct(x.w / x.n, 0)}</td><td class="${cls(x.pl)}">${x.pl >= 0 ? "+" : "−"}${big(Math.abs(x.pl), "IDR")}</td>` : '<td>0</td><td>–</td><td>–</td>');
    const win = (r) => { const a2 = r.swing, b2 = r.day; if (a2.n < 5 && b2.n < 5) return '<span class="note">belum cukup (≥ 5 transaksi)</span>'; if (a2.n < 5) return b2.pl > 0 ? '<b class="pos">Harian</b> <span class="note">(swing belum cukup)</span>' : '<span class="note">harian rugi, swing belum cukup</span>'; if (b2.n < 5) return a2.pl > 0 ? '<b class="pos">Swing</b> <span class="note">(harian belum cukup)</span>' : '<span class="note">swing rugi, harian belum cukup</span>';
      const ea = a2.pl / a2.n, eb = b2.pl / b2.n; if (ea <= 0 && eb <= 0) return '<b class="neg">keduanya rugi</b>'; return ea >= eb ? '<b class="pos">Swing</b>' : '<b class="pos">Harian</b>'; };
    el.innerHTML = S.length ? `<thead><tr><th rowspan="2">Aset</th><th colspan="3">Swing (model)</th><th colspan="3">Harian (day trade)</th><th rowspan="2">Lebih efektif</th><th rowspan="2">Dipakai mode Adaptif<br><span class="note">demo · uang asli</span></th></tr><tr><th>Trx</th><th>Untung</th><th>Laba</th><th>Trx</th><th>Untung</th><th>Laba</th></tr></thead><tbody>` +
      S.map(([s, r]) => `<tr><td><b>${esc(s)}</b></td>${cell(r.swing)}${cell(r.day)}<td>${win(r)}</td><td class="note">${esc(apEngPreview(s, "demo"))} · <b>${esc(apEngPreview(s, "idx"))}</b></td></tr>`).join("") + `<tr class="am-tot"><td><b>Total</b></td>${cell(tot.swing)}${cell(tot.day)}<td>${win(tot)}</td><td></td></tr></tbody>`
      : '<tbody><tr><td class="note">Belum ada transaksi autopilot yang ditutup. Pilih Gaya trading “Keduanya” agar swing dan harian berjalan bersamaan di aset yang sama.</td></tr></tbody>'; }

  // ---- Mesin per aset: statistik swing vs harian dari demo; mode Adaptif memakai yang terbukti lebih efektif per aset
  const AP_ENG_MIN = 5;
  function apEngStats(s) { const r = { swing: { n: 0, pl: 0 }, day: { n: 0, pl: 0 } };
    for (const o of pp.a.hist) if (o.ap && o.s === s && o.pl != null && (o.side === "sell" || o.side2 === "close") && !o.real) { const e = o.eng === "day" ? "day" : "swing"; r[e].n++; r[e].pl += o.pl; }
    for (const e of ["swing", "day"]) r[e].avg = r[e].n ? r[e].pl / r[e].n : NaN; return r; }
  function apEngAllow(s, eng) { const c = ap.cfg; if (c.style === "swing") return eng === "swing"; if (c.style === "day") return eng === "day"; if (c.style === "both") return true;
    const S = apEngStats(s), me = S[eng], ot = S[eng === "day" ? "swing" : "day"], proven = (x) => x.n >= AP_ENG_MIN && x.avg > 0;
    if (c.target === "idx") return proven(me) && !(proven(ot) && ot.avg > me.avg); // uang asli: hanya mesin yang terbukti untung di demo untuk aset ini
    if (me.n < AP_ENG_MIN) return true; // demo: kumpulkan bukti dulu
    if (ot.n >= AP_ENG_MIN) return me.avg > 0 && me.avg >= ot.avg; return me.avg > 0; }
  const apEngPreview = (s, tgt) => { const c = ap.cfg, keep = [c.style, c.target]; c.style = "adapt"; c.target = tgt; const L = apEngLabel(s); [c.style, c.target] = keep; return L; };
  const apEngLabel = (s) => { const a1 = apEngAllow(s, "swing"), b1 = apEngAllow(s, "day"); if (a1 || b1) return a1 && b1 ? "swing + harian" : a1 ? "swing" : "harian"; const S = apEngStats(s); return S.swing.n >= AP_ENG_MIN && S.day.n >= AP_ENG_MIN && S.swing.avg <= 0 && S.day.avg <= 0 ? "tidak ada (keduanya rugi di demo)" : "tidak ada (belum terbukti di demo)"; };
  // ---- Harian di Indodax (uang asli, spot): beli market, jual market saat keluar / 23.50 WIB
  const realDay = (s) => au.list.find((x) => x.ap && x.day && x.sym === s && x.st === "harian");
  async function realDaySell(x, why) { let q = floorTo(x.filled || x.qty, x.vp);
    try { const A = await idxRead("account"), b = (A.balances || []).find((y) => String(y.asset).toLowerCase() === x.base); if (b && +b.free > 0) q = floorTo(Math.min(q, +b.free), x.vp); } catch { /* pakai jumlah tercatat */ } // fee bisa dipotong dari koin
    try { await idxCall("createOrder", { symbol: x.symbol, side: "SELL", type: "MARKET", quantity: String(q) }, `sell ${x.pair}`); x.st = "harian selesai"; auLog(x, `HARIAN jual market ${q} · ${why}`); auSave(); return `Indodax: jual ${q} ${x.base.toUpperCase()} market (${why})`; } catch (e) { auLog(x, "gagal jual harian: " + e.message); auSave(); throw e; } }
  async function realDayBuy(s, st) { const c = ap.cfg; if (!isOwner() || !demoGate().pass) { st.dnote = "Indodax terkunci (syarat demo)"; return; } await idxPairsLoad(); const p = idxPairFor(s); if (!p) { st.dnote = "tidak listing di Indodax"; return; }
    const max = (ix.cfg && ix.cfg.maxIdr) || 2e6, v = Math.floor(Math.min(c.val, max)), vp = isFinite(p.volPrec) ? p.volPrec : 8;
    const j = await idxCall("createOrder", { symbol: p.base + "idr", side: "BUY", type: "MARKET", quoteOrderQty: String(v) }, `buy ${p.pair}`); await new Promise((r) => setTimeout(r, 1500));
    let q = NaN; try { const o = await idxCall("getOrder", { symbol: p.base + "idr", orderId: String(j.orderId || "") }); q = +o.executedQty; } catch { /* */ } if (!(q > 0)) q = floorTo((v / p.last) * 0.997, vp);
    const x = { id: Date.now().toString(36), ap: true, day: true, sym: s, base: p.base, symbol: p.base + "idr", pair: p.pair, entry: p.last, qty: q, filled: q, vp, st: "harian", created: Date.now(), sells: [], log: [], buyId: String(j.orderId || "") };
    auLog(x, `HARIAN beli market Rp ${nf(0).format(v)} → ${q}`); au.list.unshift(x); auSave(); c.nDay++; apLogAdd(s, `DAY BELI (Indodax) Rp ${nf(0).format(v)} market · ${q} ${p.base.toUpperCase()}`, "buy"); st.dnote = "day trade Indodax dibuka"; }

  // ---- Posisi terbuka dikelompokkan per strategi (swing vs harian), demo dan Indodax
  function drawApPos() { const S = [], D = [], lastOf = (s) => (pp.q[s] ? pp.q[s].price : NaN);
    for (const [s, p] of Object.entries(pp.a.pos || {})) if (p.ap) { const q = lastOf(s), fx = fxOf(s), v = isFinite(q) ? p.units * q * fx : NaN, b = p.brk || {};
      S.push({ s, where: "Demo", side: "LONG", qty: p.units, entry: p.cost / p.units / fx, px: q, pl: v - p.cost, base: p.cost, stop: b.stop, t: b.t1 ? `${fmtNum(b.t1)} · ${fmtNum(b.t2)}` : "", since: b.at, close: `pos:${s}` }); }
    for (const o of pp.a.orders || []) if (o.ap && o.status === "terbuka" && o.side === "buy") S.push({ s: o.s, where: "Demo", side: "order menunggu", qty: o.units, entry: o.limit, px: lastOf(o.s), pl: NaN, stop: o.brk && o.brk.stop, t: o.brk ? `${fmtNum(o.brk.t1)} · ${fmtNum(o.brk.t2)}` : "", since: o.t, wait: true });
    for (const f of futList()) if (f.ap) { const q = lastOf(f.s), pl = isFinite(q) ? Math.max(-f.margin, futPnl(f, q)) : NaN, b = f.brk || {}, n = ap.st[f.s] && ap.st[f.s].day;
      (f.day ? D : S).push({ s: f.s, where: f.spot ? "Demo" : `Demo futures ${f.lev}x`, side: f.dir > 0 ? "LONG" : "SHORT", qty: f.units, entry: f.entry, px: q, pl, base: f.margin, stop: f.day && n ? (f.dir > 0 ? Math.max(n.up, n.vwap) : Math.min(n.lo, n.vwap)) : b.stop, t: f.day ? (daySession(f.s).label.split(": ")[1] || "") : b.t1 ? `${fmtNum(b.t1)} · ${fmtNum(b.t2)}` : "", since: f.t, liq: f.spot ? null : futLiq(f), close: `fut:${f.id}` }); }
    for (const x of au.list) if (x.ap && ["menunggu", "terisi", "harian"].includes(x.st)) { const pr = x.last || (coinOf(x.base) || {}).last, q = x.filled || x.qty, pl = x.st !== "menunggu" && pr ? (pr - x.entry) * q : NaN;
      (x.st === "harian" ? D : S).push({ s: x.sym, where: "Indodax", side: x.st === "menunggu" ? "order menunggu" : "LONG", qty: q, entry: x.entry, px: pr, pl, base: x.entry * q, stop: x.stop, t: x.st === "harian" ? "tutup 23.50" : x.t1 ? `${fmtNum(x.t1)} · ${fmtNum(x.t2)}` : "", since: x.created, wait: x.st === "menunggu", idr: true }); }
    const T = (t) => (t ? wib(typeof t === "number" ? new Date(t).toISOString() : t) : "–");
    const tbl = (L) => L.length ? `<thead><tr><th>Aset</th><th>Di</th><th>Arah</th><th>Jumlah</th><th>Masuk</th><th>Kini</th><th>Untung/rugi</th><th>Stop</th><th>Target / tutup</th><th>Sejak</th><th></th></tr></thead><tbody>` + L.map((r) => `<tr${r.wait ? ' class="ap-pend"' : ""}><td><b>${esc(r.s)}</b></td><td class="note">${esc(r.where)}</td>
      <td class="${r.side === "LONG" ? "pos" : r.side === "SHORT" ? "neg" : ""}"><b>${esc(r.side)}</b></td><td>${nf(r.qty < 1 ? 6 : r.qty < 100 ? 2 : 0).format(r.qty)}</td><td>${r.idr ? "Rp " : ""}${fmtNum(r.entry)}</td><td>${isFinite(r.px) ? (r.idr ? "Rp " : "") + fmtNum(r.px) : "–"}</td>
      <td>${isFinite(r.pl) ? `<span class="${cls(r.pl)}">${r.pl >= 0 ? "+" : "−"}${big(Math.abs(r.pl), "IDR")}${r.base ? ` (${spct(r.pl / r.base, 1)})` : ""}</span>` : '<span class="note">–</span>'}</td>
      <td class="neg">${r.stop ? fmtNum(r.stop) : "–"}${r.liq ? `<br><span class="note">likuidasi ${fmtNum(r.liq)}</span>` : ""}</td><td class="note">${esc(r.t || "–")}</td><td class="note">${T(r.since)}</td><td>${r.close ? `<button class="x-btn" data-apclose="${esc(r.close)}">Tutup</button>` : ""}</td></tr>`).join("") + "</tbody>" : '<tbody><tr><td class="note">Tidak ada posisi.</td></tr></tbody>';
    $("apPosS").innerHTML = tbl(S); $("apPosD").innerHTML = tbl(D);
    const sum = (L) => L.reduce((t, r) => t + (isFinite(r.pl) ? r.pl : 0), 0), sS = sum(S), sD = sum(D);
    $("apPosN").innerHTML = `swing ${S.length} · <span class="${cls(sS)}">${sS >= 0 ? "+" : "−"}${big(Math.abs(sS), "IDR")}</span> &nbsp;|&nbsp; harian ${D.length} · <span class="${cls(sD)}">${sD >= 0 ? "+" : "−"}${big(Math.abs(sD), "IDR")}</span>`; }

  // ---- teks status dipendekkan (teks lengkap di tooltip) dan sel posisi per strategi
  function apShort1(t) { if (!t) return ""; const m = [[/^uji intraday tidak lolos/, "✗ intraday rugi"], [/^menunggu tembus batas/, "tunggu tembus"], [/^di luar jam masuk/, "luar jam"], [/^sesi selesai/, "sesi tutup"], [/^harian tidak dipakai/, "harian off"], [/^swing tidak dipakai/, "swing off"],
      [/^menganalisis/, "analisis…"], [/^simulasi \(autopilot mati\)/, "mati"], [/^maks posisi/, "maks posisi"], [/^maks order harian/, "maks order"], [/^jeda 24 jam/, "jeda 24j"], [/^rugi harian/, "rem harian"], [/berita kejutan/, "⚠ berita"], [/^bursa IDX tutup/, "IDX tutup"],
      [/^order beli dipasang/, "order dipasang"], [/^posisi day trade dijaga/, "dijaga"], [/^tembus.*berlawanan/, "model berlawanan"], [/terlalu mahal/, "kemahalan"], [/Monte Carlo .* binomial/, "MC/binomial ✗"], [/pengalaman demo hanya/, "pengalaman ✗"], [/^gagal|^intraday gagal/, "gagal data"]];
    for (const [r, s] of m) if (r.test(t)) return s;
    if (/belum teruji|< ambang|netral|rencana /.test(t)) { const k = []; if (/ML (turun|belum)/.test(t)) k.push("ML"); if (/DL (turun|belum)/.test(t)) k.push("DL"); if (/AI (turun|netral)/.test(t)) k.push("AI"); const r = t.match(/rencana (\w+)/); if (r) k.push(r[1]); const kf = t.match(/keyakinan (\d+%)/); if (kf) k.push(kf[1]); return "kurang: " + k.join(", "); }
    if (/sepakat naik/.test(t)) return "✓ lolos"; if (/sepakat turun/.test(t)) return "turun"; return t.length > 28 ? t.slice(0, 26) + "…" : t; }
  function posCell(s, eng) { let r = null;
    if (eng === "swing") { const p = pp.a.pos[s]; if (p && p.ap) { const q = pp.q[s]; r = { side: "LONG", pl: q ? (p.units * q.price * fxOf(s) - p.cost) / p.cost : NaN }; }
      const f = futList().find((y) => y.ap && !y.day && y.s === s); if (!r && f) { const q = pp.q[s]; r = { side: "SHORT", pl: q ? futPnl(f, q.price) / f.margin : NaN }; }
      const x = au.list.find((y) => y.ap && y.sym === s && (y.st === "terisi" || y.st === "menunggu")); if (!r && x) r = x.st === "menunggu" ? { wait: true } : { side: "LONG", pl: x.last ? x.last / x.entry - 1 : NaN, idx: true };
      if (!r && pp.a.orders.some((o) => o.ap && o.s === s && o.status === "terbuka")) r = { wait: true }; }
    else { const f = futList().find((y) => y.ap && y.day && y.s === s); if (f) { const q = pp.q[s]; r = { side: f.dir > 0 ? "LONG" : "SHORT", pl: q ? futPnl(f, q.price) / f.margin : NaN }; }
      const x = realDay(s); if (!r && x) r = { side: "LONG", pl: x.last ? x.last / x.entry - 1 : NaN, idx: true }; }
    if (!r) return '<span class="note">–</span>'; if (r.wait) return '<span class="pill ap-wait">order</span>';
    return `<b class="${r.side === "LONG" ? "pos" : "neg"}">${r.side}</b>${r.idx ? '<span class="note">·IDX</span>' : ""} ${isFinite(r.pl) ? `<span class="${cls(r.pl)}">${spct(r.pl, 1)}</span>` : ""}`; }

  // =====================================================================
  // KESEHATAN PERANGKAT: baterai, RAM, beban (jeda event loop). Autopilot mengalah supaya perangkat tidak panas/rusak.
  // =====================================================================
  const dev = { bat: null, lag: 0, lagS: [], mem: navigator.deviceMemory || null, cores: navigator.hardwareConcurrency || null, paused: false };
  (async () => { try { if (navigator.getBattery) { const b = await navigator.getBattery(); dev.bat = b; ["levelchange", "chargingchange"].forEach((ev) => b.addEventListener(ev, () => { if (ap.cfg && !$("apPane").hidden) drawAp(); })); } } catch { /* */ } })();
  (() => { let last = performance.now(); setInterval(() => { const now = performance.now(), lag = Math.max(0, now - last - 1000); last = now; dev.lagS.push(lag); if (dev.lagS.length > 30) dev.lagS.shift(); dev.lag = dev.lagS.reduce((s, x) => s + x, 0) / dev.lagS.length; }, 1000); })();
  function devPolicy() { const c = ap.cfg || {}, b = dev.bat, onBat = b && !b.charging, lvl = b ? b.level : 1; let brains = AP_PAR, minEvery = 0, rest = 150, pause = false; const why = [];
    if (!c.health) return { brains, minEvery, rest: 0, pause, why: ["mode sehat dimatikan"] };
    if (onBat && lvl < 0.2) { pause = true; why.push(`baterai ${Math.round(lvl * 100)}% tanpa cas: analisis berat dijeda (stop & berita tetap jalan)`); }
    else if (onBat) { brains = 1; minEvery = 15; rest = 600; why.push("pakai baterai: 1 otak, periksa ≥ 15 menit"); }
    if (dev.mem && dev.mem <= 4) { brains = Math.min(brains, 2); why.push(`RAM ${dev.mem} GB: maks 2 otak`); }
    if (dev.lag > 400) { brains = Math.max(1, brains - 1); rest = Math.max(rest, 1500); why.push(`perangkat mulai berat (jeda ${Math.round(dev.lag)} ms): otak dikurangi & diberi jeda`); }
    if (document.hidden && onBat) { pause = true; why.push("tab di latar & pakai baterai: dijeda"); }
    return { brains, minEvery, rest, pause, why }; }
  function devText() { const b = dev.bat, P = devPolicy(); return `${b ? `🔋 ${Math.round(b.level * 100)}%${b.charging ? " (dicas)" : ""}` : "🔋 –"} · ${dev.cores || "?"} inti${dev.mem ? ` · RAM ${dev.mem} GB` : ""} · beban ${dev.lag > 400 ? '<b class="neg">berat</b>' : dev.lag > 150 ? "sedang" : "ringan"}${P.why.length ? " · " + P.why.map(esc).join(" · ") : ""}`; }
  // VERIFIKASI ULANG PASSWORD sebelum order BELI uang asli (berlaku 12 jam, hanya di tab ini). Jual tidak pernah diblok.
  let reAt = 0; const reOk = () => Date.now() - reAt < 12 * 3600e3;
  function reauth(why) { return new Promise((resolve) => { if (reOk()) return resolve(true);
    const d = document.createElement("div"); d.className = "re-modal"; d.innerHTML = `<div class="re-card"><b>Verifikasi password</b><p class="note keep">${esc(why || "Order beli uang asli butuh verifikasi ulang (berlaku 12 jam di tab ini).")}</p><input type="password" id="reP" autocomplete="current-password" placeholder="password akun"><div class="row"><button class="run" id="reGo">Verifikasi</button><button class="btn" id="reNo">Batal</button></div><div class="note keep" id="reMsg"></div></div>`;
    document.body.appendChild(d); const done = (v) => { d.remove(); resolve(v); }; $("reP").focus();
    const go = async () => { $("reMsg").textContent = "Memeriksa…"; try { const { error } = await sb.auth.signInWithPassword({ email: session.user.email, password: $("reP").value }); if (error) { $("reMsg").textContent = "Password salah."; return; } reAt = Date.now(); done(true); } catch (e) { $("reMsg").textContent = e.message; } };
    $("reGo").onclick = go; $("reP").onkeydown = (e) => { if (e.key === "Enter") go(); if (e.key === "Escape") done(false); }; $("reNo").onclick = () => done(false); }); }
  async function apCycle(force = false) {
    if (ap.busy) return; apRead(); const c = ap.cfg; if (!c.on && !force) return; ap.busy = true; const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10); if (c.day !== today) { c.day = today; c.nDay = 0; }
    try { if (c.target === "demo") { await ppQuotes([...apPositions(), ...pp.a.orders.filter((o) => o.ap).map((o) => o.s)]); checkLimits(); ppSnap(); ppSave(); if (await apFailCheck()) return; if (c.run && c.run.failed && c.on) { c.on = false; $("apOn").checked = false; toast("Run ini sudah gagal. Klik Mulai run baru."); return; } }
      if (c.on) await apNewsGuard(); apLabelSweep(); await futCheck(); if (c.autoPick) { ap.busy = false; await apAutoPick(); ap.busy = true; }
      if (c.target === "demo") { const E = apRun().eq; if (c.eqDay !== today) { c.eqDay = today; c.eq0 = E; } c.dayHalt = E < (c.eq0 || E) * 0.95; }
      const DP = devPolicy(); if (DP.pause && !force) { if (!dev.paused) { dev.paused = true; apLogAdd("—", "Mode sehat: " + DP.why[0]); } return; } if (dev.paused) { dev.paused = false; apLogAdd("—", "Mode sehat: analisis dilanjutkan"); }
      const evMin = Math.max(c.every, DP.minEvery);
      { const due = apSyms().filter((s) => { const st = ap.st[s] || {}; return c.style !== "day" && (force || !st.at || Date.now() - st.at >= evMin * 60e3) && !(/\.JK$/.test(s) && !idxOpen() && !force); });
        let k = 0; const t0 = Date.now(); await Promise.all(Array.from({ length: Math.min(DP.brains, due.length) }, async (_, slot) => { while (k < due.length) { const s = due[k++], st = ap.st[s] || (ap.st[s] = {}); st.note = "menganalisis…"; drawAp();
          try { st.pre = await apDecide(s, slot); } catch (e) { st.preErr = e; } if (DP.rest) await new Promise((r) => setTimeout(r, DP.rest)); } }));
        if (due.length) ap.lastPar = { n: due.length, sec: (Date.now() - t0) / 1000 }; }
      for (const s of apSyms()) {
      const st = ap.st[s] || (ap.st[s] = {});
      if (c.style !== "swing" && c.on && (force || !st.dAt || Date.now() - st.dAt >= 5 * 60e3)) { if (c.style === "day" && (!st.X || Date.now() - (st.at || 0) > 3600e3)) { try { const X = await apDecide(s); Object.assign(st, { at: Date.now(), X, V: apVerdict(X) }); apRemember(X, st.V); } catch (e) { st.at = Date.now(); } }
        st.dAt = Date.now(); try { await dayStep(s, st); } catch (e) { st.dnote = "intraday gagal: " + e.message; } drawAp(); }
      if (c.style === "day" && c.on) continue;
      if (!force && st.at && Date.now() - st.at < evMin * 60e3) continue;
      if (/\.JK$/.test(s) && !idxOpen() && !force) { st.note = "bursa IDX tutup"; continue; }
      st.note = "menganalisis…"; drawAp();
      try { if (st.preErr) { const e = st.preErr; st.preErr = null; throw e; } const X = st.pre || await apDecide(s); st.pre = null; const V = apVerdict(X); Object.assign(st, { at: Date.now(), X, V, note: "" }); apRemember(X, V); const held = swingHeld(s);
        if (!c.on) { st.note = "simulasi (autopilot mati)"; }
        else if (c.mode === "porto") { st.note = "menunggu penyeimbangan portofolio"; }
        else if ((V.act === "BELI" || V.act === "SHORT") && !held && !apEngAllow(s, "swing")) { st.note = `swing tidak dipakai untuk aset ini (${c.target === "idx" ? "belum terbukti untung di demo" : "harian lebih efektif / swing rugi"})`; }
        else if (V.act === "BELI" && !held) {
          if (c.dayHalt) st.note = "rugi harian ≥ 5%: beli baru diblok sampai besok"; else if (apPositions().length >= c.maxPos) st.note = "maks posisi tercapai"; else if (c.nDay >= c.maxDay) st.note = "maks order harian tercapai"; else if (c.cool[s] && Date.now() - c.cool[s] < 864e5) st.note = "jeda 24 jam setelah keluar";
          else { const m = await apBuy(X); c.nDay++; st.note = "order beli dipasang"; apLogAdd(s, `BELI · ${V.why} · ${m}`, "buy"); toast(`Autopilot: ${m}`); } }
        else if (V.act === "SHORT" && !held) {
          if (c.target !== "demo") st.note = "short hanya di demo"; else if (c.dayHalt) st.note = "rugi harian ≥ 5%: posisi baru diblok"; else if (apPositions().length >= c.maxPos) st.note = "maks posisi tercapai"; else if (c.nDay >= c.maxDay) st.note = "maks order harian tercapai"; else if (c.cool[s] && Date.now() - c.cool[s] < 864e5) st.note = "jeda 24 jam setelah keluar";
          else { const m = await apShort(X); c.nDay++; st.note = "short dibuka"; apLogAdd(s, `SHORT · ${V.why} · ${m}`, "sell"); toast(`Autopilot: ${m}`); } }
        else if (held && futList().some((f) => f.ap && !f.day && f.s === s && f.dir < 0) && (V.act === "BELI" || X.ml > 0 || X.dl > 0 || X.ai > 0)) { const m = await apSell(X, 1, "swing"); c.cool[s] = Date.now(); st.note = "short ditutup"; apLogAdd(s, `TUTUP SHORT · sinyal tidak lagi turun · ${m}`, "buy"); }
        else if (V.act === "JUAL" && held && !futList().some((f) => f.ap && !f.day && f.s === s && f.dir < 0)) { const m = await apSell(X, 1, "swing"); c.cool[s] = Date.now(); st.note = "posisi dijual"; apLogAdd(s, `JUAL · ${V.why} · ${m || "tidak ada yang dijual"}`, "sell"); if (m) toast(`Autopilot: ${m}`); }
        else apLogAdd(s, `${V.act} · ${V.why}`); }
      catch (e) { st.at = Date.now(); st.note = "gagal: " + e.message; apLogAdd(s, "gagal: " + e.message, "err"); }
      drawAp(); }
      if (c.on && c.mode === "porto") await apPorto(); if (c.target === "demo") await apFailCheck(); }
    finally { ap.busy = false; apSave(); drawAp(); if (ap.cfg.on && ap.cfg.every === 0) { clearTimeout(ap.cont); ap.cont = setTimeout(() => apCycle(false), devPolicy().minEvery ? 60e3 : 5000); } } }
  // ---- Mode portofolio: bobot target dari keyakinan × ekspektasi, pindah hanya bila untung bersih > biaya
  const apCostRT = (s) => { const [fb, fs] = FEE[kindOf(s)]; return fb + fs + (/-USDT?$/.test(s) ? 0.002 : 0.001); }; // fee beli+jual + spread kira-kira
  const apEdge = (X) => { const P = X && X.P; if (!P || !P.pr || !(P.entry > 0)) return 0; return Math.max(0, P.pr.expR) * Math.abs(P.entry - P.stop) / P.entry; }; // ekspektasi % per trade
  async function apPorto() {
    const c = ap.cfg, S = apSyms(), B = c.target === "demo" ? apRun().eq : c.budget;
    await ppQuotes(S); const cur = {}; for (const s of S) { const p = pp.a.pos[s], q = pp.q[s]; cur[s] = p && p.ap && q ? p.units * q.price * fxOf(s) : 0; }
    for (const x of au.list.filter((y) => y.ap && (y.st === "menunggu" || y.st === "terisi"))) cur[x.sym] = (cur[x.sym] || 0) + x.qty * x.entry;
    const R = S.map((s) => { const st = ap.st[s] || {}, X = st.X, V = st.V, e = apEdge(X), net = e - apCostRT(s); return { s, X, V, e, net, w: 0, cur: cur[s] || 0 }; });
    const ok = R.filter((r) => r.V && r.V.act === "BELI" && r.net > 0), tot = ok.reduce((t, r) => t + r.net * r.X.P.confPct, 0);
    ok.forEach((r) => (r.w = tot > 0 ? Math.min(c.maxW, (0.9 * r.net * r.X.P.confPct) / tot) : 0)); // 10% kas penyangga
    ok.sort((x, y) => y.net - x.net).slice(c.maxPos).forEach((r) => (r.w = 0));
    // posisi yang ditahan tapi tidak lagi BELI: jual hanya bila sinyal turun/JUAL, atau bila ada kandidat yang jauh lebih baik setelah biaya
    const best = ok.length ? Math.max(...ok.map((r) => r.net)) : 0;
    for (const r of R) { if (r.cur <= 0 || (r.V && r.V.act === "BELI")) continue;
      if (r.V && r.V.act === "JUAL") r.w = 0; else if (best - apCostRT(r.s) > Math.max(0, r.net) + 0.005) { r.w = 0; r.swap = true; } else r.w = r.cur / B; }
    for (const r of R) { const tgt = r.w * B, diff = tgt - r.cur;
      if (tgt > 0 && Math.abs(diff) < Math.max(0.05 * B, 1e5)) continue; // pita 5% (keluar penuh selalu dijalankan): hindari bolak-balik yang menggerus biaya
      if (diff < 0 && r.cur > 0) { const frac = tgt <= 0 ? 1 : -diff / r.cur; try { const m = await apSell({ sym: r.s }, frac); if (frac >= 0.999) c.cool[r.s] = Date.now(); apLogAdd(r.s, `PORTOFOLIO kurangi ke ${pct(r.w, 0)} · ${r.swap ? "pindah ke kandidat lebih kuat (untung bersih > biaya)" : r.V ? r.V.why : ""} · ${m || "–"}`, "sell"); } catch (e) { apLogAdd(r.s, "gagal kurangi: " + e.message, "err"); } } }
    for (const r of R) { const tgt = r.w * B, diff = tgt - r.cur;
      if (!(diff >= Math.max(0.05 * B, 1e5))) continue; if (c.dayHalt) { apLogAdd(r.s, "PORTOFOLIO: rugi harian ≥ 5%, beli baru diblok"); break; } if (c.nDay >= c.maxDay) { apLogAdd(r.s, "PORTOFOLIO: maks order harian tercapai"); break; }
      if (c.cool[r.s] && Date.now() - c.cool[r.s] < 864e5) continue; if (c.target === "idx" && r.cur > 0) continue; // Indodax: tidak menambah posisi yang sudah ada
      if (diff * apCostRT(r.s) > diff * r.net) continue;
      try { const m = await apBuy(r.X, diff); c.nDay++; apLogAdd(r.s, `PORTOFOLIO tambah ke ${pct(r.w, 0)} · ekspektasi ${pct(r.e, 1)} − biaya ${pct(apCostRT(r.s), 1)} · ${m}`, "buy"); toast(`Autopilot: ${m}`); } catch (e) { apLogAdd(r.s, "gagal tambah: " + e.message, "err"); } }
    ap.porto = R.map((r) => ({ s: r.s, w: r.w, cur: r.cur / B, net: r.net })); }
  function drawAp() { if (!ap.cfg || !$("apTable")) return; const g = demoGate(), c = ap.cfg;
    $("apGate").innerHTML = (c.target === "idx" ? gateText(g) : `Eksekusi di <b>akun demo</b>. ${gateText(g)}`) + ` · Order baru hari ini ${c.nDay || 0}/${c.maxDay} · posisi autopilot ${apPositions().length}/${c.maxPos}`;
    const S = [...new Set([...apSyms(), ...(ap.scan || [])])], ar = (v, ok) => (ok === false ? '<span class="note" title="belum teruji">✗</span>' : v > 0 ? '<b class="pos">▲</b>' : v < 0 ? '<b class="neg">▼</b>' : '<span class="note">•</span>');
    $("apTable").innerHTML = S.length ? `<thead><tr><th>Aset</th><th>Keputusan</th><th>Rencana</th><th>Keyakinan</th><th>ML</th><th>DL</th><th>AI</th><th>Target dulu<br><span class="note">MC · binomial</span></th><th>Nilai wajar</th><th title="mata: berita 24 jam terbaru · sentimen">👁 Mata</th><th title="model pengalaman demo">Peng.</th><th title="otak kanan: dari pola historis yang mirip, peluang naik 10 hari · 10% terburuk">Otak kanan</th><th>Posisi swing</th><th>Posisi harian</th><th>Status</th><th>Diperiksa</th></tr></thead><tbody>` + S.map((s) => { const st = ap.st[s] || {}, X = st.X, V = st.V;
      const hasPos = pp.a.pos[s] && pp.a.pos[s].ap, hasPend = pp.a.orders.some((o) => o.ap && o.s === s && o.status === "terbuka");
      return `<tr><td><b>${esc(s)}</b></td><td>${V ? `<span class="rd-pill ap-${V.act}">${V.act}</span>` : "–"}</td><td>${X ? X.P.action : "–"}</td><td>${X && isFinite(X.P.confPct) ? pct(X.P.confPct, 0) : "–"}</td>
        <td>${X ? `${ar(X.ml, X.mlV)} ${pct(X.mlP, 0)}` : "–"}</td><td>${X ? `${ar(X.dl, X.dlV)} ${isFinite(X.dlP) ? pct(X.dlP, 0) : ""}` : "–"}</td><td>${X ? `${ar(X.ai)} ${X.aiLearned && isFinite(X.aiP) ? `<span title="AI belajar: peluang untung">${pct(X.aiP, 0)}</span>` : nf(1).format(X.aiScore)}` : "–"}</td><td>${X && X.mcP ? `<span class="${X.mcP.ev > 0 ? "pos" : "neg"}">${pct(X.mcP.p, 0)}</span> · <span class="${X.bnP && X.bnP.ev > 0 ? "pos" : "neg"}">${X.bnP ? pct(X.bnP.p, 0) : "–"}</span>` : '<span class="note">–</span>'}</td><td>${X && X.val ? (X.val.bad ? '<span class="note">? data</span>' : `<span class="${X.val.up > 0 ? "pos" : "neg"}">${spct(X.val.up, 0)}</span>`) : '<span class="note">–</span>'}</td><td>${X && X.N ? (X.N.shock ? `<b class="${X.N.shockOff ? "note" : "neg"}" title="${esc(X.N.shock.title)}${X.N.shockOff ? " (jual darurat berita dimatikan)" : ""}">⚠ ${esc(X.N.shock.word)}</b>` : X.N.eye && X.N.n ? `<span class="${X.N.eye.recent > 0.15 ? "pos" : X.N.eye.recent < -0.15 ? "neg" : "note"}" title="${X.N.n} berita 24 jam · ${X.N.pos || 0} positif · ${X.N.neg} negatif&#10;${(X.N.items || []).map((x) => "• " + esc(x.title)).join("&#10;")}">${X.N.eye.recent > 0.15 ? "▲" : X.N.eye.recent < -0.15 ? "▼" : "•"} ${X.N.n}</span>` : '<span class="note">0</span>') : "–"}</td><td>${X && X.exp && X.exp.p != null && isFinite(X.exp.p) ? `${pct(X.exp.p, 0)}${X.exp.valid ? "" : ' <span class="note">belum teruji</span>'}` : '<span class="note">–</span>'}</td>
        <td>${X && X.RB ? `<span title="${X.RB.K} pola mirip · median ${spct(X.RB.medA, 1)} · stres stop ${isFinite(X.RB.stressStop) ? pct(X.RB.stressStop, 0) : "–"}${X.RB.veto ? " · VETO: " + esc(X.RB.veto) : X.RB.size < 1 ? " · posisi ×" + nf(2).format(X.RB.size) : ""}" class="${X.RB.veto ? "neg" : X.RB.pA >= 0.55 ? "pos" : ""}">${pct(X.RB.pA, 0)} · ${spct(X.RB.tailA, 0)}${X.RB.veto ? " ⛔" : X.RB.size < 1 ? " ↓" : ""}</span>` : '<span class="note">–</span>'}</td><td>${posCell(s, "swing")}</td><td>${c.style !== "swing" ? posCell(s, "day") : '<span class="note">–</span>'}</td>
        <td class="note ap-st">${c.style === "adapt" ? `<b>${esc(apEngLabel(s).replace(" (belum terbukti di demo)", "").replace(" (keduanya rugi di demo)", " ✗"))}</b> · ` : ""}${(c.style === "both" || c.style === "adapt" || c.style === "day") && st.dnote ? `<span title="${esc(st.dnote)}">H: ${esc(apShort1(st.dnote))}</span>${c.style !== "day" ? " · " : ""}` : ""}${c.style !== "day" ? `<span title="${esc(st.note || (V ? V.why : ""))}">${c.style === "swing" ? "" : "S: "}${esc(apShort1(st.note || (V ? V.why : "")))}</span>` : ""}</td><td class="note">${st.at ? new Date(st.at).toLocaleTimeString("id-ID") : "–"}${X && isFinite(X.ms) ? `<br><span title="${X.cached ? "model ML/DL dipakai ulang (sudah dilatih hari ini)" : "melatih ML/DL baru"}">⏱ ${nf(1).format(X.ms / 1000)} dtk${X.cached ? "" : " ★"}</span>` : ""}</td></tr>`; }).join("") + "</tbody>" : '<tbody><tr><td class="note">Tambahkan aset di kotak kiri.</td></tr></tbody>';
    $("apLog").innerHTML = ap.log.length ? "<tbody>" + ap.log.slice(0, 120).map((l) => `<tr><td class="note">${wib(l.t)}</td><td><b>${esc(l.s)}</b></td><td class="${l.k === "buy" ? "pos" : l.k === "sell" ? "neg" : l.k === "err" ? "neg" : ""}">${esc(l.m)}</td></tr>`).join("") + "</tbody>" : '<tbody><tr><td class="note">Belum ada aktivitas.</td></tr></tbody>';
    if (c.target === "demo") { const R = apRun(); $("apGate").innerHTML += `<br>Run #${R.n}${R.failed ? ' <b class="neg">GAGAL</b>' : ""}: dana uji ${fmtIdr(R.cap)} → nilai sekarang <b class="${R.eq >= R.cap ? "pos" : "neg"}">${fmtIdr(R.eq)}</b> (${pct(R.ratio - 1, 1)}) · terpakai ${fmtIdr(R.used)} · batas gagal ${fmtIdr(R.cap * AP_FAIL)}`; }
    document.querySelectorAll(".ap-porto").forEach((e) => (e.hidden = c.mode !== "porto"));
    if (c.mode === "porto" && ap.porto) $("apGate").innerHTML += "<br>Bobot portofolio: " + ap.porto.map((r) => `${esc(r.s)} ${pct(r.cur, 0)}→<b>${pct(r.w, 0)}</b>`).join(" · ");
    $("apDev").innerHTML = devText(); drawApLearn(); drawApChips(); drawApOrders(); drawApOrdersX(); drawTg(); drawFut(); drawApCmp(); drawApPos();
    { const simOn = c.on && c.scope === "all" && c.target === "demo"; $("apSimAll").textContent = simOn ? "■ Hentikan simulasi semua aset" : "▶ Simulasi semua aset (demo)"; $("apSimAll").classList.toggle("alt", simOn); }
    { const S2 = apSyms(), last = Math.max(0, ...S2.map((s) => (ap.st[s] && ap.st[s].at) || 0)), nxt = last ? last + c.every * 60e3 - Date.now() : 0, el = $("apState");
      if (!c.on) { el.className = "ap-state off"; el.innerHTML = "● MATI — tidak ada order otomatis. Centang <b>Aktifkan autopilot</b> untuk menyalakan."; }
      else if (!S2.length && !c.autoPick) { el.className = "ap-state idle"; el.innerHTML = "● NYALA tapi <b>menganggur</b>: belum ada aset yang dipantau. Klik aset di bawah, atau centang <b>Pilih aset otomatis</b>."; }
      else if (ap.busy || ap.picking) { el.className = "ap-state on"; el.innerHTML = "● NYALA — sedang menganalisis…"; }
      else { el.className = "ap-state on"; el.innerHTML = `● NYALA — memantau ${S2.length} aset${c.autoPick ? " (pilih otomatis)" : ""} · ${c.every === 0 ? "terus-menerus (putaran baru langsung dimulai)" : `pemeriksaan berikutnya ${nxt > 0 ? "±" + Math.ceil(nxt / 60e3) + " menit lagi" : "sebentar lagi"}`}${ap.wl ? " · layar dijaga menyala" : ""} · ${AP_PAR} otak paralel${ap.lastPar ? ` · putaran terakhir ${ap.lastPar.n} aset dalam ${nf(0).format(ap.lastPar.sec)} dtk` : ""} · hanya jalan selama web ini terbuka`; } }
    $("apNext").textContent = c.on ? (c.every === 0 ? "aktif · terus-menerus" : `aktif · periksa tiap ${c.every} menit`) : "mati"; apWakeSync(); }
  const AP_GROUPS = [["Saham IDX", ["BBCA.JK", "BBRI.JK", "BMRI.JK", "BBNI.JK", "TLKM.JK", "ASII.JK", "ANTM.JK", "GOTO.JK"]], ["Kripto", ["BTC-USD", "ETH-USD", "SOL-USD", "BNB-USD", "XRP-USD", "DOGE-USD", "ADA-USD"]], ["Saham AS", ["AAPL", "NVDA", "MSFT", "TSLA", "GOOGL", "AMZN"]], ["Lainnya", ["GC=F", "^JKSE"]]];
  // Cakupan "semua aset" (demo saja): watchlist + semua aset tombol cepat + kripto Radar + Hidden gems, maks 40
  function apAll() { const G = (gm.rows || []).filter((r) => r.st === "Kandidat kuat").map((r) => r.s), RC = ap.rdc ? apRdPick(ap.rdc.rows) : [];
    return [...new Set([...apPositions(), ...apWatch(), ...AP_GROUPS.flatMap((g) => g[1]), ...RC, ...G])].slice(0, 40); }
  const apWatch = () => [...new Set((($("wlQ") && $("wlQ").value) || "").split(/[,\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean))];
  function apSetList(L) { $("apList").value = [...new Set(L)].slice(0, 8).join(", "); apRead(); apSave(); drawAp(); }
  function drawApChips() { const L = apList(), held = apPositions(), lab = (s) => s.replace(/\.JK$/, "").replace(/-USD$/, "").replace("GC=F", "EMAS").replace("^JKSE", "IHSG");
    if (ap.cfg.scope === "all" && ap.cfg.target === "demo") { const A = apAll(); $("apChips").innerHTML = `<span class="ap-chip held">Semua aset · ${A.length}</span><span class="note">watchlist + tombol cepat + kripto Radar + Hidden gems. Ganti Cakupan untuk memilih sendiri.</span>`; }
    else $("apChips").innerHTML = L.length ? L.map((s) => `<span class="ap-chip${held.includes(s) ? " held" : ""}" title="${esc(s)}">${esc(lab(s))}${held.includes(s) ? " •" : ""}<button data-apdel="${esc(s)}" title="Hapus">✕</button></span>`).join("") + `<span class="note">${L.length}/8</span>` : '<span class="note">Belum ada aset. Klik aset di bawah atau cari.</span>';
    const W = apWatch(), RC = apRdPick([...((rd.rows || []).filter((r) => !r.err && /-USDT?$/.test(r.s))), ...((ap.rdc && ap.rdc.rows) || [])]);
    let groups = [...(RC.length ? [["Radar kripto · Uji dulu", [...new Set(RC)].slice(0, 16)]] : []), ...(W.length ? [["Watchlist saya", W.slice(0, 20)]] : []), ...AP_GROUPS]; if (ap.cfg.target === "idx" && ix.pairs) groups = [["Indodax (volume ≥ Rp 1 M)", ix.pairs.filter((p) => p.volIdr >= 1e9).sort((a, b) => b.volIdr - a.volIdr).slice(0, 16).map((p) => p.base.toUpperCase() + "-USD")]];
    $("apPick").innerHTML = groups.map(([g, S]) => `<div class="ap-pg"><span class="note">${esc(g)}</span>${S.map((s) => `<button class="ap-add${L.includes(s) ? " on" : ""}" data-apadd="${esc(s)}">${L.includes(s) ? "✓ " : "+ "}${esc(lab(s))}</button>`).join("")}</div>`).join(""); }
  function bindAp() { apLoad();
    attachAC($("apFind"), { onPick: (sym) => { const L = apList(); if (L.length >= 8) { toast("Maksimal 8 aset."); return; } apSetList([...L, String(sym).toUpperCase()]); } });
    $("apPend").addEventListener("click", (e) => { const x = e.target.closest("[data-apcx]"); if (!x) return; const o = pp.a.orders.find((y) => y.id === x.dataset.apcx); if (!o) return; o.status = "batal"; pp.a.orders = pp.a.orders.filter((y) => y !== o); apLogAdd(o.s, "Order menunggu dibatalkan manual"); ppSave(); renderPaper(); apSave(); drawAp(); });
    $("apChips").addEventListener("click", (e) => { const d = e.target.closest("[data-apdel]"); if (d) apSetList(apList().filter((s) => s !== d.dataset.apdel)); });
    $("apPick").addEventListener("click", (e) => { const b = e.target.closest("[data-apadd]"); if (!b) return; const s = b.dataset.apadd, L = apList();
      if (L.includes(s)) apSetList(L.filter((x) => x !== s)); else if (L.length >= 8) toast("Maksimal 8 aset. Hapus satu dulu."); else apSetList([...L, s]); }); setTimeout(() => apLabelSweep(), 20e3);
    ["apOn", "apUseML", "apUseDL", "apUseAI", "apTarget", "apThr", "apMaxPos", "apMaxDay", "apVal", "apEvery", "apList", "apScope", "apMode", "apBudget", "apHealth", "apBrains", "apStyle", "apDayBias", "apFut1", "apLev", "tgOn", "tgAmt", "tgAgg", "tgSafe", "tgBrake", "apMaxW", "apUseNews", "apUseExp", "apAutoPick", "apPickSrc"].forEach((id) => $(id).addEventListener("change", () => {
      apRead(); if (id === "apTarget" && ap.cfg.target === "idx" && !demoGate().pass) { toast("Indodax terkunci sampai syarat demo terpenuhi."); ap.cfg.target = "demo"; $("apTarget").value = "demo"; }
      if (id === "apTarget" && ap.cfg.target === "idx" && !isOwner()) { ap.cfg.target = "demo"; $("apTarget").value = "demo"; }
      if (id === "apTarget" && ap.cfg.target === "idx") reauth("Mengaktifkan autopilot uang asli butuh verifikasi password (berlaku 12 jam).").then((ok) => { if (!ok) { ap.cfg.target = "demo"; $("apTarget").value = "demo"; apSave(); drawAp(); } });
      if (id === "apScope" && ap.cfg.scope === "all") { if (ap.cfg.target !== "demo") { toast("Simulasi semua aset hanya untuk akun demo."); ap.cfg.scope = "list"; $("apScope").value = "list"; } else { toast(`Simulasi penuh: ${apAll().length} aset dipantau. Satu putaran bisa ±${Math.ceil(apAll().length * 15 / 60)} menit.`); if (ap.cfg.on) setTimeout(() => apCycle(true), 300); } }
      if (id === "apTarget" && ap.cfg.target === "idx" && ap.cfg.scope === "all") { ap.cfg.scope = "list"; $("apScope").value = "list"; }
      if (/^tg/.test(id)) ap.tgOdds = null;
      if (id === "apPickSrc" && ap.cfg.autoPick) { ap.cfg.pickAt = 0; setTimeout(() => apAutoPick(true), 300); }
      if (id === "apAutoPick" && ap.cfg.autoPick) { ap.cfg.pickAt = 0; setTimeout(() => apAutoPick(true), 300); }
      if (id === "apOn" && ap.cfg.on) { if (!apSyms().length && !ap.cfg.autoPick) { toast("Isi dulu aset yang dipantau."); ap.cfg.on = false; $("apOn").checked = false; } else { apLogAdd("—", `Autopilot DIAKTIFKAN (${ap.cfg.target === "idx" ? "Indodax" : "demo"}, ${[ap.cfg.ml && "ML", ap.cfg.dl && "DL", ap.cfg.ai && "AI"].filter(Boolean).join("+")}, ambang ${pct(ap.cfg.thr, 0)})`); setTimeout(() => apCycle(true), 300); } }
      if (id === "apOn" && !ap.cfg.on) apLogAdd("—", "Autopilot dimatikan");
      apSave(); drawAp(); }));
    $("apAddCur").onclick = () => { if (!state.data) return; const L = apList(); if (!L.includes(state.data.symbol)) { $("apList").value = [...L, state.data.symbol].join(", "); apRead(); apSave(); drawAp(); } };
    $("apAddWl").onclick = () => { const W = apWatch(); if (!W.length) { toast("Watchlist masih kosong (F1)."); return; } const L = apList(), add = W.filter((s) => !L.includes(s)); if (L.length >= 8) { toast("Daftar sudah 8 aset. Hapus dulu, atau pakai Pilih aset otomatis untuk memilih yang terbaik dari watchlist."); return; } apSetList([...L, ...add]); if (L.length + add.length > 8) toast(`Watchlist punya ${W.length} aset; yang masuk 8 pertama. Centang Pilih aset otomatis agar dipilih yang terbaik.`); };
    $("apAddRd").onclick = () => apAddRadarCrypto();
    $("apAddGems").onclick = () => { const G = gm.rows.filter((r) => r.st === "Kandidat kuat").map((r) => r.s); if (!G.length) { toast("Belum ada Kandidat kuat di Hidden gems."); return; } $("apList").value = [...new Set([...apList(), ...G])].slice(0, 8).join(", "); apRead(); apSave(); drawAp(); };
    $("apSimAll").onclick = () => { const c = ap.cfg, on = c.on && c.scope === "all" && c.target === "demo";
      if (on) { c.on = false; $("apOn").checked = false; apLogAdd("—", "Simulasi semua aset dihentikan"); apSave(); drawAp(); return; }
      c.target = "demo"; c.scope = "all"; c.on = true; c.every = 0; $("apTarget").value = "demo"; $("apScope").value = "all"; $("apOn").checked = true; $("apEvery").value = String(c.every);
      apLogAdd("—", `Simulasi semua aset DIMULAI (${apAll().length} aset, demo, terus-menerus)`); apSave(); drawAp(); setTimeout(() => apCycle(true), 300); };
    $("tgStart").onclick = () => { apRead(); if (apPositions().length) { toast("Tutup dulu posisi autopilot (tombol Matikan & tutup)."); return; } const c = ap.cfg; c.tgOn = true; $("tgOn").checked = true; c.budget = 1e6; $("apBudget").value = 1e6; c.target = "demo"; $("apTarget").value = "demo"; c.mode = "asset"; $("apMode").value = "asset";
      const n = ((c.run && c.run.n) || 0) + 1; c.run = { start: new Date().toISOString(), cap: 1e6, n }; ap.tgOdds = null; apLogAdd("—", `Run #${n} TARGET dimulai: Rp 1 jt → ${fmtIdr(c.tgAmt)} · agresif ${pct(c.tgAgg, 0)}/transaksi, hati-hati ${pct(c.tgSafe, 2)}, rem ${pct(c.tgBrake, 0)}`); apSave(); drawAp(); };
    $("apFutCard").addEventListener("click", async (e) => { const x = e.target.closest("[data-futx]"); if (!x) return; const f = futList().find((y) => y.id === x.dataset.futx); if (!f) return; await ppQuotes([f.s]); const q = pp.q[f.s]; if (!q) return; const pl = futClose(f, q.price, "manual"); apLogAdd(f.s, `Futures ditutup manual @ ${fmtNum(q.price)} · ${big(pl, "IDR")}`); ppSnap(); ppSave(); renderPaper(); drawAp(); });
    $("apPosCard").addEventListener("click", async (e) => { const b = e.target.closest("[data-apclose]"); if (!b) return; const [k, id] = b.dataset.apclose.split(":");
      if (k === "fut") { const f = futList().find((y) => y.id === id); if (!f) return; await ppQuotes([f.s]); const q = pp.q[f.s]; if (!q) return; const pl = futClose(f, q.price, "manual"); apLogAdd(f.s, `Ditutup manual @ ${fmtNum(q.price)} · ${big(pl, "IDR")}`, "sell"); }
      else if (k === "pos") { const m = await apSell({ sym: id }, 1, "swing"); apLogAdd(id, `Swing ditutup manual · ${m || "–"}`, "sell"); }
      ppSnap(); ppSave(); renderPaper(); apSave(); drawAp(); });
    $("apNow").onclick = () => apCycle(true); $("apQuick").onclick = () => apQuick();
    $("apNewRun").onclick = () => { apRead(); if (apPositions().length) { toast("Tutup dulu posisi autopilot (tombol Matikan & tutup)."); return; } const n = ((ap.cfg.run && ap.cfg.run.n) || 0) + 1; ap.cfg.run = { start: new Date().toISOString(), cap: ap.cfg.budget, n }; apLogAdd("—", `Run #${n} dimulai · dana uji ${fmtIdr(ap.cfg.budget)}`); apSave(); drawAp(); };
    $("apKill").onclick = async () => { apRead(); ap.cfg.on = false; $("apOn").checked = false; for (const s of apPositions()) { try { const m = await apSell({ sym: s }); apLogAdd(s, `DITUTUP manual · ${m}`, "sell"); } catch (e) { apLogAdd(s, "gagal tutup: " + e.message, "err"); } } apLogAdd("—", "Autopilot dimatikan & posisi autopilot ditutup"); apSave(); drawAp(); toast("Autopilot dimatikan."); };
    $("apWake").addEventListener("change", () => apWakeSync());
    document.addEventListener("visibilitychange", () => { if (!document.hidden) { pullSettings(); apWakeSync(); if (ap.cfg.on) apCycle(false); } });
    setTimeout(() => { if (ap.cfg.on) { apLogAdd("—", "Web dibuka lagi: autopilot melanjutkan"); apCycle(false); } }, 8000);
    if (location.hostname === "localhost") window.__ap = { brainTrain, aiTrain, futOpen, apEngAllow, apEngStats, pp, dayStep, daySession, dayIntraday, apShort, futCheck, futList, au, drawAp, idxCall, ledgerRows, apBuy, apSell, apRun, apDecide, apPorto, apNews, apNewsGuard, apNewsCache, ap };
    clearInterval(ap.timer); ap.timer = setInterval(async () => { futCheck(); apCycle(false); if (!$("apPane").hidden && !ap.busy) { try { await ppQuotes([...Object.keys(pp.a.pos || {}), ...futList().map((f) => f.s)]); } catch { /* */ } drawAp(); } }, 60e3); } // tetap jalan di tab latar (browser membatasi ke ±1x/menit)

  // =====================================================================
  // MANAJEMEN ASET: semua yang kamu pegang dalam satu layar (uang asli dan demo dipisah)
  // =====================================================================
  const am = { src: "real", busy: false, bal: null, balAt: 0 };
  async function amRows() {
    const out = [];
    if (am.src === "demo") { const S = Object.keys(pp.a.pos); await ppQuotes(S);
      for (const s of S) { const p = pp.a.pos[s], q = pp.q[s], fx = fxOf(s); if (!q) continue; const v = p.units * q.price * fx, d = q.prevClose ? p.units * (q.price - q.prevClose) * fx : NaN;
        out.push({ s, src: p.ap ? "Demo · autopilot" : "Demo", qty: p.units, unit: kindOf(s) === "idx" ? "lbr" : "", px: q.price, v, day: d, dayP: q.prevClose ? q.price / q.prevClose - 1 : NaN, cost: p.cost }); }
      return { rows: out, cash: pp.a.cash }; }
    const S = pf.list.map((p) => p.s); if (S.length) await ppQuotes(S);
    for (const p of pf.list) { const q = pp.q[p.s]; if (!q) continue; const fx = fxOf(p.s), units = /\.JK$/.test(p.s) ? p.qty * 100 : p.qty, v = units * q.price * fx;
      out.push({ s: p.s, src: "Portofolio", qty: units, unit: /\.JK$/.test(p.s) ? "lbr" : "", px: q.price, v, day: q.prevClose ? units * (q.price - q.prevClose) * fx : NaN, dayP: q.prevClose ? q.price / q.prevClose - 1 : NaN, cost: units * p.avg * fx }); }
    let cash = +$("pfCash").value || 0;
    if (isOwner()) { try { await idxPairsLoad(); if (!am.bal || Date.now() - am.balAt > 60e3) { am.bal = await idxRead("account"); am.balAt = Date.now(); }
        const coins = []; for (const x of am.bal.balances || []) { const c = String(x.asset || "").toLowerCase(), n = (+x.free || 0) + (+x.locked || 0); if (!(n > 0)) continue; if (c === "idr") { cash += n; continue; } const P = coinOf(c); if (!P) continue; coins.push(c);
          const v = n * P.last, ch = P.chg24, L = ledgerCost(c), known = L.q >= n * 0.99;
          out.push({ s: c.toUpperCase() + "-USD", lab: c.toUpperCase(), src: "Indodax", qty: n, unit: c.toUpperCase(), px: P.last, v, day: isFinite(ch) && ch != null ? v - v / (1 + ch) : NaN, dayP: ch, cost: known ? (L.c * n) / L.q : NaN, dayLbl: "24 jam" }); }
        ledgerSync(coins).then(() => {}); } catch (e) { am.idxErr = e.message; } }
    return { rows: out, cash };
  }
  async function amRender() { if (am.busy || $("pfView").hidden) return; am.busy = true; $("amNote").textContent = "Memuat harga…";
    try { const { rows, cash } = await amRows(); rows.sort((x, y) => y.v - x.v); const inv = rows.reduce((t, r) => t + r.v, 0), tot = inv + cash;
      const dayT = rows.reduce((t, r) => t + (isFinite(r.day) ? r.day : 0), 0), kc = rows.filter((r) => isFinite(r.cost)), plT = kc.reduce((t, r) => t + r.v - r.cost, 0), costT = kc.reduce((t, r) => t + r.cost, 0);
      const up = rows.filter((r) => r.day > 0).length, dn = rows.filter((r) => r.day < 0).length, R = (v) => big(v, "IDR"), sg = (v) => `<span class="${cls(v)}">${v >= 0 ? "+" : "−"}${R(Math.abs(v))}</span>`;
      $("amKpi").innerHTML = [["Total nilai", R(tot), `${rows.length} aset + kas`], ["Pergerakan hari ini", sg(dayT), inv ? `<span class="${cls(dayT)}">${spct(dayT / (inv - dayT || 1), 2)}</span> dari aset` : ""],
        ["Untung/rugi belum terealisasi", kc.length ? sg(plT) : "–", kc.length ? `<span class="${cls(plT)}">${spct(plT / (costT || 1), 1)}</span> dari modal ${R(costT)}` : "modal belum diketahui"], ["Kas", R(cash), tot ? pct(cash / tot, 0) + " dari total" : ""],
        ["Naik / turun hari ini", `<b class="pos">${up}</b> / <b class="neg">${dn}</b>`, rows.length - up - dn ? `${rows.length - up - dn} datar/tanpa data` : ""]].map(([k, v, s]) => `<div class="kpi"><div class="k">${k}</div><div class="v">${v}</div><div class="h">${s}</div></div>`).join("");
      $("amTable").innerHTML = rows.length ? `<thead><tr><th>Aset</th><th>Sumber</th><th>Jumlah</th><th>Harga</th><th>Hari ini</th><th>Rp hari ini</th><th>Nilai</th><th>Modal</th><th>Untung/rugi</th><th>Porsi</th></tr></thead><tbody>` + rows.map((r) => { const g = r.v - r.cost;
        return `<tr><td><span class="pf-sym" data-am="${esc(r.s)}">${esc(r.lab || r.s)}</span></td><td class="note">${esc(r.src)}</td><td>${nf(r.qty < 1 ? 6 : r.qty < 100 ? 2 : 0).format(r.qty)} ${esc(r.unit)}</td><td>${fmtNum(r.px)}</td>
          <td class="${cls(r.dayP)}">${isFinite(r.dayP) && r.dayP != null ? spct(r.dayP, 2) : "–"}${r.dayLbl ? ' <span class="note">24j</span>' : ""}</td><td>${isFinite(r.day) ? sg(r.day) : "–"}</td><td><b>${R(r.v)}</b></td><td>${isFinite(r.cost) ? R(r.cost) : '<span class="note" title="Riwayat beli belum lengkap (API Indodax hanya 7 hari)">–</span>'}</td>
          <td>${isFinite(r.cost) ? `${sg(g)} <span class="${cls(g)}">${spct(g / r.cost, 1)}</span>` : "–"}</td><td><div class="am-w"><i style="width:${tot ? ((r.v / tot) * 100).toFixed(1) : 0}%"></i></div>${tot ? pct(r.v / tot, 0) : ""}</td></tr>`; }).join("")
        + `<tr><td class="note">Kas</td><td></td><td></td><td></td><td></td><td></td><td><b>${R(cash)}</b></td><td></td><td></td><td>${tot ? pct(cash / tot, 0) : ""}</td></tr></tbody>`
        : `<tbody><tr><td class="note">${am.src === "demo" ? "Belum ada posisi demo." : "Belum ada aset. Tambahkan posisi di kartu Portofolio saya di bawah" + (isOwner() ? ", atau sambungkan Indodax di F6." : ".")}</td></tr></tbody>`;
      // riwayat nilai harian
      let H; if (am.src === "demo") H = (pp.a.eq || []).map((x) => ({ d: x.d, v: x.v }));
      else { const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10), L = ((settings && settings.amHist) || []).slice(); if (tot > 0) { if (L.length && L[L.length - 1].d === today) L[L.length - 1].v = tot; else L.push({ d: today, v: tot }); if (L.length > 730) L.splice(0, L.length - 730); saveSettings({ amHist: L }); } H = L; }
      const acc = css("--accent");
      drawChart("amHist", { type: "line", data: { labels: H.map((x) => x.d), datasets: [{ data: H.map((x) => x.v / 1e6), borderColor: acc, backgroundColor: css("--accent-soft"), fill: true, borderWidth: 1.8, pointRadius: H.length < 30 ? 3 : 0 }] },
        options: baseOpts({ plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => "Rp " + nf(2).format(c.raw) + " jt" } } }, scales: { x: { ticks: { maxTicksLimit: 6 }, grid: { display: false } }, y: { ticks: { callback: (v) => v + " jt" }, grid: { color: css("--grid") } } } }) });
      const M = rows.filter((r) => isFinite(r.day)).sort((x, y) => y.day - x.day).slice(0, 12), good = css("--good"), bad = css("--bad");
      drawChart("amMove", { type: "bar", data: { labels: M.map((r) => r.lab || r.s), datasets: [{ data: M.map((r) => r.day), backgroundColor: M.map((r) => (r.day >= 0 ? good : bad)), borderRadius: 3 }] },
        options: baseOpts({ indexAxis: "y", plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => (c.raw >= 0 ? "+" : "−") + big(Math.abs(c.raw), "IDR") } } }, scales: { x: { ticks: { callback: (v) => big(v) }, grid: { color: css("--grid") } }, y: { grid: { display: false } } } }) });
      $("amNote").innerHTML = (am.src === "demo" ? "Akun demo memakai uang virtual dan dipisah dari uang asli." : `Uang asli = Portofolio saya${isOwner() ? " + saldo Indodax" : ""} + kas. Riwayat nilai mulai tercatat sejak kamu membuka layar ini.`) +
        (am.src === "real" && isOwner() ? " Modal kripto Indodax dihitung dari buku transaksi; API hanya memberi 7 hari terakhir, jadi koin yang dibeli sebelum buku mulai tercatat tampil “–”." : "") + (am.idxErr ? ` <span class="neg">Indodax: ${esc(am.idxErr)}</span>` : "") + ` · diperbarui ${new Date().toLocaleTimeString("id-ID")}`; am.idxErr = null; }
    catch (e) { $("amNote").innerHTML = `<span class="neg">${esc(e.message)}</span>`; }
    finally { am.busy = false; } }
  function bindAm() {
    $("amSrc").addEventListener("click", (e) => { const b = e.target.closest("[data-a]"); if (!b) return; am.src = b.dataset.a; document.querySelectorAll("#amSrc .seg-btn").forEach((x) => x.classList.toggle("active", x === b)); amRender(); });
    $("amRef").onclick = () => { am.balAt = 0; amRender(); }; $("amTax").onclick = () => ledgerCsv();
    $("amTable").addEventListener("click", (e) => { const s = e.target.closest("[data-am]"); if (s) openDetail(s.dataset.am); });
    setInterval(() => { if (!$("pfView").hidden && !document.hidden) amRender(); }, 60e3); }
  function bindChartSrc() { $("srcTabs").addEventListener("click", (e) => { const b = e.target.closest(".tab[data-src]"); if (b) setChartSrc(b.dataset.src); });
    $("tfTabs").addEventListener("click", () => { if (state.chartSrc === "tv") setTimeout(() => setChartSrc("tv", false), 50); }); }
  async function ensureHolidays() { // tahun di luar kalender bawaan (2027): ambil libur nasional otomatis (cuti bersama bursa belum termasuk)
    const yNeed = new Date(Date.now() + 90 * 864e5).getUTCFullYear(); for (let y = 2028; y <= yNeed; y++) {
      try { const j = await (await apiFetch(`${API}?action=holidays&year=${y}&country=ID`)).json(); if (j && j.days) { MCEngine.addHolidays("IDX", j.days.map((x) => x.date)); act.holNote = `Libur ${y} diambil otomatis dari ${j.source}.`; } } catch { /* */ } } }
  function bindAction() { ensureHolidays(); bindChartSrc();
    $("actTabs").addEventListener("click", (e) => { const b = e.target.closest(".tab[data-at]"); if (b) setActTab(b.dataset.at); });
    $("actBrain").addEventListener("click", (e) => { const b = e.target.closest("[data-goat]"); if (b) { setActTab(b.dataset.goat); if (b.dataset.goat === "ask") setTimeout(() => $("actAsk").focus(), 50); } });
    ["actCap", "actRisk", "actGoal"].forEach((id) => $(id).addEventListener("input", () => { clearTimeout(act.t); act.t = setTimeout(() => { if (act.all) renderAction(); }, 300); }));
    $("actAiRun").onclick = () => runBrief(false);
    $("actAskF").addEventListener("submit", (e) => { e.preventDefault(); const q = $("actAsk").value.trim(); if (q) { askAi(q); $("actAsk").value = ""; } });
    $("mlRun").onclick = () => { act.mlKey = null; renderAction(); }; $("mlH").addEventListener("change", () => { act.mlKey = null; renderAction(); });
    try { const c = localStorage.getItem("sp_act_cap"), g = localStorage.getItem("sp_act_goal"); if (c) $("actCap").value = c; if (g) $("actGoal").value = g; } catch { /* */ }
    ["actCap", "actGoal"].forEach((id) => $(id).addEventListener("change", () => { try { localStorage.setItem(id === "actCap" ? "sp_act_cap" : "sp_act_goal", $(id).value); } catch { /* */ } }));
  }

  // ---------- Valuasi gabungan (beberapa metode) ----------
  function valEnsemble(F = state.fund, px = state.res && state.res.s0, usd = state.data && (state.data.currency || "") !== "IDR", dcf = state.valUpside) {
    if (!F || !(px > 0)) return null;
    const beta = isFinite(F.beta) && F.beta > 0 ? Math.min(2.5, F.beta) : 1;
    const rf = usd ? state.usRf ?? 0.04 : DAMO.sbn10, ke = rf + beta * (DAMO.erp + (usd ? 0 : DAMO.crpID));
    const eps = F.trailingPE > 0 ? px / F.trailingPE : null, bv = F.bookValuePerShare > 0 ? F.bookValuePerShare : null, roe = isFinite(F.roe) ? F.roe : bv && eps ? eps / bv : null;
    const pay = isFinite(F.payoutRatio) && F.payoutRatio >= 0 ? Math.min(1, F.payoutRatio) : F.dividendYield > 0 && eps ? Math.min(1, (px * F.dividendYield) / eps) : 0.4;
    const g = Math.max(0, Math.min(roe != null ? roe * (1 - pay) : 0.04, ke - 0.02, usd ? 0.04 : 0.06)), M = [];
    if (dcf != null && isFinite(dcf)) M.push(["DCF Damodaran (kartu Valuasi)", px * (1 + dcf)]);
    if (eps > 0 && bv > 0) M.push(["Graham number √(22,5·EPS·BV)", Math.sqrt(22.5 * eps * bv)]);
    if (bv > 0 && roe != null && ke > g) M.push(["Residual income (ROE vs biaya modal)", bv + ((roe - ke) * bv) / (ke - g)]);
    if (F.dividendYield > 0 && ke > g) M.push(["Dividend discount (Gordon)", (px * F.dividendYield * (1 + g)) / (ke - g)]);
    if (eps > 0 && ke > g) M.push(["P/E wajar = payout·(1+g)/(r−g)", (eps * pay * (1 + g)) / (ke - g)]);
    if (F.forwardPE > 0 && F.trailingPE > 0) M.push(["Laba tahun depan × P/E sekarang", px * (F.trailingPE / F.forwardPE)]);
    const ok = M.filter(([, v]) => isFinite(v) && v > 0); if (!ok.length) return { methods: [], ke, g };
    const vals = ok.map(([, v]) => v).sort((a, b) => a - b), med = vals[vals.length >> 1] * (vals.length % 2 ? 1 : 0) + (vals.length % 2 ? 0 : (vals[vals.length / 2 - 1] + vals[vals.length / 2]) / 2);
    const above = ok.filter(([, v]) => v > px).length, agree = Math.max(above, ok.length - above) / ok.length, cv = MCEngine.std(vals, 0) / MCEngine.mean(vals);
    return { methods: ok, med, lo: vals[0], hi: vals[vals.length - 1], upside: med / px - 1, agree, cv, ke, g, side: above * 2 >= ok.length ? "di bawah nilai wajar (murah)" : "di atas nilai wajar (mahal)",
      conf: ok.length >= 3 && agree >= 0.75 && cv < 0.5 ? "sedang" : "rendah" };
  }
  // ---------- Dampak berita: uji kejadian dari berita yang sudah ada + sentimen terbaru ----------
  function newsImpact() {
    const N = (state.news || []).filter((x) => x.tday); if (N.length < 5) return null;
    const by = new Map(); for (const x of N) { const ai = aiOf(x), s = ai ? (ai.arah === "naik" ? 1 : ai.arah === "turun" ? -1 : 0) : Math.sign((x.sent && x.sent.score) || 0); const e = by.get(x.tday) || { d: x.tday, s: 0, car: x.car, ar: x.ar, n: 0 }; e.s += s; e.n++; by.set(x.tday, e); }
    const days = [...by.values()].filter((e) => e.car != null), grp = (f) => { const a = days.filter(f).map((e) => e.car); const m = a.length ? MCEngine.mean(a) : NaN, sd = a.length > 1 ? MCEngine.std(a) : NaN; return { n: a.length, m, t: a.length > 1 && sd > 0 ? m / (sd / Math.sqrt(a.length)) : NaN }; };
    const pos = grp((e) => e.s > 0), neg = grp((e) => e.s < 0), now = Date.now() / 1000, rec = (state.news || []).filter((x) => now - x.time < 7 * 86400);
    const net = rec.reduce((a, x) => { const ai = aiOf(x); return a + (ai ? (ai.arah === "naik" ? 1 : ai.arah === "turun" ? -1 : 0) : Math.sign((x.sent && x.sent.score) || 0)); }, 0);
    const reliable = (g) => g.n >= 5 && Math.abs(g.t) >= 2, cur = net > 0 ? pos : net < 0 ? neg : null;
    return { pos, neg, net, nRecent: rec.length, nDays: days.length, src: state.ai ? "AI berita" : "kamus sentimen", effect: cur && reliable(cur) ? cur.m : 0, reliable: !!(cur && reliable(cur)),
      top: rec.slice(0, 6).map((x) => { const ai = aiOf(x); return { judul: x.title.slice(0, 140), tanggal: new Date(x.time * 1000).toISOString().slice(0, 10), arah: ai ? ai.arah : x.sent && x.sent.score > 0 ? "naik" : x.sent && x.sent.score < 0 ? "turun" : "netral", reaksi_abnormal: x.ar != null ? +(x.ar * 100).toFixed(2) : null }; }) };
  }
  // ---------- Machine learning (kartu) ----------
  // data lintas pasar untuk ML: indeks acuan, kurs, VIX (riwayat 10 tahun)
  async function mlExt(sym) { const L = /\.JK$/i.test(sym) ? [["^JKSE", "IHSG"], ["IDR=X", "USD/IDR"]] : /-USDT?$/i.test(sym) || isCrypto() ? [["BTC-USD", "Bitcoin"], ["^GSPC", "S&P 500"]] : [["^GSPC", "S&P 500"], ["^VIX", "VIX"]];
    const out = []; for (const [s, name] of L) { if (s === sym) continue; try { const d = await fetchSymbol(s, "10y"); out.push({ name, map: Object.fromEntries(d.dates.map((x, i) => [x, d.values[i]])) }); } catch { /* lewati */ } } return out; }
  const nhCache = new Map();
  async function newsHist(sym) { const c = nhCache.get(sym); if (c && Date.now() - c.at < 600e3) return c.v;
    let v = { map: null, days: 0, installed: false, from: null };
    try { const j = await (await apiFetch(`${API}?action=news_hist&symbol=${encodeURIComponent(sym)}`)).json(); const rows = (j && j.rows) || [];
      v = { map: rows.length ? Object.fromEntries(rows.map((r) => [r.day, [r.n, r.sent]])) : null, days: rows.length, installed: !!(j && j.installed), from: rows.length ? rows[0].day : null }; } catch { /* */ }
    nhCache.set(sym, { at: Date.now(), v }); return v; }
  function dlBlock(M, k) {
    const D = M.dl; if (!D) return `<div class="subh">Deep learning</div><p class="note">Data terlalu pendek untuk deep learning (butuh ±3 tahun).</p>`;
    if (D.error) return `<div class="subh">Deep learning</div><p class="status err">${esc(D.error)}</p>`;
    const att = D.att || [], mx = Math.max(...att.map((x) => x.w), 1e-9);
    return `<div class="subh">Deep learning · jaringan saraf konvolusi + attention</div>
      <div class="act-tiles">${k(`Peluang naik ${M.H} hari (DL)`, isFinite(D.p) ? pct(D.p, 0) : "–", `${D.nParam} parameter · ${D.valid ? "teruji" : "belum teruji"}`, D.valid)}${k("AUC out-of-sample", nf(3).format(D.auc), `nilai-p ${nf(3).format(D.aucP)} · ≈${D.nEff} sampel`)}${k("Brier skill", spct(D.bss, 1), `dasar ${pct(D.base, 0)}`)}</div>
      ${att.length ? `<div class="dl-att" title="Bobot perhatian jaringan per hari">${att.map((x) => `<i style="height:${Math.max(4, (x.w / mx) * 100).toFixed(0)}%" title="${esc(x.d)} · ${pct(x.w, 1)}"></i>`).join("")}</div><div class="dl-att-l"><span>${esc(att[0].d.slice(5))}</span><span>hari yang paling diperhatikan jaringan</span><span>${esc(att[att.length - 1].d.slice(5))}</span></div>` : ""}
      <details class="howto"><summary>Arsitektur</summary><p class="note">${esc(D.arch)}. Input: ${D.channels.map(esc).join(", ")} untuk 24 hari terakhir + semua fitur ML. Dilatih ulang tiap 252 hari secara walk-forward (bobot dilanjutkan), berhenti dini, dikalibrasi Platt. Teruji bila AUC ≥ 0,53, p &lt; 0,05, Brier skill &gt; 0.</p></details>`;
  }
  function renderML() {
    const M = act.ml; $("mlCard").hidden = !M; if (!M) return;
    if (M.error) { $("mlBody").innerHTML = `<p class="status err">${esc(M.error)}</p>`; return; }
    const st = M.valid ? '<span class="pill pos">teruji — ikut menentukan Rencana aksi</span>' : '<span class="pill">belum teruji — hanya informasi</span>';
    const k = (a, b, c, hl) => `<div class="kpi ${hl ? "hl" : ""}"><div class="k">${a}</div><div class="v">${b}</div><div class="h">${c}</div></div>`;
    const maxAcc = Math.max(M.base, 1 - M.base);
    $("mlBody").innerHTML = `<div class="act-tiles">${k(`Peluang naik > biaya dalam ${M.H} hari`, pct(M.p, 0), `logistik ${pct(M.pLog, 0)} · boosting ${pct(M.pGb, 0)} · pola mirip ${pct(M.pKnn, 0)} · saraf ${pct(M.pMlp, 0)} (sebelum kalibrasi)`, M.valid)}
        ${k("Ketidakpastian model", isFinite(M.disagree) ? `±${nf(0).format(M.disagree * 100)} poin` : "–", M.disagree > 0.12 ? "4 model berbeda pendapat — hati-hati" : "4 model cukup sepakat")}
        ${k("AUC out-of-sample (gabungan)", nf(3).format(M.auc), `nilai-p ${nf(3).format(M.aucP)} · ${M.nFeat} fitur${M.ext && M.ext.length ? " + " + esc(M.ext.join(", ")) : ""}`)}
        ${k("Brier skill", spct(M.bss, 1), "> 0 = lebih baik dari menebak rata-rata")}
        ${k("Akurasi", pct(M.acc, 0), `patokan selalu-tebak-mayoritas ${pct(maxAcc, 0)}`)}
        ${k("Data uji", `${nf(0).format(M.nOos)} hari`, `≈ ${M.nEff} sampel independen · sejak ${M.from} · dilatih ${nf(0).format(M.nTrain)} hari (±${nf(0).format(M.yrs || 0)} th)`)}</div>
      <p class="note" style="margin:8px 0 0">Berita sebagai fitur: ${M.newsUsed ? `<b class="pos">dipakai</b> — ${nf(0).format(M.newsDays)} hari bursa punya data sentimen (sejak ${esc(M.newsInfo && M.newsInfo.from || "")}).` : M.newsInfo && M.newsInfo.installed ? `belum dipakai — baru ${nf(0).format(M.newsDays)} hari riwayat berita (butuh ≥ 60). Riwayat terisi otomatis tiap kali berita aset ini dibuka (±6 bulan sekaligus dari Google News), jadi segera cukup.` : "belum dipakai — tabel riwayat berita belum dipasang (jalankan SQL di perintah SETUP)."}</p>
      <p style="margin:10px 0 0">Status: ${st}. ${M.valid ? `Model menemukan pola yang <b>bertahan di data yang belum pernah dilihatnya</b> untuk aset ini.` : `Pada data yang belum pernah dilihatnya, model <b>belum lebih baik secara meyakinkan</b> daripada tebakan dasar (${pct(M.base, 0)} hari naik). Itu hasil yang jujur — kebanyakan harga memang sulit ditebak.`}</p>
      <div class="subh">Perbandingan model (semua diuji di data yang belum pernah dilihatnya)</div>
      <div class="table-wrap"><table><thead><tr><th>Model</th><th>AUC out-of-sample</th><th>Bobot di gabungan</th></tr></thead><tbody>${(M.models || []).map(([nm, a, w]) => `<tr><td>${esc(nm)}</td><td class="${a >= 0.53 ? "pos" : a < 0.5 ? "neg" : ""}">${nf(3).format(a)}</td><td>${pct(w, 0)}</td></tr>`).join("")}
        <tr class="best"><td><b>Gabungan (stacking)</b></td><td><b>${nf(3).format(M.auc)}</b></td><td>bobot dipelajari dari periode sebelumnya saja</td></tr></tbody></table></div>
      <div class="ml-grid"><div><div class="subh">Kalibrasi: peluang yang diberikan vs yang terjadi</div><div class="chart-box" style="height:200px"><canvas id="mlCal"></canvas></div>
          <p class="note">Kalau titik-titik mendekati garis diagonal, angka "${pct(M.p, 0)}" bisa dibaca apa adanya.</p></div>
        <div><div class="subh">Fitur paling berpengaruh (uji permutasi)</div><div class="ml-imp">${M.imp.slice(0, 10).map((f) => `<span>${esc(f.name)}</span><span><i class="${f.dir < 0 ? "neg" : ""}" style="width:${Math.max(3, (Math.max(0, f.v) / Math.max(1e-6, M.imp[0].v)) * 100).toFixed(0)}%"></i></span><span class="note">${f.v > 0 ? "−" + nf(3).format(f.v) : "0"} AUC</span>`).join("")}</div>
          <p class="note">Panjang batang = seberapa turun AUC kalau fitur itu diacak di data uji (makin panjang, makin diandalkan). Biru: nilai lebih tinggi menaikkan peluang; merah: menurunkan. Fitur dengan 0 tidak membantu dan bisa diabaikan.</p></div></div>
      ${M.bt ? `<div class="subh">Kalau dipakai trading (out-of-sample sejak ${M.bt.from}): pegang besok bila peluang &gt; 50%</div>
        <div class="table-wrap"><table><thead><tr><th></th><th>Return</th><th>CAGR</th><th>Sharpe</th><th>Max DD</th></tr></thead><tbody>
          <tr><td>Strategi ML (setelah biaya)</td><td>${pc(M.bt.s.total)}</td><td>${pc(M.bt.s.cagr)}</td><td class="${M.bt.s.sharpe > M.bt.b.sharpe ? "pos" : "neg"}">${nf(2).format(M.bt.s.sharpe)}</td><td>${pct(M.bt.s.maxDD)}</td></tr>
          <tr><td>Beli & tahan</td><td>${pc(M.bt.b.total)}</td><td>${pc(M.bt.b.cagr)}</td><td>${nf(2).format(M.bt.b.sharpe)}</td><td>${pct(M.bt.b.maxDD)}</td></tr></tbody></table></div>` : ""}
      ${M.tb ? `<div class="subh">Triple barrier: kena target (+${M.tb.up}×ATR) sebelum stop (−${M.tb.dn}×ATR) dalam ${M.tb.H} hari?</div>
        <div class="act-tiles">${k("Peluang menang (ML)", pct(M.tb.p, 0), `target ±${fmtNum(M.tb.tgt)} · stop ±${fmtNum(M.tb.stp)}`, M.tb.valid)}
          ${k("Peluang dasar", pct(M.tb.base, 0), "seberapa sering setup seperti ini menang secara umum")}${k("AUC out-of-sample", nf(3).format(M.tb.auc), `nilai-p ${nf(3).format(M.tb.aucP)} · ${M.tb.valid ? "teruji" : "belum teruji"}`)}</div>
        <p class="note">Ini metode label "triple barrier" (López de Prado): model belajar langsung apakah sebuah posisi beli akan kena target dulu atau kena stop dulu — sama dengan cara kerja Rencana aksi. Bila teruji dan peluangnya rendah, rencana BELI otomatis diturunkan jadi TAHAN.</p>` : ""}
      ${dlBlock(M, k)}
      ${M.fuse && !M.fuse.error ? `<div class="subh">Fusi 3 kecerdasan · meta-model yang dipelajari</div><div class="act-tiles">${k("Peluang naik (fusi)", isFinite(M.fuse.p) ? pct(M.fuse.p, 0) : "–", M.fuse.valid ? "teruji → dipakai Rencana aksi" : "belum teruji", M.fuse.valid)}${k("AUC fusi vs ML saja", `${nf(3).format(M.fuse.auc)} / ${nf(3).format(M.fuse.aucML)}`, `p ${nf(3).format(M.fuse.aucP)} · ≈${M.fuse.nEff} sampel`)}${k("Bobot dipelajari", `ML ${nf(2).format(M.fuse.w.ml)} · DL ${nf(2).format(M.fuse.w.dl)}`, `konfluensi ${nf(2).format(M.fuse.w.conf)} (log-odds)`)}</div>` : ""}
      ${M.term && M.term.length ? `<div class="subh">Struktur waktu peluang naik (regresi logistik)</div><div class="table-wrap"><table><thead><tr><th>Horizon</th>${M.term.map((t) => `<th>${t.h} hari</th>`).join("")}</tr></thead><tbody>
        <tr><td>Peluang naik hari ini</td>${M.term.map((t) => `<td class="${t.p > t.base + 0.05 ? "pos" : t.p < t.base - 0.05 ? "neg" : ""}">${pct(t.p, 0)}</td>`).join("")}</tr><tr><td>Rata-rata historis</td>${M.term.map((t) => `<td>${pct(t.base, 0)}</td>`).join("")}</tr></tbody></table></div>
        <p class="note">Belum dikalibrasi & belum diuji walk-forward per horizon — pakai untuk melihat arah (jangka pendek vs menengah), bukan angka pasti.</p>` : ""}
      <div id="mlFc"></div><div id="mlVal"></div><div id="mlNews"></div>`;
    renderForecast();
    drawChart("mlCal", { type: "scatter", data: { datasets: [{ label: "Terjadi", data: M.calib.map((c) => ({ x: c.pred * 100, y: c.act * 100 })), backgroundColor: css("--accent"), pointRadius: 6 },
        { label: "Sempurna", type: "line", data: [{ x: 0, y: 0 }, { x: 100, y: 100 }], borderColor: css("--muted"), borderDash: [4, 4], pointRadius: 0, borderWidth: 1 }] },
      options: baseOpts({ plugins: { legend: { display: false } }, scales: { x: { min: 0, max: 100, title: { display: true, text: "peluang dari model (%)" }, grid: { color: css("--grid") } }, y: { min: 0, max: 100, title: { display: true, text: "benar-benar naik (%)" }, grid: { color: css("--grid") } } } }) });
  }

  function renderForecast() {
    const M = act.ml; if (!M || M.error || !$("mlFc")) return; const F = M.fc, V = valEnsemble(), Nw = newsImpact(); act.val = V; act.news = Nw;
    if (F) { const b80 = F.bands[1], b90 = F.bands[2], b50 = F.bands[0], ok = (b) => Math.abs(b.cover - b.q) <= 0.06;
      $("mlFc").innerHTML = `<div class="subh">Prediksi harga ${M.H} hari bursa ke depan (model regresi + rentang conformal)</div>
        <div class="act-tiles"><div class="kpi hl"><div class="k">Titik tengah</div><div class="v">${fmtNum(F.px)}</div><div class="h">${spct(Math.exp(F.ret) - 1, 2)} dari ${fmtNum(state.res.s0)}</div></div>
          ${F.bands.map((b) => `<div class="kpi"><div class="k">Keyakinan ${pct(b.q, 0)}</div><div class="v">${fmtNum(b.lo)} – ${fmtNum(b.hi)}</div><div class="h">teruji: tepat ${pct(b.cover, 0)} kali ${ok(b) ? "✓" : "<b class='neg'>meleset</b>"}</div></div>`).join("")}
          <div class="kpi"><div class="k">Arah benar (OOS)</div><div class="v">${pct(F.dirHit, 0)}</div><div class="h">R² vs tebakan nol ${spct(F.r2, 1)}</div></div></div>
        <p class="note">Rentang dihitung dari kesalahan prediksi model di data yang belum pernah dilihatnya (split-conformal, dinormalkan volatilitas), lalu diuji di ${nf(0).format(F.nEval)} hari berikutnya — kolom "teruji" menunjukkan seberapa sering harga benar-benar jatuh di rentang itu. Titik tengah model <b>disusutkan ×${nf(2).format(F.shrink)}</b> ke arah "tidak berubah" sesuai bukti out-of-sample (0 = model diabaikan, 1 = dipakai penuh), sehingga tidak pernah lebih buruk dari tebakan "tidak berubah" secara rata-rata; di data uji R² ${spct(F.r2, 1)}.</p>`; }
    $("mlVal").innerHTML = !V ? '<p class="note">Valuasi gabungan muncul setelah data fundamental termuat (saham).</p>' : !V.methods.length ? '<p class="note">Data fundamental tidak cukup untuk valuasi gabungan.</p>' :
      `<div class="subh">Valuasi gabungan (${V.methods.length} metode) · biaya modal ${pct(V.ke, 1)} · pertumbuhan jangka panjang ${pct(V.g, 1)}</div>
      <div class="table-wrap"><table><thead><tr><th>Metode</th><th>Nilai wajar</th><th>vs harga</th></tr></thead><tbody>${V.methods.map(([nm, v]) => `<tr><td>${esc(nm)}</td><td>${fmtNum(v)}</td><td>${pc(v / state.res.s0 - 1)}</td></tr>`).join("")}
        <tr class="best"><td><b>Median gabungan</b></td><td><b>${fmtNum(V.med)}</b> <span class="note">(${fmtNum(V.lo)}–${fmtNum(V.hi)})</span></td><td>${pc(V.upside)}</td></tr></tbody></table></div>
      <p class="note">Harga sekarang ${V.side}. Kesepakatan antar-metode <b>${pct(V.agree, 0)}</b>, sebaran ${pct(V.cv, 0)} → keyakinan valuasi <b>${V.conf}</b>. Valuasi menjawab "murah atau mahal", bukan "kapan naik" — selisihnya bisa bertahan bertahun-tahun.</p>`;
    $("mlNews").innerHTML = !Nw ? '<p class="note">Dampak berita muncul setelah berita termuat (minimal 5 berita bertanggal).</p>' :
      `<div class="subh">Dampak berita terhadap harga (uji kejadian, ${Nw.nDays} hari berita, sumber arah: ${Nw.src})</div>
      <p>Hari berita positif → reaksi abnormal 3 hari rata-rata <b>${spct(Nw.pos.m, 2)}</b> (${Nw.pos.n} hari, t = ${nf(1).format(Nw.pos.t)}); hari berita negatif → <b>${spct(Nw.neg.m, 2)}</b> (${Nw.neg.n} hari, t = ${nf(1).format(Nw.neg.t)}).
      Sentimen 7 hari terakhir: <b class="${cls(Nw.net)}">${Nw.net > 0 ? "+" : ""}${Nw.net}</b> dari ${Nw.nRecent} berita. ${Nw.reliable ? `Polanya cukup kuat (|t| ≥ 2) → dampak yang diperkirakan <b>${spct(Nw.effect, 2)}</b>.` : "Polanya <b>belum cukup kuat</b> secara statistik (butuh ≥ 5 kejadian dan |t| ≥ 2), jadi berita tidak dipakai untuk menggeser prediksi."}</p>
      <p class="note">Berita belum dimasukkan ke pelatihan model karena riwayatnya hanya ±6 bulan; dipakai lewat uji kejadian ini dan dibaca AI. Jalankan "Analisis berita dengan AI" di kartu Berita untuk arah per berita yang lebih akurat dari kamus kata.</p>`;
  }
  // ---------- Rekam jejak: semua rencana dicatat lalu dinilai otomatis setelah jatuh tempo ----------
  const TRK = "sp_track";
  const trkLoad = () => { try { return JSON.parse(localStorage.getItem(TRK) || "[]"); } catch { return []; } };
  function trkSave(L, sync = true) { L = L.slice(-400); try { localStorage.setItem(TRK, JSON.stringify(L)); } catch { /* */ } if (sync) saveSettings({ track: L }); }
  function trkRecord(P) {
    const L = trkLoad(), s = state.data.symbol, d = state.data.dates[state.data.dates.length - 1];
    let e = L.find((x) => x.s === s && x.d === d);
    if (!e) { e = { s, d }; L.push(e); }
    Object.assign(e, { a: P.action, px: P.px, e: P.entry, st: P.stop, t1: P.t1, H: P.H, rv: P.review, cp: isFinite(P.confPct) ? +P.confPct.toFixed(3) : null,
      ml: P.ml ? +P.ml.p.toFixed(3) : null, mlH: P.ml ? P.ml.H : null, mlv: P.ml ? !!P.ml.valid : null, sd: P.atr / P.px * Math.sqrt(P.H), cost: stratOpts().costBps * 2e-4 });
    trkSave(L, false); return e; }
  function trkEval() {
    const L = trkLoad(), d = state.data, D = d.ohlc, last = D[D.length - 1][0]; let ch = false;
    for (const e of L) { if (e.s !== d.symbol || e.r) continue; const i0 = D.findIndex((b) => b[0] >= e.d); if (i0 < 0) continue;
      const iR = (() => { let k = -1; for (let i = i0; i < D.length; i++) if (D[i][0] <= e.rv) k = i; return k; })();
      // keluaran ML (horizon mlH) dinilai terpisah dan bisa jatuh tempo lebih dulu
      if (e.ml != null && e.mlUp == null && e.mlH && i0 + e.mlH < D.length) { e.mlUp = D[i0 + e.mlH][4] > D[i0][4] * (1 + e.cost) ? 1 : 0; ch = true; }
      if (e.rv > last || iR <= i0) continue;
      const cR = D[iR][4]; e.up = cR > e.px * (1 + e.cost) ? 1 : 0;
      if (e.a === "BELI") { let filled = false, out = null; for (let i = i0 + 1; i <= iR; i++) { const b = D[i]; if (!filled) { if (i <= i0 + 3 && b[3] <= e.e) filled = true; else continue; }
          if (b[4] <= e.st) { out = 0; break; } if (b[2] >= e.t1) { out = 1; break; } }
        e.r = filled ? "ok" : "skip"; e.ok = filled ? (out != null ? out : cR > e.e * (1 + e.cost) ? 1 : 0) : null; }
      else { e.r = "ok"; e.ok = e.a === "JUAL" ? (cR < e.px ? 1 : 0) : cR > e.px * (1 - e.sd) ? 1 : 0; }
      ch = true; }
    if (ch) trkSave(L);
  }
  function trkSummary() {
    const L = trkLoad(), R = L.filter((e) => e.r === "ok"), avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
    const C = R.filter((e) => e.cp != null), A = R.filter((e) => e.ai != null), Mv = L.filter((e) => e.mlUp != null);
    return { n: L.length, done: R.length, pending: L.filter((e) => !e.r).length, ok: avg(R.map((e) => e.ok)), cpPred: avg(C.map((e) => e.cp)), cpAct: avg(C.map((e) => e.ok)),
      aiPred: avg(A.map((e) => e.ai / 100)), aiAct: avg(A.map((e) => e.ok)), nAi: A.length, nMl: Mv.length, mlPred: avg(Mv.map((e) => e.ml)), mlAct: avg(Mv.map((e) => e.mlUp)),
      mlBrier: avg(Mv.map((e) => (e.ml - e.mlUp) ** 2)), mine: L.filter((e) => e.s === state.data.symbol).slice(-5).reverse() };
  }
  function drawTrack() {
    const S = trkSummary(), el = $("actTrack"); if (!el) return;
    const row = (e) => `<tr><td>${esc(e.d)}</td><td>${e.a}</td><td>${fmtNum(e.px)}</td><td>${e.cp != null ? pct(e.cp, 0) : "–"}</td><td>${e.ai != null ? e.ai + "%" : "–"}</td><td>${e.r === "ok" ? (e.ok ? '<span class="pos">benar</span>' : '<span class="neg">salah</span>') : e.r === "skip" ? '<span class="note">tidak terisi</span>' : `<span class="note">menunggu ${esc(e.rv)}</span>`}</td></tr>`;
    const Hh = act.hist, pc0 = (v) => (isFinite(v) ? pct(v, 0) : "–");
    const histHtml = !Hh ? "" : Hh.error ? `<p class="note">${esc(Hh.error)}</p>` : !Hh.n ? '<p class="note">Rekam jejak historis belum bisa dihitung (data terlalu pendek).</p>' :
      `<b>Rekam jejak historis</b> <span class="note">— aturan yang sama persis dijalankan tiap ${Hh.step} hari bursa sejak ${esc(Hh.from)}, hanya memakai data sampai tanggal itu, lalu dinilai ${act.plan.H} hari kemudian.</span><br>
      <b>${Hh.n}</b> rencana dinilai: benar <b>${pc0(Hh.ok)}</b> (BELI ${Hh.by.BELI.n}× benar ${pc0(Hh.by.BELI.ok)} · JUAL ${Hh.by.JUAL.n}× benar ${pc0(Hh.by.JUAL.ok)} · TAHAN ${Hh.by.TAHAN.n}× benar ${pc0(Hh.by.TAHAN.ok)})${Hh.skipped ? ` · ${Hh.skipped} order beli tidak terisi` : ""}.
      ${isFinite(Hh.cpPred) ? `Keyakinan yang dijanjikan rata-rata <b>${pc0(Hh.cpPred)}</b> vs kenyataan <b>${pc0(Hh.cpAct)}</b>${Math.abs(Hh.cpPred - Hh.cpAct) <= 0.05 ? " — <span class='pos'>angkanya jujur</span>" : Hh.cpPred > Hh.cpAct ? " — <span class='neg'>terlalu optimis, kurangi kepercayaan pada angka keyakinan</span>" : " — sedikit terlalu hati-hati"}.` : ""}
      <div class="table-wrap"><table><thead><tr><th>Keyakinan dijanjikan</th><th>Jumlah</th><th>Rata-rata dijanjikan</th><th>Benar-benar terjadi</th></tr></thead><tbody>${Hh.buckets.filter((b) => b.n).map((b) => `<tr><td>${pct(b.lo, 0)}–${pct(Math.min(1, b.hi), 0)}</td><td>${b.n}</td><td>${pc0(b.pred)}</td><td class="${b.act >= b.pred - 0.05 ? "pos" : "neg"}">${pc0(b.act)}</td></tr>`).join("")}</tbody></table></div>`;
    el.innerHTML = histHtml + `<div style="margin-top:8px"><b>Rekam jejak langsung</b> <span class="note">— rencana yang kamu lihat dicatat (tersimpan di akunmu) dan dinilai otomatis setelah tanggal evaluasinya lewat.</span></div>
      ${S.done ? `Selesai dinilai: <b>${S.done}</b> rencana, benar <b>${pct(S.ok, 0)}</b>.${isFinite(S.cpPred) ? ` Keyakinan yang dijanjikan rata-rata ${pct(S.cpPred, 0)} vs kenyataan ${pct(S.cpAct, 0)}.` : ""}${S.nAi ? ` AI: rata-rata yakin ${pct(S.aiPred, 0)} vs benar ${pct(S.aiAct, 0)} (${S.nAi} rencana)${S.aiPred - S.aiAct > 0.1 ? " — <b class='neg'>AI terlalu percaya diri</b>" : ""}.` : ""}` : `Belum ada rencana yang jatuh tempo (${S.pending} menunggu).`}
      ${S.nMl ? ` ML: rata-rata peluang ${pct(S.mlPred, 0)} vs benar-benar naik ${pct(S.mlAct, 0)} (${S.nMl} prediksi, Brier ${nf(3).format(S.mlBrier)}).` : ""}
      ${S.mine.length ? `<div class="table-wrap"><table><thead><tr><th>Tanggal</th><th>Aksi</th><th>Harga</th><th>Keyakinan</th><th>AI</th><th>Hasil</th></tr></thead><tbody>${S.mine.map(row).join("")}</tbody></table></div>` : ""}`;
  }

  // ---------- Aktifkan persetujuan admin: SQL siap salin + tutorial ----------
  const SQL_PATH = "supabase/migrations/20261021_sp_members_approval.sql", SQL_EDITOR = "https://supabase.com/dashboard/project/immvxirnxumsvjelbmum/sql/new";
  async function showApprovalSetup() {
    openFn("AKTIFKAN PERSETUJUAN ADMIN", `<p>Status sekarang: <b id="sqlState">${me && !me._nodb ? '<span class="pos">aktif</span>' : '<span class="neg">belum aktif</span> — siapa pun yang daftar bisa langsung masuk'}</b></p>
      <ol class="steps-ol">
        <li>Klik <b>Salin SQL</b> di bawah (seluruh kode langsung tersalin).</li>
        <li>Klik <b>Buka SQL Editor</b>. Login ke Supabase bila diminta — halaman query baru untuk project <b>my_pricess</b> terbuka.</li>
        <li>Klik di area editor, tempel (<b>Ctrl+V</b> / <b>Cmd+V</b>), lalu klik <b>Run</b> (atau <b>Ctrl+Enter</b>). Hasil yang benar: <i>Success. No rows returned</i>.</li>
        <li>Kalau muncul peringatan <i>"destructive operation"</i>, pilih <b>Run this query</b>. Yang dihapus hanya 4 aturan akses lama tabel pengaturan, dan langsung dibuat ulang di baris berikutnya — data tidak hilang.</li>
        <li>Kembali ke sini dan klik <b>Cek status</b>. Harus berubah jadi <b>aktif</b>, dan profilmu jadi <b>ADMIN</b>.</li>
        <li>Uji: buka jendela penyamaran, daftar dengan email lain. Akun itu tertahan di layar <i>Menunggu persetujuan</i> sampai kamu klik <b>Setujui</b> di <b>PROFIL</b> (klik namamu di kanan atas).</li>
      </ol>
      <div class="fn-actions"><button class="fn-key" id="sqlCopy">Salin SQL</button><a class="fn-key" href="${SQL_EDITOR}" target="_blank" rel="noopener">Buka SQL Editor ↗</a><button class="fn-key" id="sqlCheck">Cek status</button></div>
      <pre class="sql-box" id="sqlBox">Memuat…</pre>
      <p class="note">Aman dijalankan lebih dari sekali (memakai <code>if not exists</code> / <code>or replace</code>). Setelah aktif, akun lain yang sudah pernah login akan berstatus <i>menunggu</i> sampai kamu setujui. Kamu sendiri otomatis jadi admin.</p>`);
    let txt = ""; try { const r = await fetch(`${SQL_PATH}?t=${Date.now()}`); if (r.ok) txt = await r.text(); } catch { /* */ }
    $("sqlBox").textContent = txt || `Gagal memuat file. Buka langsung: https://github.com/lieonhs/simulasi-pasar/blob/main/${SQL_PATH}`;
    $("sqlCopy").onclick = async () => { try { await navigator.clipboard.writeText(txt); toast("SQL tersalin — tempel di SQL Editor lalu Run."); $("sqlCopy").textContent = "Tersalin ✓"; }
      catch { const r = document.createRange(); r.selectNodeContents($("sqlBox")); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); toast("Kode sudah terpilih — tekan Ctrl+C / Cmd+C."); } };
    $("sqlCheck").onclick = async () => { $("sqlCheck").disabled = true; try { me = await fetchMe(session); } catch (e) { toast(e.message || String(e)); }
      $("sqlCheck").disabled = false; const okk = me && !me._nodb;
      $("sqlState").innerHTML = okk ? `<span class="pos">aktif</span> · peranmu: ${me.role === "admin" ? "ADMIN" : esc(me.role)}` : '<span class="neg">belum aktif</span> — cek lagi apakah Run berhasil tanpa error merah';
      if (okk) { $("cmdUser").textContent = (me.name || (session.user.email || "").split("@")[0]).toUpperCase().slice(0, 18) + (me.role === "admin" ? " · ADMIN" : ""); if (me.role === "admin") refreshAdminBadge(); toast("Persetujuan admin aktif."); } };
  }

  // ---------- TradingView: grafik resmi (embed) dengan data dari TradingView ----------
  const TV_MAP = { "^JKSE": "IDX:COMPOSITE", "^JKLQ45": "IDX:LQ45", "^GSPC": "SP:SPX", "^IXIC": "NASDAQ:IXIC", "^DJI": "DJ:DJI", "IDR=X": "FX_IDC:USDIDR", "GC=F": "COMEX:GC1!", "CL=F": "NYMEX:CL1!", "^VIX": "CBOE:VIX", "^N225": "TVC:NI225", "^HSI": "TVC:HSI" };
  function tvSymbol(s) { s = String(s || "").toUpperCase(); if (TV_MAP[s]) return TV_MAP[s];
    let m = s.match(/^(.+)\.JK$/); if (m) return `IDX:${m[1]}`; m = s.match(/^([A-Z0-9]+)-USDT?$/); if (m) return `BINANCE:${m[1]}USDT`;
    m = s.match(/^([A-Z]{3})([A-Z]{3})=X$/); if (m) return `FX_IDC:${m[1]}${m[2]}`; return s.replace(/^\^/, ""); }
  const TV_IV = { "1m": "1", "5m": "5", "15m": "15", "30m": "30", "60m": "60", D: "D", W: "W", M: "M" };
  function tvMount(el, sym, interval = "D", opt = {}) {
    const dark = (document.documentElement.getAttribute("data-theme") || "pro") !== "light", key = `${sym}|${interval}|${dark}`; if (el.dataset.tv === key) return; el.dataset.tv = key; el.innerHTML = "";
    const box = document.createElement("div"); box.className = "tradingview-widget-container"; const w = document.createElement("div"); w.className = "tradingview-widget-container__widget"; box.appendChild(w);
    const sc = document.createElement("script"); sc.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js"; sc.async = true; sc.type = "text/javascript";
    sc.text = JSON.stringify({ autosize: true, symbol: tvSymbol(sym), interval, timezone: "Asia/Jakarta", theme: dark ? "dark" : "light", style: "1", locale: "id", backgroundColor: dark ? "#000000" : "#ffffff",
      allow_symbol_change: true, hide_side_toolbar: !!opt.compact, hide_top_toolbar: false, withdateranges: !opt.compact, details: false, calendar: false, save_image: true, studies: opt.studies || ["Volume@tv-basicstudies"], support_host: "https://www.tradingview.com" });
    box.appendChild(sc); el.appendChild(box); }
  function tvNoteFor(sym) { return /\.JK$|^\^JK/i.test(sym) ? "Grafik & data dari TradingView. Saham IDX di widget gratis <b>tertunda ±15 menit</b> (data real-time IDX hanya untuk pelanggan berbayar di situs TradingView). Kripto (Binance) real-time."
      : /-USDT?$/i.test(sym) ? "Grafik & data dari TradingView (Binance) — real-time, candle bergerak tiap transaksi." : "Grafik & data dari TradingView. Tingkat jeda tergantung bursa (lihat label di pojok grafik)."; }
  function setChartSrc(src, save = true) { const tv = src === "tv"; document.querySelectorAll("#srcTabs .tab").forEach((b) => b.classList.toggle("active", b.dataset.src === src));
    $("candle").hidden = tv; $("rsiWrap").hidden = tv; $("tvBox").hidden = !tv; $("tvNote").hidden = !tv; ["rgTabs", "indChecks", "ohlcLegend"].forEach((id) => { const e = $(id); if (e) e.style.display = tv ? "none" : ""; });
    if (tv && state.data) { tvMount($("tvBox"), state.data.symbol, TV_IV[state.tf] || "D"); $("tvNote").innerHTML = tvNoteFor(state.data.symbol); }
    if (!tv && state.lw) setTimeout(() => renderCandle(true), 30); if (save) try { localStorage.setItem("sp_chart_src", src); } catch { /* */ } state.chartSrc = src; }

  // =====================================================================
  // TERMINAL (mode Pro): banyak panel terhubung, data diperbarui tiap 15 detik
  // =====================================================================
  const tm = { q: {}, h: {}, sel: null, timer: null, sort: "pc", dir: -1, prev: {}, busy: false, at: 0 };
  const TM_MONT = [["^JKSE", "IHSG"], ["^JKLQ45", "LQ45"], ["^GSPC", "S&P 500"], ["^IXIC", "Nasdaq"], ["IDR=X", "USD/IDR"], ["GC=F", "Emas"], ["CL=F", "Minyak WTI"], ["BTC-USD", "Bitcoin"]];
  const TM_CLK = [["Jakarta", "Asia/Jakarta", 540, 960, "IDX"], ["Tokyo", "Asia/Tokyo", 540, 900], ["Hong Kong", "Asia/Hong_Kong", 570, 960], ["Singapura", "Asia/Singapore", 540, 1020],
    ["London", "Europe/London", 480, 990], ["New York", "America/New_York", 570, 960, "US"], ["Sydney", "Australia/Sydney", 600, 960]];
  const TM_PANELS = [["clk", "Jam dunia"], ["mont", "Montase kuotasi"], ["map", "Peta pasar"], ["mon", "Monitor"], ["foc", "Fokus"], ["sc", "Scatter risiko"], ["gr", "Grafik"], ["mov", "Penggerak"]];
  // kelompok aset di monitor Terminal (tidak hanya IHSG)
  const TM_GRP = { mix: ["Lintas aset", ["^JKSE", "^GSPC", "^IXIC", "^N225", "^HSI", "BBCA.JK", "BBRI.JK", "TLKM.JK", "AAPL", "NVDA", "MSFT", "TSLA", "BTC-USD", "ETH-USD", "SOL-USD", "GC=F", "CL=F", "IDR=X", "^TNX"]],
    wl: ["Watchlist", null], idx: ["IDX", null], us: ["AS", ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "AVGO", "JPM", "V", "LLY", "BRK-B", "NFLX", "AMD", "COST"]],
    crypto: ["Kripto", ["BTC-USD", "ETH-USD", "SOL-USD", "BNB-USD", "XRP-USD", "ADA-USD", "DOGE-USD", "AVAX-USD", "LINK-USD", "TON11419-USD", "DOT-USD", "TRX-USD"]],
    meme: ["Meme", ["DOGE-USD", "SHIB-USD", "PEPE-USDT", "WIF-USDT", "BONK-USDT", "FLOKI-USDT", "BOME-USDT", "TRUMP-USDT", "PNUT-USDT", "NEIRO-USDT", "TURBO-USDT", "PEOPLE-USDT"]],
    macro: ["Indeks · FX · Komoditas", ["^JKSE", "^GSPC", "^IXIC", "^DJI", "^N225", "^HSI", "^FTSE", "^GDAXI", "IDR=X", "EURUSD=X", "JPY=X", "SGDIDR=X", "GC=F", "SI=F", "CL=F", "BZ=F", "NG=F", "HG=F", "^TNX", "^VIX"]] };
  const TM_NAMES = { "^JKSE": "IHSG", "^JKLQ45": "LQ45", "^GSPC": "S&P 500", "^IXIC": "Nasdaq", "^DJI": "Dow Jones", "^N225": "Nikkei", "^HSI": "Hang Seng", "^FTSE": "FTSE 100", "^GDAXI": "DAX", "IDR=X": "USD/IDR", "EURUSD=X": "EUR/USD", "JPY=X": "USD/JPY", "SGDIDR=X": "SGD/IDR",
    "GC=F": "Emas", "SI=F": "Perak", "CL=F": "Minyak WTI", "BZ=F": "Brent", "NG=F": "Gas alam", "HG=F": "Tembaga", "^TNX": "US 10Y", "^VIX": "VIX", "TON11419-USD": "TON" };
  try { tm.grp = localStorage.getItem("sp_tm_grp") || "mix"; } catch { tm.grp = "mix"; }
  const tmWatch = () => { const g = tm.grp || "mix", list = g === "wl" ? $("wlQ").value.split(/[,\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean) : g === "idx" ? MK.stocks.slice(0, 30) : (TM_GRP[g] || TM_GRP.mix)[1]; return [...new Set(list)].slice(0, 30); };
  const tmName = (s) => TM_NAMES[s] || s.replace(/\.JK$/, "").replace(/-USDT?$/, "");
  function tmGrpBar() { const el = $("tmGrp"); if (!el) return; el.innerHTML = Object.entries(TM_GRP).map(([k, [n]]) => `<a data-tg="${k}" class="${k === (tm.grp || "mix") ? "on" : ""}">${n}</a>`).join(""); }
  const fx2 = (v) => (v == null || !isFinite(v) ? "–" : Math.abs(v) >= 1000 ? nf(0).format(v) : Math.abs(v) >= 10 ? nf(2).format(v) : nf(4).format(v));
  function tmLine(arr, w = 300, h = 70, col) { if (!arr || arr.length < 2) return ""; const mn = Math.min(...arr), mx = Math.max(...arr), sx = w / (arr.length - 1), sy = mx > mn ? (h - 6) / (mx - mn) : 0;
    const pts = arr.map((v, i) => `${(i * sx).toFixed(1)},${(h - 3 - (v - mn) * sy).toFixed(1)}`).join(" "), c = col || (arr[arr.length - 1] >= arr[0] ? "#19c37d" : "#ff4d4f");
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polygon points="0,${h} ${pts} ${w},${h}" fill="${c}" opacity=".12"/><polyline fill="none" stroke="${c}" stroke-width="1.4" points="${pts}" vector-effect="non-scaling-stroke"/></svg>`; }
  function tmStats(s) { const d = tm.h[s]; if (!d || !d.values || d.values.length < 30) return null; if (d._st) return d._st;
    const v = d.values, n = v.length, c = v[n - 1], r = (k) => (n > k ? c / v[n - 1 - k] - 1 : NaN), lr = []; for (let i = Math.max(1, n - 63); i < n; i++) lr.push(Math.log(v[i] / v[i - 1]));
    const ma = (k) => MCEngine.mean(v.slice(-k)), rsiA = (() => { let g = 0, l = 0; for (let i = n - 14; i < n; i++) { const x = v[i] - v[i - 1]; if (x > 0) g += x; else l -= x; } return 100 - 100 / (1 + g / (l || 1e-9)); })();
    const oh = d.ohlc || [], val = oh.length ? MCEngine.mean(oh.slice(-20).map((b) => (b[5] || 0) * b[4])) : 0, hi = Math.max(...v.slice(-252)), lo = Math.min(...v.slice(-252));
    const m20 = ma(20), m50 = ma(50), tr = c > m50 && m20 > m50 && rsiA < 75 ? "BELI" : c < m50 && m20 < m50 ? "JUAL" : "TAHAN";
    return (d._st = { r1m: r(21), r3m: r(63), vol: MCEngine.std(lr) * Math.sqrt(252), rsi: rsiA, val, hi, lo, pHi: c / hi - 1, tr, spark: v.slice(-63), six: v.slice(-126) }); }
  async function tmLoadHist(list) { await pool(list.filter((s) => !tm.h[s]), 4, async (s) => { try { tm.h[s] = await fetchSymbol(s, "1y"); } catch { tm.h[s] = { error: true }; } }); }
  async function tmRefresh(full = false) {
    if (tm.busy || $("termView").hidden) return; tm.busy = true;
    try { const W = tmWatch(), all = [...new Set([...W, ...TM_MONT.map((x) => x[0])])]; if (!tm.sel) tm.sel = (state.data && state.data.symbol) || W[0] || "^JKSE";
      const q = await quotesFor(all); for (const k in q) { tm.prev[k] = tm.q[k] ? tm.q[k].price : null; tm.q[k] = q[k]; } tm.at = Date.now();
      $("tmUpd").textContent = new Date().toLocaleTimeString("id-ID", { hour12: false });
      tmDraw(); if (full || Object.keys(tm.h).length < all.length) { await tmLoadHist([tm.sel, ...all]); tmDraw(); } }
    finally { tm.busy = false; } }
  // navigasi keyboard Terminal: ↑/↓ pilih baris monitor, Enter = analisis, Esc = kecilkan panel
  document.addEventListener("keydown", (e) => { if ($("termView").hidden || e.target.closest("input, textarea, select")) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { const rows = [...document.querySelectorAll("#tmMon tr[data-tl]")]; if (!rows.length) return; e.preventDefault();
      let i = rows.findIndex((r) => r.dataset.tl === tm.sel); i = Math.max(0, Math.min(rows.length - 1, i + (e.key === "ArrowDown" ? 1 : -1))); const s = rows[i].dataset.tl;
      rows.forEach((r) => r.classList.toggle("sel", r === rows[i])); rows[i].scrollIntoView({ block: "nearest" }); tmSelect(s); }
    else if (e.key === "Enter" && tm.sel) { e.preventDefault(); openDetail(tm.sel); }
    else if (e.key === "Escape") { document.querySelectorAll("#termView .tp.max").forEach((p) => p.classList.remove("max")); } });
  function tmDraw() { tmGrpBar(); tmClock(); tmMont(); tmMon(); tmMap(); tmGrid(); tmFocus(); tmScatter(); tmMovers(); $("tmLink").textContent = tm.sel || "—"; }
  function tmClock() { const now = new Date();
    $("tmClk").innerHTML = TM_CLK.map(([city, tz, o, c, mkt]) => { const f = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false }).formatToParts(now),
        g = (t) => (f.find((x) => x.type === t) || {}).value, hh = +g("hour") % 24, mm = +g("minute"), wd = g("weekday"), day = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now), min = hh * 60 + mm;
      const wk = !["Sat", "Sun"].includes(wd) && !(mkt && MCEngine.isHoliday(day, mkt)), st = wk && min >= o && min < c ? ["open", "BUKA"] : wk && min >= o - 60 && min < o ? ["pre", "PRA"] : ["closed", wk ? "TUTUP" : "LIBUR"];
      return `<div class="ck"><div><div class="t">${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}</div><div class="c">${city} · ${wd}</div></div><span class="st ${st[0]}">${st[1]}</span></div>`; }).join(""); }
  function tmMont() { $("tmMont").innerHTML = `<div class="mt-grid">${TM_MONT.map(([s, nm]) => { const q = tm.q[s], ch = qChg(q), k = !isFinite(ch) ? "flat" : ch > 0.0005 ? "up" : ch < -0.0005 ? "dn" : "flat";
      const fl = q && tm.prev[s] != null && q.price !== tm.prev[s] ? (q.price > tm.prev[s] ? "fl-u" : "fl-d") : "";
      return `<div class="mt ${k}" data-tl="${s}"><div class="n"><span>${nm}</span><span>${q && q.open ? "●" : ""}</span></div><div class="v ${fl}">${q ? fx2(q.price) : "…"}</div><div class="d ${ch >= 0 ? "tm-u" : "tm-d"}">${q && q.prevClose ? `${ch >= 0 ? "+" : ""}${fx2(q.price - q.prevClose)}  ${spct(ch, 2)}` : ""}</div></div>`; }).join("")}</div>`; }
  function tmRows() { return tmWatch().map((s) => { const q = tm.q[s], st = tmStats(s); return { s, q, st, px: q ? q.price : NaN, ch: q && q.prevClose ? q.price - q.prevClose : NaN, pc: qChg(q), vol: q ? q.volume : NaN,
      val: st ? st.val : NaN, r1m: st ? st.r1m : NaN, r3m: st ? st.r3m : NaN, v3: st ? st.vol : NaN, rsi: st ? st.rsi : NaN, phi: st ? st.pHi : NaN, tr: st ? st.tr : "" }; }); }
  function tmMon() { const R = tmRows(), k = tm.sort; R.sort((a, b) => ((isFinite(b[k]) ? b[k] : -1e99) - (isFinite(a[k]) ? a[k] : -1e99)) * (tm.dir < 0 ? 1 : -1));
    const C = [["s", "Ticker"], ["px", "Last"], ["ch", "Chg"], ["pc", "%Chg"], ["vol", "Volume"], ["val", "Nilai/hr"], ["r1m", "1B"], ["r3m", "3B"], ["v3", "Vol 3B"], ["rsi", "RSI"], ["phi", "vs 52mg"], ["tr", "Tren"], ["sp", "3 bulan"]];
    const cc = (v) => (!isFinite(v) ? "" : v > 0 ? "cu" : v < 0 ? "cd" : "");
    $("tmMon").innerHTML = `<table class="tm-t"><thead><tr>${C.map(([c, n]) => `<th data-ts="${c}">${n}${c === k ? (tm.dir < 0 ? " ▼" : " ▲") : ""}</th>`).join("")}</tr></thead><tbody>${R.map((r) => {
      const fl = r.q && tm.prev[r.s] != null && r.q.price !== tm.prev[r.s] ? (r.q.price > tm.prev[r.s] ? "fl-u" : "fl-d") : "";
      return `<tr data-tl="${r.s}" class="${r.s === tm.sel ? "sel" : ""}"><td><span class="sym">${esc(tmName(r.s))}</span></td><td class="${fl}">${fx2(r.px)}</td><td class="${r.ch >= 0 ? "u" : "d"}">${isFinite(r.ch) ? (r.ch > 0 ? "+" : "") + fx2(r.ch) : "–"}</td>
        <td class="${cc(r.pc)}">${spct(r.pc, 2)}</td><td>${big(r.vol)}</td><td>${big(r.val)}</td><td class="${cls(r.r1m)}">${spct(r.r1m, 1)}</td><td class="${cls(r.r3m)}">${spct(r.r3m, 1)}</td><td>${pct(r.v3, 0)}</td>
        <td class="${r.rsi > 70 ? "d" : r.rsi < 30 ? "u" : ""}">${isFinite(r.rsi) ? nf(0).format(r.rsi) : "–"}</td><td class="${cls(r.phi)}">${spct(r.phi, 1)}</td><td>${r.tr ? `<span class="sig-b ${r.tr === "BELI" ? "b" : r.tr === "JUAL" ? "s" : "h"}">${r.tr}</span>` : ""}</td>
        <td style="width:90px">${r.st ? tmLine(r.st.spark, 90, 18) : ""}</td></tr>`; }).join("")}</tbody></table>`; }
  function squarify(items, x, y, w, h) { // treemap "squarified" (Bruls dkk.)
    const out = [], total = items.reduce((a, b) => a + b.v, 0) || 1, sc = (w * h) / total; let rest = items.map((it) => ({ ...it, a: it.v * sc }));
    while (rest.length) { const short = Math.min(w, h); let row = [], best = Infinity;
      for (const it of rest) { const r2 = [...row, it], s2 = r2.reduce((a, b) => a + b.a, 0), worst = Math.max(...r2.map((z) => Math.max((short * short * z.a) / (s2 * s2), (s2 * s2) / (short * short * z.a)))); if (worst > best) break; best = worst; row = r2; }
      const s2 = row.reduce((a, b) => a + b.a, 0), th = s2 / short; let off = 0;
      for (const it of row) { const len = it.a / th; if (w >= h) out.push({ ...it, x, y: y + off, w: th, h: len }); else out.push({ ...it, x: x + off, y, w: len, h: th }); off += len; }
      if (w >= h) { x += th; w -= th; } else { y += th; h -= th; } rest = rest.slice(row.length); }
    return out; }
  function tmMap() { const el = $("tmMap"), W = el.clientWidth || 400, H = Math.max(180, el.clientHeight - 8);
    const eq = ["mix", "macro"].includes(tm.grp), fxr = (s) => (/\.JK$/.test(s) ? 1 : pp.fx || 16000); // campuran aset & mata uang: luas sama rata
    const R = tmRows().filter((r) => isFinite(r.pc)).map((r) => ({ s: r.s, pc: r.pc, v: eq ? 1 : isFinite(r.val) && r.val > 0 ? r.val * fxr(r.s) : 1 })).sort((a, b) => b.v - a.v);
    if (!R.length) { el.innerHTML = '<p class="tm-dim">Menunggu kuotasi…</p>'; return; } const sumV = R.reduce((a, b) => a + b.v, 0); R.forEach((r) => (r.v = Math.max(r.v, sumV * 0.01)));
    const col = (p) => { const k = Math.min(1, Math.abs(p) / 0.03); return p >= 0 ? `rgb(${Math.round(20 - 10 * k)},${Math.round(70 + 110 * k)},${Math.round(45 + 40 * k)})` : `rgb(${Math.round(80 + 150 * k)},${Math.round(30 - 10 * k)},${Math.round(35 - 10 * k)})`; };
    el.innerHTML = `<div class="tm-map" style="height:${H}px">${squarify(R, 0, 0, W - 8, H).map((b) => `<div data-tl="${b.s}" style="left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px;background:${col(b.pc)}">${b.w > 40 && b.h > 22 ? `<b>${esc(tmName(b.s))}</b>${spct(b.pc, 2)}` : ""}</div>`).join("")}</div>`; }
  function tmGrid() { if (tm.gm !== "grid") { const el = $("tmGr"); if (!el.querySelector(".tv-box")) el.innerHTML = '<div class="tv-box"></div>'; tvMount(el.querySelector(".tv-box"), tm.sel || "^JKSE", "5", { compact: true }); $("tmGrT").textContent = `TradingView · ${tvSymbol(tm.sel)} · 5 menit`; return; }
    $("tmGrT").textContent = "Grafik 6 bulan"; const L = [tm.sel, "^JKSE", "^GSPC", "IDR=X", "GC=F", "BTC-USD"].filter((s, i, a) => s && a.indexOf(s) === i).slice(0, 6);
    $("tmGr").innerHTML = `<div class="gr-grid">${L.map((s) => { const st = tmStats(s), q = tm.q[s], ch = st ? st.six[st.six.length - 1] / st.six[0] - 1 : NaN;
      return `<div class="gr" data-tl="${s}"><div class="h"><span>${esc(tmName(s))} ${q ? fx2(q.price) : ""}</span><span class="${ch >= 0 ? "tm-u" : "tm-d"}">6B ${spct(ch, 1)}</span></div>${st ? tmLine(st.six, 300, 70) : '<p class="tm-dim">memuat…</p>'}</div>`; }).join("")}</div>`; }
  function tmFocus() { const s = tm.sel; if (!s) return; const q = tm.q[s], st = tmStats(s), ch = qChg(q), P = act.plan && state.data && state.data.symbol === s ? act.plan : null, M = P && P.ml;
    $("tmFocT").textContent = `${s} · ${(tm.h[s] && tm.h[s].name) || ""}`;
    const kv = (k, v) => `<div><span>${k}</span><b>${v}</b></div>`;
    $("tmFoc").innerHTML = `<div class="foc-h"><span class="px">${q ? fx2(q.price) : "…"}</span><span class="${ch >= 0 ? "tm-u" : "tm-d"}">${spct(ch, 2)}</span>${P ? `<span class="foc-act ${P.action}">${P.action}</span><span class="tm-dim">keyakinan ${isFinite(P.confPct) ? pct(P.confPct, 0) : "–"}</span>` : ""}</div>
      ${st ? `<div class="gr" style="border:0;padding:0">${tmLine(st.six, 400, 60)}</div>` : ""}
      <div class="foc-kv">${P ? kv("Antre beli", fmtNum(P.entry)) + kv("Stop (tutup <)", fmtNum(P.stop)) + kv("Target 1 / 2", `${fmtNum(P.t1)} / ${fmtNum(P.t2)}`) + kv(`ML naik ${M ? M.H + "h" : ""}`, M ? `${pct(M.p, 0)} ${M.valid ? "✓" : "·"}` : "–") + kv("ML menang (TB)", M && M.tb ? `${pct(M.tb.p, 0)} ${M.tb.valid ? "✓" : "·"}` : "–") +
          kv("Prediksi 80%", act.ml && act.ml.fc ? `${fmtNum(act.ml.fc.bands[1].lo)}–${fmtNum(act.ml.fc.bands[1].hi)}` : "–") + kv("Evaluasi", fmtDay(P.review)) : ""}
        ${st ? kv("52 mg", `${fx2(st.lo)}–${fx2(st.hi)}`) + kv("RSI 14", nf(0).format(st.rsi)) + kv("Vol 3B", pct(st.vol, 0)) + kv("1 / 3 bulan", `${spct(st.r1m, 1)} / ${spct(st.r3m, 1)}`) : ""}</div>
      ${P ? "" : `<p class="tm-dim" style="margin:6px 0 0">Rencana aksi, ML & prediksi muncul setelah aset ini dianalisis.</p>`}
      <div class="fn-actions" style="margin-top:6px"><button class="tm-btn" data-cmd="${esc(s)}">ANALISIS F3 ⟶</button><button class="tm-btn" data-cmd="${esc(s)} ML">ML</button><button class="tm-btn" data-cmd="${esc(s)} STRAT">STRAT</button><button class="tm-btn" data-cmd="${esc(s)} BUY">BELI DEMO</button></div>
      ${state.news && state.data && state.data.symbol === s ? `<div class="tm-news">${state.news.slice(0, 5).map((x) => `<a href="${esc(x.link)}" target="_blank" rel="noopener">${esc(x.title)} <em>${esc(x.publisher || "")}</em></a>`).join("")}</div>` : ""}`; }
  function tmScatter() { const R = tmRows().filter((r) => isFinite(r.v3) && isFinite(r.r3m)); const el = $("tmSc"); if (R.length < 2) { el.innerHTML = '<p class="tm-dim">Memuat riwayat harga…</p>'; return; }
    const W = Math.max(260, el.clientWidth - 8), H = Math.max(180, el.clientHeight - 10), P = 26, xs = R.map((r) => r.v3), ys = R.map((r) => r.r3m), x0 = 0, x1 = Math.max(...xs) * 1.1, y0 = Math.min(0, ...ys) * 1.1, y1 = Math.max(0, ...ys) * 1.1 || 0.1;
    const X = (v) => P + ((v - x0) / (x1 - x0 || 1)) * (W - P - 6), Y = (v) => 6 + (1 - (v - y0) / (y1 - y0 || 1)) * (H - P - 6);
    el.innerHTML = `<div class="tm-sc"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><line x1="${P}" x2="${W}" y1="${Y(0)}" y2="${Y(0)}" stroke="#333"/><line x1="${P}" x2="${P}" y1="0" y2="${H - P}" stroke="#333"/>
      <text x="${W - 4}" y="${H - 8}" text-anchor="end">volatilitas 3 bln →</text><text x="${P + 4}" y="12">return 3 bln ↑</text>
      ${R.map((r) => `<g data-tl="${r.s}" style="cursor:pointer"><circle cx="${X(r.v3)}" cy="${Y(r.r3m)}" r="${r.s === tm.sel ? 6 : 4}" fill="${r.r3m >= 0 ? "#19c37d" : "#ff4d4f"}" stroke="${r.s === tm.sel ? "#ffa028" : "none"}" stroke-width="2"/><text x="${X(r.v3) + 6}" y="${Y(r.r3m) + 3}">${esc(tmName(r.s))}</text></g>`).join("")}</svg></div>`; }
  function tmMovers() { const R = tmRows().filter((r) => isFinite(r.pc)), up = R.slice().sort((a, b) => b.pc - a.pc).slice(0, 5), dn = R.slice().sort((a, b) => a.pc - b.pc).slice(0, 5);
    const sb = R.filter((r) => r.tr === "BELI"), ss = R.filter((r) => r.tr === "JUAL"), row = (r) => `<tr data-tl="${r.s}"><td><span class="sym">${esc(tmName(r.s))}</span></td><td>${fx2(r.px)}</td><td class="${r.pc >= 0 ? "cu" : "cd"}">${spct(r.pc, 2)}</td></tr>`;
    $("tmMov").innerHTML = `<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px">
      <div><div class="tm-amb">NAIK TERBESAR</div><table class="tm-t"><tbody>${up.map(row).join("")}</tbody></table></div>
      <div><div class="tm-amb">TURUN TERBESAR</div><table class="tm-t"><tbody>${dn.map(row).join("")}</tbody></table></div>
      <div><div class="tm-amb">TREN (MA20/50 + RSI)</div><p><span class="sig-b b">BELI</span> ${sb.map((r) => `<a href="#" data-tl="${r.s}" class="tm-u">${esc(tmName(r.s))}</a>`).join(" ") || "–"}</p>
        <p><span class="sig-b s">JUAL</span> ${ss.map((r) => `<a href="#" data-tl="${r.s}" class="tm-d">${esc(tmName(r.s))}</a>`).join(" ") || "–"}</p>
        <p class="tm-dim">Tren hanya filter cepat. Keputusan lengkap (50 strategi + ML + rencana harga) ada di Analisis → Rencana aksi.</p></div></div>`; }
  function tmSelect(s) { if (tm.sel === s) return; tm.sel = s; $("tmLink").textContent = s; // tabel tidak digambar ulang supaya klik ganda tetap kena barisnya
    document.querySelectorAll("#tmMon tr[data-tl]").forEach((r) => r.classList.toggle("sel", r.dataset.tl === s)); tmGrid(); tmFocus(); tmScatter();
    if (!tm.h[s]) tmLoadHist([s]).then(() => { tmGrid(); tmFocus(); }); }
  function tmPanelsMenu() { let off = []; try { off = JSON.parse(localStorage.getItem("sp_tm_off") || "[]"); } catch { /* */ }
    $("tmMenu").innerHTML = TM_PANELS.map(([k, n]) => `<label><input type="checkbox" data-pk="${k}" ${off.includes(k) ? "" : "checked"}> ${n}</label>`).join("");
    document.querySelectorAll("#tmGrid .tp").forEach((p) => p.classList.toggle("off", off.includes(p.dataset.tp))); }
  function tmStart() { tmPanelsMenu(); try { $("termView").classList.toggle("dense", localStorage.getItem("sp_tm_dense") === "1"); } catch { /* */ }
    tmRefresh(true); clearInterval(tm.timer); tm.timer = setInterval(() => { if ($("termView").hidden) { clearInterval(tm.timer); return; } tmRefresh(); }, 15000);
    clearInterval(tm.ck); tm.ck = setInterval(() => { if (!$("termView").hidden) tmClock(); }, 20000); }
  function bindTerm() {
    $("tmGrp").addEventListener("click", (e) => { const g = e.target.closest("[data-tg]"); if (!g) return; tm.grp = g.dataset.tg; try { localStorage.setItem("sp_tm_grp", tm.grp); } catch { /* */ } tm.sel = tmWatch()[0]; tmGrpBar(); tmDraw(); tmRefresh(true); });
    $("termView").addEventListener("click", (e) => { const th = e.target.closest("th[data-ts]"); if (th) { const k = th.dataset.ts; if (tm.sort === k) tm.dir *= -1; else { tm.sort = k; tm.dir = -1; } tmMon(); return; }
      const mx = e.target.closest(".tp-max"); if (mx) { const p = mx.closest(".tp"); p.classList.toggle("max"); mx.textContent = p.classList.contains("max") ? "×" : "□"; if (p.dataset.tp === "map") setTimeout(tmMap, 30); return; }
      if (e.target.closest("[data-cmd]")) return; const t = e.target.closest("[data-tl]"); if (t) { e.preventDefault(); tmSelect(t.dataset.tl); } });
    $("termView").addEventListener("dblclick", (e) => { const t = e.target.closest("[data-tl]"); if (t) runCommand(t.dataset.tl); });
    $("tmRefresh").onclick = () => { for (const k in tm.h) if (tm.h[k]) delete tm.h[k]._st; tmRefresh(true); };
    $("tmDense").onclick = () => { const on = $("termView").classList.toggle("dense"); try { localStorage.setItem("sp_tm_dense", on ? "1" : "0"); } catch { /* */ } setTimeout(tmMap, 30); };
    $("tmPanels").onclick = () => { $("tmMenu").hidden = !$("tmMenu").hidden; };
    try { tm.gm = localStorage.getItem("sp_tm_gm") || "tv"; } catch { tm.gm = "tv"; }
    document.querySelectorAll("#tmGrMode a").forEach((a) => a.classList.toggle("on", a.dataset.gm === tm.gm));
    $("tmGrMode").addEventListener("click", (e) => { const a = e.target.closest("a[data-gm]"); if (!a) return; e.stopPropagation(); tm.gm = a.dataset.gm; try { localStorage.setItem("sp_tm_gm", tm.gm); } catch { /* */ }
      document.querySelectorAll("#tmGrMode a").forEach((x) => x.classList.toggle("on", x === a)); $("tmGr").innerHTML = ""; tmGrid(); });
    $("tmMenu").addEventListener("change", () => { const off = [...document.querySelectorAll("#tmMenu input")].filter((i) => !i.checked).map((i) => i.dataset.pk); try { localStorage.setItem("sp_tm_off", JSON.stringify(off)); } catch { /* */ } tmPanelsMenu(); setTimeout(tmMap, 30); });
    window.addEventListener("resize", () => { if (!$("termView").hidden) { clearTimeout(tm.rz); tm.rz = setTimeout(tmMap, 150); } });
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
    $("coupon").addEventListener("input", () => (state.couponUser = true)); $("maturity").addEventListener("input", () => (state.matUser = true));
    ["bcY", "bcC", "bcM", "bcN", "bcTax"].forEach((id) => $(id).addEventListener("input", drawBondCalc));
    $("modelTabs").addEventListener("click", (e) => { const t = e.target.closest(".tab"); if (t) { state.sel = t.dataset.m; renderSelected(); runPlan(); renderCompare(); if (state.cmp) renderOptions(); } });
    $("fanMode").addEventListener("change", () => state.res && renderSelected());
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
    // pasar & portofolio
    $("mkRun").addEventListener("click", runMarket);
    $("mkMovTabs").addEventListener("click", (e) => { const t = e.target.closest(".tab[data-m]"); if (!t) return; mk.mov = t.dataset.m; document.querySelectorAll("#mkMovTabs .tab").forEach((x) => x.classList.toggle("active", x === t)); renderMovers(); });
    $("marketView").addEventListener("click", (e) => { const t = e.target.closest(".pf-sym[data-s]"); if (t) openDetail(t.dataset.s); });
    pfLoad(); renderPfList();
    attachAC($("pfSym"), { onPick: (sym) => { $("pfSym").value = sym; $("pfQtyLbl").textContent = /\.JK$/i.test(sym) ? "Jumlah (lot)" : "Jumlah (unit)"; $("pfAvg").focus(); } });
    $("pfSym").addEventListener("input", () => { $("pfQtyLbl").textContent = /\.JK$/i.test($("pfSym").value.trim()) ? "Jumlah (lot)" : "Jumlah (lot untuk saham IDX)"; });
    $("pfAdd").addEventListener("click", pfAdd);
    ["pfAvg", "pfQty"].forEach((id) => $(id).addEventListener("keydown", (e) => e.key === "Enter" && pfAdd()));
    $("pfRun").addEventListener("click", runPortfolio);
    $("pfCash").addEventListener("change", () => { pfSave(); if (pf.res) runPortfolio(); });
    $("pfList").addEventListener("click", (e) => { const d = e.target.closest("[data-del]"); if (d) { pf.list.splice(+d.dataset.del, 1); pfSave(); renderPfList(); return; }
      const ed = e.target.closest("[data-edit]"); if (ed) { const p = pf.list[+ed.dataset.edit]; $("pfSym").value = p.s; $("pfAvg").value = p.avg; $("pfQty").value = p.qty; } });
    $("pfOut").addEventListener("click", (e) => { const t = e.target.closest(".pf-sym[data-s]"); if (t) openDetail(t.dataset.s); });
    // AI & terminal
    $("aiRun").addEventListener("click", runAI);
    bindTerminal();
    // fokus
    $("focusBar").addEventListener("click", (e) => { const b = e.target.closest(".fchip"); if (b) setFocus(b.dataset.f); });
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
    $("mathDensTabs").addEventListener("click", (e) => { const t = e.target.closest(".tab[data-s]"); if (!t) return; state.mathLog = t.dataset.s === "log"; document.querySelectorAll("#mathDensTabs .tab").forEach((x) => x.classList.toggle("active", x === t)); renderMath(); });
    $("oscTabs").addEventListener("click", (e) => { const t = e.target.closest(".tab[data-o]"); if (!t) return; state.osc = t.dataset.o; if (state.lw) drawCandle(true); });
    let rz; addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => state.lw && renderCandle(), 200); });
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => state.res && render());
  }

  if (/[?&]debug\b/.test(location.search)) window.__sp = state;
  // ---------- login (Supabase Auth) ----------
  let settings = {}, saveTimer = null, booted = false;
  // Data tersimpan di akun (Supabase) → tetap ada saat login lagi / ganti perangkat.
  // Sebelum menulis, data belajar digabung dengan salinan di server supaya perangkat/tab lain tidak saling menimpa.
  let setAt = null; // updated_at server yang terakhir kita lihat
  const byKey = (A, B, key, pick) => { const m = new Map(); for (const x of A || []) m.set(key(x), x); for (const x of B || []) { const k = key(x), o = m.get(k); m.set(k, o && pick ? pick(o, x) : x); } return [...m.values()]; };
  function mergeLearn(srv, loc) { const out = { ...loc };
    if (srv.apMem || loc.apMem) out.apMem = byKey(srv.apMem, loc.apMem, (x) => x.s + "|" + x.d, (o, x) => (x.y == null && o.y != null ? o : x)).sort((p, q) => (p.d < q.d ? -1 : 1)).slice(-1500);
    if (srv.apLog || loc.apLog) out.apLog = byKey(srv.apLog, loc.apLog, (x) => x.t + "|" + x.s + "|" + x.m).sort((p, q) => (p.t < q.t ? 1 : -1)).slice(0, 200);
    if (srv.idxLedger || loc.idxLedger) out.idxLedger = byKey(srv.idxLedger, loc.idxLedger, (x) => x.id).sort((p, q) => p.t - q.t).slice(-4000);
    if (srv.amHist || loc.amHist) out.amHist = byKey(srv.amHist, loc.amHist, (x) => x.d, (o, x) => x).sort((p, q) => (p.d < q.d ? -1 : 1)).slice(-730);
    if (srv.paper && loc.paper && srv.paper.hist && loc.paper.hist) out.paper = { ...loc.paper, hist: byKey(srv.paper.hist, loc.paper.hist, (x) => x.id + "|" + x.side + "|" + (x.fillAt || x.t)).sort((p, q) => ((q.fillAt || q.t) > (p.fillAt || p.t) ? 1 : -1)).slice(0, 3000) };
    if (srv.autopilot && loc.autopilot && srv.autopilot.run && loc.autopilot.run && (srv.autopilot.run.n || 0) > (loc.autopilot.run.n || 0)) out.autopilot = { ...loc.autopilot, run: srv.autopilot.run };
    return out; }
  function saveSettings(patch) {
    settings = { ...settings, ...patch }; if (settings.paper && settings.paper.hist && settings.paper.hist.length > 3000) settings.paper.hist.length = 3000; if (!sb || !session) return;
    clearTimeout(saveTimer); saveTimer = setTimeout(async () => { try {
        const { data: cur } = await sb.from("sp_settings").select("data,updated_at").eq("user_id", session.user.id).maybeSingle();
        if (cur && cur.data && cur.updated_at && setAt && cur.updated_at > setAt) { settings = mergeLearn(cur.data, settings); learnReload(); } // ada tulisan dari perangkat/tab lain sejak kita terakhir lihat
        const now = new Date().toISOString(); await sb.from("sp_settings").upsert({ user_id: session.user.id, data: settings, updated_at: now }); setAt = now; } catch { /* */ } }, 1500);
  }
  function learnReload() { try { if (ap.cfg) { ap.mem = (settings.apMem || []).slice(); ap.expModel = null; ap.log = (settings.apLog || []).slice(0, 200); } if (pp.a && settings.paper && settings.paper.hist) pp.a.hist = settings.paper.hist; led.rows = null; } catch { /* */ } }
  async function pullSettings() { if (!sb || !session) return; try { const { data: cur } = await sb.from("sp_settings").select("data,updated_at").eq("user_id", session.user.id).maybeSingle();
      if (cur && cur.data && cur.updated_at && (!setAt || cur.updated_at > setAt)) { settings = mergeLearn(cur.data, settings); setAt = cur.updated_at; learnReload(); if (ap.cfg && !$("apPane").hidden) drawAp(); } } catch { /* */ } }
  async function loadSettings() {
    try { const { data } = await sb.from("sp_settings").select("data,updated_at").eq("user_id", session.user.id).maybeSingle(); settings = (data && data.data) || {}; setAt = (data && data.updated_at) || null; } catch { settings = {}; }
    if (settings.watchlist) $("wlQ").value = settings.watchlist;
    if (settings.quantlab) $("qlQ").value = settings.quantlab;
    if (settings.focus) setFocus(settings.focus, false);
    if (Array.isArray(settings.portfolio)) { pf.list = settings.portfolio.filter((p) => p && p.s && p.avg > 0 && p.qty > 0); try { localStorage.setItem(PF_KEY, JSON.stringify(pf.list)); } catch { /* */ } }
    if (settings.pfCash != null) $("pfCash").value = settings.pfCash;
    if (Array.isArray(settings.track)) { const L = trkLoad(), key = (e) => e.s + "|" + e.d, m = new Map(settings.track.map((e) => [key(e), e])); L.forEach((e) => { const o = m.get(key(e)); m.set(key(e), o && o.r && !e.r ? o : e); }); trkSave([...m.values()].sort((a, b) => (a.d < b.d ? -1 : 1)), false); }
    if (Array.isArray(settings.alerts)) { al.list = settings.alerts; try { localStorage.setItem(AL_KEY, JSON.stringify(al.list)); } catch { /* */ } updateAlBadge(); }
  }
  let authMode = "login";
  (() => { const ok = ["lieonhs.github.io", "localhost", "127.0.0.1"].includes(location.hostname) && (location.hostname !== "lieonhs.github.io" || location.pathname.startsWith("/simulasi-pasar")); if (!ok) setTimeout(() => { const el = $("authUrl"); if (el) { el.classList.add("bad"); el.innerHTML = `⚠ PERINGATAN: ini bukan alamat resmi (${esc(location.host)}). Alamat resmi hanya <b>lieonhs.github.io/simulasi-pasar</b>. Jangan masukkan password.`; } }, 0); })();
  function setAuthMode(m) { authMode = m; const L = { login: ["Masuk untuk melanjutkan", "Masuk"], signup: ["Buat akun baru", "Daftar"], reset: ["Kirim tautan atur ulang password ke email", "Kirim tautan"] }[m];
    $("authSub").textContent = L[0]; $("authBtn").textContent = L[1];
    $("authPass").hidden = $("authPassLbl").hidden = m === "reset";
    $("authPass").autocomplete = m === "signup" ? "new-password" : "current-password"; $("authPass").required = m === "login" || m === "signup";
    $("authNameBox").hidden = m !== "signup"; $("authToSignup").hidden = m === "signup"; $("authToReset").hidden = m === "reset"; $("authToLogin").hidden = m === "login"; $("authMsg").textContent = ""; }
  function showAuth(msg) { $("pendGate").hidden = true; $("authGate").hidden = false; $("userBox").hidden = true; stopLive(); if (msg) { $("authMsg").textContent = msg; $("authMsg").classList.add("err"); } }
  const authErr = (e) => { const m = (e && e.message) || String(e);
    return /Invalid login/i.test(m) ? "Email atau password salah." : /Email not confirmed/i.test(m) ? "Email belum dikonfirmasi — cek kotak masuk email kamu." : /already registered/i.test(m) ? "Email sudah terdaftar, silakan masuk." :
      /Password should/i.test(m) ? "Password minimal 6 karakter." : /rate limit/i.test(m) ? "Batas kirim email tercapai (Supabase bawaan ±2 email/jam). Coba lagi nanti." : /Signups not allowed|not found|User not found/i.test(m) ? "Email ini belum terdaftar." : m; };
  // ---------- keanggotaan: setiap akun harus disetujui admin ----------
  let me = null, authing = null;
  async function fetchMe(s) {
    const md = (s.user && s.user.user_metadata) || {};
    const { data, error } = await sb.rpc("sp_request_access", { p_name: md.name || null, p_reason: md.reason || null });
    if (error) { if (/function|schema cache|does not exist|PGRST202/i.test(error.message || "")) return { status: "approved", role: "user", email: s.user.email, _nodb: true }; throw error; }
    return data;
  }
  function showPending(m) {
    $("authGate").hidden = true; $("pendGate").hidden = false;
    const st = m.status, nm = m.name ? esc(m.name) + " · " : "";
    $("pendTitle").textContent = st === "pending" ? "Menunggu persetujuan admin" : st === "rejected" ? "Permintaan ditolak" : "Akses dicabut";
    $("pendText").innerHTML = `${nm}<b>${esc(m.email || "")}</b><br>` + (st === "pending" ? `Akunmu sudah terdaftar sejak ${esc(String(m.requested_at || "").slice(0, 10))}. Admin harus menyetujui dulu sebelum kamu bisa memakai RAM Capital. Halaman ini memeriksa otomatis tiap 30 detik.`
      : st === "rejected" ? "Admin menolak permintaanmu. Kamu bisa mengirim ulang dengan alasan yang lebih jelas." : "Admin mencabut aksesmu. Hubungi admin bila menurutmu ini keliru.");
    $("pendRe").hidden = st !== "rejected";
  }
  // admin/pemilik: pindahkan sesi ke localStorage supaya tetap masuk walau jendela ditutup (autopilot bisa lanjut saat web dibuka lagi)
  function keepOwnerSession() { if (!isOwner() || KEEP) return; try { localStorage.setItem("sp_keep", "1"); Object.keys(sessionStorage).filter((k) => /^sb-.*-auth-token/.test(k)).forEach((k) => localStorage.setItem(k, sessionStorage.getItem(k))); KEEP = true; } catch { /* */ } }
  async function onAuthed(s) {
    session = s; lastAct = Date.now();
    if (authing) return authing;
    authing = (async () => {
      try { me = await fetchMe(s); } catch (e) { authing = null; showAuth("Gagal memeriksa keanggotaan: " + (e.message || e)); return; }
      if (me.status !== "approved") { authing = null; showPending(me); clearTimeout(window.__pendT); window.__pendT = setTimeout(() => { if (!$("pendGate").hidden) onAuthed(session); }, 30000); return; }
      $("pendGate").hidden = true; keepOwnerSession(); await enterApp(s);
    })();
    return authing;
  }
  async function enterApp(s) {
    $("authGate").hidden = true; $("userBox").hidden = false; $("userEmail").textContent = s.user.email || "";
    $("cmdUser").textContent = (me.name || (s.user.email || "").split("@")[0]).toUpperCase().slice(0, 18) + (me.role === "admin" ? " · ADMIN" : "");
    if (me.role === "admin") refreshAdminBadge();
    if (me._nodb && isOwner()) setTimeout(() => toast("Persetujuan admin belum aktif — ketik SETUP di baris perintah (atau buka PROFIL) untuk SQL siap salin + langkahnya."), 2500);
    if (booted) return; booted = true;
    readUrl(); setMode(state.mode, true); bind(); wlLoad(); await loadSettings(); setRangeTabs(); bindComfort(); bindTrade(); bindStrat(); bindChat(); bindAction(); bindTerm(); bindRadar(); bindGems();
    const P = new URLSearchParams(location.search);
    if (P.get("s")) { setView("detail"); run(); } else if (!document.body.classList.contains("mode-simple") && !document.body.classList.contains("mode-quick")) setView("term"); else { setView("screen"); runWatchlist(); }
  }
  async function refreshAdminBadge() {
    try { const { data } = await sb.from("sp_members").select("user_id").eq("status", "pending"); const n = (data || []).length;
      $("cmdUser").classList.toggle("hot", n > 0); $("cmdUser").title = n ? `${n} permintaan menunggu persetujuanmu` : "Profil"; if (n) $("cmdUser").dataset.n = n; else delete $("cmdUser").dataset.n; } catch { /* */ }
  }
  async function showProfile() {
    if (!me) return; const th = document.documentElement.getAttribute("data-theme");
    let admin = "";
    if (me.role === "admin" && !me._nodb) {
      const { data, error } = await sb.from("sp_members").select("*").order("requested_at", { ascending: false });
      const L = data || [], cnt = (st) => L.filter((x) => x.status === st).length;
      const btn = (u, st, lbl) => `<button class="fn-key" data-mem="${esc(u)}" data-st="${st}">${lbl}</button>`;
      admin = `<div class="subh">Admin · anggota (${cnt("pending")} menunggu, ${cnt("approved")} disetujui)</div>${error ? `<p class="status err">${esc(error.message)}</p>` : ""}
        <div class="table-wrap"><table><thead><tr><th>Nama / email</th><th>Status</th><th>Peran</th><th>Daftar</th><th>Alasan</th><th>Aksi</th></tr></thead><tbody>${L.map((m) => `<tr><td><b>${esc(m.name || "–")}</b><div class="nm">${esc(m.email || "")}</div></td>
          <td><span class="pill ${m.status === "approved" ? "pos" : m.status === "pending" ? "sig" : "neg"}">${m.status === "approved" ? "disetujui" : m.status === "pending" ? "menunggu" : m.status === "rejected" ? "ditolak" : "dicabut"}</span></td>
          <td>${m.role}</td><td>${esc(String(m.requested_at || "").slice(0, 10))}</td><td class="txt">${esc(m.reason || "")}</td>
          <td>${m.user_id === session.user.id ? '<span class="note">kamu</span>' : (m.status !== "approved" ? btn(m.user_id, "approved", "Setujui") : btn(m.user_id, "revoked", "Cabut")) + (m.status === "pending" ? btn(m.user_id, "rejected", "Tolak") : "") +
            (m.status === "approved" ? `<button class="fn-key" data-mem="${esc(m.user_id)}" data-role="${m.role === "admin" ? "user" : "admin"}">${m.role === "admin" ? "Jadikan user" : "Jadikan admin"}</button>` : "")}</td></tr>`).join("")}</tbody></table></div>
        <p class="note">Akun yang belum disetujui tidak bisa memuat data apa pun (dicek juga di server, bukan hanya di layar).</p>`;
    }
    openFn("PROFIL", `<div class="fn-cols"><div class="kvs"><div class="subh">Akun</div>
        <div><span>Nama</span><b><input id="profName" value="${esc(me.name || "")}" maxlength="60" style="width:200px;padding:4px 8px"></b></div>
        <div><span>Email</span><b>${esc(session.user.email || "")}</b></div><div><span>Peran</span><b>${me.role === "admin" ? "Admin" : "Pengguna"}</b></div>
        <div><span>Status</span><b>${me._nodb ? `persetujuan belum aktif ${isOwner() ? '<button class="fn-key" data-cmd="SETUP">Aktifkan sekarang</button>' : ""}` : "disetujui"}</b></div><div><span>Terdaftar</span><b>${esc(String(me.requested_at || "").slice(0, 10) || "–")}</b></div>
        <div><span>Login terakhir</span><b>${esc(String(session.user.last_sign_in_at || "").slice(0, 16).replace("T", " "))}</b></div></div>
      <div class="kvs"><div class="subh">Tampilan & sesi</div><div><span>Tema</span><b>${["pro", "light", "terminal"].map((t) => `<button class="fn-key ${t === th ? "on" : ""}" data-theme-set="${t}">${THEME_LBL[t]}</button>`).join(" ")}</b></div>
        <div><span>Keluar otomatis</span><b>${isOwner() ? "tidak (admin tetap masuk di perangkat ini; keluar hanya lewat tombol Keluar)" : IDLE_MIN + " menit tidak aktif · saat jendela ditutup"}</b></div><div><span>Alarm aktif</span><b>${al.list.filter((a) => a.on).length}</b></div><div><span>Posisi portofolio</span><b>${pf.list.length}</b></div></div></div>
      <div class="fn-actions"><button class="fn-key" id="profSave">Simpan nama</button><button class="fn-key" data-cmd="HELP">HELP</button><button class="fn-key" id="profOut">Keluar</button></div>${admin}`);
  }
  function hideSplash() { const sp = $("splash"); if (!sp || sp.classList.contains("out")) return; sp.classList.add("out"); setTimeout(() => sp.remove(), 400); }
  setTimeout(hideSplash, 8000); // jaring pengaman bila jaringan lambat
  async function startAuth() {
    setAuthMode("login");
    $("authToSignup").onclick = (e) => { e.preventDefault(); setAuthMode("signup"); };
    $("authToReset").onclick = (e) => { e.preventDefault(); setAuthMode("reset"); };
    $("authToLogin").onclick = (e) => { e.preventDefault(); setAuthMode("login"); };
    $("pendCheck").onclick = (e) => { e.preventDefault(); $("pendMsg").textContent = "Memeriksa…"; onAuthed(session).then(() => { if (!$("pendGate").hidden) $("pendMsg").textContent = "Belum disetujui."; }); };
    $("pendOut").onclick = (e) => { e.preventDefault(); logout(); };
    $("pendSend").onclick = async () => { const { data, error } = await sb.rpc("sp_request_access", { p_name: null, p_reason: $("pendReason").value.trim() || "kirim ulang" }); $("pendMsg").textContent = error ? error.message : "Permintaan dikirim ulang."; if (data) showPending(data); };
    $("cmdUser").onclick = () => showProfile();
    const logout = async (why) => { try { await sb.auth.signOut(); } catch { /* */ } try { localStorage.removeItem("sp_keep"); Object.keys(localStorage).filter((k) => /^sb-.*-auth-token/.test(k)).forEach((k) => localStorage.removeItem(k)); } catch { /* */ } try { sessionStorage.clear(); if (why) sessionStorage.setItem("sp_logout_msg", why); } catch { /* */ } location.reload(); };
    $("logoutBtn").onclick = () => logout(); $("cmdLogout").onclick = () => logout();
    ["mousemove", "keydown", "click", "touchstart", "scroll"].forEach((ev) => addEventListener(ev, () => (lastAct = Date.now()), { passive: true }));
    setInterval(() => { if (session && $("authGate").hidden && !isOwner() && Date.now() - lastAct > IDLE_MIN * 60000) logout(`Kamu keluar otomatis karena tidak aktif ${IDLE_MIN} menit.`); }, 30000);
    if (closedBefore) setTimeout(() => { $("authMsg").textContent = "Jendela sebelumnya ditutup, jadi kamu sudah keluar. Silakan masuk lagi."; }, 0);
    try { const m = sessionStorage.getItem("sp_logout_msg"); if (m) { sessionStorage.removeItem("sp_logout_msg"); setTimeout(() => { $("authMsg").textContent = m; }, 0); } } catch { /* */ }
    $("authForm").onsubmit = async (e) => { e.preventDefault(); const email = $("authEmail").value.trim(), pass = $("authPass").value, msg = $("authMsg");
      msg.classList.remove("err"); msg.textContent = "Memproses…"; $("authBtn").disabled = true;
      try {
        if (authMode === "login") { const { data, error } = await sb.auth.signInWithPassword({ email, password: pass }); if (error) throw error; msg.textContent = "";
          await onAuthed(data.session); }
        else if (authMode === "signup") { if (!$("authName").value.trim()) throw new Error("Isi nama dulu supaya admin tahu siapa kamu.");
          const { data, error } = await sb.auth.signUp({ email, password: pass, options: { emailRedirectTo: location.origin + location.pathname, data: { name: $("authName").value.trim(), reason: $("authReason").value.trim() } } }); if (error) throw error;
          if (data.session) await onAuthed(data.session); else { msg.textContent = "Akun dibuat. Cek email kamu untuk konfirmasi, lalu masuk."; setTimeout(() => setAuthMode("login"), 50); } }
        else { const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }); if (error) throw error; msg.textContent = "Tautan atur ulang password sudah dikirim ke email kamu."; }
      } catch (err) { msg.textContent = authErr(err); msg.classList.add("err"); }
      finally { $("authBtn").disabled = false; } };
    if (!sb) { hideSplash(); showAuth("Gagal memuat modul login. Periksa koneksi lalu muat ulang."); return; }
    sb.auth.onAuthStateChange(async (ev, s) => {
      if (KEEP && s) setTimeout(() => { try { Object.keys(sessionStorage).filter((k) => /^sb-.*-auth-token/.test(k)).forEach((k) => localStorage.setItem(k, sessionStorage.getItem(k))); } catch { /* */ } }, 0); // salinan sesi admin selalu terbaru
      if (ev === "PASSWORD_RECOVERY") { const np = prompt("Masukkan password baru (min. 6 karakter):"); if (np) { const { error } = await sb.auth.updateUser({ password: np }); alert(error ? authErr(error) : "Password berhasil diganti."); } }
      if (s) { session = s; if (!booted) onAuthed(s); } else if (ev === "SIGNED_OUT") { $("pendGate").hidden = true; showAuth(); }
    });
    const { data } = await sb.auth.getSession();
    if (data.session) { try { await onAuthed(data.session); } finally { hideSplash(); } } else { showAuth(); hideSplash(); }
  }
  startAuth();
})();
