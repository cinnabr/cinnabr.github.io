/* Cesium inside Cinnabar: the class game platform, in the Cinnabar shell with the same sign-in.
   The app itself (games/cesium/index.html, built from vendor/cesium) checks for a school account and does the rest. */
"use strict";
(async () => {
  const UI = await hubBoot("Cesium");
  UI.main.classList.add("full");
  const path = /^#\/[\w/?=&.-]*$/.test(location.hash) ? location.hash : "#/";   // deep links: cesium.html#/classes/<id>
  const f = cbEl("iframe", { class: "cesium-frame", src: "games/cesium/index.html" + path, title: "Cesium", allow: "fullscreen; clipboard-write; autoplay" });
  UI.view.replaceWith(f);
  // keep the address in step, so a reload lands on the same Cesium page
  f.addEventListener("load", () => { try { f.contentWindow.addEventListener("hashchange", () => history.replaceState(null, "", "#" + f.contentWindow.location.hash.slice(1))); } catch {} });
})();
