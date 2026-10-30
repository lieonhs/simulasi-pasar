// binance-fut: futures USDⓈ-M Binance untuk autopilot — HANYA pemilik akun, TANPA transfer/withdraw.
// Default DEMO TRADING (testnet, uang palsu): https://demo-fapi.binance.com. Uang asli hanya bila secret BINANCE_FUT_LIVE = "1".
// Secrets: BINANCE_FUT_KEY, BINANCE_FUT_SECRET, [BINANCE_FUT_LIVE], [BINANCE_FUT_MAX_USDT=150], [BINANCE_FUT_MAX_LEV=3], [OWNER_EMAIL]
// Dipanggil dengan ?forceFunctionRegion=ap-southeast-2 (Binance menolak server di AS); fungsi menolak jalan dari wilayah AS/Kanada.
// POST {action:"status"} | {action:"account"} | {action:"open", symbol, dir, usdt, lev, stop, tp, confirm:"open SYMBOL"} | {action:"close", symbol} | {action:"stop", symbol, stop}
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } }); }
const KEY = Deno.env.get("BINANCE_FUT_KEY") ?? "", SECRET = Deno.env.get("BINANCE_FUT_SECRET") ?? "", LIVE = Deno.env.get("BINANCE_FUT_LIVE") === "1";
const BASE = LIVE ? "https://fapi.binance.com" : "https://demo-fapi.binance.com";
const MAX_USDT = Math.max(5, Number(Deno.env.get("BINANCE_FUT_MAX_USDT") ?? "150") || 150), MAX_LEV = Math.max(1, Math.min(5, Math.floor(Number(Deno.env.get("BINANCE_FUT_MAX_LEV") ?? "3") || 3)));
const OWNER = (Deno.env.get("OWNER_EMAIL") ?? "raafialmuchsin6805@gmail.com").toLowerCase();
const REGION = Deno.env.get("SB_REGION") ?? "";
const regionOk = () => !REGION || !/^(us-|ca-)/.test(REGION);

