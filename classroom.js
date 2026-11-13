/* Cinnabar Classroom: classes, stream, classwork, submissions and grading, people, gradebook, attendance. */
"use strict";
let UI, classes = [], roles = {};
const KIND = {
  announcement: { icon: "megaphone", name: "Announcement", color: "#e2361f" },
  assignment: { icon: "task", name: "Assignment", color: "#ff7a1a" },
  material: { icon: "book", name: "Material", color: "#2f7fd8" },
  question: { icon: "question", name: "Question", color: "#7a4fd1" },
  game: { icon: "game", name: "Game", color: "#1f9a8a" },
  quiz: { icon: "form", name: "Quiz", color: "#d6457a" },
};
const GRADED = ["assignment", "game", "quiz"];
const GAMES = [["blitz", "Math Blitz"], ["snake", "Ember Snake"], ["type", "Type Sprint"]];   // games.js; their score is the grade, capped at the points
const q = async p => { const { data, error } = await p; if (error) throw new Error(error.message); return data; };
const route = () => Object.fromEntries(new URLSearchParams(location.hash.slice(1)));
const go = h => { location.hash = new URLSearchParams(h).toString(); };

async function loadClasses() {
  const mem = await q(sb.from("cr_members").select("class_id,role").eq("user_id", CB_USER.id));
  roles = Object.fromEntries(mem.map(m => [m.class_id, m.role]));
  classes = mem.length ? await q(sb.from("cr_classes").select("*").in("id", mem.map(m => m.class_id)).order("created_at")) : [];
  // class codes last one day: a teacher's stale code is swapped for today's
  for (const c of classes) if (roles[c.id] === "teacher" && c.code_at && Date.now() - new Date(c.code_at) > 864e5) { const k = (await sb.rpc("cr_code", { p_class: c.id })).data; if (k) { c.code = k; c.code_at = new Date().toISOString(); } }
}
const teacher = c => roles[c] === "teacher";
const cls = id => classes.find(c => c.id === id);

async function render() {
  const r = route();
  UI.actions.innerHTML = "";
  try {
    if (r.a) return await renderPost(r.a);
    if (r.c && cls(r.c)) return await renderClass(cls(r.c), r.t || "stream");
    return await renderHome();
  } catch (e) { hubErr(e); }
}

