/* Cinnabar Docs — rich-text editor */
"use strict";
const paper = $("#paper");
const DI = {
  bold: "M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z", italic: "M14 5h-4M14 19h-4M13 5l-2 14", underline: "M7 4v7a5 5 0 0 0 10 0V4M5 20h14",
  strike: "M5 12h14M16 7a4 3 0 0 0-8 0c0 4 8 2 8 6a4 3 0 0 1-8 0", color: "M7 17L12 4l5 13M8.5 13h7", mark: "M9 15l6-10 4 2-6 10H9zM5 20h8",
  link: CB_I.link, image: CB_I.image, table: "M4 5h16v14H4zM4 10h16M4 15h16M10 5v14", hr: "M4 12h16", check: "M4 6h3v3H4zM10 7.5h10M4 14l1.5 1.5L8 13M10 15h10",
  left: "M4 6h16M4 10h10M4 14h16M4 18h10", center: "M4 6h16M7 10h10M4 14h16M7 18h10", right: "M4 6h16M10 10h10M4 14h16M10 18h10", justify: "M4 6h16M4 10h16M4 14h16M4 18h16",
  ul: "M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01", ol: "M10 6h10M10 12h10M10 18h10M4 5l1.5-1v5M3.5 14.5a1.3 1.3 0 0 1 2.4.6c0 1-2.4 2-2.4 2.9h2.6",
  indent: "M4 5h16M10 10h10M10 14h10M4 19h16M4 9l3 3-3 3", outdent: "M4 5h16M10 10h10M10 14h10M4 19h16M7 9l-3 3 3 3", clear: "M6 5h12M12 5l-3 14M15 15l5 5M20 15l-5 5",
  find: CB_I.search, undo: CB_I.undo, redo: CB_I.redo, print: CB_I.print,
};
const di = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${DI[n]}"/></svg>`;
const exec = (cmd, val = null) => { paper.focus(); document.execCommand(cmd, false, val); ed?.changed(); syncTb(); };
let ed, savedRange = null;
const saveSel = () => { const s = getSelection(); if (s.rangeCount && paper.contains(s.anchorNode)) savedRange = s.getRangeAt(0).cloneRange(); };
const restoreSel = () => { if (!savedRange) return; paper.focus(); const s = getSelection(); s.removeAllRanges(); s.addRange(savedRange); };

/* toolbar */
const tb = $("#tb");
const B = (icon, title, fn, id) => cbEl("button", { class: "tbtn", title, "aria-label": title, id, html: di(icon), onmousedown: e => e.preventDefault(), onclick: fn });
const sel = (cls, label, opts, fn) => { const s = cbEl("select", { class: cls, "aria-label": label, title: label, onmousedown: saveSel, onchange: () => { restoreSel(); fn(s.value); } }); opts.forEach(([v, t]) => s.append(cbEl("option", { value: v, text: t }))); return s; };
const colorBtn = (icon, title, cmd, def) => {
  const wrap = cbEl("span", { class: "tbtn color", title });
  wrap.innerHTML = di(icon);
  const bar = cbEl("span", { class: "bar", style: { background: def } });
  const inp = cbEl("input", { type: "color", value: def, "aria-label": title, onmousedown: saveSel, oninput: () => { bar.style.background = inp.value; restoreSel(); document.execCommand("styleWithCSS", false, true); exec(cmd, inp.value); } });
  wrap.append(bar, inp); return wrap;
};
const styleSel = sel("style", "Paragraph style", [["p", "Normal text"], ["h1", "Title"], ["h2", "Heading 1"], ["h3", "Heading 2"], ["blockquote", "Quote"], ["pre", "Code"]], v => exec("formatBlock", v));
const fontSel = sel("font", "Font", [["", "Font"], ["Noto Sans, Arial, sans-serif", "Sans"], ["Georgia, 'Noto Serif', serif", "Serif"], ["ui-monospace, monospace", "Mono"], ["'Canva Sans'", "Canva Sans"], ["Arial", "Arial"], ["'Times New Roman', serif", "Times"], ["Verdana", "Verdana"], ["'Comic Neue', 'Comic Sans MS', cursive", "Comic"]], v => v && exec("fontName", v));
const sizeSel = sel("size", "Font size", [["", "Size"], ...[9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64].map(n => [n, n])], v => {
  if (!v) return;
  document.execCommand("styleWithCSS", false, false);
  exec("fontSize", "7");
  paper.querySelectorAll('font[size="7"]').forEach(f => { const sp = cbEl("span", { style: { fontSize: Math.round(v * 4 / 3) + "px" } }); sp.append(...f.childNodes); f.replaceWith(sp); });
  ed?.changed(); sizeSel.value = "";
});
let zoom = parseFloat(localStorage.getItem("cb-doc-zoom") || "1");
const zoomSel = sel("zoom", "Zoom", [[".75", "75%"], [".9", "90%"], ["1", "100%"], ["1.25", "125%"], ["1.5", "150%"], ["2", "200%"]], v => { zoom = +v; localStorage.setItem("cb-doc-zoom", v); applyZoom(); });
const applyZoom = () => { paper.style.zoom = zoom; zoomSel.value = String(zoom).replace(/^0/, ""); $("#zoomlbl").textContent = Math.round(zoom * 100) + "%"; };

