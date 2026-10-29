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
