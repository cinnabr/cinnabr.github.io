/* Cinnabar Mail: mail between Cinnabar usernames (db/suite.sql). No email addresses: nothing goes to or comes from the internet. */
"use strict";
let UI, labels = [], settings = null, box = [];
const q = async p => { const { data, error } = await p; if (error) throw new Error(error.message); return data; };
const route = () => Object.fromEntries(new URLSearchParams(location.hash.slice(1)));
const go = h => { location.hash = new URLSearchParams(h).toString(); };
const FOLDERS = [["inbox", "Inbox", "home"], ["starred", "Starred", "star"], ["important", "Important", "pin"], ["snoozed", "Snoozed", "clock"], ["sent", "Sent", "send"], ["drafts", "Drafts", "edit"], ["archive", "All archived", "folder"], ["spam", "Spam", "lock"], ["trash", "Trash", "trash"]];
const names = s => (s || "").split(/[\s,;]+/).map(x => x.trim().toLowerCase()).filter(Boolean);

async function load() {
  labels = await q(sb.from("ml_labels").select("*").order("name"));
  settings = await q(sb.from("ml_settings").select("*").maybeSingle()) || { signature: "", vacation_on: false, vacation_subject: "", vacation_body: "", undo_seconds: 5 };
}

function side(r) {
  const s = cbEl("div", { class: "ml-side" }, cbEl("button", { class: "btn primary ml-compose", html: cbIcon("edit") + "<span>Compose</span>", onclick: () => compose() }));
  const unread = box.filter(b => b.folder === "inbox" && !b.read).length;
  for (const [id, name, icon] of FOLDERS) {
    const a = cbEl("button", { class: "ml-f" + ((r.f || "inbox") === id && !r.label ? " on" : ""), onclick: () => go({ f: id }) }, cbIconEl(icon), cbEl("span", { text: name }));
    if (id === "inbox" && unread) a.append(cbEl("b", { text: unread }));
    s.append(a);
  }
  s.append(cbEl("div", { class: "cap", text: "Labels" }));
  for (const l of labels) s.append(cbEl("button", { class: "ml-f" + (r.label === l.name ? " on" : ""), onclick: () => go({ label: l.name }) }, cbEl("i", { class: "ml-dot", style: { background: l.color } }), cbEl("span", { text: l.name })));
  s.append(cbEl("button", { class: "ml-f muted", onclick: newLabel }, cbIconEl("plus"), cbEl("span", { text: "New label" })));
  return s;
}
async function newLabel() {
  const f = await hubForm("New label", [{ key: "name", label: "Name", required: true }, { key: "color", label: "Colour", type: "select", options: HUB_COLORS.map(c => [c, c]) }], "Create");
  if (f) { try { await q(sb.from("ml_labels").insert(f)); await load(); render(); } catch (e) { hubErr(e); } }
}

async function render() {
  const r = route();
  UI.actions.innerHTML = "";
  UI.actions.append(cbEl("input", { class: "field", type: "search", placeholder: "Search mail", value: r.q || "", style: { width: "240px", height: "32px" }, onkeydown: e => { if (e.key === "Enter") go({ ...r, q: e.target.value, t: "" }); } }),
    cbEl("button", { class: "icon-btn", title: "Mail settings", html: cbIcon("more"), onclick: settingsDialog }));
  try {
    box = await q(sb.from("ml_boxes").select("*").order("sent_at", { ascending: false }).limit(1000));
    const v = UI.view = hubView(UI.view);
    const pane = cbEl("div", { class: "ml-pane" });
    v.append(cbEl("div", { class: "ml-wrap" }, side(r), pane));
    if (r.t) return await thread(pane, r.t);
    if (r.f === "drafts") return await drafts(pane);
    await list(pane, r);
  } catch (e) { hubErr(e); }
}

