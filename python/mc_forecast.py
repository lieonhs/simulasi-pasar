"""
mc_forecast.py — Simulasi & forecast distribusi harga aset pasar modal
=====================================================================
Model:
  Aset harga (Bitcoin, saham, indeks, emas, FX):
    gbm        Geometric Brownian Motion (vol konstan)
    garch      GJR-GARCH(1,1) Student-t  -> vol berubah & fat tail
    jump       Merton Jump-Diffusion     -> lompatan/crash mendadak
    bootstrap  Block bootstrap return historis (tanpa asumsi distribusi)
  Fixed income (obligasi):
    vasicek    Yield mean-reverting (bisa negatif)
    cir        Yield mean-reverting, tidak bisa negatif
    -> yield disimulasikan, lalu dikonversi ke harga obligasi (coupon bond)

Validasi: backtest VaR 95% out-of-sample + uji Kupiec, supaya kamu tahu
model mana yang benar-benar cocok dengan data, bukan sekadar terlihat bagus.

PENTING: Output adalah DISTRIBUSI kemungkinan, bukan prediksi harga.
GARCH memprediksi volatilitas, bukan arah harga.

Contoh:
  python mc_forecast.py --ticker BTC-USD --days 30
  python mc_forecast.py --ticker BBCA.JK --days 60 --models garch,bootstrap
  python mc_forecast.py --csv harga.csv --days 30          (kolom: Date, Close)
  python mc_forecast.py --bond --yield-csv sbn10y.csv --coupon 0.065 --maturity 10 --days 90
  python mc_forecast.py --demo                              (data sintetis, tanpa internet)

Install: pip install numpy pandas scipy matplotlib arch yfinance
"""
import argparse
import sys
import warnings

import numpy as np
import pandas as pd
from scipy import stats

warnings.filterwarnings("ignore")

CRYPTO_HINTS = ("-USD", "BTC", "ETH", "SOL")


# ----------------------------------------------------------------------------
# DATA
# ----------------------------------------------------------------------------
def load_prices(ticker=None, csv=None, years=5, demo=False):
    if demo:
        return _demo_prices()
    if csv:
        df = pd.read_csv(csv)
        date_col = next(c for c in df.columns if c.lower() in ("date", "tanggal"))
        px_col = next(c for c in df.columns if c.lower() in ("adj close", "close", "price", "harga", "yield"))
        s = pd.Series(df[px_col].astype(float).values, index=pd.to_datetime(df[date_col]))
        return s.sort_index().dropna()
    import yfinance as yf
    d = yf.download(ticker, period=f"{years}y", auto_adjust=True, progress=False)
    if d.empty:
        sys.exit(f"Gagal download {ticker}. Cek koneksi/ticker, atau pakai --csv.")
    s = d["Close"]
    if isinstance(s, pd.DataFrame):
        s = s.iloc[:, 0]
    return s.dropna()


def _demo_prices(n=1500, seed=7):
    """Harga sintetis dengan volatility clustering + jump (mirip kripto)."""
    rng = np.random.default_rng(seed)
    omega, a, b = 2e-5, 0.10, 0.85
    var = omega / (1 - a - b)
    r = np.empty(n)
    for t in range(n):
        z = rng.standard_t(4) / np.sqrt(2)
        r[t] = 0.0008 + np.sqrt(var) * z
        if rng.random() < 0.01:
            r[t] += rng.normal(-0.05, 0.06)
        var = omega + a * r[t] ** 2 + b * var
    idx = pd.bdate_range("2021-01-01", periods=n)
    return pd.Series(30000 * np.exp(np.cumsum(r)), index=idx)


def periods_per_year(series, ticker):
    if ticker and any(h in ticker.upper() for h in CRYPTO_HINTS):
        return 365
    gaps = series.index.to_series().diff().dt.days.dropna()
    return 365 if (gaps == 1).mean() > 0.9 else 252


