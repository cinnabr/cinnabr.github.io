/* Cinnabar Sheets — spreadsheet editor */
"use strict";
const NCOLS = 26, DEF_ROWS = 200, DEF_W = 100;
let book = { sheets: [{ name: "Sheet1", cells: {}, colw: {} }], active: 0 };
let ed = null, sh = () => book.sheets[book.active];
let cur = { r: 0, c: 0 }, anc = { r: 0, c: 0 }, editing = null, tds = [], rendered = new Set();
const undoStack = [], redoStack = [];
const A = FX.addr;

/* ── evaluation ─────────────────────────────────────────────────────────── */
let cache = new Map(), stack = new Set();
function sheetIndex(name) { if (name == null) return null; const i = book.sheets.findIndex(s => s.name.toLowerCase() === name.toLowerCase()); return i; }
function value(si, r, c) {
  const key = si + ":" + r + ":" + c;
  if (cache.has(key)) return cache.get(key);
  const cell = book.sheets[si]?.cells[A(r, c)];
  if (!cell || cell.v == null || cell.v === "") return null;
  let v;
  if (String(cell.v)[0] === "=" && cell.v.length > 1) {
    if (stack.has(key)) return new CErr("#CYCLE!");
    stack.add(key);
    v = FX.evaluate(cell.v.slice(1), envFor(si));
    stack.delete(key);
  } else v = FX.literal(String(cell.v));
  cache.set(key, v);
  return v;
}
function envFor(si) {
  const pick = name => { if (name == null) return si; const i = sheetIndex(name); if (i < 0) throw new CErr("#REF!"); return i; };
  return {
    get: (sheet, r, c) => { const v = value(pick(sheet), r, c); if (v instanceof CErr) throw v; return v; },
    range: (sheet, r1, c1, r2, c2) => {
      const s = pick(sheet), out = [];
      r2 = Math.min(r2, Math.max(rowsOf(book.sheets[s]), r1) - 1 + 1000);
      for (let r = r1; r <= r2; r++) { const row = []; for (let c = c1; c <= c2; c++) row.push(value(s, r, c)); out.push(row); }
      return out;
    },
  };
}
const rowsOf = s => s.rows || DEF_ROWS;
const isDateFormula = v => /^=\s*(TODAY|NOW|DATE)\s*\(/i.test(v || "");

/* ── grid ───────────────────────────────────────────────────────────────── */
const grid = $("#grid"), wrap = $("#gridwrap"), editor = $("#editor"), fbar = $("#formula"), namebox = $("#namebox");
function buildGrid() {
  const s = sh(), rows = rowsOf(s);
  grid.innerHTML = "";
  const cg = cbEl("colgroup", {}, cbEl("col", { style: { width: "46px" } }));
  for (let c = 0; c < NCOLS; c++) cg.append(cbEl("col", { style: { width: (s.colw[FX.colName(c)] || DEF_W) + "px" } }));
  grid.append(cg);
  const head = cbEl("tr", {}, cbEl("th", { class: "corner rh" }));
  for (let c = 0; c < NCOLS; c++) {
    const th = cbEl("th", { "data-c": c, text: FX.colName(c) });
    th.append(cbEl("span", { class: "rs", "data-rs": c }));
    head.append(th);
  }
  grid.append(cbEl("thead", {}, head));
  const tb = cbEl("tbody");
  tds = [];
  const frag = document.createDocumentFragment();
  for (let r = 0; r < rows; r++) {
    const tr = document.createElement("tr");
    const th = document.createElement("th"); th.className = "rh"; th.dataset.r = r; th.textContent = r + 1; tr.append(th);
    const rowTds = [];
    for (let c = 0; c < NCOLS; c++) { const td = document.createElement("td"); td.dataset.r = r; td.dataset.c = c; tr.append(td); rowTds.push(td); }
    tds.push(rowTds); frag.append(tr);
  }
  tb.append(frag); grid.append(tb);
  rendered = new Set();
  recalc();
  renderTabs();
}
function recalc() {
  cache = new Map(); stack = new Set();
  const s = sh(), si = book.active, now = new Set();
  for (const key of Object.keys(s.cells)) {
    const p = FX.parseAddr(key); if (!p || p.r >= tds.length || p.c >= NCOLS) continue;
    now.add(key); paint(p.r, p.c, si);
  }
  for (const key of rendered) if (!now.has(key)) { const p = FX.parseAddr(key); const td = tds[p.r]?.[p.c]; if (td) { td.textContent = ""; td.className = ""; td.removeAttribute("style"); } }
  rendered = now;
  stats();
}
function paint(r, c, si = book.active) {
  const td = tds[r][c], cell = sh().cells[A(r, c)];
  if (!cell) { td.textContent = ""; td.className = ""; td.removeAttribute("style"); return; }
  const v = value(si, r, c), st = cell.s || {};
  const fmt = st.fmt || (typeof v === "number" && isDateFormula(cell.v) ? "date" : "");
  td.textContent = FX.format(v, fmt);
  td.className = v instanceof CErr ? "err" : typeof v === "number" ? "n" : typeof v === "boolean" ? "b" : "";
  if (v instanceof CErr) td.title = { "#DIV/0!": "Division by zero", "#NAME?": "Unknown function or name", "#REF!": "Reference doesn't exist", "#VALUE!": "Wrong type of value", "#CYCLE!": "Circular reference", "#N/A": "Value not found", "#NUM!": "Invalid number", "#ERROR!": "Formula can't be read" }[v.code] || v.code;
  else td.removeAttribute("title");
  td.style.cssText = "";
  if (st.b) td.style.fontWeight = "700";
  if (st.i) td.style.fontStyle = "italic";
  if (st.u || st.s) td.style.textDecoration = [st.u && "underline", st.s && "line-through"].filter(Boolean).join(" ");
  if (st.color) td.style.color = st.color;
  if (st.bg) td.style.background = st.bg;
  if (st.align) td.style.textAlign = st.align;
  if (st.size) td.style.fontSize = st.size + "px";
}

/* ── selection ──────────────────────────────────────────────────────────── */
const rng = () => ({ r1: Math.min(cur.r, anc.r), c1: Math.min(cur.c, anc.c), r2: Math.max(cur.r, anc.r), c2: Math.max(cur.c, anc.c) });
function rectOf(r1, c1, r2, c2) {
  const a = tds[r1][c1], b = tds[r2][c2];
  return { left: a.offsetLeft, top: a.offsetTop, width: b.offsetLeft + b.offsetWidth - a.offsetLeft, height: b.offsetTop + b.offsetHeight - a.offsetTop };
}
function drawSel(scroll = true) {
  const { r1, c1, r2, c2 } = rng();
  const box = $("#selbox"), cbx = $("#cur");
  const R = rectOf(r1, c1, r2, c2), C = rectOf(cur.r, cur.c, cur.r, cur.c);
  Object.assign(box.style, { display: r1 !== r2 || c1 !== c2 ? "block" : "none", left: R.left + "px", top: R.top + "px", width: R.width + "px", height: R.height + "px" });
  Object.assign(cbx.style, { left: C.left - 1 + "px", top: C.top - 1 + "px", width: C.width + 1 + "px", height: C.height + 1 + "px" });
  namebox.value = r1 === r2 && c1 === c2 ? A(cur.r, cur.c) : `${A(r1, c1)}:${A(r2, c2)}`;
  if (!editing) fbar.value = sh().cells[A(cur.r, cur.c)]?.v ?? "";
  grid.querySelectorAll("th.hl").forEach(t => t.classList.remove("hl"));
  for (let c = c1; c <= c2; c++) grid.tHead.rows[0].cells[c + 1].classList.add("hl");
  for (let r = r1; r <= Math.min(r2, r1 + 300); r++) grid.tBodies[0].rows[r].cells[0].classList.add("hl");
  if (scroll) {
    const td = tds[cur.r][cur.c], pad = 4;
    if (td.offsetTop - 26 < wrap.scrollTop) wrap.scrollTop = td.offsetTop - 26 - pad;
    else if (td.offsetTop + td.offsetHeight > wrap.scrollTop + wrap.clientHeight) wrap.scrollTop = td.offsetTop + td.offsetHeight - wrap.clientHeight + pad;
    if (td.offsetLeft - 46 < wrap.scrollLeft) wrap.scrollLeft = td.offsetLeft - 46 - pad;
    else if (td.offsetLeft + td.offsetWidth > wrap.scrollLeft + wrap.clientWidth) wrap.scrollLeft = td.offsetLeft + td.offsetWidth - wrap.clientWidth + pad;
  }
  syncTb(); stats();
}
function move(dr, dc, extend) {
  const rows = rowsOf(sh());
  cur = { r: Math.max(0, Math.min(rows - 1, cur.r + dr)), c: Math.max(0, Math.min(NCOLS - 1, cur.c + dc)) };
  if (!extend) anc = { ...cur };
  drawSel();
}
function stats() {
  const { r1, c1, r2, c2 } = rng();
  if (r1 === r2 && c1 === c2) { $("#stats").textContent = ""; return; }
  const ns = []; let count = 0;
  for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) { const v = value(book.active, r, c); if (v != null && v !== "") count++; if (typeof v === "number") ns.push(v); }
  const sum = ns.reduce((a, b) => a + b, 0);
  $("#stats").textContent = ns.length ? `Sum ${FX.format(sum)} · Average ${FX.format(+(sum / ns.length).toFixed(2))} · Count ${count}` : `Count ${count}`;
}

