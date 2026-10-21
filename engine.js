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

  // ---------- ARCH(1)-t (pembanding GARCH; beta = 0, tanpa leverage) ----------
  function archFit(r) {
    const x = r.map((v) => v * 100), mu = mean(x), e = x.map((v) => v - mu);
    const s2 = e.reduce((s, v) => s + v * v, 0) / e.length;
    const nll = ([a, nu]) => {
      if (a < 0 || a >= 0.999 || nu <= 2.05 || nu > 200) return 1e12;
      const om = s2 * (1 - a), C = lgamma((nu + 1) / 2) - lgamma(nu / 2) - 0.5 * Math.log(Math.PI * (nu - 2));
      let h = s2, ll = 0;
      for (let t = 0; t < e.length; t++) { ll += C - 0.5 * Math.log(h) - ((nu + 1) / 2) * Math.log(1 + (e[t] * e[t]) / ((nu - 2) * h)); h = om + a * e[t] * e[t]; }
      return -ll;
    };
    let best = null;
    for (const x0 of [[0.2, 5], [0.4, 8], [0.1, 4]]) { const r1 = nelderMead(nll, x0, [0.1, 2]); if (!best || r1.fx < best.fx) best = r1; }
    const [alpha, nu] = best.x;
    return { alpha, gamma: 0, beta: 0, nu, omega: s2 * (1 - alpha), mu, s2, persistence: alpha, ll: -best.fx };
  }
  PRICE_MODELS.arch = {
    label: "ARCH-t",
    prep(r, cache) { const p = cache && cache.params ? cache.params : archFit(r); return { p, h0: garchNextVar(r, p) }; },
    sim(ctx, days, n, mu, rng) { return PRICE_MODELS.garch.sim(ctx, days, n, mu, rng); },
    info(ctx, ppy) { const p = ctx.p; return { alpha: p.alpha, "nu (ekor)": p.nu, "Vol tahunan saat ini": Math.sqrt(ctx.h0) / 100 * Math.sqrt(ppy), "Vol tahunan jangka panjang": Math.sqrt(p.s2) / 100 * Math.sqrt(ppy) }; },
  };
  // rata-rata volatilitas yang diharapkan GARCH/ARCH sepanjang horizon (tahunan, desimal)
  function condVolHorizon(ctx, days, ppy) {
    const p = ctx.p; let h = ctx.h0, s = 0;
    for (let k = 0; k < days; k++) { s += h; h = p.s2 + p.persistence * (h - p.s2); }
    return Math.sqrt(s / days) / 100 * Math.sqrt(ppy);
  }

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

  // ---------- cache path untuk evaluasi rencana (hanya run utama) ----------
  const CACHE = { s0: null, days: 0, models: {} };
  function storePaths(m, paths) {
    const days = paths[0].length, keep = Math.min(paths.length, Math.max(2000, Math.floor(2e6 / days)));
    const flat = new Float32Array(keep * days);
    for (let i = 0; i < keep; i++) flat.set(paths[i], i * days);
    CACHE.models[m] = { flat, n: keep, days };
  }

  // Fraksi harga BEI (Peraturan II-A, berlaku sejak 2016)
  function idxTick(p) { return p < 200 ? 1 : p < 500 ? 2 : p < 2000 ? 5 : p < 5000 ? 10 : 25; }
  function roundTick(p, isIdx, dir) {
    if (!isIdx) { const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(p))) - 3); return Math.round(p / mag) * mag; }
    const t = idxTick(p); return (dir > 0 ? Math.ceil(p / t) : dir < 0 ? Math.floor(p / t) : Math.round(p / t)) * t;
  }

  /* Peluang tersentuh untuk grid level & evaluasi rencana jual bertahap.
   * plan = { model, entry, units (lembar/unit total), unitPerLot, feeBuy, feeSell, isIdx,
   *          targets: [{price, lots}], stop (harga, boleh null), auto: bool, probs: [0.5,0.3,0.15], stopProb: 0.2, split:[.4,.3,.3] } */
  function evalPlan(plan) {
    const C = CACHE.models[plan.model];
    if (!C) throw new Error("Jalankan simulasi dulu");
    const { flat, n, days } = C, s0 = CACHE.s0;
    const maxR = new Float32Array(n), minR = new Float32Array(n), endR = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let mx = -Infinity, mn = Infinity; const o = i * days;
      for (let t = 0; t < days; t++) { const v = flat[o + t]; if (v > mx) mx = v; if (v < mn) mn = v; }
      maxR[i] = Math.exp(mx); minR[i] = Math.exp(mn); endR[i] = Math.exp(flat[o + days - 1]);
    }
    const sMax = Float64Array.from(maxR).sort(), sMin = Float64Array.from(minR).sort();
    const lots = Math.max(0, plan.isIdx ? Math.floor(plan.lots) : +plan.lots); // IDX: lot bulat; kripto/lainnya: boleh pecahan
    let targets = plan.targets, stop = plan.stop;
    if (plan.auto) {
      const probs = plan.probs || [0.5, 0.3, 0.15], split = plan.split || [0.4, 0.3, 0.3];
      let left = lots;
      targets = probs.map((p, k) => {
        const lvl = roundTick(s0 * quantileSorted(sMax, 1 - p), plan.isIdx, 1);
        const l = k === probs.length - 1 ? left : Math.min(left, plan.isIdx ? Math.round(lots * split[k]) : lots * split[k]);
        left -= l; return { price: lvl, lots: l };
      });
      stop = roundTick(s0 * quantileSorted(sMin, plan.stopProb ?? 0.2), plan.isIdx, -1);
    }
    targets = targets.filter((t) => t.price > 0 && t.lots > 0).sort((a, b) => a.price - b.price);
    const upl = plan.unitPerLot || 1, fb = plan.feeBuy || 0, fs = plan.feeSell || 0, entry = plan.entry;
    const cost = lots * upl * entry * (1 + fb);

    // evaluasi path-by-path
    const pnlPlan = new Float64Array(n), pnlHold = new Float64Array(n);
    const hit = targets.map(() => ({ n: 0, days: [] })); let stopHits = 0; const stopDays = [];
    let unsoldSum = 0;
    for (let i = 0; i < n; i++) {
      const o = i * days; let proceeds = 0, rem = lots, k = 0, stopped = false;
      for (let t = 0; t < days && rem > 0; t++) {
        const p = s0 * Math.exp(flat[o + t]);
        if (stop && p <= stop) { proceeds += rem * upl * p * (1 - fs); rem = 0; stopped = true; stopHits++; stopDays.push(t + 1); break; }
        while (k < targets.length && p >= targets[k].price) {
          const q = Math.min(rem, targets[k].lots); proceeds += q * upl * targets[k].price * (1 - fs); rem -= q;
          hit[k].n++; hit[k].days.push(t + 1); k++;
        }
      }
      const pend = s0 * endR[i];
      unsoldSum += rem;
      proceeds += rem * upl * pend * (1 - fs); // sisa dinilai di harga akhir (belum terealisasi)
      pnlPlan[i] = proceeds - cost;
      pnlHold[i] = lots * upl * pend * (1 - fs) - cost;
    }
    const dist = (a) => { const s = Float64Array.from(a).sort(); return { mean: mean(Array.from(a)), p5: quantileSorted(s, 0.05), p25: quantileSorted(s, 0.25), median: quantileSorted(s, 0.5), p75: quantileSorted(s, 0.75), p95: quantileSorted(s, 0.95), probProfit: a.filter((v) => v > 0).length / a.length }; };
    const medDay = (arr) => (arr.length ? quantileSorted(Float64Array.from(arr).sort(), 0.5) : NaN);

    // grid peluang level (relatif terhadap harga sekarang)
    const grid = [];
    const vol = std(Array.from(endR, Math.log));
    const stepPct = vol > 0.25 ? 10 : vol > 0.12 ? 5 : vol > 0.05 ? 2.5 : 1;
    for (let k = -6; k <= 6; k++) {
      if (k === 0) continue;
      const lvl = s0 * (1 + (k * stepPct) / 100);
      if (lvl <= 0) continue;
      const touch = k > 0 ? maxR.filter((v) => v * s0 >= lvl).length / n : minR.filter((v) => v * s0 <= lvl).length / n;
      const endBeyond = k > 0 ? endR.filter((v) => v * s0 >= lvl).length / n : endR.filter((v) => v * s0 <= lvl).length / n;
      grid.push({ pct: (k * stepPct) / 100, price: roundTick(lvl, plan.isIdx, 0), touch, end: endBeyond });
    }
    return { s0, days, nPaths: n, cost, targets: targets.map((t, k) => ({ ...t, prob: hit[k].n / n, medDay: medDay(hit[k].days),
        pctFromEntry: t.price / entry - 1, pnl: t.lots * upl * (t.price * (1 - fs) - entry * (1 + fb)) })),
      stop: stop ? { price: stop, prob: stopHits / n, medDay: medDay(stopDays), pctFromEntry: stop / entry - 1, pnl: lots * upl * (stop * (1 - fs) - entry * (1 + fb)) } : null,
      plan: dist(pnlPlan), hold: dist(pnlHold), unsoldAvg: unsoldSum / n, grid, lots, unitPerLot: upl };
  }

  // ---------- statistik perbandingan historis ----------
  function compareStats(series, benchIdx = 0) { // series: [{dates, values}]; beta/korelasi vs series[benchIdx]
    const base = series[benchIdx];
    const out = series.map((s) => {
      const v = s.values, d = s.dates, r = logReturns(v), last = v[v.length - 1];
      const back = (days) => { const t = new Date(d[d.length - 1]); t.setDate(t.getDate() - days); const ts = t.toISOString().slice(0, 10);
        let i = d.length - 1; while (i > 0 && d[i] > ts) i--; return d[i] <= ts && i < d.length - 1 ? last / v[i] - 1 : NaN; };
      const ppyS = detectPpy(d, "");
      return { ret1m: back(30), ret3m: back(91), ret1y: back(365), ret3y: back(1095), volAnn: std(r.slice(-252 * (ppyS / 252))) * Math.sqrt(ppyS), maxDD: maxDrawdown(v.slice(-ppyS * 3)) };
    });
    // beta & korelasi vs aset pertama (benchmark = index ke-1 jika ada) memakai tanggal yang sama
    const map0 = new Map(base.dates.map((x, i) => [x, base.values[i]]));
    series.forEach((s, j) => {
      if (j === benchIdx) { out[j].beta = 1; out[j].corr = 1; return; }
      const common = s.dates.filter((x) => map0.has(x)).slice(-500);
      const sm = new Map(s.dates.map((x, i) => [x, s.values[i]]));
      const a = [], b = [];
      for (let i = 1; i < common.length; i++) { a.push(Math.log(sm.get(common[i]) / sm.get(common[i - 1]))); b.push(Math.log(map0.get(common[i]) / map0.get(common[i - 1]))); }
      if (a.length < 30) { out[j].beta = NaN; out[j].corr = NaN; return; }
      const ma = mean(a), mb = mean(b); let cov = 0, va = 0, vb = 0;
      for (let i = 0; i < a.length; i++) { cov += (a[i] - ma) * (b[i] - mb); va += (a[i] - ma) ** 2; vb += (b[i] - mb) ** 2; }
      out[j].beta = cov / vb; out[j].corr = cov / Math.sqrt(va * vb); out[j].nCommon = a.length;
    });
    return out;
  }

  function runPrice(cfg, progress = () => {}) {
    const px = cfg.prices, r = logReturns(px), ppy = cfg.ppy || detectPpy(cfg.dates, cfg.type);
    const rng = makeRng(cfg.seed || 42), s0 = px[px.length - 1], mu = driftPerStep(r, cfg.drift, cfg.customDrift, ppy);
    if (cfg.keepPaths) { CACHE.s0 = s0; CACHE.days = cfg.days; CACHE.models = {}; }
    const res = { mode: "price", s0, ppy, nObs: r.length,
      stats: { volAnn: std(r) * Math.sqrt(ppy), retAnn: Math.exp(mean(r) * ppy) - 1, skew: skew(r), exKurt: exKurt(r), muUsed: mu * ppy, maxDD: maxDrawdown(px) },
      models: {} };
    cfg.models.forEach((m, mi) => {
      progress(`Simulasi ${PRICE_MODELS[m].label}…`, mi / cfg.models.length);
      const M = PRICE_MODELS[m], ctx = M.prep(r);
      const paths = M.sim(ctx, cfg.days, cfg.sims, mu, rng);
      const end = paths.map((p) => s0 * Math.exp(p[p.length - 1]));
      if (cfg.keepPaths) storePaths(m, paths);
      const probUp = new Array(cfg.days).fill(0);
      for (const p of paths) for (let t = 0; t < cfg.days; t++) if (p[t] > 0) probUp[t]++;
      for (let t = 0; t < cfg.days; t++) probUp[t] /= paths.length;
      res.models[m] = { label: M.label, probUp, horizonVol: m === "garch" || m === "arch" ? condVolHorizon(ctx, cfg.days, ppy) : std(r) * Math.sqrt(ppy), info: M.info(ctx, ppy), fan: fanFromPaths(paths, (v) => s0 * Math.exp(v)), summary: priceSummary(end, s0), hist: histogram(end),
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
    return pitBacktest({ nObs: px.length, h, minTrain: 250, maxOrigins: 60, refitEvery: m === "garch" || m === "arch" ? 6 : 1,
      simTerminal(o, hh, cache) {
        const r = trainSlice(px, o);
        const ctx = M.prep(r, cache); if (m === "garch" || m === "arch") cache.params = ctx.p;
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
      const vv = m === "garch" || m === "arch";
      const ctx = M.prep(r, vv && k % 20 !== 0 ? { params } : null);
      if (vv) params = ctx.p;
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


  // =====================================================================
  // ANALISIS KUANTITATIF: opsi (Black-Scholes, binomial CRR), metrik risiko, ARDL
  // =====================================================================
  function ncdf(x) { // Φ(x), presisi ~1e-7
    const t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989422804014327 * Math.exp(-x * x / 2);
    const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    return x > 0 ? 1 - p : p;
  }
  const npdf = (x) => 0.3989422804014327 * Math.exp(-x * x / 2);
  // Black–Scholes–Merton (q = dividend/convenience yield kontinu)
  function blackScholes(S, K, T, r, sig, q = 0) {
    const sq = sig * Math.sqrt(T), d1 = (Math.log(S / K) + (r - q + 0.5 * sig * sig) * T) / sq, d2 = d1 - sq;
    const dq = Math.exp(-q * T), dr = Math.exp(-r * T);
    const call = S * dq * ncdf(d1) - K * dr * ncdf(d2), put = K * dr * ncdf(-d2) - S * dq * ncdf(-d1);
    return { call, put, d1, d2, deltaC: dq * ncdf(d1), deltaP: dq * (ncdf(d1) - 1), gamma: dq * npdf(d1) / (S * sq), vega: S * dq * npdf(d1) * Math.sqrt(T) / 100,
      thetaC: (-S * dq * npdf(d1) * sig / (2 * Math.sqrt(T)) - r * K * dr * ncdf(d2) + q * S * dq * ncdf(d1)) / 365,
      thetaP: (-S * dq * npdf(d1) * sig / (2 * Math.sqrt(T)) + r * K * dr * ncdf(-d2) - q * S * dq * ncdf(-d1)) / 365,
      probITMcall: ncdf(d2), probITMput: ncdf(-d2) };
  }
  // Binomial Cox–Ross–Rubinstein, Eropa & Amerika
  function binomialCRR(S, K, T, r, sig, q = 0, N = 300) {
    const dt = T / N, u = Math.exp(sig * Math.sqrt(dt)), d = 1 / u, disc = Math.exp(-r * dt), p = (Math.exp((r - q) * dt) - d) / (u - d);
    const run = (isCall, american) => {
      const v = new Float64Array(N + 1);
      for (let i = 0; i <= N; i++) { const st = S * Math.pow(u, N - i) * Math.pow(d, i); v[i] = Math.max(isCall ? st - K : K - st, 0); }
      for (let n = N - 1; n >= 0; n--) for (let i = 0; i <= n; i++) {
        let val = disc * (p * v[i] + (1 - p) * v[i + 1]);
        if (american) { const st = S * Math.pow(u, n - i) * Math.pow(d, i); val = Math.max(val, isCall ? st - K : K - st); }
        v[i] = val;
      }
      return v[0];
    };
    return { callEU: run(true, false), putEU: run(false, false), callUS: run(true, true), putUS: run(false, true), u, d, p, N };
  }
  // peluang dunia-nyata dari simulasi (model terpilih) bahwa harga akhir > K, dan nilai harapan payoff
  function probEnd(model, K, r, T) {
    const C = CACHE.models[model]; if (!C) return null;
    let above = 0, payC = 0, payP = 0; const s0 = CACHE.s0;
    for (let i = 0; i < C.n; i++) { const st = s0 * Math.exp(C.flat[i * C.days + C.days - 1]); if (st > K) above++; payC += Math.max(st - K, 0); payP += Math.max(K - st, 0); }
    const df = Math.exp(-r * T);
    return { probAbove: above / C.n, callMC: df * payC / C.n, putMC: df * payP / C.n };
  }

  // ---------- metrik risiko gaya institusi (vs benchmark, tanggal bersama, maks 3 tahun) ----------
  function riskMetrics(a, b, rfAnn, ppy) {
    const mb = new Map(b.dates.map((d, i) => [d, b.values[i]]));
    const common = a.dates.map((d, i) => [d, a.values[i], mb.get(d)]).filter((x) => x[2] != null);
    const use = common.slice(-(ppy * 3 + 1));
    const ra = [], rb = [];
    for (let i = 1; i < use.length; i++) { ra.push(use[i][1] / use[i - 1][1] - 1); rb.push(use[i][2] / use[i - 1][2] - 1); }
    const n = ra.length; if (n < 60) return null;
    const ppyC = n / ((new Date(use[use.length - 1][0]) - new Date(use[0][0])) / (365.25 * 864e5)); // periode per tahun dari data bersama
    const rfp = Math.pow(1 + rfAnn, 1 / ppyC) - 1;
    const one = (r, px0, px1) => {
      const yrs = n / ppyC, cagr = Math.pow(px1 / px0, 1 / yrs) - 1, vol = std(r) * Math.sqrt(ppyC);
      const ex = r.map((v) => v - rfp), down = Math.sqrt(ex.reduce((s, v) => s + Math.min(v, 0) ** 2, 0) / ex.length) * Math.sqrt(ppyC);
      let pk = 1, eq = 1, dd = 0; for (const v of r) { eq *= 1 + v; pk = Math.max(pk, eq); dd = Math.min(dd, eq / pk - 1); }
      const s = Float64Array.from(r).sort(), var95 = -quantileSorted(s, 0.05); let es = 0, c = 0; for (const v of s) { if (v <= -var95) { es += v; c++; } else break; }
      const muA = mean(r) * ppyC;
      return { cagr, vol, sharpe: (mean(ex) * ppyC) / vol, sortino: (mean(ex) * ppyC) / down, calmar: dd < 0 ? cagr / -dd : NaN, maxDD: dd,
        var95, es95: -(es / Math.max(c, 1)), skew: skew(r), kurt: exKurt(r), hit: r.filter((v) => v > 0).length / n,
        kelly: (muA - rfAnn) / (vol * vol) };
    };
    const A = one(ra, use[0][1], use[use.length - 1][1]), B = one(rb, use[0][2], use[use.length - 1][2]);
    const ma = mean(ra), mbb = mean(rb); let cov = 0, vb = 0; for (let i = 0; i < n; i++) { cov += (ra[i] - ma) * (rb[i] - mbb); vb += (rb[i] - mbb) ** 2; }
    const beta = cov / vb, alpha = ((ma - rfp) - beta * (mbb - rfp)) * ppyC;
    const act = ra.map((v, i) => v - rb[i]), te = std(act) * Math.sqrt(ppyC), ir = (mean(act) * ppyC) / te;
    const upI = rb.map((v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0), dnI = rb.map((v, i) => (v < 0 ? i : -1)).filter((i) => i >= 0);
    const cap = (I) => mean(I.map((i) => ra[i])) / mean(I.map((i) => rb[i]));
    return { asset: A, bench: B, beta, alpha, te, ir, upCap: cap(upI), downCap: cap(dnI), n, from: use[0][0], to: use[use.length - 1][0], ppy: ppyC };
  }

  // ---------- OLS ----------
  function ols(X, y) { // X: array baris (sudah termasuk konstanta)
    const n = X.length, k = X[0].length, XtX = Array.from({ length: k }, () => new Float64Array(k)), Xty = new Float64Array(k);
    for (let i = 0; i < n; i++) for (let a = 0; a < k; a++) { Xty[a] += X[i][a] * y[i]; for (let b = 0; b < k; b++) XtX[a][b] += X[i][a] * X[i][b]; }
    const inv = invert(XtX); if (!inv) return null;
    const beta = inv.map((row) => row.reduce((s, v, j) => s + v * Xty[j], 0));
    const res = y.map((v, i) => v - X[i].reduce((s, x, j) => s + x * beta[j], 0));
    const sse = res.reduce((s, v) => s + v * v, 0), s2 = sse / (n - k), my = mean(y), sst = y.reduce((s, v) => s + (v - my) ** 2, 0);
    const se = inv.map((row, j) => Math.sqrt(Math.max(row[j] * s2, 0)));
    return { beta, se, t: beta.map((b, j) => b / se[j]), s2, sse, r2: 1 - sse / sst, n, k, aic: n * Math.log(sse / n) + 2 * k, res };
  }
  function invert(M) {
    const k = M.length, A = M.map((r, i) => [...r, ...Array.from({ length: k }, (_, j) => (i === j ? 1 : 0))]);
    for (let c = 0; c < k; c++) {
      let p = c; for (let r = c + 1; r < k; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      if (Math.abs(A[p][c]) < 1e-14) return null; [A[c], A[p]] = [A[p], A[c]];
      const piv = A[c][c]; for (let j = 0; j < 2 * k; j++) A[c][j] /= piv;
      for (let r = 0; r < k; r++) if (r !== c) { const f = A[r][c]; if (f) for (let j = 0; j < 2 * k; j++) A[r][j] -= f * A[c][j]; }
    }
    return A.map((r) => r.slice(k));
  }
  // student-t two-sided p-value (aproksimasi normal untuk df besar, cukup untuk n > 60)
  const pval = (t, df) => { const z = Math.abs(t) * (1 - 1 / (4 * df)) / Math.sqrt(1 + t * t / (2 * df)); return 2 * (1 - ncdf(z)); };

  // ---------- ARDL(p,q) pada return mingguan: y_t = c + Σφ_i y_{t-i} + Σβ_j x_{t-j} ----------
  // mode prediktif: j mulai 1 (x_t belum diketahui saat meramal); mode penjelas: j mulai 0
  function weekly(dates, values) {
    const out = []; let k = null;
    dates.forEach((d, i) => { const t = new Date(d + "T00:00:00Z"); const wd = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - wd);
      const kk = t.toISOString().slice(0, 10); if (kk !== k) { out.push([kk, values[i]]); k = kk; } else out[out.length - 1][1] = values[i]; });
    return out;
  }
  function ardl(a, xs, maxP = 4, maxQ = 4) {
    // a, xs[]: {dates, values, symbol}; return mingguan pada minggu yang sama
    const wa = weekly(a.dates, a.values), wx = xs.map((x) => new Map(weekly(x.dates, x.values)));
    const rows = wa.filter(([w]) => wx.every((m) => m.has(w)));
    const y = [], X = xs.map(() => []);
    for (let i = 1; i < rows.length; i++) { const w0 = rows[i - 1][0], w1 = rows[i][0];
      y.push(Math.log(rows[i][1] / rows[i - 1][1])); xs.forEach((_, j) => X[j].push(Math.log(wx[j].get(w1) / wx[j].get(w0)))); }
    const N = y.length; if (N < 80) return null;
    const build = (p, q, contemp, from, to) => { const Xr = [], yr = [];
      const start = Math.max(p, q, 1);
      for (let t = Math.max(start, from); t < to; t++) { const row = [1]; for (let i = 1; i <= p; i++) row.push(y[t - i]);
        xs.forEach((_, j) => { for (let l = contemp ? 0 : 1; l <= q; l++) row.push(X[j][t - l]); }); Xr.push(row); yr.push(y[t]); }
      return { Xr, yr }; };
    const names = (p, q, contemp) => { const n = ["Konstanta"]; for (let i = 1; i <= p; i++) n.push(`${a.symbol} (t-${i})`);
      xs.forEach((x) => { for (let l = contemp ? 0 : 1; l <= q; l++) n.push(`${x.symbol} (t${l ? "-" + l : ""})`); }); return n; };
    // seleksi lag dengan AIC pada sampel estimasi (70% awal)
    const split = Math.floor(N * 0.7);
    let best = null;
    for (let p = 0; p <= maxP; p++) for (let q = 1; q <= maxQ; q++) {
      const { Xr, yr } = build(p, q, false, maxP > maxQ ? maxP : maxQ, split); const f = ols(Xr, yr);
      if (f && (!best || f.aic < best.aic)) best = { p, q, aic: f.aic };
    }
    const { p, q } = best;
    // evaluasi out-of-sample: expanding window, ramalan 1 minggu
    const st0 = Math.max(p, q, 1), oos = [];
    for (let t = split; t < N; t++) {
      const { Xr, yr } = build(p, q, false, st0, t); const f = ols(Xr, yr); if (!f) continue;
      const row = [1]; for (let i = 1; i <= p; i++) row.push(y[t - i]); xs.forEach((_, j) => { for (let l = 1; l <= q; l++) row.push(X[j][t - l]); });
      const fc = row.reduce((s, v, j) => s + v * f.beta[j], 0), hm = mean(y.slice(0, t));
      oos.push({ fc, hm, act: y[t] });
    }
    const sse = oos.reduce((s, o) => s + (o.act - o.fc) ** 2, 0), sseH = oos.reduce((s, o) => s + (o.act - o.hm) ** 2, 0), sse0 = oos.reduce((s, o) => s + o.act ** 2, 0);
    const hit = oos.filter((o) => Math.sign(o.fc) === Math.sign(o.act) && o.act !== 0).length / oos.length;
    const upShare = oos.filter((o) => o.act > 0).length / oos.length;
    // model akhir (seluruh sampel) — prediktif & penjelas
    const fin = build(p, q, false, st0, N), fP = ols(fin.Xr, fin.yr);
    const ex = build(p, Math.max(q, 1), true, st0, N), fE = ols(ex.Xr, ex.yr);
    const row = [1]; for (let i = 1; i <= p; i++) row.push(y[N - i + 0 - 0]); // y[N-1] = minggu terakhir
    row.length = 1; for (let i = 1; i <= p; i++) row.push(y[N - i]); xs.forEach((_, j) => { for (let l = 1; l <= q; l++) row.push(X[j][N - l]); });
    // catatan: y[N-i] dengan i=1 adalah minggu terakhir yang sudah terjadi
    const nextFc = row.reduce((s, v, j) => s + v * fP.beta[j], 0), sdE = Math.sqrt(fP.s2);
    const coef = (f, nm) => f.beta.map((b, j) => ({ name: nm[j], b, se: f.se[j], t: f.t[j], p: pval(f.t[j], f.n - f.k) }));
    return { p, q, N, nOOS: oos.length, oosR2: 1 - sse / sseH, oosR2zero: 1 - sse / sse0, hit, upShare,
      pred: { coef: coef(fP, names(p, q, false)), r2: fP.r2, n: fP.n }, expl: { coef: coef(fE, names(p, Math.max(q, 1), true)), r2: fE.r2, n: fE.n },
      nextFc, nextLo: nextFc - 1.2816 * sdE, nextHi: nextFc + 1.2816 * sdE, sdE, lastWeek: rows[rows.length - 1][0] };
  }


  // =====================================================================
  // VALUASI ALA DAMODARAN
  //  - non-keuangan: DCF FCFF 10 tahun (growth & margin konvergen, reinvestasi via sales-to-capital)
  //  - bank/keuangan: excess return model (nilai = BV + PV[(ROE − COE) × BV])
  // =====================================================================
  function costOfCapital(v) { // v: rf, beta, erp, crp, kdSpread, taxMarg, dWeight
    const coe = v.rf + v.beta * (v.erp + v.crp);
    const kd = (v.rf + v.kdSpread) * (1 - v.taxMarg);
    return { coe, kd, wacc: (1 - v.dWeight) * coe + v.dWeight * kd };
  }
  function dcfFCFF(v) {
    // v: revenue, g1 (th 1–5), gT (terminal), m0 (margin kini), mT (margin target), convYear, tax0 (efektif), taxMarg, s2c,
    //    rf, beta, erp, crp, kdSpread, dWeight, rocT (terminal ROC; default = WACC terminal), cash, debt, shares, price
    const cc = costOfCapital(v), waccT = (1 - v.dWeight) * (v.rf + 1 * (v.erp + v.crp)) + v.dWeight * (v.rf + v.kdSpread) * (1 - v.taxMarg);
    const rows = []; let R = v.revenue, cum = 1, pv = 0;
    for (let t = 1; t <= 10; t++) {
      const g = t <= 5 ? v.g1 : v.g1 - ((v.g1 - v.gT) * (t - 5)) / 5;
      const Rn = R * (1 + g);
      const m = t >= v.convYear ? v.mT : v.m0 + ((v.mT - v.m0) * t) / v.convYear;
      const tax = t <= 5 ? v.tax0 : v.tax0 + ((v.taxMarg - v.tax0) * (t - 5)) / 5;
      const ebit = Rn * m, nopat = ebit * (1 - tax), reinv = (Rn - R) / v.s2c, fcff = nopat - reinv;
      const w = t <= 5 ? cc.wacc : cc.wacc + ((waccT - cc.wacc) * (t - 5)) / 5;
      cum *= 1 + w; const pvt = fcff / cum; pv += pvt;
      rows.push({ t, g, rev: Rn, m, ebit, tax, nopat, reinv, fcff, wacc: w, df: 1 / cum, pv: pvt });
      R = Rn;
    }
    const last = rows[9], rocT = v.rocT || waccT;
    const nopat11 = last.rev * (1 + v.gT) * v.mT * (1 - v.taxMarg), reinvRate = v.gT / rocT;
    const fcff11 = nopat11 * (1 - reinvRate), tv = fcff11 / (waccT - v.gT), pvTV = tv / cum;
    const ops = pv + pvTV, equity = ops + v.cash - v.debt, perShare = equity / v.shares;
    return { cc, waccT, rows, tv, pvTV, pvFCFF: pv, ops, equity, perShare, upside: perShare / v.price - 1, tvShare: pvTV / ops, reinvRateT: reinvRate };
  }
  function excessReturn(v) {
    // v: bvps, roe1 (th 1–5), roeT, g1, gT, rf, beta, erp, crp, price
    const coe = v.rf + v.beta * (v.erp + v.crp), rows = []; let bv = v.bvps, cum = 1, pv = 0;
    for (let t = 1; t <= 10; t++) {
      const roe = t <= 5 ? v.roe1 : v.roe1 + ((v.roeT - v.roe1) * (t - 5)) / 5;
      const g = t <= 5 ? v.g1 : v.g1 - ((v.g1 - v.gT) * (t - 5)) / 5;
      const ni = bv * roe, exc = (roe - coe) * bv;
      cum *= 1 + coe; const pvt = exc / cum; pv += pvt;
      const payout = Math.max(0, 1 - g / roe);
      rows.push({ t, roe, g, bv, ni, exc, payout, pv: pvt });
      bv *= 1 + g;
    }
    const tv = ((v.roeT - coe) * bv) / (coe - v.gT), pvTV = tv / cum;
    const perShare = v.bvps + pv + pvTV;
    return { coe, rows, pvExcess: pv, pvTV, perShare, upside: perShare / v.price - 1, justifiedPB: perShare / v.bvps, stablePB: (v.roeT - v.gT) / (coe - v.gT) };
  }
  // reverse: cari nilai satu input yang membuat nilai = harga pasar (bisection)
  function solveImplied(fn, v, key, lo, hi) {
    const f = (x) => fn({ ...v, [key]: x }).perShare - v.price;
    let a = lo, b = hi, fa = f(a), fb = f(b);
    if (!isFinite(fa) || !isFinite(fb) || fa * fb > 0) return NaN;
    for (let i = 0; i < 80; i++) { const m = (a + b) / 2, fm = f(m); if (fa * fm <= 0) { b = m; fb = fm; } else { a = m; fa = fm; } }
    return (a + b) / 2;
  }
  // simulasi input (Damodaran: "simulations in valuation")
  function valuationMC(kind, v, n = 5000, seed = 5) {
    const rng = makeRng(seed), out = [];
    for (let i = 0; i < n; i++) {
      const w = { ...v };
      if (kind === "fcff") {
        w.g1 = v.g1 + v.sdG * rng.normal(); w.mT = Math.max(0.005, v.mT + v.sdM * rng.normal());
        w.s2c = v.s2c * Math.exp(0.2 * rng.normal()); w.erp = Math.max(0.01, v.erp + 0.005 * rng.normal()); w.beta = Math.max(0.3, v.beta + 0.15 * rng.normal());
        const r = dcfFCFF(w); if (isFinite(r.perShare) && r.waccT > w.gT) out.push(r.perShare);
      } else {
        w.roe1 = v.roe1 + v.sdR * rng.normal(); w.roeT = v.roeT + v.sdR * 0.7 * rng.normal(); w.g1 = v.g1 + v.sdG * rng.normal();
        w.erp = Math.max(0.01, v.erp + 0.005 * rng.normal()); w.beta = Math.max(0.3, v.beta + 0.15 * rng.normal());
        const r = excessReturn(w); if (isFinite(r.perShare) && r.coe > w.gT) out.push(r.perShare);
      }
    }
    const s = Float64Array.from(out).sort();
    return { n: s.length, q: [0.05, 0.25, 0.5, 0.75, 0.95].map((p) => quantileSorted(s, p)), probUnder: out.filter((x) => x > v.price).length / s.length, hist: histogram(Array.from(s), 40) };
  }


  // ---------- screener: metrik ringkas per aset ----------
  function screenAsset(a, bench, o) {
    // a,bench: {dates, values, type}; o: {days, sims, model, rf}
    const px = a.values, d = a.dates, n = px.length, last = px[n - 1], r = logReturns(px);
    const ppy = detectPpy(d, a.type);
    const back = (days) => { const t = new Date(d[n - 1]); t.setDate(t.getDate() - days); const ts = t.toISOString().slice(0, 10);
      let i = n - 1; while (i > 0 && d[i] > ts) i--; return d[i] <= ts && i < n - 1 ? last / px[i] - 1 : NaN; };
    const ytdI = d.findIndex((x) => x >= d[n - 1].slice(0, 4) + "-01-01");
    const r1y = r.slice(-ppy), vol = std(r1y) * Math.sqrt(ppy);
    const sma = (k) => (n >= k ? px.slice(-k).reduce((s, v) => s + v, 0) / k : NaN);
    let g = 0, l = 0; for (let i = 1; i < n; i++) { const dd = px[i] - px[i - 1], up = Math.max(dd, 0), dn = Math.max(-dd, 0); if (i <= 14) { g += up / 14; l += dn / 14; } else { g = (g * 13 + up) / 14; l = (l * 13 + dn) / 14; } }
    const rsi = 100 - 100 / (1 + g / (l || 1e-12));
    const ma20 = sma(20), ma50 = sma(50), ma200 = sma(200);
    const trend = last > ma50 && ma20 > ma50 ? 1 : last < ma50 && ma20 < ma50 ? -1 : 0;
    const ret1y = back(365), rfA = o.rf || 0;
    const sharpe = isFinite(ret1y) ? (Math.exp(mean(r1y) * ppy) - 1 - rfA) / vol : NaN;
    let beta = NaN, corr = NaN;
    if (bench) { const mb = new Map(bench.dates.map((x, i) => [x, bench.values[i]])); const ra = [], rb = []; let pa = null, pb = null;
      for (let i = Math.max(0, n - 260); i < n; i++) { const v = mb.get(d[i]); if (v == null) continue; if (pa != null) { ra.push(Math.log(px[i] / pa)); rb.push(Math.log(v / pb)); } pa = px[i]; pb = v; }
      if (ra.length > 40) { const m1 = mean(ra), m2 = mean(rb); let c = 0, v1 = 0, v2 = 0; for (let i = 0; i < ra.length; i++) { c += (ra[i] - m1) * (rb[i] - m2); v1 += (ra[i] - m1) ** 2; v2 += (rb[i] - m2) ** 2; } beta = c / v2; corr = c / Math.sqrt(v1 * v2); } }
    // simulasi
    const M = PRICE_MODELS[o.model] || PRICE_MODELS.garch, rng = makeRng(o.seed || 7);
    const ctx = M.prep(r.slice(-1000)), paths = M.sim(ctx, o.days, o.sims, 0, rng);
    const end = Float64Array.from(paths, (p) => Math.exp(p[o.days - 1]) - 1).sort();
    let up = 0, up10 = 0, dn10 = 0; for (const v of end) { if (v > 0) up++; if (v > 0.1) up10++; if (v < -0.1) dn10++; }
    const N = end.length;
    const spark = px.slice(-Math.min(n, 66)).filter((_, i, arr) => i % Math.max(1, Math.floor(arr.length / 40)) === 0 || i === arr.length - 1);
    return { last, chg1d: last / px[n - 2] - 1, ret1w: back(7), ret1m: back(30), ret3m: back(91), ytd: ytdI > 0 ? last / px[ytdI - 1] - 1 : NaN, ret1y,
      vol, maxDD: maxDrawdown(px.slice(-ppy)), rsi, trend, ma50, ma200, aboveMa200: isFinite(ma200) ? last > ma200 : null, sharpe, beta, corr,
      hi52: Math.max(...px.slice(-ppy)), offHigh: last / Math.max(...px.slice(-ppy)) - 1,
      simMed: quantileSorted(end, 0.5), simP5: quantileSorted(end, 0.05), simP95: quantileSorted(end, 0.95), probUp: up / N, probUp10: up10 / N, probDn10: dn10 / N,
      var95: -quantileSorted(end, 0.05), horizonVol: o.model === "garch" || o.model === "arch" ? condVolHorizon(ctx, o.days, ppy) : std(r) * Math.sqrt(ppy), spark, ppy, nObs: n };
  }


  // =====================================================================
  // QUANT LAB: portofolio & backtest
  // =====================================================================
  // gabungkan banyak seri pada tanggal yang sama (irisan) -> harga & return harian
  function alignSeries(list) {
    const maps = list.map((s) => new Map(s.dates.map((d, i) => [d, s.values[i]])));
    const dates = list[0].dates.filter((d) => maps.every((m) => m.has(d)));
    const px = list.map((_, j) => dates.map((d) => maps[j].get(d)));
    const R = []; for (let t = 1; t < dates.length; t++) R.push(px.map((p) => Math.log(p[t] / p[t - 1])));
    return { dates, px, R }; // R: [T][N]
  }
  function covMatrix(R, shrink = 0.3) {
    const T = R.length, N = R[0].length, mu = new Array(N).fill(0);
    for (const r of R) for (let j = 0; j < N; j++) mu[j] += r[j] / T;
    const S = Array.from({ length: N }, () => new Float64Array(N));
    for (const r of R) for (let a = 0; a < N; a++) { const da = r[a] - mu[a]; for (let b = a; b < N; b++) S[a][b] += (da * (r[b] - mu[b])) / (T - 1); }
    for (let a = 0; a < N; a++) for (let b = 0; b < a; b++) S[a][b] = S[b][a];
    // shrinkage ke matriks korelasi konstan (Ledoit-Wolf style, intensitas tetap)
    const sd = S.map((row, i) => Math.sqrt(row[i])); let rbar = 0, c = 0;
    for (let a = 0; a < N; a++) for (let b = a + 1; b < N; b++) { rbar += S[a][b] / (sd[a] * sd[b]); c++; }
    rbar = c ? rbar / c : 0;
    const C = S.map((row, a) => Float64Array.from(row, (v, b) => (a === b ? v : (1 - shrink) * v + shrink * rbar * sd[a] * sd[b])));
    const corr = S.map((row, a) => Array.from(row, (v, b) => v / (sd[a] * sd[b])));
    return { mu, S, C, corr, sd, rbar };
  }
  const mv = (M, w) => M.map((row) => row.reduce((s, v, j) => s + v * w[j], 0));
  const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
  function projectCapped(w, cap) { // proyeksi ke {w>=0, sum=1, w<=cap} via bisection pada pengali
    const N = w.length; cap = Math.max(cap, 1 / N + 1e-9); let lo = Math.min(...w) - 1, hi = Math.max(...w) + 1;
    const f = (t) => w.reduce((s, v) => s + Math.min(cap, Math.max(0, v - t)), 0);
    for (let i = 0; i < 100; i++) { const m = (lo + hi) / 2; if (f(m) > 1) lo = m; else hi = m; }
    return w.map((v) => Math.min(cap, Math.max(0, v - (lo + hi) / 2)));
  }
  function optimize(method, C, mu, opt = {}) {
    const N = C.length, cap = opt.cap ?? 1, rf = opt.rf ?? 0;
    const vol = (w) => Math.sqrt(Math.max(dot(w, mv(C, w)), 1e-18));
    let w = new Array(N).fill(1 / N);
    if (method === "ew") return projectCapped(w, cap);
    if (method === "iv") { const iv = C.map((r, i) => 1 / Math.sqrt(r[i])); const s = iv.reduce((a, b) => a + b, 0); return projectCapped(iv.map((v) => v / s), cap); }
    if (method === "rp") { // risk parity: kontribusi risiko sama
      for (let it = 0; it < 500; it++) { const m = mv(C, w), tot = dot(w, m); const nw = w.map((v, i) => v * Math.sqrt((tot / N) / Math.max(v * m[i], 1e-18)));
        const s = nw.reduce((a, b) => a + b, 0); w = nw.map((v) => v / s); }
      return projectCapped(w, cap);
    }
    // projected gradient dengan langkah ternormalisasi (tidak bergantung skala data)
    const obj = (x) => (method === "minvar" ? dot(x, mv(C, x)) : -(dot(x, mu) - rf) / vol(x));
    let best = w.slice(), fbest = obj(w);
    for (let it = 0; it < 4000; it++) {
      const m = mv(C, w); let g;
      if (method === "minvar") g = m.map((v) => 2 * v);
      else { const s = vol(w), ex = dot(w, mu) - rf; g = mu.map((u, i) => -((u - rf) / s - (ex * m[i]) / (s * s * s))); } // gradien −Sharpe
      const gn = Math.sqrt(g.reduce((a, b) => a + b * b, 0)) || 1, lr = 0.05 / (1 + it / 150);
      w = projectCapped(w.map((v, i) => v - (lr * g[i]) / gn), cap);
      const f = obj(w); if (f < fbest) { fbest = f; best = w.slice(); }
    }
    return best;
  }
  function portStats(w, C, mu, ppy, rf) {
    const m = mv(C, w), varp = dot(w, m), vol = Math.sqrt(varp) * Math.sqrt(ppy), ret = dot(w, mu) * ppy;
    const rc = w.map((v, i) => (v * m[i]) / varp); // kontribusi risiko (sum = 1)
    return { ret, vol, sharpe: (ret - rf) / vol, rc };
  }
  function quantPortfolio(series, opt) {
    // opt: method, cap, shrinkMu (0..1), shrinkCov, rf, ppy, horizon, sims, capital, prices(last), lotSize[]
    const A = alignSeries(series), N = series.length, T = A.R.length;
    if (T < 120) throw new Error(`Hanya ${T} hari data bersama — terlalu sedikit (butuh ≥ 120). Kurangi aset atau perpanjang periode.`);
    const ppy = opt.ppy || 252, K = covMatrix(A.R, opt.shrinkCov ?? 0.3);
    const grand = mean(K.mu), muS = K.mu.map((u) => (1 - (opt.shrinkMu ?? 0.5)) * u + (opt.shrinkMu ?? 0.5) * grand); // shrink return ke rata-rata
    const rfD = (opt.rf || 0) / ppy;
    const methods = ["minvar", "maxsharpe", "rp", "iv", "ew"], res = {};
    for (const mth of methods) { const w = optimize(mth, K.C, muS, { cap: opt.cap, rf: rfD }); res[mth] = { w, ...portStats(w, K.C, muS, ppy, opt.rf || 0) }; }
    // efficient frontier (titik acak Dirichlet + garis frontier via min-var dengan penalti target)
    const rng = makeRng(17), cloud = [];
    for (let k = 0; k < 1500; k++) { let w = Array.from({ length: N }, () => -Math.log(rng.u() + 1e-12)); const s = w.reduce((a, b) => a + b, 0); w = w.map((v) => v / s);
      const st = portStats(w, K.C, muS, ppy, opt.rf || 0); cloud.push([st.vol, st.ret]); }
    // simulasi portofolio terpilih: block bootstrap baris return bersama (korelasi terjaga)
    const W = res[opt.method].w, h = opt.horizon || 21, n = opt.sims || 5000, B = 10, ends = new Float64Array(n), dd = new Float64Array(n);
    const demean = A.R.map((r) => r.map((v, j) => v - K.mu[j] + muS[j]));
    for (let i = 0; i < n; i++) { let c = 0, pk = 0, mdd = 0, t = 0;
      while (t < h) { const s0 = rng.int(T - B); for (let k = 0; k < B && t < h; k++, t++) { const r = demean[s0 + k]; let pr = 0; for (let j = 0; j < N; j++) pr += W[j] * (Math.exp(r[j]) - 1); c += Math.log(1 + pr); pk = Math.max(pk, c); mdd = Math.min(mdd, c - pk); } }
      ends[i] = Math.exp(c) - 1; dd[i] = Math.exp(mdd) - 1; }
    const se = Float64Array.from(ends).sort(), sdd = Float64Array.from(dd).sort();
    let cs = 0, cn = 0; const v95 = -quantileSorted(se, 0.05); for (const v of se) { if (v <= -v95) { cs += v; cn++; } else break; }
    const sim = { q: [0.05, 0.25, 0.5, 0.75, 0.95].map((p) => quantileSorted(se, p)), probLoss: ends.filter((v) => v < 0).length / n, var95: v95, cvar95: -cs / Math.max(cn, 1), ddMed: quantileSorted(sdd, 0.5), dd5: quantileSorted(sdd, 0.05), hist: histogram(Array.from(se), 50) };
    // alokasi modal -> lot
    let alloc = null;
    if (opt.capital > 0 && opt.prices) { let spent = 0;
      alloc = W.map((w, j) => { const unit = opt.lotSize[j] || 1, px = opt.prices[j], target = opt.capital * w;
        const lots = unit > 1 ? Math.floor(target / (px * unit)) : Math.floor((target / px) * 1e6) / 1e6; const cost = lots * unit * px; spent += cost; return { lots, cost, target }; });
      alloc.cash = opt.capital - spent; }
    // performa historis (in-sample!) dengan rebalancing harian
    const eq = [1]; for (const r of A.R) { let pr = 0; for (let j = 0; j < N; j++) pr += W[j] * (Math.exp(r[j]) - 1); eq.push(eq[eq.length - 1] * (1 + pr)); }
    return { dates: A.dates, T, corr: K.corr, rbar: K.rbar, volAsset: K.sd.map((s) => s * Math.sqrt(ppy)), muAsset: K.mu.map((u) => u * ppy), muShr: muS.map((u) => u * ppy), res, cloud, sim, alloc, eq };
  }

  // ---------- backtest strategi (sinyal di close t, posisi berlaku t+1, biaya per perubahan posisi) ----------
  function rsiSeries(c, n = 14) { const out = new Array(c.length).fill(null); let g = 0, l = 0;
    for (let i = 1; i < c.length; i++) { const d = c[i] - c[i - 1], up = Math.max(d, 0), dn = Math.max(-d, 0);
      if (i <= n) { g += up / n; l += dn / n; if (i === n) out[i] = 100 - 100 / (1 + g / (l || 1e-12)); } else { g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n; out[i] = 100 - 100 / (1 + g / (l || 1e-12)); } }
    return out; }
  function perfStats(rets, ppy, rf) { // rets: return sederhana harian
    const n = rets.length; if (!n) return null; let eq = 1, pk = 1, mdd = 0; for (const r of rets) { eq *= 1 + r; pk = Math.max(pk, eq); mdd = Math.min(mdd, eq / pk - 1); }
    const yrs = n / ppy, cagr = Math.pow(eq, 1 / yrs) - 1, vol = std(rets) * Math.sqrt(ppy);
    return { cagr, vol, sharpe: vol > 0 ? (mean(rets) * ppy - rf) / vol : NaN, maxDD: mdd, total: eq - 1 };
  }
  function backtest(series, opt) {
    // opt: strat ('ma','tsmom','rsi','xsmom','bh'), fast, slow, look, rsiLo, rsiHi, topK, rebal, costBps, ppy, rf, split (0.7)
    const A = alignSeries(series), N = series.length, T = A.dates.length, ppy = opt.ppy || 252, cost = (opt.costBps || 0) / 1e4;
    const pos = Array.from({ length: T }, () => new Array(N).fill(0)); // bobot yang dipegang SELAMA hari t (diputuskan di close t-1)
    const P = A.px;
    if (opt.strat === "bh") for (let t = 1; t < T; t++) for (let j = 0; j < N; j++) pos[t][j] = 1 / N;
    else if (opt.strat === "xsmom") {
      let cur = new Array(N).fill(0);
      for (let t = 1; t < T; t++) { const dec = t - 1;
        if (dec >= opt.look && (dec - opt.look) % opt.rebal === 0) { const sc = P.map((p, j) => [p[dec] / p[dec - opt.look] - 1, j]).sort((a, b) => b[0] - a[0]).slice(0, opt.topK);
          cur = new Array(N).fill(0); for (const [r, j] of sc) if (!opt.absFilter || r > 0) cur[j] = 1 / opt.topK; }
        pos[t] = cur.slice(); }
    } else {
      for (let j = 0; j < N; j++) { const c = P[j], rs = opt.strat === "rsi" ? rsiSeries(c) : null; let state = 0;
        for (let t = 1; t < T; t++) { const d = t - 1; let sig = state;
          if (opt.strat === "ma") { if (d >= opt.slow) { const f = c.slice(d - opt.fast + 1, d + 1).reduce((a, b) => a + b, 0) / opt.fast, s = c.slice(d - opt.slow + 1, d + 1).reduce((a, b) => a + b, 0) / opt.slow; sig = f > s ? 1 : 0; } else sig = 0; }
          else if (opt.strat === "tsmom") sig = d >= opt.look && c[d] / c[d - opt.look] - 1 > 0 ? 1 : 0;
          else if (opt.strat === "rsi") { const r = rs[d]; if (r != null) { if (state === 0 && r < opt.rsiLo) sig = 1; else if (state === 1 && r > opt.rsiHi) sig = 0; } }
          state = sig; pos[t][j] = sig / N; } }
    }
    // return harian strategi & buy-and-hold
    const strat = [], bh = [], expo = [], turn = []; let trades = 0;
    for (let t = 1; t < T; t++) { let r = 0, rb = 0, tv = 0, ex = 0;
      for (let j = 0; j < N; j++) { const rj = P[j][t] / P[j][t - 1] - 1; r += pos[t][j] * rj; rb += rj / N; tv += Math.abs(pos[t][j] - (t > 1 ? pos[t - 1][j] : 0)); ex += pos[t][j]; }
      if (tv > 1e-9) trades++; r -= tv * cost; strat.push(r); bh.push(rb); expo.push(ex); turn.push(tv); }
    const k = Math.floor(strat.length * (opt.split ?? 0.7));
    const seg = (a, b) => ({ strat: perfStats(strat.slice(a, b), ppy, opt.rf || 0), bh: perfStats(bh.slice(a, b), ppy, opt.rf || 0) });
    const eqS = [1], eqB = [1]; for (let i = 0; i < strat.length; i++) { eqS.push(eqS[i] * (1 + strat[i])); eqB.push(eqB[i] * (1 + bh[i])); }
    return { dates: A.dates, eqS, eqB, all: seg(0, strat.length), is: seg(0, k), oos: seg(k, strat.length), splitDate: A.dates[k + 1],
      exposure: mean(expo), turnoverYr: mean(turn) * ppy, tradeDays: trades, hit: strat.filter((r) => r > 0).length / Math.max(1, expo.filter((e) => e > 0).length), T };
  }

  const api = { quantPortfolio, backtest, alignSeries, screenAsset, dcfFCFF, excessReturn, solveImplied, valuationMC, costOfCapital, blackScholes, binomialCRR, probEnd, riskMetrics, ardl, ols, ncdf, evalPlan, compareStats, idxTick, roundTick, makeRng, garchFit, garchNextVar, fitRate, simRate, bondPrice, runPrice, runBond, kupiec, quantiles, logReturns, detectPpy, PRICE_MODELS, PCTS, mean, std };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.MCEngine = api;
})(typeof self !== "undefined" ? self : this);
