/* Cinnabar Keep: notes and checklists, colours, labels, pins, reminders, and sharing by username (db/suite.sql kp_*). */
"use strict";
let UI, notes = [];
const q = async p => { const { data, error } = await p; if (error) throw new Error(error.message); return data; };
const COLORS = { default: "rgba(34,24,21,.6)", red: "#5c1d15", orange: "#5e3313", yellow: "#58481a", green: "#1d4a2a", teal: "#164a46", blue: "#1b3656", purple: "#3b2557", pink: "#561f3c", gray: "#3a3532" };
const view = () => new URLSearchParams(location.hash.slice(1)).get("v") || "notes";
const save = (id, patch) => q(sb.from("kp_notes").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id));

async function render() {
  notes = await q(sb.from("kp_notes").select("*").order("updated_at", { ascending: false })).catch(e => (hubErr(e), []));
  await hubPeople(notes.map(n => n.owner));
  const v_ = view(), term = (UI.search?.value || "").toLowerCase();
  UI.title.textContent = { notes: "Keep", reminders: "Reminders", archive: "Archive", trash: "Trash" }[v_] || "Label: " + v_;
  const v = UI.view = hubView(UI.view);
  const labels = [...new Set(notes.flatMap(n => n.labels))].sort();
  const side = cbEl("div", { class: "ml-side" },
    ...[["notes", "Notes", "edit"], ["reminders", "Reminders", "clock"], ["archive", "Archive", "folder"], ["trash", "Trash", "trash"]].map(([k, n, i]) => cbEl("button", { class: "ml-f" + (v_ === k ? " on" : ""), onclick: () => { location.hash = "v=" + k; } }, cbIconEl(i), cbEl("span", { text: n }))),
    labels.length ? cbEl("div", { class: "cap", text: "Labels" }) : null,
    ...labels.map(l => cbEl("button", { class: "ml-f" + (v_ === l ? " on" : ""), onclick: () => { location.hash = "v=" + encodeURIComponent(l); } }, cbIconEl("grid"), cbEl("span", { text: l }))));
  const main = cbEl("div", { class: "kp-main" });
  if (v_ === "notes") main.append(taker());
  let shown = notes.filter(n => v_ === "trash" ? n.trashed : n.trashed ? false : v_ === "archive" ? n.archived : v_ === "reminders" ? n.remind_at && !n.archived : v_ === "notes" ? !n.archived : n.labels.includes(v_));
  if (term) shown = shown.filter(n => (n.title + " " + n.body + " " + JSON.stringify(n.items || [])).toLowerCase().includes(term));
  const pinned = shown.filter(n => n.pinned && v_ === "notes"), rest = shown.filter(n => !(n.pinned && v_ === "notes"));
  if (pinned.length) main.append(cbEl("div", { class: "cap", text: "Pinned" }), grid(pinned), cbEl("div", { class: "cap", text: "Others" }));
  if (rest.length) main.append(grid(rest));
  if (!shown.length) main.append(hubEmpty(v_ === "trash" ? "trash" : "edit", v_ === "trash" ? "Trash is empty" : "Notes you add appear here", v_ === "trash" ? "Notes in the trash are kept until you delete them." : "Write a note, or make a checklist."));
  if (v_ === "trash" && shown.length) main.prepend(cbEl("button", { class: "btn ghost", text: "Empty trash", onclick: async () => { if (await cbConfirm("Empty the trash?", "These notes are deleted for good.", "Empty trash", true)) { await q(sb.from("kp_notes").delete().eq("trashed", true).eq("owner", CB_USER.id)).catch(hubErr); render(); } } }));
  v.append(cbEl("div", { class: "ml-wrap" }, side, main));
}
function taker() {
  const title = cbEl("input", { class: "kp-in", placeholder: "Title", hidden: true });
  const body = cbEl("textarea", { class: "kp-in", rows: 1, placeholder: "Take a note…", onfocus: () => { title.hidden = false; tools.hidden = false; } });
  let list = false;
  const close = async () => {
    const t = title.value.trim(), b = body.value.trim();
    if (t || b) {
      const row = list ? { title: t, items: b.split("\n").filter(Boolean).map(x => ({ t: x, done: false })) } : { title: t, body: b };
      await q(sb.from("kp_notes").insert(row)).catch(hubErr);
    }
    render();
  };
  const tools = cbEl("div", { class: "kp-tools", hidden: true },
    cbEl("button", { class: "btn ghost", html: cbIcon("task") + "<span>Checklist</span>", onclick: e => { list = !list; e.currentTarget.classList.toggle("on", list); body.placeholder = list ? "One item per line" : "Take a note…"; body.focus(); } }),
    cbEl("div", { class: "grow" }), cbEl("button", { class: "btn", text: "Close", onclick: close }));
  body.addEventListener("input", () => { body.style.height = "auto"; body.style.height = body.scrollHeight + "px"; });
  return cbEl("div", { class: "kp-taker" }, title, body, tools);
}
function grid(ns) { const g = cbEl("div", { class: "kp-grid" }); for (const n of ns) g.append(card(n)); return g; }
function card(n) {
  const shared = n.owner !== CB_USER.id;
  const c = cbEl("div", { class: "kp-card", style: { background: COLORS[n.color] || COLORS.default }, onclick: e => { if (!e.target.closest("button,input")) edit(n); } },
    n.title ? cbEl("b", { text: n.title }) : null,
    n.items ? cbEl("div", { class: "kp-items" }, ...n.items.slice(0, 8).map((it, i) => cbEl("label", { class: it.done ? "done" : "" }, cbEl("input", { type: "checkbox", checked: it.done, onchange: async e => { n.items[i].done = e.target.checked; await save(n.id, { items: n.items }).catch(hubErr); render(); } }), cbEl("span", { text: it.t }))), n.items.length > 8 ? cbEl("span", { class: "muted small", text: `+ ${n.items.length - 8} more` }) : null)
      : cbEl("div", { class: "kp-body", text: n.body.slice(0, 600) }),
    cbEl("div", { class: "kp-meta" }, ...n.labels.map(l => cbEl("span", { class: "chip", text: l })), n.remind_at ? cbEl("span", { class: "chip", text: "⏰ " + hubWhen(n.remind_at) }) : null, shared ? cbEl("span", { class: "chip", text: "from " + hubWho(n.owner) }) : null),
    cbEl("div", { class: "kp-act" },
      cbEl("button", { class: "icon-btn" + (n.pinned ? " on" : ""), title: n.pinned ? "Unpin" : "Pin", html: cbIcon("pin"), onclick: () => save(n.id, { pinned: !n.pinned }).then(render, hubErr) }),
      cbEl("button", { class: "icon-btn", title: "Colour", html: cbIcon("image"), onclick: e => cbMenuAt(e.currentTarget, Object.keys(COLORS).map(k => ({ label: k[0].toUpperCase() + k.slice(1), run: () => save(n.id, { color: k }).then(render, hubErr) }))) }),
      cbEl("button", { class: "icon-btn", title: "Remind me", html: cbIcon("clock"), onclick: () => remind(n) }),
      cbEl("button", { class: "icon-btn", title: "Share", html: cbIcon("share"), onclick: () => share(n) }),
      cbEl("button", { class: "icon-btn", title: "More", html: cbIcon("more"), onclick: e => cbMenuAt(e.currentTarget, n.trashed ? [
        { label: "Restore", icon: "restore", run: () => save(n.id, { trashed: false }).then(render, hubErr) },
        shared ? null : { label: "Delete forever", icon: "trash", danger: true, run: () => q(sb.from("kp_notes").delete().eq("id", n.id)).then(render, hubErr) }] : [
        { label: n.archived ? "Unarchive" : "Archive", icon: "folder", run: () => save(n.id, { archived: !n.archived }).then(render, hubErr) },
        { label: "Add label", icon: "grid", run: async () => { const l = await cbPrompt("Label", ""); if (l) save(n.id, { labels: [...new Set([...n.labels, l.trim()])] }).then(render, hubErr); } },
        n.labels.length ? { label: "Remove labels", icon: "close", run: () => save(n.id, { labels: [] }).then(render, hubErr) } : null,
        { label: "Make a copy", icon: "copy", run: () => q(sb.from("kp_notes").insert({ title: n.title, body: n.body, items: n.items, color: n.color, labels: n.labels })).then(render, hubErr) },
        { label: "Copy to a Doc", icon: "open", run: () => toDoc(n) },
        shared ? null : { label: "Delete", icon: "trash", danger: true, run: () => save(n.id, { trashed: true }).then(() => { cbToast("Note moved to Trash"); render(); }, hubErr) }]) })));
  return c;
}
async function edit(n) {
  const title = cbEl("input", { class: "kp-in big", value: n.title, placeholder: "Title" });
  let body, items;
  if (n.items) {
    items = cbEl("div", { class: "kp-items edit" });
    const row = (it) => cbEl("div", { class: "kp-irow" }, cbEl("input", { type: "checkbox", checked: it.done }), cbEl("input", { class: "kp-in", value: it.t, placeholder: "List item", onkeydown: e => { if (e.key === "Enter") { e.preventDefault(); const r = row({ t: "", done: false }); e.target.parentNode.after(r); r.querySelector(".kp-in").focus(); } } }), cbEl("button", { class: "icon-btn", html: cbIcon("close"), onclick: e => e.currentTarget.parentNode.remove() }));
    for (const it of n.items) items.append(row(it));
    items.append(cbEl("button", { class: "btn ghost", html: cbIcon("plus") + "<span>List item</span>", onclick: e => { const r = row({ t: "", done: false }); e.currentTarget.before(r); r.querySelector(".kp-in").focus(); } }));
  } else { body = cbEl("textarea", { class: "kp-in", rows: 10, placeholder: "Note" }); body.value = n.body; }
  const ok = await cbDialog(n.owner === CB_USER.id ? "Note" : "Note from " + hubWho(n.owner), cbEl("div", { class: "kp-edit", style: { background: COLORS[n.color] || COLORS.default } }, title, body || items, cbEl("p", { class: "muted small", text: "Edited " + cbAgo(n.updated_at) })), [{ label: "Cancel", result: false }, { label: "Save", cls: "primary", result: true }]);
  if (!ok) return;
  const patch = { title: title.value.trim() };
  if (items) patch.items = [...items.querySelectorAll(".kp-irow")].map(r => ({ t: r.querySelector(".kp-in").value.trim(), done: r.querySelector("[type=checkbox]").checked })).filter(i => i.t);
  else patch.body = body.value;
  await save(n.id, patch).catch(hubErr); render();
}
async function remind(n) {
  const f = await hubForm("Remind me", [{ key: "at", label: "When", type: "datetime-local", value: hubLocal(n.remind_at) }], "Save", n.remind_at ? [{ label: "Remove", result: "clear" }] : []);
  if (f === "clear") return save(n.id, { remind_at: null }).then(render, hubErr);
  if (f?.at) { await save(n.id, { remind_at: hubISO(f.at) }).catch(hubErr); render(); }
}
async function share(n) {
  if (n.owner !== CB_USER.id) return cbToast("Only " + hubWho(n.owner) + " can share this note");
  const col = await q(sb.from("kp_collab").select("user_id").eq("note_id", n.id)).catch(() => []);
  await hubPeople(col.map(c => c.user_id));
  const u = await cbPrompt("Collaborators", "", col.length ? "Shared with " + col.map(c => hubWho(c.user_id)).join(", ") + ". Add a username:" : "Add someone by username. They can edit the note.");
  if (!u) return;
  try { await q(sb.rpc("kp_share", { p_note: n.id, p_username: u.trim().toLowerCase() })); cbToast("Shared with " + u); } catch (e) { hubErr(e); }
}
async function toDoc(n) {
  const text = n.items ? n.items.map(i => (i.done ? "☑ " : "☐ ") + i.t).join("\n") : n.body;
  const html = text.split("\n").map(l => "<p>" + (cbEsc(l) || "<br>") + "</p>").join("");
  try { const f = await cbFiles.create("doc", n.title || "Note", { content: { html } }); location.href = cbFileURL(f); } catch (e) { hubErr(e); }
}
// reminders fire while any Keep page is open
setInterval(() => { const now = Date.now(); for (const n of notes) if (n.remind_at && !n.trashed && Math.abs(new Date(n.remind_at) - now) < 30000 && !n._told) { n._told = 1; cbToast("⏰ " + (n.title || n.body.slice(0, 60) || "Reminder"), 8000); try { new Notification("Cinnabar Keep", { body: n.title || n.body.slice(0, 80) }); } catch { } } }, 20000);

(async () => {
  UI = await hubBoot("Keep");
  UI.search = cbEl("input", { class: "field", type: "search", placeholder: "Search notes", style: { width: "240px", height: "32px" }, oninput: () => { clearTimeout(UI.t); UI.t = setTimeout(render, 250); } });
  UI.actions.append(UI.search);
  addEventListener("hashchange", render);
  render();
  try { Notification.permission === "default" && Notification.requestPermission(); } catch { }
})();