function pick(r) {
  const now = Date.now(), f = r.f || "inbox";
  return box.filter(b => {
    if (r.label) return b.labels.includes(r.label) && b.folder !== "trash";
    const snoozed = b.snoozed_until && new Date(b.snoozed_until) > now;
    if (f === "snoozed") return snoozed;
    if (snoozed && f === "inbox") return false;
    if (f === "starred") return b.starred && b.folder !== "trash";
    if (f === "important") return b.important && b.folder !== "trash";
    return b.folder === f;
  });
}
async function list(pane, r) {
  UI.title.textContent = r.label || (FOLDERS.find(x => x[0] === (r.f || "inbox")) || FOLDERS[0])[1];
  let rows = pick(r);
  const byThread = new Map();
  for (const b of rows) if (!byThread.has(b.thread_id)) byThread.set(b.thread_id, b);   // newest first, one row per conversation
  const ids = box.filter(b => byThread.has(b.thread_id)).map(b => b.message_id);
  const msgs = ids.length ? await q(sb.from("ml_messages").select("id,thread_id,sender,subject,body,sent_at,attachments").in("id", ids.slice(0, 500))) : [];
  const sentTo = (r.f === "sent" || r.f === "drafts") && msgs.length ? await q(sb.from("ml_recipients").select("message_id,user_id").in("message_id", msgs.map(m => m.id))) : [];
  await hubPeople([...msgs.map(m => m.sender), ...sentTo.map(x => x.user_id)]);
  let threads = [...byThread.values()].map(b => {
    const ms = msgs.filter(m => m.thread_id === b.thread_id).sort((a, c) => a.sent_at.localeCompare(c.sent_at));
    const all = box.filter(x => x.thread_id === b.thread_id);
    return { b, ms, last: ms.at(-1), unread: all.some(x => !x.read), starred: all.some(x => x.starred) };
  }).filter(t => t.last);
  if (r.q) { const s = r.q.toLowerCase(); threads = threads.filter(t => t.ms.some(m => (m.subject + " " + m.body + " " + hubWho(m.sender) + " " + cbUname(HUB_PEOPLE[m.sender]?.email)).toLowerCase().includes(s))); }
  if (!threads.length) return pane.append(hubEmpty("send", r.q ? "Nothing matches" : "All clear", r.q ? "Try different words." : "Mail sent to your username shows up here.", cbEl("button", { class: "btn primary", text: "Compose", onclick: () => compose() })));
  const sel = new Set();
  const tools = cbEl("div", { class: "ml-tools" });
  const bulk = (label, icon, fn) => cbEl("button", { class: "btn ghost", title: label, html: cbIcon(icon) + `<span>${label}</span>`, onclick: async () => { if (!sel.size) return cbToast("Tick some conversations first"); try { await fn([...sel]); render(); } catch (e) { hubErr(e); } } });
  const inTrash = (r.f || "inbox") === "trash";
  tools.append(bulk("Archive", "folder", ids => move(ids, "archive")), bulk(inTrash ? "Delete forever" : "Delete", "trash", ids => inTrash ? forever(ids) : move(ids, "trash")),
    bulk("Mark read", "check", ids => setFlag(ids, { read: true })), bulk("Mark unread", "clock", ids => setFlag(ids, { read: false })),
    (r.f === "spam" ? bulk("Not spam", "restore", ids => move(ids, "inbox")) : bulk("Spam", "lock", ids => move(ids, "spam"))));
  const listEl = cbEl("div", { class: "ml-list" });
  for (const t of threads) {
    const who = r.f === "sent" ? "To: " + [...new Set(sentTo.filter(x => t.ms.some(m => m.id === x.message_id)).map(x => hubWho(x.user_id)))].join(", ")
      : [...new Set(t.ms.map(m => m.sender === CB_USER.id ? "me" : hubWho(m.sender)))].join(", ");
    const box_ = cbEl("input", { type: "checkbox", onclick: e => { e.stopPropagation(); e.target.checked ? sel.add(t.b.thread_id) : sel.delete(t.b.thread_id); } });
    const star = cbEl("button", { class: "icon-btn ml-star" + (t.starred ? " on" : ""), title: "Star", html: cbIcon("star"), onclick: async e => { e.stopPropagation(); await setFlag([t.b.thread_id], { starred: !t.starred }).catch(hubErr); render(); } });
    const lbls = [...new Set(box.filter(x => x.thread_id === t.b.thread_id).flatMap(x => x.labels))];
    listEl.append(cbEl("div", { class: "ml-row" + (t.unread ? " unread" : ""), onclick: () => go({ ...r, t: t.b.thread_id }) }, box_, star,
      cbEl("span", { class: "ml-who", text: who + (t.ms.length > 1 ? ` (${t.ms.length})` : "") }),
      cbEl("span", { class: "ml-sub" }, ...lbls.map(l => cbEl("span", { class: "chip", text: l, style: { background: (labels.find(x => x.name === l)?.color || "#5d6670") + "40" } })),
        cbEl("b", { text: t.last.subject || "(no subject)" }), cbEl("span", { class: "muted", text: " — " + t.last.body.slice(0, 140).replace(/\s+/g, " ") })),
      t.ms.some(m => m.attachments?.length) ? cbIconEl("link") : cbEl("span"),
      cbEl("span", { class: "ml-when", text: cbAgo(t.last.sent_at) })));
  }
  pane.append(tools, listEl);
}
const mine = tids => box.filter(b => tids.includes(b.thread_id));
async function setFlag(tids, patch) { for (const b of mine(tids)) await q(sb.from("ml_boxes").update(patch).eq("message_id", b.message_id).eq("user_id", CB_USER.id)); }
async function move(tids, folder) {
  for (const b of mine(tids)) {
    const f = b.folder === "sent" && folder !== "trash" && folder !== "archive" ? "sent" : folder;   // your copy of something you sent stays "sent" unless archived or deleted
    if (f !== b.folder) await q(sb.from("ml_boxes").update({ folder: f, snoozed_until: null }).eq("message_id", b.message_id).eq("user_id", CB_USER.id));
  }
  cbToast(folder === "trash" ? "Moved to Trash" : folder === "archive" ? "Archived" : folder === "spam" ? "Marked as spam" : "Moved to Inbox");
}
async function forever(tids) {
  if (!(await cbConfirm("Delete forever?", "Your copy of these conversations is deleted. This can't be undone.", "Delete forever", true))) return;
  for (const b of mine(tids)) await q(sb.from("ml_boxes").delete().eq("message_id", b.message_id).eq("user_id", CB_USER.id));
}

