/* Cinnabar hub: the shared sidebar and helpers for Classroom, Forums, Calendar and Games. */
"use strict";
Object.assign(CB_I, {
  school: "M3 9l9-5 9 5-9 5zM7 11v5c0 1.5 2.5 3 5 3s5-1.5 5-3v-5M21 9v6",
  forum: "M4 5h12v9H8l-4 3zM8 14v2h8l4 3V8h-4",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v5M16 3v5",
  cesium: "M12 3l8 4.5v9L12 21l-8-4.5v-9zM15.5 9.5a4 4 0 1 0 0 5",
  game: "M6 9h12a4 4 0 0 1 0 8c-1.5 0-2.5-1-3.5-2h-5C8.5 16 7.5 17 6 17a4 4 0 0 1 0-8zM8 11v3M6.5 12.5h3M15 12h.01M17 13.5h.01",
  megaphone: "M4 10v4h3l7 4V6L7 10zM17 9a4 4 0 0 1 0 6",
  task: "M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2",
  book: "M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h10",
  question: "M9 9a3 3 0 1 1 4 2.8c-.6.3-1 .9-1 1.6V15M12 18h.01",
  up: "M12 19V6M6 12l6-6 6 6", pin: "M9 4h6l-1 6 3 3H7l3-3zM12 13v7", lock: "M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3",
  send: "M4 12l16-8-6 16-3-7z", left: "M15 6l-6 6 6 6", right: "M9 6l6 6-6 6", people: CB_I.shared, grade: "M5 4h14v16H5zM9 9h6M9 13h6M9 17h3",
});
const HUB_APPS = [["index.html", "drive", "Drive"], ["classroom.html", "school", "Classroom"], ["forums.html", "forum", "Forums"], ["calendar.html", "calendar", "Calendar"], ["forms.html", "task", "Forms"], ["cesium.html", "cesium", "Cesium"], ["games.html", "game", "Games"]];
const HUB_OFFICE = [["docs.html", "doc", "Docs"], ["sheets.html", "sheet", "Sheets"], ["slides.html", "slides", "Slides"]];
let HUB_PEOPLE = {};

/* Builds the page shell; resolves with { main, bar, title } after sign-in. */
async function hubBoot(app) {
  cbWave();
  await cbRequireAuth(app);
  document.title = app + " — Cinnabar";
  const side = cbEl("aside", { class: "hub-side" }, cbEl("div", { class: "brand" }, cbLogo()));
  const edu = await hubEdu();
  for (const [href, icon, name] of HUB_APPS) {
    if (href === "cesium.html" && !edu && app !== "Cesium") continue;   // Cesium is for school accounts
    const a = cbEl("a", { href, class: name === app ? "on" : "" }); a.innerHTML = cbIcon(icon); a.append(cbEl("span", { text: name })); side.append(a);
  }
  side.append(cbEl("div", { class: "cap", text: "Office" }));
  for (const [href, kind, name] of HUB_OFFICE) { const a = cbEl("a", { href }); a.innerHTML = cbKindIcon(kind); a.append(cbEl("span", { text: name })); side.append(a); }
  const title = cbEl("h1");
  const me = cbEl("button", { class: "avatar me", title: CB_USER.email, text: cbName()[0], style: { background: cbColorFor(CB_USER.email) } });
  me.onclick = e => cbMenuAt(e.currentTarget, [{ label: CB_USER.email, icon: "shared", run() {} }, "-", { label: "Sign out", icon: "logout", run: cbSignOut }]);
  const actions = cbEl("div", { style: { display: "flex", gap: "8px" } });
  const bar = cbEl("header", { class: "hub-bar" }, title, cbEl("div", { class: "grow" }), actions, me);
  const main = cbEl("main", { class: "hub-main" }, bar);
  const view = cbEl("div", { class: "anim" }); main.append(view);
  document.body.append(cbEl("div", { class: "hub" }, side, main));
  return { main, view, title, actions };
}
/* Is this a school (edu) account? db/schema.sql profiles.edu; false when unknown */
let HUB_EDU;
function hubEdu() {
  return HUB_EDU ??= Promise.resolve(sb.from("profiles").select("edu").eq("id", CB_USER.id).maybeSingle()).then(r => r.data?.edu === true, () => false);
}
/* Fresh content area, so the entrance animation plays again */
function hubView(view) { const v = cbEl("div", { class: "anim" }); view.replaceWith(v); return v; }
async function hubPeople(ids) {
  const need = [...new Set(ids)].filter(i => i && !HUB_PEOPLE[i]);
  if (need.length) Object.assign(HUB_PEOPLE, await cbFiles.profiles(need));
  return HUB_PEOPLE;
}
const hubWho = id => HUB_PEOPLE[id]?.display_name || HUB_PEOPLE[id]?.email || "Someone";
function hubAvatar(id, size) {
  const p = HUB_PEOPLE[id] || {};
  const a = cbEl("span", { class: "avatar", text: (p.display_name || p.email || "?")[0], title: p.email || "", style: { background: cbColorFor(p.email || id || "") } });
  if (size) Object.assign(a.style, { width: size + "px", height: size + "px", fontSize: Math.round(size * .38) + "px" });
  return a;
}
function hubGlyph(icon, color) { const g = cbEl("span", { class: "glyph", style: { background: color } }); g.innerHTML = cbIcon(icon); return g; }
function hubEmpty(icon, title, text, button) {
  const e = cbEl("div", { class: "empty-art" }, cbEl("div", { class: "ring", html: cbIcon(icon) }), cbEl("b", { text: title }), cbEl("div", { text }));
  if (button) e.append(button);
  return e;
}
const hubErr = e => cbToast(e.message || String(e), 4200);
/* `datetime-local` value <-> ISO */
const hubLocal = iso => { if (!iso) return ""; const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const hubISO = v => v ? new Date(v).toISOString() : null;
const hubWhen = iso => new Date(iso).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
/* Form dialog: fields = [{ key, label, type, value, options, required }]; resolves with an object or null */
function hubForm(title, fields, ok = "Save", extra = []) {
  const body = cbEl("div"); const inputs = {};
  for (const f of fields) {
    let i;
    if (f.type === "textarea") i = cbEl("textarea", { class: "field", rows: f.rows || 5 });
    else if (f.type === "select") { i = cbEl("select", { class: "field" }); for (const [v, t] of f.options) i.append(cbEl("option", { value: v, text: t })); }
    else i = cbEl("input", { class: "field", type: f.type || "text", placeholder: f.placeholder || "" });
    if (f.value != null) i.value = f.value;
    inputs[f.key] = i;
    body.append(cbEl("label", { class: "lbl", text: f.label }), i);
  }
  return cbDialog(title, body, [...extra, { label: "Cancel", result: null }, { label: ok, cls: "primary", value: () => {
    const out = {};
    for (const f of fields) {
      const v = inputs[f.key].value.trim();
      if (f.required && !v) { cbToast(f.label + " is required"); inputs[f.key].focus(); return undefined; }
      out[f.key] = v || null;
    }
    return out;
  } }]);
}
const HUB_COLORS = ["#e2361f", "#ff7a1a", "#d6457a", "#7a4fd1", "#2f7fd8", "#1f9a8a", "#3d9a3f", "#b07a1a", "#5d6670"];
