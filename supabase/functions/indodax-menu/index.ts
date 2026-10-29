// indodax-menu: fitur BACA Indodax untuk RAM Capital (pasar, order book, saldo, order terbuka, riwayat).
// Order beli/jual & batal tetap lewat fungsi market-data (validasi batas & konfirmasi). Tidak ada withdraw.
// GET  ?action=pairs                 semua pasangan IDR + harga + perubahan 24 jam / 7 hari (publik Indodax)
// GET  ?action=book&pair=btc_idr     order book 20 level + 30 transaksi terakhir
// POST ?action=private {method,params}  hanya pemilik: getInfo, openOrders, orderHistory, tradeHistory, transHistory, getOrder
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36" };
const json = (body: unknown, status = 200, cache = 0) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json", ...(cache ? { "Cache-Control": `private, max-age=${cache}` } : {}) } });
const SB_URL = Deno.env.get("SUPABASE_URL") ?? "", SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "", SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const IDX_KEY = Deno.env.get("INDODAX_KEY") ?? "", IDX_SECRET = Deno.env.get("INDODAX_SECRET") ?? "";
const OWNER = (Deno.env.get("OWNER_EMAIL") ?? "raafialmuchsin6805@gmail.com").toLowerCase();
const READ = new Set(["getInfo", "openOrders", "orderHistory", "tradeHistory", "transHistory", "getOrder"]);

