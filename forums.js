/* Cinnabar Forums: boards (open to everyone signed in, or to one class), threads, replies, votes, moderation. */
"use strict";
let UI, boards = [], myClasses = [];
const q = async p => { const { data, error } = await p; if (error) throw new Error(error.message); return data; };
const route = () => Object.fromEntries(new URLSearchParams(location.hash.slice(1)));
const go = h => { location.hash = new URLSearchParams(h).toString(); };

async function loadBoards() {
  boards = await q(sb.from("fr_boards").select("*").order("created_at"));
  const mem = await q(sb.from("cr_members").select("class_id,role").eq("user_id", CB_USER.id));
  myClasses = mem.length ? (await q(sb.from("cr_classes").select("id,name,color").in("id", mem.map(m => m.class_id)))).map(c => ({ ...c, role: mem.find(m => m.class_id === c.id).role })) : [];
}
const isMod = b => b.owner === CB_USER.id || (b.class_id && myClasses.find(c => c.id === b.class_id)?.role === "teacher");

async function render() {
  const r = route();
  UI.actions.innerHTML = "";
  try {
    if (r.thread) return await renderThread(r.thread);
    if (r.board) return await renderBoard(boards.find(b => b.id === r.board));
    if (r.class) { const b = boards.find(x => x.class_id === r.class); if (b) return go({ board: b.id }); }
    return renderHome(r.class);
  } catch (e) { hubErr(e); }
}

function renderHome(forClass) {
  UI.title.textContent = "Forums";
  const v = UI.view = hubView(UI.view);
  UI.actions.append(cbEl("button", { class: "btn primary", text: "New board", onclick: () => newBoard(forClass) }));
  const tiles = cbEl("div", { class: "tiles" });
  for (const b of boards) {
    const c = myClasses.find(x => x.id === b.class_id);
    tiles.append(cbEl("button", { class: "tile", onclick: () => go({ board: b.id }) },
      cbEl("div", { class: "ban", style: { background: `linear-gradient(135deg, ${c?.color || b.color}, ${(c?.color || b.color)}aa)` } }, cbEl("b", { text: b.name }), cbEl("span", { text: c ? "Class board · " + c.name : "Open to everyone" })),
      cbEl("div", { class: "body" }, cbEl("span", { text: b.description || "" }))));
  }
  tiles.append(cbEl("button", { class: "tile add", onclick: () => newBoard(forClass), html: cbIcon("plus") + "<span>New board</span>" }));
  if (forClass && !boards.some(b => b.class_id === forClass)) v.append(cbEl("div", { class: "post", style: { marginBottom: "14px" } }, cbEl("b", { text: "This class doesn't have a forum yet." }), cbEl("div", { class: "muted", text: "A teacher can make one with New board." })));
  v.append(tiles);
}
async function newBoard(forClass) {
  const teach = myClasses.filter(c => c.role === "teacher");
  const f = await hubForm("New board", [
    { key: "name", label: "Name", required: true }, { key: "description", label: "What is it for?", type: "textarea", rows: 3 },
    { key: "class_id", label: "Who can see it", type: "select", value: teach.some(c => c.id === forClass) ? forClass : "", options: [["", "Everyone signed in to Cinnabar"], ...teach.map(c => [c.id, "Only " + c.name])] },
    { key: "color", label: "Colour", type: "select", options: HUB_COLORS.map(c => [c, c]) },
  ], "Create");
  if (!f) return;
  f.description = f.description || "";
  try { const b = await q(sb.from("fr_boards").insert(f).select().single()); await loadBoards(); go({ board: b.id }); } catch (e) { hubErr(e); }
}

