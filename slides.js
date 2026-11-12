/* Cinnabar Slides — presentation editor (960×540 canvas, scaled) */
"use strict";
const SW = 960, SH = 540;
let deck = { slides: [] }, at = 0, sel = null, editingEl = null, ed = null, clipEl = null;
const undoStack = [], redoStack = [];
const uid = () => Math.random().toString(36).slice(2, 9);
const slide = () => deck.slides[at];
const THEMES = {
  "Cinnabar": { bg: "#0b0807", title: "#f4ece8", body: "#cdbfba", accent: "#ff6a2a" },
  "Ember": { bg: "linear-gradient(135deg,#120807,#3a0d06 60%,#a8240f)", title: "#ffffff", body: "#ffd9cf", accent: "#ffb08a" },
  "Wave": { bg: "url(assets/bg.jpg)", title: "#ffffff", body: "#f1dcd5", accent: "#ff7a1a" },
  "Paper": { bg: "#fbf7f4", title: "#1d1715", body: "#4a3a35", accent: "#e2361f" },
  "Slate": { bg: "#14181c", title: "#eef2f5", body: "#aab6c0", accent: "#ff7a1a" },
};
const SWATCHES = ["#0b0807", "#1d1513", "#3a0d06", "#e2361f", "#ff7a1a", "#f4a83a", "#fbf7f4", "#ffffff", "#14181c", "#24343f"];
const FONTS = { sans: '"Canva Sans", system-ui, sans-serif', serif: "Georgia, 'Noto Serif', serif", mono: "ui-monospace, monospace", display: '"Canva Sans", system-ui, sans-serif' };

const theme = () => THEMES[deck.theme] || THEMES.Cinnabar;
function layout(kind) {
  const t = theme(), s = { id: uid(), bg: t.bg, notes: "", els: [] };
  const T = (x, y, w, h, html, st) => s.els.push({ id: uid(), type: "text", x, y, w, h, html, st });
  if (kind === "title") { T(80, 180, 800, 110, "Title", { size: 56, color: t.title, align: "center", bold: 1, font: "display" }); T(180, 305, 600, 50, "Subtitle", { size: 22, color: t.body, align: "center" }); }
  if (kind === "content") { T(60, 40, 840, 80, "Heading", { size: 40, color: t.title, bold: 1, font: "display" }); T(60, 140, 840, 340, "<ul><li>First point</li><li>Second point</li><li>Third point</li></ul>", { size: 26, color: t.body }); }
  if (kind === "two") { T(60, 40, 840, 80, "Heading", { size: 40, color: t.title, bold: 1, font: "display" }); T(60, 140, 400, 340, "<ul><li>Left point</li></ul>", { size: 24, color: t.body }); T(500, 140, 400, 340, "<ul><li>Right point</li></ul>", { size: 24, color: t.body }); }
  if (kind === "section") { T(60, 200, 840, 140, "Section", { size: 64, color: t.accent, bold: 1, font: "display" }); }
  if (kind === "quote") { T(120, 150, 720, 200, "“A memorable quote goes here.”", { size: 40, color: t.title, align: "center", italic: 1, font: "serif" }); T(120, 370, 720, 40, "— Someone", { size: 20, color: t.body, align: "center" }); }
  return s;
}