/* ── mutations (all go through here: undo + save) ───────────────────────── */
function snapshot() { undoStack.push(JSON.stringify(book)); if (undoStack.length > 100) undoStack.shift(); redoStack.length = 0; }
function commit() { recalc(); drawSel(false); ed?.changed(); }
function setCell(r, c, v, keepStyle = true) {
  const k = A(r, c), s = sh().cells, old = s[k];
  if ((v == null || v === "") && !(keepStyle && old?.s)) { delete s[k]; return; }
  s[k] = { ...(keepStyle && old?.s ? { s: old.s } : {}), v: v ?? "" };
}
function undo() { if (!undoStack.length) return; redoStack.push(JSON.stringify(book)); book = JSON.parse(undoStack.pop()); book.active = Math.min(book.active, book.sheets.length - 1); buildGrid(); drawSel(); ed?.changed(); }
function redo() { if (!redoStack.length) return; undoStack.push(JSON.stringify(book)); book = JSON.parse(redoStack.pop()); buildGrid(); drawSel(); ed?.changed(); }
function styleRange(patch) {
  if (!ed.canEdit) return;
  snapshot();
  const { r1, c1, r2, c2 } = rng(), cells = sh().cells;
  const first = cells[A(r1, c1)]?.s || {};
  const toggle = Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v === "toggle" ? (first[k] ? 0 : 1) : v]));
  for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) {
    const k = A(r, c), cell = cells[k] || { v: "" }, st = { ...(cell.s || {}), ...toggle };
    for (const key of Object.keys(st)) if (st[key] === 0 || st[key] === "" || st[key] == null) delete st[key];
    cell.s = st; if (!Object.keys(st).length) delete cell.s;
    if (cell.v === "" && !cell.s) delete cells[k]; else cells[k] = cell;
  }
  commit();
}
function clearRange() {
  if (!ed.canEdit) return;
  snapshot();
  const { r1, c1, r2, c2 } = rng();
  for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) setCell(r, c, "");
  commit();
}

