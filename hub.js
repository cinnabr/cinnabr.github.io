/* Cinnabar hub: the shared sidebar and helpers for Classroom, Forums, Calendar and Games. */
"use strict";
Object.assign(CB_I, {
  school: "M3 9l9-5 9 5-9 5zM7 11v5c0 1.5 2.5 3 5 3s5-1.5 5-3v-5M21 9v6",
  forum: "M4 5h12v9H8l-4 3zM8 14v2h8l4 3V8h-4",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v5M16 3v5",
  game: "M6 9h12a4 4 0 0 1 0 8c-1.5 0-2.5-1-3.5-2h-5C8.5 16 7.5 17 6 17a4 4 0 0 1 0-8zM8 11v3M6.5 12.5h3M15 12h.01M17 13.5h.01",
  megaphone: "M4 10v4h3l7 4V6L7 10zM17 9a4 4 0 0 1 0 6",
  task: "M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2",
  book: "M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h10",
  form: "M7 3h10v18H7zM10 8h4M10 12h4M10 16h2",
  cesium: "M12 3l8 4.5v9L12 21l-8-4.5v-9zM15.5 9.5a4 4 0 1 0 0 5",
  question: "M9 9a3 3 0 1 1 4 2.8c-.6.3-1 .9-1 1.6V15M12 18h.01",
  up: "M12 19V6M6 12l6-6 6 6", pin: "M9 4h6l-1 6 3 3H7l3-3zM12 13v7", lock: "M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3",
  mail: "M3 6h18v12H3zM3 7l9 6 9-6", video: "M4 7h11v10H4zM15 10l5-3v10l-5-3", chat: "M4 5h16v11H9l-5 4zM8 9h8M8 12h5",
  note: "M6 3h9l4 4v14H6zM14 3v5h5M9 13h6M9 17h4", contact: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1-4 4-6 8-6s7 2 8 6",
  send: "M4 12l16-8-6 16-3-7z", left: "M15 6l-6 6 6 6", right: "M9 6l6 6-6 6", people: CB_I.shared, grade: "M5 4h14v16H5zM9 9h6M9 13h6M9 17h3",
});
const HUB_APPS = [["index.html", "drive", "Drive"], ["mail.html", "mail", "Mail"], ["chat.html", "chat", "Chat"], ["meet.html", "video", "Meet"], ["classroom.html", "school", "Classroom"], ["forums.html", "forum", "Forums"], ["calendar.html", "calendar", "Calendar"], ["forms.html", "form", "Forms"], ["games.html", "game", "Games"], ["keep.html", "note", "Keep"], ["tasks.html", "task", "Tasks"], ["contacts.html", "contact", "Contacts"]];
const HUB_OFFICE = [["docs.html", "doc", "Docs"], ["sheets.html", "sheet", "Sheets"], ["slides.html", "slides", "Slides"]];
let HUB_PEOPLE = {};
/* a link back into Cinnabar (same scheme and host, also for quicksilver://cinnabar), or null */
function cbSameSite(u) { try { const x = new URL(u, location.href); return x.protocol === location.protocol && x.host === location.host ? x.href : null; } catch { return null; } }

