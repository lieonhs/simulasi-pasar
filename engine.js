/* engine.js — mesin simulasi Monte Carlo (dipakai di browser via Web Worker & di Node untuk tes)
 * Model harga : GBM, GJR-GARCH(1,1)-t (MLE), Merton jump-diffusion, block bootstrap
 * Model yield : Vasicek, CIR (kalibrasi OLS)
 * Validasi    : backtest out-of-sample -> PIT, coverage interval, Kupiec
 */
(function (root) {
  "use strict";

  // ---------- RNG (seeded) ----------
  function makeRng(seed) {
    let a = seed >>> 0 || 1;
    let spare = null;
    const u = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const normal = () => {
      if (spare !== null) { const s = spare; spare = null; return s; }
      let x, y, s;
      do { x = 2 * u() - 1; y = 2 * u() - 1; s = x * x + y * y; } while (s >= 1 || s === 0);
      const m = Math.sqrt(-2 * Math.log(s) / s);
      spare = y * m; return x * m;
    };
    const gamma = (k) => { // Marsaglia–Tsang, scale 1
      if (k < 1) return gamma(k + 1) * Math.pow(u(), 1 / k);
      const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
      for (;;) {
        let x, v;
        do { x = normal(); v = 1 + c * x; } while (v <= 0);
        v = v * v * v;
        const U = u();
        if (U < 1 - 0.0331 * x ** 4 || Math.log(U) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
      }
    };
    const studentT = (nu) => normal() / Math.sqrt((2 * gamma(nu / 2)) / nu);
    const poisson = (lam) => { if (lam <= 0) return 0; const L = Math.exp(-lam); let k = 0, p = 1; do { k++; p *= u(); } while (p > L); return k - 1; };
    const int = (n) => Math.floor(u() * n);
    return { u, normal, studentT, poisson, int };
  }

  // ---------- statistik dasar ----------
  const mean = (x) => x.reduce((s, v) => s + v, 0) / x.length;
  function std(x, ddof = 1) { const m = mean(x); return Math.sqrt(x.reduce((s, v) => s + (v - m) ** 2, 0) / (x.length - ddof)); }
  function skew(x) { const m = mean(x), s = std(x, 0); return x.reduce((a, v) => a + ((v - m) / s) ** 3, 0) / x.length; }
  function exKurt(x) { const m = mean(x), s = std(x, 0); return x.reduce((a, v) => a + ((v - m) / s) ** 4, 0) / x.length - 3; }
  function quantileSorted(s, p) { const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); }
  function quantiles(arr, ps) { const s = Float64Array.from(arr).sort(); return ps.map((p) => quantileSorted(s, p)); }
  function logReturns(px) { const r = new Array(px.length - 1); for (let i = 1; i < px.length; i++) r[i - 1] = Math.log(px[i] / px[i - 1]); return r; }

  function lgamma(z) { // Lanczos
    const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
    z -= 1; let x = c[0]; for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
    const t = z + g + 0.5; return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
  }
  function chi2sf1(x) { // P(chi2_1 > x) = erfc(sqrt(x/2))
    const z = Math.sqrt(x / 2), t = 1 / (1 + 0.5 * z);
    return t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  }
  function kupiec(x, n, p) {
    if (n === 0) return NaN;
    const ph = x / n;
    const l0 = (n - x) * Math.log(1 - p) + x * Math.log(p);
    const l1 = (x > 0 ? x * Math.log(ph) : 0) + (n - x > 0 ? (n - x) * Math.log(1 - ph) : 0);
    return chi2sf1(Math.max(0, -2 * (l0 - l1)));
  }

  // ---------- Nelder–Mead ----------
  function nelderMead(f, x0, step, maxIter = 600, tol = 1e-8) {
    const n = x0.length;
    let pts = [x0.slice()];
    for (let i = 0; i < n; i++) { const p = x0.slice(); p[i] += step[i]; pts.push(p); }
    let vals = pts.map(f);
    for (let it = 0; it < maxIter; it++) {
      const ord = vals.map((v, i) => i).sort((a, b) => vals[a] - vals[b]);
      pts = ord.map((i) => pts[i]); vals = ord.map((i) => vals[i]);
      if (Math.abs(vals[n] - vals[0]) < tol * (Math.abs(vals[0]) + 1e-12)) break;
      const c = new Array(n).fill(0);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += pts[i][j] / n;
      const lerp = (t) => c.map((cj, j) => cj + t * (pts[n][j] - cj));
      const xr = lerp(-1), fr = f(xr);
      if (fr < vals[0]) { const xe = lerp(-2), fe = f(xe); if (fe < fr) { pts[n] = xe; vals[n] = fe; } else { pts[n] = xr; vals[n] = fr; } }
      else if (fr < vals[n - 1]) { pts[n] = xr; vals[n] = fr; }
      else {
        const xc = fr < vals[n] ? lerp(-0.5) : lerp(0.5), fc = f(xc);
        if (fc < Math.min(fr, vals[n])) { pts[n] = xc; vals[n] = fc; }
        else { for (let i = 1; i <= n; i++) { pts[i] = pts[i].map((v, j) => pts[0][j] + 0.5 * (v - pts[0][j])); vals[i] = f(pts[i]); } }
      }
    }
    let b = 0; for (let i = 1; i <= n; i++) if (vals[i] < vals[b]) b = i;
    return { x: pts[b], fx: vals[b] };
  }

  // ---------- GJR-GARCH(1,1)-t ----------
  // dalam persen; variance targeting: omega = s2*(1 - alpha - gamma/2 - beta)
  function garchFit(r) {
    const x = r.map((v) => v * 100), mu = mean(x), e = x.map((v) => v - mu);
    const s2 = e.reduce((s, v) => s + v * v, 0) / e.length;
    const nll = (p) => {
      const [a, g, b, nu] = p;
      const pers = a + g / 2 + b;
      if (a < 0 || b < 0 || a + g < 0 || pers >= 0.9995 || nu <= 2.05 || nu > 200) return 1e12;
      const om = s2 * (1 - pers);
      const C = lgamma((nu + 1) / 2) - lgamma(nu / 2) - 0.5 * Math.log(Math.PI * (nu - 2));
      let h = s2, ll = 0;
      for (let t = 0; t < e.length; t++) {
        ll += C - 0.5 * Math.log(h) - ((nu + 1) / 2) * Math.log(1 + (e[t] * e[t]) / ((nu - 2) * h));
        h = om + (a + (e[t] < 0 ? g : 0)) * e[t] * e[t] + b * h;
      }
      return -ll;
    };
    let best = null;
    for (const x0 of [[0.06, 0.04, 0.88, 6], [0.12, 0.0, 0.8, 4], [0.03, 0.06, 0.93, 10]]) {
      let res = nelderMead(nll, x0, [0.03, 0.03, 0.05, 2]);
      res = nelderMead(nll, res.x, [0.01, 0.01, 0.02, 1]);
      if (!best || res.fx < best.fx) best = res;
    }
    const [alpha, gamma, beta, nu] = best.x;
    const omega = s2 * (1 - alpha - gamma / 2 - beta);
    return { alpha, gamma, beta, nu, omega, mu, s2, persistence: alpha + gamma / 2 + beta, ll: -best.fx };
  }
  function garchNextVar(r, p) { // varian 1 langkah ke depan setelah observasi terakhir (persen^2)
    let h = p.s2;
    for (let t = 0; t < r.length; t++) { const e = r[t] * 100 - p.mu; h = p.omega + (p.alpha + (e < 0 ? p.gamma : 0)) * e * e + p.beta * h; }
    return h;
  }

  // ---------- simulator harga: return matriks log-return kumulatif (Float64Array per path) ----------
  // Semua fungsi: (r, days, n, mu, rng, ctx) -> Array<Float64Array(days)> berisi log harga relatif kumulatif
  function cumulate(n, days, step) {
    const out = new Array(n);
    for (let i = 0; i < n; i++) { const p = new Float64Array(days); let c = 0; for (let t = 0; t < days; t++) { c += step(i, t); p[t] = c; } out[i] = p; }
    return out;
  }
  const PRICE_MODELS = {
    gbm: {
      label: "GBM",
      prep(r) { return { sig: std(r) }; },
      sim(ctx, days, n, mu, rng) { const s = ctx.sig; return cumulate(n, days, () => mu - 0.5 * s * s + s * rng.normal()); },
      info(ctx, ppy) { return { "Vol tahunan": ctx.sig * Math.sqrt(ppy) }; },
    },
    garch: {
      label: "GARCH-t",
      prep(r, cache) {
        const p = cache && cache.params ? cache.params : garchFit(r);
        return { p, h0: garchNextVar(r, p) };
      },
      sim(ctx, days, n, mu, rng) {
        const { p, h0 } = ctx, sc = Math.sqrt((p.nu - 2) / p.nu);
        const out = new Array(n);
        for (let i = 0; i < n; i++) {
          const path = new Float64Array(days); let h = h0, c = 0;
          for (let t = 0; t < days; t++) {
            const e = Math.sqrt(h) * rng.studentT(p.nu) * sc;
            c += mu + e / 100; path[t] = c;
            h = p.omega + (p.alpha + (e < 0 ? p.gamma : 0)) * e * e + p.beta * h;
          }
          out[i] = path;
        }
        return out;
      },
      info(ctx, ppy) {
        const p = ctx.p;
        return { alpha: p.alpha, gamma: p.gamma, beta: p.beta, "nu (ekor)": p.nu, persistence: p.persistence,
          "Half-life shock (hari)": Math.log(0.5) / Math.log(p.persistence),
          "Vol tahunan saat ini": Math.sqrt(ctx.h0) / 100 * Math.sqrt(ppy),
          "Vol tahunan jangka panjang": Math.sqrt(p.s2) / 100 * Math.sqrt(ppy) };
      },
    },
    jump: {
      label: "Jump (Merton)",
      prep(r) {
        const m = mean(r), sAll = std(r);
        const J = r.filter((v) => Math.abs(v - m) > 3 * sAll), N = r.filter((v) => Math.abs(v - m) <= 3 * sAll);
        const lam = J.length / r.length, mj = J.length > 1 ? mean(J) : 0, sj = J.length > 1 ? std(J) : 0;
        return { lam, mj, sj, sig: std(N), comp: lam * (Math.exp(mj + 0.5 * sj * sj) - 1) };
      },
      sim(ctx, days, n, mu, rng) {
        const { lam, mj, sj, sig, comp } = ctx;
        return cumulate(n, days, () => { const k = rng.poisson(lam); return mu - 0.5 * sig * sig - comp + sig * rng.normal() + (k ? k * mj + Math.sqrt(k) * sj * rng.normal() : 0); });
      },
      info(ctx, ppy) { return { "Jump per tahun": ctx.lam * ppy, "Rata-rata jump": ctx.mj, "Std jump": ctx.sj, "Vol difusi tahunan": ctx.sig * Math.sqrt(ppy) }; },
    },
    bootstrap: {
      label: "Bootstrap",
      prep(r) { const m = mean(r); return { r: Float64Array.from(r, (v) => v - m) }; },
      sim(ctx, days, n, mu, rng) {
        const r = ctx.r, B = 10, L = r.length;
        const out = new Array(n);
        for (let i = 0; i < n; i++) {
          const path = new Float64Array(days); let c = 0, t = 0;
          while (t < days) { const s = rng.int(L - B); for (let k = 0; k < B && t < days; k++, t++) { c += r[s + k] + mu; path[t] = c; } }
          out[i] = path;
        }
        return out;
      },
      info() { return { "Panjang blok": 10 }; },
    },
  };

  // ---------- model yield ----------
  function fitRate(y, dt, kind) {
    const y0 = y.slice(0, -1), y1 = y.slice(1), n = y0.length;
    let a, b, sigE;
    if (kind === "vasicek") {
      const mx = mean(y0), my = mean(y1);
      let sxy = 0, sxx = 0; for (let i = 0; i < n; i++) { sxy += (y0[i] - mx) * (y1[i] - my); sxx += (y0[i] - mx) ** 2; }
      b = sxy / sxx; a = my - b * mx;
      sigE = std(y1.map((v, i) => v - (a + b * y0[i])), 2) * Math.sqrt((n - 1) / (n - 2));
    } else {
      // (y1-y0)/sqrt(y0) = c1/sqrt(y0) + c2*sqrt(y0) + e
      let s11 = 0, s12 = 0, s22 = 0, t1 = 0, t2 = 0; const z = [], X1 = [], X2 = [];
      for (let i = 0; i < n; i++) { const q = Math.sqrt(Math.max(y0[i], 1e-6)); const x1 = 1 / q, x2 = q, zz = (y1[i] - y0[i]) / q;
        s11 += x1 * x1; s12 += x1 * x2; s22 += x2 * x2; t1 += x1 * zz; t2 += x2 * zz; z.push(zz); X1.push(x1); X2.push(x2); }
      const det = s11 * s22 - s12 * s12, c1 = (s22 * t1 - s12 * t2) / det, c2 = (s11 * t2 - s12 * t1) / det;
      a = c1; b = 1 + c2;
      sigE = std(z.map((v, i) => v - c1 * X1[i] - c2 * X2[i]));
    }
    b = Math.min(b, 0.9999);
    const kappa = -Math.log(b) / dt;
    return { kappa, theta: a / (1 - b), sigma: sigE / Math.sqrt(dt), halfLife: Math.log(2) / kappa };
  }
  function simRate(p, y0, days, n, dt, kind, rng) {
    const out = new Array(n), sq = Math.sqrt(dt);
    for (let i = 0; i < n; i++) {
      const path = new Float64Array(days); let y = y0;
      for (let t = 0; t < days; t++) {
        const z = rng.normal();
        if (kind === "vasicek") y = y + p.kappa * (p.theta - y) * dt + p.sigma * sq * z;
        else y = Math.max(0, y + p.kappa * (p.theta - y) * dt + p.sigma * Math.sqrt(Math.max(y, 0) * dt) * z);
        path[t] = y;
      }
      out[i] = path;
    }
    return out;
  }
  function bondPrice(ytm, coupon, maturity, freq = 2, face = 100) {
    const N = Math.max(1, Math.round(maturity * freq)), c = (coupon / freq) * face, q = 1 + ytm / freq;
    let pv = 0, df = 1; for (let t = 1; t <= N; t++) { df /= q; pv += c * df; } return pv + face * df;
  }

  // ---------- ringkasan ----------
  const PCTS = [0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95];
  function fanFromPaths(paths, transform) {
    const days = paths[0].length, n = paths.length, fan = PCTS.map(() => new Array(days));
    const col = new Float64Array(n);
    for (let t = 0; t < days; t++) {
      for (let i = 0; i < n; i++) col[i] = transform(paths[i][t]);
      col.sort();
      PCTS.forEach((p, k) => (fan[k][t] = quantileSorted(col, p)));
    }
    return fan;
  }
  function histogram(vals, bins = 60) {
    const [lo, hi] = quantiles(vals, [0.005, 0.995]);
    const w = (hi - lo) / bins || 1, counts = new Array(bins).fill(0);
    for (const v of vals) { if (v < lo || v > hi) continue; counts[Math.min(bins - 1, Math.floor((v - lo) / w))]++; }
    return { edges: counts.map((_, i) => lo + (i + 0.5) * w), counts };
  }
  function priceSummary(endPx, s0) {
    const ret = endPx.map((v) => v / s0 - 1), sr = Float64Array.from(ret).sort();
    const var95 = -quantileSorted(sr, 0.05), var99 = -quantileSorted(sr, 0.01);
    let cs = 0, cn = 0; for (const v of sr) { if (v <= -var95) { cs += v; cn++; } else break; }
    const q = quantiles(endPx, PCTS);
    return { q, mean: mean(endPx), probDown: ret.filter((v) => v < 0).length / ret.length,
      probUp10: ret.filter((v) => v > 0.1).length / ret.length, probDown10: ret.filter((v) => v < -0.1).length / ret.length,
      var95, var99, cvar95: -(cs / Math.max(cn, 1)) };
  }

  // ---------- backtest: PIT dari nilai realisasi pada distribusi simulasi ----------
  // simTerminal(trainIdxEnd, h, cache) -> Float64Array nilai terminal (relatif / yield); realized(i,h)
  function pitBacktest({ nObs, h, minTrain, maxOrigins, simTerminal, realized, refitEvery = 1 }) {
    const last = nObs - 1 - h; // origin terakhir yang masih punya realisasi
    const first = Math.max(minTrain, last - 500);
    if (last <= first) return null;
    const step = Math.max(1, Math.floor((last - first) / maxOrigins));
    const pits = [], cache = {};
    let k = 0;
    for (let o = last; o >= first && pits.length < maxOrigins; o -= step, k++) {
      if (k % refitEvery === 0) cache.params = null;
      const sims = simTerminal(o, h, cache);
      const real = realized(o, h);
      let below = 0; for (let i = 0; i < sims.length; i++) if (sims[i] <= real) below++;
      pits.push((below + 0.5) / (sims.length + 1));
    }
    return summarizePits(pits, h, step, last - first);
  }
  function summarizePits(pits, h, step, span) {
    const n = pits.length;
    const cov = [0.5, 0.8, 0.9, 0.95].map((c) => ({ nominal: c, actual: pits.filter((p) => Math.abs(p - 0.5) <= c / 2).length / n }));
    const breaches = pits.filter((p) => p < 0.05).length;
    const tooHigh = pits.filter((p) => p > 0.95).length;
    const mae = mean(cov.map((c) => Math.abs(c.actual - c.nominal)));
    const hist = new Array(10).fill(0); pits.forEach((p) => hist[Math.min(9, Math.floor(p * 10))]++);
    return { n, h, step, effN: Math.max(1, Math.floor(span / Math.max(h, step))), cov, breachRate: breaches / n, upperRate: tooHigh / n,
      kupiecP: kupiec(breaches, n, 0.05), calibErr: mae, pitHist: hist, medianBias: mean(pits) - 0.5,
      grade: mae < 0.05 ? "Baik" : mae < 0.1 ? "Cukup" : "Buruk" };
  }

  // ---------- runner utama ----------
  function detectPpy(dates, type) {
    if (/CRYPTO/i.test(type || "")) return 365;
    let one = 0; for (let i = 1; i < Math.min(dates.length, 400); i++) { const d = (new Date(dates[i]) - new Date(dates[i - 1])) / 864e5; if (d === 1) one++; }
    return one / Math.min(dates.length - 1, 399) > 0.85 ? 365 : 252;
  }
  function driftPerStep(r, mode, custom, ppy) {
    if (mode === "hist") return mean(r);
    if (mode === "custom") return Math.log(1 + custom) / ppy;
    return 0;
  }

  function runPrice(cfg, progress = () => {}) {
    const px = cfg.prices, r = logReturns(px), ppy = cfg.ppy || detectPpy(cfg.dates, cfg.type);
    const rng = makeRng(cfg.seed || 42), s0 = px[px.length - 1], mu = driftPerStep(r, cfg.drift, cfg.customDrift, ppy);
    const res = { mode: "price", s0, ppy, nObs: r.length,
      stats: { volAnn: std(r) * Math.sqrt(ppy), retAnn: Math.exp(mean(r) * ppy) - 1, skew: skew(r), exKurt: exKurt(r), muUsed: mu * ppy, maxDD: maxDrawdown(px) },
      models: {} };
    cfg.models.forEach((m, mi) => {
      progress(`Simulasi ${PRICE_MODELS[m].label}…`, mi / cfg.models.length);
      const M = PRICE_MODELS[m], ctx = M.prep(r);
      const paths = M.sim(ctx, cfg.days, cfg.sims, mu, rng);
      const end = paths.map((p) => s0 * Math.exp(p[p.length - 1]));
      res.models[m] = { label: M.label, info: M.info(ctx, ppy), fan: fanFromPaths(paths, (v) => s0 * Math.exp(v)), summary: priceSummary(end, s0), hist: histogram(end),
        samplePaths: paths.slice(0, 25).map((p) => Array.from(p, (v) => s0 * Math.exp(v))) };
    });
    if (cfg.backtest) {
      cfg.models.forEach((m, mi) => {
        progress(`Backtest ${PRICE_MODELS[m].label}…`, mi / cfg.models.length);
        res.models[m].backtest = backtestPriceModel(m, px, cfg.days, mu, cfg.seed || 7);
        res.models[m].var1d = backtestVar1d(m, px, cfg.seed || 11);
      });
    }
    return res;
  }
  function trainSlice(px, o, win = 1000) { return logReturns(px.slice(Math.max(0, o - win), o + 1)); }
  function backtestPriceModel(m, px, h, mu, seed, nsim = 1500) {
    const M = PRICE_MODELS[m], rng = makeRng(seed);
    return pitBacktest({ nObs: px.length, h, minTrain: 250, maxOrigins: 60, refitEvery: m === "garch" ? 6 : 1,
      simTerminal(o, hh, cache) {
        const r = trainSlice(px, o);
        const ctx = M.prep(r, cache); if (m === "garch") cache.params = ctx.p;
        const paths = M.sim(ctx, hh, nsim, mu, rng);
        return Float64Array.from(paths, (p) => p[hh - 1]);
      },
      realized(o, hh) { return Math.log(px[o + hh] / px[o]); } });
  }
  function backtestVar1d(m, px, seed, nTest = 250, nsim = 1000) {
    const M = PRICE_MODELS[m], rng = makeRng(seed), n = px.length;
    if (n < 400) return null;
    let hits = 0, cnt = 0, params = null;
    for (let o = n - 1 - nTest, k = 0; o < n - 1; o++, k++) {
      const r = trainSlice(px, o);
      const ctx = M.prep(r, m === "garch" && k % 20 !== 0 ? { params } : null);
      if (m === "garch") params = ctx.p;
      const sims = Float64Array.from(M.sim(ctx, 1, nsim, 0, rng), (p) => p[0]).sort();
      if (Math.log(px[o + 1] / px[o]) < quantileSorted(sims, 0.05)) hits++;
      cnt++;
    }
    return { n: cnt, rate: hits / cnt, p: kupiec(hits, cnt, 0.05) };
  }
  function maxDrawdown(px) { let pk = px[0], dd = 0; for (const v of px) { pk = Math.max(pk, v); dd = Math.min(dd, v / pk - 1); } return dd; }

  function runBond(cfg, progress = () => {}) {
    const y = cfg.yields, dt = 1 / 252, rng = makeRng(cfg.seed || 42), y0 = y[y.length - 1];
    const p0 = bondPrice(y0, cfg.coupon, cfg.maturity);
    const dy = y.slice(1).map((v, i) => v - y[i]);
    const res = { mode: "bond", y0, p0, nObs: y.length, stats: { volBpAnn: std(dy) * Math.sqrt(252) * 1e4, min: Math.min(...y), max: Math.max(...y) }, models: {} };
    ["vasicek", "cir"].forEach((kind, ki) => {
      progress(`Simulasi ${kind}…`, ki / 2);
      const p = fitRate(y, dt, kind), paths = simRate(p, y0, cfg.days, cfg.sims, dt, kind, rng);
      const endY = paths.map((q) => q[q.length - 1]);
      const carry = cfg.coupon * 100 * cfg.days / 252;
      const endP = endY.map((v) => bondPrice(v, cfg.coupon, Math.max(cfg.maturity - cfg.days / 252, 0.01)));
      const tr = endP.map((v) => (v + carry) / p0 - 1), str = Float64Array.from(tr).sort();
      const out = { label: kind === "vasicek" ? "Vasicek" : "CIR",
        info: { "kappa (kecepatan balik)": p.kappa, "Half-life (tahun)": p.halfLife, "theta (rata-rata jk panjang)": p.theta, sigma: p.sigma },
        fan: fanFromPaths(paths, (v) => v * 100), yq: quantiles(endY, PCTS), pq: quantiles(endP, PCTS),
        trMedian: quantileSorted(str, 0.5), var95: -quantileSorted(str, 0.05), probLoss: tr.filter((v) => v < 0).length / tr.length,
        hist: histogram(endP), negProb: endY.filter((v) => v < 0).length / endY.length,
        samplePaths: paths.slice(0, 25).map((q) => Array.from(q, (v) => v * 100)) };
      if (cfg.backtest) {
        const rb = makeRng((cfg.seed || 7) + ki);
        out.backtest = pitBacktest({ nObs: y.length, h: cfg.days, minTrain: 250, maxOrigins: 60,
          simTerminal(o, hh) { const tr_ = y.slice(Math.max(0, o - 1000), o + 1); const pp = fitRate(tr_, dt, kind);
            return Float64Array.from(simRate(pp, tr_[tr_.length - 1], hh, 1500, dt, kind, rb), (q) => q[hh - 1]); },
          realized(o, hh) { return y[o + hh]; } });
      }
      res.models[kind] = out;
    });
    return res;
  }

  const api = { makeRng, garchFit, garchNextVar, fitRate, simRate, bondPrice, runPrice, runBond, kupiec, quantiles, logReturns, detectPpy, PRICE_MODELS, PCTS, mean, std };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.MCEngine = api;
})(typeof self !== "undefined" ? self : this);