/* ── editing ────────────────────────────────────────────────────────────── */
function startEdit(initial) {
  if (!ed.canEdit) return;
  const td = tds[cur.r][cur.c], R = rectOf(cur.r, cur.c, cur.r, cur.c);
  editing = { r: cur.r, c: cur.c };
  editor.hidden = false;
  Object.assign(editor.style, { left: R.left - 1 + "px", top: R.top - 1 + "px", minWidth: R.width + 2 + "px", width: Math.max(R.width + 2, 140) + "px" });
  editor.value = initial != null ? initial : sh().cells[A(cur.r, cur.c)]?.v ?? "";
  fbar.value = editor.value;
  editor.focus();
  editor.setSelectionRange(editor.value.length, editor.value.length);
  td.style.color = "transparent";
}
function endEdit(save, dr = 0, dc = 0) {
  if (!editing) return;
  const { r, c } = editing, v = editor.value;
  editing = null; editor.hidden = true; tds[r][c].style.color = "";
  if (save) {
    const old = sh().cells[A(r, c)]?.v ?? "";
    if (v !== old) { snapshot(); setCell(r, c, v.startsWith("=") ? v.replace(/^=\s*/, "=") : v); commit(); } else paint(r, c);
  } else paint(r, c);
  wrap.focus();
  move(dr, dc, false);
}
editor.addEventListener("input", () => { fbar.value = editor.value; editor.style.width = Math.max(parseInt(editor.style.minWidth), editor.value.length * 8 + 20) + "px"; });
editor.addEventListener("keydown", e => {
  if (e.key === "Enter") { e.preventDefault(); endEdit(true, e.shiftKey ? -1 : 1, 0); }
  else if (e.key === "Tab") { e.preventDefault(); endEdit(true, 0, e.shiftKey ? -1 : 1); }
  else if (e.key === "Escape") { e.preventDefault(); endEdit(false); }
  else if ((e.key === "ArrowUp" || e.key === "ArrowDown") && !editor.value.startsWith("=")) { e.preventDefault(); endEdit(true, e.key === "ArrowUp" ? -1 : 1, 0); }
});
editor.addEventListener("blur", () => setTimeout(() => { if (editing && document.activeElement !== editor && document.activeElement !== fbar) endEdit(true); }, 0));
fbar.addEventListener("focus", () => { if (!editing && ed.canEdit) { startEdit(); fbar.focus(); } });
fbar.addEventListener("input", () => { if (editing) editor.value = fbar.value; });
fbar.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); editor.value = fbar.value; endEdit(true, 1, 0); } if (e.key === "Escape") endEdit(false); });
namebox.addEventListener("keydown", e => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  const [a, b] = namebox.value.trim().toUpperCase().split(":").map(FX.parseAddr);
  if (a) { cur = { r: Math.min(a.r, rowsOf(sh()) - 1), c: Math.min(a.c, NCOLS - 1) }; anc = b ? { r: Math.min(b.r, rowsOf(sh()) - 1), c: Math.min(b.c, NCOLS - 1) } : { ...cur }; [cur, anc] = b ? [anc, cur] : [cur, anc]; wrap.focus(); drawSel(); }
});