/* Builds the page shell; resolves with { main, bar, title } after sign-in. */
async function hubBoot(app) {
  cbWave();
  await cbRequireAuth(app);
  document.title = app + " — Cinnabar";
  const side = cbEl("aside", { class: "hub-side" }, cbEl("div", { class: "brand" }, cbLogo()));
  const kind = await hubKind(), edu = await hubEdu();
  const here = location.pathname.split("/").pop() || "index.html";
  const link = (href, icon, name, on, sub) => { const a = cbEl("a", { href, class: (on ? "on " : "") + (sub ? "sub" : "") }); a.innerHTML = icon ? cbIcon(icon) : ""; a.append(cbEl("span", { text: name })); return a; };
  for (const [href, icon, name] of HUB_APPS) {
    if (name === "Classroom") continue;
    if (kind === "work" && name === "Games") continue;
    side.append(link(href, icon, name, name === app));
  }
  if (kind !== "work" && (edu || kind === "student" || kind === "teacher")) side.firstChild.after(await hubSchool(kind === "teacher"));
  const office = cbEl("div", { class: "hub-tiles office" });
  for (const [href, kind, name] of HUB_OFFICE) { const a = cbEl("a", { href, title: name }); a.innerHTML = cbKindIcon(kind); a.append(cbEl("span", { text: name })); office.append(a); }
  side.append(cbEl("div", { class: "cap", text: "Office" }), office);
  const title = cbEl("h1");
  const me = cbEl("button", { class: "avatar me", title: cbUname(CB_USER.email), text: cbName()[0], style: { background: cbColorFor(CB_USER.email) } });
  cbAccountMenu(me);
  const actions = cbEl("div", { style: { display: "flex", gap: "8px" } });
  const bar = cbEl("header", { class: "hub-bar" }, title, cbEl("div", { class: "grow" }), actions, me);
  const main = cbEl("main", { class: "hub-main" }, bar);
  const view = cbEl("div", { class: "anim" }); main.append(view);
  document.body.append(cbEl("div", { class: "hub" }, side, main));
  hubLive(); hubAlerts();
  return { main, view, title, actions };
}
/* Live games (games/play, table ce_live_sessions). When a teacher starts one in a game class,
   every student in that class is taken to it from whichever Cinnabar page they're on, once per game; after that a
   "Live now" button stays in the bar. This only opens the /play/live page. */
