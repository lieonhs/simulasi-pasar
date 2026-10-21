"""Ganti versi aset (?v=...) di index.html supaya browser selalu memuat file terbaru setelah deploy."""
import re, time
v = time.strftime("%Y%m%d%H%M%S")
p = "index.html"; h = open(p, encoding="utf-8").read()
h = re.sub(r'\?v=[^"]*"', f'?v={v}"', h)
h = re.sub(r'window\.APP_V = "[^"]*"', f'window.APP_V = "{v}"', h)
open(p, "w", encoding="utf-8").write(h); print("versi", v)
