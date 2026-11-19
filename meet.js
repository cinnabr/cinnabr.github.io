/* Cinnabar Meet: video meetings joined by a code (abc-defg-hij). Browsers connect directly to each other (WebRTC);
   Cinnabar only passes the connection offers along (db/suite.sql mt_signals). Audio and video never go through Cinnabar. */
"use strict";
let UI;
const q = async p => { const { data, error } = await p; if (error) throw new Error(error.message); return data; };
const codeOf = () => new URLSearchParams(location.hash.slice(1)).get("c") || "";
const CODE = /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/;
// STUN finds your public address; with strict school/office firewalls a TURN relay may also be needed (CB_CONFIG.iceServers)
const ICE = CB_CONFIG.iceServers || [{ urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] }];
function newCode() { const r = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => "abcdefghijklmnopqrstuvwxyz"[b % 26]).join(""); return `${r(3)}-${r(4)}-${r(3)}`; }
const tidy = s => s.trim().toLowerCase().replace(/^.*#c=/, "").replace(/[^a-z]/g, "").replace(/^(...)(....)(...)$/, "$1-$2-$3");

/* ── lobby ── */
async function lobby() {
  UI.title.textContent = "Meet";
  const v = UI.view = hubView(UI.view);
  const input = cbEl("input", { class: "field", placeholder: "Enter a code, like abc-defg-hij", autocapitalize: "none", spellcheck: "false", onkeydown: e => { if (e.key === "Enter") joinBtn.click(); } });
  const joinBtn = cbEl("button", { class: "btn", text: "Join", onclick: () => { const c = tidy(input.value); if (!CODE.test(c)) return cbToast("That code doesn't look right"); location.hash = "c=" + c; } });
  const mine = await q(sb.from("mt_rooms").select("*").eq("owner", CB_USER.id).order("created_at", { ascending: false }).limit(6)).catch(() => []);
  v.append(cbEl("div", { class: "mt-hero" },
    cbEl("div", {}, cbEl("h2", { text: "Meet" }), cbEl("p", { class: "muted", text: "Start a call, then share the code in Chat or Mail." }),
      cbEl("div", { class: "mt-start" }, cbEl("button", { class: "btn primary", html: cbIcon("video") + "<span>New meeting</span>", onclick: e => cbMenuAt(e.currentTarget, [
        { label: "Start a meeting now", icon: "play", run: () => create(true) }, { label: "Create a meeting for later", icon: "link", run: () => create(false) }, { label: "Schedule in Calendar", icon: "calendar", run: () => create(false, true) }]) }),
        input, joinBtn)),
    cbEl("div", { class: "mt-art", html: cbIcon("video") })));
  if (mine.length) {
    v.append(cbEl("div", { class: "cap", text: "Your meetings" }));
    const t = cbEl("div", { class: "tiles" });
    for (const r of mine) t.append(cbEl("button", { class: "tile", onclick: () => { location.hash = "c=" + r.code; } },
      cbEl("div", { class: "ban", style: { background: "linear-gradient(135deg,#1f9a8a,#2f7fd8)" } }, cbEl("b", { text: r.title || "Meeting" }), cbEl("span", { text: r.code })),
      cbEl("div", { class: "body" }, cbEl("span", { text: r.starts_at ? "Starts " + hubWhen(r.starts_at) : "Made " + cbAgo(r.created_at) }))));
    v.append(t);
  }
}
async function create(now, schedule) {
  const f = await hubForm(now ? "New meeting" : "Meeting for later", [{ key: "title", label: "Name (optional)", placeholder: "Study group" }, ...(schedule ? [{ key: "starts_at", label: "Starts", type: "datetime-local", required: true }] : [])], now ? "Start" : "Create");
  if (!f) return;
  const code = newCode();
  try {
    await q(sb.from("mt_rooms").insert({ code, title: f.title || "", starts_at: hubISO(f.starts_at) }));
    if (schedule) await q(sb.from("cal_events").insert({ title: f.title || "Meeting", starts_at: hubISO(f.starts_at), ends_at: new Date(new Date(f.starts_at).getTime() + 36e5).toISOString(), location: "Cinnabar Meet", notes: "Join: " + new URL("meet.html#c=" + code, location.href).href })).catch(() => cbToast("Saved, but the Calendar event couldn't be added"));
  } catch (e) { return hubErr(e); }
  if (now) location.hash = "c=" + code;
  else { await navigator.clipboard?.writeText(new URL("meet.html#c=" + code, location.href).href).catch(() => { }); cbToast("Meeting " + code + " made. Link copied."); lobby(); }
}

/* ── pre-join ── */
let local = null, me = { mic: true, cam: true };
async function getMedia() {
  for (const c of [{ audio: true, video: { width: 1280, height: 720 } }, { audio: true }, { video: true }]) {
    try { return await navigator.mediaDevices.getUserMedia(c); } catch { }
  }
  return new MediaStream();   // no camera or microphone, or permission refused: you can still watch and chat
}
async function prejoin(code) {
  const room = await q(sb.from("mt_rooms").select("*").eq("code", code).maybeSingle()).catch(hubErr);
  UI.title.innerHTML = ""; UI.title.append(cbEl("span", { class: "crumb", text: "Meet", onclick: () => { location.hash = ""; } }), cbEl("span", { class: "muted", text: "›" }), cbEl("span", { text: room?.title || code }));
  const v = UI.view = hubView(UI.view);
  if (!room) return v.append(hubEmpty("video", "No meeting has that code", "Check the code with whoever sent it.", cbEl("button", { class: "btn", text: "Back", onclick: () => { location.hash = ""; } })));
  local ??= await getMedia();
  me.mic = local.getAudioTracks().length > 0; me.cam = local.getVideoTracks().length > 0;
  const vid = cbEl("video", { autoplay: true, playsinline: true }); vid.muted = true; vid.srcObject = local;
  const face = cbEl("div", { class: "mt-tile big" }, vid, cbEl("div", { class: "mt-off", hidden: me.cam }, hubAvatar(CB_USER.id, 84)));
  const bar = cbEl("div", { class: "mt-controls" });
  const draw = () => { bar.innerHTML = ""; bar.append(toggle("mic", me.mic, () => { setMic(!me.mic); draw(); }), toggle("cam", me.cam, () => { setCam(!me.cam); face.querySelector(".mt-off").hidden = me.cam; draw(); })); };
  draw(); face.append(bar);
  await hubPeople([CB_USER.id, room.owner]);
  const who = await q(sb.from("mt_participants").select("user_id").eq("code", code)).catch(() => []);
  v.append(cbEl("div", { class: "mt-pre" }, face, cbEl("div", { class: "mt-ready" }, cbEl("h2", { text: "Ready to join?" }),
    cbEl("p", { class: "muted", text: room.locked && room.owner !== CB_USER.id ? "This meeting is locked by the host." : (who.length ? "Others are already here." : "No one else is here yet.") + " Code " + code }),
    cbEl("button", { class: "btn primary", text: "Join now", disabled: room.locked && room.owner !== CB_USER.id, onclick: () => join(room) }),
    cbEl("button", { class: "btn ghost", html: cbIcon("copy") + "<span>Copy link</span>", onclick: () => navigator.clipboard?.writeText(location.href).then(() => cbToast("Link copied")) }),
    local.getTracks().length ? null : cbEl("p", { class: "muted small", text: "No camera or microphone found (or Cinnabar wasn't allowed to use them). You can still see, hear and chat." }))));
}
function toggle(kind, on, fn) {
  const icons = { mic: "M12 4a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V7a3 3 0 0 1 3-3zM6 11a6 6 0 0 0 12 0M12 17v3", cam: "M4 7h11v10H4zM15 10l5-3v10l-5-3" };
  const b = cbEl("button", { class: "mt-btn" + (on ? "" : " off"), title: (on ? "Turn off " : "Turn on ") + (kind === "mic" ? "microphone" : "camera"), onclick: fn });
  b.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${icons[kind]}"/>${on ? "" : '<path d="M4 4l16 16"/>'}</svg>`;
  return b;
}
function setMic(on) { if (on && !local.getAudioTracks().length) return cbToast("No microphone"); me.mic = on; local.getAudioTracks().forEach(t => t.enabled = on); }
function setCam(on) { if (on && !local.getVideoTracks().length) return cbToast("No camera"); me.cam = on; local.getVideoTracks().forEach(t => t.enabled = on); }

/* ── the meeting ── */
let R = null;   // the room you're in
async function join(room) {
  const peer = crypto.randomUUID();
  try { await q(sb.from("mt_participants").insert({ code: room.code, peer, mic: me.mic, cam: me.cam })); }
  catch (e) { return hubErr(e.message.includes("row-level") ? new Error("This meeting is locked") : e); }
  R = { room, peer, pcs: new Map(), people: [], seen: new Map(), lastSig: 0, chat: [], lastChat: 0, screen: null, panel: null, timers: [] };
  document.body.classList.add("mt-on");
  const stage = cbEl("div", { class: "mt-grid" });
  const panel = cbEl("aside", { class: "mt-panel", hidden: true });
  const bar = cbEl("div", { class: "mt-bottom" });
  UI.view = hubView(UI.view); UI.view.append(cbEl("div", { class: "mt-room" }, stage, panel), bar);
  Object.assign(R, { stage, panel, bar });
  const selfTile = tile(R.peer, CB_USER.id, true); selfTile.querySelector("video").srcObject = local;
  stage.append(selfTile);
  drawBar();
  addEventListener("pagehide", leaveQuiet);
  R.timers.push(setInterval(beat, 4000), setInterval(poll, 1000), setInterval(pollChat, 2500));
  try {
    R.ch = sb.channel("mt-" + room.code).on("postgres_changes", { event: "INSERT", schema: "public", table: "mt_signals", filter: "to_peer=eq." + peer }, poll)
      .on("postgres_changes", { event: "*", schema: "public", table: "mt_participants", filter: "code=eq." + room.code }, people).subscribe();
  } catch { }
  await people();
}
function tile(peer, uid, self) {
  const t = cbEl("div", { class: "mt-tile", "data-peer": peer }, cbEl("video", { autoplay: true, playsinline: true }),
    cbEl("div", { class: "mt-off" }, hubAvatar(uid, 72)),
    cbEl("div", { class: "mt-name" }, cbEl("span", { class: "mt-hand", text: "✋", hidden: true }), cbEl("span", { text: self ? "You" : hubWho(uid) }), cbEl("span", { class: "mt-muted", hidden: true, html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 4a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V7a3 3 0 0 1 3-3zM4 4l16 16"/></svg>' })),
    cbEl("i", { class: "mt-state" + (self ? " connected" : ""), title: self ? "" : "Connecting…" }));
  t.querySelector("video").muted = !!self;   // never play your own microphone back to yourself
  return t;
}
function drawBar() {
  const b = R.bar; b.innerHTML = "";
  const host = R.room.owner === CB_USER.id;
  b.append(cbEl("div", { class: "mt-info" }, cbEl("b", { text: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) }), cbEl("span", { class: "muted", text: " | " + R.room.code })),
    cbEl("div", { class: "mt-controls" },
      toggle("mic", me.mic, () => { setMic(!me.mic); push({ mic: me.mic }); drawBar(); }),
      toggle("cam", me.cam, () => { setCam(!me.cam); push({ cam: me.cam }); drawBar(); }),
      cbEl("button", { class: "mt-btn" + (R.screen ? " on" : ""), title: R.screen ? "Stop presenting" : "Present your screen", html: cbIcon("upload"), onclick: share }),
      cbEl("button", { class: "mt-btn" + (R.hand ? " on" : ""), title: R.hand ? "Lower hand" : "Raise hand", text: "✋", onclick: () => { R.hand = !R.hand; push({ hand: R.hand }); drawBar(); } }),
      cbEl("button", { class: "mt-btn", title: "Reactions", text: "😊", onclick: e => cbMenuAt(e.currentTarget, ["👍", "❤️", "😂", "😮", "👏", "🎉"].map(x => ({ label: x, run: () => say(x) }))) }),
      cbEl("button", { class: "mt-btn", title: "More", html: cbIcon("more"), onclick: e => cbMenuAt(e.currentTarget, [
        { label: "Copy meeting link", icon: "copy", run: () => navigator.clipboard?.writeText(location.href).then(() => cbToast("Link copied")) },
        { label: "Full screen", icon: "open", run: () => document.documentElement.requestFullscreen?.() },
        host ? { label: R.room.locked ? "Unlock meeting" : "Lock meeting (no new people)", icon: "lock", run: lock } : null,
        host ? { label: "End meeting for everyone", icon: "close", danger: true, run: endAll } : null]) }),
      cbEl("button", { class: "mt-btn leave", title: "Leave call", html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 14c5-5 13-5 18 0l-2 3-4-1v-3a9 9 0 0 0-6 0v3l-4 1z"/></svg>', onclick: () => leave() })),
    cbEl("div", { class: "mt-side-btns" },
      cbEl("button", { class: "mt-btn small" + (R.panel === "people" ? " on" : ""), title: "People", html: cbIcon("people") + `<b>${R.people.length || 1}</b>`, onclick: () => openPanel("people") }),
      cbEl("button", { class: "mt-btn small" + (R.panel === "chat" ? " on" : ""), title: "Chat with everyone", html: cbIcon("forum") + (R.unread ? "<i class='dot'></i>" : ""), onclick: () => openPanel("chat") })));
}
const push = patch => q(sb.from("mt_participants").update(patch).eq("code", R.room.code).eq("peer", R.peer)).catch(() => { });
const beat = () => push({ mic: me.mic, cam: me.cam });

/* who's here: connect to anyone new, drop anyone gone */
async function people() {
  if (!R) return;
  let rows;
  try { rows = await q(sb.from("mt_participants").select("*").eq("code", R.room.code)); } catch { return; }
  const now = Date.now();
  rows = rows.filter(p => {   // someone whose "last seen" hasn't moved for 15 s has closed the tab or lost the connection
    const s = R.seen.get(p.peer);
    if (!s || s.v !== p.seen_at) R.seen.set(p.peer, { v: p.seen_at, at: now });
    return p.peer === R.peer || now - R.seen.get(p.peer).at < 15000;
  });
  const self = rows.find(p => p.peer === R.peer);
  if (!self) return leave("You were removed from the meeting");
  if (!self.mic && me.mic) { setMic(false); cbToast("The host muted you"); drawBar(); }
  R.people = rows;
  await hubPeople(rows.map(p => p.user_id));
  for (const p of rows) {
    if (p.peer === R.peer) { mark(p); continue; }
    if (!R.pcs.has(p.peer)) { connect(p); if (R.peer < p.peer) offer(p); }   // the smaller id always calls, so two people never call each other at once
    mark(p);
  }
  for (const [peer, c] of R.pcs) if (!rows.some(p => p.peer === peer)) drop(peer);
  if (R.panel === "people") drawPanel();
  layout();
}
function mark(p) {
  const t = R.stage.querySelector(`[data-peer="${p.peer}"]`); if (!t) return;
  const self = p.peer === R.peer;
  t.querySelector(".mt-off").hidden = self ? me.cam || !!R.screen : !!p.cam || !!p.sharing;
  t.querySelector(".mt-muted").hidden = self ? me.mic : p.mic;
  t.querySelector(".mt-hand").hidden = !p.hand;
  t.classList.toggle("sharing", !!p.sharing);
}
function layout() { const n = R.stage.children.length; R.stage.style.setProperty("--cols", n <= 1 ? 1 : n <= 4 ? 2 : n <= 9 ? 3 : 4); R.stage.classList.toggle("present", !!R.stage.querySelector(".sharing")); }

function connect(p) {
  const pc = new RTCPeerConnection({ iceServers: ICE });
  const c = { pc, p, queue: [], tile: tile(p.peer, p.user_id, false), stream: new MediaStream() };
  R.pcs.set(p.peer, c);
  c.tile.querySelector("video").srcObject = c.stream;
  R.stage.append(c.tile);
  pc.onicecandidate = e => { if (e.candidate) signal(p, "ice", e.candidate.toJSON()); };
  pc.ontrack = e => { c.stream.addTrack(e.track); e.track.onended = () => c.stream.removeTrack(e.track); };
  pc.onconnectionstatechange = () => {
    const s = pc.connectionState; c.tile.querySelector(".mt-state").className = "mt-state " + s; c.tile.querySelector(".mt-state").title = s === "connected" ? "" : s === "failed" ? "Couldn't connect. A firewall may be blocking calls." : "Connecting…";
    if (s === "failed" && R.peer < p.peer) { pc.restartIce?.(); offer(p, true); }
  };
  return c;
}
function attachLocal(pc) {   // send your microphone and camera (or screen) on every connection
  const vt = R.screen?.getVideoTracks()[0] || local.getVideoTracks()[0] || null, at = local.getAudioTracks()[0] || null;
  for (const t of pc.getTransceivers()) {
    const kind = t.receiver.track.kind;
    t.direction = "sendrecv";
    t.sender.replaceTrack(kind === "audio" ? at : vt).catch(() => { });
  }
}
async function offer(p, restart) {
  const c = R.pcs.get(p.peer); if (!c) return;
  if (!c.pc.getTransceivers().length) { c.pc.addTransceiver("audio", { direction: "sendrecv" }); c.pc.addTransceiver("video", { direction: "sendrecv" }); }
  attachLocal(c.pc);
  const o = await c.pc.createOffer(restart ? { iceRestart: true } : {});
  await c.pc.setLocalDescription(o);
  signal(p, "offer", { type: o.type, sdp: o.sdp });
}
const signal = (p, kind, payload) => q(sb.from("mt_signals").insert({ code: R.room.code, from_peer: R.peer, to_peer: p.peer, to_user: p.user_id, kind, payload })).catch(() => { });
let polling = false;
async function poll() {
  if (!R || polling) return; polling = true;
  try {
    const rows = await q(sb.from("mt_signals").select("*").eq("to_peer", R.peer).gt("id", R.lastSig).order("id").limit(100));
    if (rows.length) { R.lastSig = rows.at(-1).id; sb.from("mt_signals").delete().eq("to_peer", R.peer).lte("id", R.lastSig).then(() => { }); }
    for (const s of rows) await handle(s);
  } catch { } finally { polling = false; }
}
async function handle(s) {
  let c = R.pcs.get(s.from_peer);
  if (s.kind === "bye") return drop(s.from_peer);
  if (!c) {   // they called before we noticed them in the list
    const p = { peer: s.from_peer, user_id: s.from_user };
    await hubPeople([s.from_user]); c = connect(p);
  }
  const pc = c.pc;
  try {
    if (s.kind === "offer") {
      await pc.setRemoteDescription(s.payload);
      attachLocal(pc);
      const a = await pc.createAnswer(); await pc.setLocalDescription(a);
      signal(c.p, "answer", { type: a.type, sdp: a.sdp });
      for (const i of c.queue.splice(0)) await pc.addIceCandidate(i).catch(() => { });
    } else if (s.kind === "answer") {
      if (pc.signalingState === "have-local-offer") await pc.setRemoteDescription(s.payload);
      for (const i of c.queue.splice(0)) await pc.addIceCandidate(i).catch(() => { });
    } else if (s.kind === "ice") {
      if (pc.remoteDescription) await pc.addIceCandidate(s.payload).catch(() => { }); else c.queue.push(s.payload);
    }
  } catch (e) { console.warn("meet signal", e); }
}
function drop(peer) { const c = R.pcs.get(peer); if (!c) return; c.pc.close(); c.tile.remove(); R.pcs.delete(peer); layout(); }

async function share() {
  if (R.screen) return stopShare();
  try { R.screen = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false }); }
  catch { return cbToast("Screen sharing was cancelled or isn't allowed here"); }
  const t = R.screen.getVideoTracks()[0];
  t.onended = stopShare;
  for (const { pc } of R.pcs.values()) attachLocal(pc);
  R.stage.querySelector(`[data-peer="${R.peer}"] video`).srcObject = R.screen;
  push({ sharing: true }); drawBar(); mark({ peer: R.peer, sharing: true, hand: R.hand });
  cbToast("You're presenting to everyone");
}
function stopShare() {
  if (!R?.screen) return;
  R.screen.getTracks().forEach(t => t.stop()); R.screen = null;
  for (const { pc } of R.pcs.values()) attachLocal(pc);
  R.stage.querySelector(`[data-peer="${R.peer}"] video`).srcObject = local;
  push({ sharing: false }); drawBar();
}

/* chat and people panels */
function openPanel(which) { R.panel = R.panel === which ? null : which; if (R.panel === "chat") R.unread = false; R.stage.parentNode.querySelector(".mt-panel").hidden = !R.panel; if (R.panel) drawPanel(); drawBar(); }
function drawPanel() {
  const p = R.stage.parentNode.querySelector(".mt-panel"); p.innerHTML = "";
  p.append(cbEl("div", { class: "mt-ph" }, cbEl("b", { text: R.panel === "chat" ? "In-call messages" : "People" }), cbEl("button", { class: "icon-btn", html: cbIcon("close"), onclick: () => openPanel(R.panel) })));
  if (R.panel === "people") {
    const host = R.room.owner === CB_USER.id;
    for (const x of R.people) p.append(cbEl("div", { class: "mt-person" }, hubAvatar(x.user_id, 32),
      cbEl("span", { class: "grow", text: (x.peer === R.peer ? "You" : hubWho(x.user_id)) + (x.user_id === R.room.owner ? " (host)" : "") + (x.hand ? " ✋" : "") }),
      cbEl("span", { class: "muted small", text: x.mic ? "" : "muted" }),
      host && x.peer !== R.peer ? cbEl("button", { class: "icon-btn", html: cbIcon("more"), onclick: e => cbMenuAt(e.currentTarget, [
        { label: "Mute", icon: "close", run: () => q(sb.rpc("mt_mute", { p_code: R.room.code, p_peer: x.peer })).catch(hubErr) },
        { label: "Remove from meeting", icon: "logout", danger: true, run: () => q(sb.from("mt_participants").delete().eq("code", R.room.code).eq("peer", x.peer)).then(people, hubErr) }]) }) : null));
  } else {
    const log = cbEl("div", { class: "mt-log" });
    for (const m of R.chat) log.append(cbEl("div", { class: "mt-cmsg" }, cbEl("b", { text: m.user_id === CB_USER.id ? "You" : hubWho(m.user_id) }), cbEl("span", { class: "muted small", text: " " + new Date(m.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) }), cbEl("div", { text: m.body })));
    const inp = cbEl("input", { class: "field", placeholder: "Send a message", onkeydown: e => { if (e.key === "Enter" && inp.value.trim()) { say(inp.value.trim()); inp.value = ""; } } });
    p.append(log, cbEl("p", { class: "muted small", text: "Messages are only seen by people in the call while it's going." }), inp);
    log.scrollTop = 1e9; setTimeout(() => inp.focus(), 0);
  }
}
async function say(body) { await q(sb.from("mt_chat").insert({ code: R.room.code, body })).catch(hubErr); pollChat(); }
async function pollChat() {
  if (!R) return;
  const rows = await q(sb.from("mt_chat").select("*").eq("code", R.room.code).gt("id", R.lastChat).order("id").limit(200)).catch(() => []);
  if (!rows.length) return;
  R.lastChat = rows.at(-1).id; R.chat.push(...rows);
  await hubPeople(rows.map(r => r.user_id));
  for (const m of rows) if ([...m.body].length <= 2 && /\p{Extended_Pictographic}/u.test(m.body)) burst(m);   // a single emoji is a reaction: float it up
  if (R.panel === "chat") drawPanel();
  else if (rows.some(r => r.user_id !== CB_USER.id && !/^\p{Extended_Pictographic}$/u.test(r.body))) { R.unread = true; drawBar(); }
}
function burst(m) {
  const t = R.stage.querySelector(`.mt-tile[data-peer="${R.people.find(p => p.user_id === m.user_id)?.peer}"]`) || R.stage;
  const e = cbEl("span", { class: "mt-burst", text: m.body }); t.append(e); setTimeout(() => e.remove(), 2600);
}
async function lock() { R.room.locked = !R.room.locked; await q(sb.from("mt_rooms").update({ locked: R.room.locked }).eq("code", R.room.code)).catch(hubErr); cbToast(R.room.locked ? "Meeting locked: no one new can join" : "Meeting unlocked"); }
async function endAll() {
  if (!(await cbConfirm("End the meeting for everyone?", "Everyone is removed from the call.", "End meeting", true))) return;
  await q(sb.from("mt_participants").delete().eq("code", R.room.code)).catch(hubErr);
  leave("You ended the meeting");
}
function leaveQuiet() { if (!R) return; for (const c of R.pcs.values()) signal(c.p, "bye", {}); sb.from("mt_participants").delete().eq("code", R.room.code).eq("peer", R.peer).then(() => { }); }
function leave(msg) {
  if (!R) return;
  leaveQuiet();
  R.timers.forEach(clearInterval); try { sb.removeChannel(R.ch); } catch { }
  for (const c of R.pcs.values()) c.pc.close();
  stopShare(); local?.getTracks().forEach(t => t.stop()); local = null;
  R = null; document.body.classList.remove("mt-on"); removeEventListener("pagehide", leaveQuiet);
  const v = UI.view = hubView(UI.view);
  UI.title.textContent = "Meet";
  v.append(hubEmpty("video", msg || "You left the meeting", "", cbEl("div", { style: { display: "flex", gap: "8px", justifyContent: "center" } },
    cbEl("button", { class: "btn", text: "Rejoin", onclick: () => render(true) }), cbEl("button", { class: "btn primary", text: "Back to Meet", onclick: () => { location.hash = ""; } }))));
}

function render(force) {
  if (R && !force) { if (codeOf() === R.room.code) return; leave(); }
  const c = codeOf();
  return CODE.test(c) ? prejoin(c) : lobby();
}
(async () => {
  UI = await hubBoot("Meet");
  addEventListener("hashchange", () => render());
  render();
})();
