// Dimuat paling awal. Tema tanpa kedip, versi worker, dan pertahanan clickjacking (web tidak boleh dibungkus iframe situs lain).
(function () {
  try { var t = localStorage.getItem("sp_theme2"); if (t === "pro" || t === "light" || t === "terminal") document.documentElement.setAttribute("data-theme", t); } catch (e) { /* */ }
  try { var m = document.querySelector('meta[name="app-v"]'); window.APP_V = (m && m.content) || ""; } catch (e) { window.APP_V = ""; }
  if (window.top !== window.self) { document.documentElement.style.display = "none"; try { window.top.location = window.self.location.href; } catch (e) { /* */ } }
})();