const fmt = {};
tb.append(
  B("undo", "Undo (Ctrl+Z)", () => exec("undo")), B("redo", "Redo (Ctrl+Y)", () => exec("redo")), B("print", "Print (Ctrl+P)", () => print()), zoomSel, cbEl("span", { class: "sep" }),
  styleSel, fontSel, sizeSel, cbEl("span", { class: "sep" }),
  fmt.bold = B("bold", "Bold (Ctrl+B)", () => exec("bold")), fmt.italic = B("italic", "Italic (Ctrl+I)", () => exec("italic")),
  fmt.underline = B("underline", "Underline (Ctrl+U)", () => exec("underline")), fmt.strikeThrough = B("strike", "Strikethrough", () => exec("strikeThrough")),
  colorBtn("color", "Text colour", "foreColor", "#1d1715"), colorBtn("mark", "Highlight", "hiliteColor", "#ffd76a"), cbEl("span", { class: "sep" }),
  B("link", "Insert link (Ctrl+K)", () => insertLink()), B("image", "Insert image", () => insertImage()), B("table", "Insert table", () => insertTable()),
  B("check", "Checklist", () => checklist()), B("hr", "Horizontal line", () => exec("insertHorizontalRule")), cbEl("span", { class: "sep" }),
  fmt.justifyLeft = B("left", "Align left", () => exec("justifyLeft")), fmt.justifyCenter = B("center", "Centre", () => exec("justifyCenter")),
  fmt.justifyRight = B("right", "Align right", () => exec("justifyRight")), fmt.justifyFull = B("justify", "Justify", () => exec("justifyFull")), cbEl("span", { class: "sep" }),
  fmt.insertUnorderedList = B("ul", "Bulleted list", () => exec("insertUnorderedList")), fmt.insertOrderedList = B("ol", "Numbered list", () => exec("insertOrderedList")),
  B("outdent", "Decrease indent", () => exec("outdent")), B("indent", "Increase indent", () => exec("indent")), B("clear", "Clear formatting", () => { exec("removeFormat"); exec("formatBlock", "p"); }),
  cbEl("span", { class: "sep" }), B("find", "Find and replace (Ctrl+H)", () => openFind(true)),
);
function syncTb() {
  for (const [cmd, btn] of Object.entries(fmt)) { let on = false; try { on = document.queryCommandState(cmd); } catch {} btn.classList.toggle("on", on); }
  const blk = (document.queryCommandValue("formatBlock") || "p").toLowerCase();
  styleSel.value = ["h1", "h2", "h3", "blockquote", "pre"].includes(blk) ? blk : "p";
}
document.addEventListener("selectionchange", () => { if (paper.contains(getSelection().anchorNode)) syncTb(); });

