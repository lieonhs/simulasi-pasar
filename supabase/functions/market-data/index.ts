// market-data: proxy harga historis (Yahoo Finance, fallback Binance untuk kripto)
// Hanya untuk pengguna yang login: token Supabase Auth diverifikasi ke /auth/v1/user (di-cache sampai kedaluwarsa).
// Deploy: supabase functions deploy market-data --no-verify-jwt   (verifikasi dilakukan di dalam fungsi)
// GET ?action=chart&symbol=BTC-USD&range=5y
// GET ?action=search&q=bbca
// GET ?action=news&symbol=BBCA.JK&q=saham BBCA
// GET ?action=fundamentals&symbol=TLKM.JK
// GET ?action=intraday&symbol=BBCA.JK&interval=5m   (1m,2m,5m,15m,30m,60m,90m)
// GET ?action=quotes&symbols=BBCA.JK,TLKM.JK          (harga terakhir, maks 25)
// GET ?action=book&symbol=BBCA.JK                       (bid/offer terbaik)
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36" };
const RANGES = new Set(["1y", "2y", "5y", "10y", "max"]);
const SYMBOL_RE = /^[A-Za-z0-9.\-=^]{1,20}$/;

function json(body: unknown, status = 200, cache = 0) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", ...(cache ? { "Cache-Control": `private, max-age=${cache}` } : {}) },
  });
}

async function yahooChart(symbol: string, range: string) {
  for (const host of ["query1", "query2"]) {
    const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d&includeAdjustedClose=true`;
    const r = await fetch(url, { headers: UA });
    if (!r.ok) continue;
    const j = await r.json();
    const res = j?.chart?.result?.[0];
    if (!res?.timestamp) continue;
    const adj = res.indicators?.adjclose?.[0]?.adjclose;
    const close = adj ?? res.indicators?.quote?.[0]?.close;
    const q = res.indicators?.quote?.[0] ?? {};
    const rows: [string, number][] = [];
    const ohlc: [string, number, number, number, number, number][] = []; // harga mentah (bukan adjusted) untuk candlestick
    res.timestamp.forEach((t: number, i: number) => {
      const v = close?.[i];
      const d = new Date(t * 1000).toISOString().slice(0, 10);
      if (v != null && isFinite(v) && v > 0) rows.push([d, v]);
      const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
      if ([o, h, l, c].every((x) => x != null && isFinite(x) && x > 0)) ohlc.push([d, o, h, l, c, q.volume?.[i] ?? 0]);
    });
    const m = res.meta ?? {};
    return { source: "yahoo", symbol: m.symbol ?? symbol, name: m.longName ?? m.shortName ?? symbol, currency: m.currency ?? "", type: m.instrumentType ?? "", rows, ohlc };
  }
  return null;
}

async function binanceChart(symbol: string, range: string) {
  const m = symbol.toUpperCase().match(/^([A-Z0-9]+)-USDT?$/);
  if (!m) return null;
  const days = { "1y": 365, "2y": 730, "5y": 1825, "10y": 3650, max: 3650 }[range] ?? 1825;
  let end = Date.now();
  const out: [string, number, number, number, number, number][] = [];
  while (out.length < days) {
    const r = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${m[1]}USDT&interval=1d&limit=1000&endTime=${end}`);
    if (!r.ok) break;
    const k = await r.json();
    if (!Array.isArray(k) || !k.length) break;
    out.unshift(...k.map((x: any) => [new Date(x[0]).toISOString().slice(0, 10), +x[1], +x[2], +x[3], +x[4], +x[5]] as [string, number, number, number, number, number]));
    end = k[0][0] - 1;
    if (k.length < 1000) break;
  }
  if (!out.length) return null;
  const ohlc = out.slice(-days);
  return { source: "binance", symbol: `${m[1]}-USDT`, name: `${m[1]}/USDT (Binance)`, currency: "USDT", type: "CRYPTOCURRENCY", rows: ohlc.map((x) => [x[0], x[4]] as [string, number]), ohlc };
}


