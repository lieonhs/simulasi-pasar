/* RAM Capital · inti: utilitas, state, worker, data, grafik, render utama
   Semua file js/ berbagi satu lingkup global (skrip biasa, dimuat berurutan). Jangan diubah jadi modul tanpa menyesuaikan impor. */
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
  let refreshing = null; const refreshOnce = () => (refreshing || (refreshing = sb.auth.refreshSession().finally(() => setTimeout(() => (refreshing = null), 3000)))); // satu pembaruan untuk semua permintaan paralel
  async function apiFetch(url, opt = {}) {
    if (sb) { const { data } = await sb.auth.getSession(); session = data.session; }
    // token hampir kedaluwarsa (< 2 menit) → perbarui dulu, supaya server tidak menolak karena selisih jam
    if (sb && session && session.expires_at && session.expires_at * 1000 - Date.now() < 120e3) { try { const { data } = await refreshOnce(); if (data && data.session) session = data.session; } catch { /* */ } }
    const hdr = () => ({ ...(opt.headers || {}), apikey: SB_KEY, ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) });
    let r = await fetch(url, { ...opt, headers: hdr() });
    if (r.status === 401 && sb) { // 401 sering hanya sementara (token baru diganti, server sibuk): perbarui sesi lalu coba sekali lagi
      try { const { data } = await refreshOnce(); if (data && data.session) { session = data.session; r = await fetch(url, { ...opt, headers: hdr() }); } } catch { /* */ }
      if (r.status === 401) { let still = null; try { still = (await sb.auth.getUser()).data.user; } catch { /* */ }
        if (!still) showAuth("Sesi berakhir, silakan masuk lagi."); // hanya bila sesi benar-benar tidak berlaku lagi
      } }
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

