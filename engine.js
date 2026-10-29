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


  // ---------- sinyal beli/jual teknikal + backtest pada aset yang sama ----------
  // skor_t = tren (±1) + momentum (±1) + RSI (+1 jenuh jual / −1 jenuh beli); beli bila skor ≥ entry, jual bila skor ≤ exit
  function signalBacktest(dates, px, opt = {}) {
    const o = { fast: 20, slow: 50, mom: 63, lo: 30, hi: 70, entry: 2, exit: -1, costBps: 20, split: 0.7, ppy: 252, rf: 0, ...opt };
    const n = px.length, rsi = rsiSeries(px), cost = o.costBps / 1e4;
    const sma = (k, t) => { let s = 0; for (let i = t - k + 1; i <= t; i++) s += px[i]; return s / k; };
    const comp = (t) => { if (t < Math.max(o.slow, o.mom)) return null;
      const f = sma(o.fast, t), sl = sma(o.slow, t), tr = px[t] > sl && f > sl ? 1 : px[t] < sl && f < sl ? -1 : 0;
      const mo = px[t] / px[t - o.mom] - 1 > 0 ? 1 : -1, r = rsi[t], rs = r == null ? 0 : r < o.lo ? 1 : r > o.hi ? -1 : 0;
      return { tr, mo, rs, score: tr + mo + rs, rsi: r, maF: f, maS: sl, momRet: px[t] / px[t - o.mom] - 1 }; };
    let pos = 0, entryPx = 0, entryI = 0; const events = [], trades = [], strat = [], bh = [];
    for (let t = 1; t < n; t++) {
      const r = px[t] / px[t - 1] - 1; bh.push(r);
      strat.push(pos * r);
      const c = comp(t); if (!c) continue;
      if (pos === 0 && c.score >= o.entry) { pos = 1; strat[strat.length - 1] -= cost; entryPx = px[t]; entryI = t; events.push({ date: dates[t], type: "buy", price: px[t], score: c.score }); }
      else if (pos === 1 && c.score <= o.exit) { pos = 0; strat[strat.length - 1] -= cost; const ret = (px[t] / entryPx) * (1 - cost) / (1 + cost) - 1;
        trades.push({ in: dates[entryI], out: dates[t], ret, days: t - entryI }); events.push({ date: dates[t], type: "sell", price: px[t], score: c.score, ret }); }
    }
    const k = Math.floor(strat.length * o.split);
    const seg = (a, b) => ({ strat: perfStats(strat.slice(a, b), o.ppy, o.rf), bh: perfStats(bh.slice(a, b), o.ppy, o.rf) });
    const eqS = [1], eqB = [1]; for (let i = 0; i < strat.length; i++) { eqS.push(eqS[i] * (1 + strat[i])); eqB.push(eqB[i] * (1 + bh[i])); }
    const wins = trades.filter((x) => x.ret > 0);
    return { now: comp(n - 1), position: pos, entryPx: pos ? entryPx : null, entryDate: pos ? dates[entryI] : null, events, trades, eqS, eqB,
      is: seg(0, k), oos: seg(k, strat.length), all: seg(0, strat.length), splitDate: dates[k + 1],
      winRate: trades.length ? wins.length / trades.length : NaN, avgTrade: trades.length ? mean(trades.map((x) => x.ret)) : NaN,
      avgDays: trades.length ? mean(trades.map((x) => x.days)) : NaN, exposure: strat.filter((x) => x !== 0).length / strat.length, opt: o };
  }


  // =====================================================================
  // LAB MATEMATIKA: Gaussian, Student-t, KDE, GMM (EM), HMM Gaussian (Baum-Welch),
  // uji normalitas, Hurst R/S, variance ratio, ACF + Ljung-Box, indeks ekor Hill
  // =====================================================================
  function qnorm(p) { // Acklam
    const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239],
      b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572],
      c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783],
      d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416], pl = 0.02425;
    if (p <= 0) return -Infinity; if (p >= 1) return Infinity;
    if (p < pl) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    if (p > 1 - pl) { const q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    const q = p - 0.5, r = q * q; return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  function gammaP(a, x) { // gamma tak lengkap teregulasi P(a,x)
    if (x <= 0) return 0; const gln = lgamma(a);
    if (x < a + 1) { let ap = a, sum = 1 / a, del = sum; for (let n = 0; n < 500; n++) { ap++; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-14) break; } return sum * Math.exp(-x + a * Math.log(x) - gln); }
    let b = x + 1 - a, c = 1e300, d = 1 / b, h = d; for (let i = 1; i < 500; i++) { const an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300; c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-14) break; }
    return 1 - Math.exp(-x + a * Math.log(x) - gln) * h;
  }
  const chi2p = (x, k) => 1 - gammaP(k / 2, x / 2); // p-value uji chi-kuadrat
  const gpdf = (x, m, s) => Math.exp(-0.5 * ((x - m) / s) ** 2) / (s * Math.sqrt(2 * Math.PI));
  const tLogPdf = (x, nu, m, s) => lgamma((nu + 1) / 2) - lgamma(nu / 2) - 0.5 * Math.log(nu * Math.PI) - Math.log(s) - ((nu + 1) / 2) * Math.log(1 + ((x - m) / s) ** 2 / nu);
  function ksPvalue(D, n) { const l = (Math.sqrt(n) + 0.12 + 0.11 / Math.sqrt(n)) * D; let s = 0; for (let k = 1; k < 100; k++) s += 2 * (k % 2 ? 1 : -1) * Math.exp(-2 * k * k * l * l); return Math.min(1, Math.max(0, s)); }
  function gmm2(r, iters = 300) {
    const n = r.length, m = mean(r), s = std(r);
    let w = [0.7, 0.3], mu = [m, m], sd = [s * 0.7, s * 1.8], ll = -Infinity;
    const g = r.map(() => [0, 0]);
    for (let it = 0; it < iters; it++) {
      let nll = 0;
      for (let i = 0; i < n; i++) { const a = w[0] * gpdf(r[i], mu[0], sd[0]), b = w[1] * gpdf(r[i], mu[1], sd[1]), t = a + b || 1e-300; g[i][0] = a / t; g[i][1] = b / t; nll += Math.log(t); }
      for (let k = 0; k < 2; k++) { let nk = 0, sm = 0; for (let i = 0; i < n; i++) { nk += g[i][k]; sm += g[i][k] * r[i]; } const mk = sm / nk; let v = 0; for (let i = 0; i < n; i++) v += g[i][k] * (r[i] - mk) ** 2;
        w[k] = nk / n; mu[k] = mk; sd[k] = Math.max(Math.sqrt(v / nk), s * 0.05); }
      if (Math.abs(nll - ll) < 1e-9 * Math.abs(nll)) { ll = nll; break; } ll = nll;
    }
    const lo = sd[0] <= sd[1] ? 0 : 1, hi = 1 - lo;
    return { w: [w[lo], w[hi]], mu: [mu[lo], mu[hi]], sd: [sd[lo], sd[hi]], ll, post: g.map((x) => x[hi]) };
  }
  function hmm2(r, init, iters = 150) {
    const n = r.length; let mu = init.mu.slice(), sd = init.sd.slice(), pi = init.w.slice(), A = [[0.97, 0.03], [0.06, 0.94]], ll = -Infinity;
    const al = Array.from({ length: n }, () => [0, 0]), be = Array.from({ length: n }, () => [0, 0]), c = new Float64Array(n), B = Array.from({ length: n }, () => [0, 0]);
    for (let it = 0; it < iters; it++) {
      for (let t = 0; t < n; t++) { B[t][0] = Math.max(gpdf(r[t], mu[0], sd[0]), 1e-300); B[t][1] = Math.max(gpdf(r[t], mu[1], sd[1]), 1e-300); }
      // maju (dengan skala)
      al[0][0] = pi[0] * B[0][0]; al[0][1] = pi[1] * B[0][1]; c[0] = al[0][0] + al[0][1]; al[0][0] /= c[0]; al[0][1] /= c[0];
      for (let t = 1; t < n; t++) { for (let j = 0; j < 2; j++) al[t][j] = (al[t - 1][0] * A[0][j] + al[t - 1][1] * A[1][j]) * B[t][j]; c[t] = al[t][0] + al[t][1]; al[t][0] /= c[t]; al[t][1] /= c[t]; }
      let nll = 0; for (let t = 0; t < n; t++) nll += Math.log(c[t]);
      // mundur
      be[n - 1][0] = be[n - 1][1] = 1;
      for (let t = n - 2; t >= 0; t--) for (let i = 0; i < 2; i++) be[t][i] = (A[i][0] * B[t + 1][0] * be[t + 1][0] + A[i][1] * B[t + 1][1] * be[t + 1][1]) / c[t + 1];
      // M-step
      const gam = al.map((a, t) => { const x = a[0] * be[t][0], y = a[1] * be[t][1], s = x + y; return [x / s, y / s]; });
      const xi = [[0, 0], [0, 0]];
      for (let t = 0; t < n - 1; t++) for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) xi[i][j] += (al[t][i] * A[i][j] * B[t + 1][j] * be[t + 1][j]) / c[t + 1];
      for (let i = 0; i < 2; i++) { const s = xi[i][0] + xi[i][1]; A[i] = [xi[i][0] / s, xi[i][1] / s]; }
      pi = gam[0].slice();
      for (let k = 0; k < 2; k++) { let nk = 0, sm = 0; for (let t = 0; t < n; t++) { nk += gam[t][k]; sm += gam[t][k] * r[t]; } mu[k] = sm / nk; let v = 0; for (let t = 0; t < n; t++) v += gam[t][k] * (r[t] - mu[k]) ** 2; sd[k] = Math.max(Math.sqrt(v / nk), 1e-6); }
      if (Math.abs(nll - ll) < 1e-8 * Math.abs(nll)) { ll = nll; break; } ll = nll;
      if (it === iters - 1) ll = nll;
    }
    // urutkan: 0 = tenang, 1 = bergejolak
    let o = sd[0] <= sd[1] ? [0, 1] : [1, 0];
    const Ao = [[A[o[0]][o[0]], A[o[0]][o[1]]], [A[o[1]][o[0]], A[o[1]][o[1]]]];
    const filt = al.map((a) => a[o[1]]), stat1 = Ao[0][1] / (Ao[0][1] + Ao[1][0]);
    const now = [1 - filt[n - 1], filt[n - 1]], fc = (h) => { let p = now.slice(); for (let k = 0; k < h; k++) p = [p[0] * Ao[0][0] + p[1] * Ao[1][0], p[0] * Ao[0][1] + p[1] * Ao[1][1]]; return p[1]; };
    return { mu: [mu[o[0]], mu[o[1]]], sd: [sd[o[0]], sd[o[1]]], A: Ao, ll, filt, stationaryHigh: stat1, dur: [1 / (1 - Ao[0][0]), 1 / (1 - Ao[1][1])], probHighNow: now[1], probHigh5: fc(5), probHigh21: fc(21) };
  }
  function hurstRS(r) {
    const N = r.length, pts = [];
    for (let m = 8; m <= Math.floor(N / 2); m *= 2) { const vals = [];
      for (let s = 0; s + m <= N; s += m) { const seg = r.slice(s, s + m), mu = mean(seg); let cum = 0, mx = -Infinity, mn = Infinity; for (const x of seg) { cum += x - mu; mx = Math.max(mx, cum); mn = Math.min(mn, cum); } const sd = std(seg, 0); if (sd > 0) vals.push((mx - mn) / sd); }
      if (vals.length) pts.push([Math.log(m), Math.log(mean(vals))]); }
    if (pts.length < 3) return { H: NaN, pts };
    const mx = mean(pts.map((p) => p[0])), my = mean(pts.map((p) => p[1])); let sxy = 0, sxx = 0; for (const [x, y] of pts) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; }
    // nilai harapan R/S untuk data acak (Anis-Lloyd) -> H "netral" untuk ukuran sampel ini
    const eRS = (m) => { let sum = 0; for (let i = 1; i < m; i++) sum += Math.sqrt((m - i) / i); const f = m <= 340 ? Math.exp(lgamma((m - 1) / 2) - lgamma(m / 2)) / Math.sqrt(Math.PI) : 1 / Math.sqrt((m * Math.PI) / 2); return ((m - 0.5) / m) * f * sum; };
    const e = pts.map(([x]) => [x, Math.log(eRS(Math.round(Math.exp(x))))]), ey = mean(e.map((p) => p[1])); let exy = 0; for (const [x, y] of e) exy += (x - mx) * (y - ey);
    return { H: sxy / sxx, Hnull: exy / sxx, pts };
  }
  function varianceRatio(r, q) { const n = r.length, mu = mean(r); let v1 = 0; for (const x of r) v1 += (x - mu) ** 2; v1 /= n - 1;
    let vq = 0, c = 0; for (let t = q - 1; t < n; t++) { let s = 0; for (let k = 0; k < q; k++) s += r[t - k]; vq += (s - q * mu) ** 2; c++; } vq /= c;
    const VR = vq / (q * v1), z = (VR - 1) / Math.sqrt((2 * (2 * q - 1) * (q - 1)) / (3 * q * n)); return { q, VR, z, p: 2 * (1 - ncdf(Math.abs(z))) }; }
  function acf(x, L) { const n = x.length, m = mean(x); let v = 0; for (const a of x) v += (a - m) ** 2; const out = [];
    for (let k = 1; k <= L; k++) { let s = 0; for (let t = k; t < n; t++) s += (x[t] - m) * (x[t - k] - m); out.push(s / v); } return out; }
  function ljungBox(rho, n, L) { let Q = 0; for (let k = 1; k <= L; k++) Q += (rho[k - 1] ** 2) / (n - k); Q *= n * (n + 2); return { Q, p: chi2p(Q, L) }; }
  function hill(losses, frac = 0.05) { const x = losses.filter((v) => v > 0).sort((a, b) => b - a), k = Math.max(10, Math.floor(x.length * frac)); if (x.length <= k + 1) return NaN;
    let s = 0; for (let i = 0; i < k; i++) s += Math.log(x[i] / x[k]); return k / s; }
  function mathLab(px, opt = {}) {
    const all = logReturns(px), r = all.slice(-(opt.n || 1000)), n = r.length, m = mean(r), s = std(r), sk = skew(r), ku = exKurt(r);
    const JB = (n / 6) * (sk * sk + (ku * ku) / 4), jbP = Math.exp(-JB / 2);
    const so = r.slice().sort((a, b) => a - b); let D = 0; so.forEach((x, i) => { const F = ncdf((x - m) / s); D = Math.max(D, Math.abs((i + 1) / n - F), Math.abs(F - i / n)); });
    // Student-t (profil ν)
    let best = { nu: NaN, ll: -Infinity, sc: s };
    for (let nu = 2.2; nu <= 60; nu += nu < 6 ? 0.1 : nu < 15 ? 0.5 : 2) { for (const f of [0.8, 0.9, 1, 1.1, 1.2]) { const sc = s * Math.sqrt((nu - 2) / nu) * f; let ll = 0; for (const x of r) ll += tLogPdf(x, nu, m, sc); if (ll > best.ll) best = { nu, ll, sc }; } }
    let llN = 0; for (const x of r) llN += Math.log(gpdf(x, m, s));
    const G = gmm2(r), H = hmm2(r, G);
    // KDE Gaussian (Silverman)
    const iqr = so[Math.floor(0.75 * n)] - so[Math.floor(0.25 * n)], h = 0.9 * Math.min(s, iqr / 1.34) * Math.pow(n, -0.2);
    const lo = so[Math.floor(0.003 * n)], hi = so[Math.ceil(0.997 * n) - 1], grid = Array.from({ length: 90 }, (_, i) => lo + ((hi - lo) * i) / 89);
    const kde = grid.map((x) => r.reduce((a, v) => a + gpdf(x, v, h), 0) / n);
    const dens = { grid, kde, normal: grid.map((x) => gpdf(x, m, s)), t: grid.map((x) => Math.exp(tLogPdf(x, best.nu, m, best.sc))), gmm: grid.map((x) => G.w[0] * gpdf(x, G.mu[0], G.sd[0]) + G.w[1] * gpdf(x, G.mu[1], G.sd[1])) };
    const step = Math.max(1, Math.floor(n / 250)), qq = []; for (let i = 0; i < n; i += step) qq.push([qnorm((i + 0.5) / n), (so[i] - m) / s]);
    const tail = (k) => { const z = qnorm(0.01); return { emp: so[Math.floor(0.01 * n)], normal: m + z * s }; };
    const rho = acf(r, 20), rho2 = acf(r.map((x) => (x - m) ** 2), 20), lb = ljungBox(rho, n, 10), lb2 = ljungBox(rho2, n, 10);
    const hu = hurstRS(r), vrs = [2, 5, 10].map((q) => varianceRatio(r, q));
    const alphaL = hill(r.map((x) => -x)), alphaR = hill(r);
    const sig4 = r.filter((x) => Math.abs(x - m) > 4 * s).length, expected4 = n * 2 * (1 - ncdf(4));
    // entropi Shannon relatif (30 bin) vs Gaussian
    const bins = 30, cnt = new Array(bins).fill(0); for (const x of r) { const b = Math.min(bins - 1, Math.max(0, Math.floor(((x - lo) / (hi - lo)) * bins))); cnt[b]++; }
    const ent = -cnt.reduce((a, c) => (c ? a + (c / n) * Math.log(c / n) : a), 0) + Math.log((hi - lo) / bins), entN = 0.5 * Math.log(2 * Math.PI * Math.E * s * s);
    return { n, mean: m, sd: s, skew: sk, kurt: ku, JB, jbP, ksD: D, ksP: ksPvalue(D, n), t: { nu: best.nu, scale: best.sc, ll: best.ll }, llN,
      aicN: 4 - 2 * llN, aicT: 6 - 2 * best.ll, aicG: 10 - 2 * G.ll, bicN: 2 * Math.log(n) - 2 * llN, bicG: 5 * Math.log(n) - 2 * G.ll,
      gmm: { w: G.w, mu: G.mu, sd: G.sd, postNow: G.post[n - 1] }, hmm: { ...H, filt: H.filt.slice(-500) }, dens, qq, tail: tail(), acf: rho, acf2: rho2, lb, lb2,
      hurst: hu.H, hurstNull: hu.Hnull, hurstPts: hu.pts, vr: vrs, hillL: alphaL, hillR: alphaR, sig4, expected4, entropy: ent, entropyN: entN, h, ppy: opt.ppy || 252 };
  }


  // =====================================================================
  // PERPUSTAKAAN STRATEGI: 50 strategi harian + noise band intraday + isi candle
  // =====================================================================
  const T = {
    sma(a, n) { const o = new Array(a.length).fill(null); let s = 0; for (let i = 0; i < a.length; i++) { s += a[i]; if (i >= n) s -= a[i - n]; if (i >= n - 1) o[i] = s / n; } return o; },
    ema(a, n) { const k = 2 / (n + 1), o = new Array(a.length).fill(null); let e = null; for (let i = 0; i < a.length; i++) { if (a[i] == null) continue; e = e == null ? a[i] : a[i] * k + e * (1 - k); o[i] = i >= n - 1 ? e : null; } return o; },
    std(a, n) { const o = new Array(a.length).fill(null); for (let i = n - 1; i < a.length; i++) { let m = 0; for (let j = i - n + 1; j <= i; j++) m += a[j]; m /= n; let v = 0; for (let j = i - n + 1; j <= i; j++) v += (a[j] - m) ** 2; o[i] = Math.sqrt(v / n); } return o; },
    hh(a, n) { const o = new Array(a.length).fill(null); for (let i = n - 1; i < a.length; i++) { let m = -Infinity; for (let j = i - n + 1; j <= i; j++) m = Math.max(m, a[j]); o[i] = m; } return o; },
    ll(a, n) { const o = new Array(a.length).fill(null); for (let i = n - 1; i < a.length; i++) { let m = Infinity; for (let j = i - n + 1; j <= i; j++) m = Math.min(m, a[j]); o[i] = m; } return o; },
    rsi(c, n) { const o = new Array(c.length).fill(null); let g = 0, l = 0; for (let i = 1; i < c.length; i++) { const d = c[i] - c[i - 1], u = Math.max(d, 0), dn = Math.max(-d, 0);
      if (i <= n) { g += u / n; l += dn / n; if (i === n) o[i] = 100 - 100 / (1 + g / (l || 1e-12)); } else { g = (g * (n - 1) + u) / n; l = (l * (n - 1) + dn) / n; o[i] = 100 - 100 / (1 + g / (l || 1e-12)); } } return o; },
    tr(h, l, c) { return h.map((x, i) => (i ? Math.max(x - l[i], Math.abs(x - c[i - 1]), Math.abs(l[i] - c[i - 1])) : x - l[i])); },
    atr(h, l, c, n) { const t = T.tr(h, l, c), o = new Array(c.length).fill(null); let a = null; for (let i = 0; i < c.length; i++) { a = a == null ? t[i] : (a * (n - 1) + t[i]) / n; if (i >= n - 1) o[i] = a; } return o; },
    roc(c, n) { return c.map((x, i) => (i >= n ? x / c[i - n] - 1 : null)); },
    shift(a, k = 1) { return a.map((_, i) => (i >= k ? a[i - k] : null)); },
  };
  // posisi target per hari: 1 = beli/pegang, 0 = keluar, -1 = short (diabaikan bila short tidak diizinkan)
  // helper state machine: masuk saat entry, keluar saat exit
  function machine(n, entry, exit, side = 1) { const p = new Array(n).fill(0); let s = 0; for (let i = 0; i < n; i++) { if (s === 0 && entry(i)) s = side; else if (s !== 0 && exit(i)) s = 0; p[i] = s; } return p; }
  function holdN(n, entry, k) { const p = new Array(n).fill(0); let left = 0; for (let i = 0; i < n; i++) { if (left > 0) { left--; p[i] = 1; } else if (entry(i)) { left = k - 1; p[i] = 1; } } return p; }
  const ok = (...x) => x.every((v) => v != null && isFinite(v));
  const STRATS = [
    // ---- TREN ----
    ["sma2050", "Tren", "SMA 20/50", "Pegang selama SMA20 di atas SMA50.", (D) => { const a = T.sma(D.c, 20), b = T.sma(D.c, 50); return D.c.map((_, i) => (ok(a[i], b[i]) ? (a[i] > b[i] ? 1 : -1) : 0)); }],
    ["golden", "Tren", "Golden cross 50/200", "Pegang selama SMA50 di atas SMA200.", (D) => { const a = T.sma(D.c, 50), b = T.sma(D.c, 200); return D.c.map((_, i) => (ok(a[i], b[i]) ? (a[i] > b[i] ? 1 : -1) : 0)); }],
    ["ema1226", "Tren", "EMA 12/26", "Pegang selama EMA12 di atas EMA26.", (D) => { const a = T.ema(D.c, 12), b = T.ema(D.c, 26); return D.c.map((_, i) => (ok(a[i], b[i]) ? (a[i] > b[i] ? 1 : -1) : 0)); }],
    ["above200", "Tren", "Di atas SMA200", "Pegang selama harga di atas SMA200 (filter tren panjang).", (D) => { const a = T.sma(D.c, 200); return D.c.map((x, i) => (ok(a[i]) ? (x > a[i] ? 1 : -1) : 0)); }],
    ["macdsig", "Tren", "MACD > sinyal", "Pegang selama MACD(12,26) di atas garis sinyal 9.", (D) => { const a = T.ema(D.c, 12), b = T.ema(D.c, 26), m = a.map((x, i) => (ok(x, b[i]) ? x - b[i] : null)), s = T.ema(m.map((x) => x ?? 0), 9); return m.map((x, i) => (ok(x, s[i]) && i > 35 ? (x > s[i] ? 1 : -1) : 0)); }],
    ["donch20", "Tren", "Donchian 20/10", "Beli saat tutup di atas tertinggi 20 hari; keluar saat di bawah terendah 10 hari.", (D) => { const H = T.shift(T.hh(D.h, 20)), L = T.shift(T.ll(D.l, 10)); return machine(D.n, (i) => ok(H[i]) && D.c[i] > H[i], (i) => ok(L[i]) && D.c[i] < L[i]); }],
    ["turtle", "Tren", "Turtle 55/20", "Beli saat tutup di atas tertinggi 55 hari; keluar di bawah terendah 20 hari.", (D) => { const H = T.shift(T.hh(D.h, 55)), L = T.shift(T.ll(D.l, 20)); return machine(D.n, (i) => ok(H[i]) && D.c[i] > H[i], (i) => ok(L[i]) && D.c[i] < L[i]); }],
    ["supertrend", "Tren", "Supertrend (10, 3)", "Mengikuti arah Supertrend berbasis ATR.", (D) => { const a = T.atr(D.h, D.l, D.c, 10), p = new Array(D.n).fill(0); let up = null, dn = null, dir = 1;
      for (let i = 0; i < D.n; i++) { if (!ok(a[i])) continue; const m = (D.h[i] + D.l[i]) / 2, bu = m + 3 * a[i], bl = m - 3 * a[i];
        up = up == null || bu < up || D.c[i - 1] > up ? bu : up; dn = dn == null || bl > dn || D.c[i - 1] < dn ? bl : dn;
        if (D.c[i] > up) dir = 1; else if (D.c[i] < dn) dir = -1; p[i] = dir; } return p; }],
    ["psar", "Tren", "Parabolic SAR", "Mengikuti arah Parabolic SAR (0,02/0,2).", (D) => { const p = new Array(D.n).fill(0); if (D.n < 3) return p; let up = true, sar = D.l[0], ep = D.h[0], af = 0.02;
      for (let i = 1; i < D.n; i++) { sar = sar + af * (ep - sar);
        if (up) { sar = Math.min(sar, D.l[i - 1], D.l[Math.max(0, i - 2)]); if (D.l[i] < sar) { up = false; sar = ep; ep = D.l[i]; af = 0.02; } else if (D.h[i] > ep) { ep = D.h[i]; af = Math.min(0.2, af + 0.02); } }
        else { sar = Math.max(sar, D.h[i - 1], D.h[Math.max(0, i - 2)]); if (D.h[i] > sar) { up = true; sar = ep; ep = D.h[i]; af = 0.02; } else if (D.l[i] < ep) { ep = D.l[i]; af = Math.min(0.2, af + 0.02); } }
        p[i] = i > 10 ? (up ? 1 : -1) : 0; } return p; }],
    ["ichimoku", "Tren", "Ichimoku", "Beli saat harga di atas awan dan Tenkan > Kijun; keluar saat di bawah awan.", (D) => { const mid = (n) => T.hh(D.h, n).map((x, i) => (ok(x) ? (x + T.ll(D.l, n)[i]) / 2 : null));
      const tk = mid(9), kj = mid(26), sa = T.shift(tk.map((x, i) => (ok(x, kj[i]) ? (x + kj[i]) / 2 : null)), 26), sb = T.shift(mid(52), 26);
      return machine(D.n, (i) => ok(sa[i], sb[i], tk[i], kj[i]) && D.c[i] > Math.max(sa[i], sb[i]) && tk[i] > kj[i], (i) => ok(sa[i], sb[i]) && D.c[i] < Math.min(sa[i], sb[i])); }],
    ["adx", "Tren", "ADX tren kuat", "Pegang saat ADX(14) > 25 dan +DI > −DI.", (D) => { const n = 14, pd = [0], md = [0]; for (let i = 1; i < D.n; i++) { const u = D.h[i] - D.h[i - 1], d = D.l[i - 1] - D.l[i]; pd.push(u > d && u > 0 ? u : 0); md.push(d > u && d > 0 ? d : 0); }
      const a = T.atr(D.h, D.l, D.c, n), sp = T.ema(pd, 2 * n - 1), sm = T.ema(md, 2 * n - 1), dip = sp.map((x, i) => (ok(x, a[i]) ? (100 * x) / a[i] : null)), dim = sm.map((x, i) => (ok(x, a[i]) ? (100 * x) / a[i] : null));
      const dx = dip.map((x, i) => (ok(x, dim[i]) && x + dim[i] > 0 ? (100 * Math.abs(x - dim[i])) / (x + dim[i]) : null)), adx = T.ema(dx.map((x) => x ?? 0), 2 * n - 1);
      return D.c.map((_, i) => (i > 3 * n && ok(adx[i], dip[i], dim[i]) && adx[i] > 25 ? (dip[i] > dim[i] ? 1 : -1) : 0)); }],
    // ---- MOMENTUM ----
    ["tsm12", "Momentum", "Momentum 12 bulan", "Pegang bila return 12 bulan terakhir positif (time-series momentum).", (D) => { const r = T.roc(D.c, 252); return r.map((x) => (ok(x) ? (x > 0 ? 1 : -1) : 0)); }],
    ["tsm3", "Momentum", "Momentum 3 bulan", "Pegang bila return 63 hari positif.", (D) => { const r = T.roc(D.c, 63); return r.map((x) => (ok(x) ? (x > 0 ? 1 : -1) : 0)); }],
    ["tsm1", "Momentum", "Momentum 1 bulan", "Pegang bila return 21 hari positif.", (D) => { const r = T.roc(D.c, 21); return r.map((x) => (ok(x) ? (x > 0 ? 1 : -1) : 0)); }],
    ["rsi50", "Momentum", "RSI di atas 50", "Pegang selama RSI(14) > 50.", (D) => { const r = T.rsi(D.c, 14); return r.map((x) => (ok(x) ? (x > 50 ? 1 : -1) : 0)); }],
    ["aroon", "Momentum", "Aroon (25)", "Pegang saat Aroon Up > 70 dan > Aroon Down.", (D) => { const n = 25, p = new Array(D.n).fill(0);
      for (let i = n; i < D.n; i++) { let hi = 0, lo = 0; for (let j = 1; j <= n; j++) { if (D.h[i - j] > D.h[i - hi]) hi = j; if (D.l[i - j] < D.l[i - lo]) lo = j; } const au = (100 * (n - hi)) / n, ad = (100 * (n - lo)) / n; p[i] = au > 70 && au > ad ? 1 : ad > 70 && ad > au ? -1 : p[i - 1]; } return p; }],
    ["linslope", "Momentum", "Kemiringan regresi 50 hari", "Pegang bila garis regresi linier 50 hari miring naik.", (D) => { const n = 50, p = new Array(D.n).fill(0), xm = (n - 1) / 2, sxx = (n * (n * n - 1)) / 12;
      for (let i = n - 1; i < D.n; i++) { let ym = 0; for (let j = 0; j < n; j++) ym += Math.log(D.c[i - n + 1 + j]); ym /= n; let sxy = 0; for (let j = 0; j < n; j++) sxy += (j - xm) * (Math.log(D.c[i - n + 1 + j]) - ym); p[i] = sxy / sxx > 0 ? 1 : -1; } return p; }],
    ["hi52", "Momentum", "Dekat puncak 52 minggu", "Pegang saat harga dalam 5% dari tertinggi 252 hari; keluar bila turun > 10% dari puncak.", (D) => { const H = T.hh(D.h, 252); return machine(D.n, (i) => ok(H[i]) && D.c[i] >= 0.95 * H[i], (i) => ok(H[i]) && D.c[i] < 0.9 * H[i]); }],
    ["accel", "Momentum", "Momentum berakselerasi", "Pegang bila return 1 bulan > sepertiga return 3 bulan dan return 3 bulan positif.", (D) => { const a = T.roc(D.c, 21), b = T.roc(D.c, 63); return a.map((x, i) => (ok(x, b[i]) ? (b[i] > 0 && x > b[i] / 3 ? 1 : 0) : 0)); }],
    // ---- MEAN REVERSION ----
    ["rsi2", "Mean reversion", "RSI(2) Connors", "Beli saat RSI(2) < 10 dan di atas SMA200; jual saat tutup di atas SMA5.", (D) => { const r = T.rsi(D.c, 2), m200 = T.sma(D.c, 200), m5 = T.sma(D.c, 5); return machine(D.n, (i) => ok(r[i], m200[i]) && r[i] < 10 && D.c[i] > m200[i], (i) => ok(m5[i]) && D.c[i] > m5[i]); }],
    ["rsi3070", "Mean reversion", "RSI 30/70", "Beli saat RSI(14) < 30; jual saat RSI > 70.", (D) => { const r = T.rsi(D.c, 14); return machine(D.n, (i) => ok(r[i]) && r[i] < 30, (i) => ok(r[i]) && r[i] > 70); }],
    ["bbrev", "Mean reversion", "Bollinger kembali ke tengah", "Beli saat tutup di bawah pita bawah (20, 2σ); jual saat kembali ke MA20.", (D) => { const m = T.sma(D.c, 20), s = T.std(D.c, 20); return machine(D.n, (i) => ok(m[i], s[i]) && D.c[i] < m[i] - 2 * s[i], (i) => ok(m[i]) && D.c[i] > m[i]); }],
    ["zrev", "Mean reversion", "Z-score 20 hari", "Beli saat z-score harga < −2; jual saat z > 0.", (D) => { const m = T.sma(D.c, 20), s = T.std(D.c, 20), z = D.c.map((x, i) => (ok(m[i], s[i]) && s[i] > 0 ? (x - m[i]) / s[i] : null)); return machine(D.n, (i) => ok(z[i]) && z[i] < -2, (i) => ok(z[i]) && z[i] > 0); }],
    ["willr", "Mean reversion", "Williams %R", "Beli saat %R(14) < −90; jual saat > −20.", (D) => { const H = T.hh(D.h, 14), L = T.ll(D.l, 14), w = D.c.map((x, i) => (ok(H[i], L[i]) && H[i] > L[i] ? (-100 * (H[i] - x)) / (H[i] - L[i]) : null)); return machine(D.n, (i) => ok(w[i]) && w[i] < -90, (i) => ok(w[i]) && w[i] > -20); }],
    ["stoch", "Mean reversion", "Stochastic 20/80", "Beli saat %K(14,3) naik melewati 20; jual saat > 80.", (D) => { const H = T.hh(D.h, 14), L = T.ll(D.l, 14), k = T.sma(D.c.map((x, i) => (ok(H[i], L[i]) && H[i] > L[i] ? (100 * (x - L[i])) / (H[i] - L[i]) : 50)), 3);
      return machine(D.n, (i) => i > 16 && ok(k[i], k[i - 1]) && k[i - 1] < 20 && k[i] >= 20, (i) => ok(k[i]) && k[i] > 80); }],
    ["cci", "Mean reversion", "CCI ±100", "Beli saat CCI(20) < −100; jual saat > +100.", (D) => { const tp = D.c.map((x, i) => (D.h[i] + D.l[i] + x) / 3), m = T.sma(tp, 20), md = tp.map((_, i) => { if (!ok(m[i])) return null; let s = 0; for (let j = i - 19; j <= i; j++) s += Math.abs(tp[j] - m[i]); return s / 20; });
      const cc = tp.map((x, i) => (ok(m[i], md[i]) && md[i] > 0 ? (x - m[i]) / (0.015 * md[i]) : null)); return machine(D.n, (i) => ok(cc[i]) && cc[i] < -100, (i) => ok(cc[i]) && cc[i] > 100); }],
    ["ibs", "Mean reversion", "Internal Bar Strength", "Beli saat tutup di 20% bawah rentang hari itu; jual saat di 80% atas.", (D) => { const b = D.c.map((x, i) => (D.h[i] > D.l[i] ? (x - D.l[i]) / (D.h[i] - D.l[i]) : 0.5)); return machine(D.n, (i) => b[i] < 0.2, (i) => b[i] > 0.8); }],
    ["down3", "Mean reversion", "3 hari turun beruntun", "Beli setelah 3 penutupan turun berturut-turut; jual pada penutupan naik pertama.", (D) => machine(D.n, (i) => i > 3 && D.c[i] < D.c[i - 1] && D.c[i - 1] < D.c[i - 2] && D.c[i - 2] < D.c[i - 3], (i) => D.c[i] > D.c[i - 1])],
    ["drop2s", "Mean reversion", "Rebound setelah anjlok", "Beli setelah turun > 2σ harian; tahan 3 hari.", (D) => { const r = D.c.map((x, i) => (i ? Math.log(x / D.c[i - 1]) : 0)), s = T.std(r, 60); return holdN(D.n, (i) => ok(s[i]) && r[i] < -2 * s[i], 3); }],
    ["double7", "Mean reversion", "Double 7s", "Beli saat tutup di terendah 7 hari dan di atas SMA200; jual saat di tertinggi 7 hari.", (D) => { const L = T.ll(D.c, 7), H = T.hh(D.c, 7), m = T.sma(D.c, 200); return machine(D.n, (i) => ok(L[i], m[i]) && D.c[i] <= L[i] && D.c[i] > m[i], (i) => ok(H[i]) && D.c[i] >= H[i]); }],
    ["kcrev", "Mean reversion", "Keltner kembali ke tengah", "Beli saat di bawah Keltner bawah (EMA20 − 2 ATR); jual di EMA20.", (D) => { const e = T.ema(D.c, 20), a = T.atr(D.h, D.l, D.c, 20); return machine(D.n, (i) => ok(e[i], a[i]) && D.c[i] < e[i] - 2 * a[i], (i) => ok(e[i]) && D.c[i] > e[i]); }],
    ["linreg", "Mean reversion", "Kanal regresi 50 hari", "Beli saat harga 2σ di bawah garis regresi 50 hari; jual saat kembali ke garis.", (D) => { const n = 50, z = new Array(D.n).fill(null), xm = (n - 1) / 2, sxx = (n * (n * n - 1)) / 12;
      for (let i = n - 1; i < D.n; i++) { let ym = 0; for (let j = 0; j < n; j++) ym += D.c[i - n + 1 + j]; ym /= n; let sxy = 0; for (let j = 0; j < n; j++) sxy += (j - xm) * (D.c[i - n + 1 + j] - ym); const b = sxy / sxx, a0 = ym - b * xm; let se = 0; for (let j = 0; j < n; j++) se += (D.c[i - n + 1 + j] - (a0 + b * j)) ** 2; se = Math.sqrt(se / n); z[i] = se > 0 ? (D.c[i] - (a0 + b * (n - 1))) / se : 0; }
      return machine(D.n, (i) => ok(z[i]) && z[i] < -2, (i) => ok(z[i]) && z[i] > 0); }],
    // ---- VOLATILITAS / BREAKOUT ----
    ["atrbo", "Volatilitas", "Breakout ATR", "Beli saat tutup naik > 1,5 ATR dari kemarin; keluar saat di bawah SMA10.", (D) => { const a = T.atr(D.h, D.l, D.c, 14), m = T.sma(D.c, 10); return machine(D.n, (i) => i > 0 && ok(a[i - 1]) && D.c[i] > D.c[i - 1] + 1.5 * a[i - 1], (i) => ok(m[i]) && D.c[i] < m[i]); }],
    ["squeeze", "Volatilitas", "Squeeze Bollinger–Keltner", "Setelah pita Bollinger masuk ke dalam Keltner (volatilitas menyempit), beli saat tutup di atas pita atas; keluar di bawah MA20.", (D) => { const m = T.sma(D.c, 20), s = T.std(D.c, 20), e = T.ema(D.c, 20), a = T.atr(D.h, D.l, D.c, 20);
      const sq = D.c.map((_, i) => ok(m[i], s[i], e[i], a[i]) && m[i] + 2 * s[i] < e[i] + 1.5 * a[i] && m[i] - 2 * s[i] > e[i] - 1.5 * a[i]);
      return machine(D.n, (i) => i > 5 && sq.slice(i - 5, i).some(Boolean) && D.c[i] > m[i] + 2 * s[i], (i) => ok(m[i]) && D.c[i] < m[i]); }],
    ["nr7", "Volatilitas", "NR7 breakout", "Setelah hari dengan rentang tersempit 7 hari, beli bila tutup di atas tertinggi hari itu; tahan 5 hari.", (D) => { const rg = D.h.map((x, i) => x - D.l[i]); return holdN(D.n, (i) => i > 8 && rg[i - 1] <= Math.min(...rg.slice(i - 7, i)) && D.c[i] > D.h[i - 1], 5); }],
    ["insidebar", "Volatilitas", "Inside bar breakout", "Setelah inside bar, beli bila tutup di atas tertinggi bar induk; tahan 5 hari.", (D) => holdN(D.n, (i) => i > 2 && D.h[i - 1] < D.h[i - 2] && D.l[i - 1] > D.l[i - 2] && D.c[i] > D.h[i - 2], 5)],
    ["kcbo", "Volatilitas", "Breakout Keltner", "Beli saat tutup di atas EMA20 + 2 ATR; keluar di bawah EMA20.", (D) => { const e = T.ema(D.c, 20), a = T.atr(D.h, D.l, D.c, 20); return machine(D.n, (i) => ok(e[i], a[i]) && D.c[i] > e[i] + 2 * a[i], (i) => ok(e[i]) && D.c[i] < e[i]); }],
    ["bbbo", "Volatilitas", "Breakout Bollinger", "Beli saat tutup di atas pita atas (20, 2σ); keluar di bawah MA20.", (D) => { const m = T.sma(D.c, 20), s = T.std(D.c, 20); return machine(D.n, (i) => ok(m[i], s[i]) && D.c[i] > m[i] + 2 * s[i], (i) => ok(m[i]) && D.c[i] < m[i]); }],
    ["voltarget", "Volatilitas", "Tren + target volatilitas", "Di atas SMA100, ukuran posisi = 15% ÷ volatilitas 20 hari (maks 100%).", (D) => { const m = T.sma(D.c, 100), r = D.c.map((x, i) => (i ? Math.log(x / D.c[i - 1]) : 0)), s = T.std(r, 20); return D.c.map((x, i) => (ok(m[i], s[i]) && s[i] > 0 && x > m[i] ? Math.min(1, 0.15 / (s[i] * Math.sqrt(252))) : 0)); }],
    ["lowvol", "Volatilitas", "Rezim volatilitas rendah", "Pegang saat volatilitas 20 hari di bawah volatilitas 100 hari dan harga di atas SMA50.", (D) => { const r = D.c.map((x, i) => (i ? Math.log(x / D.c[i - 1]) : 0)), a = T.std(r, 20), b = T.std(r, 100), m = T.sma(D.c, 50); return D.c.map((x, i) => (ok(a[i], b[i], m[i]) ? (a[i] < b[i] && x > m[i] ? 1 : 0) : 0)); }],
    // ---- VOLUME ----
    ["obv", "Volume", "OBV di atas rata-ratanya", "Pegang saat On-Balance Volume di atas SMA20-nya.", (D) => { const o = [0]; for (let i = 1; i < D.n; i++) o.push(o[i - 1] + (D.c[i] > D.c[i - 1] ? D.v[i] : D.c[i] < D.c[i - 1] ? -D.v[i] : 0)); const m = T.sma(o, 20); return o.map((x, i) => (ok(m[i]) ? (x > m[i] ? 1 : -1) : 0)); }],
    ["volspike", "Volume", "Lonjakan volume + breakout", "Beli saat volume > 2× rata-rata 20 hari dan tutup di atas tertinggi 20 hari; tahan 10 hari.", (D) => { const av = T.shift(T.sma(D.v, 20)), H = T.shift(T.hh(D.h, 20)); return holdN(D.n, (i) => ok(av[i], H[i]) && av[i] > 0 && D.v[i] > 2 * av[i] && D.c[i] > H[i], 10); }],
    ["mfi", "Volume", "Money Flow Index 20/80", "Beli saat MFI(14) < 20; jual saat > 80.", (D) => { const tp = D.c.map((x, i) => (D.h[i] + D.l[i] + x) / 3), mf = new Array(D.n).fill(null);
      for (let i = 14; i < D.n; i++) { let p = 0, q = 0; for (let j = i - 13; j <= i; j++) { const f = tp[j] * D.v[j]; if (tp[j] > tp[j - 1]) p += f; else if (tp[j] < tp[j - 1]) q += f; } mf[i] = 100 - 100 / (1 + p / (q || 1e-12)); }
      return machine(D.n, (i) => ok(mf[i]) && mf[i] < 20, (i) => ok(mf[i]) && mf[i] > 80); }],
    ["cmf", "Volume", "Chaikin Money Flow", "Pegang saat CMF(20) > +0,05; keluar saat < −0,05.", (D) => { const mfv = D.c.map((x, i) => (D.h[i] > D.l[i] ? ((x - D.l[i] - (D.h[i] - x)) / (D.h[i] - D.l[i])) * D.v[i] : 0)), a = T.sma(mfv, 20), b = T.sma(D.v, 20);
      const cmf = a.map((x, i) => (ok(x, b[i]) && b[i] > 0 ? x / b[i] : null)); return machine(D.n, (i) => ok(cmf[i]) && cmf[i] > 0.05, (i) => ok(cmf[i]) && cmf[i] < -0.05); }],
    ["adline", "Volume", "Garis akumulasi/distribusi", "Pegang saat garis A/D di atas SMA20-nya (ada akumulasi).", (D) => { const o = []; let s = 0; for (let i = 0; i < D.n; i++) { s += D.h[i] > D.l[i] ? ((D.c[i] - D.l[i] - (D.h[i] - D.c[i])) / (D.h[i] - D.l[i])) * D.v[i] : 0; o.push(s); } const m = T.sma(o, 20); return o.map((x, i) => (ok(m[i]) ? (x > m[i] ? 1 : 0) : 0)); }],
    ["vwap20", "Volume", "Di atas VWAP 20 hari", "Pegang saat harga di atas harga rata-rata tertimbang volume 20 hari.", (D) => { const pv = T.sma(D.c.map((x, i) => ((D.h[i] + D.l[i] + x) / 3) * D.v[i]), 20), vv = T.sma(D.v, 20); return D.c.map((x, i) => (ok(pv[i], vv[i]) && vv[i] > 0 ? (x > pv[i] / vv[i] ? 1 : -1) : 0)); }],
    ["pocrev", "Volume", "Kembali ke POC 60 hari", "Beli saat harga > 5% di bawah POC (harga dengan volume terbanyak) 60 hari; jual saat menyentuh POC.", (D) => { const poc = new Array(D.n).fill(null), B = 30;
      for (let i = 60; i < D.n; i++) { let lo = Infinity, hi = -Infinity; for (let j = i - 59; j <= i; j++) { lo = Math.min(lo, D.l[j]); hi = Math.max(hi, D.h[j]); } const w = (hi - lo) / B || 1, bins = new Array(B).fill(0);
        for (let j = i - 59; j <= i; j++) { const a = Math.floor((D.l[j] - lo) / w), b = Math.min(B - 1, Math.floor((D.h[j] - lo) / w)); for (let k = a; k <= b; k++) bins[k] += D.v[j] / (b - a + 1); }
        const k = bins.indexOf(Math.max(...bins)); poc[i] = lo + (k + 0.5) * w; }
      return machine(D.n, (i) => ok(poc[i]) && D.c[i] < 0.95 * poc[i], (i) => ok(poc[i]) && D.c[i] >= poc[i]); }],
    ["volma", "Volume", "Tren dikonfirmasi volume", "Pegang saat SMA20 > SMA50 dan OBV naik dalam 20 hari.", (D) => { const a = T.sma(D.c, 20), b = T.sma(D.c, 50), o = [0]; for (let i = 1; i < D.n; i++) o.push(o[i - 1] + (D.c[i] > D.c[i - 1] ? D.v[i] : D.c[i] < D.c[i - 1] ? -D.v[i] : 0));
      return D.c.map((_, i) => (ok(a[i], b[i]) && i >= 20 ? (a[i] > b[i] && o[i] > o[i - 20] ? 1 : 0) : 0)); }],
    // ---- MUSIMAN / STATISTIK ----
    ["tom", "Musiman", "Turn of the month", "Pegang di hari bursa terakhir bulan dan 3 hari bursa pertama bulan berikutnya.", (D) => { const p = new Array(D.n).fill(0); for (let i = 0; i < D.n; i++) { const m = D.d[i].slice(0, 7); let k = 0; for (let j = i; j >= 0 && D.d[j].slice(0, 7) === m; j--) k++; const last = i + 1 < D.n && D.d[i + 1].slice(0, 7) !== m; if (last || k <= 3) p[i] = 1; }
      // posisi berlaku untuk return hari berikutnya: geser satu supaya hari pertama s/d ketiga ikut terhitung
      return p.map((_, i) => (i + 1 < D.n ? p[i + 1] : 0)); }],
    ["trendlowvol", "Statistik", "Tren + volatilitas di bawah median", "Pegang saat SMA50 > SMA200 dan volatilitas 20 hari di bawah median 1 tahunnya.", (D) => { const a = T.sma(D.c, 50), b = T.sma(D.c, 200), r = D.c.map((x, i) => (i ? Math.log(x / D.c[i - 1]) : 0)), s = T.std(r, 20);
      return D.c.map((_, i) => { if (!ok(a[i], b[i], s[i]) || i < 252) return 0; const w = s.slice(i - 251, i + 1).filter((x) => x != null).sort((x, y) => x - y); return a[i] > b[i] && s[i] < w[w.length >> 1] ? 1 : 0; }); }],
  ];
  function perf(r, dates, ppy, rf = 0) {
    const n = r.length; if (!n) return null; let eq = 1, pk = 1, mdd = 0; const curve = [1];
    for (const x of r) { eq *= 1 + x; curve.push(eq); pk = Math.max(pk, eq); mdd = Math.max(mdd, 1 - eq / pk); }
    const yrs = n / ppy, m = mean(r), s = std(r), dn = Math.sqrt(r.reduce((a, x) => a + Math.min(0, x) ** 2, 0) / n);
    const cagr = eq > 0 ? Math.pow(eq, 1 / Math.max(yrs, 1e-9)) - 1 : -1;
    return { total: eq - 1, cagr, vol: s * Math.sqrt(ppy), sharpe: s > 0 ? ((m - rf / ppy) / s) * Math.sqrt(ppy) : 0, sortino: dn > 0 ? ((m - rf / ppy) / dn) * Math.sqrt(ppy) : 0, maxDD: mdd, calmar: mdd > 0 ? cagr / mdd : 0, curve, yrs };
  }
  function periodReturns(r, dates) { // rate of return per bulan & per tahun
    const M = {}, Y = {}; r.forEach((x, i) => { const d = dates[i], ym = d.slice(0, 7), y = d.slice(0, 4); M[ym] = (M[ym] ?? 1) * (1 + x); Y[y] = (Y[y] ?? 1) * (1 + x); });
    for (const k in M) M[k] -= 1; for (const k in Y) Y[k] -= 1; return { monthly: M, yearly: Y };
  }
  function runStrategy(id, D, o = {}) {
    const S = STRATS.find((x) => x[0] === id); if (!S) throw new Error("Strategi tidak dikenal");
    const raw = S[4](D), cost = (o.costBps ?? 20) / 1e4, allowShort = !!o.short, ppy = o.ppy || 252, rf = o.rf || 0;
    const pos = raw.map((x) => (x == null || !isFinite(x) ? 0 : x < 0 ? (allowShort ? Math.max(-1, x) : 0) : Math.min(1, x)));
    const r = [], rb = [], dates = [], trades = []; let prev = 0, open = null, gsum = 0, turn = 0;
    for (let t = 0; t < D.n - 1; t++) { // posisi ditentukan saat tutup hari t, berlaku untuk return t → t+1
      const ret = D.c[t + 1] / D.c[t] - 1, chg = Math.abs(pos[t] - prev);
      r.push(pos[t] * ret - cost * chg); rb.push(ret); dates.push(D.d[t + 1]); gsum += pos[t] * ret; turn += chg;
      if (prev === 0 && pos[t] !== 0) open = { in: D.d[t], px: D.c[t], side: Math.sign(pos[t]), w: Math.abs(pos[t]) };
      else if (prev !== 0 && (pos[t] === 0 || Math.sign(pos[t]) !== Math.sign(prev)) && open) { trades.push({ ...open, out: D.d[t], pxOut: D.c[t], ret: open.side * (D.c[t] / open.px - 1) - 2 * cost, days: D.d.indexOf(D.d[t]) - D.d.indexOf(open.in) }); open = pos[t] !== 0 ? { in: D.d[t], px: D.c[t], side: Math.sign(pos[t]), w: Math.abs(pos[t]) } : null; }
      prev = pos[t]; }
    if (open) trades.push({ ...open, out: null, pxOut: D.c[D.n - 1], ret: open.side * (D.c[D.n - 1] / open.px - 1) - cost, days: D.n - 1 - D.d.indexOf(open.in), openNow: true });
    const k = Math.floor(r.length * (o.split ?? 0.7)), closed = trades.filter((x) => !x.openNow), wins = closed.filter((x) => x.ret > 0);
    const gp = closed.filter((x) => x.ret > 0).reduce((a, x) => a + x.ret, 0), gl = -closed.filter((x) => x.ret < 0).reduce((a, x) => a + x.ret, 0);
    return { id, name: S[2], cat: S[1], desc: S[3], dates, r, rb, pos: pos[D.n - 1], posPrev: pos[D.n - 2], trades,
      all: perf(r, dates, ppy, rf), bh: perf(rb, dates, ppy, rf), is: perf(r.slice(0, k), dates, ppy, rf), oos: perf(r.slice(k), dates, ppy, rf), oosBh: perf(rb.slice(k), dates, ppy, rf), splitDate: dates[k],
      exposure: pos.filter((x) => x !== 0).length / pos.length, nTrades: closed.length, winRate: closed.length ? wins.length / closed.length : NaN, avgTrade: closed.length ? mean(closed.map((x) => x.ret)) : NaN,
      profitFactor: gl > 0 ? gp / gl : gp > 0 ? Infinity : NaN, avgDays: closed.length ? mean(closed.map((x) => x.days)) : NaN, periods: periodReturns(r, dates), periodsBh: periodReturns(rb, dates),
      beBps: turn > 0 ? (gsum / turn) * 1e4 : Infinity, // biaya per transaksi (bps) yang membuat untung bersih = 0
      dsr: dsr(r, 0), consist: consistency(r, rb, 5), posArr: pos };
  }
  // ---------- uji keandalan: DSR, konsistensi, seleksi walk-forward ----------
  function moments(r) { const n = r.length, m = mean(r); let v = 0, s3 = 0, s4 = 0; for (const x of r) { const d = x - m; v += d * d; s3 += d ** 3; s4 += d ** 4; } v /= n; const sd = Math.sqrt(v);
    return { n, m, sd, sr: sd > 0 ? m / sd : 0, skew: sd > 0 ? s3 / n / sd ** 3 : 0, kurt: sd > 0 ? s4 / n / v ** 2 : 3 }; }
  // Probabilistic / Deflated Sharpe Ratio (Bailey & López de Prado 2014): peluang Sharpe sebenarnya > srStar (per periode)
  function dsr(r, srStar) { const M = moments(r); if (M.n < 30 || !(M.sd > 0)) return NaN;
    const den = Math.sqrt(Math.max(1e-9, 1 - M.skew * M.sr + ((M.kurt - 1) / 4) * M.sr ** 2)); return ncdf(((M.sr - srStar) * Math.sqrt(M.n - 1)) / den); }
  function srOf(r) { const M = moments(r); return M.sr; }
  // berapa dari k potongan waktu (berurutan) di mana strategi ≥ beli-dan-tahan (Sharpe)
  function consistency(r, rb, k) { const n = r.length, L = Math.floor(n / k); let c = 0; if (L < 20) return { k: 0, of: 0 };
    for (let i = 0; i < k; i++) { const a = i * L, b = i === k - 1 ? n : a + L; if (srOf(r.slice(a, b)) >= srOf(rb.slice(a, b)) - 1e-12) c++; } return { k: c, of: k }; }
  function runAllStrategies(D, o = {}) {
    const R = {}, PA = {}, out = STRATS.map((S) => { try { const X = runStrategy(S[0], D, o); R[S[0]] = X.r; PA[S[0]] = X.posArr;
      return { id: X.id, name: X.name, cat: X.cat, total: X.all.total, cagr: X.all.cagr, sharpe: X.all.sharpe, maxDD: X.all.maxDD, oosSharpe: X.oos.sharpe, isSharpe: X.is.sharpe, nTrades: X.nTrades, winRate: X.winRate,
        exposure: X.exposure, pos: X.pos, posPrev: X.posPrev, avgDays: X.avgDays, beBps: X.beBps, consist: X.consist, srp: srOf(X.r) }; } catch (e) { return { id: S[0], name: S[2], cat: S[1], error: e.message }; } });
    const bh = runStrategy(STRATS[0][0], D, o); const yrsOos = bh.oos.yrs, rb = bh.rb, dates = bh.dates, ppy = o.ppy || 252;
    // Sharpe tertinggi yang diharapkan muncul HANYA karena kebetulan dari N strategi (Bailey & López de Prado)
    const ok = out.filter((x) => !x.error), N = ok.length, g = 0.5772, z = qnorm, E = (1 - g) * z(1 - 1 / N) + g * z(1 - 1 / (N * Math.E));
    const sdSR = 1 / Math.sqrt(Math.max(yrsOos, 0.25)), luck = sdSR * E;
    // DSR: ambang per periode dari sebaran Sharpe antar-strategi (minimal varians sampling 1/T)
    const srs = ok.map((x) => x.srp), T = rb.length, vCross = srs.length > 1 ? std(srs) ** 2 : 0, srStar = Math.sqrt(Math.max(vCross, 1 / T)) * E;
    const bhOos = bh.oosBh.sharpe, bhSr = bh.bh.sharpe;
    for (const x of ok) { x.dsr = dsr(R[x.id], srStar);
      x.pass = x.dsr >= 0.9 && x.consist.k >= Math.ceil(0.6 * x.consist.of) && x.oosSharpe > bhOos && x.sharpe > bhSr && x.nTrades >= 5; }
    // seleksi walk-forward: tiap jendela pakai strategi dengan Sharpe terbaik SEBELUM jendela itu → hasil jujur "memilih dari peringkat"
    const n = rb.length, s0 = Math.floor(n * 0.4), K = 6, Lw = Math.floor((n - s0) / K), wr = [], wb = [], wd = [], picks = [];
    if (Lw >= 20) for (let w = 0; w < K; w++) { const a = s0 + w * Lw, b = w === K - 1 ? n : a + Lw;
      let best = null, bs = -Infinity; for (const x of ok) { const v = srOf(R[x.id].slice(0, a)); if (v > bs) { bs = v; best = x; } }
      picks.push({ from: dates[a], to: dates[b - 1], name: best.name, id: best.id }); for (let t = a; t < b; t++) { wr.push(R[best.id][t]); wb.push(rb[t]); wd.push(dates[t]); } }
    // suara konsensus per hari (untuk menguji akurasi historis Rencana aksi)
    const vote = (L, wfn) => { const v = new Array(D.n).fill(0); let W = 0; for (const x of L) { const w = wfn(x); W += w; const pa = PA[x.id]; for (let t = 0; t < D.n; t++) v[t] += w * Math.max(0, Math.min(1, pa[t])); } return W > 0 ? v.map((x) => x / W) : null; };
    const passL = ok.filter((x) => x.pass), votes = { pass: passL.length ? vote(passL, (x) => Math.max(0.05, x.dsr - 0.5)) : null, all: vote(ok, () => 1) };
    // versi jujur: strategi "lolos" dipilih ulang tiap 63 hari HANYA dari data sebelum titik itu → suara out-of-sample
    const passAt = (a) => { const sl = ok.map((x) => ({ x, r: R[x.id].slice(0, a) })), rbs = rb.slice(0, a), k = Math.floor(a * 0.7), srB = srOf(rbs), srBo = srOf(rbs.slice(k));
      const srsA = sl.map((q) => srOf(q.r)), vA = srsA.length > 1 ? std(srsA) ** 2 : 0, star = Math.sqrt(Math.max(vA, 1 / a)) * E;
      return sl.filter((q, i) => { const pa = PA[q.x.id]; let tr = 0; for (let t = 1; t < a; t++) if (pa[t] > 0 && !(pa[t - 1] > 0)) tr++;
        const ds = dsr(q.r, star), cs = consistency(q.r, rbs, 5); q.d = ds; return ds >= 0.9 && cs.k >= Math.ceil(0.6 * cs.of) && srOf(q.r.slice(k)) > srBo && srsA[i] > srB && tr >= 5; }); };
    const passOOS = new Array(D.n).fill(null), s0p = Math.max(252, Math.floor(n * 0.4)); let nCk = 0, nCkPass = 0;
    for (let a = s0p; a < D.n; a += 63) { const L = passAt(Math.min(a, n)); nCk++; if (!L.length) continue; nCkPass++; let W = 0; L.forEach((q) => (W += Math.max(0.05, q.d - 0.5)));
      for (let t = a; t < Math.min(D.n, a + 63); t++) { let v = 0; for (const q of L) v += Math.max(0.05, q.d - 0.5) * Math.max(0, Math.min(1, PA[q.x.id][t])); passOOS[t] = v / W; } }
    votes.passOOS = passOOS; votes.oosFrom = D.d[s0p]; votes.ckPass = nCkPass; votes.ck = nCk;
    const wf = wr.length ? { s: perf(wr, wd, ppy, o.rf || 0), b: perf(wb, wd, ppy, o.rf || 0), picks, from: wd[0] } : null;
    if (wf) { wf.s.curve = undefined; wf.b.curve = undefined; }
    return { list: out, bh: { total: bh.bh.total, cagr: bh.bh.cagr, sharpe: bh.bh.sharpe, maxDD: bh.bh.maxDD, oosSharpe: bhOos }, luckSharpe: luck, yrsOos, splitDate: bh.splitDate,
      srStarAnn: srStar * Math.sqrt(ppy), nPass: passL.length, wf, votes };
  }

  // ---------- Noise band (Zarattini, Aziz & Barbon 2024) ----------
  // batas = max/min(open hari ini, tutup kemarin) × (1 ± rata-rata |tutup jam itu / open − 1| dalam 14 hari)
  function noiseBand(bars, o = {}) {
    const look = o.lookback ?? 14, every = Math.max(1, o.every ?? 1), cost = (o.costBps ?? 10) / 1e4, allowShort = !!o.short, useVwap = o.vwapStop !== false;
    const off = o.gmtoffset || 0, days = []; let cur = null;
    for (const b of bars) { const d = new Date((b[0] + off) * 1000).toISOString().slice(0, 10); if (!cur || cur.d !== d) { cur = { d, bars: [] }; days.push(cur); } cur.bars.push(b); }
    const moves = days.map((D) => D.bars.map((b) => Math.abs(b[4] / D.bars[0][1] - 1)));
    const dayRet = [], trades = [], lastDay = { up: [], lo: [], vwap: [], t: [] }; let eq = 1;
    for (let k = 1; k < days.length; k++) {
      const D = days[k], prevC = days[k - 1].bars[days[k - 1].bars.length - 1][4], open = D.bars[0][1], hist = moves.slice(Math.max(0, k - look), k);
      if (hist.length < Math.min(look, 5)) continue;
      let pos = 0, entryPx = 0, r = 1, pv = 0, vv = 0;
      for (let j = 0; j < D.bars.length; j++) {
        const b = D.bars[j], vals = hist.map((h) => h[Math.min(j, h.length - 1)]).filter((x) => x != null), sig = vals.length ? mean(vals) : 0;
        const up = Math.max(open, prevC) * (1 + sig), lo = Math.min(open, prevC) * (1 - sig);
        pv += ((b[2] + b[3] + b[4]) / 3) * (b[5] || 1); vv += b[5] || 1; const vwap = pv / vv;
        if (k === days.length - 1) { lastDay.up.push(up); lastDay.lo.push(lo); lastDay.vwap.push(vwap); lastDay.t.push(b[0]); }
        if (j > 0 && pos !== 0) r *= 1 + pos * (b[4] / D.bars[j - 1][4] - 1);
        const isLast = j === D.bars.length - 1, decide = (j + 1) % every === 0;
        if (isLast) { if (pos !== 0) { r *= 1 - cost; trades.push({ d: D.d, side: pos, in: entryPx, out: b[4], ret: pos * (b[4] / entryPx - 1) - 2 * cost, why: "tutup pasar" }); pos = 0; } break; }
        if (!decide) continue;
        if (pos === 1 && b[4] < (useVwap ? Math.max(up, vwap) : lo)) { r *= 1 - cost; trades.push({ d: D.d, side: 1, in: entryPx, out: b[4], ret: b[4] / entryPx - 1 - 2 * cost, why: "stop" }); pos = 0; }
        else if (pos === -1 && b[4] > (useVwap ? Math.min(lo, vwap) : up)) { r *= 1 - cost; trades.push({ d: D.d, side: -1, in: entryPx, out: b[4], ret: -(b[4] / entryPx - 1) - 2 * cost, why: "stop" }); pos = 0; }
        if (pos === 0) { if (b[4] > up) { pos = 1; entryPx = b[4]; r *= 1 - cost; } else if (allowShort && b[4] < lo) { pos = -1; entryPx = b[4]; r *= 1 - cost; } }
      }
      dayRet.push({ d: D.d, r: r - 1, bh: D.bars[D.bars.length - 1][4] / prevC - 1 }); eq *= r;
    }
    const rs = dayRet.map((x) => x.r), dd = dayRet.map((x) => x.d), ppy = o.ppy || 252;
    let beBps = NaN; if (!o._gross && trades.length) { const G = noiseBand(bars, { ...o, costBps: 0, _gross: true }); const gm = G.days.reduce((a, x) => a + x.r, 0); beBps = (gm / (2 * trades.length)) * 1e4; }
    const L = days[days.length - 1], lastBar = L.bars[L.bars.length - 1], n = lastDay.up.length;
    const now = n ? { up: lastDay.up[n - 1], lo: lastDay.lo[n - 1], vwap: lastDay.vwap[n - 1], px: lastBar[4], state: lastBar[4] > lastDay.up[n - 1] ? "di atas batas atas (momentum naik)" : lastBar[4] < lastDay.lo[n - 1] ? "di bawah batas bawah (momentum turun)" : "di dalam area noise (tidak ada sinyal)" } : null;
    return { days: dayRet, trades, all: perf(rs, dd, ppy), bh: perf(dayRet.map((x) => x.bh), dd, ppy), periods: periodReturns(rs, dd), lastDay, now, nDays: dayRet.length, beBps, lastT: lastBar[0],
      winRate: trades.length ? trades.filter((t) => t.ret > 0).length / trades.length : NaN, nTrades: trades.length, avgTrade: trades.length ? mean(trades.map((t) => t.ret)) : NaN };
  }

  // ---------- Isi candle: konsentrasi beli/jual per harga dari bar yang lebih kecil ----------
  function candleFootprint(bars, o = {}) {
    if (!bars.length) return null; let lo = Infinity, hi = -Infinity; for (const b of bars) { lo = Math.min(lo, b[3]); hi = Math.max(hi, b[2]); }
    let step = o.tick || (hi - lo) / 30 || 1; if (o.idx) { step = idxTick((lo + hi) / 2); lo = Math.floor(lo / step) * step; }
    const nb = Math.max(1, Math.min(120, Math.round((hi - lo) / step) + 1)); if (!o.idx) step = (hi - lo) / Math.max(1, nb - 1) || 1;
    const lv = Array.from({ length: nb }, (_, k) => ({ p: lo + k * step, buy: 0, sell: 0 }));
    let tb = 0, ts = 0, nReal = 0;
    for (const b of bars) { const v = b[5] || 0; if (!v) continue;
      // b[6] = volume beli agresif (taker buy) dari bursa bila tersedia (Binance) → data asli; selain itu perkiraan CLV + arah bar
      const real = b.length > 6 && b[6] != null && isFinite(b[6]); if (real) nReal++;
      const clv = b[2] > b[3] ? (b[4] - b[3]) / (b[2] - b[3]) : b[4] >= b[1] ? 1 : 0, dir = b[4] > b[1] ? 1 : b[4] < b[1] ? 0 : 0.5, fb = real ? Math.min(1, Math.max(0, b[6] / v)) : 0.5 * clv + 0.5 * dir;
      const a = Math.max(0, Math.round((b[3] - lo) / step)), z = Math.min(nb - 1, Math.round((b[2] - lo) / step)), w = v / (z - a + 1);
      for (let k = a; k <= z; k++) { lv[k].buy += w * fb; lv[k].sell += w * (1 - fb); } tb += v * fb; ts += v * (1 - fb); }
    const tot = lv.map((x) => x.buy + x.sell), all = tb + ts, pocI = tot.indexOf(Math.max(...tot));
    let a = pocI, b = pocI, acc = tot[pocI]; while (acc < 0.7 * all && (a > 0 || b < nb - 1)) { const L = a > 0 ? tot[a - 1] : -1, R = b < nb - 1 ? tot[b + 1] : -1; if (R >= L) { b++; acc += R; } else { a--; acc += L; } }
    const bI = lv.reduce((m, x, i) => (x.buy > lv[m].buy ? i : m), 0), sI = lv.reduce((m, x, i) => (x.sell > lv[m].sell ? i : m), 0);
    const imb = lv.filter((x) => x.buy + x.sell > 0.02 * all && (x.buy > 3 * x.sell || x.sell > 3 * x.buy)).map((x) => ({ p: x.p, side: x.buy > x.sell ? "beli" : "jual", ratio: x.buy > x.sell ? x.buy / Math.max(x.sell, 1e-9) : x.sell / Math.max(x.buy, 1e-9) }));
    const vwap = bars.reduce((s, x) => s + ((x[2] + x[3] + x[4]) / 3) * (x[5] || 0), 0) / (all || 1);
    const pAbove = lv.filter((x) => x.p > lv[pocI].p).reduce((s, x) => s + x.buy + x.sell, 0) / (all || 1);
    return { levels: lv.reverse(), step, lo, hi, buy: tb, sell: ts, total: all, buyPct: all ? tb / all : NaN, delta: tb - ts, poc: lv[nb - 1 - pocI].p, vaLo: lo + a * step, vaHi: lo + b * step,
      topBuy: lo + bI * step, topSell: lo + sI * step, imbalances: imb, vwap, nBars: bars.length, open: bars[0][1], close: bars[bars.length - 1][4], pAbovePoc: pAbove, realShare: nReal / bars.length };
  }

  // =====================================================================
  // MACHINE LEARNING sendiri: regresi logistik (L2) + gradient boosting (pohon dangkal)
  // dilatih walk-forward (tanpa melihat masa depan), dikalibrasi (Platt), diuji AUC/Brier.
  // Target: apakah return H hari ke depan > biaya pulang-pergi.
  // =====================================================================
  const ML_FEATS = ["Return 1 hari", "Return 5 hari", "Return 20 hari", "Return 60 hari", "Jarak ke MA20", "Jarak ke MA50", "Jarak ke MA200", "RSI 14", "Volatilitas 20 hari",
    "Rasio vol 20/60", "ATR / harga", "Volume vs rata-rata 20h", "Posisi di rentang 20h", "MACD hist / harga", "Jarak dari puncak 1 th", "%B Bollinger", "Suara 50 strategi",
    "Volume 5h vs 60h", "Tekanan beli-jual 5h (volume bertanda)", "Korelasi harga–volume 20h"];
  function mlFeatures(D, vote) {
    const c = D.c, n = D.n, lr = c.map((x, i) => (i ? Math.log(x / c[i - 1]) : 0));
    const m20 = T.sma(c, 20), m50 = T.sma(c, 50), m200 = T.sma(c, 200), rsi = T.rsi(c, 14), s20 = T.std(lr, 20), s60 = T.std(lr, 60), atr = T.atr(D.h, D.l, c, 14);
    const hh = T.hh(D.h, 20), ll = T.ll(D.l, 20), e12 = T.ema(c, 12), e26 = T.ema(c, 26), sd20 = T.std(c, 20), hi252 = T.hh(D.h, 252);
    const lv = D.v.map((v) => Math.log(1 + (v || 0))), lvm = T.sma(lv, 20), hasVol = D.v.some((v) => v > 0), lv5 = T.sma(lv, 5), lv60 = T.sma(lv, 60);
    const X = new Array(n).fill(null);
    for (let t = 210; t < n; t++) {
      const macd = e12[t] - e26[t]; let sig = 0, k = 0; for (let j = Math.max(26, t - 8); j <= t; j++) { if (e12[j] != null && e26[j] != null) { sig += e12[j] - e26[j]; k++; } } sig = k ? sig / k : 0;
      const row = [lr[t], Math.log(c[t] / c[t - 5]), Math.log(c[t] / c[t - 20]), Math.log(c[t] / c[t - 60]), c[t] / m20[t] - 1, c[t] / m50[t] - 1, c[t] / m200[t] - 1, (rsi[t] - 50) / 50,
        s20[t] * Math.sqrt(252), s60[t] > 0 ? s20[t] / s60[t] : 1, atr[t] / c[t], hasVol ? lv[t] - lvm[t] : 0, hh[t] > ll[t] ? (c[t] - ll[t]) / (hh[t] - ll[t]) : 0.5, (macd - sig) / c[t],
        c[t] / (hi252[t] || hh[t]) - 1, sd20[t] > 0 ? (c[t] - m20[t]) / (4 * sd20[t]) + 0.5 : 0.5, vote ? vote[t] : 0.5, 0, 0, 0];
      if (hasVol) { row[17] = lv5[t] - lv60[t]; let sv = 0, va = 0; for (let j = t - 4; j <= t; j++) { sv += Math.sign(lr[j]) * (D.v[j] || 0); va += D.v[j] || 0; } row[18] = va > 0 ? sv / va : 0;
        let ma = 0, mb = 0; for (let j = t - 19; j <= t; j++) { ma += Math.abs(lr[j]); mb += lv[j]; } ma /= 20; mb /= 20; let sab = 0, saa = 0, sbb = 0;
        for (let j = t - 19; j <= t; j++) { const a = Math.abs(lr[j]) - ma, b = lv[j] - mb; sab += a * b; saa += a * a; sbb += b * b; } row[19] = saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : 0; }
      if (row.every((x) => isFinite(x))) X[t] = row; }
    return X;
  }
  const sigm = (z) => 1 / (1 + Math.exp(-Math.max(-35, Math.min(35, z))));
  function solveLin(A, b) { const n = b.length, M = A.map((r, i) => [...r, b[i]]);
    for (let i = 0; i < n; i++) { let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r; [M[i], M[p]] = [M[p], M[i]]; const d = M[i][i] || 1e-12;
      for (let r = 0; r < n; r++) if (r !== i) { const f = M[r][i] / d; if (f) for (let k = i; k <= n; k++) M[r][k] -= f * M[i][k]; } }
    return M.map((r, i) => r[n] / (r[i] || 1e-12)); }
  function fitLogit(X, y, lam = 1) { // Newton–Raphson (IRLS) dengan penalti L2 (intersep tidak dipenalti)
    const n = X.length, d = X[0].length + 1; let w = new Array(d).fill(0);
    for (let it = 0; it < 25; it++) { const g = new Array(d).fill(0), H = Array.from({ length: d }, () => new Array(d).fill(0));
      for (let i = 0; i < n; i++) { const xi = [1, ...X[i]]; let z = 0; for (let j = 0; j < d; j++) z += w[j] * xi[j]; const p = sigm(z), r = y[i] - p, s = Math.max(1e-6, p * (1 - p));
        for (let j = 0; j < d; j++) { g[j] += r * xi[j]; const sj = s * xi[j]; for (let k = j; k < d; k++) H[j][k] += sj * xi[k]; } }
      for (let j = 0; j < d; j++) { for (let k = 0; k < j; k++) H[j][k] = H[k][j]; if (j) { g[j] -= lam * w[j]; H[j][j] += lam; } }
      const step = solveLin(H, g); let mx = 0; w = w.map((v, j) => { mx = Math.max(mx, Math.abs(step[j])); return v + step[j]; }); if (mx < 1e-7) break; }
    return w; }
  const predLogit = (w, x) => { let z = w[0]; for (let j = 0; j < x.length; j++) z += w[j + 1] * x[j]; return sigm(z); };
  function fitGBM(X, y, o = {}) { // gradient boosting: pohon kedalaman 2, fitur di-bin per kuantil
    const n = X.length, d = X[0].length, M = o.trees ?? 60, lr = o.lr ?? 0.1, lam = o.lam ?? 1, NB = 16, rng = makeRng(o.seed || 3);
    const thr = []; const B = Array.from({ length: d }, () => new Uint8Array(n));
    for (let j = 0; j < d; j++) { const s = X.map((r) => r[j]).sort((a, b) => a - b), q = []; for (let k = 1; k < NB; k++) q.push(s[Math.floor((k * n) / NB)]); const u = [...new Set(q)]; thr.push(u);
      for (let i = 0; i < n; i++) { let b = 0; while (b < u.length && X[i][j] > u[b]) b++; B[j][i] = b; } }
    const reg = !!o.reg, ybar = reg ? mean(y) : Math.min(0.99, Math.max(0.01, mean(y))), f0 = reg ? ybar : Math.log(ybar / (1 - ybar)), F = new Float64Array(n).fill(f0), trees = [], imp = new Array(d).fill(0);
    const best = (idx, g, h) => { let G = 0, Hh = 0; for (const i of idx) { G += g[i]; Hh += h[i]; } const base = (G * G) / (Hh + lam); let bst = null;
      for (let j = 0; j < d; j++) { const nb = thr[j].length + 1, gb = new Float64Array(nb), hb = new Float64Array(nb); for (const i of idx) { gb[B[j][i]] += g[i]; hb[B[j][i]] += h[i]; }
        let gl = 0, hl = 0; for (let b = 0; b < nb - 1; b++) { gl += gb[b]; hl += hb[b]; const gr = G - gl, hr = Hh - hl; if (hl < 2 || hr < 2) continue;
          const gain = (gl * gl) / (hl + lam) + (gr * gr) / (hr + lam) - base; if (!bst || gain > bst.gain) bst = { j, b, gain }; } }
      return { bst, G, H: Hh }; };
    for (let m = 0; m < M; m++) { const g = new Float64Array(n), h = new Float64Array(n), idx = [];
      for (let i = 0; i < n; i++) { if (reg) { g[i] = y[i] - F[i]; h[i] = 1; } else { const p = sigm(F[i]); g[i] = y[i] - p; h[i] = Math.max(1e-6, p * (1 - p)); } if (rng.u() < 0.8) idx.push(i); }
      const r = best(idx, g, h); if (!r.bst || r.bst.gain <= 0) break; imp[r.bst.j] += r.bst.gain;
      const L = idx.filter((i) => B[r.bst.j][i] <= r.bst.b), R = idx.filter((i) => B[r.bst.j][i] > r.bst.b), node = { j: r.bst.j, t: thr[r.bst.j][r.bst.b], kids: [] };
      for (const part of [L, R]) { const s = best(part, g, h); if (s.bst && s.bst.gain > 0) { imp[s.bst.j] += s.bst.gain; const t2 = thr[s.bst.j][s.bst.b]; let gl = 0, hl = 0, gr = 0, hr = 0;
          for (const i of part) { if (X[i][s.bst.j] <= t2) { gl += g[i]; hl += h[i]; } else { gr += g[i]; hr += h[i]; } } node.kids.push({ j: s.bst.j, t: t2, vl: (lr * gl) / (hl + lam), vr: (lr * gr) / (hr + lam) }); }
        else node.kids.push({ leaf: (lr * s.G) / (s.H + lam) }); }
      trees.push(node); for (let i = 0; i < n; i++) F[i] += treeOut(node, X[i]); }
    return { f0, trees, imp };
  }
  const predGBMraw = (mdl, x) => { let z = mdl.f0; for (const t of mdl.trees) z += treeOut(t, x); return z; };
  function fitRidge(Z, y, lam = 5) { const d = Z[0].length + 1, A = Array.from({ length: d }, () => new Array(d).fill(0)), b = new Array(d).fill(0);
    for (let i = 0; i < Z.length; i++) { const x = [1, ...Z[i]]; for (let j = 0; j < d; j++) { b[j] += x[j] * y[i]; for (let k = j; k < d; k++) A[j][k] += x[j] * x[k]; } }
    for (let j = 0; j < d; j++) { for (let k = 0; k < j; k++) A[j][k] = A[k][j]; if (j) A[j][j] += lam; } return solveLin(A, b); }
  const predRidge = (w, z) => { let v = w[0]; for (let j = 0; j < z.length; j++) v += w[j + 1] * z[j]; return v; };
  function treeOut(node, x) { const k = node.kids[x[node.j] <= node.t ? 0 : 1]; return k.leaf != null ? k.leaf : x[k.j] <= k.t ? k.vl : k.vr; }
  const predGBM = (mdl, x) => { let z = mdl.f0; for (const t of mdl.trees) z += treeOut(t, x); return sigm(z); };
  function aucOf(p, y) { const idx = p.map((v, i) => i).sort((a, b) => p[a] - p[b]); let r = 0, n1 = 0, k = 0;
    while (k < idx.length) { let e = k; while (e + 1 < idx.length && p[idx[e + 1]] === p[idx[k]]) e++; const avg = (k + e) / 2 + 1; for (let q = k; q <= e; q++) if (y[idx[q]]) { r += avg; n1++; } k = e + 1; }
    const n0 = y.length - n1; return n1 && n0 ? (r - (n1 * (n1 + 1)) / 2) / (n1 * n0) : NaN; }
  function fitPlatt(p, y) { const X = p.map((v) => [Math.log(Math.max(1e-6, v) / Math.max(1e-6, 1 - v))]); return fitLogit(X, y, 0.01); }
  const applyPlatt = (w, p) => predLogit(w, [Math.log(Math.max(1e-6, p) / Math.max(1e-6, 1 - p))]);
  function mlModel(D, o = {}) {
    const H = o.horizon || 10, cost = ((o.costBps ?? 20) * 2) / 1e4, n = D.n, X = mlFeatures(D, o.vote), c = D.c;
    const y = new Array(n).fill(null), yr = new Array(n).fill(null); for (let t = 0; t < n - H; t++) { y[t] = c[t + H] / c[t] - 1 > cost ? 1 : 0; yr[t] = Math.log(c[t + H] / c[t]); }
    const sig = (t) => Math.max(1e-4, X[t][8] * Math.sqrt(H / 252)); // volatilitas 20h (fitur ke-9) diskalakan ke horizon
    const lab = []; for (let t = 0; t < n; t++) if (X[t] && y[t] != null) lab.push(t);
    if (lab.length < 300) throw new Error("Data terlalu pendek untuk machine learning (butuh ±2 tahun lebih).");
    const fitBoth = (tr) => { const Xt = tr.map((t) => X[t]), yt = tr.map((t) => y[t]), d = Xt[0].length, mu = new Array(d).fill(0), sd = new Array(d).fill(0);
      for (const r of Xt) r.forEach((v, j) => (mu[j] += v / Xt.length)); for (const r of Xt) r.forEach((v, j) => (sd[j] += (v - mu[j]) ** 2 / Xt.length)); for (let j = 0; j < d; j++) sd[j] = Math.sqrt(sd[j]) || 1;
      const Z = Xt.map((r) => r.map((v, j) => (v - mu[j]) / sd[j])), ys = tr.map((t) => yr[t] / sig(t)); // regresi pada return yang dinormalkan volatilitas
      return { mu, sd, w: fitLogit(Z, yt, o.lam ?? 2), g: fitGBM(Xt, yt, { trees: o.trees ?? 60, seed: tr.length }), rw: fitRidge(Z, ys, 20), rg: fitGBM(Xt, ys, { reg: true, trees: 50, lr: 0.05, lam: 5, seed: tr.length + 1 }) }; };
    const predBoth = (M, x) => { const z = x.map((v, j) => (v - M.mu[j]) / M.sd[j]), a = predLogit(M.w, z), b = predGBM(M.g, x); return { a, b, p: 0.5 * a + 0.5 * b, f: 0.5 * predRidge(M.rw, z) + 0.5 * predGBMraw(M.rg, x) }; };
    // walk-forward: latih pada data s/d (a − H) — jarak H mencegah label tumpang tindih bocor — lalu prediksi 63 hari berikutnya
    const first = lab[0], s0 = Math.max(first + 250, lab[Math.floor(lab.length * 0.4)]), oos = [], step = 63;
    for (let a = s0; a < n; a += step) { const tr = lab.filter((t) => t < a - H); if (tr.length < 200) continue; const M = predBoth.bind(null, fitBoth(tr));
      for (let t = a; t < Math.min(n, a + step); t++) if (X[t]) { const q = M(X[t]); oos.push({ t, p: q.p, a: q.a, b: q.b, y: y[t], f: q.f * sig(t), yr: yr[t], s: sig(t) }); } }
    const ev = oos.filter((r) => r.y != null), P = ev.map((r) => r.p), Y = ev.map((r) => r.y);
    const auc = aucOf(P, Y), aucA = aucOf(ev.map((r) => r.a), Y), aucB = aucOf(ev.map((r) => r.b), Y), base = mean(Y), brier = mean(ev.map((r) => (r.p - r.y) ** 2)), brierBase = base * (1 - base);
    const platt = fitPlatt(P, Y), cal = P.map((p) => applyPlatt(platt, p)), brierCal = mean(cal.map((p, i) => (p - Y[i]) ** 2));
    // signifikansi AUC (Hanley–McNeil) dengan jumlah sampel efektif ≈ n / H karena label tumpang tindih
    const n1 = Y.filter(Boolean).length / H, n0 = (Y.length - Y.filter(Boolean).length) / H, A = isFinite(auc) ? auc : 0.5, q1 = A / (2 - A), q2 = (2 * A * A) / (1 + A);
    const se = Math.sqrt(Math.max(1e-9, (A * (1 - A) + (n1 - 1) * (q1 - A * A) + (n0 - 1) * (q2 - A * A)) / Math.max(1, n1 * n0))), aucP = 1 - ncdf((A - 0.5) / se);
    // kalibrasi: 5 kelompok berdasarkan peluang terkalibrasi
    const ord = cal.map((p, i) => i).sort((a, b) => cal[a] - cal[b]), calib = [];
    for (let k = 0; k < 5; k++) { const part = ord.slice(Math.floor((k * ord.length) / 5), Math.floor(((k + 1) * ord.length) / 5)); if (!part.length) continue;
      calib.push({ pred: mean(part.map((i) => cal[i])), act: mean(part.map((i) => Y[i])), n: part.length }); }
    // strategi ML out-of-sample: pegang besok bila peluang > 50%
    const rs = [], rb = [], dts = []; let prev = 0, cst = (o.costBps ?? 20) / 1e4;
    for (const r of oos) { if (r.t >= n - 1) continue; const pos = r.p > 0.5 ? 1 : 0, ret = c[r.t + 1] / c[r.t] - 1; rs.push(pos * ret - cst * Math.abs(pos - prev)); rb.push(ret); dts.push(D.d[r.t + 1]); prev = pos; }
    const bt = rs.length > 20 ? { s: perf(rs, dts, o.ppy || 252), b: perf(rb, dts, o.ppy || 252), from: dts[0] } : null; if (bt) { bt.s.curveDates = dts; }
    // model akhir: semua data berlabel → peluang untuk hari terakhir
    const MF = fitBoth(lab), xNow = X[n - 1]; const now = xNow ? predBoth(MF, xNow) : null;
    const gi = MF.g.imp, gs = gi.reduce((a, b) => a + b, 0) || 1, ls = MF.w.slice(1).map(Math.abs), lsum = ls.reduce((a, b) => a + b, 0) || 1;
    const imp = ML_FEATS.map((name, j) => ({ name, v: 0.5 * gi[j] / gs + 0.5 * ls[j] / lsum, dir: Math.sign(MF.w[j + 1]) })).sort((a, b) => b.v - a.v);
    const pCal = now ? applyPlatt(platt, now.p) : NaN, bss = 1 - brierCal / brierBase;
    // ---- prediksi harga: titik tengah + rentang conformal (dikalibrasi dari kesalahan out-of-sample) ----
    const er = oos.filter((r) => r.yr != null), half = Math.floor(er.length / 2), sc = (r) => Math.abs(r.yr - r.f) / r.s, qOf = (arr, q) => { const s2 = arr.slice().sort((a, b) => a - b); return s2[Math.min(s2.length - 1, Math.ceil(q * (s2.length + 1)) - 1)]; };
    const LV = [0.5, 0.8, 0.9], qA = LV.map((q) => qOf(er.slice(0, half).map(sc), q)), cover = LV.map((q, i) => mean(er.slice(half).map((r) => (sc(r) <= qA[i] ? 1 : 0))));
    const qAll = LV.map((q) => qOf(er.map(sc), q)), sse = er.reduce((a, r) => a + (r.yr - r.f) ** 2, 0), sse0 = er.reduce((a, r) => a + r.yr ** 2, 0);
    const dirHit = mean(er.filter((r) => Math.abs(r.f) > 1e-9).map((r) => (Math.sign(r.f) === Math.sign(r.yr) ? 1 : 0))), sNow = xNow ? Math.max(1e-4, xNow[8] * Math.sqrt(H / 252)) : NaN, fNow = now ? now.f * sNow : NaN;
    const fc = now ? { ret: fNow, px: c[n - 1] * Math.exp(fNow), bands: LV.map((q, i) => ({ q, lo: c[n - 1] * Math.exp(fNow - qAll[i] * sNow), hi: c[n - 1] * Math.exp(fNow + qAll[i] * sNow), cover: cover[i] })),
      r2: 1 - sse / sse0, dirHit, nEval: er.length - half, sdNow: sNow, lastPx: c[n - 1] } : null;
    return { H, cost, p: pCal, pRaw: now ? now.p : NaN, pLog: now ? now.a : NaN, pGb: now ? now.b : NaN, auc, aucLog: aucA, aucGb: aucB, aucP, base, brier: brierCal, bss, acc: mean(cal.map((p, i) => ((p > 0.5 ? 1 : 0) === Y[i] ? 1 : 0))),
      nOos: ev.length, nEff: Math.round(ev.length / H), from: D.d[ev.length ? ev[0].t : n - 1], calib, imp, bt, valid: auc >= 0.53 && aucP < 0.05 && bss > 0, nTrain: lab.length,
      oosP: oos.map((r) => ({ t: r.t, p: applyPlatt(platt, r.p) })), fc, featNames: ML_FEATS, feats: xNow ? ML_FEATS.map((k, j) => ({ name: k, v: xNow[j] })) : [] };
  }

  // ---------- Rencana aksi: beli / jual / tahan, harga, waktu ----------
  // hari libur bursa (BEI: kalender resmi 2026–2027 termasuk cuti bersama; AS: NYSE)
  const HOL = {
    IDX: new Set(["2026-01-01", "2026-01-16", "2026-02-16", "2026-02-17", "2026-03-18", "2026-03-19", "2026-03-20", "2026-03-23", "2026-03-24", "2026-04-03", "2026-05-01", "2026-05-14", "2026-05-15", "2026-05-27", "2026-05-28",
      "2026-06-01", "2026-06-16", "2026-08-17", "2026-08-25", "2026-12-24", "2026-12-25", "2026-12-31", "2027-01-01", "2027-01-05", "2027-02-05", "2027-03-08", "2027-03-09", "2027-03-10", "2027-03-11", "2027-03-12", "2027-03-15",
      "2027-03-25", "2027-03-26", "2027-05-06", "2027-05-17", "2027-05-18", "2027-05-19", "2027-05-20", "2027-06-01", "2027-08-17", "2027-12-24", "2027-12-31"]),
    US: new Set(["2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
      "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31", "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24"]) };
  const HOL_UNTIL = "2027-12-31";
  function isHoliday(dateStr, mkt) { return !!(mkt && HOL[mkt] && HOL[mkt].has(dateStr)); }
  function addBiz(dateStr, k, crypto, mkt) { const d = new Date(dateStr + "T00:00:00Z"); let left = k;
    while (left > 0) { d.setUTCDate(d.getUTCDate() + 1); const w = d.getUTCDay(), ds = d.toISOString().slice(0, 10); if (crypto || (w !== 0 && w !== 6 && !isHoliday(ds, mkt))) left--; } return d.toISOString().slice(0, 10); }
  /* D: OHLCV mentah {d,o,h,l,c,v,n}. o: { isIdx, crypto, strats: daftar hasil runAllStrategies, score: skor teknikal (−5..5), capital, riskPct, unit, start (tanggal mulai berlaku), seed } */
  function actionPlan(D, o = {}) {
    const n = D.n, c = D.c, px = c[n - 1], isIdx = !!o.isIdx, rt = (v, dir) => roundTick(v, isIdx, dir);
    const atr = T.atr(D.h, D.l, c, 14)[n - 1], ma20 = T.sma(c, 20)[n - 1], ma50 = T.sma(c, 50)[n - 1];
    const sl = (a, k) => a.slice(Math.max(0, n - k)), hi20 = Math.max(...sl(D.h, 20)), lo20 = Math.min(...sl(D.l, 20)), lo10 = Math.min(...sl(D.l, 10)), hi52 = Math.max(...sl(D.h, 252));
    const S = (o.strats || []).filter((x) => !x.error), robust = S.filter((x) => x.pass);
    const voteOf = (L, wf) => { let w = 0, v = 0; for (const x of L) { const ww = wf(x); w += ww; v += ww * Math.max(0, Math.min(1, x.pos)); } return w > 0 ? v / w : NaN; };
    const vAll = voteOf(S, () => 1), score = o.score ?? 0;
    // keputusan memakai strategi yang lolos uji pada data SEBELUM titik evaluasi terakhir (out-of-sample) — sama persis dengan cara akurasinya diuji
    const VO = o.votes && o.votes.passOOS, vRob = VO && VO[n - 1] != null ? VO[n - 1] : NaN, useRob = isFinite(vRob);
    let action, basis, conf;
    if (useRob) { action = vRob >= 0.5 ? "BELI" : vRob < 0.25 ? "JUAL" : "TAHAN"; conf = Math.abs(vRob - 0.5) >= 0.3 ? "sedang" : "rendah–sedang";
      basis = `strategi yang lolos uji keandalan (dipilih ulang tiap 63 hari dari data sebelumnya saja); ${Math.round(vRob * 100)}% bobotnya sedang di posisi beli`; }
    else { const v = isFinite(vAll) ? vAll : 0.5; action = v >= 0.55 ? "BELI" : v <= 0.4 ? "JUAL" : "TAHAN"; conf = "rendah";
      basis = `tidak ada strategi yang lolos uji keandalan untuk aset ini — dipakai suara ${S.length} strategi (${isFinite(vAll) ? Math.round(vAll * 100) : "–"}% sedang beli; BELI bila ≥ 55%, JUAL bila ≤ 40%)`; }
    const hd = robust.map((x) => x.avgDays).filter((x) => isFinite(x)).sort((a, b) => a - b);
    const H = Math.round(Math.max(5, Math.min(40, hd.length ? hd[hd.length >> 1] : 20)));
    // level harga
    const sup = [ma20, lo10, ma50].filter((x) => isFinite(x) && x < px && x > px - 1.5 * atr);
    const entry = rt(sup.length ? Math.max(Math.max(...sup), px - 1 * atr) : px - 0.3 * atr, -1);
    const stop = rt(Math.max(entry - 3 * atr, Math.min(entry - 2 * atr, lo10 - 0.25 * atr)), -1), R = entry - stop;
    const t1 = rt(entry + 1.5 * R, 1), t2 = rt(entry + 3 * R, 1), chase = rt(px + 1 * atr, 1);
    const trail = rt(Math.max(px - 2.5 * atr, Math.min(lo20, px - 1 * atr)), -1);
    const trigUp = rt(Math.max(hi20, isFinite(ma50) ? ma50 : hi20), 1), pull = isFinite(ma20) && ma20 < px ? rt(ma20, -1) : null;
    // peluang: bootstrap blok dari return harian historis, mulai di harga masuk, aturan keluar berdasar harga tutup
    const lr = []; for (let i = Math.max(1, n - 756); i < n; i++) lr.push(Math.log(c[i] / c[i - 1]));
    // aturan: jual ½ di T1 lalu stop naik ke harga masuk; sisa di T2, atau keluar bila tutup ≤ stop, atau saat batas waktu H
    const rng = makeRng(o.seed || 7), NS = 3000, B = 5, out = { t1: 0, t2: 0, stop: 0, time: 0, rSum: 0, dT1: [], rs: [], dur: 0 }, fee = (o.costBps ?? 20) / 1e4 * 2 * entry / (R || 1);
    if (lr.length > 60 && R > 0) for (let s = 0; s < NS; s++) { let x = Math.log(entry), t = 0, done = false, hitT1 = false, rr = 0;
      while (t < H && !done) { const st = rng.int(lr.length - B); for (let b = 0; b < B && t < H; b++, t++) { x += lr[st + b]; const p = Math.exp(x);
        if (!hitT1 && p <= stop) { out.stop++; rr = (p - entry) / R; done = true; t++; break; }
        if (hitT1 && p <= entry) { rr = 0.5 * 1.5; done = true; t++; break; }
        if (!hitT1 && p >= t1) { hitT1 = true; out.t1++; out.dT1.push(t + 1); }
        if (p >= t2) { out.t2++; done = true; rr = 0.5 * 1.5 + 0.5 * 3; t++; break; } } }
      if (!done) { const p = Math.exp(x); if (hitT1) rr = 0.5 * 1.5 + 0.5 * Math.max(0, (p - entry) / R); else { out.time++; rr = (p - entry) / R; } }
      rr -= fee; out.rSum += rr; out.rs.push(rr); out.dur += Math.min(t, H); }
    const pr = lr.length > 60 && R > 0 ? { t1: out.t1 / NS, t2: out.t2 / NS, stop: out.stop / NS, time: out.time / NS, expR: out.rSum / NS, medT1: out.dT1.length ? out.dT1.sort((a, b) => a - b)[out.dT1.length >> 1] : null,
      win: out.rs.filter((x) => x > 0).length / NS, avgDur: out.dur / NS, rDist: out.rs.filter((_, i) => i % 5 === 0) } : null;
    const voteAction = action;
    if (action === "BELI" && pr && pr.expR <= 0) { action = "TAHAN"; basis += `; sinyal BELI diturunkan jadi TAHAN karena ekspektasi rencana harga ini ${pr.expR.toFixed(2)} R (≤ 0) setelah biaya`; }
    // akurasi historis: seberapa sering keputusan yang sama (dari suara strategi) benar dalam H hari ke depan
    let acc = null, setupsPerYear = NaN; const V = useRob ? VO : o.votes && o.votes.all;
    const cls = useRob ? (v) => (v == null ? null : v >= 0.5 ? "BELI" : v < 0.25 ? "JUAL" : "TAHAN") : (v) => (v == null ? null : v >= 0.55 ? "BELI" : v <= 0.4 ? "JUAL" : "TAHAN");
    if (V && V.length === n) { // berapa kali setup BELI baru muncul per tahun (untuk simulasi target uang)
      let ent = 0, days = 0; for (let t = Math.max(1, n - 756); t < n; t++) { if (V[t] == null) continue; days++; if (cls(V[t]) === "BELI" && cls(V[t - 1]) !== "BELI") ent++; }
      setupsPerYear = days > 120 ? (ent / days) * (o.crypto ? 365 : 252) : NaN; }
    if (V && V.length === n) {
      const sdH = Math.sqrt(H) * std(lr), ok = (f) => (voteAction === "BELI" ? f > (o.costBps ?? 20) * 2e-4 : voteAction === "JUAL" ? f < 0 : f > -sdH);
      let k = 0, m = 0, kb = 0, mb = 0; for (let t = 210; t < n - H; t++) { const f = c[t + H] / c[t] - 1; mb++; if (ok(f)) kb++; if (cls(V[t]) === voteAction) { m++; if (ok(f)) k++; } }
      acc = m >= 10 ? { p: k / m, n: m, nInd: Math.max(1, Math.round(m / H)), base: mb ? kb / mb : NaN, voteAction, rule: voteAction === "BELI" ? `sinyal BELI → harga ${H} hari kemudian lebih tinggi (setelah biaya)` : voteAction === "JUAL" ? `harga ${H} hari kemudian lebih rendah` : `harga ${H} hari kemudian tidak turun lebih dari 1 simpangan baku`, inSample: false, src: useRob ? "lolos-OOS" : "semua" } : { p: NaN, n: m }; }
    // machine learning (bila lolos uji out-of-sample) ikut memutuskan: veto BELI bila peluangnya rendah
    const ml = o.ml && isFinite(o.ml.p) ? o.ml : null;
    if (ml && ml.valid && action === "BELI" && ml.p < 0.45) { action = "TAHAN"; basis += `; diturunkan jadi TAHAN karena model ML (teruji, AUC ${ml.auc.toFixed(2)}) hanya memberi peluang ${(ml.p * 100).toFixed(0)}% naik`; }
    if (ml && ml.valid && action === "TAHAN" && voteAction !== "JUAL" && ml.p >= 0.62 && !(pr && pr.expR <= 0)) { action = "BELI"; basis += `; dinaikkan jadi BELI karena model ML (teruji, AUC ${ml.auc.toFixed(2)}) memberi peluang ${(ml.p * 100).toFixed(0)}% naik`; }
    // keyakinan % untuk keputusan akhir: peluang ML terkalibrasi (bila teruji), selain itu akurasi historis
    let confPct = NaN, confSrc = "";
    if (ml && ml.valid) { confPct = action === "JUAL" ? 1 - ml.p : action === "BELI" ? ml.p : Math.max(ml.p, 1 - ml.p) * 0 + (acc && isFinite(acc.p) ? acc.p : NaN); confSrc = action === "TAHAN" ? "akurasi historis" : "model ML terkalibrasi"; }
    if (!isFinite(confPct) && acc && isFinite(acc.p) && acc.voteAction === action) { confPct = acc.p; confSrc = "akurasi historis"; }
    // ukuran posisi: risiko maks riskPct dari modal bila stop kena
    const unit = o.unit || 1, cap = o.capital || 0, risk = cap * (o.riskPct ?? 0.01);
    let qty = R > 0 ? risk / R / unit : 0; qty = Math.min(qty, cap / (entry * unit)); qty = isIdx ? Math.floor(qty) : +qty.toFixed(6);
    const start = o.start || addBiz(D.d[n - 1], 1, o.crypto, o.market);
    return { action, conf, basis, acc, ml, confPct, confSrc, setupsPerYear, voteAction, rr1: (t1 - entry) / (R || 1), rr2: (t2 - entry) / (R || 1), riskPctPx: R / entry, rewPct1: t1 / entry - 1, rewPct2: t2 / entry - 1, px, atr, ma20, ma50, hi20, lo20, hi52, entry, entryHi: rt(px, 1), stop, t1, t2, chase, trail, trigUp, pull, R, H, pr, qty, riskAmt: qty * unit * R,
      cost: qty * unit * entry, start, expire: addBiz(start, 2, o.crypto, o.market), review: addBiz(start, H, o.crypto, o.market), holUntil: HOL_UNTIL, nRobust: robust.length, robust: robust.map((x) => ({ name: x.name, pos: x.pos, posPrev: x.posPrev, dsr: x.dsr })),
      vRob, vAll, nAll: S.length };
  }

  // ---------- target uang: berapa transaksi/waktu untuk mencapai target dengan rencana ini ----------
  function goalSim(o) {
    const rd = o.rDist || [], cap = o.capital, tgt = o.target, rp = o.riskPct ?? 0.01, tpy = Math.max(1, o.tradesPerYear || 12), yrs = o.years || 5, dep = Math.max(0, o.monthly || 0) * 12 / tpy;
    if (!rd.length || !(cap >= 0) || !(tgt > cap)) return null;
    const rng = makeRng(11), NP = o.paths || 2000, maxT = Math.round(tpy * yrs), hitAt = [], ends = []; let ruin = 0;
    for (let p = 0; p < NP; p++) { let eq = cap, pk = cap, hit = -1, dd = false;
      for (let k = 1; k <= maxT; k++) { eq = eq * Math.max(0, 1 + rp * rd[rng.int(rd.length)]) + dep; pk = Math.max(pk, eq); if (!dd && eq <= 0.5 * pk) dd = true; if (eq >= tgt) { hit = k; break; } if (eq <= 0 && dep <= 0) break; }
      if (dd) ruin++; hitAt.push(hit); if (hit < 0) ends.push(eq); }
    const P = (yr) => hitAt.filter((h) => h > 0 && h <= tpy * yr).length / NP, hs = hitAt.filter((h) => h > 0).sort((a, b) => a - b);
    const g = mean(rd.map((r) => Math.log(Math.max(1e-9, 1 + rp * r))));
    return { p1: P(1), p3: P(3), p5: P(yrs), medTrades: hs.length >= NP / 2 ? hs[NP >> 1] ?? hs[hs.length - 1] : null, pRuin: ruin / NP, growthPerTrade: Math.exp(g) - 1,
      tradesNeeded: g > 0 && cap > 0 ? Math.ceil(Math.log(tgt / cap) / g) : Infinity, capFor1y: g > 0 ? tgt / Math.exp(g * tpy) : Infinity, tpy };
  }
  // setoran bulanan minimum agar target tercapai dengan peluang ≥ conf dalam N tahun (bisection)
  function goalMonthly(o, years, conf = 0.5) { let lo = 0, hi = Math.max(o.target / (12 * years), 1);
    const P = (m) => { const G = goalSim({ ...o, monthly: m, years, paths: 600 }); return G ? (years <= 1 ? G.p1 : years <= 3 ? G.p3 : G.p5) : 0; };
    if (P(0) >= conf) return 0; let k = 0; while (P(hi) < conf && k++ < 20) hi *= 2;
    for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; if (P(m) >= conf) hi = m; else lo = m; } return hi; }

  const STRAT_LIST = STRATS.map(([id, cat, name, desc]) => ({ id, cat, name, desc }));
  const api = { STRAT_LIST, actionPlan, goalSim, goalMonthly, mlModel, ML_FEATS, isHoliday, addBiz, dsr, runStrategy, runAllStrategies, noiseBand, candleFootprint, mathLab, qnorm, gammaP, signalBacktest, quantPortfolio, backtest, alignSeries, screenAsset, dcfFCFF, excessReturn, solveImplied, valuationMC, costOfCapital, blackScholes, binomialCRR, probEnd, riskMetrics, ardl, ols, ncdf, evalPlan, compareStats, idxTick, roundTick, makeRng, garchFit, garchNextVar, fitRate, simRate, bondPrice, runPrice, runBond, kupiec, quantiles, logReturns, detectPpy, PRICE_MODELS, PCTS, mean, std };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.MCEngine = api;
})(typeof self !== "undefined" ? self : this);
