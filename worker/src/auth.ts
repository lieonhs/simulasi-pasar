// Login RAM Capital tanpa Supabase.
// Secret APP_USERS (JSON): [{"email":"...","salt":"hex","hash":"hex","role":"owner|user"}] — buat entrinya dari layar login web (⚙ Server → Buat entri akun).
// Secret TOKEN_SECRET: string acak panjang (≥ 32 karakter) untuk menandatangani token login (berlaku 30 hari).
import { env } from "cloudflare:workers";
export const ENV = (k: string): string | undefined => { const v = (env as any)[k]; return v == null ? undefined : String(v); };
const te = new TextEncoder();
const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const ub64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
async function hmac(msg: string) { const k = await crypto.subtle.importKey("raw", te.encode(ENV("TOKEN_SECRET") ?? ""), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); return new Uint8Array(await crypto.subtle.sign("HMAC", k, te.encode(msg))); }
export async function pwHash(password: string, saltHex: string) { // PBKDF2-SHA256 10.000 iterasi (sama persis dengan pembuat entri di web)
  const salt = Uint8Array.from(saltHex.match(/../g) ?? [], (h) => parseInt(h, 16)), k = await crypto.subtle.importKey("raw", te.encode(password), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 10000 }, k, 256)); }
const users = () => { try { const L = JSON.parse(ENV("APP_USERS") ?? "[]"); return Array.isArray(L) ? L : []; } catch { return []; } };
const fails = new Map<string, number[]>();
export async function login(req: Request) {
  if ((ENV("TOKEN_SECRET") ?? "").length < 32) return { status: 503, data: { error: "Server belum dikonfigurasi: secret TOKEN_SECRET (≥ 32 karakter) belum ada" } };
  const b: any = await req.json().catch(() => ({})), email = String(b?.email ?? "").trim().toLowerCase(), pw = String(b?.password ?? "");
  const ip = req.headers.get("cf-connecting-ip") ?? "?", now = Date.now(), F = (fails.get(ip) ?? []).filter((t) => now - t < 15 * 60e3);
  if (F.length >= 8) return { status: 429, data: { error: "Terlalu banyak percobaan. Coba lagi 15 menit lagi." } };
  const u = users().find((x: any) => String(x.email ?? "").toLowerCase() === email);
  const ok = !!u && u.salt && u.hash && (await pwHash(pw, u.salt)) === String(u.hash).toLowerCase();
  if (!ok) { F.push(now); fails.set(ip, F); return { status: 401, data: { error: "Email atau password salah." } }; }
  const exp = Math.floor(now / 1000) + 30 * 86400, p = b64u(te.encode(JSON.stringify({ sub: email, email, role: u.role === "owner" ? "owner" : "user", exp })));
  return { status: 200, data: { access_token: `${p}.${b64u(await hmac(p))}`, expires_at: exp, user: { id: email, email, role: u.role === "owner" ? "owner" : "user" } } };
}
export async function checkUser(req: Request): Promise<{ ok: boolean; why?: string; sub?: string; email?: string; role?: string }> {
  const tok = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim(), [p, s] = tok.split(".");
  if (!p || !s || (ENV("TOKEN_SECRET") ?? "").length < 32) return { ok: false, why: "Perlu login" };
  const want = b64u(await hmac(p)); if (want.length !== s.length) return { ok: false, why: "Perlu login" };
  let d = 0; for (let i = 0; i < s.length; i++) d |= want.charCodeAt(i) ^ s.charCodeAt(i); if (d) return { ok: false, why: "Perlu login" }; // perbandingan waktu-konstan
  let j: any; try { j = JSON.parse(new TextDecoder().decode(ub64u(p))); } catch { return { ok: false, why: "Perlu login" }; }
  if (!(j.exp * 1000 > Date.now())) return { ok: false, why: "Sesi berakhir, silakan masuk lagi" };
  if (!users().some((x: any) => String(x.email ?? "").toLowerCase() === j.email)) return { ok: false, why: "Akun sudah dihapus" }; // akun dicabut → token lama tidak berlaku
  return { ok: true, sub: j.email, email: j.email, role: j.role };
}