async function thread(pane, tid) {
  const mineRows = box.filter(b => b.thread_id === tid);
  const ms = (await q(sb.from("ml_messages").select("*").in("id", mineRows.map(b => b.message_id)))).sort((a, c) => a.sent_at.localeCompare(c.sent_at));
  if (!ms.length) return go({});
  const rcpt = await q(sb.from("ml_recipients").select("*").in("message_id", ms.map(m => m.id)));
  await hubPeople([...ms.map(m => m.sender), ...rcpt.map(x => x.user_id)]);
  UI.title.innerHTML = "";
  UI.title.append(cbEl("span", { class: "crumb", text: "Mail", onclick: () => history.back() }), cbEl("span", { class: "muted", text: "›" }), cbEl("span", { text: ms[0].subject || "(no subject)" }));
  if (mineRows.some(b => !b.read)) setFlag([tid], { read: true }).catch(() => { });
  const r = route(), back = { ...r }; delete back.t;
  const lbls = new Set(mineRows.flatMap(b => b.labels));
  const tb = cbEl("div", { class: "ml-tools" },
    cbEl("button", { class: "btn ghost", title: "Back", html: cbIcon("left") + "<span>Back</span>", onclick: () => go(back) }),
    cbEl("button", { class: "btn ghost", title: "Archive", html: cbIcon("folder") + "<span>Archive</span>", onclick: async () => { await move([tid], "archive").catch(hubErr); go(back); } }),
    cbEl("button", { class: "btn ghost", title: "Delete", html: cbIcon("trash") + "<span>Delete</span>", onclick: async () => { await move([tid], "trash").catch(hubErr); go(back); } }),
    cbEl("button", { class: "btn ghost", title: "Snooze", html: cbIcon("clock") + "<span>Snooze</span>", onclick: e => cbMenuAt(e.currentTarget, [
      ["Later today", 4 * 36e5], ["Tomorrow", 24 * 36e5], ["Next week", 7 * 24 * 36e5]].map(([label, ms_]) => ({ label, icon: "clock", run: async () => { await setFlag([tid], { snoozed_until: new Date(Date.now() + ms_).toISOString() }).catch(hubErr); cbToast("Snoozed until " + hubWhen(new Date(Date.now() + ms_).toISOString())); go(back); } }))) }),
    cbEl("button", { class: "btn ghost", title: "Important", html: cbIcon("pin") + "<span>Important</span>", onclick: async () => { await setFlag([tid], { important: !mineRows.some(b => b.important) }).catch(hubErr); render(); } }),
    cbEl("button", { class: "btn ghost", title: "Label", html: cbIcon("grid") + "<span>Label</span>", onclick: e => cbMenuAt(e.currentTarget, labels.length ? labels.map(l => ({ label: (lbls.has(l.name) ? "✓ " : "") + l.name, run: async () => {
      for (const b of mineRows) { const s = new Set(b.labels); s.has(l.name) ? s.delete(l.name) : s.add(l.name); await q(sb.from("ml_boxes").update({ labels: [...s] }).eq("message_id", b.message_id).eq("user_id", CB_USER.id)).catch(hubErr); }
      render(); } })) : [{ label: "Make a label first", icon: "plus", run: newLabel }]) }),
    cbEl("button", { class: "btn ghost", title: "Print", html: cbIcon("print") + "<span>Print</span>", onclick: () => print() }));
  pane.append(tb);
  const wrap = cbEl("div", { class: "ml-thread" });
  for (const m of ms) {
    const to = rcpt.filter(x => x.message_id === m.id);
    const line = k => to.filter(x => x.kind === k).map(x => cbUname(HUB_PEOPLE[x.user_id]?.email)).join(", ");
    const head = cbEl("div", { class: "ml-mhead" }, hubAvatar(m.sender, 38),
      cbEl("div", { class: "grow" }, cbEl("b", { text: hubWho(m.sender) }), cbEl("span", { class: "muted", text: "  " + cbUname(HUB_PEOPLE[m.sender]?.email) }),
        cbEl("div", { class: "muted small", text: "to " + (line("to") || "—") + (line("cc") ? " · cc " + line("cc") : "") + (line("bcc") ? " · bcc " + line("bcc") : "") })),
      cbEl("span", { class: "muted small", text: hubWhen(m.sent_at) }),
      cbEl("button", { class: "icon-btn", title: "More", html: cbIcon("more"), onclick: e => cbMenuAt(e.currentTarget, [
        { label: "Reply", icon: "undo", run: () => reply(m, to, false) }, { label: "Reply all", icon: "undo", run: () => reply(m, to, true) },
        { label: "Forward", icon: "redo", run: () => forward(m) },
        m.sender !== CB_USER.id ? { label: "Block " + hubWho(m.sender), icon: "lock", danger: true, run: () => block(m.sender) } : null]) }));
    const atts = (m.attachments || []).map(a => cbEl("a", { class: "ml-att", href: cbFileURL(a), target: "_blank" }, cbKindIconEl(a.kind), cbEl("span", { text: a.title })));
    wrap.append(cbEl("article", { class: "ml-msg" }, head, cbEl("div", { class: "ml-body", text: m.body }), atts.length ? cbEl("div", { class: "ml-atts" }, ...atts) : null));
  }
  const last = ms.at(-1), lastTo = rcpt.filter(x => x.message_id === last.id);
  wrap.append(cbEl("div", { class: "ml-replybar" },
    cbEl("button", { class: "btn", html: cbIcon("undo") + "<span>Reply</span>", onclick: () => reply(last, lastTo, false) }),
    cbEl("button", { class: "btn", html: cbIcon("undo") + "<span>Reply all</span>", onclick: () => reply(last, lastTo, true) }),
    cbEl("button", { class: "btn", html: cbIcon("redo") + "<span>Forward</span>", onclick: () => forward(last) })));
  pane.append(wrap);
}
function cbKindIconEl(kind) { const s = cbEl("span", { class: "ml-kind" }); s.innerHTML = cbKindIcon(kind || "doc"); return s; }
const un = id => cbUname(HUB_PEOPLE[id]?.email);
function reply(m, to, all) {
  const me = CB_USER.id;
  const toList = m.sender === me ? to.filter(x => x.kind === "to").map(x => un(x.user_id)) : [un(m.sender)];
  const cc = all ? to.filter(x => x.user_id !== me && x.kind !== "bcc" && !(m.sender === me && x.kind === "to")).map(x => un(x.user_id)) : [];
  const quote = `\n\nOn ${hubWhen(m.sent_at)}, ${hubWho(m.sender)} wrote:\n` + m.body.split("\n").map(l => "> " + l).join("\n");
  compose({ to: toList.join(", "), cc: cc.join(", "), subject: /^re:/i.test(m.subject) ? m.subject : "Re: " + m.subject, body: quote, reply_to: m.id });
}
function forward(m) {
  compose({ subject: "Fwd: " + m.subject, body: `\n\n---------- Forwarded message ----------\nFrom: ${hubWho(m.sender)} (${un(m.sender)})\nDate: ${hubWhen(m.sent_at)}\nSubject: ${m.subject}\n\n${m.body}`, attachments: (m.attachments || []).filter(a => a.owner === CB_USER.id) });
}
async function block(id) {
  if (!(await cbConfirm("Block " + hubWho(id) + "?", "Their mail goes straight to Spam. You can unblock them in Mail settings.", "Block"))) return;
  await q(sb.from("ml_blocks").insert({ blocked: id })).catch(hubErr); cbToast("Blocked");
}