/* ── rendering ──────────────────────────────────────────────────────────── */
const safeBg = v => (/^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|linear-gradient\([#\w\s,.%()-]+\)|radial-gradient\([#\w\s,.%()-]+\)|url\((assets\/bg\.jpg|https:\/\/[^)\s"']+)\))$/i.test(v || "") ? v : "#0b0807");
const safeColor = v => (/^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|transparent)$/i.test(v || "") ? v : null);
function shapeSVG(e) {
  const f = safeColor(e.fill) || "#e2361f", s = safeColor(e.stroke) || "none", sw = e.stroke ? 3 : 0;
  const d = { rect: `<rect x="0" y="0" width="100" height="100" rx="${e.radius ?? 0}"/>`, round: `<rect x="0" y="0" width="100" height="100" rx="14"/>`, ellipse: `<ellipse cx="50" cy="50" rx="50" ry="50"/>`,
    triangle: `<polygon points="50,0 100,100 0,100"/>`, arrow: `<polygon points="0,30 62,30 62,0 100,50 62,100 62,70 0,70"/>`, star: `<polygon points="50,0 61,35 98,35 68,57 79,91 50,70 21,91 32,57 2,35 39,35"/>`,
    line: `<line x1="0" y1="50" x2="100" y2="50" stroke="${f}" stroke-width="4" vector-effect="non-scaling-stroke"/>` }[e.shape] || "";
  return `<svg class="sh" viewBox="0 0 100 100" preserveAspectRatio="none"><g fill="${e.shape === "line" ? "none" : f}" stroke="${s}" stroke-width="${sw}" vector-effect="non-scaling-stroke">${d}</g></svg>`;
}
function elNode(e, interactive) {
  const n = cbEl("div", { class: "el " + e.type, "data-id": e.id });
  Object.assign(n.style, { left: e.x + "px", top: e.y + "px", width: e.w + "px", height: e.h + "px", transform: e.rot ? `rotate(${+e.rot}deg)` : "" });
  if (e.type === "image") { const img = cbEl("img", { alt: "", draggable: "false" }); if (/^https:\/\//.test(e.src || "")) img.src = e.src; n.append(img); }
  if (e.type === "shape") n.insertAdjacentHTML("beforeend", shapeSVG(e));
  if (e.type === "text" || (e.type === "shape" && e.shape !== "line")) {
    const st = e.st || {}, t = cbEl("div", { class: "txt" });
    t.innerHTML = cbSanitize(e.html || "");
    Object.assign(t.style, { fontSize: (+st.size || 24) + "px", color: safeColor(st.color) || "#f4ece8", textAlign: st.align || "left", fontWeight: st.bold ? "700" : "400",
      fontStyle: st.italic ? "italic" : "normal", textDecoration: st.underline ? "underline" : "none", fontFamily: FONTS[st.font] || FONTS.sans,
      justifyContent: { middle: "center", bottom: "flex-end" }[st.valign || (e.type === "shape" ? "middle" : "top")] || "flex-start", position: "relative" });
    n.append(t);
  }
  if (interactive && sel === e.id) { n.classList.add("sel"); for (const h of ["nw", "n", "ne", "e", "se", "s", "sw", "w"]) n.append(cbEl("span", { class: "h " + h, "data-h": h })); }
  return n;
}
function slideNode(s, interactive = false) {
  const n = cbEl("div", { class: "slide" });
  n.style.background = safeBg(s.bg);
  for (const e of s.els) n.append(elNode(e, interactive));
  if (interactive && !s.els.length) n.append(cbEl("div", { class: "empty-hint", text: "Add text, shapes or images from the toolbar" }));
  return n;
}
let scale = 1;
const stage = $("#stage");
function fitStage() {
  const w = $("#stagewrap"), notesH = $("#notes").offsetHeight + 12;
  scale = Math.max(0.2, Math.min((w.clientWidth - 44) / SW, (w.clientHeight - 34 - notesH) / SH));
  stage.style.width = SW * scale + "px"; stage.style.height = SH * scale + "px";
  const sn = stage.firstChild; if (sn) sn.style.transform = `scale(${scale})`;
}
function renderStage() {
  if (editingEl) return;
  stage.innerHTML = "";
  if (!slide()) return;
  stage.append(slideNode(slide(), true));
  fitStage();
  $("#notes").value = slide().notes || "";
  renderProps();
}
function renderStrip() {
  const strip = $("#strip"); strip.innerHTML = "";
  const k = 150 / SW;
  deck.slides.forEach((s, i) => {
    const th = cbEl("div", { class: "thumb" + (i === at ? " on" : ""), draggable: ed?.canEdit ? "true" : "false", tabindex: "0", "aria-label": `Slide ${i + 1}` });
    const sn = slideNode(s); sn.style.transform = `scale(${k})`; th.append(sn);
    th.onclick = () => go(i);
    th.oncontextmenu = e => { e.preventDefault(); go(i); if (ed.canEdit) cbMenu(e.clientX, e.clientY, slideMenu()); };
    th.ondragstart = e => { e.dataTransfer.setData("text/plain", String(i)); e.dataTransfer.effectAllowed = "move"; };
    th.ondragover = e => { e.preventDefault(); th.classList.add("drop"); };
    th.ondragleave = () => th.classList.remove("drop");
    th.ondrop = e => { e.preventDefault(); th.classList.remove("drop"); const from = +e.dataTransfer.getData("text/plain"); if (from !== i) { snap(); const [m] = deck.slides.splice(from, 1); deck.slides.splice(i, 0, m); at = i; changed(); } };
    strip.append(cbEl("div", { class: "thumbrow" }, cbEl("span", { class: "no", text: i + 1 }), th));
  });
  strip.querySelector(".thumb.on")?.scrollIntoView({ block: "nearest" });
}
function renderAll() { renderStrip(); renderStage(); }
function go(i) { if (editingEl) stopEditing(); at = Math.max(0, Math.min(deck.slides.length - 1, i)); sel = null; renderAll(); }

/* ── mutations ──────────────────────────────────────────────────────────── */
function snap() { undoStack.push(JSON.stringify({ deck, at })); if (undoStack.length > 100) undoStack.shift(); redoStack.length = 0; }
function changed(full = true) { full ? renderAll() : (renderStage(), renderStrip()); ed?.changed(); }
function undo() { if (!undoStack.length) return; redoStack.push(JSON.stringify({ deck, at })); ({ deck, at } = JSON.parse(undoStack.pop())); sel = null; changed(); }
function redo() { if (!redoStack.length) return; undoStack.push(JSON.stringify({ deck, at })); ({ deck, at } = JSON.parse(redoStack.pop())); sel = null; changed(); }
const selEl = () => slide()?.els.find(e => e.id === sel);
function addSlide(kind = "content", after = at) { snap(); deck.slides.splice(after + 1, 0, layout(kind)); at = after + 1; sel = null; changed(); }
function slideMenu() {
  return [
    { label: "New slide", icon: "plus", key: "Ctrl+M", run: () => addSlide() },
    { label: "Duplicate slide", icon: "copy", run: () => { snap(); const c = structuredClone(slide()); c.id = uid(); c.els.forEach(e => (e.id = uid())); deck.slides.splice(at + 1, 0, c); at++; changed(); } },
    { label: "Move up", run: () => { if (at > 0) { snap(); [deck.slides[at - 1], deck.slides[at]] = [deck.slides[at], deck.slides[at - 1]]; at--; changed(); } } },
    { label: "Move down", run: () => { if (at < deck.slides.length - 1) { snap(); [deck.slides[at + 1], deck.slides[at]] = [deck.slides[at], deck.slides[at + 1]]; at++; changed(); } } },
    "-", { label: "Delete slide", icon: "trash", danger: true, run: deleteSlide },
  ];
}
function deleteSlide() { if (deck.slides.length <= 1) return cbToast("A presentation needs at least one slide"); snap(); deck.slides.splice(at, 1); at = Math.min(at, deck.slides.length - 1); sel = null; changed(); }
function addEl(e) { snap(); e.id = uid(); slide().els.push(e); sel = e.id; changed(); }
function addText() { addEl({ type: "text", x: 280, y: 220, w: 400, h: 80, html: "Text", st: { size: 28, color: theme().title } }); setTimeout(() => startEditing(sel, true), 30); }
function addShape(shape) { addEl({ type: "shape", shape, x: 380, y: 170, w: shape === "line" ? 260 : 200, h: shape === "line" ? 20 : 200, fill: theme().accent, html: "", st: { size: 22, color: "#ffffff", align: "center" } }); }
async function addImage() {
  cbMenuAt($("#imgbtn"), [
    { label: "Upload from computer", icon: "upload", run: async () => { const f = await cbPickFile(); if (!f) return; cbToast("Uploading…", 20000); try { const url = await cbUpload(f); insertImage(url); cbToast("Image added"); } catch (e) { cbToast(e.message); } } },
    { label: "By URL", icon: "link", run: async () => { const u = await cbPrompt("Image address", "https://"); if (u && /^https:\/\//.test(u)) insertImage(u); else if (u) cbToast("Use an https:// address"); } },
  ]);
}
function insertImage(src) {
  const img = new Image();
  img.onload = () => { const r = Math.min(600 / img.naturalWidth, 400 / img.naturalHeight, 1); const w = Math.round(img.naturalWidth * r), h = Math.round(img.naturalHeight * r); addEl({ type: "image", src, x: (SW - w) / 2, y: (SH - h) / 2, w, h }); };
  img.onerror = () => addEl({ type: "image", src, x: 280, y: 120, w: 400, h: 300 });
  img.src = src;
}
function setTheme(name) {
  snap(); const old = theme(); deck.theme = name; const t = theme();
  for (const s of deck.slides) {
    if (s.bg === old.bg || !s.bg) s.bg = t.bg;
    for (const e of s.els) { if (!e.st) continue; if (e.st.color === old.title) e.st.color = t.title; else if (e.st.color === old.body) e.st.color = t.body; else if (e.st.color === old.accent) e.st.color = t.accent; if (e.fill === old.accent) e.fill = t.accent; }
  }
  changed();
}

/* ── stage interaction: select, drag, resize, edit text ─────────────────── */
let drag = null;
stage.addEventListener("mousedown", e => {
  if (!ed.canEdit || e.button !== 0) return;
  const elN = e.target.closest(".el"), h = e.target.dataset?.h;
  if (editingEl && elN?.dataset.id === editingEl) return; // clicks inside the text being edited
  if (editingEl) stopEditing();
  if (!elN) { if (sel) { sel = null; renderStage(); } return; }
  e.preventDefault();
  const id = elN.dataset.id, el = slide().els.find(x => x.id === id);
  if (sel !== id) { sel = id; renderStage(); }
  drag = { id, h, sx: e.clientX, sy: e.clientY, o: { x: el.x, y: el.y, w: el.w, h: el.h }, moved: false };
});
addEventListener("mousemove", e => {
  if (!drag) return;
  const el = slide().els.find(x => x.id === drag.id); if (!el) return;
  const dx = (e.clientX - drag.sx) / scale, dy = (e.clientY - drag.sy) / scale, o = drag.o, h = drag.h;
  if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 2) return;
  if (!drag.moved) { snap(); drag.moved = true; }
  if (!h) {
    let x = Math.round(o.x + dx), y = Math.round(o.y + dy);
    for (const [v, set] of [[SW / 2 - el.w / 2, nx => (x = nx)]]) if (Math.abs(x - v) < 6) set(Math.round(v)); // snap to centre
    if (Math.abs(y - (SH / 2 - el.h / 2)) < 6) y = Math.round(SH / 2 - el.h / 2);
    el.x = x; el.y = y;
  } else {
    let { x, y, w, h: hh } = o;
    if (h.includes("e")) w = Math.max(20, o.w + dx);
    if (h.includes("s")) hh = Math.max(12, o.h + dy);
    if (h.includes("w")) { w = Math.max(20, o.w - dx); x = o.x + o.w - w; }
    if (h.includes("n")) { hh = Math.max(12, o.h - dy); y = o.y + o.h - hh; }
    if (e.shiftKey && el.type === "image") hh = w * o.h / o.w;
    Object.assign(el, { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(hh) });
  }
  const n = stage.querySelector(`.el[data-id="${el.id}"]`);
  Object.assign(n.style, { left: el.x + "px", top: el.y + "px", width: el.w + "px", height: el.h + "px" });
});
addEventListener("mouseup", () => { if (drag?.moved) changed(false); drag = null; });
stage.addEventListener("dblclick", e => { const n = e.target.closest(".el"); if (n && ed.canEdit) startEditing(n.dataset.id); });
function startEditing(id, selectAll) {
  const el = slide().els.find(x => x.id === id);
  if (!el || el.type === "image" || el.shape === "line") return;
  sel = id; renderStage(); editingEl = id;
  const n = stage.querySelector(`.el[data-id="${id}"]`), t = n.querySelector(".txt");
  n.classList.add("editing"); n.querySelectorAll(".h").forEach(h => h.remove());
  t.contentEditable = "true"; t.focus();
  const r = document.createRange(); r.selectNodeContents(t); if (!selectAll) r.collapse(false);
  getSelection().removeAllRanges(); getSelection().addRange(r);
  snap();
  t.addEventListener("input", () => { el.html = cbSanitize(t.innerHTML); ed.changed(); renderStripSoon(); });
  t.addEventListener("paste", ev => { ev.preventDefault(); document.execCommand("insertText", false, ev.clipboardData.getData("text/plain")); });
}
function stopEditing() {
  if (!editingEl) return;
  const n = stage.querySelector(`.el[data-id="${editingEl}"]`), el = slide().els.find(x => x.id === editingEl);
  if (n && el) el.html = cbSanitize(n.querySelector(".txt").innerHTML);
  if (el && el.type === "text" && !n?.innerText.trim()) slide().els = slide().els.filter(x => x !== el);
  editingEl = null; changed(false);
}
let stripT; const renderStripSoon = () => { clearTimeout(stripT); stripT = setTimeout(renderStrip, 400); };
$("#notes").addEventListener("input", e => { slide().notes = e.target.value; ed.changed(); });

addEventListener("keydown", e => {
  if (!$("#present").hidden) return presentKey(e);
  const mod = e.ctrlKey || e.metaKey, tag = document.activeElement?.tagName;
  if (editingEl) { if (e.key === "Escape") { e.preventDefault(); stopEditing(); } else if (mod && /^[biu]$/.test(e.key)) { e.preventDefault(); document.execCommand({ b: "bold", i: "italic", u: "underline" }[e.key]); } return; }
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || document.activeElement?.isContentEditable) return;
  if (e.key === "F5" || (mod && e.key === "Enter")) { e.preventDefault(); present(e.shiftKey ? at : 0); return; }
  if (!ed?.canEdit) { if (e.key === "ArrowDown" || e.key === "PageDown") go(at + 1); if (e.key === "ArrowUp" || e.key === "PageUp") go(at - 1); return; }
  if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
  if (mod && e.key.toLowerCase() === "m") { e.preventDefault(); addSlide(); return; }
  const el = selEl();
  if (!el) {
    if (e.key === "ArrowDown" || e.key === "PageDown") { e.preventDefault(); go(at + 1); }
    if (e.key === "ArrowUp" || e.key === "PageUp") { e.preventDefault(); go(at - 1); }
    if ((e.key === "Delete" || e.key === "Backspace") && document.activeElement?.classList.contains("thumb")) deleteSlide();
    if (mod && e.key.toLowerCase() === "v" && clipEl) { e.preventDefault(); const c = structuredClone(clipEl); c.x += 20; c.y += 20; addEl(c); }
    return;
  }
  const nudge = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  if (nudge) { e.preventDefault(); snap(); el.x += nudge[0] * (e.shiftKey ? 10 : 1); el.y += nudge[1] * (e.shiftKey ? 10 : 1); changed(false); return; }
  if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); snap(); slide().els = slide().els.filter(x => x !== el); sel = null; changed(false); return; }
  if (e.key === "Enter") { e.preventDefault(); startEditing(el.id); return; }
  if (e.key === "Escape") { sel = null; renderStage(); return; }
  if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); const c = structuredClone(el); c.x += 20; c.y += 20; addEl(c); return; }
  if (mod && e.key.toLowerCase() === "c") { clipEl = structuredClone(el); return; }
  if (mod && e.key.toLowerCase() === "x") { clipEl = structuredClone(el); snap(); slide().els = slide().els.filter(x => x !== el); sel = null; changed(false); return; }
  if (mod && e.key.toLowerCase() === "v" && clipEl) { e.preventDefault(); const c = structuredClone(clipEl); c.x += 20; c.y += 20; addEl(c); }
});

/* ── properties panel ───────────────────────────────────────────────────── */
function renderProps() {
  const p = $("#props"); p.innerHTML = "";
  if (!ed?.canEdit) { p.append(cbEl("h3", { text: "View only" }), cbEl("p", { class: "muted", text: "Ask the owner for edit access to change this presentation." })); return; }
  const el = selEl();
  const row = (label, input) => cbEl("div", { class: "row" }, cbEl("label", { text: label }), input);
  const num = (v, fn) => { const i = cbEl("input", { type: "number", class: "field", value: Math.round(v) }); i.onchange = () => { snap(); fn(+i.value || 0); changed(false); }; return i; };
  const col = (v, fn) => { const i = cbEl("input", { type: "color", value: /^#[0-9a-f]{6}$/i.test(v || "") ? v : "#ffffff" }); i.oninput = () => { fn(i.value); const n = stage.querySelector(".el.sel"); renderStage(); }; i.onchange = () => { snap(); fn(i.value); changed(false); }; return i; };
  if (!el) {
    p.append(cbEl("h3", { text: "Slide background" }));
    const sw = cbEl("div", { class: "swatches" });
    for (const c of SWATCHES) sw.append(cbEl("button", { title: c, "aria-label": "Background " + c, style: { background: c }, onclick: () => { snap(); slide().bg = c; changed(); } }));
    for (const g of ["linear-gradient(135deg,#120807,#3a0d06 60%,#a8240f)", "linear-gradient(160deg,#0b0807,#5a1206)", "linear-gradient(135deg,#ff7a1a,#e2361f)", "url(assets/bg.jpg)"])
      sw.append(cbEl("button", { title: "Gradient", "aria-label": "Gradient background", style: { background: g, backgroundSize: "cover" }, onclick: () => { snap(); slide().bg = g; changed(); } }));
    p.append(sw, row("Colour", col(/^#/.test(slide().bg) ? slide().bg : "#0b0807", v => (slide().bg = v))));
    p.append(cbEl("div", { class: "btns" },
      cbEl("button", { class: "btn", text: "Image…", onclick: async () => { const f = await cbPickFile(); if (!f) return; cbToast("Uploading…", 20000); try { const u = await cbUpload(f); snap(); slide().bg = `url(${u})`; changed(); cbToast("Background set"); } catch (x) { cbToast(x.message); } } }),
      cbEl("button", { class: "btn", text: "Apply to all", onclick: () => { snap(); deck.slides.forEach(s => (s.bg = slide().bg)); changed(); } })));
    p.append(cbEl("h3", { text: "Theme" }));
    const ts = cbEl("select", { class: "field" }); Object.keys(THEMES).forEach(n => ts.append(cbEl("option", { value: n, text: n }))); ts.value = deck.theme || "Cinnabar";
    ts.onchange = () => setTheme(ts.value); p.append(ts);
    p.append(cbEl("p", { class: "muted", style: { marginTop: "16px" }, text: "Double-click text to edit. Drag to move, drag the handles to resize. Arrow keys nudge (Shift = 10px). F5 presents." }));
    return;
  }
  p.append(cbEl("h3", { text: el.type === "image" ? "Image" : el.type === "shape" ? "Shape" : "Text box" }));
  p.append(row("X", num(el.x, v => (el.x = v))), row("Y", num(el.y, v => (el.y = v))), row("Width", num(el.w, v => (el.w = Math.max(10, v)))), row("Height", num(el.h, v => (el.h = Math.max(10, v)))), row("Rotate", num(el.rot || 0, v => (el.rot = v % 360))));
  if (el.type === "shape") { p.append(row("Fill", col(el.fill, v => (el.fill = v)))); p.append(row("Outline", col(el.stroke || "#ffffff", v => (el.stroke = v)))); }
  if (el.type === "text" || (el.type === "shape" && el.shape !== "line")) {
    const st = (el.st ||= {});
    p.append(cbEl("h3", { text: "Text", style: { marginTop: "16px" } }));
    p.append(row("Size", num(st.size || 24, v => (st.size = Math.max(6, Math.min(400, v))))), row("Colour", col(st.color, v => (st.color = v))));
    const fs = cbEl("select", { class: "field" }); [["sans", "Canva Sans"], ["serif", "Serif"], ["mono", "Mono"]].forEach(([v, t]) => fs.append(cbEl("option", { value: v, text: t }))); fs.value = st.font === "display" ? "sans" : st.font || "sans";
    fs.onchange = () => { snap(); st.font = fs.value; changed(false); }; p.append(row("Font", fs));
    const tog = (label, key, val = 1) => cbEl("button", { class: "btn" + (st[key] === val || (val === 1 && st[key]) ? " primary" : ""), text: label, onclick: () => { snap(); st[key] = st[key] === val ? 0 : val; changed(false); } });
    p.append(cbEl("div", { class: "btns" }, tog("B", "bold"), tog("I", "italic"), tog("U", "underline")));
    p.append(cbEl("div", { class: "btns" }, tog("Left", "align", "left"), tog("Centre", "align", "center"), tog("Right", "align", "right")));
    p.append(cbEl("div", { class: "btns" }, tog("Top", "valign", "top"), tog("Middle", "valign", "middle"), tog("Bottom", "valign", "bottom")));
  }
  p.append(cbEl("h3", { text: "Arrange", style: { marginTop: "16px" } }));
  const els = slide().els;
  p.append(cbEl("div", { class: "btns" },
    cbEl("button", { class: "btn", text: "To front", onclick: () => { snap(); els.splice(els.indexOf(el), 1); els.push(el); changed(false); } }),
    cbEl("button", { class: "btn", text: "To back", onclick: () => { snap(); els.splice(els.indexOf(el), 1); els.unshift(el); changed(false); } }),
    cbEl("button", { class: "btn", text: "Centre", onclick: () => { snap(); el.x = Math.round((SW - el.w) / 2); changed(false); } }),
    cbEl("button", { class: "btn", text: "Duplicate", onclick: () => { const c = structuredClone(el); c.x += 20; c.y += 20; addEl(c); } }),
    cbEl("button", { class: "btn danger", text: "Delete", onclick: () => { snap(); slide().els = els.filter(x => x !== el); sel = null; changed(false); } })));
}

/* ── present mode ───────────────────────────────────────────────────────── */
let pAt = 0, pTimer;
function present(from = 0) {
  if (editingEl) stopEditing();
  pAt = from; const box = $("#present"); box.hidden = false;
  document.documentElement.requestFullscreen?.().catch(() => {});
  showP();
}
function showP() {
  const box = $("#pstage"), k = Math.min(innerWidth / SW, innerHeight / SH);
  box.style.width = SW * k + "px"; box.style.height = SH * k + "px";
  box.innerHTML = ""; const sn = slideNode(deck.slides[pAt]); sn.style.transform = `scale(${k})`; box.append(sn);
  sn.querySelectorAll("a").forEach(a => (a.onclick = ev => ev.stopPropagation()));
  const bar = $("#pbar"); bar.innerHTML = "";
  bar.append(cbEl("button", { class: "icon-btn", "aria-label": "Previous", html: cbIcon("undo"), onclick: ev => { ev.stopPropagation(); stepP(-1); } }), cbEl("span", { text: `${pAt + 1} / ${deck.slides.length}` }),
    cbEl("button", { class: "icon-btn", "aria-label": "Next", html: cbIcon("redo"), onclick: ev => { ev.stopPropagation(); stepP(1); } }), cbEl("button", { class: "icon-btn", "aria-label": "Exit", html: cbIcon("close"), onclick: ev => { ev.stopPropagation(); endP(); } }));
}
function stepP(d) { const n = pAt + d; if (n >= deck.slides.length) return endP(); pAt = Math.max(0, n); showP(); }
function endP() { $("#present").hidden = true; if (document.fullscreenElement) document.exitFullscreen?.(); go(pAt); }
function presentKey(e) {
  const k = e.key;
  if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter", "n"].includes(k)) { e.preventDefault(); stepP(1); }
  else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace", "p"].includes(k)) { e.preventDefault(); stepP(-1); }
  else if (k === "Home") { pAt = 0; showP(); } else if (k === "End") { pAt = deck.slides.length - 1; showP(); }
  else if (k === "Escape") { e.preventDefault(); endP(); }
}
$("#present").addEventListener("click", () => stepP(1));
$("#present").addEventListener("mousemove", () => { $("#present").classList.add("cursor"); clearTimeout(pTimer); pTimer = setTimeout(() => $("#present").classList.remove("cursor"), 1800); });
document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && !$("#present").hidden) endP(); });
addEventListener("resize", () => { fitStage(); if (!$("#present").hidden) showP(); });

/* ── export ─────────────────────────────────────────────────────────────── */
function printDeck() {
  let pd = $(".print-deck"); pd?.remove();
  pd = cbEl("div", { class: "print-deck" });
  deck.slides.forEach(s => { const pg = cbEl("div", { class: "pg" }); pg.append(slideNode(s)); pd.append(pg); });
  document.body.append(pd);
  const st = cbEl("style", { text: "@page { size: 960px 540px; margin: 0 }" }); document.head.append(st);
  setTimeout(() => { print(); st.remove(); }, 300);
}
function exportHTML() {
  const pages = deck.slides.map(s => { const n = slideNode(s); return n.outerHTML; });
  const css = [...document.styleSheets].flatMap(ss => { try { return [...ss.cssRules].map(r => r.cssText).filter(t => /\.slide|\.el|svg\.sh/.test(t)); } catch { return []; } }).join("\n");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${cbEsc(ed.file.title)}</title><style>html,body{margin:0;height:100%;background:#000;overflow:hidden}#s{position:absolute;transform-origin:0 0}${css}</style></head><body><div id="s"></div><script>const P=${JSON.stringify(pages)};let i=0;const s=document.getElementById("s");function show(){const k=Math.min(innerWidth/960,innerHeight/540);s.style.transform="scale("+k+")";s.style.left=(innerWidth-960*k)/2+"px";s.style.top=(innerHeight-540*k)/2+"px";s.innerHTML=P[i];}addEventListener("keydown",e=>{if(["ArrowRight"," ","PageDown"].includes(e.key))i=Math.min(P.length-1,i+1);if(["ArrowLeft","PageUp"].includes(e.key))i=Math.max(0,i-1);show();});addEventListener("click",()=>{i=Math.min(P.length-1,i+1);show();});addEventListener("resize",show);show();<\/script></body></html>`;
  cbDownload(cbSafeName(ed.file.title) + ".html", html, "text/html");
}

/* ── toolbar + boot ─────────────────────────────────────────────────────── */
const TI = { slide: "M4 6h16v11H4zM12 17v3M8 20h8", text: CB_I.text, shape: CB_I.shape, image: CB_I.image, play: CB_I.play, undo: CB_I.undo, redo: CB_I.redo };
const tbtn = (icon, label, fn, id) => { const b = cbEl("button", { class: "tbtn", id, title: label, onmousedown: e => e.preventDefault(), onclick: e => fn(e) }); b.innerHTML = cbIcon(icon in CB_I ? icon : "plus").replace(/d="[^"]*"/, `d="${TI[icon] || CB_I[icon]}"`) + `<span>${cbEsc(label)}</span>`; return b; };
function buildToolbar() {
  const tb = $("#tb"); tb.innerHTML = "";
  if (ed.canEdit) {
    tb.append(
      tbtn("undo", "Undo", undo), tbtn("redo", "Redo", redo), cbEl("span", { class: "sep" }),
      tbtn("slide", "New slide", e => cbMenuAt(e.currentTarget, [["title", "Title slide"], ["content", "Title and content"], ["two", "Two columns"], ["section", "Section header"], ["quote", "Quote"], ["blank", "Blank"]].map(([k, l]) => ({ label: l, run: () => addSlide(k) })))),
      tbtn("text", "Text", addText),
      tbtn("shape", "Shape", e => cbMenuAt(e.currentTarget, [["rect", "Rectangle"], ["round", "Rounded rectangle"], ["ellipse", "Ellipse"], ["triangle", "Triangle"], ["arrow", "Arrow"], ["star", "Star"], ["line", "Line"]].map(([k, l]) => ({ label: l, run: () => addShape(k) })))),
      tbtn("image", "Image", addImage, "imgbtn"));
  }
  tb.append(cbEl("span", { class: "grow" }), tbtn("play", "Present", () => present(at)));
}
(async () => {
  ed = await cbBootEditor("slides", {
    emptyContent: () => { deck = { slides: [], theme: "Cinnabar" }; return { theme: "Cinnabar", slides: [layout("title")] }; },
    getContent: () => deck,
    setContent: (c, remote) => {
      if (editingEl && remote) return; // don't yank text out from under the cursor
      deck = c && Array.isArray(c.slides) && c.slides.length ? c : { theme: "Cinnabar", slides: [layout("title")] };
      deck.slides.forEach(s => { s.id ||= uid(); s.els ||= []; s.els.forEach(e => (e.id ||= uid())); });
      at = Math.min(at, deck.slides.length - 1);
      if (sel && !slide().els.some(e => e.id === sel)) sel = null;
      if (ed) renderAll();
    },
    menus: [
      { label: "File", items: () => [
        { label: "New presentation", icon: "plus", run: () => window.open("slides.html", "_blank") },
        { label: "Make a copy", icon: "copy", run: async () => { await ed.save(); const f = await cbFiles.copy(ed.file); location.href = cbFileURL(f); } },
        { label: "Share", icon: "share", run: () => cbShareDialog(ed.file) }, "-",
        { label: "Download as web slideshow (.html)", icon: "download", run: exportHTML },
        { label: "Print or save as PDF", icon: "print", run: printDeck }, "-",
        { label: "Open Drive", icon: "drive", run: () => (location.href = "index.html") },
      ] },
      { label: "Slide", items: () => (ed.canEdit ? slideMenu() : [{ label: "Present", icon: "play", key: "F5", run: () => present(at) }]) },
      { label: "Present", items: () => [{ label: "From the beginning", icon: "play", key: "F5", run: () => present(0) }, { label: "From this slide", icon: "play", key: "Shift+F5", run: () => present(at) }] },
    ],
  });
  buildToolbar();
  if (!ed.canEdit) $("#notes").readOnly = true;
  renderAll();
  new ResizeObserver(fitStage).observe($("#stagewrap"));
})();
