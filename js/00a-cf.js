/* RAM Capital · mode server Cloudflare (tanpa Supabase).
   Aktif bila alamat Worker diisi (⚙ Server di layar login, atau ?srv=https://…workers.dev). Menyediakan klien pengganti dengan
   fungsi yang dipakai web dari supabase-js: login lewat Worker (/auth/login), pengaturan & data (sp_settings, sp_data) di IndexedDB browser ini.
   Tanpa sinkronisasi antar perangkat — gunakan Ekspor/Impor cadangan. */
"use strict";
(() => {
  let base = ""; try { const q = new URLSearchParams(location.search).get("srv"); if (q != null) { if (q === "supabase") localStorage.removeItem("sp_srv"); else if (/^https:\/\/[\w.-]+(\/[\w./-]*)?$/.test(q)) localStorage.setItem("sp_srv", q.replace(/\/+$/, "")); }
    base = localStorage.getItem("sp_srv") || ""; } catch { /* */ }
  let mode = "cf"; try { mode = localStorage.getItem("sp_srvmode") || "cf"; } catch { /* */ } // cf = Cloudflare saja · mix = gabung (login & data Supabase, panggilan server Cloudflare → cadangan Supabase)
  if (!base) mode = "";
  window.CF_BASE = mode === "cf" ? base : ""; window.CF_MIX = mode === "mix" ? base : "";
  // ---------- IndexedDB kecil: tabel → baris ----------
  const DB = "ramcap", ST = "rows"; let dbp = null;
  const db = () => (dbp || (dbp = new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(ST); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); })));
  const tx = async (mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction(ST, mode), s = t.objectStore(ST); let out; Promise.resolve(fn(s)).then((v) => (out = v)); t.oncomplete = () => res(out); t.onerror = () => rej(t.error); }); };
  const all = () => tx("readonly", (s) => new Promise((res) => { const L = []; s.openCursor().onsuccess = (e) => { const c = e.target.result; if (c) { L.push([c.key, c.value]); c.continue(); } else res(L); }; }));
  const keyOf = (t, r) => `${t}|${r.user_id || ""}|${r.key || ""}`;
  window.cfBackup = async () => { const L = await all(); return { app: "RAM Capital", at: new Date().toISOString(), rows: L }; };
  window.cfRestore = async (j) => { if (!j || !Array.isArray(j.rows)) throw new Error("Berkas cadangan tidak valid"); await tx("readwrite", (s) => { for (const [k, v] of j.rows) s.put(v, k); }); };
  // ---------- klien pengganti ----------
  window.cfClient = () => {
    const SK = "cf_session", subs = [];
    const load = () => { try { const s = JSON.parse(localStorage.getItem(SK) || "null"); return s && s.expires_at * 1000 > Date.now() ? s : null; } catch { return null; } };
    const emit = (ev, s) => subs.forEach((f) => { try { f(ev, s); } catch { /* */ } });
    const err = (m) => ({ data: { user: null, session: null }, error: { message: m } });
    class Q { constructor(t) { this.t = t; this.f = []; this.one = false; this.up = null; }
      select() { return this; } order() { return this; } eq(k, v) { this.f.push((r) => r[k] === v); return this; } in(k, L) { this.f.push((r) => L.includes(r[k])); return this; } maybeSingle() { this.one = true; return this; }
      upsert(rows) { this.up = Array.isArray(rows) ? rows : [rows]; return this; }
      async run() { const t = this.t;
        if (t === "sp_members") { const s = load(); const rows = s ? [{ user_id: s.user.id, email: s.user.email, status: "approved", role: s.user.role === "owner" ? "admin" : "user", name: s.user.email, requested_at: "" }] : []; return { data: this.one ? rows[0] || null : rows.filter((r) => this.f.every((f) => f(r))), error: null }; }
        if (this.up) { await tx("readwrite", (s) => { for (const r of this.up) s.put({ ...r }, keyOf(t, r)); }); return { data: null, error: null }; }
        const rows = (await all()).filter(([k]) => k.startsWith(t + "|")).map(([, v]) => v).filter((r) => this.f.every((f) => f(r)));
        return { data: this.one ? rows[0] || null : rows, error: null }; }
      then(a, b) { return this.run().then(a, b); } }
    return {
      cf: true,
      from: (t) => new Q(t),
      rpc: async (name, args) => { const s = load(); if (!s) return { data: null, error: { message: "Perlu login" } };
        if (name === "sp_request_access") { let nm = ""; try { nm = localStorage.getItem("cf_name") || ""; } catch { /* */ } return { data: { status: "approved", role: s.user.role === "owner" ? "admin" : "user", email: s.user.email, name: nm, user_id: s.user.id }, error: null }; }
        if (name === "sp_update_profile") { try { localStorage.setItem("cf_name", (args && args.p_name) || ""); } catch { /* */ } return { data: { name: (args && args.p_name) || "" }, error: null }; }
        return { data: null, error: { message: "Tidak tersedia di mode Cloudflare (akun diatur lewat secret APP_USERS di Cloudflare)" } }; },
      auth: {
        getSession: async () => ({ data: { session: load() }, error: null }),
        refreshSession: async () => ({ data: { session: load() }, error: null }), // token berlaku 30 hari, tidak perlu diperbarui
        getUser: async () => { const s = load(); if (!s) return { data: { user: null }, error: null };
          try { const r = await fetch(base + "/auth/me", { headers: { Authorization: "Bearer " + s.access_token } }); if (r.status === 401) { localStorage.removeItem(SK); return { data: { user: null }, error: null }; } } catch { /* offline: anggap masih berlaku */ }
          return { data: { user: s.user }, error: null }; },
        signInWithPassword: async ({ email, password }) => { try { const r = await fetch(base + "/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) }); const j = await r.json().catch(() => ({}));
            if (!r.ok) return err(r.status === 401 ? "Invalid login credentials" : j.error || `Server ${r.status}`);
            const s = { access_token: j.access_token, expires_at: j.expires_at, user: { ...j.user, user_metadata: {} } }; localStorage.setItem(SK, JSON.stringify(s)); return { data: { session: s, user: s.user }, error: null }; }
          catch (e) { return err("Server Cloudflare tidak bisa dihubungi: " + (e.message || e)); } },
        signUp: async () => err("Pendaftaran tidak tersedia di mode Cloudflare. Pemilik menambahkan akun lewat secret APP_USERS."),
        resetPasswordForEmail: async () => err("Atur ulang password tidak tersedia di mode Cloudflare. Buat entri akun baru lalu ganti di secret APP_USERS."),
        updateUser: async () => err("Tidak tersedia di mode Cloudflare"),
        signOut: async () => { try { localStorage.removeItem(SK); } catch { /* */ } emit("SIGNED_OUT", null); return { error: null }; },
        onAuthStateChange: (cb) => { subs.push(cb); return { data: { subscription: { unsubscribe() { const i = subs.indexOf(cb); if (i >= 0) subs.splice(i, 1); } } } }; },
      },
    };
  };
  // ---------- layar login: pilih server & buat entri akun ----------
  const hexOf = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
  async function makeEntry() { const email = (prompt("Email akun:") || "").trim().toLowerCase(); if (!email) return; const pw = prompt("Password (min. 10 karakter):") || ""; if (pw.length < 10) { alert("Password minimal 10 karakter."); return; }
    const salt = crypto.getRandomValues(new Uint8Array(16)), k = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
    const hash = hexOf(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 10000 }, k, 256)), role = confirm("Jadikan PEMILIK (akses Indodax/Binance/admin)? OK = pemilik, Batal = pengguna biasa") ? "owner" : "user";
    prompt("Salin entri ini ke secret APP_USERS (gabungkan beberapa akun di dalam [ … ], dipisah koma). Password aslinya TIDAK tersimpan di sini:", JSON.stringify([{ email, salt: hexOf(salt), hash, role }])); }
  function tokenSecret() { prompt("TOKEN_SECRET acak (salin ke secret TOKEN_SECRET di Cloudflare, sekali saja):", hexOf(crypto.getRandomValues(new Uint8Array(32)))); }
  function setServer(m) { const v = prompt("Alamat server Cloudflare Worker (mis. https://ram-capital.namamu.workers.dev). Kosongkan untuk kembali ke Supabase:", base || ""); if (v == null) return;
    const u = v.trim().replace(/\/+$/, ""); if (u && !/^https:\/\/[\w.-]+(\/[\w./-]*)?$/.test(u)) { alert("Alamat harus diawali https://"); return; }
    try { if (u) { localStorage.setItem("sp_srv", u); localStorage.setItem("sp_srvmode", m === "mix" ? "mix" : "cf"); } else localStorage.removeItem("sp_srv"); } catch { /* */ } location.reload(); }
  function setMode() { const v = prompt("Mode server:\n1 = Supabase saja\n2 = Cloudflare saja (login & data di browser ini)\n3 = Gabung: login & data tetap Supabase, panggilan data ke Cloudflare, otomatis pindah ke Supabase bila Cloudflare gagal/kena batas", mode === "mix" ? "3" : mode === "cf" ? "2" : "1"); if (v == null) return;
    const m = { 1: "", 2: "cf", 3: "mix" }[v.trim()]; if (m === undefined) return; if (m && !base) { setServer(m); return; } try { if (m) localStorage.setItem("sp_srvmode", m); else localStorage.removeItem("sp_srv"); } catch { /* */ } location.reload(); }
  const wire = () => { const el = document.getElementById("srvBox"); if (!el) return; const nm = mode === "mix" ? "Gabung (Supabase + Cloudflare)" : mode === "cf" ? "Cloudflare" : "Supabase";
    el.innerHTML = `Server: <b>${nm}</b> · <a href="#" data-srv="mode">ganti mode</a>` + (base ? ` · <a href="#" data-srv="set">alamat Worker</a> · <a href="#" data-srv="acc">buat entri akun</a> · <a href="#" data-srv="tok">buat TOKEN_SECRET</a>` : "");
    el.onclick = (e) => { const a = e.target.closest("[data-srv]"); if (!a) return; e.preventDefault(); ({ mode: setMode, set: () => setServer(mode || "cf"), acc: makeEntry, tok: tokenSecret })[a.dataset.srv](); }; };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire); else wire();
})();
