/* Play: class games in the Cinnabar shell. games/play/index.html is built from vendor/cesium. */
"use strict";
const CE_SKIN = `@font-face { font-family: "Mercury Sans"; src: url("../../fonts/mercurysans.otf") format("opentype"); font-weight: 100 900; font-display: swap; }
aside[class*="w-[240px]"], div.sticky.top-0[class*="lg:hidden"], div.fixed.inset-0.bg-black[aria-hidden] { display: none !important; }
:root { --color-ink: transparent; --color-panel: rgba(34, 22, 19, .72); --color-panel-2: rgba(46, 30, 26, .8); --color-line: #cdb3aa; --color-muted: #a99893;
  --color-cs: #e2361f; --color-cs-bright: #f0502f; --color-cs-soft: #ff9b7e; --color-cs-deep: #8e1407; }
html, body, #root { background: transparent !important; }`;
(async () => {
  const UI = await hubBoot("Play");
  UI.main.classList.add("full");
  const path = /^#\/[\w/?=&.-]*$/.test(location.hash) ? location.hash : "#/";   // deep links: play.html#/classes/<id>
  const f = cbEl("iframe", { class: "cesium-frame", src: "games/play/index.html" + path, title: "Play", allow: "fullscreen; clipboard-write; autoplay" });
  UI.view.replaceWith(f);
  const name = () => { UI.title.textContent = document.querySelector(".hub-side a.on span")?.textContent || "Play"; };
  name();
  // keep the address in step, so a reload lands on the same Cesium page
  f.addEventListener("load", () => {
    try {
      // Cinnabar's sidebar replaces Cesium's own navigation
      f.contentDocument.head.append(Object.assign(f.contentDocument.createElement("style"), { textContent: CE_SKIN }));
      f.contentWindow.addEventListener("hashchange", () => { history.replaceState(null, "", "#" + f.contentWindow.location.hash.slice(1)); hubMark(); name(); });
    } catch {}
  });
  addEventListener("hashchange", () => { try { if (f.contentWindow.location.hash !== location.hash) f.contentWindow.location.hash = location.hash; } catch {} hubMark(); name(); });
})();