// ---------- berita: Yahoo (search + RSS) + Google News RSS (Indonesia) ----------
const decode = (t: string) => t.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
function parseRss(xml: string, src: string) {
  const items: any[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const g = (tag: string) => { const x = m[1].match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`)); return x ? decode(x[1]) : ""; };
    let title = g("title"), publisher = g("source") || g("News:Source") || src;
    const dash = title.lastIndexOf(" - "); if (src === "Google News" && dash > 20) { publisher = g("source") || title.slice(dash + 3); title = title.slice(0, dash); }
    let summary = g("description");
    if (!summary || summary.replace(/\W/g, "").toLowerCase().includes(title.replace(/\W/g, "").toLowerCase().slice(0, 40))) summary = ""; // Google: deskripsi = judul
    const t = Date.parse(g("pubDate"));
    if (title && isFinite(t)) items.push({ title, summary: summary.slice(0, 400), publisher, link: g("link"), time: Math.floor(t / 1000), via: src });
  }
  return items;
}
async function getNews(symbol: string, q: string) {
  const tasks: Promise<any[]>[] = [];
  tasks.push(fetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}&quotesCount=0&newsCount=20`, { headers: UA })
    .then((r) => (r.ok ? r.json() : {})).then((j: any) => (j.news ?? []).map((n: any) => ({ title: n.title, summary: "", publisher: n.publisher, link: n.link, time: n.providerPublishTime, via: "Yahoo" }))).catch(() => []));
  tasks.push(fetch(`https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`, { headers: UA })
    .then((r) => (r.ok ? r.text() : "")).then((x) => parseRss(x, "Yahoo")).catch(() => []));
  if (q) tasks.push(fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(q + " when:180d")}&hl=id&gl=ID&ceid=ID:id`, { headers: UA })
    .then((r) => (r.ok ? r.text() : "")).then((x) => parseRss(x, "Google News")).catch(() => []));
  if (q) tasks.push(fetch(`https://www.bing.com/news/search?q=${encodeURIComponent(q)}&format=rss&setlang=id&cc=ID&count=50`, { headers: UA })
    .then((r) => (r.ok ? r.text() : "")).then((x) => parseRss(x, "Bing News")).catch(() => []));
  const all = (await Promise.all(tasks)).flat();
  const seen = new Map<string, any>();
  for (const n of all) { const k = n.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60); const prev = seen.get(k);
    if (!prev) seen.set(k, n); else if (!prev.summary && n.summary) prev.summary = n.summary; }
  return [...seen.values()].sort((a, b) => b.time - a.time).slice(0, 120);
}