/* inserts */
async function insertLink() {
  saveSel();
  const cur = getSelection().anchorNode?.parentElement?.closest("a");
  const url = await cbPrompt(cur ? "Edit link" : "Insert link", cur?.getAttribute("href") || "https://", "Web address");
  if (!url) return;
  restoreSel();
  const safe = /^(https?:|mailto:)/i.test(url) ? url : "https://" + url;
  if (cur) cur.setAttribute("href", safe);
  else if (getSelection().isCollapsed) exec("insertHTML", `<a href="${cbEsc(safe)}">${cbEsc(url)}</a>`);
  else exec("createLink", safe);
  paper.querySelectorAll("a").forEach(a => { a.target = "_blank"; a.rel = "noopener noreferrer"; });
  ed.changed();
}
async function uploadAndInsert(file) {
  cbToast("Uploading image…", 20000);
  try { const url = await cbUpload(file); restoreSel(); exec("insertHTML", `<img src="${cbEsc(url)}" alt="" style="width:50%">`); cbToast("Image added"); }
  catch (e) { cbToast(e.message); }
}
async function insertImage() {
  saveSel();
  cbMenu(innerWidth / 2 - 100, 140, [
    { label: "Upload from computer", icon: "upload", run: async () => { const f = await cbPickFile(); if (f) uploadAndInsert(f); } },
    { label: "By URL", icon: "link", run: async () => { const u = await cbPrompt("Image address", "https://"); if (u && /^https:\/\//.test(u)) { restoreSel(); exec("insertHTML", `<img src="${cbEsc(u)}" alt="">`); } else if (u) cbToast("Use an https:// address"); } },
  ]);
}
async function insertTable() {
  saveSel();
  const v = await cbPrompt("Insert table", "3 x 3", "Columns x rows");
  const m = v && v.match(/(\d+)\s*[x×,* ]\s*(\d+)/i);
  if (!m) return;
  const c = Math.min(+m[1], 20), r = Math.min(+m[2], 100);
  restoreSel();
  exec("insertHTML", `<table><tbody>${`<tr>${"<td><br></td>".repeat(c)}</tr>`.repeat(r)}</tbody></table><p><br></p>`);
}
function checklist() {
  exec("insertUnorderedList");
  const li = getSelection().anchorNode?.parentElement?.closest("ul");
  if (li) { li.setAttribute("data-checklist", ""); li.querySelectorAll("li").forEach(x => x.dataset.checked ||= "false"); ed.changed(); }
}
paper.addEventListener("click", e => {
  const li = e.target.closest?.("ul[data-checklist] > li");
  if (li && ed.canEdit && e.offsetX < 24) { li.dataset.checked = li.dataset.checked === "true" ? "false" : "true"; ed.changed(); }
  const bar = $("#imgbar");
  paper.querySelectorAll("img.sel").forEach(i => i.classList.remove("sel"));
  if (e.target.tagName === "IMG" && ed.canEdit) {
    const img = e.target; img.classList.add("sel");
    const r = img.getBoundingClientRect();
    bar.hidden = false; bar.style.left = Math.max(8, r.left) + "px"; bar.style.top = Math.max(110, r.top - 44) + "px";
    bar.onclick = ev => { const w = ev.target.closest("button")?.dataset.w; if (!w) return; if (w === "remove") img.remove(); else img.style.width = w; bar.hidden = true; img.classList.remove("sel"); ed.changed(); };
  } else bar.hidden = true;
  if (e.target.closest?.("a") && (e.ctrlKey || !ed.canEdit)) window.open(e.target.closest("a").href, "_blank", "noopener");
});
$(".scroller").addEventListener("scroll", () => ($("#imgbar").hidden = true));

/* paste & drop: sanitised HTML, images uploaded */
paper.addEventListener("paste", e => {
  const files = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith("image/"));
  if (files.length) { e.preventDefault(); saveSel(); files.forEach(uploadAndInsert); return; }
  const html = e.clipboardData?.getData("text/html");
  if (html) { e.preventDefault(); exec("insertHTML", cbSanitize(html.replace(/<!--[\s\S]*?-->/g, ""))); }
});
paper.addEventListener("drop", e => {
  const files = [...(e.dataTransfer?.files || [])].filter(f => f.type.startsWith("image/"));
  if (!files.length) return;
  e.preventDefault();
  const r = document.caretRangeFromPoint?.(e.clientX, e.clientY);
  if (r) { getSelection().removeAllRanges(); getSelection().addRange(r); saveSel(); }
  files.forEach(uploadAndInsert);
});

/* keyboard */
paper.addEventListener("keydown", e => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); insertLink(); }
  else if (mod && e.altKey && /^[0-3]$/.test(e.key)) { e.preventDefault(); exec("formatBlock", ["p", "h1", "h2", "h3"][+e.key]); }
  else if (mod && e.shiftKey && (e.key === "&" || e.key === "7")) { e.preventDefault(); exec("insertOrderedList"); }
  else if (mod && e.shiftKey && (e.key === "*" || e.key === "8")) { e.preventDefault(); exec("insertUnorderedList"); }
  else if (e.key === "Tab" && !e.shiftKey && getSelection().anchorNode?.parentElement?.closest("li")) { e.preventDefault(); exec("indent"); }
  else if (e.key === "Tab" && e.shiftKey) { e.preventDefault(); exec("outdent"); }
  else if (e.key === "Tab") { e.preventDefault(); exec("insertText", " "); }
});
addEventListener("keydown", e => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === "f") { e.preventDefault(); openFind(false); }
  if (mod && e.key.toLowerCase() === "h") { e.preventDefault(); openFind(true); }
  if (e.key === "Escape" && !$("#find").hidden) { $("#find").hidden = true; paper.focus(); }
});