# ----------------------------------------------------------------------------
# MODEL HARGA
# ----------------------------------------------------------------------------
def _drift(r, mode, custom, ppy):
    """mode: zero (default, paling jujur), hist (rata-rata historis), custom (annual)."""
    if mode == "hist":
        return r.mean()
    if mode == "custom":
        return np.log(1 + custom) / ppy
    return 0.0


def sim_gbm(r, s0, days, n, mu, rng):
    sig = r.std(ddof=1)
    z = rng.standard_normal((n, days))
    lr = (mu - 0.5 * sig**2) + sig * z
    return s0 * np.exp(np.cumsum(lr, axis=1))


def sim_garch(r, s0, days, n, mu, rng):
    from arch import arch_model
    am = arch_model(r * 100, mean="Constant", vol="GARCH", p=1, o=1, q=1, dist="t")
    res = am.fit(disp="off")
    p = res.params
    omega, alpha, gamma, beta, nu = p["omega"], p["alpha[1]"], p["gamma[1]"], p["beta[1]"], p["nu"]
    eps_last = res.resid.iloc[-1]
    var = res.conditional_volatility.iloc[-1] ** 2
    var = omega + (alpha + gamma * (eps_last < 0)) * eps_last**2 + beta * var
    var = np.full(n, var)
    scale = np.sqrt((nu - 2) / nu)
    out = np.empty((n, days))
    for t in range(days):
        z = rng.standard_t(nu, n) * scale
        eps = np.sqrt(var) * z
        out[:, t] = mu + eps / 100
        var = omega + (alpha + gamma * (eps < 0)) * eps**2 + beta * var
    sim_garch.info = dict(alpha=alpha, gamma=gamma, beta=beta, nu=nu,
                          persistence=alpha + beta + gamma / 2)
    return s0 * np.exp(np.cumsum(out, axis=1))


def sim_jump(r, s0, days, n, mu, rng, k=3.0):
    """Merton: jump = return di luar k*sigma (deteksi sederhana)."""
    sig_all = r.std(ddof=1)
    jumps = r[np.abs(r - r.mean()) > k * sig_all]
    normal = r[np.abs(r - r.mean()) <= k * sig_all]
    lam = len(jumps) / len(r)
    mj = jumps.mean() if len(jumps) > 1 else 0.0
    sj = jumps.std(ddof=1) if len(jumps) > 1 else 0.0
    sig = normal.std(ddof=1)
    comp = lam * (np.exp(mj + 0.5 * sj**2) - 1)  # kompensator agar drift tidak bias
    z = rng.standard_normal((n, days))
    nj = rng.poisson(lam, (n, days))
    jsum = nj * mj + np.sqrt(nj) * sj * rng.standard_normal((n, days))
    lr = (mu - 0.5 * sig**2 - comp) + sig * z + jsum
    sim_jump.info = dict(lam_per_day=lam, jump_mean=mj, jump_std=sj)
    return s0 * np.exp(np.cumsum(lr, axis=1))


def sim_bootstrap(r, s0, days, n, mu, rng, block=10):
    """Block bootstrap: pertahankan autokorelasi/clustering jangka pendek."""
    rv = (r - r.mean() + mu).values  # drift disamakan dgn model lain
    nb = int(np.ceil(days / block))
    starts = rng.integers(0, len(rv) - block, (n, nb))
    idx = (starts[:, :, None] + np.arange(block)).reshape(n, -1)[:, :days]
    return s0 * np.exp(np.cumsum(rv[idx], axis=1))


PRICE_MODELS = {"gbm": sim_gbm, "garch": sim_garch, "jump": sim_jump, "bootstrap": sim_bootstrap}


