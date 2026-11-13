/* Quicksilver integration — loaded only in the copy of Cinnabar bundled with the Quicksilver browser.
 * Reports the signed-in account to the browser and drives its first-run setup's "Sign in with Cinnabar" step. */
"use strict";
(() => {
  const params = new URLSearchParams(location.search);
  const setup = params.get("from") === "setup";
  const WELCOME = "quicksilver://app/welcome/welcome.html";
  CB_HOOKS.user = u => {
    try { window.webkit?.messageHandlers?.qsCinnabar?.postMessage(JSON.stringify({ account: u ? { name: cbName(u), email: cbUname(u.email) } : null })); } catch (e) { /* not in Quicksilver */ }
  };
  if (!setup) return;
  CB_HOOKS.initialMode = params.get("mode") === "signup" ? "up" : "in";
  CB_HOOKS.title = "Sign in to Quicksilver with Cinnabar";
  CB_HOOKS.afterAuth = () => { location.replace(WELCOME + "#signedin"); return true; };
  CB_HOOKS.links = links => links.append(cbEl("a", { href: WELCOME + "#step=search", text: "Skip for now" }));
})();
