#!/usr/bin/env python3
"""Membuat kode Cloudflare Worker dari fungsi Supabase (satu sumber kebenaran: supabase/functions/*/index.ts).
Penggantian: Deno.env.get → ENV, pengecekan login Supabase → checkUser Worker, Deno.serve → export default.
Jalankan: python3 tools/gen-worker.py  (GitHub Actions menjalankannya otomatis sebelum deploy)."""
import pathlib, re, sys
root = pathlib.Path(__file__).resolve().parent.parent
FN = ["market-data", "indodax-menu", "holders", "binance-fut", "video-eye"]
out = root / "worker" / "src" / "fn"; out.mkdir(parents=True, exist_ok=True)
for name in FN:
    s = (root / "supabase" / "functions" / name / "index.ts").read_text()
    n0 = s.count("Deno.serve(")
    assert n0 == 1, f"{name}: Deno.serve harus tepat satu"
    s = s.replace("async function checkUser(", "async function checkUser_supabase(")
    s = s.replace("Deno.env.get(", "ENV(")
    s = s.replace("Deno.serve(", "export default (")
    s = '// DIBUAT OTOMATIS oleh tools/gen-worker.py dari supabase/functions/%s/index.ts — jangan diedit langsung.\nimport { ENV, checkUser } from "../auth";\n' % name + s
    (out / f"{name}.ts").write_text(s)
    print("ok", name, len(s))