# ----------------------------------------------------------------------------
# MODEL FIXED INCOME
# ----------------------------------------------------------------------------
def fit_short_rate(y, dt, kind):
    """Kalibrasi OLS dari discretisasi Euler. y dalam desimal (0.065 = 6.5%)."""
    y0, y1 = y[:-1], y[1:]
    if kind == "vasicek":
        b, a = np.polyfit(y0, y1, 1)
        resid = y1 - (a + b * y0)
        sig_eps = resid.std(ddof=2)
    else:  # CIR: (y1-y0)/sqrt(y0) = a/sqrt(y0) - k*sqrt(y0) + sigma*eps
        sq = np.sqrt(np.maximum(y0, 1e-6))
        X = np.column_stack([1 / sq, sq])
        coef, *_ = np.linalg.lstsq(X, (y1 - y0) / sq, rcond=None)
        a, mk = coef
        b = 1 + mk
        sig_eps = ((y1 - y0) / sq - X @ coef).std(ddof=2)
    b = min(b, 0.9999)  # jaga agar tetap mean-reverting
    kappa = -np.log(b) / dt
    theta = a / (1 - b)
    sigma = sig_eps / np.sqrt(dt)
    return dict(kappa=kappa, theta=theta, sigma=sigma)


def sim_rates(p, y0, days, n, dt, kind, rng):
    out = np.empty((n, days))
    y = np.full(n, y0)
    for t in range(days):
        z = rng.standard_normal(n)
        if kind == "vasicek":
            y = y + p["kappa"] * (p["theta"] - y) * dt + p["sigma"] * np.sqrt(dt) * z
        else:
            y = np.maximum(y + p["kappa"] * (p["theta"] - y) * dt
                           + p["sigma"] * np.sqrt(np.maximum(y, 0) * dt) * z, 0)
        out[:, t] = y
    return out


def bond_price(ytm, coupon, maturity, freq=2, face=100):
    """Harga coupon bond (vektor ytm). Sisa tenor dianggap tetap selama horizon pendek."""
    nper = int(round(maturity * freq))
    t = np.arange(1, nper + 1)
    df = (1 + np.asarray(ytm)[..., None] / freq) ** (-t)
    return (coupon / freq * face * df).sum(-1) + face * df[..., -1]


# ----------------------------------------------------------------------------
# STATISTIK, VALIDASI, OUTPUT
# ----------------------------------------------------------------------------
def summarize(paths, s0, alpha=0.05):
    end = paths[:, -1]
    ret = end / s0 - 1
    var = -np.quantile(ret, alpha)
    cvar = -ret[ret <= -var].mean()
    q = np.quantile(end, [0.05, 0.25, 0.5, 0.75, 0.95])
    return {"P5": q[0], "P25": q[1], "Median": q[2], "P75": q[3], "P95": q[4],
            "Mean": end.mean(), "Prob turun": (ret < 0).mean(),
            "VaR95": var, "CVaR95": cvar}


def kupiec(breaches, n, p=0.05):
    x = breaches
    if x == 0 or x == n:
        return np.nan
    lr = -2 * ((n - x) * np.log(1 - p) + x * np.log(p)
               - (n - x) * np.log(1 - x / n) - x * np.log(x / n))
    return 1 - stats.chi2.cdf(lr, 1)


def backtest_var(r, model, n_test=250, step=1, n_sims=1000, seed=1):
    """VaR 1-hari 95% rolling out-of-sample. Ideal: breach ~5%, p-value Kupiec > 0.05."""
    rng = np.random.default_rng(seed)
    f = PRICE_MODELS[model]
    hits, cnt = 0, 0
    start = len(r) - n_test
    for i in range(start, len(r), step):
        train = r.iloc[max(0, i - 1000):i]
        p = f(train, 1.0, 1, n_sims, 0.0, rng)[:, 0]
        var_ret = np.log(np.quantile(p, 0.05))
        hits += r.iloc[i] < var_ret
        cnt += 1
    return hits / cnt, kupiec(hits, cnt), cnt


def fmt(v, kind):
    if kind == "pct":
        return f"{v*100:6.2f}%"
    return f"{v:,.2f}" if abs(v) < 1e6 else f"{v:,.0f}"


