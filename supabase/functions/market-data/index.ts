// market-data: proxy harga historis (Yahoo Finance, fallback Binance untuk kripto)
// Publik & read-only (anon key juga publik, jadi JWT tidak menambah keamanan).
// Deploy: supabase functions deploy market-data --no-verify-jwt
// GET ?action=chart&symbol=BTC-USD&range=5y
// GET ?action=search&q=bbca
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
    headers: { ...CORS, "Content-Type": "application/json", ...(cache ? { "Cache-Control": `public, max-age=${cache}` } : {}) },
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
    const rows: [string, number][] = [];
    res.timestamp.forEach((t: number, i: number) => {
      const v = close?.[i];
      if (v != null && isFinite(v) && v > 0) rows.push([new Date(t * 1000).toISOString().slice(0, 10), v]);
    });
    const m = res.meta ?? {};
    return { source: "yahoo", symbol: m.symbol ?? symbol, name: m.longName ?? m.shortName ?? symbol, currency: m.currency ?? "", type: m.instrumentType ?? "", rows };
  }
  return null;
}

async function binanceChart(symbol: string, range: string) {
  const m = symbol.toUpperCase().match(/^([A-Z0-9]+)-USDT?$/);
  if (!m) return null;
  const days = { "1y": 365, "2y": 730, "5y": 1825, "10y": 3650, max: 3650 }[range] ?? 1825;
  let end = Date.now();
  const out: [string, number][] = [];
  while (out.length < days) {
    const r = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${m[1]}USDT&interval=1d&limit=1000&endTime=${end}`);
    if (!r.ok) break;
    const k = await r.json();
    if (!Array.isArray(k) || !k.length) break;
    out.unshift(...k.map((x: any) => [new Date(x[0]).toISOString().slice(0, 10), +x[4]] as [string, number]));
    end = k[0][0] - 1;
    if (k.length < 1000) break;
  }
  if (!out.length) return null;
  return { source: "binance", symbol: `${m[1]}-USDT`, name: `${m[1]}/USDT (Binance)`, currency: "USDT", type: "CRYPTOCURRENCY", rows: out.slice(-days) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
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
