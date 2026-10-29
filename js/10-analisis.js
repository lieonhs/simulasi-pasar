/* RAM Capital · analisis kuantitatif, berita, valuasi Damodaran
   Semua file js/ berbagi satu lingkup global (skrip biasa, dimuat berurutan). Jangan diubah jadi modul tanpa menyesuaikan impor. */
"use strict";
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

