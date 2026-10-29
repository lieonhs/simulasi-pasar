/* RAM Capital · syarat demo, Quick IN/OUT, order otomatis, Autopilot, otak, futures, harian, kesehatan perangkat
   Semua file js/ berbagi satu lingkup global (skrip biasa, dimuat berurutan). Jangan diubah jadi modul tanpa menyesuaikan impor. */
"use strict";
  // =====================================================================
  // SYARAT INDODAX: buka beli otomatis / quick IN Indodax hanya setelah terbukti di demo
  // =====================================================================
  // ---- Periode belajar demo 2 bulan. Uang asli baru terbuka bila: ≥ 60 hari, ≥ 30 transaksi selesai, laba rata-rata per transaksi > 0 setelah biaya,
  //      profit factor ≥ 1,2, drawdown ≤ 20%, dan (opsional, aturanmu) ≥ 80% transaksi untung.
  const GATE = { days: 60, n: 30, pf: 1.2, dd: 0.2, wr: 0.8 };
  function learnStart() { if (!settings.learnStart) { settings.learnStart = new Date().toISOString(); saveSettings({ learnStart: settings.learnStart }); } return settings.learnStart; }
  function demoStats(onlyAp) { const from = learnStart(), H = (pp.a && pp.a.hist) || [], done = H.filter((o) => o.pl != null && (o.side === "sell" || o.side2 === "close") && (o.fillAt || o.t) >= from && (!onlyAp || o.ap));
    const n = done.length, W = done.filter((o) => o.pl > 0), L = done.filter((o) => o.pl <= 0), gw = W.reduce((s, o) => s + o.pl, 0), gl = -L.reduce((s, o) => s + o.pl, 0), pl = gw - gl;
    const E = ((pp.a && pp.a.eq) || []).filter((x) => x.d >= from.slice(0, 10)); let pk = -Infinity, dd = 0; for (const x of E) { pk = Math.max(pk, x.v); dd = Math.max(dd, pk > 0 ? 1 - x.v / pk : 0); }
    const days = (Date.now() - Date.parse(from)) / 864e5; return { from, days, n, w: W.length, wr: n ? W.length / n : 0, pl, avg: n ? pl / n : 0, pf: gl > 0 ? gw / gl : gw > 0 ? Infinity : 0, dd, eqN: E.length }; }
  function demoGate() { const s = demoStats(false), need80 = settings.gate80 !== false, chk = { days: s.days >= GATE.days, n: s.n >= GATE.n, avg: s.avg > 0, pf: s.pf >= GATE.pf, dd: s.dd <= GATE.dd, wr: !need80 || s.wr >= GATE.wr };
    return { ...s, chk, need80, pass: Object.values(chk).every(Boolean) }; }
  function gateText(g = demoGate()) { const left = Math.max(0, Math.ceil(GATE.days - g.days));
    return g.pass ? `<span class="pos">Syarat terpenuhi</span>: ${Math.floor(g.days)} hari belajar, ${g.n} transaksi, laba rata-rata ${big(g.avg, "IDR")}/transaksi, profit factor ${nf(2).format(g.pf)}.`
      : `<b>Uang asli terkunci (masa belajar demo).</b> ${left ? `Sisa <b>${left} hari</b> dari 60.` : "60 hari terlewati."} Sekarang: ${g.n}/${GATE.n} transaksi · rata-rata ${g.avg >= 0 ? "+" : "−"}${big(Math.abs(g.avg), "IDR")} · PF ${isFinite(g.pf) ? nf(2).format(g.pf) : "∞"} · drawdown ${pct(g.dd, 0)}${g.need80 ? ` · ${pct(g.wr, 0)} untung (wajib ≥ 80%)` : ""}.`; }
  function drawLearnReport() { const el = $("lrBody"); if (!el) return; const g = demoGate(), A = demoStats(true), prog = Math.min(1, g.days / GATE.days), ok = (b) => (b ? '<b class="pos">✓</b>' : '<span class="note">✗</span>');
    const row = (lab, v, need, b) => `<tr><td>${lab}</td><td><b>${v}</b></td><td class="note">${need}</td><td>${ok(b)}</td></tr>`;
    el.innerHTML = `<div class="tg-bar"><i style="width:${(prog * 100).toFixed(1)}%"></i></div><p class="note keep">Hari ke-${Math.floor(g.days)} dari 60 · mulai ${new Date(g.from).toLocaleDateString("id-ID")} · ${g.days >= GATE.days ? "masa belajar selesai" : `selesai ±${new Date(Date.parse(g.from) + GATE.days * 864e5).toLocaleDateString("id-ID")}`}</p>
      <div class="table-wrap"><table><thead><tr><th>Ukuran (semua transaksi demo sejak mulai)</th><th>Sekarang</th><th>Syarat</th><th></th></tr></thead><tbody>
      ${row("Lama belajar", `${Math.floor(g.days)} hari`, "≥ 60 hari", g.chk.days)}${row("Transaksi selesai", g.n, "≥ 30", g.chk.n)}
      ${row("Laba rata-rata per transaksi (setelah biaya)", `${g.avg >= 0 ? "+" : "−"}${big(Math.abs(g.avg), "IDR")}`, "> 0", g.chk.avg)}${row("Profit factor (total untung ÷ total rugi)", isFinite(g.pf) ? nf(2).format(g.pf) : "∞", "≥ 1,2", g.chk.pf)}
      ${row("Drawdown terbesar akun demo", pct(g.dd, 1), "≤ 20%", g.chk.dd)}${row("Transaksi untung", pct(g.wr, 0), g.need80 ? "≥ 80% (aturanmu)" : "tidak wajib", g.chk.wr)}
      </tbody></table></div><p class="note keep">Autopilot saja: ${A.n} transaksi · ${pct(A.wr, 0)} untung · rata-rata ${A.avg >= 0 ? "+" : "−"}${big(Math.abs(A.avg), "IDR")} · PF ${isFinite(A.pf) ? nf(2).format(A.pf) : "∞"}. ${g.pass ? '<b class="pos">Semua syarat terpenuhi: uang asli boleh dibuka.</b>' : "Uang asli tetap terkunci sampai semua ✓."}</p>`; }
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
  const AP_DEF = { on: false, ml: true, dl: true, ai: true, target: "demo", thr: 0.75, mode: "asset", budget: 1e9, run: null, mlFast: true, health: true, brains: 0, style: "swing", dayBias: false, fut: false, lev: 2, tgOn: false, tgAmt: 5e7, tgAgg: 0.03, tgSafe: 0.005, tgBrake: 0.25, scope: "list", news: true, exp: true, autoPick: false, pickAt: 0, pickSrc: "all", maxW: 0.35, maxPos: 5, maxDay: 50, val: 100000, every: 30, list: "", cool: {}, day: "", nDay: 0 };
  function apLoad() { ap.cfg = { ...AP_DEF, ...((settings && settings.autopilot) || {}) }; ap.cfg.thr = Math.max(0.75, +ap.cfg.thr || 0.75); ap.log = ((settings && settings.apLog) || []).slice(0, 200);
    const c = ap.cfg; $("apOn").checked = c.on; $("apUseML").checked = c.ml; $("apUseDL").checked = c.dl; $("apUseAI").checked = c.ai; $("apTarget").value = c.target; $("apThr").value = String(c.thr); $("apMaxPos").value = String(c.maxPos); $("apMaxDay").value = String(c.maxDay); $("apVal").value = c.val; $("apEvery").value = String(c.every); $("apList").value = c.list; $("apMode").value = c.mode; $("apMlSpeed").value = c.mlFast === false ? "std" : "fast"; $("apHealth").checked = c.health !== false; $("apBrains").value = String(c.brains || 0); apSetBrains(c.brains); $("apStyle").value = c.style || "swing"; $("apDayBias").checked = !!c.dayBias; $("apFut1").checked = !!c.fut; $("apLev").value = String(c.lev || 2); $("tgOn").checked = !!c.tgOn; if ($("tgDet")) $("tgDet").open = !!c.tgOn; $("tgAmt").value = c.tgAmt; $("tgAgg").value = String(c.tgAgg); $("tgSafe").value = String(c.tgSafe); $("tgBrake").value = String(c.tgBrake); $("apScope").value = c.scope || "list"; $("apUseNews").checked = c.news !== false; $("apUseExp").checked = c.exp !== false; $("apAutoPick").checked = !!c.autoPick; $("apPickSrc").value = c.pickSrc || "all"; $("apBudget").value = c.budget; $("apMaxW").value = String(c.maxW); }
  function apRead() { const c = ap.cfg; c.on = $("apOn").checked; c.ml = $("apUseML").checked; c.dl = $("apUseDL").checked; c.ai = $("apUseAI").checked; c.target = $("apTarget").value; c.thr = +$("apThr").value; c.maxPos = +$("apMaxPos").value; c.maxDay = Math.min(50, +$("apMaxDay").value || 50); c.val = Math.max(10000, +$("apVal").value || 100000); c.every = +$("apEvery").value; c.list = $("apList").value; c.mode = $("apMode").value; c.mlFast = $("apMlSpeed").value !== "std"; c.health = $("apHealth").checked; c.brains = +$("apBrains").value || 0; apSetBrains(c.brains); c.style = $("apStyle").value; c.dayBias = $("apDayBias").checked; if (c.style !== "swing") c.mode = "asset"; c.fut = $("apFut1").checked; c.lev = Math.min(5, +$("apLev").value || 2); c.tgOn = $("tgOn").checked; c.tgAmt = Math.max(1e6, +$("tgAmt").value || 5e7); c.tgAgg = Math.min(0.05, +$("tgAgg").value); c.tgSafe = +$("tgSafe").value; c.tgBrake = +$("tgBrake").value; if (c.tgOn) c.mode = "asset"; c.scope = $("apScope").value; c.news = $("apUseNews").checked; c.exp = $("apUseExp").checked; c.autoPick = $("apAutoPick").checked; c.pickSrc = $("apPickSrc").value; c.budget = Math.min(AP_CAP, Math.max(1e6, +$("apBudget").value || AP_CAP)); c.maxW = +$("apMaxW").value; c.thr = Math.max(AP_MIN, c.thr); }
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
  async function apDecide(sym, slot = 0) { const t0 = performance.now(), W = apWorker(slot), tm = {}; let tk = t0; const lap = (k) => { const n = performance.now(); tm[k] = (tm[k] || 0) + n - tk; tk = n; };
    // ambil semua data sekaligus (paralel), bukan satu per satu: harga 5 & 10 tahun, riwayat berita, berita 24 jam, fundamental
    const eq0 = !/-USDT?$/.test(sym) && !/^\^/.test(sym) && !/=/.test(sym), vk0 = `${sym}|${new Date().toISOString().slice(0, 10)}`;
    const [d, dl10, news, , F0] = await Promise.all([fetchSymbol(sym, "5y"), fetchSymbol(sym, "10y").catch(() => null), newsHist(sym).catch(() => ({ map: null })), apNews(sym, null).catch(() => null),
      eq0 && !(ap.valc && ap.valc.has(vk0)) ? apiFetch(`${API}?action=fundamentals&symbol=${encodeURIComponent(sym)}`).then((r) => r.json()).catch(() => null) : Promise.resolve(null)]);
    if (!d.ohlc || d.ohlc.length < 300) throw new Error("data < 300 hari"); lap("data");
    const D = buildD(d), R = rawD(d), crypto = /CRYPTO/i.test(d.type || "") || /-USDT?$/.test(sym), idx = /\.JK$/.test(sym), so = stratOpts();
    const sk = `${sym}|${D.d[D.n - 1]}|${so.costBps}`, sc0 = (ap.stc || (ap.stc = new Map())).get(sk); // 50 strategi juga cukup dihitung sekali per aset per hari bar
    const all = sc0 || (await compute("stratAll", { D, o: { ...so, short: false } }, undefined, W)); if (!sc0) { ap.stc.set(sk, all); if (ap.stc.size > 80) ap.stc.delete(ap.stc.keys().next().value); } lap("strategi");
    let DM = D; try { if (dl10) { const D2 = buildD(dl10); if (D2.n > D.n + 100) DM = D2; } } catch { /* */ }
    const mlCap = ap.cfg.mlFast !== false ? 1500 : 2600; // Cepat: ±6 tahun terakhir (lebih ringan); Standar: ±10 tahun
    if (DM.n > mlCap) { const k = DM.n - mlCap; DM = { d: DM.d.slice(k), o: DM.o.slice(k), h: DM.h.slice(k), l: DM.l.slice(k), c: DM.c.slice(k), v: DM.v.slice(k), n: mlCap }; }
    const ek = idx ? "idx" : crypto ? "c" : "us"; if (!ap.ext[ek]) ap.ext[ek] = await mlExt(sym).catch(() => []); lap("data");
    const mk = `${sym}|${DM.d[DM.n - 1]}|${DM.n}`, mc = (ap.mlc || (ap.mlc = new Map())).get(mk); let M = null; // model ML/DL dilatih sekali per aset per hari bar; dalam hari yang sama dipakai ulang
    lap("berita");
    if (mc) M = mc; else { try { M = await compute("ml", { D: DM, o: { horizon: 5, costBps: so.costBps, ext: ap.ext[ek], news: news && news.map, dlBag: ap.cfg.mlFast !== false ? 1 : 2 } }, undefined, W); if (M && !M.error) { ap.mlc.set(mk, M); if (ap.mlc.size > 60) ap.mlc.delete(ap.mlc.keys().next().value); } } catch (e) { M = { error: e.message }; } }
lap("ml");
    const C = MCEngine.confluence(D, { H: 10, costBps: so.costBps, ppy: crypto ? 365 : 252 }), fx = (d.currency || "") === "IDR" ? 1 : pp.fx || 16000;
    const cap = ap.cfg.target === "demo" ? apRun().free : Math.max(0, parseFloat($("actCap").value) || 1e7), risk = ap.cfg.tgOn && ap.cfg.target === "demo" ? apPhase().risk : parseFloat($("actRisk").value) || 0.01;
    const SG = MCEngine.signalBacktest(d.dates, d.values, { ppy: crypto ? 365 : 252 }), sgScore = SG && SG.now ? SG.now.score : 0;
    const P = MCEngine.actionPlan(R, { isIdx: idx, crypto, strats: all.list, votes: all.votes, score: sgScore, capital: cap / fx, riskPct: risk, unit: idx ? 100 : 1, costBps: so.costBps, market: idx ? "IDX" : crypto ? null : "US", ml: M && !M.error ? M : null, sel: C && C.sel }); if (M && M.error) M = null;
lap("rencana");
    // Valuasi (saham saja, sekali per hari): penyaring "jauh terlalu mahal"
    let val = null; const eqty = !crypto && !/^\^/.test(sym) && !/=/.test(sym), vk = `${sym}|${new Date().toISOString().slice(0, 10)}`;
    if (eqty) { const vc = (ap.valc || (ap.valc = new Map())).get(vk); if (vc !== undefined) val = vc; else { try { const F = F0 || (await (await apiFetch(`${API}?action=fundamentals&symbol=${encodeURIComponent(sym)}`)).json()); const V = valEnsemble(F, d.values[d.values.length - 1], (d.currency || "") !== "IDR", null);
          val = V && V.methods && V.methods.length ? { up: V.upside, n: V.methods.length, agree: V.agree, bad: !(V.upside <= 3 && V.upside >= -0.95) } : null; } catch { val = null; } ap.valc.set(vk, val); } }
lap("valuasi");
    // Monte Carlo (bootstrap 2.000 jalur) & binomial: peluang kena target 1 sebelum stop dalam 20 bar
    let mcP = null, bnP = null; if (P.entry > 0 && P.stop > 0 && P.t1 > P.entry) { const px0 = P.entry, c0 = d.values, lr = []; for (let i = Math.max(1, c0.length - 504); i < c0.length; i++) lr.push(Math.log(c0[i] / c0[i - 1]));
      if (lr.length > 100) { const m0 = lr.reduce((s, x) => s + x, 0) / lr.length, L2 = lr.map((x) => x - m0 * 0.5); let hit = 0, stp = 0, seed = 11; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
        for (let k = 0; k < 2000; k++) { let v = px0; for (let t = 0; t < 20; t++) { v *= Math.exp(L2[Math.floor(rnd() * L2.length)]); if (v >= P.t1) { hit++; break; } if (v <= P.stop) { stp++; break; } } }
        const p = hit / 2000, q = stp / 2000, cst = (so.costBps * 2) / 1e4 * px0; mcP = { p, q, ev: (p * (P.t1 - px0) - q * (px0 - P.stop) - cst) / px0 };
        const ppy = crypto ? 365 : 252, sig = Math.sqrt(lr.reduce((s, x) => s + (x - m0) ** 2, 0) / lr.length) * Math.sqrt(ppy), mu = Math.max(-0.3, Math.min(0.3, 0.5 * m0 * ppy));
        const B = MCEngine.binomialBarrier(px0, P.t1, P.stop, sig, mu, 20, ppy); bnP = { p: B.pUp, q: B.pDn, ev: (B.pUp * (P.t1 - px0) - B.pDn * (px0 - P.stop) - cst) / px0 }; } }
lap("MC+binomial");
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
lap("berita");
    const RB = rightBrain(d.values, P, crypto); lap("otak kanan");
    if (RB && RB.size < 1 && P.qty > 0) P.qty = idx ? Math.floor((P.qty * RB.size)) : +(P.qty * RB.size).toFixed(6); // otak kanan hanya boleh MENGECILKAN posisi, tidak pernah membesarkan
    const X0 = { T, cs: C ? C.sNow : 0, val, mcP, bnP, sgScore, RB, atr, px: d.values[d.values.length - 1] };
    lap("lain");
    return { sym, d, P, M, C, N, ...X0, tm, ms: performance.now() - t0, cached: !!mc, ml: dir(M), dl: dir(DLm), ai: aiDir, aic, aiP, aiLearned: AIL.valid, aiScore: sc, mlP: M ? M.p : NaN, dlP: DLm ? DLm.p : NaN, mlV: !!(M && M.valid), dlV: !!(DLm && DLm.valid), at: Date.now(), crypto, idx, fx };
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
    if (n >= 40) { const { tr, te } = tsSplit(L); if (tr.length < 20 || te.length < 8) { out.p = (r) => P(out, r); ap.aiModel = out; return out; } const m1 = fit(tr.map((m) => m.c), tr.map((m) => m.y));
      out.auc = auc(te.map((m) => P(m1, m.c)), te.map((m) => m.y)); out.aucFixed = auc(te.map((m) => P({ w: AI_W0, b: 0 }, m.c)), te.map((m) => m.y)); out.nTest = te.length;
      const m2 = fit(L.map((m) => m.c), L.map((m) => m.y)); out.w = m2.w; out.b = m2.b; out.valid = te.length >= 12 && out.auc >= 0.55 && !(out.aucFixed > out.auc); }
    out.p = (r) => P(out, r); ap.aiModel = out; return out; }
  // pisah latih/uji berdasarkan TANGGAL dengan jeda 7 hari (embargo) supaya catatan yang mirip tidak bocor ke data uji
  function tsSplit(L) { const n = L.length, cd = L[Math.floor(n * 0.7)].d, emb = new Date(Date.parse(cd) + 7 * 864e5).toISOString().slice(0, 10); return { tr: L.filter((m) => m.d < cd), te: L.filter((m) => m.d >= emb) }; }
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
    if (n >= 40) { const { tr, te } = tsSplit(L); if (tr.length < 20 || te.length < 8) { ap.expModel = out; return out; } const m1 = fit(tr.map(row), tr.map((m) => m.y));
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
    const { tr: trL, te: teL } = tsSplit(L), ix0 = new Map(L.map((m, i) => [m, i])), tr = trL.map((m) => ix0.get(m)), te = teL.map((m) => ix0.get(m)); if (tr.length < 30 || te.length < 12) { ap.brain = out; return out; } const f1 = fit(tr);
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
  function futOpen(s, dir, px, units, lev, brk, ap1, opt = {}) { px = px * (1 + dir * slipOf(s)); const fx = fxOf(s), notional = units * px * fx, margin = notional / lev, feeR = opt.feeR || FUT_FEE, fee = notional * feeR;
    if (margin + fee > pp.a.cash) throw new Error("kas demo tidak cukup untuk margin"); pp.a.cash -= margin + fee;
    const f = { id: Date.now().toString(36), t: new Date().toISOString(), s, dir, entry: px, units, lev, margin, fee, brk, ap: !!ap1, day: !!opt.day, spot: !!opt.spot, feeR, feeR2: opt.feeR2 || feeR }; futList().push(f);
    const lab = f.spot ? `day trade beli` : `futures ${dir > 0 ? "LONG" : "SHORT"} ${lev}x${f.day ? " day" : ""} buka`;
    pp.a.hist.unshift({ id: f.id, t: f.t, s, name: s, side: dir > 0 ? "buy" : "sell", type: lab, units, fillPx: px, fillAt: f.t, fee, status: "terisi", ap: !!ap1, fut: true, eng: f.day ? "day" : "swing" }); return f; }
  function futClose(f, px, why) { if (why !== "LIKUIDASI") px = px * (1 - f.dir * slipOf(f.s)); const fx = fxOf(f.s), pnl = Math.max(-f.margin, futPnl(f, px)), fee = f.units * px * fx * (f.feeR2 || FUT_FEE), back = Math.max(0, f.margin + pnl - fee);
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
    if (/\.JK$/.test(s) || /^\^JK/.test(s)) { const t = tzParts("Asia/Jakarta"), wk = !["Sat", "Sun"].includes(t.wd) && idxOpen(); return { open: false, close: !wk || t.m >= 15 * 60 + 45, label: "IDX: harga tertunda 10–15 menit, day trade dinonaktifkan" }; }
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
    if (!$("detailView").hidden && act && act.mlProg) { pause = true; why.push("mengalah: kamu sedang menjalankan analisis di F3"); }
    else if (!$("detailView").hidden || !$("quantView").hidden) { brains = 1; rest = Math.max(rest, 400); why.push("kamu sedang di halaman analisis: autopilot pakai 1 otak supaya layar tetap ringan"); }
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
        <td class="note ap-st">${c.style === "adapt" ? `<b>${esc(apEngLabel(s).replace(" (belum terbukti di demo)", "").replace(" (keduanya rugi di demo)", " ✗"))}</b> · ` : ""}${(c.style === "both" || c.style === "adapt" || c.style === "day") && st.dnote ? `<span title="${esc(st.dnote)}">H: ${esc(apShort1(st.dnote))}</span>${c.style !== "day" ? " · " : ""}` : ""}${c.style !== "day" ? `<span title="${esc(st.note || (V ? V.why : ""))}">${c.style === "swing" ? "" : "S: "}${esc(apShort1(st.note || (V ? V.why : "")))}</span>` : ""}</td><td class="note">${st.at ? new Date(st.at).toLocaleTimeString("id-ID") : "–"}${X && isFinite(X.ms) ? `<br><span title="${X.cached ? "model ML/DL dipakai ulang (sudah dilatih hari ini)" : "melatih ML/DL baru"}${X.tm ? "&#10;" + Object.entries(X.tm).sort((p, q) => q[1] - p[1]).map(([k, v]) => `${k}: ${nf(1).format(v / 1000)} dtk`).join("&#10;") : ""}">⏱ ${nf(1).format(X.ms / 1000)} dtk${X.cached ? "" : " ★"}</span>` : ""}</td></tr>`; }).join("") + "</tbody>" : '<tbody><tr><td class="note">Tambahkan aset di kotak kiri.</td></tr></tbody>';
    $("apLog").innerHTML = ap.log.length ? "<tbody>" + ap.log.slice(0, 120).map((l) => `<tr><td class="note">${wib(l.t)}</td><td><b>${esc(l.s)}</b></td><td class="${l.k === "buy" ? "pos" : l.k === "sell" ? "neg" : l.k === "err" ? "neg" : ""}">${esc(l.m)}</td></tr>`).join("") + "</tbody>" : '<tbody><tr><td class="note">Belum ada aktivitas.</td></tr></tbody>';
    if (c.target === "demo") { const R = apRun(); $("apGate").innerHTML += `<br>Run #${R.n}${R.failed ? ' <b class="neg">GAGAL</b>' : ""}: dana uji ${fmtIdr(R.cap)} → nilai sekarang <b class="${R.eq >= R.cap ? "pos" : "neg"}">${fmtIdr(R.eq)}</b> (${pct(R.ratio - 1, 1)}) · terpakai ${fmtIdr(R.used)} · batas gagal ${fmtIdr(R.cap * AP_FAIL)}`; }
    document.querySelectorAll(".ap-porto").forEach((e) => (e.hidden = c.mode !== "porto"));
    if (c.mode === "porto" && ap.porto) $("apGate").innerHTML += "<br>Bobot portofolio: " + ap.porto.map((r) => `${esc(r.s)} ${pct(r.cur, 0)}→<b>${pct(r.w, 0)}</b>`).join(" · ");
    $("apDev").innerHTML = devText(); drawLearnReport(); drawApLearn(); drawApChips(); drawApOrders(); drawApOrdersX(); drawTg(); drawFut(); drawApCmp(); drawApPos();
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
    ["apOn", "apUseML", "apUseDL", "apUseAI", "apTarget", "apThr", "apMaxPos", "apMaxDay", "apVal", "apEvery", "apList", "apScope", "apMode", "apBudget", "apMlSpeed", "apHealth", "apBrains", "apStyle", "apDayBias", "apFut1", "apLev", "tgOn", "tgAmt", "tgAgg", "tgSafe", "tgBrake", "apMaxW", "apUseNews", "apUseExp", "apAutoPick", "apPickSrc"].forEach((id) => $(id).addEventListener("change", () => {
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
    $("lr80").checked = settings.gate80 !== false; $("lr80").onchange = () => { saveSettings({ gate80: $("lr80").checked }); drawAp(); };
    $("apNow").onclick = () => apCycle(true); $("apQuick").onclick = () => apQuick();
    $("apNewRun").onclick = () => { apRead(); if (apPositions().length) { toast("Tutup dulu posisi autopilot (tombol Matikan & tutup)."); return; } const n = ((ap.cfg.run && ap.cfg.run.n) || 0) + 1; ap.cfg.run = { start: new Date().toISOString(), cap: ap.cfg.budget, n }; apLogAdd("—", `Run #${n} dimulai · dana uji ${fmtIdr(ap.cfg.budget)}`); apSave(); drawAp(); };
    $("apKill").onclick = async () => { apRead(); ap.cfg.on = false; $("apOn").checked = false; for (const s of apPositions()) { try { const m = await apSell({ sym: s }); apLogAdd(s, `DITUTUP manual · ${m}`, "sell"); } catch (e) { apLogAdd(s, "gagal tutup: " + e.message, "err"); } } apLogAdd("—", "Autopilot dimatikan & posisi autopilot ditutup"); apSave(); drawAp(); toast("Autopilot dimatikan."); };
    $("apWake").addEventListener("change", () => apWakeSync());
    document.addEventListener("visibilitychange", () => { if (!document.hidden) { pullSettings(); apWakeSync(); if (ap.cfg.on) apCycle(false); } });
    setTimeout(() => { if (ap.cfg.on) { apLogAdd("—", "Web dibuka lagi: autopilot melanjutkan"); apCycle(false); } }, 8000);
    if (location.hostname === "localhost") window.__ap = { devPolicy, brainTrain, aiTrain, futOpen, apEngAllow, apEngStats, pp, dayStep, daySession, dayIntraday, apShort, futCheck, futList, au, drawAp, idxCall, ledgerRows, apBuy, apSell, apRun, apDecide, apPorto, apNews, apNewsGuard, apNewsCache, ap };
    clearInterval(ap.timer); ap.timer = setInterval(async () => { futCheck(); apCycle(false); if (!$("apPane").hidden && !ap.busy) { try { await ppQuotes([...Object.keys(pp.a.pos || {}), ...futList().map((f) => f.s)]); } catch { /* */ } drawAp(); } }, 60e3); } // tetap jalan di tab latar (browser membatasi ke ±1x/menit)

