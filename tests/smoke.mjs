// Uji asap (smoke) di browser: web dimuat dengan data tiruan, tanpa error, dan halaman utama + autopilot bisa dipakai.
// Jalankan: npm i -D playwright && npx playwright install chromium && node tests/smoke.mjs
import { chromium } from "playwright";
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const types = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".woff2": "font/woff2", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const srv = http.createServer((q, r) => { let f = path.join(root, decodeURIComponent(new URL(q.url, "http://x").pathname)); if (f.endsWith("/")) f += "index.html"; fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { "content-type": types[path.extname(f)] || "application/octet-stream" }); r.end(b); }); }).listen(0);
const base = `http://localhost:${srv.address().port}/`;
function rnd(seed) { let a = 0; for (const c of seed) a = (a * 31 + c.charCodeAt(0)) >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function series(s) { const r = rnd(s), rows = [], ohlc = []; let p = s.endsWith(".JK") ? 5000 : s.includes("IDR") ? 16000 : 100; const d = new Date("2021-01-04");
  for (let i = 0; i < 1300; i++) { d.setDate(d.getDate() + 1); if ([0, 6].includes(d.getDay()) && !s.includes("-USD")) { i--; continue; } const o = p; p *= Math.exp((r() - 0.5) * 0.04); const ds = d.toISOString().slice(0, 10); rows.push([ds, p]); ohlc.push([ds, o, Math.max(o, p) * 1.01, Math.min(o, p) * 0.99, p, 1e6 + r() * 5e6]); }
  return { source: "mock", symbol: s, name: "Mock " + s, currency: s.endsWith(".JK") || s.includes("IDR") ? "IDR" : "USD", type: s.includes("-USD") ? "CRYPTOCURRENCY" : "EQUITY", rows, ohlc }; }
function api(u) { const a = u.searchParams.get("action") || "chart", s = u.searchParams.get("symbol");
  if (a === "chart") return series(s); if (a === "quotes") return { quotes: u.searchParams.get("symbols").split(",").map((x) => { const S = series(x), L = S.ohlc.at(-1); return { symbol: x, price: L[4], prevClose: S.ohlc.at(-2)[4], currency: S.currency, open: true }; }) };
  if (a === "news") return { items: [] }; if (a === "indodax_pairs" || a === "pairs") return { pairs: [{ pair: "btc_idr", base: "btc", last: 1.5e9, volIdr: 5e11, chg24: 0.01 }] }; return {}; }
const errs = [], b = await chromium.launch(), p = await (await b.newContext()).newPage();
p.on("pageerror", (e) => errs.push("PAGEERR " + e.message)); p.on("console", (m) => { if (/Content Security|Uncaught/i.test(m.text())) errs.push(m.text()); });
const tok = Buffer.from('{"alg":"HS256"}').toString("base64url") + "." + Buffer.from(JSON.stringify({ sub: "u1", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url") + ".sig";
await p.addInitScript((t) => { sessionStorage.setItem("sb-immvxirnxumsvjelbmum-auth-token", JSON.stringify({ access_token: t, refresh_token: "r", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: "bearer", user: { id: "u1", email: "tes@contoh.id", aud: "authenticated", role: "authenticated" } })); localStorage.setItem("sp_toured", "1"); }, tok);
await p.route("**/*", (route) => { const url = route.request().url(), u = new URL(url);
  if (url.startsWith(base)) return route.continue();
  if (u.hostname.endsWith("supabase.co")) { if (u.pathname.includes("/auth/v1/user")) return route.fulfill({ json: { id: "u1", email: "tes@contoh.id", aud: "authenticated", role: "authenticated" } });
    if (u.pathname.includes("/rpc/sp_request_access")) return route.fulfill({ json: { user_id: "u1", email: "tes@contoh.id", status: "approved", role: "user" } });
    if (u.pathname.includes("/functions/v1/")) return route.fulfill({ json: api(u), headers: { "access-control-allow-origin": "*" } });
    return route.fulfill({ status: route.request().method() === "GET" ? 200 : 201, json: [] }); }
  return route.fulfill({ status: 404, body: "" }); });
const check = (c, msg) => { if (!c) { errs.push("GAGAL: " + msg); } };
await p.goto(base + "?s=BBCA.JK"); await p.waitForTimeout(15000);
check(await p.evaluate(() => !document.getElementById("out").hidden), "hasil analisis tampil");
await p.fill("#cmdQ", "AUTO"); await p.press("#cmdQ", "Enter"); await p.waitForTimeout(1500);
check(await p.evaluate(() => !document.getElementById("apPane").hidden), "tab Autopilot terbuka");
await p.click('[data-apadd="BTC-USD"]'); await p.click("#apNow"); await p.waitForTimeout(20000);
check(await p.evaluate(() => /BTC-USD/.test(document.getElementById("apTable").innerText)), "autopilot menganalisis BTC-USD");
await b.close(); srv.close();
if (errs.length) { console.error(errs.join("\n")); process.exit(1); } console.log("smoke OK");
