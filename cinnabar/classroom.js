/* Cinnabar Classroom: classes, stream, classwork, submissions and grading, people, gradebook, attendance. */
"use strict";
let UI, classes = [], roles = {};
const KIND = {
  announcement: { icon: "megaphone", name: "Announcement", color: "#e2361f" },
  assignment: { icon: "task", name: "Assignment", color: "#ff7a1a" },
  material: { icon: "book", name: "Material", color: "#2f7fd8" },
  question: { icon: "question", name: "Question", color: "#7a4fd1" },
};
const q = async p => { const { data, error } = await p; if (error) throw new Error(error.message); return data; };
const route = () => Object.fromEntries(new URLSearchParams(location.hash.slice(1)));
const go = h => { location.hash = new URLSearchParams(h).toString(); };

async function loadClasses() {
  const mem = await q(sb.from("cr_members").select("class_id,role").eq("user_id", CB_USER.id));
  roles = Object.fromEntries(mem.map(m => [m.class_id, m.role]));
  classes = mem.length ? await q(sb.from("cr_classes").select("*").in("id", mem.map(m => m.class_id)).order("created_at")) : [];
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
  UI.actions.append(cbEl("button", { class: "btn", text: "Join a class", onclick: joinClass }), cbEl("button", { class: "btn primary", text: "Create a class", onclick: createClass }));
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
  tiles.append(cbEl("button", { class: "tile add", onclick: createClass, html: cbIcon("plus") + "<span>Create a class</span>" }));
  tiles.append(cbEl("button", { class: "tile add", onclick: joinClass, html: cbIcon("school") + "<span>Join with a code</span>" }));
  v.append(tiles);
  const old = classes.filter(c => c.archived);
  if (old.length) { const t = cbEl("div", { class: "tiles" }); old.forEach(c => t.append(classTile(c))); v.append(cbEl("div", { class: "cap", text: "Archived", style: { padding: "22px 2px 6px" } }), t); }
}
function classTile(c) {
  const t = cbEl("button", { class: "tile", onclick: () => go({ c: c.id }) });
  const ban = cbEl("div", { class: "ban", style: { background: `linear-gradient(135deg, ${c.color}, ${c.color}bb)` } }, cbEl("b", { text: c.name }), cbEl("span", { text: [c.section, c.subject].filter(Boolean).join(" · ") || (teacher(c.id) ? "You teach this class" : "Student") }));
  t.append(ban, cbEl("div", { class: "body" }, cbEl("span", { text: c.room ? "Room " + c.room : "" }), cbEl("span", { text: teacher(c.id) ? `Class code ${c.code}` : "" })));
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
  const code = await cbPrompt("Join a class", "", "Class code from your teacher");
  if (!code) return;
  try { const id = await q(sb.rpc("cr_join", { p_code: code })); await loadClasses(); cbToast("You joined " + (cls(id)?.name || "the class")); go({ c: id }); }
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
  if (t) ban.append(cbEl("div", { class: "code", title: "Copy class code", onclick: () => { navigator.clipboard.writeText(c.code).catch(() => 0); cbToast("Class code copied"); } }, cbEl("small", { text: "Code" }), cbEl("span", { text: c.code })));
  v.append(ban);
  const tabs = cbEl("div", { class: "tabs" });
  const names = [["stream", "Stream"], ["work", "Classwork"], ["people", "People"], t && ["grades", "Grades"], t && ["attendance", "Attendance"], !t && ["mine", "My grades"]].filter(Boolean);
  for (const [k, n] of names) tabs.append(cbEl("button", { class: k === tab ? "on" : "", text: n, onclick: () => go({ c: c.id, t: k }) }));
  v.append(tabs);
  const body = cbEl("div", { class: "anim" }); v.append(body);
  await ({ stream: tabStream, work: tabWork, people: tabPeople, grades: tabGrades, attendance: tabAttendance, mine: tabMine }[tab] || tabStream)(c, body);
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
      : { label: "Leave class", icon: "logout", danger: true, run: async () => { if (await cbConfirm("Leave " + c.name + "?", "You can join again with the class code.", "Leave")) { await q(sb.from("cr_members").delete().eq("class_id", c.id).eq("user_id", CB_USER.id)).catch(hubErr); await loadClasses(); go({}); } } },
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
  if (t) side.append(cbEl("div", { class: "side-card" }, cbEl("h3", { text: "Class code" }), cbEl("div", { text: c.code, style: { font: "700 24px var(--display)", letterSpacing: ".12em", color: c.color } })));
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
  if (t) body.append(cbEl("div", { style: { display: "flex", gap: "8px", marginBottom: "14px" } },
    ...["assignment", "material", "question"].map(k => cbEl("button", { class: "btn" + (k === "assignment" ? " primary" : ""), onclick: () => newWork(c, k) }, cbIconEl(KIND[k].icon), cbEl("span", { text: KIND[k].name })))));
  const posts = await q(sb.from("cr_posts").select("*").eq("class_id", c.id).in("kind", ["assignment", "material", "question"]).order("created_at", { ascending: false }));
  const mine = !t && posts.length ? await q(sb.from("cr_submissions").select("post_id,turned_in,grade,returned_at").eq("student", CB_USER.id).in("post_id", posts.map(p => p.id))) : [];
  if (!posts.length) return body.append(hubEmpty("task", "No classwork yet", t ? "Create assignments, share materials and ask questions." : "Your teacher hasn't posted any work yet."));
  const topics = [...new Set(posts.map(p => p.topic || ""))].sort((a, b) => (a === "") - (b === "") || a.localeCompare(b));
  for (const tp of topics) {
    body.append(cbEl("h3", { text: tp || "No topic", style: { font: "600 18px var(--display)", color: c.color, margin: "18px 0 8px", paddingBottom: "6px", borderBottom: "1px solid var(--line)" } }));
    const grid = cbEl("div", { class: "tiles anim" });
    for (const p of posts.filter(x => (x.topic || "") === tp)) {
      const s = mine.find(m => m.post_id === p.id);
      const state = p.kind !== "assignment" || t ? null : s?.returned_at ? ["green", s.grade != null ? `${s.grade}${p.points ? "/" + p.points : ""}` : "Returned"] : s?.turned_in ? ["green", "Turned in"] : p.due_at && new Date(p.due_at) < new Date() ? ["red", "Missing"] : ["amber", "Assigned"];
      const tile = cbEl("button", { class: "post click", style: { textAlign: "left" }, onclick: () => go({ a: p.id }) },
        cbEl("div", { class: "head" }, hubGlyph(KIND[p.kind].icon, c.color), cbEl("div", { class: "who" }, cbEl("b", { text: p.title || KIND[p.kind].name }), cbEl("span", { text: p.due_at ? "Due " + hubWhen(p.due_at) : "Posted " + cbAgo(p.created_at) }))));
      if (state) tile.append(cbEl("div", { class: "meta" }, cbEl("span", { class: "chip " + state[0], text: state[1] })));
      grid.append(tile);
    }
    body.append(grid);
  }
}
async function newWork(c, kind) {
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
    const ret = cbEl("button", { class: "btn primary", text: s?.returned_at ? "Update" : "Return", disabled: !s });
    ret.onclick = async () => {
      try { await q(sb.from("cr_submissions").update({ grade: grade.value === "" ? null : Number(grade.value), feedback: fb.value || null }).eq("id", s.id)); cbToast("Returned to " + hubWho(m.user_id)); render(); } catch (e) { hubErr(e); }
    };
    const chip = s?.returned_at ? ["green", "Graded"] : s?.turned_in ? ["green", "Turned in" + (p.due_at && s.submitted_at > p.due_at ? " late" : "")] : ["", "Not turned in"];
    const card = cbEl("div", { class: "post" }, cbEl("div", { class: "head" }, hubAvatar(m.user_id), cbEl("div", { class: "who" }, cbEl("b", { text: hubWho(m.user_id) }), cbEl("span", {}, cbEl("span", { class: "chip " + chip[0], text: chip[1] })))));
    if (s?.body) card.append(cbEl("div", { class: "txt", text: s.body }));
    if (s?.file_id) card.append(cbEl("div", { class: "meta" }, cbEl("a", { href: "#", class: "btn", text: "Open their file", onclick: e => openFile(e, s.file_id) })));
    if (s) card.append(cbEl("div", { class: "meta", style: { flexWrap: "nowrap" } }, grade, fb, ret));
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
      const email = await cbPrompt(role === "teacher" ? "Add a co-teacher" : "Add a student", "", "Their Cinnabar email");
      if (email) { try { await q(sb.rpc("cr_add_member", { p_class: c.id, p_email: email, p_role: role })); render(); } catch (e) { hubErr(e); } }
    } }));
    body.append(head);
    const grid = cbEl("div", { class: "people anim" });
    for (const m of list) {
      const card = cbEl("div", { class: "person" }, hubAvatar(m.user_id, 54), cbEl("b", { text: hubWho(m.user_id) }), cbEl("span", { class: "muted", style: { fontSize: "12px" }, text: HUB_PEOPLE[m.user_id]?.email || "" }));
      if (t && m.user_id !== c.owner && m.user_id !== CB_USER.id) card.append(cbEl("button", { class: "icon-btn x", title: "Remove from class", html: cbIcon("close"), onclick: async () => {
        if (await cbConfirm("Remove " + hubWho(m.user_id) + "?", "Their submissions stay until you delete the class.", "Remove")) { await q(sb.from("cr_members").delete().eq("class_id", c.id).eq("user_id", m.user_id)).catch(hubErr); render(); } } }));
      grid.append(card);
    }
    if (!list.length && role === "student") grid.append(cbEl("div", { class: "muted", text: `Students join with the code ${c.code}.` }));
    body.append(grid);
  }
}