const hubLiveUrl = id => `play.html#/play/live/${id}`;
let hubLiveCheck;
function hubLive() {
  let chip;
  hubLiveCheck = async () => {
    if (document.hidden || document.querySelector(".test-guard")) return;   // never pull someone out of a test
    if (!(await hubEdu()) || (await hubKind()) === "teacher") return;
    const { data } = await sb.from("ce_live_sessions").select("id,class_id,status,created_at").in("status", ["lobby", "running"]).order("created_at", { ascending: false }).limit(5);
    chip?.remove(); chip = null;
    const l = data?.[0];
    if (!l || location.hash.includes("/play/live/" + l.id)) return;
    let seen = null;
    try { seen = sessionStorage.getItem("cb-live"); sessionStorage.setItem("cb-live", l.id); } catch { seen = l.id; }   // no storage: never loop, show the button
    if (seen !== l.id) { location.href = hubLiveUrl(l.id); if (location.pathname.endsWith("play.html")) location.reload(); return; }
    chip = cbEl("a", { class: "btn primary live-chip", href: hubLiveUrl(l.id), onclick: () => setTimeout(() => location.reload(), 0) }, cbEl("span", { class: "live-dot" }), cbEl("span", { text: "Live game now" }));
    document.querySelector(".hub-bar .grow")?.after(chip);
  };
  hubLiveCheck();
  setInterval(hubLiveCheck, 15000);
  try { sb.channel("ce-live").on("postgres_changes", { event: "*", schema: "public", table: "ce_live_sessions" }, hubLiveCheck).subscribe(); } catch { }
}
/* The account type chosen at sign-up (db/signup.sql profiles.kind): "student", "teacher", "work", or null for older accounts */
let HUB_KIND;
/* Play tiles, then each class with its tabs */
async function hubSchool(teacher) {
  const box = cbEl("div", { class: "hub-school" }), play = cbEl("div", { class: "hub-tiles" });
  box.append(cbEl("div", { class: "cap", text: "Learn" }), play, cbEl("div", { class: "cap", text: "School" }));
  const here = location.pathname.split("/").pop(), h = location.hash, r = Object.fromEntries(new URLSearchParams(h.slice(1)));
  const link = (href, icon, name, on, sub) => { const a = cbEl("a", { href, class: (on ? "on " : "") + (sub ? "sub" : "") }); if (icon) a.innerHTML = cbIcon(icon); a.append(cbEl("span", { text: name })); return a; };
  let classes = [];
  try {
    const mem = (await sb.from("cr_members").select("class_id,role").eq("user_id", CB_USER.id)).data || [];
    if (mem.length) classes = (await sb.from("cr_classes").select("id,name,color,play_class").in("id", mem.map(m => m.class_id)).order("name")).data || [];
  } catch { }
  for (const c of classes) if (!c.play_class) sb.rpc("cr_play_sync", { p_class: c.id }).then(x => { if (x.data) c.play_class = x.data; }, () => 0);
  for (const c of classes) {
    const open = here === "classroom.html" && r.c === c.id;
    const a = link("classroom.html#c=" + c.id, null, c.name, open && !r.t);
    a.prepend(cbEl("i", { class: "hub-dot", style: { background: c.color || "var(--red)" } }));
    box.append(a);
    const games = here === "play.html" && c.play_class && h.startsWith("#/classes/" + c.play_class);
    if (games) a.classList.add("on");
    if (open || games) {
      for (const [t, n] of [["stream", "Stream"], ["work", "Classwork"], ["people", "People"], ["grades", "Grades"]]) box.append(link(`classroom.html#c=${c.id}&t=${t}`, null, n, open && (r.t || "stream") === t && !!r.t, true));
      box.append(link(c.play_class ? "play.html#/classes/" + c.play_class : "#", null, "Games", games, true));
    }
  }
  box.append(link("classroom.html", "plus", teacher ? "Create a class" : "Join a class", false));
  const ce = (path, icon, name) => link("play.html#" + path, icon, name, here === "play.html" && (path === "/" ? h === "#/" || h === "" : h.startsWith("#" + path)));
  play.append(teacher ? ce("/make", "cesium", "Make") : ce("/join", "cesium", "Join"),
    link("classroom.html", "school", "Classes", here === "classroom.html" && !r.c && !r.a), ce("/grades", "grade", teacher ? "Gradebook" : "Grades"),
    teacher ? ce("/sets", "book", "Sets") : ce("/shop", "star", "Shop"),
    ...(teacher ? [] : [ce("/stuff", "image", "My stuff")]), ce("/chat", "forum", "Chat"));
  return box;
}
function hubKind() { return HUB_KIND ??= Promise.resolve(sb.from("profiles").select("kind").eq("id", CB_USER.id).maybeSingle()).then(r => r.data?.kind || null, () => null); }
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
const hubWho = id => HUB_PEOPLE[id]?.display_name || cbUname(HUB_PEOPLE[id]?.email) || "Someone";
function hubAvatar(id, size) {
  const p = HUB_PEOPLE[id] || {};
  const a = cbEl("span", { class: "avatar", text: (p.display_name || p.email || "?")[0], title: cbUname(p.email), style: { background: cbColorFor(p.email || id || "") } });
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
/* re-highlight sidebar entries after an in-page navigation */
function hubMark() {
  const full = location.pathname.split("/").pop() + location.hash;
  for (const a of document.querySelectorAll(".hub-side a[href]")) { const h = a.getAttribute("href"); a.classList.toggle("on", h.includes("#") ? full.startsWith(h) && (h !== "play.html#/" || full === h) : full.split("#")[0] === h); }
}
/* teachers: a pop-up the moment a student leaves full screen during a quiz or test */
async function hubAlerts() {
  if ((await hubKind()) !== "teacher") return;
  let since = new Date().toISOString();
  const check = async () => {
    const { data } = await sb.from("cr_alerts").select("student,what,at,post_id").gt("at", since).order("at").limit(20);
    if (!data?.length) return;
    since = data.at(-1).at;
    await hubPeople(data.map(a => a.student));
    const posts = (await sb.from("cr_posts").select("id,title").in("id", [...new Set(data.map(a => a.post_id))])).data || [];
    for (const a of data) cbToast(`⚠ ${hubWho(a.student)} ${a.what} during ${posts.find(p => p.id === a.post_id)?.title || "a test"}`, 7000);
  };
  setInterval(() => { if (!document.hidden) check(); }, 5000);
  try { sb.channel("cr-alerts").on("postgres_changes", { event: "INSERT", schema: "public", table: "cr_alerts" }, check).subscribe(); } catch { }
}
