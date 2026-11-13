/* Cinnabar — shared client: Supabase connection, auth, files, realtime, sharing, UI helpers.
   The publishable key is safe in client code; all access control is Row-Level Security in the database. */
"use strict";

const CB_CONFIG = {
  url: "https://ncjpqruadnkcgaenjemb.supabase.co",
  key: "sb_publishable_dB0JgO6O0hojC2V2i2GV5A_cPYqLJ7G",
  bucket: "cinnabar",
};
const sb = supabase.createClient(CB_CONFIG.url, CB_CONFIG.key, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: "cinnabar-auth", detectSessionInUrl: /^https?:$/.test(location.protocol) || /[#&]access_token=/.test(location.hash) },
  realtime: { params: { eventsPerSecond: 10 } },
});

const CB_KINDS = {
  doc: { name: "Docs", noun: "document", page: "docs.html", color: "var(--doc)", blank: "Untitled document" },
  sheet: { name: "Sheets", noun: "spreadsheet", page: "sheets.html", color: "var(--sheet)", blank: "Untitled spreadsheet" },
  slides: { name: "Slides", noun: "presentation", page: "slides.html", color: "var(--slides)", blank: "Untitled presentation" },
  folder: { name: "Folder", noun: "folder", page: "index.html", color: "var(--folder)", blank: "New folder" },
};

/* ── tiny DOM helpers ─────────────────────────────────────────────────────── */
function cbEl(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k === "html") el.innerHTML = v; // only ever used with constant markup (icons)
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : String(kid));
  return el;
}
const cbEsc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

function cbToast(msg, ms = 2600) {
  $$(".toast").forEach(t => t.remove());
  const t = cbEl("div", { class: "toast", role: "status", text: msg });
  document.body.append(t);
  setTimeout(() => t.remove(), ms);
}
// an email link that failed (expired, already used) comes back as #error_description=…
{
  const why = new URLSearchParams(location.hash.slice(1)).get("error_description");
  if (why) { history.replaceState(null, "", location.pathname + location.search); const show = () => cbToast(why + ". Request a new link from the sign-in screen.", 7000); document.body ? show() : addEventListener("DOMContentLoaded", show); }
}

