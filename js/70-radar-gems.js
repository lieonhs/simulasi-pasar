/* RAM Capital · Radar, live Indodax, Hidden gems
   Semua file js/ berbagi satu lingkup global (skrip biasa, dimuat berurutan). Jangan diubah jadi modul tanpa menyesuaikan impor. */
"use strict";
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
    l2: ["ARB", "OP", "POL", "IMX", "STRK", "ZK", "MANTA", "METIS", "LRC", "SKL", "CELO", "SCR", "MOVE", "AEVO", "DYM", "ALT"].map((s) => s + "-USDT"),
    infra: ["LINK", "PYTH", "API3", "BAND", "GRT", "AR", "FIL", "STORJ", "TRB", "QNT", "W", "ZRO", "AXL", "JASMY", "IOTA", "KAS"].map((s) => s + "-USDT"),
    rwa: ["ONDO", "OM", "POLYX", "PENDLE", "TRU", "CFG", "RSR", "SYRUP", "PLUME", "LQTY"].map((s) => s + "-USDT"),
    usm: ["PLTR", "CRWD", "SNOW", "DDOG", "NET", "ZS", "MDB", "SHOP", "SQ", "ROKU", "ETSY", "PINS", "SNAP", "U", "RBLX", "AFRM", "SOFI", "HOOD", "COIN", "DKNG", "ENPH", "FSLR", "RIVN", "LCID", "CELH", "DUOL", "TTD", "OKTA", "TWLO", "PATH"] };
  const gm = { rows: [], busy: false };
  // semua koin kripto berpasangan USDT di Binance, diurut volume 24 jam (tanpa stablecoin & token leverage). Rentang peringkat 30–180 = tempat koin yang belum terlalu ramai.
  async function allCrypto([from, to]) { try { const L = await (await fetch("https://data-api.binance.vision/api/v3/ticker/24hr")).json(), STABLE = /^(USDC|FDUSD|TUSD|BUSD|DAI|USDP|USDD|PYUSD|EUR|EURI|AEUR|USDE|XUSD|BFUSD|RLUSD|USD1)USDT$/;
      return L.filter((x) => /USDT$/.test(x.symbol) && !STABLE.test(x.symbol) && !/(UP|DOWN|BULL|BEAR)USDT$/.test(x.symbol) && +x.quoteVolume > 2e5 && +x.count > 1000).sort((x, y) => +y.quoteVolume - +x.quoteVolume).slice(from, to).map((x) => x.symbol.replace(/USDT$/, "") + "-USDT"); } catch { return [...new Set([...GM_UNI.alt, ...GM_UNI.l1, ...GM_UNI.l2, ...GM_UNI.ai, ...GM_UNI.defi, ...GM_UNI.meme, ...GM_UNI.game, ...GM_UNI.infra, ...GM_UNI.rwa])]; } }
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
    if (u === "idxc") { await idxPairsLoad(); uni = (ix.pairs || []).filter((p) => p.base !== "usdt" && p.base !== "usdc" && !p.suspended && p.volIdr > 5e7).slice(0, 150).map((p) => p.base.toUpperCase() + "-USDT"); }
    if (u === "ctop" || u === "cmid") { $("gmStatus").textContent = "Mengambil daftar semua koin…"; uni = await allCrypto(u === "cmid" ? [30, 180] : [0, 150]); }
    if ($("gmIdxOnly").checked && u !== "idxs" && u !== "usm" && u !== "wl") { await idxPairsLoad(); if ((ix.pairs || []).length) uni = (uni || []).filter((s) => !/-USDT?$/.test(s) || idxPairFor(s)); else toast("Daftar koin Indodax gagal dimuat" + (ix.pairsErr ? ` (${ix.pairsErr})` : "") + ". Filter Indodax dimatikan sementara."); }
    if (u === "idxc" && !(uni || []).length) { $("gmStatus").textContent = "Daftar koin Indodax gagal dimuat: " + (ix.pairsErr || "tidak ada data") + ". Coba lagi sebentar lagi."; gm.busy = false; $("gmRun").disabled = false; return; }
    const syms = [...new Set(uni || [])].slice(0, 150), N = syms.length, deep = $("gmDeep").checked; let done = 0; if (!N) { $("gmStatus").textContent = "Tidak ada koin di daftar ini yang listing di Indodax."; gm.busy = false; $("gmRun").disabled = false; return; }
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


