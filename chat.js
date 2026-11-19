/* Cinnabar Chat: direct messages and spaces between Cinnabar usernames (db/suite.sql ch_*). */
"use strict";
let UI, spaces = [], members = [], cur = null, last = {}, timer;
const q = async p => { const { data, error } = await p; if (error) throw new Error(error.message); return data; };
const sid = () => new URLSearchParams(location.hash.slice(1)).get("s");
const un = id => cbUname(HUB_PEOPLE[id]?.email);

async function loadSpaces() {
  spaces = await q(sb.from("ch_spaces").select("*").order("last_at", { ascending: false }));
  members = spaces.length ? await q(sb.from("ch_members").select("*").in("space_id", spaces.map(s => s.id))) : [];
  await hubPeople(members.map(m => m.user_id));
}
const others = s => members.filter(m => m.space_id === s.id && m.user_id !== CB_USER.id);
const titleOf = s => s.kind === "dm" ? (others(s).map(m => hubWho(m.user_id))[0] || "Just you") : s.name;
const myRow = s => members.find(m => m.space_id === s.id && m.user_id === CB_USER.id);

async function render() {
  try { await loadSpaces(); } catch (e) { return hubErr(e); }
  UI.title.textContent = "Chat";
  UI.actions.innerHTML = "";
  const v = UI.view = hubView(UI.view);
  const list = cbEl("div", { class: "ch-list" },
    cbEl("button", { class: "btn primary ml-compose", html: cbIcon("plus") + "<span>New chat</span>", onclick: e => cbMenuAt(e.currentTarget, [
      { label: "Message someone", icon: "send", run: newDm }, { label: "Create a space", icon: "people", run: newSpace }]) }));
  const dms = spaces.filter(s => s.kind === "dm"), sps = spaces.filter(s => s.kind === "space");
  const row = s => {
    const unread = s.last_at > (myRow(s)?.read_at || "") && last[s.id] !== s.last_at;
    const av = s.kind === "dm" ? hubAvatar(others(s)[0]?.user_id, 30) : cbEl("span", { class: "avatar", text: s.name[0], style: { background: cbColorFor(s.id), width: "30px", height: "30px", borderRadius: "9px" } });
    return cbEl("button", { class: "ch-item" + (s.id === sid() ? " on" : "") + (unread && s.id !== sid() ? " unread" : ""), onclick: () => { location.hash = "s=" + s.id; } }, av, cbEl("span", { class: "grow", text: titleOf(s) }), myRow(s)?.muted ? cbEl("span", { class: "muted small", text: "muted" }) : null);
  };
  list.append(cbEl("div", { class: "cap", text: "Direct messages" }), ...dms.map(row), cbEl("div", { class: "cap", text: "Spaces" }), ...sps.map(row));
  const pane = cbEl("div", { class: "ch-pane" });
  v.append(cbEl("div", { class: "ml-wrap ch-wrap" }, list, pane));
  cur = spaces.find(s => s.id === sid()) || null;
  if (!cur) return pane.append(hubEmpty("forum", spaces.length ? "Pick a conversation" : "Start chatting", "Message anyone on Cinnabar by their username, or make a space for a group.", cbEl("button", { class: "btn primary", text: "Message someone", onclick: newDm })));
  await openSpace(pane);
}
async function newDm() {
  const u = await cbPrompt("Message someone", "", "Their Cinnabar username");
  if (!u) return;
  try { const id = await q(sb.rpc("ch_dm", { p_username: u.trim().toLowerCase() })); location.hash = "s=" + id; } catch (e) { hubErr(e); }
}
async function newSpace() {
  const f = await hubForm("Create a space", [{ key: "name", label: "Space name", required: true }, { key: "people", label: "Add people (usernames, separated by commas)", placeholder: "ava.cho, ben.ortiz" }], "Create");
  if (!f) return;
  try { const id = await q(sb.rpc("ch_new_space", { p_name: f.name, p_usernames: (f.people || "").split(/[\s,;]+/).filter(Boolean) })); location.hash = "s=" + id; } catch (e) { hubErr(e); }
}