/* ── home: class tiles ──────────────────────────────────────────────────── */
async function renderHome() {
  UI.title.textContent = "Classroom";
  const v = UI.view = hubView(UI.view);
  const kind = await hubKind();
  if (kind === "work") { v.append(hubEmpty("school", "Classroom isn't part of work accounts", "Use Docs, Sheets, Slides, Forms, Forums and Calendar.")); return; }
  if (kind !== "teacher") UI.actions.append(cbEl("button", { class: kind === "student" ? "btn primary" : "btn", text: "Join a class", onclick: joinClass }));
  if (kind !== "student") UI.actions.append(cbEl("button", { class: "btn primary", text: "Create a class", onclick: createClass }));
  const live = classes.filter(c => !c.archived);
  // due soon, across every class I'm a student in
  const studentIn = live.filter(c => !teacher(c.id)).map(c => c.id);
  if (studentIn.length) {
    const due = await q(sb.from("cr_posts").select("id,class_id,title,due_at").in("class_id", studentIn).eq("kind", "assignment").gte("due_at", new Date().toISOString()).order("due_at").limit(6));
    if (due.length) {
      const strip = cbEl("div", { class: "tiles", style: { gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", marginBottom: "18px" } });
      for (const d of due) strip.append(cbEl("button", { class: "post click", onclick: () => go({ a: d.id }) },
        cbEl("div", { class: "head" }, hubGlyph("task", cls(d.class_id)?.color || "#ff7a1a"), cbEl("div", { class: "who" }, cbEl("b", { text: d.title || "Assignment" }), cbEl("span", { text: "Due " + hubWhen(d.due_at) })))));
      v.append(cbEl("div", { class: "cap", text: "Due soon", style: { padding: "6px 2px" } }), strip);
    }
  }
  const tiles = cbEl("div", { class: "tiles" });
  for (const c of live) tiles.append(classTile(c));
  if (kind !== "student") tiles.append(cbEl("button", { class: "tile add", onclick: createClass, html: cbIcon("plus") + "<span>Create a class</span>" }));
  if (kind !== "teacher") tiles.append(cbEl("button", { class: "tile add", onclick: joinClass, html: cbIcon("school") + "<span>Join with a code</span>" }));
  v.append(tiles);
  const old = classes.filter(c => c.archived);
  if (old.length) { const t = cbEl("div", { class: "tiles" }); old.forEach(c => t.append(classTile(c))); v.append(cbEl("div", { class: "cap", text: "Archived", style: { padding: "22px 2px 6px" } }), t); }
}
function classTile(c) {
  const t = cbEl("button", { class: "tile", onclick: () => go({ c: c.id }) });
  const ban = cbEl("div", { class: "ban", style: { background: `linear-gradient(135deg, ${c.color}, ${c.color}bb)` } }, cbEl("b", { text: c.name }), cbEl("span", { text: [c.section, c.subject].filter(Boolean).join(" · ") || (teacher(c.id) ? "You teach this class" : "Student") }));
  t.append(ban, cbEl("div", { class: "body" }, cbEl("span", { text: c.room ? "Room " + c.room : "" }), cbEl("span", { text: teacher(c.id) ? `Today's code ${c.code}` : "" })));
  t.append(cbEl("span", { class: "big-ico", text: c.name[0].toUpperCase(), style: { top: "56px", bottom: "auto", background: c.color } }));
  return t;
}
async function createClass() {
  const f = await hubForm("Create a class", [
    { key: "name", label: "Class name", required: true }, { key: "section", label: "Section" }, { key: "subject", label: "Subject" }, { key: "room", label: "Room" },
    { key: "color", label: "Colour", type: "select", options: HUB_COLORS.map((c, i) => [c, ["Cinnabar", "Orange", "Rose", "Violet", "Blue", "Teal", "Green", "Bronze", "Slate"][i]]) },
  ], "Create");
  if (!f) return;
  try {
    const c = await q(sb.from("cr_classes").insert(f).select().single());
    await loadClasses(); cbToast(`Class created. Students join with code ${c.code}`); go({ c: c.id });
  } catch (e) { hubErr(e); }
}
async function joinClass() {
  const code = await cbPrompt("Join a class", "", "Today's 4-letter code from your teacher");
  if (!code) return;
  try { const id = await q(sb.rpc("cr_join", { p_code: code })); if (!id) return cbToast("No class has that code today. Codes change every day, so ask your teacher for today's."); await loadClasses(); hubLiveCheck?.(); cbToast("You joined " + (cls(id)?.name || "the class")); go({ c: id }); }
  catch (e) { hubErr(e); }
}

/* ── a class ───────────────────────────────────────────────────────────── */
async function renderClass(c, tab) {
  const t = teacher(c.id);
  UI.title.innerHTML = "";
  UI.title.append(cbEl("span", { class: "crumb", text: "Classroom", onclick: () => go({}) }), cbEl("span", { class: "muted", text: "›" }), cbEl("span", { text: c.name }));
  UI.actions.append(cbEl("button", { class: "icon-btn", title: "Class settings", html: cbIcon("more"), onclick: e => classMenu(e.currentTarget, c) }));
  const v = UI.view = hubView(UI.view);
  const ban = cbEl("div", { class: "cbanner", style: { background: `linear-gradient(120deg, ${c.color}, ${c.color}99 60%, #1a0f0c)` } }, cbEl("h2", { text: c.name }), cbEl("p", { text: [c.section, c.subject, c.room && "Room " + c.room].filter(Boolean).join(" · ") }));
  if (t) ban.append(cbEl("div", { class: "code", title: "Copy class code", onclick: () => { navigator.clipboard.writeText(c.code).catch(() => 0); cbToast("Class code copied"); } }, cbEl("small", { text: "Today's code" }), cbEl("span", { text: c.code })));
  v.append(ban);
  await liveBar(c, t, v);
  const tabs = cbEl("div", { class: "tabs" });
  const names = [["stream", "Stream"], ["work", "Classwork"], ["people", "People"], t && ["grades", "Grades"], t && ["attendance", "Attendance"], !t && ["mine", "My grades"]].filter(Boolean);
  for (const [k, n] of names) tabs.append(cbEl("button", { class: k === tab ? "on" : "", text: n, onclick: () => go({ c: c.id, t: k }) }));
  v.append(tabs);
  const body = cbEl("div", { class: "anim" }); v.append(body);
  await ({ stream: tabStream, work: tabWork, people: tabPeople, grades: tabGrades, attendance: tabAttendance, mine: tabMine }[tab] || tabStream)(c, body);
}
/* Live: the teacher starts a game or quiz and every student in the class is taken straight to it (hub.js hubLive). */
async function liveBar(c, t, v) {
  const live = (await sb.from("cr_live").select("*,post:cr_posts(kind,game,form_id)").eq("class_id", c.id).gt("started_at", new Date(Date.now() - HUB_LIVE_MS).toISOString()).maybeSingle()).data;
  if (t) UI.actions.prepend(live
    ? cbEl("button", { class: "btn", text: "End live", onclick: async () => { await q(sb.from("cr_live").delete().eq("class_id", c.id)).catch(hubErr); cbToast("Live activity ended"); render(); } })
    : cbEl("button", { class: "btn primary", text: "Go live", onclick: () => goLive(c) }));
  if (!live) return;
  v.append(cbEl("div", { class: "live-bar" }, cbEl("span", { class: "live-dot" }), cbEl("b", { text: "Live now" }), cbEl("span", { class: "grow", text: live.title }),
    t ? cbEl("span", { class: "muted", text: "Your students were taken to it." }) : cbEl("a", { class: "btn primary", href: hubLiveUrl(live), text: "Join" })));
}
async function goLive(c) {
  const posts = await q(sb.from("cr_posts").select("id,kind,title,game").eq("class_id", c.id).in("kind", ["game", "quiz"]).order("created_at", { ascending: false }));
  const f = await hubForm("Go live", [{ key: "what", label: "Everyone in the class is taken to", type: "select",
    options: [...posts.map(p => ["p:" + p.id, `${p.title || KIND[p.kind].name} (${p.kind}, graded)`]), ...GAMES.map(([id, n]) => ["g:" + id, n + " (game, just for fun)"])] }], "Start for the whole class");
  if (!f) return;
  const [k, id] = [f.what[0], f.what.slice(2)], p = posts.find(x => x.id === id);
  try {
    await q(sb.from("cr_live").upsert({ class_id: c.id, post_id: k === "p" ? id : null, game: k === "g" ? id : null, title: k === "p" ? p.title || KIND[p.kind].name : GAMES.find(g => g[0] === id)[1], started_by: CB_USER.id, started_at: new Date().toISOString() }));
    cbToast("Live. Your students are being taken to it."); render();
  } catch (e) { hubErr(e); }
}
function classMenu(anchor, c) {
  const t = teacher(c.id);
  cbMenuAt(anchor, [
    t && { label: "Edit class details", icon: "edit", run: async () => {
      const f = await hubForm("Class details", [{ key: "name", label: "Class name", value: c.name, required: true }, { key: "section", label: "Section", value: c.section }, { key: "subject", label: "Subject", value: c.subject }, { key: "room", label: "Room", value: c.room },
        { key: "color", label: "Colour", type: "select", value: c.color, options: HUB_COLORS.map(x => [x, x]) }]);
      if (f) { try { await q(sb.from("cr_classes").update(f).eq("id", c.id)); await loadClasses(); render(); } catch (e) { hubErr(e); } } } },
    t && { label: "New class code", icon: "restore", run: async () => { try { const k = await q(sb.rpc("cr_new_code", { p_class: c.id })); await loadClasses(); cbToast("New code " + k); render(); } catch (e) { hubErr(e); } } },
    t && { label: c.archived ? "Restore class" : "Archive class", icon: "folder", run: async () => { await q(sb.from("cr_classes").update({ archived: !c.archived }).eq("id", c.id)).catch(hubErr); await loadClasses(); render(); } },
    { label: "Class forum", icon: "forum", run: () => { location.href = "forums.html#class=" + c.id; } },
    { label: "Class calendar", icon: "calendar", run: () => { location.href = "calendar.html"; } },
    "-",
    c.owner === CB_USER.id
      ? { label: "Delete class", icon: "trash", danger: true, run: async () => { if (await cbConfirm("Delete " + c.name + "?", "Every post, submission, grade and attendance record in this class is deleted for everyone. This can't be undone.", "Delete")) { await q(sb.from("cr_classes").delete().eq("id", c.id)).catch(hubErr); await loadClasses(); go({}); } } }
      : { label: "Leave class", icon: "logout", danger: true, run: async () => { if (await cbConfirm("Leave " + c.name + "?", "You can join again with that day's class code.", "Leave")) { await q(sb.from("cr_members").delete().eq("class_id", c.id).eq("user_id", CB_USER.id)).catch(hubErr); await loadClasses(); go({}); } } },
  ]);
}

/* stream */
async function tabStream(c, body) {
  const t = teacher(c.id);
  const posts = await q(sb.from("cr_posts").select("*").eq("class_id", c.id).order("created_at", { ascending: false }).limit(100));
  const ids = posts.map(p => p.id);
  const comments = ids.length ? await q(sb.from("cr_comments").select("*").in("post_id", ids).order("created_at")) : [];
  await hubPeople([...posts.map(p => p.author), ...comments.map(x => x.author)]);
  const upcoming = posts.filter(p => p.kind === "assignment" && p.due_at && new Date(p.due_at) > new Date()).sort((a, b) => a.due_at.localeCompare(b.due_at)).slice(0, 4);
  const side = cbEl("div", { class: "stack" }, cbEl("div", { class: "side-card" }, cbEl("h3", { text: "Upcoming" }),
    upcoming.length ? cbEl("div", { class: "stack" }, ...upcoming.map(p => cbEl("a", { href: "#a=" + p.id, style: { textDecoration: "none" } }, cbEl("b", { text: p.title || "Assignment", style: { display: "block" } }), cbEl("span", { class: "muted", style: { fontSize: "12px" }, text: "Due " + hubWhen(p.due_at) })))) : cbEl("span", { class: "muted", text: "Woohoo, nothing due soon!" })));
  if (t) side.append(cbEl("div", { class: "side-card" }, cbEl("h3", { text: "Today's class code" }), cbEl("div", { text: c.code, style: { font: "700 30px var(--display)", letterSpacing: ".16em", color: c.color } }), cbEl("div", { class: "muted", style: { fontSize: "12px" }, text: "Changes every day." })));
  const col = cbEl("div", { class: "stack anim" });
  const compose = cbEl("div", { class: "compose" }, hubAvatar(CB_USER.id), cbEl("span", { text: t ? "Announce something to your class" : "Ask your class a question" }));
  await hubPeople([CB_USER.id]); compose.firstChild.replaceWith(hubAvatar(CB_USER.id));
  compose.onclick = async () => {
    const f = await hubForm(t ? "Announcement" : "Ask a question", [{ key: "body", label: t ? "Message" : "Your question", type: "textarea", required: true }], "Post");
    if (!f) return;
    try { await q(sb.from("cr_posts").insert({ class_id: c.id, kind: t ? "announcement" : "question", body: f.body })); render(); } catch (e) { hubErr(e); }
  };
  col.append(compose);
  if (!posts.length) col.append(hubEmpty("megaphone", "This is where you talk to your class", t ? "Post announcements, schedule assignments and answer questions." : "Announcements and new work from your teachers show up here."));
  for (const p of posts) col.append(postCard(p, comments.filter(x => x.post_id === p.id), c));
  body.append(cbEl("div", { class: "cols" }, side, col));
}
function postCard(p, comments, c) {
  const k = KIND[p.kind];
  const head = cbEl("div", { class: "head" }, p.kind === "announcement" ? hubAvatar(p.author) : hubGlyph(k.icon, c.color),
    cbEl("div", { class: "who" }, cbEl("b", { text: p.kind === "announcement" ? hubWho(p.author) : `${hubWho(p.author)} posted a new ${k.name.toLowerCase()}: ${p.title || ""}` }), cbEl("span", { text: cbAgo(p.created_at) + (p.due_at ? " · Due " + hubWhen(p.due_at) : "") })));
  if (p.author === CB_USER.id || teacher(c.id)) head.append(cbEl("button", { class: "icon-btn", html: cbIcon("more"), title: "More", onclick: e => { e.stopPropagation(); cbMenuAt(e.currentTarget, [
    p.author === CB_USER.id && { label: "Edit", icon: "edit", run: () => editPost(p) },
    { label: "Delete", icon: "trash", danger: true, run: async () => { if (await cbConfirm("Delete this post?", "Comments and any submissions are deleted too.", "Delete")) { await q(sb.from("cr_posts").delete().eq("id", p.id)).catch(hubErr); render(); } } }]); } }));
  const card = cbEl("div", { class: "post" }, head);
  if (p.kind === "announcement" || p.kind === "question") card.append(cbEl("div", { class: "txt", text: p.body }));
  else { card.classList.add("click"); card.onclick = e => { if (!e.target.closest("input,button")) go({ a: p.id }); }; }
  if (p.link) card.append(cbEl("div", { class: "meta" }, cbEl("a", { href: p.link, target: "_blank", rel: "noopener", text: p.link })));
  card.append(commentBox(p, comments, c));
  return card;
}
function commentBox(p, comments, c) {
  const box = cbEl("div", { class: "comments" });
  for (const x of comments) {
    const row = cbEl("div", { class: "c" }, hubAvatar(x.author, 24), cbEl("div", {}, cbEl("b", { text: hubWho(x.author) + " " }), cbEl("span", { class: "muted", style: { fontSize: "11px" }, text: cbAgo(x.created_at) }), cbEl("div", { text: x.body })));
    if (x.author === CB_USER.id || teacher(c.id)) row.append(cbEl("button", { class: "icon-btn", style: { width: "24px", height: "24px" }, title: "Delete comment", html: cbIcon("close"), onclick: async () => { await q(sb.from("cr_comments").delete().eq("id", x.id)).catch(hubErr); row.remove(); } }));
    box.append(row);
  }
  const inp = cbEl("input", { class: "field", placeholder: "Add class comment…" });
  inp.onkeydown = async e => {
    if (e.key !== "Enter" || !inp.value.trim()) return;
    try { await q(sb.from("cr_comments").insert({ post_id: p.id, body: inp.value.trim() })); render(); } catch (ex) { hubErr(ex); }
  };
  box.append(inp);
  return box;
}
async function editPost(p) {
  const f = await hubForm("Edit", [
    p.kind !== "announcement" && p.kind !== "question" && { key: "title", label: "Title", value: p.title, required: true },
    { key: "body", label: "Text", type: "textarea", value: p.body },
    p.kind === "assignment" && { key: "due_at", label: "Due", type: "datetime-local", value: hubLocal(p.due_at) },
    p.kind === "assignment" && { key: "points", label: "Points", type: "number", value: p.points },
    { key: "link", label: "Link (https://…)", value: p.link },
  ].filter(Boolean));
  if (!f) return;
  if (f.due_at !== undefined) f.due_at = hubISO(f.due_at);
  f.body = f.body || "";
  try { await q(sb.from("cr_posts").update(f).eq("id", p.id)); render(); } catch (e) { hubErr(e); }
}

/* classwork */
async function tabWork(c, body) {
  const t = teacher(c.id);
  if (t) body.append(cbEl("div", { style: { display: "flex", gap: "8px", marginBottom: "14px", flexWrap: "wrap" } },
    ...["assignment", "quiz", "game", "material", "question"].map(k => cbEl("button", { class: "btn" + (k === "assignment" ? " primary" : ""), onclick: () => newWork(c, k) }, cbIconEl(KIND[k].icon), cbEl("span", { text: KIND[k].name })))));
  const posts = await q(sb.from("cr_posts").select("*").eq("class_id", c.id).in("kind", ["assignment", "material", "question", "game", "quiz"]).order("created_at", { ascending: false }));
  const mine = !t && posts.length ? await q(sb.from("cr_submissions").select("post_id,turned_in,grade,returned_at").eq("student", CB_USER.id).in("post_id", posts.map(p => p.id))) : [];
  const all = t && posts.length ? await q(sb.from("cr_submissions").select("post_id,turned_in,returned_at").in("post_id", posts.map(p => p.id))) : [];
  const size = t && posts.length ? (await q(sb.from("cr_members").select("user_id").eq("class_id", c.id).eq("role", "student"))).length : 0;
  if (!posts.length) return body.append(hubEmpty("task", "No classwork yet", t ? "Create assignments, share materials and ask questions." : "Your teacher hasn't posted any work yet."));
  const topics = [...new Set(posts.map(p => p.topic || ""))].sort((a, b) => (a === "") - (b === "") || a.localeCompare(b));
  for (const tp of topics) {
    body.append(cbEl("h3", { text: tp || "No topic", style: { font: "600 18px var(--display)", color: c.color, margin: "18px 0 8px", paddingBottom: "6px", borderBottom: "1px solid var(--line)" } }));
    const grid = cbEl("div", { class: "stack anim" });
    for (const p of posts.filter(x => (x.topic || "") === tp)) {
      const s = mine.find(m => m.post_id === p.id);
      const state = !GRADED.includes(p.kind) || t ? null : s?.returned_at ? ["green", s.grade != null ? `${s.grade}${p.points ? "/" + p.points : ""}` : "Returned"] : s?.turned_in ? ["green", "Turned in"] : p.due_at && new Date(p.due_at) < new Date() ? ["red", "Missing"] : ["amber", "Assigned"];
      const graded = GRADED.includes(p.kind), done = all.filter(x => x.post_id === p.id && (x.turned_in || x.returned_at)).length;
      const tile = cbEl("button", { class: "post click work", style: "--k:" + KIND[p.kind].color, onclick: () => go({ a: p.id }) },
        hubGlyph(KIND[p.kind].icon, KIND[p.kind].color),
        cbEl("div", { class: "who" }, cbEl("small", { text: KIND[p.kind].name }), cbEl("b", { text: p.title || KIND[p.kind].name }), cbEl("span", { class: "muted", text: (p.due_at ? "Due " + hubWhen(p.due_at) : "Posted " + cbAgo(p.created_at)) + (graded && p.points ? ` · ${p.points} points` : "") })),
        t && graded ? cbEl("div", { class: "work-prog", title: `${done} of ${size} done` }, cbEl("b", { text: `${done}/${size}` }), cbEl("span", { class: "muted", text: "done" }), cbEl("div", { class: "fq-bar" }, cbEl("i", { style: { width: (size ? done / size * 100 : 0) + "%", background: KIND[p.kind].color } }))) : null,
        state ? cbEl("span", { class: "chip " + state[0], text: state[1] }) : null);
      grid.append(tile);
    }
    body.append(grid);
  }
}
async function newWork(c, kind) {
  if (kind === "game" || kind === "quiz") return newAuto(c, kind);
  const files = await cbFiles.list({ view: "recent" }).catch(() => []);
  const f = await hubForm("New " + KIND[kind].name.toLowerCase(), [
    { key: "title", label: kind === "question" ? "Question" : "Title", required: true },
    { key: "body", label: "Instructions (optional)", type: "textarea" },
    { key: "topic", label: "Topic (optional)", placeholder: "e.g. Unit 1" },
    kind === "assignment" && { key: "due_at", label: "Due", type: "datetime-local" },
    kind === "assignment" && { key: "points", label: "Points", type: "number", value: 100 },
    { key: "file_id", label: "Attach a Cinnabar file (everyone in the class can view it)", type: "select", options: [["", "None"], ...files.filter(x => x.owner === CB_USER.id).map(x => [x.id, x.title])] },
    { key: "link", label: "Link (optional)", placeholder: "https://…" },
  ].filter(Boolean), "Post");
  if (!f) return;
  f.class_id = c.id; f.kind = kind; f.body = f.body || ""; if ("due_at" in f) f.due_at = hubISO(f.due_at);
  try {
    if (f.file_id) await cbFiles.update(f.file_id, { link_access: "view" });   // class members open it by link
    const p = await q(sb.from("cr_posts").insert(f).select().single());
    if (p.due_at) await q(sb.from("cal_events").insert({ class_id: c.id, title: "Due: " + p.title, starts_at: p.due_at, color: c.color, notes: "classroom:" + p.id })).catch(() => 0);
    go({ a: p.id });
  } catch (e) { hubErr(e); }
}

/* a game or a quiz: graded automatically when the student finishes */
async function newAuto(c, kind) {
  const forms = kind === "quiz" ? await q(sb.from("fm_forms").select("id,title").eq("owner", CB_USER.id).eq("quiz", true).order("updated_at", { ascending: false })) : [];
  if (kind === "quiz" && !forms.length) { if (await cbConfirm("Make a quiz first", "Quizzes are built in Forms. Turn on \"Quiz\" and set the correct answers, then come back.", "Open Forms")) location.href = "forms.html"; return; }
  const f = await hubForm(kind === "game" ? "Assign a game" : "Assign a quiz", [
    kind === "game" ? { key: "game", label: "Game", type: "select", options: GAMES } : { key: "form_id", label: "Quiz (from your Forms)", type: "select", options: forms.map(x => [x.id, x.title]) },
    { key: "title", label: "Title", value: kind === "game" ? "Math Blitz" : forms[0].title, required: true },
    { key: "body", label: "Instructions (optional)", type: "textarea", rows: 3 },
    { key: "topic", label: "Topic (optional)" },
    { key: "due_at", label: "Due", type: "datetime-local" },
    { key: "points", label: kind === "game" ? "Target score (full marks)" : "Points", type: "number", value: kind === "game" ? 30 : 100 },
  ], "Assign");
  if (!f) return;
  Object.assign(f, { class_id: c.id, kind, body: f.body || "", due_at: hubISO(f.due_at), points: f.points == null ? null : Number(f.points) });
  try {
    if (kind === "quiz") await q(sb.from("fm_forms").update({ class_id: c.id }).eq("id", f.form_id));   // only this class may answer it
    const p = await q(sb.from("cr_posts").insert(f).select().single());
    if (p.due_at) await q(sb.from("cal_events").insert({ class_id: c.id, title: "Due: " + p.title, starts_at: p.due_at, color: c.color, notes: "classroom:" + p.id })).catch(() => 0);
    go({ a: p.id });
  } catch (e) { hubErr(e); }
}

/* a single assignment / material / question */
async function renderPost(id) {
  const p = await q(sb.from("cr_posts").select("*").eq("id", id).single());
  const c = cls(p.class_id); if (!c) return go({});
  const t = teacher(c.id);
  UI.title.innerHTML = "";
  UI.title.append(cbEl("span", { class: "crumb", text: c.name, onclick: () => go({ c: c.id, t: "work" }) }), cbEl("span", { class: "muted", text: "›" }), cbEl("span", { text: p.title || KIND[p.kind].name }));
  if (p.author === CB_USER.id) UI.actions.append(cbEl("button", { class: "btn", text: "Edit", onclick: () => editPost(p) }));
  const v = UI.view = hubView(UI.view);
  const comments = await q(sb.from("cr_comments").select("*").eq("post_id", p.id).order("created_at"));
  await hubPeople([p.author, ...comments.map(x => x.author)]);
  const main = cbEl("div", { class: "post" },
    cbEl("div", { class: "head" }, hubGlyph(KIND[p.kind].icon, c.color), cbEl("div", { class: "who" }, cbEl("b", { text: p.title || "", style: { fontSize: "22px", fontFamily: "var(--display)" } }), cbEl("span", { text: `${hubWho(p.author)} · ${cbAgo(p.created_at)}` }))),
    cbEl("div", { class: "meta" }, p.points != null ? cbEl("span", { class: "chip", text: p.points + " points" }) : null, p.due_at ? cbEl("span", { class: "chip amber", text: "Due " + hubWhen(p.due_at) }) : null, p.topic ? cbEl("span", { class: "chip", text: p.topic }) : null),
    p.body ? cbEl("div", { class: "txt", text: p.body }) : null);
  if (p.file_id) main.append(cbEl("div", { class: "meta" }, cbEl("a", { class: "btn", href: "docs.html?id=" + p.file_id, onclick: e => openFile(e, p.file_id), text: "Open attached file" })));
  if (p.link) main.append(cbEl("div", { class: "meta" }, cbEl("a", { href: p.link, target: "_blank", rel: "noopener", text: p.link })));
  main.append(commentBox(p, comments, c));
  const right = cbEl("div", { class: "stack" });
  const grid = cbEl("div", { class: "cols", style: { gridTemplateColumns: "1fr 340px" } }, main, right);
  v.append(grid);
  if (p.kind === "material") right.append(cbEl("div", { class: "side-card" }, cbEl("h3", { text: "Material" }), cbEl("span", { class: "muted", text: "Nothing to hand in." })));
  else if (t) await teacherPanel(p, c, right);
  else if (p.kind === "game" || p.kind === "quiz") await autoPanel(p, c, right);
  else await studentPanel(p, c, right);
}
async function openFile(e, fileId) {
  e.preventDefault();
  try { const f = await cbFiles.get(fileId); location.href = cbFileURL(f); } catch (ex) { hubErr(ex); }
}
async function studentPanel(p, c, right) {
  let s = (await q(sb.from("cr_submissions").select("*").eq("post_id", p.id).eq("student", CB_USER.id)))[0];
  const card = cbEl("div", { class: "side-card" });
  const late = p.due_at && new Date(p.due_at) < new Date();
  const status = s?.returned_at ? ["green", "Returned"] : s?.turned_in ? ["green", "Turned in"] : late ? ["red", "Missing"] : ["amber", "Assigned"];
  card.append(cbEl("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } }, cbEl("h3", { text: p.kind === "question" ? "Your answer" : "Your work", style: { margin: 0 } }), cbEl("span", { class: "chip " + status[0], text: status[1] })));
  if (s?.returned_at && s.grade != null) card.append(cbEl("div", { text: `${s.grade}${p.points ? " / " + p.points : ""}`, style: { font: "700 34px var(--display)", color: c.color, margin: "8px 0" } }));
  if (s?.feedback) card.append(cbEl("div", { class: "post", style: { margin: "8px 0" } }, cbEl("b", { text: "Feedback" }), cbEl("div", { class: "txt", text: s.feedback })));
  const text = cbEl("textarea", { class: "field", rows: 5, placeholder: p.kind === "question" ? "Type your answer" : "Notes or your answer (optional)", disabled: !!s?.turned_in });
  text.value = s?.body || "";
  const files = await cbFiles.list({ view: "drive" }).catch(() => []);
  const pick = cbEl("select", { class: "field", disabled: !!s?.turned_in }, cbEl("option", { value: "", text: "Attach a Cinnabar file…" }), ...files.filter(f => f.kind !== "folder").map(f => cbEl("option", { value: f.id, text: f.title })));
  pick.value = s?.file_id || "";
  card.append(cbEl("label", { class: "lbl", text: "Answer" }), text);
  if (p.kind !== "question") card.append(cbEl("label", { class: "lbl", text: "File" }), pick);
  const btn = cbEl("button", { class: "btn " + (s?.turned_in ? "" : "primary"), style: { width: "100%", marginTop: "12px", height: "38px" }, text: s?.turned_in ? "Unsubmit" : "Turn in" });
  btn.onclick = async () => {
    btn.disabled = true;
    try {
      const turnIn = !s?.turned_in;
      if (turnIn && pick.value) {   // let the teachers open the attached file
        const ts = await q(sb.from("cr_members").select("user_id").eq("class_id", c.id).eq("role", "teacher"));
        const ppl = await hubPeople(ts.map(x => x.user_id));
        for (const x of ts) if (ppl[x.user_id]?.email && x.user_id !== CB_USER.id) await cbFiles.share(pick.value, ppl[x.user_id].email, "viewer");
      }
      const row = { body: text.value, file_id: pick.value || null, turned_in: turnIn };
      s = s ? await q(sb.from("cr_submissions").update(row).eq("id", s.id).select().single()) : await q(sb.from("cr_submissions").insert({ ...row, post_id: p.id }).select().single());
      cbToast(turnIn ? "Turned in" : "Unsubmitted — you can edit and turn in again"); render();
    } catch (e) { hubErr(e); btn.disabled = false; }
  };
  card.append(btn);
  if (s?.submitted_at) card.append(cbEl("div", { class: "muted", style: { fontSize: "12px", marginTop: "6px" }, text: "Turned in " + hubWhen(s.submitted_at) + (p.due_at && s.submitted_at > p.due_at ? " · late" : "") }));
  right.append(card);
}
async function autoPanel(p, c, right) {
  const s = (await q(sb.from("cr_submissions").select("*").eq("post_id", p.id).eq("student", CB_USER.id)))[0];
  const game = p.kind === "game", late = p.due_at && new Date(p.due_at) < new Date();
  const card = cbEl("div", { class: "side-card" }, cbEl("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
    cbEl("h3", { text: game ? "Play" : "Quiz", style: { margin: 0 } }), cbEl("span", { class: "chip " + (s?.grade != null ? "green" : late ? "red" : "amber"), text: s?.grade != null ? "Done" : late ? "Missing" : "Assigned" })));
  if (s?.grade != null) card.append(cbEl("div", { text: `${s.grade}${p.points ? " / " + p.points : ""}`, style: { font: "700 34px var(--display)", color: c.color, margin: "8px 0" } }), cbEl("div", { class: "muted", text: game ? "Your best score counts. Play again to beat it." : "Your best attempt counts." }));
  else card.append(cbEl("p", { class: "muted", text: game ? `Score ${p.points || 100} or more for full marks.` : "Your score is filled in when you hand in the quiz." }));
  const back = encodeURIComponent(location.href);
  card.append(cbEl("a", { class: "btn primary", style: { width: "100%", marginTop: "12px", height: "40px", justifyContent: "center" }, text: game ? (s ? "Play again" : "Play") : (s ? "Open the quiz" : "Start the quiz"),
    href: game ? `games.html#play=${p.game}&post=${p.id}&back=${back}` : `forms.html#f=${p.form_id}&post=${p.id}&back=${back}` }));
  right.append(card);
}
async function teacherPanel(p, c, right) {
  const mem = await q(sb.from("cr_members").select("user_id").eq("class_id", c.id).eq("role", "student"));
  const subs = await q(sb.from("cr_submissions").select("*").eq("post_id", p.id));
  await hubPeople(mem.map(m => m.user_id));
  const turned = subs.filter(s => s.turned_in).length, graded = subs.filter(s => s.returned_at).length;
  right.append(cbEl("div", { class: "side-card", style: { display: "flex", justifyContent: "space-around", textAlign: "center" } },
    ...[[turned, "Turned in"], [mem.length - turned, "Assigned"], [graded, "Graded"]].map(([n, l]) => cbEl("div", {}, cbEl("div", { text: n, style: { font: "700 30px var(--display)" } }), cbEl("div", { class: "muted", style: { fontSize: "12px" }, text: l })))));
  if (!mem.length) right.append(hubEmpty("people", "No students yet", `Share the class code ${c.code}.`));
  for (const m of mem) {
    const s = subs.find(x => x.student === m.user_id);
    const grade = cbEl("input", { class: "field", type: "number", style: { width: "80px", height: "32px" }, placeholder: p.points ? "/" + p.points : "Grade", value: s?.grade ?? "" });
    const fb = cbEl("input", { class: "field", style: { height: "32px" }, placeholder: "Private feedback", value: s?.feedback || "" });
    const ret = cbEl("button", { class: "btn primary", text: s?.returned_at ? "Update" : s ? "Return" : "Grade" });
    ret.onclick = async () => {
      try { await q(sb.rpc("cr_set_grade", { p_post: p.id, p_student: m.user_id, p_grade: grade.value === "" ? null : Number(grade.value), p_feedback: fb.value || null })); cbToast("Returned to " + hubWho(m.user_id)); render(); } catch (e) { hubErr(e); }
    };
    const chip = s?.returned_at ? ["green", "Graded"] : s?.turned_in ? ["green", "Turned in" + (p.due_at && s.submitted_at > p.due_at ? " late" : "")] : ["", "Not turned in"];
    const card = cbEl("div", { class: "post" }, cbEl("div", { class: "head" }, hubAvatar(m.user_id), cbEl("div", { class: "who" }, cbEl("b", { text: hubWho(m.user_id) }), cbEl("span", {}, cbEl("span", { class: "chip " + chip[0], text: chip[1] })))));
    if (s?.body) card.append(cbEl("div", { class: "txt", text: s.body }));
    if (s?.file_id) card.append(cbEl("div", { class: "meta" }, cbEl("a", { href: "#", class: "btn", text: "Open their file", onclick: e => openFile(e, s.file_id) })));
    card.append(cbEl("div", { class: "meta", style: { flexWrap: "nowrap" } }, grade, fb, ret));
    right.append(card);
  }
}

/* people */
async function tabPeople(c, body) {
  const t = teacher(c.id);
  const mem = await q(sb.from("cr_members").select("*").eq("class_id", c.id).order("joined_at"));
  await hubPeople(mem.map(m => m.user_id));
  for (const role of ["teacher", "student"]) {
    const list = mem.filter(m => m.role === role);
    const head = cbEl("div", { style: { display: "flex", alignItems: "center", gap: "10px", margin: "14px 0 10px" } }, cbEl("h3", { text: role === "teacher" ? "Teachers" : `Students (${list.length})`, style: { margin: 0, font: "600 20px var(--display)", color: c.color, flex: 1 } }));
    if (t) head.append(cbEl("button", { class: "btn", text: role === "teacher" ? "Add co-teacher" : "Add student", onclick: async () => {
      const email = await cbPrompt(role === "teacher" ? "Add a co-teacher" : "Add a student", "", "Their Cinnabar username");
      if (email) { try { await q(sb.rpc("cr_add_member", { p_class: c.id, p_email: cbLoginId(email), p_role: role })); render(); } catch (e) { hubErr(e); } }
    } }));
    body.append(head);
    const grid = cbEl("div", { class: "people anim" });
    for (const m of list) {
      const card = cbEl("div", { class: "person" }, hubAvatar(m.user_id, 54), cbEl("b", { text: hubWho(m.user_id) }), cbEl("span", { class: "muted", style: { fontSize: "12px" }, text: "@" + cbUname(HUB_PEOPLE[m.user_id]?.email), style: { fontSize: "12px", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }));
      if (t && m.user_id !== c.owner && m.user_id !== CB_USER.id) card.append(cbEl("button", { class: "icon-btn x", title: "Remove from class", html: cbIcon("close"), onclick: async () => {
        if (await cbConfirm("Remove " + hubWho(m.user_id) + "?", "Their submissions stay until you delete the class.", "Remove")) { await q(sb.from("cr_members").delete().eq("class_id", c.id).eq("user_id", m.user_id)).catch(hubErr); render(); } } }));
      grid.append(card);
    }
    if (!list.length && role === "student") grid.append(cbEl("div", { class: "muted", text: `Students join with the code ${c.code}.` }));
    body.append(grid);
  }
}

/* gradebook: every graded piece of work, student IDs, click a cell to grade, Skyward export and CSV import */
const csvLine = l => l.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",");
function parseCSV(t) {   // RFC 4180-ish: quotes, doubled quotes, commas and newlines inside quotes
  const rows = [[]]; let cur = "", qd = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (qd) { if (ch === '"' && t[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') qd = false; else cur += ch; }
    else if (ch === '"') qd = true; else if (ch === ",") { rows.at(-1).push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && t[i + 1] === "\n") i++; rows.at(-1).push(cur); cur = ""; rows.push([]); }
    else cur += ch;
  }
  rows.at(-1).push(cur); return rows.filter(r => r.some(c => c.trim() !== ""));
}
async function tabGrades(c, body) {
  const work = await q(sb.from("cr_posts").select("id,title,points,due_at,kind").eq("class_id", c.id).in("kind", GRADED).order("created_at"));
  const mem = await q(sb.from("cr_members").select("user_id,student_number").eq("class_id", c.id).eq("role", "student"));
  const subs = work.length ? await q(sb.from("cr_submissions").select("post_id,student,grade,turned_in,returned_at").in("post_id", work.map(w => w.id))) : [];
  await hubPeople(mem.map(m => m.user_id));
  if (!mem.length) return body.append(hubEmpty("grade", "No students yet", `Students join with the code ${c.code}.`));
  if (!work.length) return body.append(hubEmpty("grade", "Nothing to grade yet", "Assign work, a quiz or a game and the gradebook fills in."));
  const name = m => hubWho(m.user_id), sid = m => m.student_number || "";
  const sub = (w, m) => subs.find(x => x.post_id === w.id && x.student === m.user_id);
  const tb = cbEl("table"); const hr = cbEl("tr", {}, cbEl("th", { text: "Student" }), cbEl("th", { text: "Student ID", title: "The ID your school uses (Skyward and other gradebooks match on it)" }), cbEl("th", { text: "Average" }));
  work.forEach(w => hr.append(cbEl("th", { title: `${w.title || ""} · ${KIND[w.kind].name}${w.points ? " · " + w.points + " pts" : ""}` }, cbEl("span", { text: w.title || KIND[w.kind].name }), cbEl("small", { class: "muted", text: (w.points ? " /" + w.points : "") }))));
  tb.append(cbEl("thead", {}, hr));
  const avg = m => { const g = work.map(w => ({ g: sub(w, m)?.returned_at ? sub(w, m).grade : null, p: Number(w.points) || 0 })).filter(x => x.g != null && x.p); return g.length ? Math.round(g.reduce((a, x) => a + x.g / x.p, 0) / g.length * 1000) / 10 : null; };
  const rows = cbEl("tbody");
  for (const m of mem) {
    const id = cbEl("input", { class: "cell-in", value: sid(m), placeholder: "—", title: "Student ID", onchange: async e => { try { await q(sb.rpc("cr_set_student_number", { p_class: c.id, p_student: m.user_id, p_number: e.target.value })); m.student_number = e.target.value.trim(); cbToast("Saved"); } catch (ex) { hubErr(ex); } } });
    const avgTd = cbEl("td", { style: { fontWeight: 700 } });
    const showAvg = () => { const a = avg(m); avgTd.textContent = a == null ? "—" : a + "%"; avgTd.style.color = a == null ? "" : a >= 90 ? "#9fe0b2" : a >= 70 ? "" : "#ff8b78"; };
    showAvg();
    const tr = cbEl("tr", {}, cbEl("td", {}, cbEl("span", { style: { display: "inline-flex", alignItems: "center", gap: "8px" } }, hubAvatar(m.user_id, 26), cbEl("span", { text: name(m) }))), cbEl("td", {}, id), avgTd);
    for (const w of work) {
      const s = sub(w, m), g = s?.returned_at ? s.grade : null, missing = !s?.turned_in && g == null && w.due_at && new Date(w.due_at) < new Date();
      const cell = cbEl("input", { class: "cell-in grade" + (missing ? " missing" : ""), type: "number", min: 0, value: g ?? "", placeholder: missing ? "Missing" : s?.turned_in ? "In" : "—", title: "Type a grade and press Enter" });
      cell.onchange = async () => { try { await q(sb.rpc("cr_set_grade", { p_post: w.id, p_student: m.user_id, p_grade: cell.value === "" ? null : Number(cell.value) })); const was = sub(w, m), v = cell.value === "" ? null : Number(cell.value); if (was) Object.assign(was, { grade: v, returned_at: new Date().toISOString() }); else subs.push({ post_id: w.id, student: m.user_id, grade: v, returned_at: new Date().toISOString() }); showAvg(); cell.classList.add("saved"); setTimeout(() => cell.classList.remove("saved"), 900); } catch (e) { hubErr(e); } };
      tr.append(cbEl("td", {}, cell));
    }
    rows.append(tr);
  }
  tb.append(rows);
  const exportAll = () => cbDownload(cbSafeName(c.name) + " grades.csv", [csvLine(["Student ID", "Student", "Email", "Average %", ...work.map(w => w.title)]),
    ...mem.map(m => csvLine([sid(m), name(m), cbUname(HUB_PEOPLE[m.user_id]?.email), avg(m) ?? "", ...work.map(w => sub(w, m)?.returned_at ? sub(w, m).grade : "")]))].join("\n"), "text/csv");
  const skyward = async () => {   // one assignment per file: Student ID, name, score; the shape a gradebook score import maps column by column
    const f = await hubForm("Export for Skyward", [{ key: "w", label: "Assignment", type: "select", options: work.map(w => [w.id, w.title || KIND[w.kind].name]) }], "Export");
    if (!f) return;
    const w = work.find(x => x.id === f.w), noId = mem.filter(m => !sid(m)).length;
    cbDownload(cbSafeName(c.name + " " + (w.title || "assignment")) + " skyward.csv", [csvLine(["Student ID", "Last Name", "First Name", "Score", "Max Score"]),
      ...mem.map(m => { const n = name(m).trim().split(/\s+/); return csvLine([sid(m), n.length > 1 ? n.at(-1) : n[0], n.length > 1 ? n.slice(0, -1).join(" ") : "", sub(w, m)?.returned_at ? sub(w, m).grade : "", w.points ?? ""]); })].join("\n"), "text/csv");
    cbToast(noId ? `Exported. ${noId} student${noId === 1 ? " has" : "s have"} no Student ID yet: add them so Skyward can match.` : "Exported. In Skyward, import it into the assignment's scores.");
  };
  const importCSV = () => {
    const pick = cbEl("input", { type: "file", accept: ".csv,text/csv" });
    pick.onchange = async () => {
      const file = pick.files[0]; if (!file) return;
      if (file.size > 2e6) return cbToast("That file is too big for a gradebook");
      const rows = parseCSV(await file.text()); if (rows.length < 2) return cbToast("That file has no rows");
      const head = rows[0].map(h => h.trim().toLowerCase());
      const col = re => head.findIndex(h => re.test(h));
      const ci = col(/student ?(id|number|#)|^id$|other id/), ce = col(/e-?mail/), cn = col(/^(student|name|student name)$/), cl = col(/last/), cf = col(/first/);
      const byId = new Map(mem.filter(sid).map(m => [sid(m).toLowerCase(), m])), byMail = new Map(mem.map(m => [cbUname(HUB_PEOPLE[m.user_id]?.email).toLowerCase(), m])), byName = new Map(mem.map(m => [name(m).toLowerCase(), m]));
      const who = r => (ci >= 0 && byId.get(r[ci]?.trim().toLowerCase())) || (ce >= 0 && byMail.get(r[ce]?.trim().toLowerCase())) || (cn >= 0 && byName.get(r[cn]?.trim().toLowerCase())) || (cl >= 0 && cf >= 0 && byName.get(`${r[cf]} ${r[cl]}`.trim().toLowerCase())) || null;
      // a column per assignment (matched by title), or one "Score" column for an assignment you pick
      let cols = work.map(w => [w, head.indexOf((w.title || "").trim().toLowerCase())]).filter(([, i]) => i >= 0);
      const cs = col(/^score$|^grade$|points earned/);
      if (!cols.length && cs >= 0) { const f = await hubForm("Import scores into", [{ key: "w", label: "Assignment", type: "select", options: work.map(w => [w.id, w.title || KIND[w.kind].name]) }], "Import"); if (!f) return; cols = [[work.find(x => x.id === f.w), cs]]; }
      if (!cols.length) return cbToast("No column matched an assignment title or a Score column");
      let n = 0, skipped = 0;
      for (const r of rows.slice(1)) {
        const m = who(r); if (!m) { skipped++; continue; }
        for (const [w, i] of cols) { const v = (r[i] ?? "").trim(); if (v === "" || isNaN(+v)) continue; try { await q(sb.rpc("cr_set_grade", { p_post: w.id, p_student: m.user_id, p_grade: +v })); n++; } catch (e) { hubErr(e); return; } }
      }
      cbToast(`Imported ${n} grade${n === 1 ? "" : "s"}` + (skipped ? `, ${skipped} row${skipped === 1 ? "" : "s"} didn't match a student` : "")); render();
    };
    pick.click();
  };
  body.append(cbEl("div", { class: "grade-bar" },
    cbEl("span", { class: "muted", style: { flex: 1 }, text: "Click a cell to grade it. Games and quizzes fill in by themselves." }),
    cbEl("button", { class: "btn", onclick: importCSV }, cbIconEl("up"), cbEl("span", { text: "Import CSV" })),
    cbEl("button", { class: "btn", onclick: exportAll }, cbIconEl("download"), cbEl("span", { text: "Export CSV" })),
    cbEl("button", { class: "btn primary", onclick: skyward }, cbIconEl("download"), cbEl("span", { text: "Export for Skyward" }))),
    cbEl("div", { class: "gradebook" }, tb));
}

/* attendance */
async function tabAttendance(c, body) {
  const day = cbEl("input", { class: "field", type: "date", style: { width: "180px" }, value: new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10) });
  const list = cbEl("div", { class: "stack" });
  const mem = await q(sb.from("cr_members").select("user_id").eq("class_id", c.id).eq("role", "student"));
  await hubPeople(mem.map(m => m.user_id));
  const draw = async () => {
    list.innerHTML = "";
    const rows = await q(sb.from("cr_attendance").select("student,status").eq("class_id", c.id).eq("day", day.value));
    if (!mem.length) return list.append(hubEmpty("people", "No students yet", `Students join with the code ${c.code}.`));
    for (const m of mem) {
      const cur = rows.find(r => r.student === m.user_id)?.status;
      const att = cbEl("div", { class: "att" });
      for (const [st, l] of [["present", "P"], ["late", "L"], ["absent", "A"], ["excused", "E"]]) att.append(cbEl("button", { class: `${st} ${cur === st ? "on" : ""}`, title: st[0].toUpperCase() + st.slice(1), text: l, onclick: async e => {
        try { await q(sb.from("cr_attendance").upsert({ class_id: c.id, day: day.value, student: m.user_id, status: st })); [...att.children].forEach(b => b.classList.remove("on")); e.currentTarget.classList.add("on"); } catch (ex) { hubErr(ex); }
      } }));
      list.append(cbEl("div", { class: "post", style: { display: "flex", alignItems: "center", gap: "12px", padding: "8px 14px" } }, hubAvatar(m.user_id), cbEl("b", { text: hubWho(m.user_id), style: { flex: 1 } }), att));
    }
  };
  day.onchange = draw;
  const all = cbEl("button", { class: "btn", text: "Mark everyone present", onclick: async () => {
    try { await q(sb.from("cr_attendance").upsert(mem.map(m => ({ class_id: c.id, day: day.value, student: m.user_id, status: "present" })))); draw(); } catch (e) { hubErr(e); }
  } });
  body.append(cbEl("div", { style: { display: "flex", gap: "8px", marginBottom: "12px", alignItems: "center" } }, day, all), list);
  await draw();
}

/* a student's own grades and attendance */
async function tabMine(c, body) {
  const work = await q(sb.from("cr_posts").select("id,title,points,due_at,kind").eq("class_id", c.id).in("kind", GRADED).order("created_at"));
  const subs = work.length ? await q(sb.from("cr_submissions").select("*").eq("student", CB_USER.id).in("post_id", work.map(w => w.id))) : [];
  const att = await q(sb.from("cr_attendance").select("status").eq("class_id", c.id).eq("student", CB_USER.id));
  const counts = ["present", "late", "absent", "excused"].map(s => [s, att.filter(a => a.status === s).length]);
  body.append(cbEl("div", { class: "tiles", style: { gridTemplateColumns: "repeat(4, 1fr)", marginBottom: "16px" } }, ...counts.map(([s, n]) => cbEl("div", { class: "side-card", style: { textAlign: "center" } }, cbEl("div", { text: n, style: { font: "700 28px var(--display)" } }), cbEl("div", { class: "muted", text: s[0].toUpperCase() + s.slice(1) })))));
  const grid = cbEl("div", { class: "tiles anim" });
  for (const w of work) {
    const s = subs.find(x => x.post_id === w.id);
    grid.append(cbEl("button", { class: "post click", style: { textAlign: "left" }, onclick: () => go({ a: w.id }) }, cbEl("b", { text: w.title }),
      cbEl("div", { text: s?.returned_at && s.grade != null ? `${s.grade}${w.points ? " / " + w.points : ""}` : s?.turned_in ? "Turned in" : "—", style: { font: "700 24px var(--display)", color: c.color, marginTop: "6px" } })));
  }
  body.append(work.length ? grid : hubEmpty("grade", "No assignments yet", "Your grades show up here when your teacher returns work."));
}

(async () => {
  UI = await hubBoot("Classroom");
  await loadClasses().catch(e => hubErr(new Error(/cr_members|relation|schema cache/.test(e.message) ? "Classroom isn't set up on this Cinnabar server yet (db/classroom.sql)." : e.message)));
  addEventListener("hashchange", render);
  render();
  // live stream: refresh when someone posts or comments in a class I'm viewing
  sb.channel("classroom").on("postgres_changes", { event: "INSERT", schema: "public", table: "cr_posts" }, ev => { if (route().c === ev.new.class_id && ev.new.author !== CB_USER.id) render(); }).subscribe();
})();
