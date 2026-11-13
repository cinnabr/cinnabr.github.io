/* Cinnabar Drive: home, folders, shared, recent, starred, trash */
"use strict";

const TEMPLATES = [
  { kind: "doc", title: "Blank document", content: { html: "<p><br></p>" } },
  { kind: "doc", title: "Meeting notes", content: { html: `<h1>Meeting notes</h1><p><b>Date:</b> ${new Date().toLocaleDateString()}</p><p><b>Attendees:</b> </p><h2>Agenda</h2><ul><li>Topic one</li><li>Topic two</li></ul><h2>Notes</h2><p><br></p><h2>Action items</h2><ul data-checklist=""><li data-checked="false">Owner — task — due date</li></ul>` } },
  { kind: "sheet", title: "Blank spreadsheet", content: { sheets: [{ name: "Sheet1", cells: {}, colw: {} }], active: 0 } },
  { kind: "sheet", title: "Monthly budget", content: { active: 0, sheets: [{ name: "Budget", colw: { A: 180, B: 110, C: 110, D: 110 }, cells: {
    A1: { v: "Monthly budget", s: { b: 1, size: 16 } }, A3: { v: "Category", s: { b: 1, bg: "#2a1a16" } }, B3: { v: "Planned", s: { b: 1, bg: "#2a1a16", align: "right" } }, C3: { v: "Actual", s: { b: 1, bg: "#2a1a16", align: "right" } }, D3: { v: "Difference", s: { b: 1, bg: "#2a1a16", align: "right" } },
    A4: { v: "Rent" }, B4: { v: "1200", s: { fmt: "cur" } }, C4: { v: "1200", s: { fmt: "cur" } }, D4: { v: "=B4-C4", s: { fmt: "cur" } },
    A5: { v: "Groceries" }, B5: { v: "400", s: { fmt: "cur" } }, C5: { v: "452.30", s: { fmt: "cur" } }, D5: { v: "=B5-C5", s: { fmt: "cur" } },
    A6: { v: "Transport" }, B6: { v: "150", s: { fmt: "cur" } }, C6: { v: "98", s: { fmt: "cur" } }, D6: { v: "=B6-C6", s: { fmt: "cur" } },
    A7: { v: "Utilities" }, B7: { v: "180", s: { fmt: "cur" } }, C7: { v: "171.45", s: { fmt: "cur" } }, D7: { v: "=B7-C7", s: { fmt: "cur" } },
    A8: { v: "Fun" }, B8: { v: "200", s: { fmt: "cur" } }, C8: { v: "260", s: { fmt: "cur" } }, D8: { v: "=B8-C8", s: { fmt: "cur" } },
    A10: { v: "Total", s: { b: 1 } }, B10: { v: "=SUM(B4:B8)", s: { b: 1, fmt: "cur" } }, C10: { v: "=SUM(C4:C8)", s: { b: 1, fmt: "cur" } }, D10: { v: "=B10-C10", s: { b: 1, fmt: "cur" } },
    A11: { v: "Over budget?" }, D11: { v: '=IF(D10<0,"Yes","No")', s: { align: "right" } } } }] } },
  { kind: "slides", title: "Blank presentation", content: { slides: [{ id: "s1", bg: "#0b0807", notes: "", els: [
    { id: "e1", type: "text", x: 80, y: 180, w: 800, h: 110, html: "Click to add title", st: { size: 54, color: "#f4ece8", align: "center", font: "display", bold: 1 } },
    { id: "e2", type: "text", x: 180, y: 310, w: 600, h: 50, html: "Click to add subtitle", st: { size: 22, color: "#a09390", align: "center" } }] }] } },
  { kind: "slides", title: "Pitch deck", content: { slides: [
    { id: "s1", bg: "linear-gradient(135deg,#120807,#3a0d06 60%,#a8240f)", notes: "Open with the one-line pitch.", els: [
      { id: "e1", type: "text", x: 70, y: 170, w: 820, h: 120, html: "Your company", st: { size: 64, color: "#fff", font: "display", bold: 1 } },
      { id: "e2", type: "text", x: 70, y: 300, w: 820, h: 50, html: "One sentence that says what you do and for whom.", st: { size: 22, color: "#ffd9cf" } }] },
    { id: "s2", bg: "#0b0807", notes: "", els: [
      { id: "e3", type: "text", x: 70, y: 60, w: 820, h: 70, html: "The problem", st: { size: 40, color: "#ff8f73", font: "display", bold: 1 } },
      { id: "e4", type: "text", x: 70, y: 160, w: 820, h: 300, html: "<ul><li>Who has it</li><li>How painful it is</li><li>What they do today</li></ul>", st: { size: 26, color: "#f4ece8" } }] },
    { id: "s3", bg: "#0b0807", notes: "", els: [
      { id: "e5", type: "text", x: 70, y: 60, w: 820, h: 70, html: "Our solution", st: { size: 40, color: "#ff8f73", font: "display", bold: 1 } },
      { id: "e6", type: "shape", shape: "rect", x: 70, y: 170, w: 250, h: 250, fill: "#e2361f", html: "Fast", st: { size: 28, color: "#fff", align: "center", valign: "middle", bold: 1 } },
      { id: "e7", type: "shape", shape: "rect", x: 355, y: 170, w: 250, h: 250, fill: "#ff7a1a", html: "Simple", st: { size: 28, color: "#fff", align: "center", valign: "middle", bold: 1 } },
      { id: "e8", type: "shape", shape: "rect", x: 640, y: 170, w: 250, h: 250, fill: "#f4a83a", html: "Yours", st: { size: 28, color: "#1a0c08", align: "center", valign: "middle", bold: 1 } }] }] } },
];