// ---------- fundamental (untuk valuasi Damodaran) ----------
async function yahooCrumb() {
  const r1 = await fetch("https://fc.yahoo.com", { headers: UA, redirect: "manual" });
  const ck = (r1.headers.get("set-cookie") ?? "").split(",").map((c) => c.split(";")[0].trim()).filter((c) => c.includes("=")).join("; ");
  const r2 = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", { headers: { ...UA, cookie: ck } });
  const crumb = r2.ok ? (await r2.text()).trim() : "";
  return { ck, crumb };
}
const raw = (x: any) => (x && typeof x === "object" ? x.raw ?? null : x ?? null);
async function getFundamentals(symbol: string) {
  const out: any = { symbol, source: [] };
  try {
    const { ck, crumb } = await yahooCrumb();
    if (crumb && !crumb.includes("<")) {
      const mods = "price,summaryDetail,defaultKeyStatistics,financialData,assetProfile";
      const r = await fetch(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${mods}&crumb=${encodeURIComponent(crumb)}`, { headers: { ...UA, cookie: ck } });
      if (r.ok) {
        const q = (await r.json())?.quoteSummary?.result?.[0] ?? {};
        const fd = q.financialData ?? {}, ks = q.defaultKeyStatistics ?? {}, sd = q.summaryDetail ?? {}, pr = q.price ?? {}, ap = q.assetProfile ?? {};
        Object.assign(out, { sector: ap.sector ?? "", industry: ap.industry ?? "", currency: pr.currency ?? fd.financialCurrency ?? "", financialCurrency: fd.financialCurrency ?? "",
          price: raw(pr.regularMarketPrice), marketCap: raw(pr.marketCap), shares: raw(ks.sharesOutstanding), beta: raw(sd.beta) ?? raw(ks.beta),
          revenue: raw(fd.totalRevenue), operatingMargin: raw(fd.operatingMargins), revenueGrowth: raw(fd.revenueGrowth), totalDebt: raw(fd.totalDebt), totalCash: raw(fd.totalCash),
          roe: raw(fd.returnOnEquity), bookValuePerShare: raw(ks.bookValue), priceToBook: raw(ks.priceToBook), trailingPE: raw(sd.trailingPE), forwardPE: raw(sd.forwardPE),
          dividendYield: raw(sd.dividendYield), payoutRatio: raw(sd.payoutRatio), freeCashflow: raw(fd.freeCashflow), ebitda: raw(fd.ebitda), netIncome: raw(ks.netIncomeToCommon) });
        out.source.push("quoteSummary");
      }
    }
  } catch (_) { /* lanjut ke timeseries */ }
  try { // seri tahunan (tanpa crumb)
    const types = ["annualTotalRevenue", "annualOperatingIncome", "annualPretaxIncome", "annualTaxProvision", "annualNetIncome", "annualTotalDebt",
      "annualCashAndCashEquivalents", "annualStockholdersEquity", "annualInvestedCapital", "annualOrdinarySharesNumber", "annualCapitalExpenditure", "annualDepreciationAndAmortization"];
    const now = Math.floor(Date.now() / 1000);
    const r = await fetch(`https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}?type=${types.join(",")}&period1=1420070400&period2=${now}`, { headers: UA });
    if (r.ok) {
      const res = (await r.json())?.timeseries?.result ?? [];
      const series: Record<string, [string, number][]> = {};
      for (const it of res) { const t = it?.meta?.type?.[0]; if (!t || !it[t]) continue;
        series[t.replace("annual", "")] = it[t].filter((x: any) => x?.reportedValue?.raw != null).map((x: any) => [x.asOfDate, x.reportedValue.raw]); }
      out.annual = series; out.source.push("timeseries");
    }
  } catch (_) { /* */ }
  return out;
}


// ---------- intraday (candlestick per menit/jam) ----------
const INTRA: Record<string, string> = { "1m": "5d", "2m": "1mo", "5m": "1mo", "15m": "1mo", "30m": "1mo", "60m": "6mo", "90m": "1mo" };
async function yahooIntraday(symbol: string, interval: string, range: string) {
  for (const host of ["query1", "query2"]) {
    const r = await fetch(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false`, { headers: UA });
    if (!r.ok) continue;
    const res = (await r.json())?.chart?.result?.[0];
    if (!res?.timestamp) continue;
    const q = res.indicators?.quote?.[0] ?? {}, bars: number[][] = [];
    res.timestamp.forEach((t: number, i: number) => { const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
      if ([o, h, l, c].every((x) => x != null && isFinite(x) && x > 0)) bars.push([t, o, h, l, c, q.volume?.[i] ?? 0]); });
    const m = res.meta ?? {};
    return { source: "yahoo", symbol: m.symbol ?? symbol, interval, gmtoffset: m.gmtoffset ?? 0, timezone: m.exchangeTimezoneName ?? "", currency: m.currency ?? "",
      price: m.regularMarketPrice ?? null, priceTime: m.regularMarketTime ?? null, prevClose: m.chartPreviousClose ?? m.previousClose ?? null,
      period: m.currentTradingPeriod?.regular ?? null, bars };
  }
  return null;
}
async function binanceIntraday(symbol: string, interval: string) {
  const m = symbol.toUpperCase().match(/^([A-Z0-9]+)-USDT?$/); if (!m) return null;
  const iv = interval === "60m" ? "1h" : interval === "90m" ? "1h" : interval === "2m" ? "1m" : interval;
  const r = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${m[1]}USDT&interval=${iv}&limit=1000`);
  if (!r.ok) return null; const k = await r.json(); if (!Array.isArray(k) || !k.length) return null;
  const bars = k.map((x: any) => [Math.floor(x[0] / 1000), +x[1], +x[2], +x[3], +x[4], +x[5]]);
  const last = bars[bars.length - 1];
  return { source: "binance", symbol: `${m[1]}-USDT`, interval, gmtoffset: 0, timezone: "UTC", currency: "USDT", price: last[4], priceTime: last[0], prevClose: null, period: null, bars };
}


// ---------- quote live (banyak simbol) ----------
async function quoteOne(symbol: string) {
  for (const host of ["query1", "query2"]) {
    const r = await fetch(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1m&includePrePost=false`, { headers: UA });
    if (!r.ok) continue;
    const res = (await r.json())?.chart?.result?.[0]; if (!res?.meta) continue;
    const m = res.meta, per = m.currentTradingPeriod?.regular, now = Date.now() / 1000;
    return { symbol: m.symbol ?? symbol, price: m.regularMarketPrice ?? null, prevClose: m.chartPreviousClose ?? m.previousClose ?? null, time: m.regularMarketTime ?? null,
      dayHigh: m.regularMarketDayHigh ?? null, dayLow: m.regularMarketDayLow ?? null, volume: m.regularMarketVolume ?? null, currency: m.currency ?? "",
      gmtoffset: m.gmtoffset ?? 0, open: per ? now >= per.start && now <= per.end : null };
  }
  return { symbol, error: "tidak tersedia" };
}