/* find & replace */
function textNodes() { const w = document.createTreeWalker(paper, NodeFilter.SHOW_TEXT); const out = []; while (w.nextNode()) out.push(w.currentNode); return out; }
function countMatches(q) { if (!q) return 0; const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"); return (paper.innerText.match(re) || []).length; }
function openFind(replace) {
  const f = $("#find"); f.hidden = false;
  $("#fr").hidden = $("#fone").hidden = $("#fall").hidden = !replace || !ed.canEdit;
  const s = getSelection().toString(); if (s && s.length < 80) $("#fq").value = s;
  $("#fq").focus(); $("#fq").select(); updCount();
}
const updCount = () => { const n = countMatches($("#fq").value); $("#fcount").textContent = $("#fq").value ? `${n} match${n === 1 ? "" : "es"}` : ""; };
$("#fq").addEventListener("input", updCount);
const findNext = () => { const q = $("#fq").value; if (!q) return; if (!window.find(q, false, false, true) || !paper.contains(getSelection().anchorNode)) { getSelection().removeAllRanges(); const r = document.createRange(); r.setStart(paper, 0); r.collapse(true); getSelection().addRange(r); window.find(q, false, false, true); } };
$("#fnext").onclick = findNext;
$("#fq").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); findNext(); } });
$("#fone").onclick = () => { const q = $("#fq").value; if (getSelection().toString().toLowerCase() === q.toLowerCase() && paper.contains(getSelection().anchorNode)) exec("insertText", $("#fr").value); findNext(); updCount(); };
$("#fall").onclick = () => {
  const q = $("#fq").value; if (!q) return;
  const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"); let n = 0;
  for (const t of textNodes()) { const v = t.nodeValue.replace(re, () => (n++, $("#fr").value)); if (v !== t.nodeValue) t.nodeValue = v; }
  if (n) ed.changed(); cbToast(`Replaced ${n} occurrence${n === 1 ? "" : "s"}`); updCount();
};
$("#fclose").innerHTML = cbIcon("close"); $("#fclose").onclick = () => { $("#find").hidden = true; paper.focus(); };