def plot(results, s0, hist, title, fname, ylab="Harga"):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    k = len(results)
    fig, axes = plt.subplots(2, k, figsize=(4.2 * k, 7), squeeze=False)
    tail = hist.iloc[-120:]
    for j, (name, paths) in enumerate(results.items()):
        ax = axes[0, j]
        h = np.arange(-len(tail) + 1, 1)
        ax.plot(h, tail.values, color="#333", lw=1)
        x = np.arange(1, paths.shape[1] + 1)
        for lo, hi, a in [(5, 95, 0.18), (25, 75, 0.35)]:
            ax.fill_between(x, np.percentile(paths, lo, 0), np.percentile(paths, hi, 0),
                            color="#2a6fdb", alpha=a, lw=0)
        ax.plot(x, np.median(paths, 0), color="#2a6fdb", lw=1.5)
        ax.set_title(name.upper()); ax.set_ylabel(ylab); ax.grid(alpha=.3)
        ax2 = axes[1, j]
        end = paths[:, -1]
        lo, hi = np.percentile(end, [0.5, 99.5])  # potong ekor ekstrem agar grafik terbaca
        ax2.hist(end[(end >= lo) & (end <= hi)], bins=80, color="#2a6fdb", alpha=.7)
        ax2.axvline(s0, color="k", ls="--", lw=1, label="Sekarang")
        ax2.set_title("Distribusi akhir horizon"); ax2.legend(); ax2.grid(alpha=.3)
    fig.suptitle(title); fig.tight_layout(); fig.savefig(fname, dpi=120); plt.close(fig)


# ----------------------------------------------------------------------------
# MAIN
# ----------------------------------------------------------------------------
def run_price(a):
    if a.demo or a.csv:
        a.ticker = None
    s = load_prices(a.ticker, a.csv, a.years, a.demo)
    name = a.ticker or ("DEMO" if a.demo else a.csv)
    r = np.log(s).diff().dropna()
    ppy = periods_per_year(s, a.ticker)
    mu = _drift(r, a.drift, a.custom_drift, ppy)
    s0 = float(s.iloc[-1])
    rng = np.random.default_rng(a.seed)
    models = [m.strip() for m in a.models.split(",")]

    print(f"\n=== {name} | {len(r)} obs | harga terakhir {s0:,.2f} | horizon {a.days} periode ===")
    print(f"Vol tahunan historis : {r.std()*np.sqrt(ppy)*100:.1f}%")
    print(f"Return tahunan hist. : {(np.exp(r.mean()*ppy)-1)*100:.1f}%  (drift dipakai: {a.drift})")
    print(f"Skew {stats.skew(r):.2f} | Excess kurtosis {stats.kurtosis(r):.2f}"
          f"  (>0 = fat tail, normal/GBM meremehkan crash)")

    results, rows = {}, {}
    for m in models:
        paths = PRICE_MODELS[m](r, s0, a.days, a.sims, mu, rng)
        results[m] = paths
        rows[m] = summarize(paths, s0)
        info = getattr(PRICE_MODELS[m], "info", None)
        if info:
            print(f"  {m} params: " + ", ".join(f"{k}={v:.4f}" for k, v in info.items()))

    tbl = pd.DataFrame(rows)
    out = tbl.copy().astype(object)
    for idx in tbl.index:
        kind = "pct" if idx in ("Prob turun", "VaR95", "CVaR95") else "num"
        out.loc[idx] = [fmt(v, kind) for v in tbl.loc[idx]]
    print("\nDistribusi harga akhir horizon:\n" + out.to_string())

    if not a.no_backtest:
        print("\nBacktest VaR 1-hari 95% (out-of-sample, ideal breach ~5.0%, p>0.05 = lolos):")
        for m in models:
            rate, pval, cnt = backtest_var(r, m)
            verdict = "LOLOS" if (pval > 0.05) else "GAGAL" if not np.isnan(pval) else "n/a"
            print(f"  {m:10s} breach {rate*100:5.1f}%  p={pval:.3f}  [{verdict}] ({cnt} uji)")

    fname = f"forecast_{str(name).replace('.', '_').replace('/', '_')}.png"
    plot(results, s0, s, f"{name} — Monte Carlo {a.days} periode, {a.sims:,} path", fname)
    tbl.to_csv(fname.replace(".png", ".csv"))
    print(f"\nGrafik: {fname} | Tabel: {fname.replace('.png', '.csv')}")