/* gradebook */
async function tabGrades(c, body) {
  const work = await q(sb.from("cr_posts").select("id,title,points,due_at").eq("class_id", c.id).eq("kind", "assignment").order("created_at"));
  const mem = await q(sb.from("cr_members").select("user_id").eq("class_id", c.id).eq("role", "student"));
  const subs = work.length ? await q(sb.from("cr_submissions").select("post_id,student,grade,turned_in,returned_at").in("post_id", work.map(w => w.id))) : [];
  await hubPeople(mem.map(m => m.user_id));
  if (!work.length || !mem.length) return body.append(hubEmpty("grade", "Nothing to grade yet", "The gradebook fills in as students hand in assignments."));
  const tb = cbEl("table"); const hr = cbEl("tr", {}, cbEl("th", { text: "Student" }), cbEl("th", { text: "Average" }));
  work.forEach(w => hr.append(cbEl("th", { title: w.title, text: w.title || "Assignment" })));
  tb.append(cbEl("thead", {}, hr));
  const avg = list => { const g = list.filter(x => x.g != null && x.p); return g.length ? Math.round(g.reduce((a, x) => a + x.g / x.p, 0) / g.length * 1000) / 10 + "%" : "—"; };
  const rows = cbEl("tbody");
  for (const m of mem) {
    const cells = work.map(w => { const s = subs.find(x => x.post_id === w.id && x.student === m.user_id); return { s, w, g: s?.returned_at ? s.grade : null, p: Number(w.points) || 0 }; });
    const tr = cbEl("tr", {}, cbEl("td", {}, cbEl("span", { style: { display: "inline-flex", alignItems: "center", gap: "8px" } }, hubAvatar(m.user_id, 26), cbEl("span", { text: hubWho(m.user_id) }))), cbEl("td", { text: avg(cells), style: { fontWeight: 700 } }));
    for (const x of cells) {
      const missing = !x.s?.turned_in && x.w.due_at && new Date(x.w.due_at) < new Date();
      tr.append(cbEl("td", { style: { color: missing ? "#ff8b78" : x.g == null ? "var(--muted)" : "" }, text: x.g != null ? `${x.g}${x.p ? "/" + x.p : ""}` : missing ? "Missing" : x.s?.turned_in ? "Turned in" : "—" }));
    }
    rows.append(tr);
  }
  tb.append(rows);
  const csv = () => {
    const lines = [["Student", "Email", ...work.map(w => w.title)]];
    for (const m of mem) lines.push([hubWho(m.user_id), HUB_PEOPLE[m.user_id]?.email || "", ...work.map(w => subs.find(x => x.post_id === w.id && x.student === m.user_id && x.returned_at)?.grade ?? "")]);
    cbDownload(cbSafeName(c.name) + " grades.csv", lines.map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n"), "text/csv");
  };
  body.append(cbEl("div", { style: { display: "flex", justifyContent: "flex-end", marginBottom: "10px" } }, cbEl("button", { class: "btn", onclick: csv }, cbIconEl("download"), cbEl("span", { text: "Export CSV" }))), cbEl("div", { class: "gradebook" }, tb));
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
  const work = await q(sb.from("cr_posts").select("id,title,points,due_at").eq("class_id", c.id).eq("kind", "assignment").order("created_at"));
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