let view = "home", folder = null, crumbs = [], layout = localStorage.getItem("cb-layout") || "list", rows = [], people = {};

const greetWord = h => (h < 5 ? "good night" : h < 12 ? "good morning" : h < 17 ? "good afternoon" : h < 22 ? "good evening" : "good night");
function tick() {
  const d = new Date();
  $("#clock").textContent = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).replace(/\s?(AM|PM)/i, (_, p) => p.toLowerCase());
  $("#date").textContent = d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
  $("#greet").textContent = `${greetWord(d.getHours())}, ${cbName().toLowerCase()}`;
}

function newMenu(anchor) {
  cbMenuAt(anchor, [
    { label: "Folder", icon: "folder", run: async () => { const t = await cbPrompt("New folder", "Untitled folder"); if (t) { await cbFiles.create("folder", t, { parent: view === "drive" ? folder : null }).catch(e => cbToast(e.message)); load(); } } },
    "-",
    { label: "Cinnabar Docs", icon: "edit", run: () => openNew("doc") },
    { label: "Cinnabar Sheets", icon: "grid", run: () => openNew("sheet") },
    { label: "Cinnabar Slides", icon: "play", run: () => openNew("slides") },
  ]);
}
async function openNew(kind, tpl) {
  const t = tpl || TEMPLATES.find(x => x.kind === kind);
  try {
    const f = await cbFiles.create(kind, tpl ? t.title : CB_KINDS[kind].blank, { parent: view === "drive" ? folder : null, content: structuredClone(t.content) });
    location.href = cbFileURL(f);
  } catch (e) { cbToast(e.message); }
}

function setView(v, fid = null, title = null) {
  view = v; folder = fid;
  if (v === "drive") {
    if (!fid) crumbs = [];
    else { const i = crumbs.findIndex(c => c.id === fid); crumbs = i >= 0 ? crumbs.slice(0, i + 1) : [...crumbs, { id: fid, title }]; }
  }
  $$("#nav button").forEach(b => b.classList.toggle("on", b.dataset.view === v));
  $("#hero").hidden = $("#start").hidden = v !== "home";
  const h = v === "drive" && fid ? `#folder/${fid}` : `#${v}`;
  if (location.hash !== h) history.replaceState(null, "", h);
  load();
}

async function load() {
  const q = $("#q").value.trim();
  const v = q ? "search" : view;
  const label = { home: "Recent files", drive: "My Drive", shared: "Shared with me", recent: "Recent", starred: "Starred", trash: "Trash", search: `Results for “${q}”` }[v];
  const c = $("#crumbs"); c.innerHTML = "";
  c.append(cbEl("button", { text: label, onclick: () => v === "drive" && setView("drive") }));
  if (v === "drive") for (const cr of crumbs) c.append(cbEl("span", { class: "slash", text: "›" }), cbEl("button", { text: cr.title, onclick: () => setView("drive", cr.id) }));
  try {
    rows = await cbFiles.list(v === "search" ? { view: "all", q } : v === "home" ? { view: "recent" } : { view: v, parent: folder });
    if (v === "home") rows = rows.slice(0, 30);
    people = await cbFiles.profiles(rows.map(r => r.owner));
  } catch (e) { rows = []; cbToast(e.message); }
  c.append(cbEl("span", { class: "cnt", text: rows.length ? `${rows.length} item${rows.length > 1 ? "s" : ""}` : "" }));
  render();
}