const okTokens = new Map<string, number>(), memberCache = new Map<string, { at: number; ok: boolean }>();
async function isApproved(sub: string) {
  const c = memberCache.get(sub); if (c && Date.now() - c.at < 60e3) return c.ok; if (!SB_SERVICE) return true;
  const r = await fetch(`${SB_URL}/rest/v1/sp_members?select=status&user_id=eq.${encodeURIComponent(sub)}`, { headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}` } });
  let ok: boolean; if (r.status === 404 || r.status === 400) { const t = await r.text(); ok = /PGRST205|does not exist|schema cache/i.test(t); } else if (!r.ok) ok = false; else { const j = await r.json(); ok = Array.isArray(j) && j[0]?.status === "approved"; }
  if (memberCache.size > 1000) memberCache.clear(); memberCache.set(sub, { at: Date.now(), ok }); return ok;
}
async function checkUser(req: Request): Promise<{ ok: boolean; why?: string; email?: string }> {
  const tok = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim(); if (!tok || tok.split(".").length !== 3) return { ok: false, why: "Perlu login" };
  let p: any; try { p = JSON.parse(atob(tok.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); } catch { return { ok: false, why: "Perlu login" }; }
  const exp = (p.exp ?? 0) * 1000; if (p.role !== "authenticated" || exp < Date.now()) return { ok: false, why: "Perlu login" };
  if ((okTokens.get(tok) ?? 0) <= Date.now()) { const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_ANON, Authorization: `Bearer ${tok}` } }); if (!r.ok) return { ok: false, why: "Perlu login" }; if (okTokens.size > 500) okTokens.clear(); okTokens.set(tok, exp); }
  if (!(await isApproved(p.sub))) return { ok: false, why: "Akun belum disetujui admin" };
  return { ok: true, email: p.email };
}

let pairsCache: { at: number; data: any } | null = null;
async function pairs() {
  if (pairsCache && Date.now() - pairsCache.at < 30e3) return pairsCache.data;
  const [pr, sm] = await Promise.all([fetch("https://indodax.com/api/pairs", { headers: UA }), fetch("https://indodax.com/api/summaries", { headers: UA })]);
  if (!pr.ok) return { error: `Indodax pairs ${pr.status}` };
  const P = await pr.json(), sum = sm.ok ? await sm.json() : {}, tick = sum?.tickers ?? {}, p24 = sum?.prices_24h ?? {}, p7 = sum?.prices_7d ?? {};
  const chg = (last: number, ref: any) => (Number(ref) > 0 && last > 0 ? last / Number(ref) - 1 : null);
  const list = (Array.isArray(P) ? P : []).filter((p: any) => String(p.id ?? p.ticker_id ?? "").endsWith("idr")).map((p: any) => {
    const id = String(p.id ?? p.ticker_id), base = String(p.traded_currency ?? p.base_currency ?? id.replace(/idr$/, "")).toLowerCase(), t = tick[`${base}_idr`] ?? {}, last = Number(t.last ?? 0) || 0;
    return { id, pair: `${base}_idr`, base, name: p.description ?? p.traded_currency_unit ?? base.toUpperCase(), last: last || null, high: Number(t.high ?? 0) || null, low: Number(t.low ?? 0) || null,
      volIdr: Number(t.vol_idr ?? 0) || 0, chg24: chg(last, p24[`${base}idr`]), chg7: chg(last, p7[`${base}idr`]), buy: Number(t.buy ?? 0) || null, sell: Number(t.sell ?? 0) || null,
      minIdr: Number(p.trade_min_traded_currency ?? p.trade_min_base_currency ?? 0) || null, priceRound: Number(p.price_round ?? 0) || null, suspended: !!p.is_maintenance };
  }).sort((a: any, b: any) => b.volIdr - a.volIdr);
  const data = { at: Math.floor(Date.now() / 1000), count: list.length, pairs: list }; pairsCache = { at: Date.now(), data }; return data;
}
async function book(pair: string) {
  if (!/^[a-z0-9]{2,15}_idr$/.test(pair)) return { status: 400, data: { error: "pair tidak valid" } };
  const id = pair.replace("_", ""), [d, t] = await Promise.all([fetch(`https://indodax.com/api/depth/${id}`, { headers: UA }), fetch(`https://indodax.com/api/trades/${id}`, { headers: UA })]);
  const dj = d.ok ? await d.json().catch(() => ({})) : {}, tj = t.ok ? await t.json().catch(() => []) : [];
  const lv = (a: any) => (Array.isArray(a) ? a.slice(0, 20).map((x: any) => [Number(x[0]), Number(x[1])]) : []);
  return { status: 200, data: { pair, bids: lv(dj.buy), asks: lv(dj.sell), trades: (Array.isArray(tj) ? tj : []).slice(0, 30).map((x: any) => ({ t: Number(x.date), px: Number(x.price), amt: Number(x.amount), side: x.type })), at: Math.floor(Date.now() / 1000) } };
}
async function hmac512(key: string, msg: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg)))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function priv(body: any, email: string) {
  if ((email ?? "").toLowerCase() !== OWNER) return { status: 403, data: { error: "Fitur Indodax hanya untuk pemilik akun." } };
  if (!IDX_KEY || !IDX_SECRET) return { status: 503, data: { error: "Belum dikonfigurasi: tambahkan secret INDODAX_KEY dan INDODAX_SECRET di Supabase." } };
  const method = String(body?.method ?? ""); if (!READ.has(method)) return { status: 400, data: { error: "Metode tidak diizinkan di fungsi baca." } };
  const P: Record<string, string> = {}; for (const [k, v] of Object.entries(body?.params ?? {})) if (/^[a-z_]{1,24}$/.test(k) && v != null && String(v).length < 40) P[k] = String(v);
  if (P.pair && !/^[a-z0-9]{2,15}_idr$/.test(P.pair)) return { status: 400, data: { error: "pair tidak valid" } };
  const q = new URLSearchParams({ method, timestamp: String(Date.now()), recvWindow: "10000", ...P }).toString();
  const r = await fetch("https://indodax.com/tapi", { method: "POST", headers: { ...UA, "Content-Type": "application/x-www-form-urlencoded", Key: IDX_KEY, Sign: await hmac512(IDX_SECRET, q) }, body: q });
  return { status: r.ok ? 200 : r.status, data: await r.json().catch(() => ({ success: 0, error: `HTTP ${r.status}` })) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const who = await checkUser(req); if (!who.ok) return json({ error: who.why }, 401);
  const u = new URL(req.url), action = u.searchParams.get("action") ?? "pairs";
  try {
    if (action === "pairs") return json(await pairs(), 200, 30);
    if (action === "book") { const r = await book((u.searchParams.get("pair") ?? "").toLowerCase()); return json(r.data, r.status, 5); }
    if (action === "private") { if (req.method !== "POST") return json({ error: "Gunakan POST" }, 405); const r = await priv(await req.json().catch(() => null), who.email ?? ""); return json(r.data, r.status); }
    return json({ error: "action tidak dikenal" }, 400);
  } catch (e) { return json({ error: String(e) }, 502); }
});