async function drafts(pane) {
  UI.title.textContent = "Drafts";
  const ds = await q(sb.from("ml_drafts").select("*").order("updated_at", { ascending: false }));
  if (!ds.length) return pane.append(hubEmpty("edit", "No drafts", "Anything you start writing is saved here until you send it."));
  const l = cbEl("div", { class: "ml-list" });
  for (const d of ds) l.append(cbEl("div", { class: "ml-row", onclick: () => compose(d) }, cbEl("span"), cbEl("span"), cbEl("span", { class: "ml-who", style: { color: "#ff8f73" }, text: "Draft" }),
    cbEl("span", { class: "ml-sub" }, cbEl("b", { text: d.subject || "(no subject)" }), cbEl("span", { class: "muted", text: " — to " + (d.to_list || "nobody yet") })), cbEl("span"), cbEl("span", { class: "ml-when", text: cbAgo(d.updated_at) })));
  pane.append(l);
}

/* People you can address: your contacts plus everyone you've had mail from or sent to */
async function known() {
  const c = await q(sb.from("ct_contacts").select("name,username").not("username", "is", null)).catch(() => []);
  const ids = Object.keys(HUB_PEOPLE);
  return [...c.map(x => [x.username, x.name]), ...ids.map(i => [un(i), hubWho(i)])].filter(x => x[0]);
}
async function compose(d = {}) {
  const dl = cbEl("datalist", { id: "ml-people" });
  for (const [u, n] of await known()) dl.append(cbEl("option", { value: u, text: n }));
  const f = (ph, v) => cbEl("input", { class: "field", placeholder: ph, value: v || "", list: "ml-people", autocapitalize: "none", spellcheck: "false" });
  const to = f("To (usernames)", d.to || d.to_list), cc = f("Cc", d.cc || d.cc_list), bcc = f("Bcc", d.bcc || d.bcc_list);
  const showCc = cbEl("button", { class: "btn ghost", type: "button", text: "Cc / Bcc", onclick: () => { cc.hidden = bcc.hidden = false; showCc.remove(); } });
  if (!cc.value && !bcc.value) cc.hidden = bcc.hidden = true; else showCc.hidden = true;
  const subject = cbEl("input", { class: "field", placeholder: "Subject", value: d.subject || "" });
  const sig = settings.signature && !d.id ? "\n\n-- \n" + settings.signature : "";
  const body = cbEl("textarea", { class: "field ml-text", rows: 12 }); body.value = (d.body || "") + (d.reply_to || d.body ? "" : sig);
  if (d.reply_to && sig) body.value = sig + body.value;
  let atts = [...(d.attachments || [])];
  const attRow = cbEl("div", { class: "ml-atts" });
  const drawAtts = () => { attRow.innerHTML = ""; for (const a of atts) attRow.append(cbEl("span", { class: "ml-att" }, cbKindIconEl(a.kind), cbEl("span", { text: a.title }), cbEl("button", { class: "icon-btn", type: "button", html: cbIcon("close"), onclick: () => { atts = atts.filter(x => x !== a); drawAtts(); } }))); };
  drawAtts();
  const attach = cbEl("button", { class: "btn ghost", type: "button", html: cbIcon("link") + "<span>Attach from Drive</span>", onclick: async () => {
    const files = await q(sb.from("files").select("id,title,kind,owner").eq("owner", CB_USER.id).neq("kind", "folder").order("updated_at", { ascending: false }).limit(50)).catch(hubErr) || [];
    const a = await cbDialog("Attach a file you own", cbEl("div", { class: "ml-pick" }, ...(files.length ? files : []).map(x => cbEl("button", { class: "ml-att", type: "button", onclick: e => { e.target.closest(".scrim").querySelector(".actions .primary").dataset.v = x.id; e.target.closest(".ml-pick").querySelectorAll(".ml-att").forEach(b => b.classList.toggle("on", b === e.currentTarget)); } }, cbKindIconEl(x.kind), cbEl("span", { text: x.title }))), files.length ? null : cbEl("p", { class: "muted", text: "You don't own any Drive files yet." })),
      [{ label: "Cancel", result: null }, { label: "Attach", cls: "primary", value: () => files.find(x => x.id === document.querySelector(".scrim .actions .primary").dataset.v) || undefined }]);
    if (a && !atts.some(x => x.id === a.id)) { atts.push(a); drawAtts(); }
  } });
  const ccRow = cbEl("div", { class: "ml-ccrow" }, to, showCc);
  const box_ = cbEl("div", { class: "ml-composer" }, ccRow, cc, bcc, subject, body, attRow, attach, dl, cbEl("p", { class: "muted small", text: "Mail only goes to Cinnabar usernames on this server." }));
  let draftId = d.id || null, saving;
  const snapshot = () => ({ to_list: to.value, cc_list: cc.value, bcc_list: bcc.value, subject: subject.value, body: body.value, attachments: atts, reply_to: d.reply_to || null, updated_at: new Date().toISOString() });
  const saveDraft = async () => {   // saved as you type, so nothing is lost to a closed tab or a power cut
    const s = snapshot(); if (!s.to_list && !s.subject && !s.body.replace(sig, "").trim()) return;
    try { if (draftId) await q(sb.from("ml_drafts").update(s).eq("id", draftId)); else draftId = (await q(sb.from("ml_drafts").insert(s).select("id").single())).id; } catch { }
  };
  box_.addEventListener("input", () => { clearTimeout(saving); saving = setTimeout(saveDraft, 1200); });
  const res = await cbDialog(d.reply_to ? "Reply" : "New message", box_, [
    { label: "Discard", result: "discard" }, { label: "Save draft", result: "draft" },
    { label: "Send", cls: "primary", value: () => { if (!names(to.value).length && !names(cc.value).length && !names(bcc.value).length) { cbToast("Add at least one username"); to.focus(); return undefined; } return "send"; } }]);
  clearTimeout(saving);
  if (res === "discard") { if (draftId) await q(sb.from("ml_drafts").delete().eq("id", draftId)).catch(() => { }); return render(); }
  if (res !== "send") { await saveDraft(); if (res === "draft" || draftId) cbToast("Saved to Drafts"); return render(); }
  await saveDraft();
  const send = () => q(sb.rpc("ml_send", { p_to: names(to.value), p_cc: names(cc.value), p_bcc: names(bcc.value), p_subject: subject.value, p_body: body.value, p_reply_to: d.reply_to || null, p_attachments: atts.map(a => ({ id: a.id, title: a.title, kind: a.kind, owner: CB_USER.id })), p_draft: draftId }));
  const secs = settings.undo_seconds ?? 5;
  if (!secs) return send().then(() => { cbToast("Sent"); render(); }, e => { hubErr(e); compose({ ...snapshot(), id: draftId }); });
  // undo send: wait a few seconds before actually sending; the draft is already saved if the tab closes meanwhile
  let undone = false;
  const t = cbEl("div", { class: "toast ml-undo", role: "status" }, cbEl("span", { text: "Sending…" }), cbEl("button", { class: "btn ghost", text: "Undo", onclick: () => { undone = true; t.remove(); compose({ ...snapshot(), id: draftId }); } }));
  $$(".toast").forEach(x => x.remove()); document.body.append(t);
  setTimeout(async () => { if (undone) return; t.remove(); try { await send(); cbToast("Sent"); render(); } catch (e) { hubErr(e); compose({ ...snapshot(), id: draftId }); } }, secs * 1000);
}