function cbAgo(ts) {
  const d = new Date(ts), s = (Date.now() - d) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + " min ago";
  if (s < 86400 && d.getDate() === new Date().getDate()) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (s < 86400 * 6) return d.toLocaleDateString([], { weekday: "short" }) + " " + d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return d.toLocaleDateString([], { day: "numeric", month: "short", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}

/* ── icons (own set, 24×24 stroke) ───────────────────────────────────────── */
const CB_I = {
  plus: "M12 5v14M5 12h14", search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4", home: "M4 11l8-7 8 7v9h-5v-6H9v6H4z",
  drive: "M3 7h6l2 2h10v10H3z", shared: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20c0-3 3-5 6-5s6 2 6 5M16 5.5a3 3 0 0 1 0 5.5M18 15c2 .6 3 2.3 3 5",
  star: "M12 4l2.4 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z", clock: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8v4l3 2",
  trash: "M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12", more: "M12 6h.01M12 12h.01M12 18h.01", close: "M6 6l12 12M18 6L6 18",
  share: "M12 15V4M8 8l4-4 4 4M5 13v6h14v-6", link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  edit: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4", copy: "M9 9h10v10H9zM5 15V5h10", folder: "M3 6h6l2 2h10v11H3z", move: "M3 6h6l2 2h10v11H3zM10 14h6M13 11l3 3-3 3",
  restore: "M4 12a8 8 0 1 0 3-6.2M4 4v4h4", open: "M14 4h6v6M20 4l-9 9M18 14v6H4V6h6", logout: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10",
  undo: "M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3", redo: "M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3", print: "M7 9V4h10v5M7 17H4v-7h16v7h-3M7 14h10v6H7z",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z", list: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  download: "M12 4v11M7 10l5 5 5-5M5 20h14", upload: "M12 20V9M7 14l5-5 5 5M5 4h14", play: "M8 5l11 7-11 7z", image: "M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9h.01",
  text: "M5 6V4h14v2M12 4v16M9 20h6", shape: "M4 4h9v9H4zM16 11a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9z", check: "M5 12l5 5 9-10",
};
function cbIcon(name, extra = "") {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" ${extra}><path d="${CB_I[name] || ""}"/></svg>`;
}
function cbIconEl(name) { const s = cbEl("span", { style: { display: "inline-grid" } }); s.innerHTML = cbIcon(name); return s.firstChild; }

/* Brand mark: the cinnabar rock "C" from the logo */
function cbCrystal() { return `<img class="mark" src="assets/mark.png" alt="">`; }
function cbLogo(app) {
  const a = cbEl("a", { class: "cb-logo", href: "index.html", title: "Cinnabar home" });
  a.innerHTML = `<img class="word" src="assets/logo.png" alt="Cinnabar">` + (app ? `<span class="app">${cbEsc(app)}</span>` : "") + `<span class="beta" title="Cinnabar is in public beta">Beta</span>`;
  return a;
}
function cbKindIcon(kind) {
  const c = { doc: "#e2361f", sheet: "#ff7a1a", slides: "#f4a83a", folder: "#b9aaa5" }[kind] || "#999";
  const inner = {
    doc: `<path d="M8 10h8M8 13h8M8 16h5" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/>`,
    sheet: `<path d="M7.5 10h9v7h-9zM7.5 13.5h9M12 10v7" stroke="#fff" stroke-width="1.2" fill="none"/>`,
    slides: `<rect x="7.5" y="10" width="9" height="6.5" rx="1" stroke="#fff" stroke-width="1.3" fill="none"/>`,
    folder: "",
  }[kind] || "";
  if (kind === "folder") return `<svg class="kind" viewBox="0 0 24 24"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z" fill="${c}"/></svg>`;
  return `<svg class="kind" viewBox="0 0 24 24"><path d="M6 3h8l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" fill="${c}"/><path d="M14 3v5h5" fill="rgba(0,0,0,.25)"/>${inner}</svg>`;
}

/* Full-bleed Cinnabar wave background */
function cbWave(host = document.body) {
  const wrap = cbEl("div", { class: "cb-wave", "aria-hidden": "true" });
  host.prepend(wrap);
  return wrap;
}

/* ── HTML sanitiser for collaborative rich text (docs, slide text) ─────────── */
const CB_TAGS = new Set("P DIV SPAN BR B STRONG I EM U S STRIKE DEL SUB SUP H1 H2 H3 H4 BLOCKQUOTE PRE CODE UL OL LI A IMG TABLE THEAD TBODY TR TD TH HR FONT MARK LABEL INPUT".split(" "));
const CB_DROP = new Set("SCRIPT STYLE IFRAME OBJECT EMBED LINK META TEMPLATE SVG MATH FORM TEXTAREA SELECT BUTTON VIDEO AUDIO NOSCRIPT TITLE BASE".split(" "));
const CB_ATTR = { A: ["href", "title"], IMG: ["src", "alt", "width", "height"], TD: ["colspan", "rowspan"], TH: ["colspan", "rowspan"], OL: ["start", "type"], FONT: ["color", "face", "size"], INPUT: ["type", "checked"], LI: ["data-checked"], UL: ["data-checklist"] };
const CB_CLASSES = new Set(["pb"]);
const CB_CSS = new Set(["color", "background-color", "font-size", "font-family", "font-weight", "font-style", "text-decoration", "text-decoration-line", "text-align", "margin-left", "padding-left", "line-height", "width", "height", "max-width", "border", "border-collapse", "vertical-align", "letter-spacing", "text-indent", "float", "display"]);
function cbSanitize(html) {
  const doc = new DOMParser().parseFromString("<!doctype html><body>" + (html || ""), "text/html");
  const walk = node => {
    for (const ch of [...node.childNodes]) {
      if (ch.nodeType === 3) continue;
      if (ch.nodeType !== 1) { ch.remove(); continue; }
      const tag = ch.tagName;
      if (CB_DROP.has(tag)) { ch.remove(); continue; }
      walk(ch);
      if (!CB_TAGS.has(tag)) { ch.replaceWith(...ch.childNodes); continue; }
      const keep = CB_ATTR[tag] || [];
      for (const at of [...ch.attributes]) {
        const n = at.name.toLowerCase();
        if (n === "style") {
          const st = ch.style, out = [];
          for (let i = 0; i < st.length; i++) {
            const p = st[i], v = st.getPropertyValue(p);
            if (CB_CSS.has(p) && !/url\(|expression|javascript:/i.test(v)) out.push(`${p}:${v}`);
          }
          out.length ? ch.setAttribute("style", out.join(";")) : ch.removeAttribute("style");
        } else if (n === "class") {
          const c = at.value.split(/\s+/).filter(x => CB_CLASSES.has(x)).join(" ");
          c ? ch.setAttribute("class", c) : ch.removeAttribute("class");
        } else if (!keep.includes(n)) ch.removeAttribute(at.name);
      }
      if (tag === "A") {
        const h = ch.getAttribute("href") || "";
        if (!/^(https?:|mailto:|#)/i.test(h.trim())) ch.removeAttribute("href");
        else { ch.setAttribute("target", "_blank"); ch.setAttribute("rel", "noopener noreferrer"); }
      }
      if (tag === "IMG" && !/^(https:\/\/|data:image\/(png|jpe?g|gif|webp);base64,)/i.test(ch.getAttribute("src") || "")) ch.remove();
      if (tag === "INPUT" && ch.getAttribute("type") !== "checkbox") ch.remove();
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}

/* ── auth ─────────────────────────────────────────────────────────────────── */
let CB_USER = null;
async function cbSession() {
  const { data } = await sb.auth.getSession();
  CB_USER = data.session?.user || null;
  CB_HOOKS.user(CB_USER);
  return CB_USER;
}
/* Embedding hooks: a host (e.g. a browser that bundles Cinnabar) may override these in a script loaded after this file. */
const CB_HOOKS = {
  user(u) {},                       // called whenever the signed-in user is known or changes
  afterAuth(u) { return false; },   // return true to take over navigation after sign-in
  initialMode: "in",                // "in" | "up"
  title: null,                      // custom sign-in heading
  links(links, mode) {},            // extra links under the sign-in form
};
/* Where auth emails (confirm, reset) send people back to: this site, when served over http(s). */
const CB_RETURN = /^https?:$/.test(location.protocol) ? new URL("index.html", location.href).href : undefined;
/* Cinnabar has usernames, not email. Supabase sign-in needs an address-shaped login ID, so a username is stored as
   <username>@users.cinnabar.invalid: made up here, never typed, never shown and never mailed (.invalid can't receive mail). */
const CB_DOMAIN = "@users.cinnabar.invalid", CB_UNAME = /^[a-z0-9][a-z0-9._-]{2,23}$/;
const cbLoginId = name => { name = String(name || "").trim().toLowerCase(); return name.includes("@") ? name : name + CB_DOMAIN; };
const cbUname = id => { id = String(id || ""); return id.endsWith(CB_DOMAIN) ? id.slice(0, -CB_DOMAIN.length) : id.split("@")[0]; };
function cbName(u = CB_USER) { return u?.user_metadata?.display_name || cbUname(u?.email) || "You"; }
function cbColorFor(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return `hsl(${(h % 50) + 2} 70% ${42 + (h % 14)}%)`; }

/* Resolves with the signed-in user, showing the sign-in screen first if needed. */
async function cbRequireAuth(appName) {
  const u = await cbAuthScreen(appName);
  CB_HOOKS.user(u);
  if (CB_HOOKS.afterAuth(u)) return new Promise(() => {});
  return u;
}
async function cbAuthScreen(appName) {
  if (await cbSession()) return CB_USER;
  return new Promise(resolve => {
    let mode = CB_HOOKS.initialMode === "up" ? "up" : "in", kind = null;
    const box = cbEl("div", { class: "auth" });
    cbWave(box);
    const card = cbEl("form", { class: "card", novalidate: true });
    box.append(card);
    const render = () => {
      card.innerHTML = "";
      card.append(cbLogo(appName));
      card.append(cbEl("h1", { text: { in: CB_HOOKS.title || "Sign in", up: "Create your Cinnabar account" }[mode] }));
      card.append(cbEl("div", { class: "muted", text: { in: "Docs, Sheets and Slides, saved to your Cinnabar network.", up: "Pick a username. No email needed." }[mode] }));
      if (mode === "up") {   // the first choice: what kind of account
        const kinds = cbEl("div", { class: "kinds", role: "radiogroup", "aria-label": "Account type" });
        for (const [k, ico, t, d] of [["student", "school", "Student", "Join classes"], ["teacher", "task", "Teacher", "Run classes"], ["work", "drive", "Work", "No Classroom"]])
          kinds.append(cbEl("button", { type: "button", role: "radio", class: "kind" + (kind === k ? " on" : ""), "aria-checked": String(kind === k), html: cbIcon(ico), onclick: () => { kind = k; render(); } }, cbEl("b", { text: t }), cbEl("small", { text: d })));
        card.append(kinds);
      }
      card.append(cbEl("label", { class: "lbl", for: "cbu", text: "Username" }), cbEl("input", { class: "field", id: "cbu", autocomplete: "username", autocapitalize: "none", spellcheck: "false", maxlength: mode === "up" ? 24 : 254, required: true }));
      if (mode === "up") card.append(cbEl("label", { class: "lbl", for: "cbn", text: "Name" }), cbEl("input", { class: "field", id: "cbn", autocomplete: "name", maxlength: 80, required: true }));
      card.append(cbEl("label", { class: "lbl", for: "cbp", text: "Password" }), cbEl("input", { class: "field", id: "cbp", type: "password", autocomplete: mode === "up" ? "new-password" : "current-password", minlength: 6, required: true }));
      card.append(cbEl("div", { class: "err", id: "cberr", role: "alert" }));
      card.append(cbEl("div", { class: "row" }, cbEl("button", { class: "btn primary", type: "submit", text: { in: "Sign in", up: "Create account" }[mode] })));
      const links = cbEl("div", { class: "links" });
      links.append(mode === "in" ? cbEl("button", { type: "button", text: "Create account", onclick: () => { mode = "up"; render(); } }) : cbEl("button", { type: "button", text: "Back to sign in", onclick: () => { mode = "in"; render(); } }));
      if (mode === "in") links.append(cbEl("span", { class: "muted", text: "Forgot it? Ask your teacher or admin." }));
      CB_HOOKS.links(links, mode);
      card.append(links);
      setTimeout(() => (mode === "in" || kind) && card.querySelector("#cbu").focus(), 30);
    };
    card.addEventListener("submit", async e => {
      e.preventDefault();
      const err = $("#cberr", card), btn = card.querySelector("button[type=submit]");
      const user = $("#cbu", card).value.trim().toLowerCase(), pw = $("#cbp", card).value;
      err.className = "err"; err.textContent = "";
      // Accounts made before usernames signed in with an address: those still work when typed in full.
      if (mode === "up" || !user.includes("@")) { if (!CB_UNAME.test(user)) { err.textContent = "Usernames are 3 to 24 letters, numbers, dots, dashes or underscores."; return; } }
      if (pw.length < 6) { err.textContent = "Password must be at least 6 characters."; return; }
      btn.disabled = true;
      try {
        if (mode === "up") {
          const name = $("#cbn", card).value.trim();
          if (!kind) throw new Error("Choose Student, Teacher or Work first.");
          if (!name) throw new Error("Enter your name.");
          const made = await sb.rpc("cinnabar_signup_user", { p_username: user, p_password: pw, p_name: name, p_kind: kind });
          if (made.error) throw made.error;
        }
        const { data, error } = await sb.auth.signInWithPassword({ email: cbLoginId(user), password: pw });
        if (error) throw error;
        CB_USER = data.user; box.remove(); resolve(CB_USER);
      } catch (ex) {
        err.textContent = /Invalid login/i.test(ex.message) ? "Wrong username or password." : /already registered/i.test(ex.message) ? "That username is taken." : ex.message;
      } finally { btn.disabled = false; }
    });
    render();
    document.body.append(box);
  });
}
async function cbSignOut() { await sb.auth.signOut(); CB_HOOKS.user(null); location.href = "index.html"; }

/* ── files ────────────────────────────────────────────────────────────────── */
const CB_COLS = "id,kind,title,owner,parent,starred,trashed,link_access,created_at,updated_at,updated_by";
const cbCheck = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
const cbFiles = {
  async list({ parent, view = "drive", q } = {}) {
    let r = sb.from("files").select(CB_COLS).order("kind", { ascending: true }).order("updated_at", { ascending: false }).limit(500);
    const uid = CB_USER.id;
    if (view === "trash") r = r.eq("trashed", true).eq("owner", uid);
    else {
      r = r.eq("trashed", false);
      if (view === "drive") { r = r.eq("owner", uid); r = parent ? r.eq("parent", parent) : r.is("parent", null); }
      if (view === "shared") r = r.neq("owner", uid);
      if (view === "starred") r = r.eq("starred", true).eq("owner", uid);
      if (view === "recent") r = r.neq("kind", "folder").order("updated_at", { ascending: false });
    }
    if (q) r = r.ilike("title", `%${q.replace(/[%_\\]/g, "\\$&")}%`);
    const rows = cbCheck(await r);
    if (view === "recent") rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    return rows;
  },
  async folders() { return cbCheck(await sb.from("files").select("id,title,parent").eq("kind", "folder").eq("owner", CB_USER.id).eq("trashed", false).order("title")); },
  async get(id) { const rows = cbCheck(await sb.rpc("open_file", { f: id })); if (!rows?.length) throw new Error("This file doesn't exist or you don't have access."); return rows[0]; },
  async create(kind, title, { parent = null, content = {} } = {}) {
    return cbCheck(await sb.from("files").insert({ kind, title: title || CB_KINDS[kind].blank, parent, content }).select(CB_COLS + ",content").single());
  },
  async save(id, title, content) { return cbCheck(await sb.rpc("save_file", { f: id, new_title: title, new_content: content })); },
  async update(id, patch) { return cbCheck(await sb.from("files").update(patch).eq("id", id).select(CB_COLS).single()); },
  async remove(id) { cbCheck(await sb.from("files").delete().eq("id", id)); },
  async copy(f) { const full = await this.get(f.id); return this.create(f.kind, "Copy of " + f.title, { parent: f.owner === CB_USER.id ? f.parent : null, content: full.content }); },
  async shares(id) { return cbCheck(await sb.from("shares").select("email,role").eq("file_id", id).order("created_at")); },
  async share(id, email, role) { cbCheck(await sb.from("shares").upsert({ file_id: id, email: email.toLowerCase(), role })); },
  async unshare(id, email) { cbCheck(await sb.from("shares").delete().eq("file_id", id).eq("email", email)); },
  async profiles(ids) {
    ids = [...new Set(ids)].filter(Boolean);
    if (!ids.length) return {};
    const rows = cbCheck(await sb.from("profiles").select("id,email,display_name").in("id", ids));
    return Object.fromEntries(rows.map(r => [r.id, r]));
  },
};

async function cbUpload(file) {
  if (!/^image\/(png|jpe?g|gif|webp)$/.test(file.type)) throw new Error("Images only (PNG, JPEG, GIF, WebP).");
  if (file.size > 10 * 1024 * 1024) throw new Error("Images must be under 10 MB.");
  const path = `${CB_USER.id}/${crypto.randomUUID()}.${file.type.split("/")[1].replace("jpeg", "jpg")}`;
  const { error } = await sb.storage.from(CB_CONFIG.bucket).upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(error.message);
  return sb.storage.from(CB_CONFIG.bucket).getPublicUrl(path).data.publicUrl;
}
function cbPickFile(accept = "image/*") {
  return new Promise(res => { const i = cbEl("input", { type: "file", accept }); i.onchange = () => res(i.files[0] || null); i.click(); });
}

/* ── menus & dialogs ─────────────────────────────────────────────────────── */
function cbMenu(x, y, items) {
  $$(".menu").forEach(m => m.remove());
  const m = cbEl("div", { class: "menu", role: "menu" });
  for (const it of items) {
    if (it === "-") { m.append(cbEl("hr")); continue; }
    if (!it) continue;
    const b = cbEl("button", { role: "menuitem", class: it.danger ? "danger" : "", onclick: () => { m.remove(); it.run(); } });
    if (it.icon) b.append(cbIconEl(it.icon));
    b.append(cbEl("span", { text: it.label }));
    if (it.key) b.append(cbEl("span", { class: "k", text: it.key }));
    m.append(b);
  }
  document.body.append(m);
  const r = m.getBoundingClientRect();
  m.style.left = Math.max(6, Math.min(x, innerWidth - r.width - 6)) + "px";
  m.style.top = Math.max(6, y + r.height > innerHeight - 6 ? y - r.height : y) + "px";
  const close = e => { if (!m.contains(e.target)) { m.remove(); removeEventListener("mousedown", close, true); removeEventListener("keydown", esc, true); } };
  const esc = e => { if (e.key === "Escape") { m.remove(); removeEventListener("mousedown", close, true); removeEventListener("keydown", esc, true); } };
  setTimeout(() => { addEventListener("mousedown", close, true); addEventListener("keydown", esc, true); });
  m.querySelector("button")?.focus();
  return m;
}
function cbMenuAt(anchor, items) { const r = anchor.getBoundingClientRect(); return cbMenu(r.left, r.bottom + 4, items); }

function cbDialog(title, body, actions = []) {
  return new Promise(resolve => {
    const scrim = cbEl("div", { class: "scrim" });
    const d = cbEl("div", { class: "dialog", role: "dialog", "aria-modal": "true", "aria-label": title }, cbEl("h2", { text: title }));
    if (body) d.append(body);
    const act = cbEl("div", { class: "actions" });
    const done = v => { scrim.remove(); removeEventListener("keydown", key, true); resolve(v); };
    for (const a of actions) act.append(cbEl("button", { class: "btn " + (a.cls || ""), type: "button", text: a.label, onclick: async () => { const v = a.value ? await a.value() : a.result; if (v !== undefined) done(v); } }));
    if (actions.length) d.append(act);
    const key = e => { if (e.key === "Escape") done(null); if (e.key === "Enter" && e.target.tagName === "INPUT") act.querySelector(".primary")?.click(); };
    addEventListener("keydown", key, true);
    scrim.addEventListener("mousedown", e => { if (e.target === scrim) done(null); });
    scrim.append(d); document.body.append(scrim);
    setTimeout(() => (d.querySelector("input,select,textarea") || act.querySelector(".primary"))?.focus(), 20);
  });
}
async function cbPrompt(title, value = "", label = "") {
  const inp = cbEl("input", { class: "field", value });
  const body = cbEl("div", {}, label ? cbEl("label", { class: "lbl", text: label }) : null, inp);
  setTimeout(() => inp.select(), 30);
  return cbDialog(title, body, [{ label: "Cancel", result: null }, { label: "OK", cls: "primary", value: () => inp.value.trim() || undefined }]);
}
const cbConfirm = (title, text, ok = "OK", danger) => cbDialog(title, cbEl("p", { class: "muted", text }), [{ label: "Cancel", result: false }, { label: ok, cls: danger ? "primary" : "primary", result: true }]);

function cbFileURL(f) { return `${CB_KINDS[f.kind].page}?id=${f.id}`; }
function cbAbsURL(f) { return new URL(cbFileURL(f), location.href).href; }

async function cbShareDialog(file) {
  const isOwner = file.owner === CB_USER.id;
  const body = cbEl("div");
  const list = cbEl("div", { style: { margin: "10px 0", display: "grid", gap: "6px" } });
  const email = cbEl("input", { class: "field", placeholder: "Add people by username", autocapitalize: "none", spellcheck: "false", style: { flex: "1" } });
  const role = cbEl("select", { class: "field", style: { width: "110px" } }, cbEl("option", { value: "editor", text: "Editor" }), cbEl("option", { value: "viewer", text: "Viewer" }));
  const add = cbEl("button", { class: "btn primary", type: "button", text: "Share", style: { height: "38px" } });
  const link = cbEl("select", { class: "field" }, cbEl("option", { value: "none", text: "Restricted — only people added above" }), cbEl("option", { value: "view", text: "Anyone signed in with the link can view" }), cbEl("option", { value: "edit", text: "Anyone signed in with the link can edit" }));
  link.value = file.link_access || "none";
  const refresh = async () => {
    list.innerHTML = "";
    const owner = (await cbFiles.profiles([file.owner]))[file.owner];
    list.append(cbEl("div", { style: { display: "flex", alignItems: "center", gap: "10px" } }, cbEl("span", { class: "avatar", style: { marginLeft: 0, background: cbColorFor(owner?.email || "") }, text: (owner?.display_name || owner?.email || "?")[0] }), cbEl("span", { style: { flex: 1 }, text: owner?.display_name || cbUname(owner?.email) || "Owner" }), cbEl("span", { class: "muted", text: "Owner" })));
    for (const s of await cbFiles.shares(file.id)) {
      list.append(cbEl("div", { style: { display: "flex", alignItems: "center", gap: "10px" } },
        cbEl("span", { class: "avatar", style: { marginLeft: 0, background: cbColorFor(s.email) }, text: s.email[0] }), cbEl("span", { style: { flex: 1 }, text: cbUname(s.email) }),
        cbEl("span", { class: "muted", text: s.role === "editor" ? "Editor" : "Viewer" }),
        isOwner ? cbEl("button", { class: "icon-btn", title: "Remove " + cbUname(s.email), "aria-label": "Remove " + cbUname(s.email), html: cbIcon("close"), onclick: async () => { await cbFiles.unshare(file.id, s.email); refresh(); } }) : null));
    }
  };
  add.onclick = async () => {
    const e = email.value.trim().toLowerCase();
    if (!CB_UNAME.test(e) && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return cbToast("Enter their Cinnabar username");
    try { await cbFiles.share(file.id, cbLoginId(e), role.value); email.value = ""; refresh(); cbToast(`Shared with ${cbUname(e)}`); } catch (ex) { cbToast(ex.message); }
  };
  link.onchange = async () => { try { Object.assign(file, await cbFiles.update(file.id, { link_access: link.value })); cbToast("Link access updated"); } catch (ex) { cbToast(ex.message); } };
  if (isOwner) body.append(cbEl("div", { style: { display: "flex", gap: "8px", marginTop: "12px" } }, email, role, add));
  body.append(list);
  body.append(cbEl("label", { class: "lbl", text: "General access" }), link);
  if (!isOwner) { link.disabled = true; body.append(cbEl("p", { class: "muted", text: "Only the owner can change sharing." })); }
  body.append(cbEl("p", { class: "muted", style: { fontSize: "12px" }, text: "People open shared files from “Shared with me” in Cinnabar Drive, or with the link." }));
  await refresh();
  cbDialog(`Share “${file.title}”`, body, [
    { label: "Copy link", value: async () => { await navigator.clipboard.writeText(cbAbsURL(file)).catch(() => 0); cbToast("Link copied"); return undefined; } },
    { label: "Done", cls: "primary", result: true },
  ]);
}

async function cbMoveDialog(file) {
  const folders = (await cbFiles.folders()).filter(f => f.id !== file.id);
  // exclude descendants of the file being moved
  const kids = new Map(); folders.forEach(f => (kids.get(f.parent) || kids.set(f.parent, []).get(f.parent)).push(f));
  const bad = new Set([file.id]); const stack = [file.id];
  while (stack.length) for (const k of kids.get(stack.pop()) || []) { bad.add(k.id); stack.push(k.id); }
  const sel = cbEl("select", { class: "field", size: 8, style: { height: "auto" } }, cbEl("option", { value: "", text: "My Drive" }));
  const add = (parent, depth) => (kids.get(parent) || []).filter(f => !bad.has(f.id)).forEach(f => { sel.append(cbEl("option", { value: f.id, text: "  ".repeat(depth + 1) + f.title })); add(f.id, depth + 1); });
  add(null, 0);
  sel.value = file.parent || "";
  const v = await cbDialog(`Move “${file.title}”`, sel, [{ label: "Cancel", result: null }, { label: "Move", cls: "primary", value: () => ({ to: sel.value || null }) }]);
  if (!v) return null;
  return cbFiles.update(file.id, { parent: v.to });
}

/* ── editor shell: header, title, autosave, presence, live refresh ─────────── */
async function cbBootEditor(kind, { getContent, setContent, emptyContent, onReadonly, menus = [] }) {
  const meta = CB_KINDS[kind];
  document.title = meta.blank + " — Cinnabar " + meta.name;
  await cbRequireAuth(meta.name);
  const params = new URLSearchParams(location.search);
  let file;
  try {
    if (params.get("id")) file = await cbFiles.get(params.get("id"));
    else {
      file = await cbFiles.create(kind, params.get("title") || meta.blank, { parent: params.get("parent") || null, content: emptyContent() });
      history.replaceState(null, "", cbFileURL(file));
    }
  } catch (ex) {
    document.body.innerHTML = "";
    cbWave();
    document.body.append(cbEl("div", { class: "auth" }, cbEl("div", { class: "card", style: { padding: "30px" } }, cbLogo(meta.name), cbEl("h1", { text: "Can't open this file" }), cbEl("p", { class: "muted", text: ex.message }), cbEl("a", { class: "btn primary", href: "index.html", text: "Go to Drive" }))));
    throw ex;
  }
  const isOwner = file.owner === CB_USER.id;
  let canEdit = isOwner || file.link_access === "edit";
  if (!canEdit) { const sh = await cbFiles.shares(file.id).catch(() => []); canEdit = sh.some(s => s.email.toLowerCase() === (CB_USER.email || "").toLowerCase() && s.role === "editor"); }

  // header
  const top = $(".cb-top");
  const crystal = cbEl("a", { class: "crystal", href: "index.html", title: "Cinnabar Drive", html: cbCrystal() });
  const title = cbEl("input", { value: file.title, "aria-label": "File name", spellcheck: "false", readonly: !canEdit });
  const status = cbEl("span", { text: canEdit ? "Saved" : "View only" });
  const sub = cbEl("div", { class: "sub" });
  for (const mn of menus) sub.append(cbEl("button", { type: "button", text: mn.label, onclick: e => cbMenuAt(e.currentTarget, typeof mn.items === "function" ? mn.items() : mn.items) }));
  sub.append(status);
  const star = cbEl("button", { class: "icon-btn" + (file.starred ? " on" : ""), title: "Star", "aria-label": "Star", html: cbIcon("star"), hidden: !isOwner });
  star.onclick = async () => { file.starred = !file.starred; star.classList.toggle("on", file.starred); await cbFiles.update(file.id, { starred: file.starred }).catch(e => cbToast(e.message)); };
  const avatars = cbEl("div", { class: "avatars" });
  const share = cbEl("button", { class: "btn primary", html: cbIcon("share") + "<span>Share</span>", onclick: () => cbShareDialog(file) });
  const me = cbEl("button", { class: "avatar", title: cbUname(CB_USER.email), style: { background: cbColorFor(CB_USER.email), cursor: "pointer", marginLeft: "4px" }, text: cbName()[0] });
  me.onclick = e => cbMenuAt(e.currentTarget, [{ label: cbUname(CB_USER.email), icon: "shared", run() {} }, "-", { label: "Cinnabar Drive", icon: "drive", run: () => (location.href = "index.html") }, { label: "Sign out", icon: "logout", run: cbSignOut }]);
  top.append(crystal, cbEl("div", { class: "cb-title" }, cbEl("div", { style: { display: "flex", alignItems: "center", gap: "4px" } }, title, star), sub), cbEl("div", { class: "grow" }), avatars, share, me);

  // saving
  let dirty = false, saving = false, timer = 0, lastSaved = file.updated_at;
  const setStatus = t => (status.textContent = t);
  const save = async () => {
    clearTimeout(timer);
    if (!canEdit || saving || !dirty) return;
    saving = true; dirty = false; setStatus("Saving…");
    try {
      lastSaved = await cbFiles.save(file.id, title.value.trim() || meta.blank, getContent());
      file.title = title.value.trim() || meta.blank; file.updated_at = lastSaved;
      setStatus("Saved"); live.send({ type: "broadcast", event: "saved", payload: { at: lastSaved, by: CB_USER.id } });
    } catch (ex) { dirty = true; setStatus("Not saved — retrying"); timer = setTimeout(save, 4000); }
    finally { saving = false; if (dirty) timer = setTimeout(save, 800); }
  };
  const changed = () => { if (!canEdit) return; dirty = true; setStatus("Editing…"); clearTimeout(timer); timer = setTimeout(save, 900); };
  title.addEventListener("input", () => { document.title = (title.value || meta.blank) + " — Cinnabar " + meta.name; changed(); });
  title.addEventListener("keydown", e => { if (e.key === "Enter") title.blur(); });
  addEventListener("keydown", e => { if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); dirty = true; save(); } }, true);
  addEventListener("beforeunload", e => { if (dirty || saving) { save(); e.preventDefault(); e.returnValue = ""; } });
  document.addEventListener("visibilitychange", () => { if (document.hidden) save(); });

  // realtime: presence + "saved" pings; content always re-read through open_file (access-checked)
  const live = sb.channel("file:" + file.id, { config: { presence: { key: CB_USER.id + ":" + Math.random().toString(36).slice(2, 6) } } });
  live.on("presence", { event: "sync" }, () => {
    const seen = new Map();
    for (const arr of Object.values(live.presenceState())) for (const p of arr) if (p.uid !== CB_USER.id) seen.set(p.uid, p);
    avatars.innerHTML = "";
    for (const p of seen.values()) avatars.append(cbEl("span", { class: "avatar", title: `${p.name} is here`, style: { background: cbColorFor(p.email) }, text: (p.name || "?")[0] }));
  });
  live.on("broadcast", { event: "saved" }, async ({ payload }) => {
    if (payload.by === CB_USER.id && payload.at === lastSaved) return;
    if (dirty || saving) { setStatus("Someone else edited — your changes will win"); return; }
    try { const f = await cbFiles.get(file.id); lastSaved = f.updated_at; file.title = f.title; if (document.activeElement !== title) title.value = f.title; setContent(f.content, true); setStatus("Updated just now"); } catch {}
  });
  live.subscribe(st => { if (st === "SUBSCRIBED") live.track({ uid: CB_USER.id, name: cbName(), email: CB_USER.email }); });

  document.title = file.title + " — Cinnabar " + meta.name;
  setContent(file.content, false);
  if (!canEdit) onReadonly?.();
  return { file, changed, save, canEdit, setStatus };
}

function cbDownload(name, data, type) {
  const a = cbEl("a", { href: URL.createObjectURL(new Blob([data], { type })), download: name });
  document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
const cbSafeName = s => (s || "untitled").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 120);

/* Password-reset emails land here signed in with a recovery session: ask for the new password. */
sb.auth.onAuthStateChange(ev => {
  if (ev !== "PASSWORD_RECOVERY") return;
  setTimeout(async () => {
    for (;;) {
      const inp = cbEl("input", { class: "field", type: "password", autocomplete: "new-password", minlength: 6 });
      setTimeout(() => inp.focus(), 30);
      const pw = await cbDialog("Choose a new password", cbEl("div", {}, cbEl("label", { class: "lbl", text: "New password (6+ characters)" }), inp),
        [{ label: "Cancel", result: null }, { label: "Save password", cls: "primary", value: () => inp.value }]);
      if (pw == null) return;
      if (pw.length < 6) { cbToast("Password must be at least 6 characters."); continue; }
      const { error } = await sb.auth.updateUser({ password: pw });
      if (error) { cbToast(error.message); continue; }
      cbToast("Password updated.");
      history.replaceState(null, "", location.pathname);
      return;
    }
  }, 0);
});

/* Liquid Glass: the rim light follows the pointer across whatever glass it is over (lib/cinnabar.css --mx/--my). */
addEventListener("pointermove", e => {
  const g = e.target.closest?.(".hub-side, .hub-bar, .cb-top, .dialog, .menu, .tabs, .btn, .auth .card, .grade-bar, .seg");
  if (!g) return;
  const r = g.getBoundingClientRect();
  g.style.setProperty("--mx", ((e.clientX - r.left) / r.width * 100).toFixed(1) + "%");
  g.style.setProperty("--my", ((e.clientY - r.top) / r.height * 100).toFixed(1) + "%");
}, { passive: true });