function ownerLabel(f) { return f.owner === CB_USER.id ? "me" : (people[f.owner]?.display_name || cbUname(people[f.owner]?.email) || "someone"); }
function open(f) {
  if (f.trashed) return cbToast("Restore this file from Trash to open it");
  if (f.kind === "folder") return f.owner === CB_USER.id ? setView("drive", f.id, f.title) : cbToast("Open shared folders from the owner's link");
  location.href = cbFileURL(f);
}
function fileMenu(f, x, y) {
  const mine = f.owner === CB_USER.id;
  const items = f.trashed ? [
    { label: "Restore", icon: "restore", run: async () => { await cbFiles.update(f.id, { trashed: false }); cbToast("Restored"); load(); } },
    { label: "Delete forever", icon: "trash", danger: true, run: async () => { if (await cbConfirm("Delete forever?", `“${f.title}” will be permanently deleted. This can't be undone.`, "Delete forever")) { await cbFiles.remove(f.id); load(); } } },
  ] : [
    f.kind !== "folder" && { label: "Open in new tab", icon: "open", run: () => window.open(cbFileURL(f), "_blank") },
    { label: "Share", icon: "share", run: () => cbShareDialog(f) },
    { label: "Copy link", icon: "link", run: async () => { await navigator.clipboard.writeText(cbAbsURL(f)).catch(() => 0); cbToast("Link copied"); } },
    "-",
    mine && { label: "Rename", icon: "edit", run: async () => { const t = await cbPrompt("Rename", f.title); if (t) { await cbFiles.update(f.id, { title: t }).catch(e => cbToast(e.message)); load(); } } },
    mine && { label: f.starred ? "Remove from Starred" : "Add to Starred", icon: "star", run: async () => { await cbFiles.update(f.id, { starred: !f.starred }); load(); } },
    mine && { label: "Move to…", icon: "move", run: async () => { if (await cbMoveDialog(f).catch(e => cbToast(e.message))) { cbToast("Moved"); load(); } } },
    f.kind !== "folder" && { label: "Make a copy", icon: "copy", run: async () => { try { await cbFiles.copy(f); cbToast("Copy created in My Drive"); load(); } catch (e) { cbToast(e.message); } } },
    mine && "-",
    mine && { label: "Move to Trash", icon: "trash", danger: true, run: async () => { await cbFiles.update(f.id, { trashed: true }); cbToast(`“${f.title}” moved to Trash`); load(); } },
  ];
  cbMenu(x, y, items.filter(Boolean));
}

function render() {
  const list = $("#list"), empty = $("#empty");
  list.innerHTML = "";
  empty.hidden = rows.length > 0;
  if (!rows.length) {
    const msg = { home: ["No files yet", "Start something new above — it saves to your Cinnabar automatically."], drive: ["This folder is empty", "Use New to add a document, spreadsheet, presentation or folder."], shared: ["Nothing shared with you yet", "Files people share with your email address appear here."], starred: ["No starred files", "Star files to find them quickly."], trash: ["Trash is empty", "Files you delete stay here until you delete them forever."], recent: ["No recent files", ""] }[view] || ["No matching files", "Try a different search."];
    empty.innerHTML = `<b>${cbEsc(msg[0])}</b>${cbEsc(msg[1])}`;
    return;
  }
  const star = `<span class="st">${cbIcon("star")}</span>`;
  if (layout === "grid") {
    const g = cbEl("div", { class: "grid" });
    for (const f of rows) {
      const card = cbEl("button", { class: "gcard", onclick: () => open(f), oncontextmenu: e => { e.preventDefault(); fileMenu(f, e.clientX, e.clientY); } });
      card.innerHTML = `<div class="pv">${cbKindIcon(f.kind)}</div><div class="info">${cbKindIcon(f.kind)}<div class="t"><b>${cbEsc(f.title)}</b><span>${cbEsc(cbAgo(f.updated_at))}</span></div></div>`;
      const more = cbEl("span", { class: "icon-btn", role: "button", "aria-label": "More actions", html: cbIcon("more"), onclick: e => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); fileMenu(f, r.left, r.bottom); } });
      card.querySelector(".info").append(more);
      g.append(card);
    }
    list.append(g);
    return;
  }
  const t = cbEl("table", { class: "flist" });
  t.innerHTML = `<thead><tr><th>Name</th><th class="hide-sm">Owner</th><th>${view === "trash" ? "Deleted" : "Last modified"}</th><th class="hide-sm">Sharing</th><th></th></tr></thead>`;
  const tb = cbEl("tbody");
  for (const f of rows) {
    const tr = cbEl("tr", { class: "f", tabindex: "0", onclick: () => open(f), onkeydown: e => { if (e.key === "Enter") open(f); }, oncontextmenu: e => { e.preventDefault(); fileMenu(f, e.clientX, e.clientY); } });
    const shared = f.link_access !== "none" ? (f.link_access === "edit" ? "Link · edit" : "Link · view") : f.owner === CB_USER.id ? "Private" : "Shared";
    tr.innerHTML = `<td><div class="nm">${cbKindIcon(f.kind)}<span>${cbEsc(f.title)}</span>${f.starred ? star : ""}</div></td><td class="mu hide-sm">${cbEsc(ownerLabel(f))}</td><td class="mu">${cbEsc(cbAgo(f.updated_at))}</td><td class="mu hide-sm">${shared}</td>`;
    const td = cbEl("td", { class: "act" }, cbEl("button", { class: "icon-btn", "aria-label": "More actions for " + f.title, html: cbIcon("more"), onclick: e => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); fileMenu(f, r.left - 150, r.bottom); } }));
    tr.append(td); tb.append(tr);
  }
  t.append(tb); list.append(t);
}

