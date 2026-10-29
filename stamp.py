"""Versi aset per file (?v=hash isi file). Browser hanya mengunduh ulang file yang benar-benar berubah setelah deploy."""
import re, hashlib, os
def hv(path):
    try: return hashlib.md5(open(path, "rb").read()).hexdigest()[:10]
    except FileNotFoundError: return None
p = "index.html"; h = open(p, encoding="utf-8").read()
def sub(m):
    attr, path = m.group(1), m.group(2); v = hv(path)
    return f'{attr}="{path}?v={v}"' if v else m.group(0)
h = re.sub(r'(src|href)="([^"?:]+\.(?:js|css))\?v=[^"]*"', sub, h)
wv = hashlib.md5((open("worker.js", "rb").read() + open("engine.js", "rb").read())).hexdigest()[:10]
h = re.sub(r'<meta name="app-v" content="[^"]*">', f'<meta name="app-v" content="{wv}">', h)
open(p, "w", encoding="utf-8").write(h); print("versi per file diperbarui · worker", wv)