/* ── mouse ──────────────────────────────────────────────────────────────── */
let dragging = false, resizing = null;
grid.addEventListener("mousedown", e => {
  const rs = e.target.dataset?.rs;
  if (rs != null) { e.preventDefault(); resizing = { c: +rs, x: e.clientX, w: sh().colw[FX.colName(+rs)] || DEF_W }; return; }
  const td = e.target.closest("td"), th = e.target.closest("th");
  if (e.button === 2) return;
  if (td) {
    const r = +td.dataset.r, c = +td.dataset.c;
    if (editing && editor.value.startsWith("=") && /[=(,+\-*/^&<>:]$/.test(editor.value)) { e.preventDefault(); editor.value += A(r, c); fbar.value = editor.value; editor.focus(); return; }
    if (editing) endEdit(true);
    e.preventDefault(); wrap.focus();
    cur = { r, c }; if (!e.shiftKey) anc = { r, c };
    dragging = true; drawSel(false);
  } else if (th && th.dataset.c != null) { if (editing) endEdit(true); e.preventDefault(); wrap.focus(); const c = +th.dataset.c; anc = { r: 0, c: e.shiftKey ? anc.c : c }; cur = { r: rowsOf(sh()) - 1, c }; drawSel(false); }
  else if (th && th.dataset.r != null) { if (editing) endEdit(true); e.preventDefault(); wrap.focus(); const r = +th.dataset.r; anc = { r: e.shiftKey ? anc.r : r, c: 0 }; cur = { r, c: NCOLS - 1 }; drawSel(false); }
  else if (th?.classList.contains("corner")) { anc = { r: 0, c: 0 }; cur = { r: rowsOf(sh()) - 1, c: NCOLS - 1 }; drawSel(false); }
});
addEventListener("mousemove", e => {
  if (resizing) { const w = Math.max(30, resizing.w + e.clientX - resizing.x); grid.querySelector("colgroup").children[resizing.c + 1].style.width = w + "px"; resizing.now = w; drawSel(false); return; }
  if (!dragging) return;
  const td = document.elementFromPoint(e.clientX, e.clientY)?.closest?.("td");
  if (td && grid.contains(td)) { cur = { r: +td.dataset.r, c: +td.dataset.c }; drawSel(false); }
});
addEventListener("mouseup", () => {
  if (resizing?.now && ed.canEdit) { snapshot(); sh().colw[FX.colName(resizing.c)] = resizing.now; ed.changed(); }
  resizing = null; dragging = false;
});
grid.addEventListener("dblclick", e => { if (e.target.closest("td")) startEdit(); });
grid.addEventListener("contextmenu", e => {
  const td = e.target.closest("td"), th = e.target.closest("th");
  if (!td && !th) return;
  e.preventDefault();
  if (td) { const r = +td.dataset.r, c = +td.dataset.c; const { r1, c1, r2, c2 } = rng(); if (r < r1 || r > r2 || c < c1 || c > c2) { cur = anc = { r, c }; drawSel(false); } }
  if (!ed.canEdit) return cbMenu(e.clientX, e.clientY, [{ label: "Copy", icon: "copy", key: "Ctrl+C", run: () => document.execCommand("copy") }]);
  cbMenu(e.clientX, e.clientY, [
    { label: "Cut", key: "Ctrl+X", run: () => document.execCommand("cut") }, { label: "Copy", icon: "copy", key: "Ctrl+C", run: () => document.execCommand("copy") },
    { label: "Paste", key: "Ctrl+V", run: () => cbToast("Use Ctrl+V to paste") }, "-",
    { label: "Insert row above", run: () => insertRows(rng().r1, 1) }, { label: "Insert row below", run: () => insertRows(rng().r2 + 1, 1) },
    { label: "Insert column left", run: () => insertCols(rng().c1, 1) }, { label: "Insert column right", run: () => insertCols(rng().c2 + 1, 1) }, "-",
    { label: "Delete row(s)", danger: true, run: () => { const { r1, r2 } = rng(); insertRows(r1, -(r2 - r1 + 1)); } },
    { label: "Delete column(s)", danger: true, run: () => { const { c1, c2 } = rng(); insertCols(c1, -(c2 - c1 + 1)); } }, "-",
    { label: "Sort A → Z by this column", run: () => sortRange(1) }, { label: "Sort Z → A by this column", run: () => sortRange(-1) },
    { label: "Clear contents", icon: "trash", key: "Del", run: clearRange },
  ]);
});

/* ── keyboard ───────────────────────────────────────────────────────────── */
wrap.addEventListener("keydown", e => {
  if (editing || e.target !== wrap) return;
  const mod = e.ctrlKey || e.metaKey, k = e.key;
  const jump = (dr, dc) => { // Ctrl+arrow: to the edge of the data block
    let { r, c } = cur; const rows = rowsOf(sh()), has = (r, c) => sh().cells[A(r, c)]?.v;
    const step = () => { r += dr; c += dc; return r >= 0 && c >= 0 && r < rows && c < NCOLS; };
    if (has(r, c) && has(r + dr, c + dc)) { while (step() && has(r, c)); r -= dr; c -= dc; }
    else { while (step() && !has(r, c)); if (r < 0 || c < 0 || r >= rows || c >= NCOLS) { r = Math.max(0, Math.min(rows - 1, r)); c = Math.max(0, Math.min(NCOLS - 1, c)); } }
    move(r - cur.r, c - cur.c, e.shiftKey);
  };
  const arrows = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
  if (arrows[k]) { e.preventDefault(); mod ? jump(...arrows[k]) : move(...arrows[k], e.shiftKey); return; }
  if (k === "Enter") { e.preventDefault(); if (e.shiftKey) move(-1, 0); else startEdit(); return; }
  if (k === "Tab") { e.preventDefault(); move(0, e.shiftKey ? -1 : 1); return; }
  if (k === "PageDown" || k === "PageUp") { e.preventDefault(); move((k === "PageDown" ? 1 : -1) * Math.floor(wrap.clientHeight / 25), 0, e.shiftKey); return; }
  if (k === "Home") { e.preventDefault(); mod ? move(-cur.r, -cur.c, e.shiftKey) : move(0, -cur.c, e.shiftKey); return; }
  if (k === "F2") { e.preventDefault(); startEdit(); return; }
  if (k === "Delete" || k === "Backspace") { e.preventDefault(); clearRange(); return; }
  if (mod && k.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && k.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
  if (mod && k.toLowerCase() === "a") { e.preventDefault(); anc = { r: 0, c: 0 }; cur = { r: rowsOf(sh()) - 1, c: NCOLS - 1 }; drawSel(false); return; }
  if (mod && k.toLowerCase() === "b") { e.preventDefault(); styleRange({ b: "toggle" }); return; }
  if (mod && k.toLowerCase() === "i") { e.preventDefault(); styleRange({ i: "toggle" }); return; }
  if (mod && k.toLowerCase() === "u") { e.preventDefault(); styleRange({ u: "toggle" }); return; }
  if (mod && k.toLowerCase() === "d") { e.preventDefault(); fill(true); return; }
  if (mod && k.toLowerCase() === "r") { e.preventDefault(); fill(false); return; }
  if (!mod && !e.altKey && k.length === 1) { e.preventDefault(); startEdit(k); }
});

/* ── clipboard: TSV out; internal copies keep formulas (shifted like any spreadsheet) ── */
let clip = null;
function rangeTSV() { const { r1, c1, r2, c2 } = rng(), lines = []; for (let r = r1; r <= r2; r++) { const row = []; for (let c = c1; c <= c2; c++) row.push(FX.format(value(book.active, r, c), sh().cells[A(r, c)]?.s?.fmt)); lines.push(row.join("\t")); } return lines.join("\n"); }
document.addEventListener("copy", e => {
  if (editing || document.activeElement !== wrap) return;
  e.preventDefault();
  const { r1, c1, r2, c2 } = rng(), tsv = rangeTSV();
  clip = { r1, c1, tsv, cells: [] };
  for (let r = r1; r <= r2; r++) { const row = []; for (let c = c1; c <= c2; c++) row.push(structuredClone(sh().cells[A(r, c)] || null)); clip.cells.push(row); }
  e.clipboardData.setData("text/plain", tsv);
});
document.addEventListener("cut", e => { if (editing || document.activeElement !== wrap) return; document.dispatchEvent(new ClipboardEvent("copy", { clipboardData: e.clipboardData })); e.preventDefault(); e.clipboardData.setData("text/plain", rangeTSV()); clip && (clip.cut = true); clearRange(); });
document.addEventListener("paste", e => {
  if (editing || document.activeElement !== wrap || !ed.canEdit) return;
  e.preventDefault();
  const text = e.clipboardData.getData("text/plain");
  snapshot();
  const { r1, c1 } = rng();
  if (clip && clip.tsv === text) {
    clip.cells.forEach((row, i) => row.forEach((cell, j) => {
      const r = r1 + i, c = c1 + j; if (r >= rowsOf(sh()) || c >= NCOLS) return;
      if (!cell) { delete sh().cells[A(r, c)]; return; }
      const v = String(cell.v).startsWith("=") && !clip.cut ? FX.shift(cell.v, r - (clip.r1 + i), c - (clip.c1 + j)) : cell.v;
      sh().cells[A(r, c)] = { ...structuredClone(cell), v };
    }));
  } else {
    text.replace(/\r/g, "").replace(/\n$/, "").split("\n").forEach((line, i) => line.split("\t").forEach((v, j) => { if (r1 + i < rowsOf(sh()) && c1 + j < NCOLS) setCell(r1 + i, c1 + j, v); }));
  }
  commit();
});
function fill(down) {
  if (!ed.canEdit) return;
  const { r1, c1, r2, c2 } = rng(); snapshot();
  for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) {
    const sr = down ? r1 : r, sc = down ? c : c1; if (sr === r && sc === c) continue;
    const src = sh().cells[A(sr, sc)];
    if (!src) { delete sh().cells[A(r, c)]; continue; }
    sh().cells[A(r, c)] = { ...structuredClone(src), v: String(src.v).startsWith("=") ? FX.shift(src.v, r - sr, c - sc) : src.v };
  }
  commit();
}

/* ── structure: insert/delete rows & columns (formulas re-pointed), sort ─── */
function remap(fnCell, fnRef) {
  for (const s of book.sheets) {
    const own = s === sh(), next = {};
    for (const [k, cell] of Object.entries(s.cells)) {
      const p = FX.parseAddr(k);
      const to = own ? fnCell(p.r, p.c) : [p.r, p.c];
      if (!to) continue;
      if (String(cell.v).startsWith("=")) cell.v = FX.mapRefs(cell.v, (r, c, ar, ac, sheetName) => ((sheetName == null ? own : sheetIndex(sheetName) === book.active) ? fnRef(r, c) : [r, c]));
      next[A(to[0], to[1])] = cell;
    }
    s.cells = next;
  }
}
function insertRows(at, n) {
  if (!ed.canEdit) return;
  snapshot();
  const f = (r, c) => (n > 0 ? [r >= at ? r + n : r, c] : r >= at && r < at - n ? null : [r >= at - n ? r + n : r, c]);
  remap(f, f);
  sh().rows = Math.max(DEF_ROWS, rowsOf(sh()) + Math.max(0, n));
  buildGrid(); move(0, 0); ed.changed();
}
function insertCols(at, n) {
  if (!ed.canEdit) return;
  snapshot();
  const f = (r, c) => (n > 0 ? (c + n >= NCOLS && c >= at ? null : [r, c >= at ? c + n : c]) : c >= at && c < at - n ? null : [r, c >= at - n ? c + n : c]);
  remap(f, f);
  const w = {}; for (const [k, v] of Object.entries(sh().colw)) { const c = FX.colIndex(k), m = f(0, c); if (m) w[FX.colName(m[1])] = v; } sh().colw = w;
  buildGrid(); move(0, 0); ed.changed();
}
function sortRange(dir) {
  if (!ed.canEdit) return;
  let { r1, c1, r2, c2 } = rng();
  if (r1 === r2) { r1 = 0; r2 = rowsOf(sh()) - 1; c1 = 0; c2 = NCOLS - 1; }
  const hasHeader = r1 === 0 && typeof value(book.active, 0, cur.c) === "string" && typeof value(book.active, 1, cur.c) === "number";
  if (hasHeader) r1 = 1;
  snapshot();
  const rows = [];
  for (let r = r1; r <= r2; r++) { const cells = []; for (let c = c1; c <= c2; c++) cells.push(sh().cells[A(r, c)] || null); rows.push({ key: value(book.active, r, cur.c), cells }); }
  const filled = rows.filter(x => x.cells.some(Boolean)), empty = rows.length - filled.length;
  filled.sort((a, b) => { const x = a.key, y = b.key; if (x == null) return 1; if (y == null) return -1; if (typeof x === "number" && typeof y === "number") return (x - y) * dir; return String(x).localeCompare(String(y), undefined, { numeric: true }) * dir; });
  [...filled, ...Array(empty).fill({ cells: Array(c2 - c1 + 1).fill(null) })].forEach((row, i) => row.cells.forEach((cell, j) => { const k = A(r1 + i, c1 + j); if (cell) sh().cells[k] = cell; else delete sh().cells[k]; }));
  commit(); cbToast(`Sorted ${dir > 0 ? "A → Z" : "Z → A"} by column ${FX.colName(cur.c)}`);
}

/* ── sheet tabs ─────────────────────────────────────────────────────────── */
function renderTabs() {
  const t = $("#tabs"); t.innerHTML = "";
  book.sheets.forEach((s, i) => {
    const b = cbEl("button", { role: "tab", class: i === book.active ? "on" : "", "aria-selected": String(i === book.active), text: s.name });
    b.onclick = () => { if (editing) endEdit(true); book.active = i; cur = anc = { r: 0, c: 0 }; buildGrid(); drawSel(); };
    b.ondblclick = () => renameSheet(i);
    b.oncontextmenu = e => { e.preventDefault(); if (!ed.canEdit) return; cbMenu(e.clientX, e.clientY, [
      { label: "Rename", icon: "edit", run: () => renameSheet(i) },
      { label: "Duplicate", icon: "copy", run: () => { snapshot(); const c = structuredClone(s); c.name = uniqueName(s.name + " copy"); book.sheets.splice(i + 1, 0, c); book.active = i + 1; buildGrid(); drawSel(); ed.changed(); } },
      book.sheets.length > 1 && { label: "Delete", icon: "trash", danger: true, run: async () => { if (!(await cbConfirm("Delete sheet?", `“${s.name}” and everything on it will be deleted.`, "Delete"))) return; snapshot(); book.sheets.splice(i, 1); book.active = Math.max(0, Math.min(book.active, book.sheets.length - 1)); buildGrid(); drawSel(); ed.changed(); } },
    ].filter(Boolean)); };
    t.append(b);
  });
}
const uniqueName = base => { let n = base, k = 2; while (book.sheets.some(s => s.name.toLowerCase() === n.toLowerCase())) n = `${base} ${k++}`; return n; };
async function renameSheet(i) {
  if (!ed.canEdit) return;
  const v = await cbPrompt("Rename sheet", book.sheets[i].name);
  if (!v || v === book.sheets[i].name) return;
  if (book.sheets.some((s, j) => j !== i && s.name.toLowerCase() === v.toLowerCase())) return cbToast("A sheet with that name already exists");
  snapshot(); book.sheets[i].name = v; renderTabs(); ed.changed();
}
$("#addsheet").innerHTML = cbIcon("plus");
$("#addsheet").onclick = () => { if (!ed.canEdit) return; snapshot(); book.sheets.push({ name: uniqueName("Sheet" + (book.sheets.length + 1)), cells: {}, colw: {} }); book.active = book.sheets.length - 1; cur = anc = { r: 0, c: 0 }; buildGrid(); drawSel(); ed.changed(); };

/* ── toolbar ────────────────────────────────────────────────────────────── */
const SI = {
  bold: "M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z", italic: "M14 5h-4M14 19h-4M13 5l-2 14", underline: "M7 4v7a5 5 0 0 0 10 0V4M5 20h14",
  strike: "M5 12h14M16 7a4 3 0 0 0-8 0c0 4 8 2 8 6a4 3 0 0 1-8 0", left: "M4 6h16M4 10h10M4 14h16M4 18h10", center: "M4 6h16M7 10h10M4 14h16M7 18h10", right: "M4 6h16M10 10h10M4 14h16M10 18h10",
  color: "M7 17L12 4l5 13M8.5 13h7", fill: "M5 11l7-7 7 7-7 7zM19 15s2 2.4 2 3.5a2 2 0 0 1-4 0c0-1.1 2-3.5 2-3.5", sigma: "M17 5H7l6 7-6 7h10", sortA: "M7 4v16M4 17l3 3 3-3M14 6h6M14 12h4M14 18h2",
  sortZ: "M7 4v16M4 17l3 3 3-3M14 6h2M14 12h4M14 18h6", chart: "M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3", undo: CB_I.undo, redo: CB_I.redo,
};
const si = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${SI[n]}"/></svg>`;
const tb = $("#tb"), fmtB = {};
const TB = (icon, title, fn) => cbEl("button", { class: "tbtn", title, "aria-label": title, html: si(icon), onmousedown: e => e.preventDefault(), onclick: () => { fn(); wrap.focus(); } });
const color = (icon, title, prop, def) => {
  const w = cbEl("span", { class: "tbtn color", title }); w.innerHTML = si(icon);
  const bar = cbEl("span", { class: "bar", style: { background: def } });
  const inp = cbEl("input", { type: "color", value: def, "aria-label": title, onchange: () => { bar.style.background = inp.value; styleRange({ [prop]: inp.value }); } });
  w.append(bar, inp); return w;
};
const fmtSel = cbEl("select", { class: "fmt", title: "Number format", "aria-label": "Number format", onchange: () => { styleRange({ fmt: fmtSel.value }); } });
[["", "Automatic"], ["num", "Number 1,000.12"], ["int", "Whole 1,000"], ["cur", "Currency $"], ["pct", "Percent %"], ["date", "Date"], ["text", "Plain text"]].forEach(([v, t]) => fmtSel.append(cbEl("option", { value: v, text: t })));
tb.append(
  TB("undo", "Undo (Ctrl+Z)", undo), TB("redo", "Redo (Ctrl+Y)", redo), cbEl("span", { class: "sep" }), fmtSel, cbEl("span", { class: "sep" }),
  fmtB.b = TB("bold", "Bold (Ctrl+B)", () => styleRange({ b: "toggle" })), fmtB.i = TB("italic", "Italic (Ctrl+I)", () => styleRange({ i: "toggle" })),
  fmtB.u = TB("underline", "Underline (Ctrl+U)", () => styleRange({ u: "toggle" })), fmtB.s = TB("strike", "Strikethrough", () => styleRange({ s: "toggle" })),
  color("color", "Text colour", "color", "#efe6e2"), color("fill", "Fill colour", "bg", "#3a1a12"), cbEl("span", { class: "sep" }),
  fmtB.left = TB("left", "Align left", () => styleRange({ align: "left" })), fmtB.center = TB("center", "Align centre", () => styleRange({ align: "center" })), fmtB.right = TB("right", "Align right", () => styleRange({ align: "right" })),
  cbEl("span", { class: "sep" }), TB("sigma", "Sum of the selection (AutoSum)", autoSum), TB("sortA", "Sort A → Z", () => sortRange(1)), TB("sortZ", "Sort Z → A", () => sortRange(-1)), TB("chart", "Chart from selection", chart),
);
function syncTb() {
  const st = sh().cells[A(cur.r, cur.c)]?.s || {};
  for (const k of ["b", "i", "u", "s"]) fmtB[k].classList.toggle("on", !!st[k]);
  for (const k of ["left", "center", "right"]) fmtB[k].classList.toggle("on", st.align === k);
  fmtSel.value = st.fmt || "";
}
function autoSum() {
  if (!ed.canEdit) return;
  const { r1, c1, r2, c2 } = rng();
  snapshot();
  if (r1 === r2 && c1 === c2) { // single cell: sum the numbers directly above
    let r = cur.r - 1; while (r >= 0 && typeof value(book.active, r, cur.c) === "number") r--;
    if (r === cur.r - 1) { undoStack.pop(); return cbToast("No numbers above this cell to sum"); }
    setCell(cur.r, cur.c, `=SUM(${A(r + 1, cur.c)}:${A(cur.r - 1, cur.c)})`);
  } else for (let c = c1; c <= c2; c++) if (r2 + 1 < rowsOf(sh())) setCell(r2 + 1, c, `=SUM(${A(r1, c)}:${A(r2, c)})`);
  commit();
}

/* chart: bar or line chart (SVG) from the selection; first column = labels if it's text */
function chart() {
  const { r1, c1, r2, c2 } = rng();
  if (r1 === r2 && c1 === c2) return cbToast("Select a range with numbers first");
  let rows = []; for (let r = r1; r <= r2; r++) { const row = []; for (let c = c1; c <= c2; c++) row.push(value(book.active, r, c)); rows.push(row); }
  let header = null; if (rows[0].some(v => typeof v === "string") && rows.length > 1 && rows.slice(1).some(r => r.some(v => typeof v === "number"))) header = rows.shift();
  const labelCol = rows.every(r => typeof r[0] !== "number") && rows[0].length > 1;
  const labels = rows.map((r, i) => (labelCol ? FX.format(r[0]) : String(i + 1)));
  const series = []; for (let j = labelCol ? 1 : 0; j < rows[0].length; j++) series.push({ name: header ? FX.format(header[j]) : FX.colName(c1 + j), vals: rows.map(r => (typeof r[j] === "number" ? r[j] : 0)) });
  if (!series.length || series.every(s => s.vals.every(v => v === 0))) return cbToast("No numbers in the selection");
  const colors = ["#ff6a2a", "#e2361f", "#f4a83a", "#ffd2bd", "#b9aaa5", "#8e1407"];
  const draw = type => {
    const W = 640, H = 340, L = 54, B = 46, T = 20, R = 16, all = series.flatMap(s => s.vals), max = Math.max(0, ...all), min = Math.min(0, ...all), span = max - min || 1;
    const y = v => T + (H - T - B) * (1 - (v - min) / span), x0 = L, w = W - L - R, step = w / labels.length;
    let g = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="Canva Sans, sans-serif" font-size="11">`;
    for (let k = 0; k <= 4; k++) { const v = min + span * k / 4, yy = y(v); g += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="#2a201d"/><text x="${L - 8}" y="${yy + 4}" fill="#a09390" text-anchor="end">${cbEsc(FX.format(+v.toPrecision(3)))}</text>`; }
    labels.forEach((l, i) => { g += `<text x="${x0 + step * (i + .5)}" y="${H - B + 18}" fill="#a09390" text-anchor="middle">${cbEsc(l.slice(0, 12))}</text>`; });
    series.forEach((s, si) => {
      if (type === "bar") { const bw = step * 0.7 / series.length; s.vals.forEach((v, i) => { const xx = x0 + step * i + step * .15 + bw * si, y1 = y(Math.max(v, 0)), y2 = y(Math.min(v, 0)); g += `<rect x="${xx}" y="${y1}" width="${bw - 2}" height="${Math.max(1, y2 - y1)}" rx="2" fill="${colors[si % 6]}"><title>${cbEsc(s.name)} · ${cbEsc(labels[i])}: ${cbEsc(FX.format(v))}</title></rect>`; }); }
      else { g += `<polyline fill="none" stroke="${colors[si % 6]}" stroke-width="2.5" points="${s.vals.map((v, i) => `${x0 + step * (i + .5)},${y(v)}`).join(" ")}"/>`; s.vals.forEach((v, i) => { g += `<circle cx="${x0 + step * (i + .5)}" cy="${y(v)}" r="3.5" fill="${colors[si % 6]}"><title>${cbEsc(s.name)} · ${cbEsc(labels[i])}: ${cbEsc(FX.format(v))}</title></circle>`; }); }
    });
    series.forEach((s, si) => { g += `<rect x="${L + si * 120}" y="${H - 16}" width="10" height="10" rx="2" fill="${colors[si % 6]}"/><text x="${L + si * 120 + 15}" y="${H - 7}" fill="#efe6e2">${cbEsc(s.name.slice(0, 14))}</text>`; });
    return g + "</svg>";
  };
  const box = cbEl("div", { class: "chart" }), view = cbEl("div");
  let type = "bar";
  const seg = cbEl("div", { class: "seg" }, ...["bar", "line"].map(t => cbEl("button", { class: "btn", text: t === "bar" ? "Bar" : "Line", onclick: () => { type = t; view.innerHTML = draw(type); } })));
  view.innerHTML = draw(type);
  box.append(seg, view);
  const d = cbDialog("Chart", box, [
    { label: "Download SVG", value: () => { cbDownload(cbSafeName(ed.file.title) + "-chart.svg", draw(type), "image/svg+xml"); return undefined; } },
    { label: "Close", cls: "primary", result: true },
  ]);
  $$(".dialog").at(-1).style.width = "min(720px, calc(100vw - 32px))";
  return d;
}

