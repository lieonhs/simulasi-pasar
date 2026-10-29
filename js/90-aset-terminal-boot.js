/* RAM Capital · manajemen aset, terminal Pro, simpan pengaturan, login & boot
   Semua file js/ berbagi satu lingkup global (skrip biasa, dimuat berurutan). Jangan diubah jadi modul tanpa menyesuaikan impor. */
"use strict";
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
      if (okk) { $("cmdUser").innerHTML = `<span class="pn">${esc((me.name || (session.user.email || "").split("@")[0]).toUpperCase().slice(0, 18) + (me.role === "admin" ? " · ADMIN" : ""))}</span>`; if (me.role === "admin") refreshAdminBadge(); toast("Persetujuan admin aktif."); } };
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
  // Data besar disimpan per kunci di tabel sp_data (kalau sudah dibuat) → tiap kunci ditulis terpisah, lebih kecil & jarang bentrok.
  const BIG = ["paper", "apMem", "apLog", "idxLedger", "amHist"]; let dataOk = null; const dAt = {}, dDirty = new Set(); let dTimer = null;
  async function dataProbe() { try { const { data, error } = await sb.from("sp_data").select("key,data,updated_at").eq("user_id", session.user.id); if (error) { dataOk = false; return null; } dataOk = true; return data || []; } catch { dataOk = false; return null; } }
  async function dataFlush() { if (!dataOk || !dDirty.size) return; const keys = [...dDirty]; dDirty.clear();
    try { const { data: cur } = await sb.from("sp_data").select("key,data,updated_at").eq("user_id", session.user.id).in("key", keys); const now = new Date().toISOString();
      for (const r of cur || []) if (dAt[r.key] && r.updated_at > dAt[r.key]) { const m = mergeLearn({ [r.key]: r.data }, { [r.key]: settings[r.key] }); settings[r.key] = m[r.key]; learnReload(); }
      await sb.from("sp_data").upsert(keys.filter((k) => settings[k] != null).map((k) => ({ user_id: session.user.id, key: k, data: settings[k], updated_at: now }))); keys.forEach((k) => (dAt[k] = now)); } catch { keys.forEach((k) => dDirty.add(k)); } }
  function saveSettings(patch) {
    settings = { ...settings, ...patch }; if (dataOk) { for (const k of Object.keys(patch)) if (BIG.includes(k)) dDirty.add(k); clearTimeout(dTimer); dTimer = setTimeout(dataFlush, 2000); if (Object.keys(patch).every((k) => BIG.includes(k))) return; } if (settings.paper && settings.paper.hist && settings.paper.hist.length > 3000) settings.paper.hist.length = 3000; if (!sb || !session) return;
    clearTimeout(saveTimer); saveTimer = setTimeout(async () => { try {
        const { data: cur } = await sb.from("sp_settings").select("data,updated_at").eq("user_id", session.user.id).maybeSingle();
        if (cur && cur.data && cur.updated_at && setAt && cur.updated_at > setAt) { settings = mergeLearn(cur.data, settings); learnReload(); } // ada tulisan dari perangkat/tab lain sejak kita terakhir lihat
        const now = new Date().toISOString(), main = dataOk ? Object.fromEntries(Object.entries(settings).filter(([k]) => !BIG.includes(k))) : settings;
        await sb.from("sp_settings").upsert({ user_id: session.user.id, data: main, updated_at: now }); setAt = now; } catch { /* */ } }, 1500);
  }
  function learnReload() { try { if (ap.cfg) { ap.mem = (settings.apMem || []).slice(); ap.expModel = null; ap.log = (settings.apLog || []).slice(0, 200); } if (pp.a && settings.paper && settings.paper.hist) pp.a.hist = settings.paper.hist; led.rows = null; } catch { /* */ } }
  async function pullSettings() { if (!sb || !session) return;
    if (dataOk) try { const { data: rows } = await sb.from("sp_data").select("key,data,updated_at").eq("user_id", session.user.id); let ch = false; for (const r of rows || []) if (!dAt[r.key] || r.updated_at > dAt[r.key]) { settings[r.key] = mergeLearn({ [r.key]: r.data }, { [r.key]: settings[r.key] })[r.key]; dAt[r.key] = r.updated_at; ch = true; } if (ch) learnReload(); } catch { /* */ }
    try { const { data: cur } = await sb.from("sp_settings").select("data,updated_at").eq("user_id", session.user.id).maybeSingle();
      if (cur && cur.data && cur.updated_at && (!setAt || cur.updated_at > setAt)) { settings = mergeLearn(cur.data, settings); setAt = cur.updated_at; learnReload(); if (ap.cfg && !$("apPane").hidden) drawAp(); } } catch { /* */ } }
  async function loadSettings() {
    try { const { data } = await sb.from("sp_settings").select("data,updated_at").eq("user_id", session.user.id).maybeSingle(); settings = (data && data.data) || {}; setAt = (data && data.updated_at) || null; } catch { settings = {}; }
    const rows = await dataProbe(); if (rows) { const have = new Set(); for (const r of rows) { settings[r.key] = settings[r.key] != null ? mergeLearn({ [r.key]: r.data }, { [r.key]: settings[r.key] })[r.key] : r.data; dAt[r.key] = r.updated_at; have.add(r.key); }
      for (const k of BIG) if (settings[k] != null) dDirty.add(k); if (dDirty.size) setTimeout(() => { dataFlush().then(() => saveSettings({})); }, 3000); } // pindahkan data lama ke sp_data, lalu kecilkan baris utama
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
  // admin/pemilik: pindahkan sesi ke localStorage SEKALI lalu muat ulang, supaya sejak itu hanya ada satu penyimpanan sesi (tidak ada salinan basi yang bisa membuat Supabase mencabut sesi)
  function keepOwnerSession() { if (!isOwner() || KEEP) return; try { localStorage.setItem("sp_keep", "1"); Object.keys(sessionStorage).filter((k) => /^sb-.*-auth-token/.test(k)).forEach((k) => { localStorage.setItem(k, sessionStorage.getItem(k)); sessionStorage.removeItem(k); }); KEEP = true; setTimeout(() => location.reload(), 300); } catch { /* */ } }
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
    $("cmdUser").innerHTML = `<span class="pn">${esc((me.name || (s.user.email || "").split("@")[0]).toUpperCase().slice(0, 18) + (me.role === "admin" ? " · ADMIN" : ""))}</span>`;
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
    const logout = async (why) => { try { await sb.auth.signOut(); } catch { /* */ } try { localStorage.removeItem("sp_keep"); localStorage.removeItem("sp_reat"); Object.keys(localStorage).filter((k) => /^sb-.*-auth-token/.test(k)).forEach((k) => localStorage.removeItem(k)); } catch { /* */ } try { sessionStorage.clear(); if (why) sessionStorage.setItem("sp_logout_msg", why); } catch { /* */ } location.reload(); };
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
      if (ev === "PASSWORD_RECOVERY") { const np = prompt("Masukkan password baru (min. 6 karakter):"); if (np) { const { error } = await sb.auth.updateUser({ password: np }); alert(error ? authErr(error) : "Password berhasil diganti."); } }
      if (s) { session = s; if (!booted) onAuthed(s); } else if (ev === "SIGNED_OUT") { $("pendGate").hidden = true; showAuth(); }
    });
    const { data } = await sb.auth.getSession();
    if (data.session) { try { await onAuthed(data.session); } finally { hideSplash(); } } else { showAuth(); hideSplash(); }
  }
  startAuth();
