// Tes mesin (node --test). Data sintetis: model tidak boleh "menemukan" sinyal di data acak, dan harus menemukan sinyal yang ditanam.
const test = require("node:test"), assert = require("node:assert/strict"), E = require("../engine.js");
const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
function walk(n, seed, drift = 0) { const r = rng(seed), d = [], o = [], h = [], l = [], c = [], v = []; let p = 100, t = Date.parse("2016-01-04");
  for (let i = 0; i < n; i++) { const op = p; p *= Math.exp(drift + (r() - 0.5) * 0.04); d.push(new Date(t + i * 864e5).toISOString().slice(0, 10)); o.push(op); h.push(Math.max(op, p) * 1.005); l.push(Math.min(op, p) * 0.995); c.push(p); v.push(1e6 + r() * 1e6); }
  return { d, o, h, l, c, v, n }; }

test("binomial: batas simetris + drift nol ≈ 50/50, peluang ≤ 1", () => {
  const B = E.binomialBarrier(100, 110, 90.9091, 0.4, 0, 60, 252);
  assert.ok(B.pUp + B.pDn + B.pNone <= 1 + 1e-9); assert.ok(Math.abs(B.pUp - B.pDn) < 0.05);
});
test("binomial: drift positif menaikkan peluang target dulu", () => {
  const a = E.binomialBarrier(100, 110, 90, 0.3, 0, 60), b = E.binomialBarrier(100, 110, 90, 0.3, 0.5, 60); assert.ok(b.pUp > a.pUp);
});
test("konfluensi: data acak tidak boleh berstatus teruji/A+", () => {
  for (const s of [1, 2, 3]) { const C = E.confluence(walk(1500, s), { H: 10, ppy: 252 }); assert.ok(!(C && C.sel && C.sel.active), "A+ palsu di data acak (seed " + s + ")"); }
});
test("rencana aksi: menghasilkan harga masuk < target dan stop < masuk", () => {
  const D = walk(900, 7, 0.0008), P = E.actionPlan(D, { sims: 300, strats: [], seed: 1 });
  assert.ok(P.entry > 0 && P.stop > 0 && P.t1 > 0); assert.ok(P.stop < P.entry && P.entry < P.t1);
});
test("noise band intraday: tidak untung konsisten di jalan acak setelah biaya", () => {
  const r = rng(5), bars = []; let p = 100, t = Date.parse("2026-01-05T02:00:00Z") / 1000;
  for (let day = 0; day < 120; day++) for (let k = 0; k < 7; k++) { const o = p; p *= 1 + (r() - 0.5) * 0.01; bars.push([t + day * 86400 + k * 3600, o, Math.max(o, p) * 1.001, Math.min(o, p) * 0.999, p, 1000]); }
  const N = E.noiseBand(bars, { lookback: 14, costBps: 10 }); assert.ok(!(N.all.sharpe > 1.5), "Sharpe " + N.all.sharpe);
});
test("ML: data acak tidak boleh lolos uji (teruji)", { timeout: 120000 }, () => {
  const M = E.mlModel(walk(1100, 11), { horizon: 5, dlBag: 1 }); assert.ok(!M.valid, "ML teruji di data acak (AUC " + M.auc + ")");
});
test("binomial belajar: tidak valid di data acak, valid bila ada pola tren yang ditanam", () => {
  const n = 2000, rs = [3, 7, 11].map((s) => E.binoLearn(walk(n, s)));
  for (const r of rs) assert.ok(r && r.now && r.now.up >= 0 && r.now.up + r.now.dn <= 1 + 1e-9);
  assert.ok(rs.filter((r) => r.valid).length <= 1, "data acak tidak boleh terus-terusan 'valid'");
  // pola: rezim tren naik/turun yang bertahan ±60 hari lalu berganti acak (momentum terbaca dari harga)
  const r = rng(5), D = { d: [], o: [], h: [], l: [], c: [], v: [], n }; let p = 100, g = 1;
  for (let i = 0; i < n; i++) { if (r() < 1 / 60) g = -g; const op = p; p *= Math.exp(g * 0.005 + (r() - 0.5) * 0.04);
    D.d.push(`d${i}`); D.o.push(op); D.h.push(Math.max(op, p) * 1.004); D.l.push(Math.min(op, p) * 0.996); D.c.push(p); D.v.push(1); }
  const t0 = Date.now(), B = E.binoLearn(D); console.log("bino ms", Date.now() - t0, JSON.stringify({ auc: B.auc, aucP: B.aucP, bss: B.bss, n: B.nEval, nEff: B.nEff, base: B.base }), JSON.stringify(rs.map((x) => [x.auc, x.valid])));
  assert.ok(B.auc > 0.55 && B.valid, `pola tren harus ditemukan (AUC ${B.auc})`);
});
test("binomial belajar: suara harian bebas bocoran & masuk backtest sinyal", () => {
  const n = 1800, r = rng(9), D = { d: [], o: [], h: [], l: [], c: [], v: [], n }; let p = 100, g = 1;
  for (let i = 0; i < n; i++) { if (r() < 1 / 60) g = -g; const op = p; p *= Math.exp(g * 0.005 + (r() - 0.5) * 0.04);
    D.d.push(`d${i}`); D.o.push(op); D.h.push(Math.max(op, p) * 1.004); D.l.push(Math.min(op, p) * 0.996); D.c.push(p); D.v.push(1); }
  const full = E.binoLearn(D), m = 1400, cut = {}; for (const k of ["d", "o", "h", "l", "c", "v"]) cut[k] = D[k].slice(0, m); cut.n = m;
  const part = E.binoLearn(cut);
  for (let t = 0; t < m; t++) assert.equal(part.votes[t], full.votes[t], `suara hari ${t} berubah saat data masa depan dipotong (bocoran)`);
  assert.ok(full.votes.some((v) => v === 1) && full.votes.some((v) => v === -1), "harus ada suara beli & jual");
  const B0 = E.signalBacktest(D.d, D.c), B1 = E.signalBacktest(D.d, D.c, { extra: full.votes });
  assert.ok(B1.trades.length > 0 && B0.trades.length > 0); assert.notDeepEqual(B1.events.map((e) => e.date), B0.events.map((e) => e.date));
});
test("target keluar dari data & kunci untung", () => {
  const D = walk(1500, 21), L = E.exitTargets(D, { stopK: 2, dir: 1 }), S = E.exitTargets(D, { stopK: 1.5, dir: -1 });
  assert.ok(L && L.k1 >= 0.75 && L.k2 > L.k1 && L.p1 >= 0.6 && L.p2 >= 0.25, JSON.stringify({ k1: L.k1, k2: L.k2, p1: L.p1, p2: L.p2 }));
  assert.ok(S && S.k1 >= 0.75 && S.k2 > S.k1);
  for (let i = 1; i < L.curve.length; i++) assert.ok(L.curve[i][1] <= L.curve[i - 1][1] + 1e-12, "peluang harus turun saat target makin jauh");
  assert.equal(E.trailStop(1, 100, 100.5, 1, 97), 97); // untung < 1 ATR: stop tetap
  assert.equal(E.trailStop(1, 100, 101.2, 1, 97), 100); // ≥ 1 ATR: minimal impas
  assert.equal(E.trailStop(1, 100, 102.5, 1, 97), 101.5); // ≥ 2 ATR: 1 ATR di bawah harga terbaik
  assert.equal(E.trailStop(1, 100, 104, 1, 97), 103.25); // ≥ 3 ATR: 0,75 ATR
  assert.equal(E.trailStop(1, 100, 101.2, 1, 100.6), 100.6); // stop tidak pernah turun
  assert.equal(E.trailStop(-1, 100, 97, 1, 103), 97.75); // short: untung 3 ATR → stop 0,75 ATR di atas harga terbaik
});
test("target T2 memilih nilai harapan tertinggi pada tren yang ditanam", () => {
  const r = rng(13), n = 1500, D = { d: [], o: [], h: [], l: [], c: [], v: [], n }; let p = 100;
  for (let i = 0; i < n; i++) { const op = p; p *= Math.exp(0.004 + (r() - 0.5) * 0.04); D.d.push(`d${i}`); D.o.push(op); D.h.push(Math.max(op, p) * 1.004); D.l.push(Math.min(op, p) * 0.996); D.c.push(p); D.v.push(1); }
  const T = E.exitTargets(D, { stopK: 2, dir: 1 }), R = E.exitTargets(walk(1500, 3), { stopK: 2, dir: 1 });
  assert.ok(T.ev2 >= T.curve.filter((x) => x[0] >= T.k1 + 0.5 && x[1] >= 0.25).reduce((m, x) => Math.max(m, x[2]), -1e9) - 1e-9, "T2 harus di nilai harapan tertinggi");
  assert.ok(T.k2 > R.k2, `tren naik → target lebih jauh (tren ${T.k2} vs acak ${R.k2})`); console.log("tren", T.k1, T.k2, T.ev2.toFixed(2), "| acak", R.k1, R.k2, R.ev2.toFixed(2));
});
