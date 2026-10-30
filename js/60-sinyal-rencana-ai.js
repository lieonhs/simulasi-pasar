/* RAM Capital · sinyal beli/jual, Rencana aksi, RAM AI
   Semua file js/ berbagi satu lingkup global (skrip biasa, dimuat berurutan). Jangan diubah jadi modul tanpa menyesuaikan impor. */
"use strict";
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
    const bn = binoSignal(d); if (bn) parts.push(["Otak ke-3 · binomial belajar", bn.v, bn.why]);
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
  // otak ke-3 (hanya untuk sinyal): pohon binomial yang peluang & langkahnya dipelajari dari hari-hari lampau yang mirip
  function binoSignal(d) {
    if (!d || !d.ohlc || d.ohlc.length < 400) return null;
    const last = d.ohlc[d.ohlc.length - 1], key = `${d.symbol}|${last[0]}|${last[4]}|${d.ohlc.length}`;
    if (!state.bino || state.bino.key !== key) { let B = null; try { const D = rawD(d), k = Math.max(0, D.n - 2600); if (k) for (const f of ["d", "o", "h", "l", "c", "v"]) D[f] = D[f].slice(k); D.n -= k; B = MCEngine.binoLearn(D, { cost: (stratOpts().costBps * 2) / 1e4 }); } catch { B = null; } state.bino = { key, B }; }
    const B = state.bino.B; if (!B) return null;
    const be = B.breakeven, tg = `target +${B.kU} ATR / stop −${B.kD} ATR, ${B.H} hari`;
    if (!B.valid) return { v: 0, why: `belum terbukti di aset ini${B.auc != null ? ` (AUC uji ${nf(2).format(B.auc)})` : ""}, jadi netral` };
    const v = B.pT >= be + 0.08 && B.ev > 0 ? 1 : B.pT <= be - 0.08 ? -1 : 0;
    return { v, why: `peluang target dulu ${pct(B.pT, 0)} (impas ${pct(be, 0)}), ${tg} · AUC uji ${nf(2).format(B.auc)}` };
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

