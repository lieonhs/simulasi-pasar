importScripts("engine.js?v=" + (new URL(self.location.href).searchParams.get("v") || ""));
// harga masuk / stop / target ringkas untuk Radar & Hidden gems (aturan harga yang sama dengan Rencana aksi)
function planLite(cfg) { try { const P = MCEngine.actionPlan(cfg.D, { sims: 400, strats: [], isIdx: !!(cfg.o && cfg.o.isIdx), crypto: !!(cfg.o && cfg.o.ppy === 365), seed: 3 });
  return { entry: P.entry, entryHi: P.entryHi, stop: P.stop, t1: P.t1, t2: P.t2, rr1: P.rr1, chase: P.chase, H: P.H, pT1: P.pr ? P.pr.t1 : null, pStop: P.pr ? P.pr.stop : null, expR: P.pr ? P.pr.expR : null, px: P.px }; } catch (e) { return null; } }
self.onmessage = (e) => {
  const { id, type, cfg } = e.data;
  const progress = (msg, frac) => self.postMessage({ id, type: "progress", msg, frac });
  try {
    let res;
    if (type === "plan") res = MCEngine.evalPlan(cfg);
    else if (type === "strat") res = MCEngine.runStrategy(cfg.id, cfg.D, cfg.o);
    else if (type === "stratAll") res = MCEngine.runAllStrategies(cfg.D, cfg.o);
    else if (type === "ml") res = MCEngine.mlModel(cfg.D, { ...cfg.o, progress });
    else if (type === "bino") res = MCEngine.binoLearn(cfg.D, cfg.o);
    else if (type === "radar") res = { ...MCEngine.radarAsset(cfg.D, cfg.o), plan: planLite(cfg) };
    else if (type === "gem") res = { ...MCEngine.radarAsset(cfg.D, cfg.o), gem: MCEngine.gemAsset(cfg.D, cfg.o), plan: planLite(cfg) };
    else if (type === "noise") res = MCEngine.noiseBand(cfg.bars, cfg.o);
    else if (type === "math") res = MCEngine.mathLab(cfg.px, cfg.o);
    else if (type === "qport") res = MCEngine.quantPortfolio(cfg.series, cfg.opt);
    else if (type === "qbt") res = MCEngine.backtest(cfg.series, cfg.opt);
    else if (type === "screen") res = MCEngine.screenAsset(cfg.a, cfg.bench, cfg.o);
    else if (type === "probEnd") res = MCEngine.probEnd(cfg.model, cfg.K, cfg.r, cfg.T);
    else if (type === "ardl") res = MCEngine.ardl(cfg.a, cfg.xs);
    else if (type === "compare") {
      // cfg.series: [{dates, values, type, name}], cfg.benchIdx, cfg.sim: {days, sims, models, drift, customDrift}
      const stats = MCEngine.compareStats(cfg.series, cfg.benchIdx);
      const sims = cfg.series.map((s, i) => {
        progress(`Simulasi pembanding ${i + 1}/${cfg.series.length}…`, i / cfg.series.length);
        const r = MCEngine.runPrice({ ...cfg.sim, prices: s.values, dates: s.dates, type: s.type, backtest: false, keepPaths: false, seed: 101 + i });
        const out = {};
        for (const [k, m] of Object.entries(r.models)) out[k] = { label: m.label, summary: m.summary, probUp: m.probUp[m.probUp.length - 1] };
        return { s0: r.s0, models: out };
      });
      res = { stats, sims };
    } else res = cfg.mode === "bond" ? MCEngine.runBond(cfg, progress) : MCEngine.runPrice(cfg, progress);
    self.postMessage({ id, type: "done", res });
  } catch (err) {
    self.postMessage({ id, type: "error", msg: String((err && err.message) || err) });
  }
};