/* outline + word count */
let stTimer;
function refreshMeta() {
  clearTimeout(stTimer);
  stTimer = setTimeout(() => {
    const ol = $("#olist"); ol.innerHTML = "";
    const hs = paper.querySelectorAll("h1,h2,h3");
    if (!hs.length) ol.append(cbEl("div", { class: "none", text: "Headings you add appear here." }));
    hs.forEach(h => ol.append(cbEl("button", { class: h.tagName.toLowerCase(), text: h.textContent || "(empty heading)", onclick: () => h.scrollIntoView({ behavior: "smooth", block: "start" }) })));
    const txt = paper.innerText.trim();
    const words = txt ? txt.split(/\s+/).length : 0;
    $("#wc").textContent = `${words.toLocaleString()} word${words === 1 ? "" : "s"} · ${txt.length.toLocaleString()} characters`;
  }, 250);
}
paper.addEventListener("input", () => { ed.changed(); refreshMeta(); });

/* export */
function exportAs(type) {
  const title = ed.file.title, body = paper.innerHTML;
  const doc = `<!doctype html><html><head><meta charset="utf-8"><title>${cbEsc(title)}</title><style>body{font:15px/1.6 Arial,sans-serif;max-width:740px;margin:40px auto;color:#1d1715}img{max-width:100%}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:6px}blockquote{border-left:3px solid #e2361f;margin-left:0;padding-left:14px}</style></head><body>${body}</body></html>`;
  if (type === "html") cbDownload(cbSafeName(title) + ".html", doc, "text/html");
  if (type === "doc") cbDownload(cbSafeName(title) + ".doc", "﻿" + doc, "application/msword");
  if (type === "txt") cbDownload(cbSafeName(title) + ".txt", paper.innerText, "text/plain");
  if (type === "md") cbDownload(cbSafeName(title) + ".md", toMarkdown(paper), "text/markdown");
}
function toMarkdown(root) {
  const inl = n => [...n.childNodes].map(c => {
    if (c.nodeType === 3) return c.nodeValue.replace(/([*_`])/g, "\\$1");
    const t = c.tagName, s = inl(c);
    if (t === "B" || t === "STRONG") return s.trim() ? `**${s}**` : s;
    if (t === "I" || t === "EM") return s.trim() ? `*${s}*` : s;
    if (t === "S" || t === "STRIKE" || t === "DEL") return `~~${s}~~`;
    if (t === "CODE") return "`" + c.textContent + "`";
    if (t === "A") return `[${s}](${c.getAttribute("href") || ""})`;
    if (t === "IMG") return `![](${c.getAttribute("src")})`;
    if (t === "BR") return "  \n";
    return s;
  }).join("");
  const out = [];
  for (const b of root.children) {
    const t = b.tagName;
    if (/^H[1-3]$/.test(t)) out.push("#".repeat(+t[1]) + " " + inl(b));
    else if (t === "UL" || t === "OL") [...b.children].forEach((li, i) => out.push((t === "OL" ? `${i + 1}. ` : b.hasAttribute("data-checklist") ? `- [${li.dataset.checked === "true" ? "x" : " "}] ` : "- ") + inl(li)));
    else if (t === "BLOCKQUOTE") out.push("> " + inl(b));
    else if (t === "PRE") out.push("```\n" + b.textContent + "\n```");
    else if (t === "HR") out.push("---");
    else if (t === "TABLE") { const rows = [...b.querySelectorAll("tr")].map(r => "| " + [...r.children].map(c => inl(c).replace(/\|/g, "\\|").trim()).join(" | ") + " |"); if (rows.length) { rows.splice(1, 0, "|" + " --- |".repeat(b.rows[0].cells.length)); out.push(rows.join("\n")); } }
    else out.push(inl(b));
  }
  return out.join("\n\n") + "\n";
}

/* boot */
(async () => {
  applyZoom();
  ed = await cbBootEditor("doc", {
    emptyContent: () => ({ html: "<p><br></p>" }),
    getContent: () => ({ html: cbSanitize(paper.innerHTML) }),
    setContent: c => { paper.innerHTML = cbSanitize(c?.html || "<p><br></p>"); refreshMeta(); },
    onReadonly: () => { paper.contentEditable = "false"; tb.querySelectorAll("button,select,input").forEach(x => { if (!/Print|Zoom|Find/.test(x.title || "")) x.disabled = true; }); },
    menus: [
      { label: "File", items: () => [
        { label: "New document", icon: "plus", run: () => window.open("docs.html", "_blank") },
        { label: "Make a copy", icon: "copy", run: async () => { await ed.save(); const f = await cbFiles.copy(ed.file); location.href = cbFileURL(f); } },
        { label: "Share", icon: "share", run: () => cbShareDialog(ed.file) }, "-",
        { label: "Download as Word (.doc)", icon: "download", run: () => exportAs("doc") },
        { label: "Download as web page (.html)", icon: "download", run: () => exportAs("html") },
        { label: "Download as Markdown (.md)", icon: "download", run: () => exportAs("md") },
        { label: "Download as plain text (.txt)", icon: "download", run: () => exportAs("txt") },
        { label: "Print or save as PDF", icon: "print", key: "Ctrl+P", run: () => print() }, "-",
        { label: "Open Drive", icon: "drive", run: () => (location.href = "index.html") },
      ] },
      { label: "Edit", items: () => [
        { label: "Undo", icon: "undo", key: "Ctrl+Z", run: () => exec("undo") }, { label: "Redo", icon: "redo", key: "Ctrl+Y", run: () => exec("redo") }, "-",
        { label: "Select all", key: "Ctrl+A", run: () => { paper.focus(); exec("selectAll"); } },
        { label: "Find", icon: "search", key: "Ctrl+F", run: () => openFind(false) }, { label: "Find and replace", icon: "search", key: "Ctrl+H", run: () => openFind(true) },
      ] },
      { label: "Insert", items: () => [
        { label: "Image", icon: "image", run: insertImage }, { label: "Table", icon: "grid", run: insertTable }, { label: "Link", icon: "link", key: "Ctrl+K", run: insertLink },
        { label: "Checklist", icon: "check", run: checklist }, { label: "Horizontal line", run: () => exec("insertHorizontalRule") },
        { label: "Page break", run: () => exec("insertHTML", '<hr class="pb"><p><br></p>') },
        { label: "Today's date", icon: "clock", run: () => exec("insertText", new Date().toLocaleDateString([], { day: "numeric", month: "long", year: "numeric" })) },
      ] },
      { label: "Format", items: () => [
        { label: "Title", key: "Ctrl+Alt+1", run: () => exec("formatBlock", "h1") }, { label: "Heading 1", key: "Ctrl+Alt+2", run: () => exec("formatBlock", "h2") },
        { label: "Heading 2", key: "Ctrl+Alt+3", run: () => exec("formatBlock", "h3") }, { label: "Normal text", key: "Ctrl+Alt+0", run: () => exec("formatBlock", "p") }, "-",
        { label: "Clear formatting", run: () => { exec("removeFormat"); exec("formatBlock", "p"); } },
      ] },
    ],
  });
  document.execCommand("defaultParagraphSeparator", false, "p");
  if (ed.canEdit) { paper.focus(); const r = document.createRange(); r.selectNodeContents(paper); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r); }
})();