/* ── CSV ────────────────────────────────────────────────────────────────── */
function toCSV() {
  const s = sh(); let maxR = -1, maxC = -1;
  for (const k of Object.keys(s.cells)) { const p = FX.parseAddr(k); if (s.cells[k].v !== "") { maxR = Math.max(maxR, p.r); maxC = Math.max(maxC, p.c); } }
  const lines = [];
  for (let r = 0; r <= maxR; r++) { const row = []; for (let c = 0; c <= maxC; c++) { const v = FX.format(value(book.active, r, c), s.cells[A(r, c)]?.s?.fmt === "text" ? "text" : ""); row.push(/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v); } lines.push(row.join(",")); }
  return lines.join("\n") + "\n";
}
function parseCSV(text) {
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
    else if (ch === '"') q = true; else if (ch === ",") { row.push(f); f = ""; } else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; } else f += ch;
  }
  if (f !== "" || row.length) { row.push(f); rows.push(row); }
  return rows;
}
async function importCSV() {
  const file = await cbPickFile(".csv,.tsv,text/csv,text/plain");
  if (!file) return;
  const text = await file.text(), tsv = /\.tsv$/i.test(file.name);
  const rows = tsv ? text.replace(/\r/g, "").split("\n").filter((l, i, a) => l || i < a.length - 1).map(l => l.split("\t")) : parseCSV(text);
  snapshot();
  const s = { name: uniqueName(file.name.replace(/\.[^.]+$/, "").slice(0, 30) || "Import"), cells: {}, colw: {}, rows: Math.max(DEF_ROWS, rows.length + 20) };
  rows.forEach((row, r) => row.slice(0, NCOLS).forEach((v, c) => { if (v !== "") s.cells[A(r, c)] = { v: v.startsWith("=") ? "'" + v : v }; }));
  book.sheets.push(s); book.active = book.sheets.length - 1; cur = anc = { r: 0, c: 0 };
  buildGrid(); drawSel(); ed.changed();
  cbToast(`Imported ${rows.length} rows into “${s.name}”${rows[0]?.length > NCOLS ? ` (first ${NCOLS} columns)` : ""}`);
}

