/* app.js — UI, ambil data, chart */
(() => {
  "use strict";
  const API = "https://immvxirnxumsvjelbmum.supabase.co/functions/v1/market-data";
  const PRESETS = {
    price: [["BTC-USD", "Bitcoin"], ["ETH-USD", "Ethereum"], ["^JKSE", "IHSG"], ["BBCA.JK", "BCA"], ["TLKM.JK", "Telkom"], ["GC=F", "Emas"], ["IDR=X", "USD/IDR"], ["^GSPC", "S&P 500"]],
    bond: [["^TNX", "US 10Y"], ["^FVX", "US 5Y"], ["^TYX", "US 30Y"], ["^IRX", "US 13W"]],
  };
  const $ = (id) => document.getElementById(id);
  const state = { mode: "price", symbol: "BTC-USD", data: null, res: null, sel: null, charts: {}, csv: null, runId: 0 };

  // ---------- format ----------
  const nf = (d) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: d, minimumFractionDigits: d });
  function fmtNum(v) { if (!isFinite(v)) return "–"; const a = Math.abs(v); return nf(a >= 1000 ? 0 : a >= 10 ? 2 : a >= 1 ? 3 : 4).format(v); }
  const pct = (v, d = 1) => (isFinite(v) ? nf(d).format(v * 100) + "%" : "–");
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

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
    document.querySelectorAll(".seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.mode === m));
    document.querySelectorAll(".price-only").forEach((el) => (el.hidden = m !== "price"));
    document.querySelectorAll(".bond-only").forEach((el) => (el.hidden = m !== "bond"));
    $("customWrap").hidden = m !== "price" || $("drift").value !== "custom";
    if (!keepSymbol) { state.symbol = PRESETS[m][0][0]; state.csv = null; }
    $("q").value = state.symbol;
    $("chips").innerHTML = PRESETS[m].map(([s, n]) => `<button class="chip" data-s="${esc(s)}">${esc(n)}</button>`).join("");
  }

  // ---------- pencarian ----------
  let searchTimer = null, suggIdx = -1;
  function showSugg(list) {
    const ul = $("sugg");
    if (!list.length) { ul.hidden = true; return; }
    suggIdx = -1;
    ul.innerHTML = list.map((q) => `<li data-s="${esc(q.symbol)}"><b>${esc(q.symbol)}</b><span>${esc(q.name)} · ${esc(q.exch)}</span></li>`).join("");
    ul.hidden = false;
  }
  async function search(q) {
    try {
      const r = await fetch(`${API}?action=search&q=${encodeURIComponent(q)}`);
      const j = await r.json();
      if ($("q").value.trim() === q) showSugg(j.quotes || []);
    } catch { /* abaikan */ }
  }
  function pick(sym) { state.symbol = sym.toUpperCase(); state.csv = null; $("q").value = state.symbol; $("sugg").hidden = true; }

  // ---------- data ----------
  const cache = new Map();
  async function loadData() {
    if (state.csv) return state.csv;
    const range = $("range").value, key = `${state.symbol}|${range}`;
    if (cache.has(key)) return cache.get(key);
    const r = await fetch(`${API}?symbol=${encodeURIComponent(state.symbol)}&range=${range}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error(j.error || `Gagal ambil data (${r.status})`);
    const d = { name: j.name, symbol: j.symbol, currency: j.currency, type: j.type, source: j.source, dates: j.rows.map((x) => x[0]), values: j.rows.map((x) => x[1]) };
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
    return { name, symbol: name, currency: "", type: "", source: "CSV", dates: idx.map((i) => dates[i]), values: idx.map((i) => values[i]) };
  }

  // ---------- worker ----------
  let worker = null;
  try { worker = new Worker("worker.js"); } catch { worker = null; }
  function compute(cfg, onProgress) {
    if (!worker) return new Promise((res, rej) => setTimeout(() => { try { res(cfg.mode === "bond" ? MCEngine.runBond(cfg, onProgress) : MCEngine.runPrice(cfg, onProgress)); } catch (e) { rej(e); } }, 30));
    const id = ++state.runId;
    return new Promise((resolve, reject) => {
      worker.onmessage = (e) => {
        if (e.data.id !== id) return;
        if (e.data.type === "progress") onProgress(e.data.msg, e.data.frac);
        else if (e.data.type === "done") resolve(e.data.res);
        else reject(new Error(e.data.msg));
      };
      worker.onerror = (e) => { worker = null; reject(new Error(e.message || "Worker error")); };
      worker.postMessage({ id, cfg });
    });
  }

  // ---------- jalankan ----------
  function status(msg, err) { $("status").textContent = msg; $("status").classList.toggle("err", !!err); }
  async function run() {
    const btn = $("run"); btn.disabled = true; $("barFill").style.width = "5%";
    try {
      const typed = $("q").value.trim();
      if (typed && !state.csv && typed.toUpperCase() !== state.symbol) state.symbol = typed.toUpperCase();
      status("Mengambil data " + state.symbol + "…");
      const d = await loadData();
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
        cfg = { mode: "price", prices: d.values, dates: d.dates, type: d.type, days, sims, models, drift: $("drift").value, customDrift: (parseFloat($("customDrift").value) || 0) / 100, backtest: bt, seed: 42 };
      }
      if (d.values.length < 300 && bt) status("Data < 300 observasi: hasil backtest kurang andal.");
      const t0 = performance.now();
      const res = await compute(cfg, (msg, f) => { status(msg); $("barFill").style.width = Math.round(10 + 85 * f) + "%"; });
      state.res = res; state.cfg = cfg;
      state.sel = pickBest(res) || Object.keys(res.models)[0];
      render();
      writeUrl();
      $("barFill").style.width = "100%";
      status(`Selesai dalam ${((performance.now() - t0) / 1000).toFixed(1)} detik · ${d.values.length.toLocaleString("id-ID")} observasi · sumber ${d.source}`);
      $("out").hidden = false;
      setTimeout(() => ($("barFill").style.width = "0"), 600);
    } catch (e) {
      status(e.message || String(e), true); $("barFill").style.width = "0";
    } finally { btn.disabled = false; }
  }
  function pickBest(res) {
    let best = null, err = Infinity;
    for (const [k, m] of Object.entries(res.models)) if (m.backtest && m.backtest.calibErr < err) { err = m.backtest.calibErr; best = k; }
    return best;
  }

  // ---------- render ----------
  function futureDates(last, n, ppy) {
    const out = []; const d = new Date(last + "T00:00:00Z");
    while (out.length < n) { d.setUTCDate(d.getUTCDate() + 1); const wd = d.getUTCDay(); if (ppy === 365 || (wd !== 0 && wd !== 6)) out.push(d.toISOString().slice(0, 10)); }
    return out;
  }
  function render() {
    const { res, data: d, cfg } = state, bond = res.mode === "bond";
    $("asset").textContent = d.name || d.symbol;
    const lastDate = d.dates[d.dates.length - 1];
    $("assetMeta").textContent = `${d.symbol}${d.currency ? " · " + d.currency : ""} · data s/d ${lastDate} · ${bond ? "yield" : "harga"}`;
    $("lastPx").textContent = bond ? pct(res.y0, 2) : fmtNum(res.s0);

    const k = bond
      ? [["Harga obligasi kini", fmtNum(res.p0), `kupon ${pct(cfg.coupon, 2)} · ${cfg.maturity} th`], ["Vol yield / tahun", nf(0).format(res.stats.volBpAnn) + " bp", "dari perubahan harian"],
         ["Rentang historis", `${pct(res.stats.min, 2)} – ${pct(res.stats.max, 2)}`, `${res.nObs} observasi`], ["Horizon", `${cfg.days} hari bursa`, "≈ " + nf(1).format(cfg.days / 21) + " bulan"]]
      : [["Volatilitas tahunan", pct(res.stats.volAnn), "historis"], ["Return tahunan hist.", pct(res.stats.retAnn), `drift dipakai: ${pct(res.stats.muUsed)}`],
         ["Excess kurtosis", nf(1).format(res.stats.exKurt), res.stats.exKurt > 3 ? "ekor gemuk — crash lebih sering dari normal" : "mendekati normal"],
         ["Max drawdown", pct(res.stats.maxDD), "dalam data historis"], ["Horizon", `${cfg.days} ${res.ppy === 365 ? "hari" : "hari bursa"}`, `skew ${nf(2).format(res.stats.skew)}`]];
    $("kpis").innerHTML = k.map(([a, b, c]) => `<div class="kpi"><div class="k">${a}</div><div class="v">${b}</div><div class="h">${c}</div></div>`).join("");

    $("modelTabs").innerHTML = Object.entries(res.models).map(([key, m]) => `<button class="tab ${key === state.sel ? "active" : ""}" data-m="${key}">${esc(m.label)}</button>`).join("");
    renderSummary(); renderConfidence(); renderParams(); renderCaveats(); renderSelected();
  }

  function renderSelected() {
    const { res, data: d } = state, bond = res.mode === "bond", m = res.models[state.sel];
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.m === state.sel));
    $("fanTitle").textContent = `Proyeksi ${bond ? "yield" : "harga"} · ${m.label}`;
    const days = m.fan[0].length, histN = Math.min(d.values.length, Math.max(60, days * 3)); // proporsional agar proyeksi terbaca
    const med = d.values.slice().sort((a, b) => a - b)[d.values.length >> 1];
    const scale = bond && med <= 0.5 ? 100 : 1; // yield ditampilkan dalam persen
    const hd = d.dates.slice(-histN), hv = d.values.slice(-histN).map((v) => v * scale);
    const labels = hd.concat(futureDates(hd[hd.length - 1], days, res.ppy || 252));
    const pad = (arr, start) => new Array(histN - 1).fill(null).concat([start], arr);
    const s0 = bond ? res.y0 * 100 : res.s0;
    const [p5, p10, p25, p50, p75, p90, p95] = m.fan;
    const acc = css("--accent"), soft = css("--accent-soft"), mid = css("--accent-mid"), ink = css("--hist"), grid = css("--line"), muted = css("--muted");
    const ds = [
      { label: "Historis", data: hv.concat(new Array(days).fill(null)), borderColor: ink, borderWidth: 1.4, pointRadius: 0 },
      { label: "P5", data: pad(p5, s0), borderColor: "transparent", pointRadius: 0 },
      { label: "P95", data: pad(p95, s0), borderColor: "transparent", backgroundColor: soft, fill: "-1", pointRadius: 0 },
      { label: "P25", data: pad(p25, s0), borderColor: "transparent", pointRadius: 0 },
      { label: "P75", data: pad(p75, s0), borderColor: "transparent", backgroundColor: mid, fill: "-1", pointRadius: 0 },
      { label: "Median", data: pad(p50, s0), borderColor: acc, borderWidth: 2, pointRadius: 0 },
    ];
    if ($("showPaths").checked) m.samplePaths.forEach((p) => ds.push({ label: "path", data: pad(p, s0), borderColor: muted, borderWidth: 0.6, pointRadius: 0, borderDash: [] , _path: true }));
    drawChart("fan", { type: "line", data: { labels, datasets: ds },
      options: baseOpts(grid, muted, { plugins: { legend: { display: false }, tooltip: { mode: "index", intersect: false, filter: (i) => !i.dataset._path && i.raw != null,
        callbacks: { label: (c) => `${c.dataset.label}: ${bond ? nf(2).format(c.raw) + "%" : fmtNum(c.raw)}` } } },
        scales: { x: { ticks: { maxTicksLimit: 6, color: muted }, grid: { display: false } }, y: { ticks: { color: muted, callback: (v) => (bond ? v + "%" : fmtNum(v)) }, grid: { color: grid } } } }) });

    $("histTitle").textContent = `Histogram ${bond ? "harga obligasi" : "harga"} akhir horizon · ${m.label}`;
    const ref = bond ? res.p0 : res.s0;
    drawChart("hist", { type: "bar", data: { labels: m.hist.edges.map((v) => fmtNum(v)), datasets: [{ data: m.hist.counts, backgroundColor: m.hist.edges.map((v) => (v < ref ? css("--bad") : acc)), borderWidth: 0, barPercentage: 1, categoryPercentage: 1 }] },
      options: baseOpts(grid, muted, { plugins: { legend: { display: false }, tooltip: { callbacks: { title: (c) => "≈ " + c[0].label, label: (c) => c.raw + " path" } } },
        scales: { x: { ticks: { maxTicksLimit: 6, color: muted }, grid: { display: false } }, y: { display: false } } }) });
  }

  function renderSummary() {
    const { res } = state, keys = Object.keys(res.models), M = res.models;
    const head = `<thead><tr><th></th>${keys.map((k) => `<th>${esc(M[k].label)}</th>`).join("")}</tr></thead>`;
    let rows;
    if (res.mode === "bond") {
      rows = [["Yield P5", (m) => pct(m.yq[0], 2)], ["Yield median", (m) => pct(m.yq[3], 2)], ["Yield P95", (m) => pct(m.yq[6], 2)],
        ["Harga P5", (m) => fmtNum(m.pq[0])], ["Harga median", (m) => fmtNum(m.pq[3])], ["Harga P95", (m) => fmtNum(m.pq[6])],
        ["Total return median", (m) => pct(m.trMedian, 2)], ["Prob. rugi (incl. kupon)", (m) => pct(m.probLoss)], ["VaR 95% (total return)", (m) => pct(m.var95, 2)], ["Prob. yield < 0", (m) => pct(m.negProb)]];
    } else {
      rows = [["P5 (pesimis)", (m) => fmtNum(m.summary.q[0])], ["P25", (m) => fmtNum(m.summary.q[2])], ["Median", (m) => fmtNum(m.summary.q[3])], ["P75", (m) => fmtNum(m.summary.q[4])],
        ["P95 (optimis)", (m) => fmtNum(m.summary.q[6])], ["Prob. turun", (m) => pct(m.summary.probDown)], ["Prob. turun > 10%", (m) => pct(m.summary.probDown10)],
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
      ...entries.map(([k, m], i) => ({ label: m.label, data: m.backtest.cov.map((c) => c.actual * 100), backgroundColor: ["#1f5eff", "#0f8a5f", "#b86e00", "#8b3fd9"][i % 4], borderWidth: 0 })) ] },
      options: baseOpts(grid, muted, { plugins: { legend: { labels: { color: muted, boxWidth: 10, font: { size: 11 } } }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${nf(0).format(c.raw)}%` } } },
        scales: { x: { ticks: { color: muted }, grid: { display: false }, title: { display: true, text: "Rentang kepercayaan (target)", color: muted } }, y: { min: 0, max: 100, ticks: { color: muted, callback: (v) => v + "%" }, grid: { color: grid } } } }) });
    $("confNote").textContent = `Cara baca: model di-fit ulang hanya dengan data sebelum tiap titik uji, lalu dicek apakah ${unit} ${cfg.days} periode kemudian jatuh di dalam rentang. ` +
      `Kolom “Tembus P5” idealnya ≈ 5%. Bias > 0 = nilai aktual cenderung di atas median model, < 0 = di bawahnya.` +
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
      else if (cfg.drift === "zero") L.push("Drift diset nol: simulasi hanya mengukur <b>lebar risiko</b>, tidak berasumsi arah naik/turun.");
      L.push("GARCH memprediksi <b>volatilitas</b>, bukan arah harga. Nilai tambahnya ada di lebar rentang yang menyesuaikan kondisi pasar saat ini.");
      if (res.stats.exKurt > 3 && cfg.models.includes("gbm")) L.push("Data berekor gemuk (kurtosis tinggi). GBM mengasumsikan distribusi normal, jadi cenderung meremehkan crash — bandingkan dengan GARCH-t/Jump di tabel keyakinan.");
      L.push("Semua model berasumsi pola historis berlanjut. Regime baru (krisis, regulasi, halving, suku bunga) tidak tertangkap.");
    } else {
      L.push("Vasicek/CIR adalah model 1 faktor: seluruh kurva yield dianggap bergerak bersama. Kalibrasi OLS cenderung melebih-lebihkan kecepatan mean-reversion, sehingga rentang jangka panjang bisa terlalu sempit.");
      L.push("Yield SBN Indonesia tidak tersedia di Yahoo Finance. Upload CSV (tanggal, yield %) dari PHEI/investing.com untuk obligasi Indonesia.");
      L.push("Harga obligasi dihitung dari yield akhir dengan sisa tenor dikurangi horizon; spread kredit & likuiditas diabaikan.");
    }
    if (res.nObs < 500) L.push(`Data hanya ${res.nObs} observasi — estimasi parameter dan backtest kurang stabil.`);
    $("caveats").innerHTML = L.map((x) => `<li>${x}</li>`).join("");
  }

  function baseOpts(grid, muted, extra) {
    return Object.assign({ responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: "index", intersect: false },
      font: { family: "IBM Plex Sans" } }, extra);
  }
  function drawChart(id, cfg) { if (state.charts[id]) state.charts[id].destroy(); state.charts[id] = new Chart($(id), cfg); }

  // ---------- event ----------
  function bind() {
    document.querySelectorAll(".seg-btn").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
    $("chips").addEventListener("click", (e) => { const s = e.target.closest(".chip"); if (s) { pick(s.dataset.s); run(); } });
    $("q").addEventListener("input", (e) => { const v = e.target.value.trim(); clearTimeout(searchTimer); if (v.length < 2) { $("sugg").hidden = true; return; } searchTimer = setTimeout(() => search(v), 300); });
    $("q").addEventListener("keydown", (e) => {
      const items = [...$("sugg").querySelectorAll("li")];
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { if (!items.length || $("sugg").hidden) return; e.preventDefault(); suggIdx = (suggIdx + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length; items.forEach((li, i) => li.classList.toggle("on", i === suggIdx)); }
      else if (e.key === "Enter") { e.preventDefault(); if (suggIdx >= 0 && items[suggIdx] && !$("sugg").hidden) pick(items[suggIdx].dataset.s); else pick($("q").value.trim() || state.symbol); run(); }
      else if (e.key === "Escape") $("sugg").hidden = true;
    });
    $("sugg").addEventListener("mousedown", (e) => { const li = e.target.closest("li"); if (li) { e.preventDefault(); pick(li.dataset.s); run(); } });
    $("q").addEventListener("blur", () => setTimeout(() => ($("sugg").hidden = true), 150));
    $("drift").addEventListener("change", () => ($("customWrap").hidden = $("drift").value !== "custom"));
    $("run").addEventListener("click", run);
    $("modelTabs").addEventListener("click", (e) => { const t = e.target.closest(".tab"); if (t) { state.sel = t.dataset.m; renderSelected(); } });
    $("showPaths").addEventListener("change", () => state.res && renderSelected());
    $("csv").addEventListener("change", async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try { state.csv = parseCsv(await f.text(), f.name.replace(/\.csv$/i, "")); $("q").value = "CSV: " + f.name; status(`CSV dimuat: ${state.csv.values.length} baris. Klik Jalankan.`); }
      catch (err) { status(err.message, true); }
      e.target.value = "";
    });
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => state.res && render());
  }

  readUrl(); setMode(state.mode, true); bind();
  if (new URLSearchParams(location.search).get("s")) run();
})();
