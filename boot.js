// Dimuat paling awal. Tema tanpa kedip, versi aplikasi, dan pertahanan clickjacking (web tidak boleh dibungkus iframe situs lain).
(function () {
  try { var t = localStorage.getItem("sp_theme2"); if (t === "pro" || t === "light" || t === "terminal") document.documentElement.setAttribute("data-theme", t); } catch (e) { /* */ }
  try { var m = (document.currentScript && document.currentScript.src.match(/[?&]v=(\d+)/)) || []; window.APP_V = m[1] || ""; } catch (e) { window.APP_V = ""; }
  if (window.top !== window.self) { document.documentElement.style.display = "none"; try { window.top.location = window.self.location.href; } catch (e) { /* */ } }
})();