/* ── boot ───────────────────────────────────────────────────────────────── */
(async () => {
  ed = await cbBootEditor("sheet", {
    emptyContent: () => ({ sheets: [{ name: "Sheet1", cells: {}, colw: {} }], active: 0 }),
    getContent: () => book,
    setContent: (c, remote) => {
      const b = c && Array.isArray(c.sheets) && c.sheets.length ? c : { sheets: [{ name: "Sheet1", cells: {}, colw: {} }], active: 0 };
      b.sheets.forEach(s => { s.cells ||= {}; s.colw ||= {}; });
      const keep = remote ? Math.min(book.active, b.sheets.length - 1) : Math.min(b.active || 0, b.sheets.length - 1);
      book = b; book.active = keep;
      if (editing && remote) { editing = null; editor.hidden = true; }
      buildGrid(); drawSel(false);
    },
    onReadonly: () => { tb.querySelectorAll("button,select,input").forEach(x => (x.disabled = !/Chart/.test(x.title || ""))); fbar.readOnly = true; },
    menus: [
      { label: "File", items: () => [
        { label: "New spreadsheet", icon: "plus", run: () => window.open("sheets.html", "_blank") },
        { label: "Make a copy", icon: "copy", run: async () => { await ed.save(); const f = await cbFiles.copy(ed.file); location.href = cbFileURL(f); } },
        { label: "Share", icon: "share", run: () => cbShareDialog(ed.file) }, "-",
        ed.canEdit && { label: "Import CSV / TSV…", icon: "upload", run: importCSV },
        { label: "Download sheet as CSV", icon: "download", run: () => cbDownload(cbSafeName(ed.file.title + " - " + sh().name) + ".csv", toCSV(), "text/csv") },
        { label: "Print", icon: "print", key: "Ctrl+P", run: () => print() }, "-",
        { label: "Open Drive", icon: "drive", run: () => (location.href = "index.html") },
      ].filter(Boolean) },
      { label: "Edit", items: () => [
        { label: "Undo", icon: "undo", key: "Ctrl+Z", run: undo }, { label: "Redo", icon: "redo", key: "Ctrl+Y", run: redo }, "-",
        { label: "Fill down", key: "Ctrl+D", run: () => fill(true) }, { label: "Fill right", key: "Ctrl+R", run: () => fill(false) },
        { label: "Clear contents", icon: "trash", key: "Del", run: clearRange },
      ] },
      { label: "Insert", items: () => [
        { label: "Row above", run: () => insertRows(rng().r1, 1) }, { label: "Row below", run: () => insertRows(rng().r2 + 1, 1) },
        { label: "Column left", run: () => insertCols(rng().c1, 1) }, { label: "Column right", run: () => insertCols(rng().c2 + 1, 1) },
        { label: "100 more rows", run: () => { snapshot(); sh().rows = rowsOf(sh()) + 100; buildGrid(); drawSel(false); ed.changed(); } }, "-",
        { label: "Sheet", icon: "plus", run: () => $("#addsheet").click() }, { label: "Chart", icon: "grid", run: chart },
      ] },
      { label: "Help", items: () => [{ label: `${FX.functions.length} functions: ${FX.functions.slice(0, 12).join(", ")}…`, run: () => cbDialog("Functions", cbEl("p", { class: "muted", style: { lineHeight: "1.8" }, text: FX.functions.join(", ") }), [{ label: "Close", cls: "primary", result: true }]) }] },
    ],
  });
  wrap.focus();
  addEventListener("resize", () => drawSel(false));
})();
