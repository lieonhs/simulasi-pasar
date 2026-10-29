/* RAM Capital · akun demo, Indodax, 50 strategi
   Semua file js/ berbagi satu lingkup global (skrip biasa, dimuat berurutan). Jangan diubah jadi modul tanpa menyesuaikan impor. */
"use strict";
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
  // slippage + spread demo (lebih jujur): order selain limit terisi sedikit lebih buruk dari harga kutipan
  const slipOf = (s) => (/-USDT?$/.test(s) ? 0.001 : /\.JK$/.test(s) ? 0.0015 : 0.0005);
  function ppFill(o, px) {
    if (o.type !== "limit" && isFinite(px)) { px = px * (1 + (o.side === "buy" ? 1 : -1) * slipOf(o.s)); o.slip = slipOf(o.s); }
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