// ---------- hanya pengguna yang login ----------
const SB_URL = Deno.env.get("SUPABASE_URL") ?? "", SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "", SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const okTokens = new Map<string, number>(); // token -> exp (ms)
const memberCache = new Map<string, { at: number; ok: boolean }>();
// keanggotaan Simulasi Pasar: hanya akun yang disetujui admin (tabel sp_members)
async function isApproved(sub: string): Promise<boolean> {
  const c = memberCache.get(sub); if (c && Date.now() - c.at < 60e3) return c.ok;
  if (!SB_SERVICE) return true;
  const r = await fetch(`${SB_URL}/rest/v1/sp_members?select=status&user_id=eq.${encodeURIComponent(sub)}`, { headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}` } });
  let ok: boolean;
  if (r.status === 404 || r.status === 400) { const t = await r.text(); ok = /PGRST205|does not exist|schema cache/i.test(t); } // tabel belum dipasang -> belum ada sistem persetujuan
  else if (!r.ok) ok = false;
  else { const j = await r.json(); ok = Array.isArray(j) && j[0]?.status === "approved"; }
  if (memberCache.size > 1000) memberCache.clear();
  memberCache.set(sub, { at: Date.now(), ok }); return ok;
}
async function checkUser(req: Request): Promise<{ ok: boolean; why?: string; sub?: string; email?: string }> {
  const tok = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!tok || tok.split(".").length !== 3) return { ok: false, why: "Perlu login" };
  let p: any; try { p = JSON.parse(atob(tok.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); } catch { return { ok: false, why: "Perlu login" }; }
  const exp = (p.exp ?? 0) * 1000; if (p.role !== "authenticated" || exp < Date.now()) return { ok: false, why: "Perlu login" };
  if ((okTokens.get(tok) ?? 0) <= Date.now()) {
    const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_ANON, Authorization: `Bearer ${tok}` } });
    if (!r.ok) return { ok: false, why: "Perlu login" };
    if (okTokens.size > 500) okTokens.clear();
    okTokens.set(tok, exp);
  }
  if (!(await isApproved(p.sub))) return { ok: false, why: "Akun belum disetujui admin" };
  return { ok: true, sub: p.sub, email: p.email };
}



// ---------- Binance ----------
async function hmac256(key: string, msg: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg)))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
class BnErr extends Error { code: number; constructor(m: string, code = 0) { super(m); this.code = code; } }
async function bn(method: string, path: string, params: Record<string, string | number | boolean> = {}, signed = true) {
  const q = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  if (signed) { q.set("timestamp", String(Date.now())); q.set("recvWindow", "10000"); q.set("signature", await hmac256(SECRET, q.toString())); }
  const r = await fetch(`${BASE}${path}?${q}`, { method, headers: signed ? { "X-MBX-APIKEY": KEY } : {}, signal: AbortSignal.timeout(15000) });
  const t = await r.text(); let j: any = null; try { j = JSON.parse(t); } catch { /* */ }
  if (r.status === 451 || r.status === 403) throw new BnErr(`Binance menolak lokasi server (${r.status}, wilayah ${REGION || "?"})`, r.status);
  if (!r.ok) throw new BnErr(`Binance ${r.status}: ${j?.msg ?? t.slice(0, 160)}`, j?.code ?? r.status);
  return j;
}
let infoCache: { at: number; map: Map<string, any> } | null = null;
async function symInfo(sym: string) {
  if (!infoCache || Date.now() - infoCache.at > 3600e3) { const j = await bn("GET", "/fapi/v1/exchangeInfo", {}, false); infoCache = { at: Date.now(), map: new Map((j.symbols ?? []).map((s: any) => [s.symbol, s])) }; }
  const s = infoCache.map.get(sym); if (!s || s.status !== "TRADING" || s.contractType !== "PERPETUAL") return null;
  const f = (t: string) => (s.filters ?? []).find((x: any) => x.filterType === t) ?? {};
  return { step: String(f("MARKET_LOT_SIZE").stepSize ?? f("LOT_SIZE").stepSize ?? "0.001"), minQty: Number(f("MARKET_LOT_SIZE").minQty ?? f("LOT_SIZE").minQty ?? 0), maxQty: Number(f("MARKET_LOT_SIZE").maxQty ?? 1e12),
    tick: String(f("PRICE_FILTER").tickSize ?? "0.01"), minNotional: Number(f("MIN_NOTIONAL").notional ?? 5) };
}
const decs = (x: string) => { const t = x.replace(/0+$/, ""); const i = t.indexOf("."); return i < 0 ? 0 : t.length - i - 1; };
const floorStep = (v: number, step: string) => { const s = Number(step), d = decs(step); return (Math.floor(v / s + 1e-9) * s).toFixed(d); };
const roundTick = (v: number, tick: string) => { const s = Number(tick), d = decs(tick); return (Math.round(v / s) * s).toFixed(d); };
async function position(sym: string) { const L = await bn("GET", "/fapi/v3/positionRisk", { symbol: sym }); const p = (L ?? []).find((x: any) => x.symbol === sym && Number(x.positionAmt) !== 0); return p ? Number(p.positionAmt) : 0; }
async function cancelAll(sym: string) {
  for (const path of ["/fapi/v1/algoOpenOrders", "/fapi/v1/allOpenOrders"]) { try { await bn("DELETE", path, { symbol: sym }); } catch (_) { /* tidak ada order */ } } }
async function closeSym(sym: string) { await cancelAll(sym); const amt = await position(sym); if (!amt) return { closed: false, note: "tidak ada posisi" };
  const I = await symInfo(sym); const q = floorStep(Math.abs(amt), I?.step ?? "0.001");
  const o = await bn("POST", "/fapi/v1/order", { symbol: sym, side: amt > 0 ? "SELL" : "BUY", type: "MARKET", quantity: q, reduceOnly: "true", newClientOrderId: `rc_x_${Date.now()}` });
  return { closed: true, qty: q, orderId: o.orderId, avgPrice: o.avgPrice }; }
async function openPos(b: any) {
  const sym = String(b?.symbol ?? "").toUpperCase(), dir = Number(b?.dir), want = Number(b?.usdt), lev0 = Math.floor(Number(b?.lev) || 1), stop = Number(b?.stop), tp = Number(b?.tp);
  if (!/^[A-Z0-9]{2,20}USDT$/.test(sym) || ![1, -1].includes(dir)) return { status: 400, data: { error: "Simbol/arah tidak valid" } };
  if (b?.confirm !== `open ${sym}`) return { status: 400, data: { error: "Konfirmasi order tidak cocok" } };
  if (!(want > 0) || !(stop > 0) || !(tp > 0)) return { status: 400, data: { error: "Nilai/stop/target tidak valid" } };
  const I = await symInfo(sym); if (!I) return { status: 400, data: { error: `${sym} tidak tersedia di futures perpetual Binance` } };
  const dual = await bn("GET", "/fapi/v1/positionSide/dual"); if (dual?.dualSidePosition) return { status: 400, data: { error: "Akun Binance memakai Hedge Mode. Ubah ke One-way Mode (Futures → Preferences → Position Mode) lalu coba lagi." } };
  if (await position(sym)) return { status: 409, data: { error: `Sudah ada posisi ${sym} di Binance` } };
  const mark = Number((await bn("GET", "/fapi/v1/premiumIndex", { symbol: sym }, false)).markPrice);
  if (!(mark > 0)) return { status: 502, data: { error: "Harga mark tidak tersedia" } };
  if (dir > 0 ? !(stop < mark && tp > mark) : !(stop > mark && tp < mark)) return { status: 400, data: { error: `Stop/target tidak di sisi yang benar dari harga ${mark}` } };
  if (Math.abs(stop / mark - 1) > 0.5) return { status: 400, data: { error: "Stop terlalu jauh (> 50%)" } };
  const lev = Math.max(1, Math.min(lev0, MAX_LEV)), usdt = Math.min(want, MAX_USDT);
  try { await bn("POST", "/fapi/v1/marginType", { symbol: sym, marginType: "ISOLATED" }); } catch (e) { if ((e as BnErr).code !== -4046) throw e; } // -4046: sudah isolated
  await bn("POST", "/fapi/v1/leverage", { symbol: sym, leverage: lev });
  const qty = floorStep(usdt / mark, I.step); if (!(Number(qty) >= I.minQty) || Number(qty) * mark < I.minNotional) return { status: 400, data: { error: `Nilai ${usdt} USDT di bawah minimum ${sym} (± ${I.minNotional} USDT); naikkan nilai per order` } };
  const side = dir > 0 ? "BUY" : "SELL", ex = dir > 0 ? "SELL" : "BUY";
  const o = await bn("POST", "/fapi/v1/order", { symbol: sym, side, type: "MARKET", quantity: qty, newClientOrderId: `rc_o_${Date.now()}`, newOrderRespType: "RESULT" });
  // stop & target WAJIB terpasang; bila gagal, posisi langsung ditutup (tidak boleh ada posisi tanpa stop)
  const algo = (type: string, px: number) => bn("POST", "/fapi/v1/algoOrder", { algoType: "CONDITIONAL", symbol: sym, side: ex, type, triggerPrice: roundTick(px, I.tick), closePosition: "true", workingType: "MARK_PRICE", priceProtect: "true", clientAlgoId: `rc_${type === "STOP_MARKET" ? "s" : "t"}_${Date.now()}` });
  let sl: any, tk: any;
  try { sl = await algo("STOP_MARKET", stop); tk = await algo("TAKE_PROFIT_MARKET", tp); }
  catch (e) { let back: any = null; try { back = await closeSym(sym); } catch (_) { /* */ } return { status: 502, data: { error: `Stop/target gagal dipasang (${(e as Error).message}); posisi ditutup lagi demi keamanan`, closed: back } }; }
  return { status: 200, data: { live: LIVE, symbol: sym, dir, qty, lev, usdt, mark, avgPrice: Number(o.avgPrice) || mark, orderId: o.orderId, stop: sl?.triggerPrice, tp: tk?.triggerPrice } };
}
async function moveStop(b: any) { // geser stop: pasang stop BARU dulu, lalu batalkan stop lama (tidak pernah ada jeda tanpa stop)
  const sym = String(b?.symbol ?? "").toUpperCase(), stop = Number(b?.stop); if (!/^[A-Z0-9]{2,20}USDT$/.test(sym) || !(stop > 0)) return { status: 400, data: { error: "Simbol/stop tidak valid" } };
  const amt = await position(sym); if (!amt) return { status: 200, data: { moved: false, note: "tidak ada posisi" } };
  const I = await symInfo(sym); if (!I) return { status: 400, data: { error: "Simbol tidak tersedia" } };
  const mark = Number((await bn("GET", "/fapi/v1/premiumIndex", { symbol: sym }, false)).markPrice);
  if (amt > 0 ? !(stop < mark) : !(stop > mark)) return { status: 400, data: { error: `Stop ${stop} sudah terlewati harga ${mark}` } };
  const old = await bn("GET", "/fapi/v1/openAlgoOrders", { symbol: sym }).catch(() => []), L = (Array.isArray(old) ? old : old?.orders ?? []).filter((a: any) => (a.orderType ?? a.type) === "STOP_MARKET");
  const nw = await bn("POST", "/fapi/v1/algoOrder", { algoType: "CONDITIONAL", symbol: sym, side: amt > 0 ? "SELL" : "BUY", type: "STOP_MARKET", triggerPrice: roundTick(stop, I.tick), closePosition: "true", workingType: "MARK_PRICE", priceProtect: "true", clientAlgoId: `rc_s_${Date.now()}` });
  for (const a of L) { try { await bn("DELETE", "/fapi/v1/algoOrder", { symbol: sym, algoId: a.algoId }); } catch (_) { /* sudah tidak aktif */ } }
  return { status: 200, data: { moved: true, stop: nw.triggerPrice, replaced: L.length } };
}
async function account() {
  const [bal, pos, algo] = await Promise.all([bn("GET", "/fapi/v3/balance"), bn("GET", "/fapi/v3/positionRisk"), bn("GET", "/fapi/v1/openAlgoOrders").catch(() => [])]);
  const u = (bal ?? []).find((x: any) => x.asset === "USDT") ?? {};
  return { live: LIVE, usdt: { balance: Number(u.balance ?? 0), available: Number(u.availableBalance ?? 0), upnl: Number(u.crossUnPnl ?? 0) },
    positions: (pos ?? []).filter((p: any) => Number(p.positionAmt) !== 0).map((p: any) => ({ symbol: p.symbol, amt: Number(p.positionAmt), entry: Number(p.entryPrice), mark: Number(p.markPrice), upnl: Number(p.unRealizedProfit), liq: Number(p.liquidationPrice), lev: Number(p.leverage ?? 0), isolated: p.marginType === "isolated" })),
    algo: (Array.isArray(algo) ? algo : algo?.orders ?? []).map((a: any) => ({ symbol: a.symbol, type: a.orderType ?? a.type, side: a.side, trigger: Number(a.triggerPrice), id: a.algoId })) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const who = await checkUser(req); if (!who.ok) return json({ error: who.why }, 401);
  if ((who.email ?? "").toLowerCase() !== OWNER) return json({ error: "Fitur Binance hanya untuk pemilik akun." }, 403);
  if (req.method !== "POST") return json({ error: "Gunakan POST" }, 405);
  const b = await req.json().catch(() => ({})), act = String(b?.action ?? "");
  if (act === "status") return json({ configured: !!(KEY && SECRET), live: LIVE, maxUsdt: MAX_USDT, maxLev: MAX_LEV, region: REGION, regionOk: regionOk() });
  if (!KEY || !SECRET) return json({ error: "Belum dikonfigurasi: tambahkan secret BINANCE_FUT_KEY dan BINANCE_FUT_SECRET di Supabase." }, 503);
  if (!regionOk()) return json({ error: `Fungsi berjalan di ${REGION}; Binance menolak server di wilayah ini. Panggil dengan forceFunctionRegion=ap-southeast-2.` }, 451);
  try {
    if (act === "account") return json(await account());
    if (act === "open") { const r = await openPos(b); return json(r.data, r.status); }
    if (act === "stop") { const r = await moveStop(b); return json(r.data, r.status); }
    if (act === "close") { const sym = String(b?.symbol ?? "").toUpperCase(); if (!/^[A-Z0-9]{2,20}USDT$/.test(sym)) return json({ error: "Simbol tidak valid" }, 400); return json(await closeSym(sym)); }
    return json({ error: "Aksi tidak dikenal" }, 400); // sengaja TIDAK ada transfer/withdraw
  } catch (e) { return json({ error: (e as Error).message }, (e as BnErr).code === 451 || (e as BnErr).code === 403 ? 451 : 502); }
});
