importScripts("engine.js");
self.onmessage = (e) => {
  const { id, cfg } = e.data;
  const progress = (msg, frac) => self.postMessage({ id, type: "progress", msg, frac });
  try {
    const res = cfg.mode === "bond" ? MCEngine.runBond(cfg, progress) : MCEngine.runPrice(cfg, progress);
    self.postMessage({ id, type: "done", res });
  } catch (err) {
    self.postMessage({ id, type: "error", msg: String(err && err.message || err) });
  }
};