(async function main() {
  cbWave();
  await cbRequireAuth("Drive");
  sb.from("profiles").select("kind").eq("id", CB_USER.id).maybeSingle().then(r => { if (r.data?.kind === "work") document.querySelectorAll('a[href="classroom.html"], a[href="games.html"]').forEach(a => a.remove()); }, () => 0);   // work accounts have no Classroom
  $("#shell").hidden = false;
  $("#brand").append(cbLogo());
  $("#new .plus").innerHTML = cbIcon("plus");
  $("#sicon").innerHTML = cbIcon("search");
  const navIcons = { home: "home", drive: "drive", shared: "shared", recent: "clock", starred: "star", trash: "trash" };
  $$("#nav button").forEach(b => { b.insertAdjacentHTML("afterbegin", cbIcon(navIcons[b.dataset.view])); b.onclick = () => { $("#q").value = ""; setView(b.dataset.view); }; });
  $$(".apps a").forEach(a => a.insertAdjacentHTML("afterbegin", a.dataset.icon ? cbIcon(a.dataset.icon, 'class="kind" style="color:var(--orange)"') : cbKindIcon(a.dataset.kind)));
  $("#new").onclick = e => newMenu(e.currentTarget);
  const lb = $("#layout");
  const setLayoutIcon = () => (lb.innerHTML = cbIcon(layout === "grid" ? "list" : "grid"));
  setLayoutIcon();
  lb.onclick = () => { layout = layout === "grid" ? "list" : "grid"; localStorage.setItem("cb-layout", layout); setLayoutIcon(); render(); };
  const me = $("#me");
  me.textContent = cbName()[0]; me.title = cbUname(CB_USER.email); me.style.background = cbColorFor(CB_USER.email);
  me.onclick = e => cbMenuAt(e.currentTarget, [{ label: cbUname(CB_USER.email), icon: "shared", run() {} }, "-", { label: "Sign out", icon: "logout", run: cbSignOut }]);
  const starts = $("#starts");
  for (const t of TEMPLATES) {
    const b = cbEl("button", { class: "tpl", onclick: () => openNew(t.kind, t) });
    const art = t.title.startsWith("Blank") ? "" : `<div class="art">${"<i></i>".repeat(5)}</div>`;
    b.innerHTML = `<div class="thumb">${art}${cbKindIcon(t.kind)}<span class="plus">${cbIcon("plus")}</span></div><b>${cbEsc(t.title)}</b><span class="m">Cinnabar ${CB_KINDS[t.kind].name}</span>`;
    starts.append(b);
  }
  let qt; $("#q").addEventListener("input", () => { clearTimeout(qt); qt = setTimeout(load, 220); });
  addEventListener("keydown", e => { if (e.key === "/" && document.activeElement.tagName !== "INPUT") { e.preventDefault(); $("#q").focus(); } });
  tick(); setInterval(tick, 1000);
  const h = location.hash.slice(1);
  if (h.startsWith("folder/")) setView("drive", h.split("/")[1], "Folder");
  else setView(["drive", "shared", "recent", "starred", "trash"].includes(h) ? h : "home");
  sb.auth.onAuthStateChange(ev => { if (ev === "SIGNED_OUT") location.reload(); });
})();