def run_bond(a):
    if a.demo:
        rng0 = np.random.default_rng(3)
        y = [0.068]
        for _ in range(1200):
            y.append(y[-1] + 1.5 * (0.065 - y[-1]) / 252 + 0.008 * np.sqrt(1 / 252) * rng0.standard_normal())
        ys = pd.Series(y, index=pd.bdate_range("2022-01-01", periods=len(y)))
    else:
        ys = load_prices(csv=a.yield_csv)
        if ys.median() > 1:  # input dalam persen
            ys = ys / 100
    dt = 1 / 252
    rng = np.random.default_rng(a.seed)
    y0 = float(ys.iloc[-1])
    p0 = float(bond_price(y0, a.coupon, a.maturity))
    print(f"\n=== Obligasi kupon {a.coupon*100:.2f}% tenor {a.maturity}th | yield sekarang {y0*100:.2f}%"
          f" | harga {p0:.2f} ===")
    results, rows = {}, {}
    for kind in ("vasicek", "cir"):
        p = fit_short_rate(ys.values, dt, kind)
        print(f"  {kind}: kappa={p['kappa']:.3f} (half-life {np.log(2)/p['kappa']:.2f}th), "
              f"theta={p['theta']*100:.2f}%, sigma={p['sigma']:.4f}")
        yp = sim_rates(p, y0, a.days, a.sims, dt, kind, rng)
        bp = bond_price(yp[:, -1], a.coupon, a.maturity)
        carry = a.coupon * 100 * a.days / 252  # kupon yang diterima selama horizon (approx)
        tr = (bp + carry) / p0 - 1
        rows[kind] = {"Yield P5": np.quantile(yp[:, -1], .05), "Yield median": np.median(yp[:, -1]),
                      "Yield P95": np.quantile(yp[:, -1], .95),
                      "Harga P5": np.quantile(bp, .05), "Harga median": np.median(bp),
                      "Harga P95": np.quantile(bp, .95),
                      "Total return median": np.median(tr), "VaR95 (total return)": -np.quantile(tr, .05)}
        results[kind] = yp * 100
    out = pd.DataFrame(rows).astype(object)
    for idx in out.index:
        pct = "Yield" in idx or "return" in idx or "VaR" in idx
        out.loc[idx] = [fmt(v, "pct") if pct else fmt(v, "num") for v in pd.DataFrame(rows).loc[idx]]
    print("\n" + out.to_string())
    plot(results, y0 * 100, ys * 100, f"Simulasi yield {a.days} hari", "forecast_bond.png", ylab="Yield (%)")
    print("\nGrafik: forecast_bond.png")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ticker", default="BTC-USD")
    ap.add_argument("--csv")
    ap.add_argument("--years", type=int, default=5)
    ap.add_argument("--days", type=int, default=30)
    ap.add_argument("--sims", type=int, default=10000)
    ap.add_argument("--models", default="gbm,garch,jump,bootstrap")
    ap.add_argument("--drift", choices=["zero", "hist", "custom"], default="zero")
    ap.add_argument("--custom-drift", type=float, default=0.0, help="return tahunan, mis 0.08")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--no-backtest", action="store_true")
    ap.add_argument("--demo", action="store_true", help="pakai data sintetis")
    ap.add_argument("--bond", action="store_true")
    ap.add_argument("--yield-csv")
    ap.add_argument("--coupon", type=float, default=0.065)
    ap.add_argument("--maturity", type=float, default=10)
    a = ap.parse_args()
    if a.bond:
        if not (a.yield_csv or a.demo):
            sys.exit("Mode obligasi butuh --yield-csv (kolom Date, Yield) atau --demo")
        run_bond(a)
    else:
        run_price(a)


if __name__ == "__main__":
    main()