async function renderBoard(b) {
  if (!b) return go({});
  UI.title.innerHTML = "";
  UI.title.append(cbEl("span", { class: "crumb", text: "Forums", onclick: () => go({}) }), cbEl("span", { class: "muted", text: "›" }), cbEl("span", { text: b.name }));
  UI.actions.append(cbEl("input", { class: "field", type: "search", placeholder: "Search threads", style: { width: "220px", height: "32px" }, value: route().q || "", onkeydown: e => { if (e.key === "Enter") go({ board: b.id, q: e.target.value }); } }));
  if (isMod(b)) UI.actions.append(cbEl("button", { class: "icon-btn", html: cbIcon("more"), title: "Board settings", onclick: e => cbMenuAt(e.currentTarget, [
    { label: "Rename", icon: "edit", run: async () => { const n = await cbPrompt("Rename board", b.name); if (n) { await q(sb.from("fr_boards").update({ name: n }).eq("id", b.id)).catch(hubErr); await loadBoards(); render(); } } },
    { label: "Delete board", icon: "trash", danger: true, run: async () => { if (await cbConfirm("Delete " + b.name + "?", "Every thread and reply on it is deleted. This can't be undone.", "Delete")) { await q(sb.from("fr_boards").delete().eq("id", b.id)).catch(hubErr); await loadBoards(); go({}); } } }]) }));
  UI.actions.append(cbEl("button", { class: "btn primary", text: "New thread", onclick: () => newThread(b) }));
  const v = UI.view = hubView(UI.view);
  let r = sb.from("fr_threads").select("*").eq("board_id", b.id).order("pinned", { ascending: false }).order("last_activity", { ascending: false }).limit(200);
  const term = route().q; if (term) r = r.or(`title.ilike.%${term.replace(/[%_,()\\]/g, "")}%,body.ilike.%${term.replace(/[%_,()\\]/g, "")}%`);
  const threads = await q(r);
  const ids = threads.map(t => t.id);
  const [votes, replies] = ids.length ? await Promise.all([q(sb.from("fr_votes").select("thread_id,user_id").in("thread_id", ids)), q(sb.from("fr_replies").select("thread_id").in("thread_id", ids))]) : [[], []];
  await hubPeople(threads.map(t => t.author));
  if (b.description) v.append(cbEl("div", { class: "muted", text: b.description, style: { marginBottom: "12px" } }));
  if (!threads.length) return v.append(hubEmpty("forum", term ? "No threads match" : "Start the conversation", term ? "Try different words." : "Ask a question or share something with this board.", cbEl("button", { class: "btn primary", text: "New thread", onclick: () => newThread(b) })));
  const list = cbEl("div", { class: "stack anim" });
  for (const t of threads) {
    const vs = votes.filter(x => x.thread_id === t.id), n = replies.filter(x => x.thread_id === t.id).length;
    list.append(cbEl("div", { class: "post click thread-row", onclick: e => { if (!e.target.closest(".vote")) go({ thread: t.id }); } },
      voteBox(t, vs),
      cbEl("div", { class: "t" }, cbEl("b", { text: t.title }),
        cbEl("div", { class: "meta", style: { marginTop: "4px" } }, t.pinned ? cbEl("span", { class: "chip red", text: "Pinned" }) : null, t.locked ? cbEl("span", { class: "chip", text: "Locked" }) : null, t.solved ? cbEl("span", { class: "chip green", text: "Solved" }) : null,
          cbEl("span", { text: `${hubWho(t.author)} · ${n} ${n === 1 ? "reply" : "replies"} · active ${cbAgo(t.last_activity)}` }))),
      hubAvatar(t.author)));
  }
  v.append(list);
}
function voteBox(t, vs) {
  let mine = vs.some(x => x.user_id === CB_USER.id), n = vs.length;
  const btn = cbEl("button", { class: mine ? "on" : "", title: "Upvote", html: cbIcon("up") }), count = cbEl("b", { text: n });
  btn.onclick = async e => {
    e.stopPropagation(); btn.disabled = true;
    try {
      if (mine) await q(sb.from("fr_votes").delete().eq("thread_id", t.id).eq("user_id", CB_USER.id)); else await q(sb.from("fr_votes").insert({ thread_id: t.id }));
      mine = !mine; n += mine ? 1 : -1; btn.classList.toggle("on", mine); count.textContent = n;
    } catch (ex) { hubErr(ex); } finally { btn.disabled = false; }
  };
  return cbEl("div", { class: "vote" }, btn, count);
}
async function newThread(b) {
  const f = await hubForm("New thread", [{ key: "title", label: "Title", required: true }, { key: "body", label: "Message", type: "textarea", rows: 8 }], "Post");
  if (!f) return;
  try { const t = await q(sb.from("fr_threads").insert({ board_id: b.id, title: f.title, body: f.body || "" }).select().single()); go({ thread: t.id }); } catch (e) { hubErr(e); }
}

