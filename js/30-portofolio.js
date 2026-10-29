/* RAM Capital · Portofolio saya (F5), Lab matematika
   Semua file js/ berbagi satu lingkup global (skrip biasa, dimuat berurutan). Jangan diubah jadi modul tanpa menyesuaikan impor. */
"use strict";
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