async function settingsDialog() {
  const blocks = await q(sb.from("ml_blocks").select("blocked")).catch(() => []);
  await hubPeople(blocks.map(b => b.blocked));
  const blockList = cbEl("div", { class: "stack" }, ...blocks.map(b => cbEl("div", { class: "ml-ccrow" }, cbEl("span", { class: "grow", text: hubWho(b.blocked) + " (" + un(b.blocked) + ")" }),
    cbEl("button", { class: "btn ghost", type: "button", text: "Unblock", onclick: async e => { await q(sb.from("ml_blocks").delete().eq("blocked", b.blocked)).catch(hubErr); e.target.parentNode.remove(); } }))));
  const f = await hubForm("Mail settings", [
    { key: "signature", label: "Signature", type: "textarea", rows: 3, value: settings.signature },
    { key: "undo_seconds", label: "Undo send", type: "select", value: String(settings.undo_seconds ?? 5), options: [["0", "Off"], ["5", "5 seconds"], ["10", "10 seconds"], ["20", "20 seconds"], ["30", "30 seconds"]] },
    { key: "vacation_on", label: "Out of office reply", type: "select", value: settings.vacation_on ? "1" : "", options: [["", "Off"], ["1", "On"]] },
    { key: "vacation_subject", label: "Out of office subject", value: settings.vacation_subject },
    { key: "vacation_body", label: "Out of office message", type: "textarea", rows: 3, value: settings.vacation_body },
  ], "Save", blocks.length ? [{ label: `Blocked (${blocks.length})`, result: "blocked" }] : []);
  if (f === "blocked") return cbDialog("Blocked people", blockList, [{ label: "Done", cls: "primary", result: true }]);
  if (!f) return;
  const row = { signature: f.signature || "", undo_seconds: +f.undo_seconds || 0, vacation_on: !!f.vacation_on, vacation_subject: f.vacation_subject || "", vacation_body: f.vacation_body || "" };
  if (row.vacation_on && !row.vacation_body) return cbToast("Write an out of office message first");
  try { await q(sb.from("ml_settings").upsert({ owner: CB_USER.id, ...row })); await load(); cbToast("Settings saved"); } catch (e) { hubErr(e); }
}

(async () => {
  UI = await hubBoot("Mail");
  try { await load(); } catch (e) { hubErr(e); }
  const want = route().compose;   // mail.html#compose=<username>, from Contacts
  if (want) { history.replaceState(null, "", location.pathname); compose({ to: want }); }
  addEventListener("hashchange", render);
  render();
  let last = 0;
  const refresh = () => { if (document.hidden || document.querySelector(".scrim") || route().t) return; if (Date.now() - last > 3000) { last = Date.now(); render(); } };
  try { sb.channel("ml").on("postgres_changes", { event: "*", schema: "public", table: "ml_boxes", filter: "user_id=eq." + CB_USER.id }, refresh).subscribe(); } catch { }
  setInterval(refresh, 30000);
})();