async function renderThread(id) {
  const t = await q(sb.from("fr_threads").select("*").eq("id", id).single());
  const b = boards.find(x => x.id === t.board_id); if (!b) return go({});
  const mod = isMod(b), own = t.author === CB_USER.id;
  UI.title.innerHTML = "";
  UI.title.append(cbEl("span", { class: "crumb", text: b.name, onclick: () => go({ board: b.id }) }), cbEl("span", { class: "muted", text: "›" }), cbEl("span", { text: t.title, style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }));
  const set = async patch => { try { await q(sb.from("fr_threads").update(patch).eq("id", t.id)); render(); } catch (e) { hubErr(e); } };
  if (mod || own) UI.actions.append(cbEl("button", { class: "icon-btn", html: cbIcon("more"), title: "Thread options", onclick: e => cbMenuAt(e.currentTarget, [
    own && { label: "Edit", icon: "edit", run: async () => { const f = await hubForm("Edit thread", [{ key: "title", label: "Title", value: t.title, required: true }, { key: "body", label: "Message", type: "textarea", rows: 8, value: t.body }]); if (f) set({ title: f.title, body: f.body || "" }); } },
    (own || mod) && { label: t.solved ? "Mark unsolved" : "Mark solved", icon: "check", run: () => set({ solved: !t.solved }) },
    mod && { label: t.pinned ? "Unpin" : "Pin to top", icon: "pin", run: () => set({ pinned: !t.pinned }) },
    mod && { label: t.locked ? "Unlock" : "Lock replies", icon: "lock", run: () => set({ locked: !t.locked }) },
    "-",
    { label: "Delete thread", icon: "trash", danger: true, run: async () => { if (await cbConfirm("Delete this thread?", "All replies are deleted too.", "Delete")) { await q(sb.from("fr_threads").delete().eq("id", t.id)).catch(hubErr); go({ board: b.id }); } } }]) }));
  const v = UI.view = hubView(UI.view);
  const [replies, votes] = await Promise.all([q(sb.from("fr_replies").select("*").eq("thread_id", t.id).order("created_at")), q(sb.from("fr_votes").select("thread_id,user_id").eq("thread_id", t.id))]);
  await hubPeople([t.author, ...replies.map(r => r.author), CB_USER.id]);
  v.append(cbEl("div", { class: "post thread-row" }, voteBox(t, votes), cbEl("div", { class: "t" },
    cbEl("div", { class: "head" }, hubAvatar(t.author), cbEl("div", { class: "who" }, cbEl("b", { text: hubWho(t.author) }), cbEl("span", { text: cbAgo(t.created_at) }))),
    cbEl("h2", { text: t.title, style: { font: "700 22px var(--display)", margin: "12px 0 0" } }),
    cbEl("div", { class: "meta" }, t.pinned ? cbEl("span", { class: "chip red", text: "Pinned" }) : null, t.locked ? cbEl("span", { class: "chip", text: "Locked" }) : null, t.solved ? cbEl("span", { class: "chip green", text: "Solved" }) : null),
    cbEl("div", { class: "txt", text: t.body }))));
  v.append(cbEl("div", { class: "cap", text: `${replies.length} ${replies.length === 1 ? "reply" : "replies"}`, style: { padding: "18px 2px 8px" } }));
  const list = cbEl("div", { class: "stack anim" });
  for (const r of replies) {
    const card = cbEl("div", { class: "post" }, cbEl("div", { class: "head" }, hubAvatar(r.author), cbEl("div", { class: "who" }, cbEl("b", { text: hubWho(r.author) + (r.author === t.author ? " · author" : "") }), cbEl("span", { text: cbAgo(r.created_at) }))), cbEl("div", { class: "txt", text: r.body }));
    if (r.author === CB_USER.id || mod) card.firstChild.append(cbEl("button", { class: "icon-btn", title: "Delete reply", html: cbIcon("trash"), onclick: async () => { if (await cbConfirm("Delete this reply?", "", "Delete")) { await q(sb.from("fr_replies").delete().eq("id", r.id)).catch(hubErr); render(); } } }));
    list.append(card);
  }
  v.append(list);
  if (t.locked && !mod) return v.append(cbEl("div", { class: "post muted", style: { marginTop: "10px" }, text: "This thread is locked. No new replies." }));
  const box = cbEl("textarea", { class: "field", rows: 4, placeholder: "Write a reply" });
  const send = cbEl("button", { class: "btn primary", style: { marginTop: "8px" } }, cbIconEl("send"), cbEl("span", { text: "Reply" }));
  send.onclick = async () => {
    if (!box.value.trim()) return;
    send.disabled = true;
    try { await q(sb.from("fr_replies").insert({ thread_id: t.id, body: box.value.trim() })); render(); } catch (e) { hubErr(e); send.disabled = false; }
  };
  box.onkeydown = e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send.click(); };
  v.append(cbEl("div", { class: "post", style: { marginTop: "12px" } }, cbEl("div", { class: "head" }, hubAvatar(CB_USER.id), cbEl("b", { text: "Reply as " + cbName() })), box, send));
}

(async () => {
  UI = await hubBoot("Forums");
  await loadBoards().catch(e => hubErr(new Error(/fr_boards|relation|schema cache/.test(e.message) ? "Forums aren't set up on this Cinnabar server yet (db/classroom.sql)." : e.message)));
  addEventListener("hashchange", render);
  render();
  sb.channel("forums").on("postgres_changes", { event: "INSERT", schema: "public", table: "fr_replies" }, ev => { if (route().thread === ev.new.thread_id && ev.new.author !== CB_USER.id) render(); }).subscribe();
})();
