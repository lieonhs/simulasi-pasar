// RAM Capital · Cloudflare Worker: satu Worker menggantikan 5 fungsi Supabase. Rute sama dengan Supabase (/functions/v1/<nama>) supaya web cukup ganti alamat server.
import { login, checkUser } from "./auth";
import marketData from "./fn/market-data";
import indodaxMenu from "./fn/indodax-menu";
import holders from "./fn/holders";
import binanceFut from "./fn/binance-fut";
import videoEye from "./fn/video-eye";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Max-Age": "86400" };
const ROUTES: Record<string, (req: Request) => Promise<Response>> = { "market-data": marketData as any, "indodax-menu": indodaxMenu as any, holders: holders as any, "binance-fut": binanceFut as any, "video-eye": videoEye as any };
const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
export default {
  async fetch(req: Request): Promise<Response> {
    const u = new URL(req.url), path = u.pathname.replace(/\/+$/, "");
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    if (path === "/auth/login" && req.method === "POST") { const r = await login(req); return j(r.data, r.status); }
    if (path === "/auth/me") { const w = await checkUser(req); return w.ok ? j({ user: { id: w.email, email: w.email, role: w.role } }) : j({ error: w.why }, 401); }
    if (path === "" || path === "/") return j({ ok: true, app: "RAM Capital", note: "server aktif" });
    const name = path.replace(/^\/functions\/v1\//, "").replace(/^\//, ""), h = ROUTES[name]; if (!h) return j({ error: "Tidak ditemukan" }, 404);
    const res = await h(req); const H = new Headers(res.headers); H.set("Access-Control-Max-Age", "86400"); return new Response(res.body, { status: res.status, headers: H });
  },
};