// ---------- hanya pengguna yang login (token Supabase Auth) ----------
const SB_URL = Deno.env.get("SUPABASE_URL") ?? "", SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const okTokens = new Map<string, number>(); // token -> exp (ms)
async function isUser(req: Request) {
  const tok = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!tok || tok.split(".").length !== 3) return false;
  let p: any; try { p = JSON.parse(atob(tok.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); } catch { return false; }
  const exp = (p.exp ?? 0) * 1000; if (p.role !== "authenticated" || exp < Date.now()) return false;
  if ((okTokens.get(tok) ?? 0) > Date.now()) return true;
  const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_ANON, Authorization: `Bearer ${tok}` } });
  if (!r.ok) return false;
  if (okTokens.size > 500) okTokens.clear();
  okTokens.set(tok, exp); return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!(await isUser(req))) return json({ error: "Perlu login" }, 401);
  const u = new URL(req.url);
  const action = u.searchParams.get("action") ?? "chart";
  try {
    if (action === "search") {
      const q = (u.searchParams.get("q") ?? "").slice(0, 40);
      if (!q) return json({ quotes: [] });
      const r = await fetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0`, { headers: UA });
      if (!r.ok) return json({ quotes: [], error: `yahoo ${r.status}` }, 200);
      const j = await r.json();
      const quotes = (j.quotes ?? []).filter((x: any) => x.symbol).map((x: any) => ({ symbol: x.symbol, name: x.longname ?? x.shortname ?? "", exch: x.exchDisp ?? "", type: x.quoteType ?? "" }));
      return json({ quotes }, 200, 3600);
    }
    if (action === "book") { // bid/offer terbaik (level teratas) dari Yahoo — antrean lengkap IDX tidak tersedia publik
      const sym = (u.searchParams.get("symbol") ?? "").trim();
      if (!SYMBOL_RE.test(sym)) return json({ error: "Simbol tidak valid" }, 400);
      const { ck, crumb } = await yahooCrumb();
      const r = await fetch(`https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(sym)}&crumb=${encodeURIComponent(crumb)}`, { headers: { ...UA, cookie: ck } });
      const q = r.ok ? (await r.json())?.quoteResponse?.result?.[0] ?? {} : {};
      return json({ symbol: sym, bid: q.bid ?? null, ask: q.ask ?? null, bidSize: q.bidSize ?? null, askSize: q.askSize ?? null, price: q.regularMarketPrice ?? null,
        time: q.regularMarketTime ?? null, marketState: q.marketState ?? null }, 200, 10);
    }
    if (action === "quotes") {
      const syms = (u.searchParams.get("symbols") ?? "").split(",").map((x) => x.trim()).filter((x) => SYMBOL_RE.test(x)).slice(0, 25);
      if (!syms.length) return json({ error: "Simbol kosong" }, 400);
      return json({ at: Math.floor(Date.now() / 1000), quotes: await Promise.all(syms.map(quoteOne)) }, 200, 10);
    }
    if (action === "intraday") {
      const sym = (u.searchParams.get("symbol") ?? "").trim(), iv = u.searchParams.get("interval") ?? "5m";
      if (!SYMBOL_RE.test(sym)) return json({ error: "Simbol tidak valid" }, 400);
      if (!INTRA[iv]) return json({ error: "Interval tidak valid" }, 400);
      const data = (await yahooIntraday(sym, iv, INTRA[iv])) ?? (await binanceIntraday(sym, iv));
      if (!data || !data.bars.length) return json({ error: `Data intraday ${sym} tidak tersedia` }, 404);
      return json(data, 200, 30);
    }
    if (action === "fundamentals") {
      const sym = (u.searchParams.get("symbol") ?? "").trim();
      if (!SYMBOL_RE.test(sym)) return json({ error: "Simbol tidak valid" }, 400);
      return json(await getFundamentals(sym), 200, 21600);
    }
    if (action === "news") {
      const sym = (u.searchParams.get("symbol") ?? "").trim(), q = (u.searchParams.get("q") ?? "").slice(0, 80);
      if (!SYMBOL_RE.test(sym)) return json({ error: "Simbol tidak valid" }, 400);
      return json({ items: await getNews(sym, q) }, 200, 900);
    }
    const symbol = (u.searchParams.get("symbol") ?? "").trim();
    const range = u.searchParams.get("range") ?? "5y";
    if (!SYMBOL_RE.test(symbol)) return json({ error: "Simbol tidak valid" }, 400);
    if (!RANGES.has(range)) return json({ error: "Range tidak valid" }, 400);
    const data = (await yahooChart(symbol, range)) ?? (await binanceChart(symbol, range));
    if (!data || data.rows.length < 30) return json({ error: `Data untuk ${symbol} tidak ditemukan` }, 404);
    return json(data, 200, 1800);
  } catch (e) {
    return json({ error: String(e) }, 502);
  }
});