async function openSpace(pane) {
  const s = cur, mgr = myRow(s)?.role === "manager";
  const head = cbEl("div", { class: "ch-head" }, cbEl("b", { text: titleOf(s) }),
    cbEl("span", { class: "muted small", text: s.kind === "dm" ? un(others(s)[0]?.user_id) : members.filter(m => m.space_id === s.id).length + " members" }), cbEl("div", { class: "grow" }),
    cbEl("button", { class: "icon-btn", title: "Start a video call", html: cbIcon("video"), onclick: call }),
    cbEl("button", { class: "icon-btn", title: "Options", html: cbIcon("more"), onclick: e => cbMenuAt(e.currentTarget, [
      s.kind === "space" ? { label: "Members", icon: "people", run: membersDialog } : null,
      s.kind === "space" && mgr ? { label: "Add people", icon: "plus", run: async () => { const u = await cbPrompt("Add someone", "", "Username"); if (u) { await q(sb.rpc("ch_add", { p_space: s.id, p_username: u.trim().toLowerCase() })).then(render, hubErr); } } } : null,
      s.kind === "space" && mgr ? { label: "Rename", icon: "edit", run: async () => { const n = await cbPrompt("Rename space", s.name); if (n) await q(sb.from("ch_spaces").update({ name: n }).eq("id", s.id)).then(render, hubErr); } } : null,
      { label: myRow(s)?.muted ? "Unmute notifications" : "Mute notifications", icon: "clock", run: () => q(sb.from("ch_members").update({ muted: !myRow(s)?.muted }).eq("space_id", s.id).eq("user_id", CB_USER.id)).then(render, hubErr) },
      s.kind === "space" ? { label: "Leave space", icon: "logout", danger: true, run: async () => { if (await cbConfirm("Leave " + s.name + "?", "You can be added back by a manager.", "Leave")) { await q(sb.from("ch_members").delete().eq("space_id", s.id).eq("user_id", CB_USER.id)).catch(hubErr); location.hash = ""; } } } : null]) }));
  const log = cbEl("div", { class: "ch-log" });
  let replyTo = null;
  const replyChip = cbEl("div", { class: "ch-replying", hidden: true });
  const inp = cbEl("textarea", { class: "field ch-input", rows: 1, placeholder: "Message " + titleOf(s), onkeydown: e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } } });
  inp.addEventListener("input", () => { inp.style.height = "auto"; inp.style.height = Math.min(inp.scrollHeight, 160) + "px"; });
  const send = async () => {
    const body = inp.value.trim(); if (!body) return;
    inp.value = ""; inp.style.height = "auto";
    try { await q(sb.from("ch_messages").insert({ space_id: s.id, body, reply_to: replyTo })); replyTo = null; replyChip.hidden = true; await draw(); } catch (e) { inp.value = body; hubErr(e); }
  };
  const emoji = cbEl("button", { class: "icon-btn", title: "Emoji", text: "😊", onclick: e => cbMenuAt(e.currentTarget, ["😀", "😂", "👍", "❤️", "🎉", "🙏", "👀", "🔥"].map(x => ({ label: x, run: () => { inp.value += x; inp.focus(); } }))) });
  pane.append(head, log, cbEl("div", { class: "ch-compose" }, replyChip, cbEl("div", { class: "ch-row" }, emoji, inp, cbEl("button", { class: "btn primary", html: cbIcon("send"), title: "Send", onclick: send }))));
  let shown = "";
  async function draw() {
    const msgs = await q(sb.from("ch_messages").select("*").eq("space_id", s.id).order("created_at").limit(500));
    const reacts = msgs.length ? await q(sb.from("ch_reactions").select("*").in("message_id", msgs.map(m => m.id))) : [];
    const sig = msgs.map(m => m.id + (m.edited_at || "") + m.deleted).join() + reacts.length;
    if (sig === shown) return; shown = sig;
    await hubPeople(msgs.map(m => m.author));
    const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
    log.innerHTML = "";
    let prev = null, day = "";
    for (const m of msgs) {
      const d = new Date(m.created_at).toDateString();
      if (d !== day) { day = d; log.append(cbEl("div", { class: "ch-day", text: new Date(m.created_at).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }) })); prev = null; }
      const grouped = prev && prev.author === m.author && new Date(m.created_at) - new Date(prev.created_at) < 5 * 60e3;
      const mine = m.author === CB_USER.id;
      const rs = reacts.filter(r => r.message_id === m.id), byEmoji = {};
      for (const r of rs) (byEmoji[r.emoji] ||= []).push(r.user_id);
      const orig = m.reply_to && msgs.find(x => x.id === m.reply_to);
      const el = cbEl("div", { class: "ch-msg" + (grouped ? " grouped" : "") + (mine ? " mine" : "") },
        grouped ? cbEl("span", { class: "ch-gap" }) : hubAvatar(m.author, 34),
        cbEl("div", { class: "grow" },
          grouped ? null : cbEl("div", {}, cbEl("b", { text: mine ? "You" : hubWho(m.author) }), cbEl("span", { class: "muted small", text: "  " + new Date(m.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) })),
          orig ? cbEl("div", { class: "ch-quote", text: hubWho(orig.author) + ": " + (orig.deleted ? "deleted message" : orig.body.slice(0, 120)) }) : null,
          cbEl("div", { class: "ch-body" + (m.deleted ? " muted" : ""), text: m.deleted ? "This message was deleted" : m.body }),
          m.edited_at && !m.deleted ? cbEl("span", { class: "muted small", text: "(edited)" }) : null,
          Object.keys(byEmoji).length ? cbEl("div", { class: "ch-reacts" }, ...Object.entries(byEmoji).map(([e, us]) => cbEl("button", { class: "ch-react" + (us.includes(CB_USER.id) ? " on" : ""), title: us.map(hubWho).join(", "), text: e + " " + us.length, onclick: () => react(m, e, us.includes(CB_USER.id)) }))) : null),
        m.deleted ? null : cbEl("div", { class: "ch-hover" },
          ...["👍", "❤️", "😂"].map(e => cbEl("button", { class: "icon-btn", text: e, onclick: () => react(m, e, (byEmoji[e] || []).includes(CB_USER.id)) })),
          cbEl("button", { class: "icon-btn", title: "Reply", html: cbIcon("undo"), onclick: () => { replyTo = m.id; replyChip.hidden = false; replyChip.textContent = "Replying to " + hubWho(m.author) + ": " + m.body.slice(0, 80); inp.focus(); } }),
          mine || myRow(s)?.role === "manager" ? cbEl("button", { class: "icon-btn", html: cbIcon("more"), onclick: e => cbMenuAt(e.currentTarget, [
            mine ? { label: "Edit", icon: "edit", run: async () => { const b = await cbPrompt("Edit message", m.body); if (b) { await q(sb.from("ch_messages").update({ body: b, edited_at: new Date().toISOString() }).eq("id", m.id)).catch(hubErr); draw(); } } } : null,
            { label: "Delete", icon: "trash", danger: true, run: async () => { await q(sb.from("ch_messages").update({ deleted: true, body: "deleted" }).eq("id", m.id)).catch(hubErr); draw(); } }]) }) : null));
      log.append(el); prev = m;
    }
    if (!msgs.length) log.append(hubEmpty("forum", "Say hello", s.kind === "dm" ? "This is the start of your conversation." : "This is the start of the space."));
    if (atBottom || !log.dataset.seen) { log.scrollTop = log.scrollHeight; log.dataset.seen = 1; }
    last[s.id] = s.last_at;
    sb.from("ch_members").update({ read_at: new Date().toISOString() }).eq("space_id", s.id).eq("user_id", CB_USER.id).then(() => { });
  }
  async function react(m, e, had) {
    try { had ? await q(sb.from("ch_reactions").delete().eq("message_id", m.id).eq("user_id", CB_USER.id).eq("emoji", e)) : await q(sb.from("ch_reactions").insert({ message_id: m.id, emoji: e })); draw(); } catch (x) { hubErr(x); }
  }
  async function membersDialog() {
    const ms = members.filter(m => m.space_id === s.id);
    const body = cbEl("div", { class: "stack" }, ...ms.map(m => cbEl("div", { class: "mt-person" }, hubAvatar(m.user_id, 30), cbEl("span", { class: "grow", text: hubWho(m.user_id) + " (" + un(m.user_id) + ")" + (m.role === "manager" ? " · manager" : "") }),
      mgr && m.user_id !== CB_USER.id ? cbEl("button", { class: "btn ghost", text: "Remove", onclick: async e => { await q(sb.from("ch_members").delete().eq("space_id", s.id).eq("user_id", m.user_id)).catch(hubErr); e.target.parentNode.remove(); } }) : null)));
    await cbDialog("Members of " + s.name, body, [{ label: "Done", cls: "primary", result: true }]); render();
  }
  async function call() {
    const r = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => "abcdefghijklmnopqrstuvwxyz"[b % 26]).join("");
    const code = `${r(3)}-${r(4)}-${r(3)}`;
    try {
      await q(sb.from("mt_rooms").insert({ code, title: titleOf(s) }));
      await q(sb.from("ch_messages").insert({ space_id: s.id, body: "📹 Join my video call: " + new URL("meet.html#c=" + code, location.href).href }));
      location.href = "meet.html#c=" + code;
    } catch (e) { hubErr(e); }
  }
  clearInterval(timer);
  await draw();
  inp.focus();
  timer = setInterval(() => { if (!document.hidden) draw().catch(() => { }); }, 3000);
  try { sb.removeAllChannels?.(); sb.channel("ch-" + s.id).on("postgres_changes", { event: "*", schema: "public", table: "ch_messages", filter: "space_id=eq." + s.id }, () => draw()).subscribe(); } catch { }
}
// linkify: turn http(s) links in messages into links, without ever treating message text as HTML
const linkify = root => { for (const b of root.querySelectorAll(".ch-body")) { const t = b.textContent; if (b.dataset.l || !/https?:\/\//.test(t)) continue; b.dataset.l = 1; b.textContent = ""; for (const part of t.split(/(https?:\/\/[^\s]+)/)) b.append(/^https?:\/\//.test(part) ? cbEl("a", { href: part, target: cbSameSite(part) ? "_self" : "_blank", rel: "noopener", text: part }) : part); } };
new MutationObserver(() => { const l = document.querySelector(".ch-log"); if (l) linkify(l); }).observe(document.documentElement, { childList: true, subtree: true });

(async () => {
  UI = await hubBoot("Chat");
  addEventListener("hashchange", render);
  render();
  setInterval(() => { if (!document.hidden && !document.querySelector(".scrim")) loadSpaces().then(() => { for (const s of spaces) { const el = [...document.querySelectorAll(".ch-item")].find(b => b.textContent.includes(titleOf(s))); if (el && s.id !== sid() && s.last_at > (myRow(s)?.read_at || "")) el.classList.add("unread"); } }).catch(() => { }); }, 15000);
})();
