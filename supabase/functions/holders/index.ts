// holders: komposisi pemegang saham / kripto (≥ min%). Hanya untuk pengguna login yang disetujui admin (cek sama dengan market-data).
// Deploy: verify_jwt = false (verifikasi token dilakukan di dalam fungsi)
// GET ?symbol=BBCA.JK&min=2   |   GET ?symbol=LINK-USD&min=2
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "GET, OPTIONS" };
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36" };
const SYMBOL_RE = /^[A-Za-z0-9.\-=^]{1,20}$/;
function json(body: unknown, status = 200, cache = 0) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json", ...(cache ? { "Cache-Control": `private, max-age=${cache}` } : {}) } });
}

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


async function yahooCrumb() {
  const r1 = await fetch("https://fc.yahoo.com", { headers: UA, redirect: "manual" });
  const ck = (r1.headers.get("set-cookie") ?? "").split(",").map((c) => c.split(";")[0].trim()).filter((c) => c.includes("=")).join("; ");
  const r2 = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", { headers: { ...UA, cookie: ck } });
  const crumb = r2.ok ? (await r2.text()).trim() : "";
  return { ck, crumb };
}
const raw = (x: any) => (x && typeof x === "object" ? x.raw ?? null : x ?? null);

// ---------- komposisi pemegang ----------
// Saham IDX: profil emiten BEI (pemegang ≥ 5% + masyarakat, dari laporan emiten terakhir) → cadangan Yahoo.
// Saham lain: Yahoo (institusi & reksa dana dari laporan 13F/regulator, bisa tertinggal ±1 kuartal).
// Kripto: token ERC-20 → dompet terbesar dari Ethplorer (alamat kontrak dari CoinGecko). Koin native (BTC, SOL, dst.) tidak punya daftar resmi.
const cache = new Map<string, { at: number; data: any }>();
async function holdersStock(symbol: string, minPct: number) {
  const out: any = { kind: "stock", symbol, holders: [], source: [], note: [] };
  if (/\.JK$/i.test(symbol)) {
    try {
      const code = symbol.replace(/\.JK$/i, "").toUpperCase();
      const r = await fetch(`https://www.idx.co.id/primary/ListedCompany/GetCompanyProfilesDetail?KodeEmiten=${encodeURIComponent(code)}&language=id-id`, { headers: { ...UA, accept: "application/json", referer: "https://www.idx.co.id/" }, signal: AbortSignal.timeout(12000) });
      if (r.ok && (r.headers.get("content-type") ?? "").includes("json")) {
        const j = await r.json(), L = j?.PemegangSaham ?? [];
        for (const h of L) { const pct = Number(h.Persentase); if (!(pct >= minPct)) continue;
          out.holders.push({ name: String(h.Nama ?? "").trim(), pct, shares: Number(h.Jumlah) || null, type: String(h.Kategori ?? "").trim(), controller: /^(ya|true|1)$/i.test(String(h.Pengendali ?? "").trim()) }); }
        if (L.length) out.source.push("BEI · profil emiten (laporan emiten terakhir)");
      } else out.note.push(`BEI menolak permintaan (${r.status})`);
    } catch (_) { out.note.push("BEI tidak bisa dihubungi"); }
  }
  if (!out.holders.length) try {
    const { ck, crumb } = await yahooCrumb();
    if (crumb && !crumb.includes("<")) {
      const r = await fetch(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=majorHoldersBreakdown,institutionOwnership,fundOwnership,insiderHolders&crumb=${encodeURIComponent(crumb)}`, { headers: { ...UA, cookie: ck } });
      if (r.ok) { const q = (await r.json())?.quoteSummary?.result?.[0] ?? {}, seen = new Map<string, any>();
        const add = (L: any[], type: string) => { for (const h of L ?? []) { const pct = 100 * (raw(h.pctHeld) ?? 0), name = String(h.organization ?? h.name ?? "").trim(); if (!name || !(pct >= minPct)) continue;
          const prev = seen.get(name); if (!prev || prev.pct < pct) seen.set(name, { name, pct, shares: raw(h.position) ?? null, type, asOf: h.reportDate?.fmt ?? null }); } };
        add(q.institutionOwnership?.ownershipList, "institusi"); add(q.fundOwnership?.ownershipList, "reksa dana");
        out.holders = [...seen.values()]; const mb = q.majorHoldersBreakdown ?? {};
        out.summary = { insiders: raw(mb.insidersPercentHeld), institutions: raw(mb.institutionsPercentHeld), institutionsCount: raw(mb.institutionsCount) };
        out.source.push("Yahoo Finance"); }
    }
  } catch (_) { out.note.push("Yahoo tidak bisa dihubungi"); }
  out.holders.sort((a: any, b: any) => b.pct - a.pct); return out;
}
async function holdersCrypto(symbol: string, minPct: number) {
  const base = symbol.replace(/-(USD|USDT|IDR)$/i, "").toLowerCase(), out: any = { kind: "crypto", symbol, holders: [], source: [], note: [] };
  try {
    const s = await (await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(base)}`, { headers: UA })).json();
    const c = (s?.coins ?? []).filter((x: any) => String(x.symbol).toLowerCase() === base).sort((a: any, b: any) => (a.market_cap_rank ?? 1e9) - (b.market_cap_rank ?? 1e9))[0];
    if (!c) { out.note.push("Koin tidak ditemukan di CoinGecko"); return out; }
    const d = await (await fetch(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(c.id)}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false`, { headers: UA })).json();
    out.name = d?.name; const pf = Object.fromEntries(Object.entries(d?.platforms ?? {}).filter(([k, v]) => k && v)); const md = d?.market_data ?? {};
    out.supply = { circulating: md.circulating_supply ?? null, total: md.total_supply ?? null, max: md.max_supply ?? null };
    const eth = pf.ethereum as string | undefined;
    if (!eth) { out.note.push(Object.keys(pf).length ? `Token ini tidak ada di Ethereum (jaringan: ${Object.keys(pf).join(", ")}); daftar dompet terbesar belum didukung` : "Koin native (punya blockchain sendiri): tidak ada daftar pemegang resmi; dompet terbesar umumnya milik bursa/kustodian, bukan perorangan"); out.source.push("CoinGecko"); return out; }
    const h = await (await fetch(`https://api.ethplorer.io/getTopTokenHolders/${eth}?apiKey=freekey&limit=100`, { headers: UA })).json();
    if (h?.error) { out.note.push(`Ethplorer: ${h.error.message ?? "error"}`); return out; }
    out.holders = (h?.holders ?? []).filter((x: any) => x.share >= minPct).map((x: any) => ({ name: x.address, pct: x.share, shares: x.balance ?? null, type: "dompet" }));
    out.contract = eth; out.source.push("CoinGecko", "Ethplorer (jaringan Ethereum saja)");
    out.note.push("Persentase terhadap pasokan token di Ethereum; dompet terbesar sering milik bursa, bridge, atau kontrak staking/vesting — bukan satu orang");
  } catch (_) { out.note.push("CoinGecko/Ethplorer tidak bisa dihubungi"); }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const who = await checkUser(req);
  if (!who.ok) return json({ error: who.why }, 401);
  const u = new URL(req.url), sym = (u.searchParams.get("symbol") ?? "").trim(), mn = Math.max(0.5, Math.min(50, Number(u.searchParams.get("min") ?? 2) || 2));
  if (!SYMBOL_RE.test(sym)) return json({ error: "Simbol tidak valid" }, 400);
  const key = `${sym.toUpperCase()}|${mn}`, hit = cache.get(key); if (hit && Date.now() - hit.at < 6 * 3600e3) return json(hit.data, 200, 21600);
  try {
    const isC = /-(USD|USDT|IDR)$/i.test(sym);
    const data = isC ? await holdersCrypto(sym, mn) : await holdersStock(sym, mn);
    if (data.holders.length || data.source.length) { cache.set(key, { at: Date.now(), data }); if (cache.size > 500) cache.clear(); }
    return json(data, 200, 21600);
  } catch (e) { return json({ error: String(e) }, 502); }
});
