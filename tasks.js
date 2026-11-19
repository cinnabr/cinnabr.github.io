/* Cinnabar Tasks: lists of to-dos with due dates, stars, notes and subtasks (db/suite.sql tk_*). */
"use strict";
let UI, lists = [], tasks = [];
const q = async p => { const { data, error } = await p; if (error) throw new Error(error.message); return data; };
const cur = () => new URLSearchParams(location.hash.slice(1)).get("l") || "all";
const today = () => new Date().toLocaleDateString("en-CA");
function dueText(d) {
  if (!d) return null;
  const diff = Math.round((new Date(d + "T00:00") - new Date(today() + "T00:00")) / 864e5);
  return { text: diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : diff === -1 ? "Yesterday" : new Date(d + "T00:00").toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }), late: diff < 0 };
}

async function load() {
  lists = await q(sb.from("tk_lists").select("*").order("created_at"));
  if (!lists.length) lists = [await q(sb.from("tk_lists").insert({ title: "My Tasks" }).select().single())];
  tasks = await q(sb.from("tk_tasks").select("*").order("position"));
}
async function render() {
  try { await load(); } catch (e) { return hubErr(e); }
  const c = cur();
  const v = UI.view = hubView(UI.view);
  const side = cbEl("div", { class: "ml-side" },
    cbEl("button", { class: "btn primary ml-compose", html: cbIcon("plus") + "<span>Create task</span>", onclick: () => document.querySelector(".tk-add input")?.focus() }),
    ...[["all", "All tasks", "task"], ["starred", "Starred", "star"]].map(([k, n, i]) => cbEl("button", { class: "ml-f" + (c === k ? " on" : ""), onclick: () => { location.hash = "l=" + k; } }, cbIconEl(i), cbEl("span", { text: n }), cbEl("b", { text: tasks.filter(t => !t.done && !t.parent && (k === "all" || t.starred)).length || "" }))),
    cbEl("div", { class: "cap", text: "Lists" }),
    ...lists.map(l => cbEl("button", { class: "ml-f" + (c === l.id ? " on" : ""), onclick: () => { location.hash = "l=" + l.id; } }, cbEl("i", { class: "ml-dot", style: { background: cbColorFor(l.id) } }), cbEl("span", { text: l.title }), cbEl("b", { text: tasks.filter(t => t.list_id === l.id && !t.done && !t.parent).length || "" }))),
    cbEl("button", { class: "ml-f muted", onclick: newList }, cbIconEl("plus"), cbEl("span", { text: "Create new list" })));
  const main = cbEl("div", { class: "tk-main" });
  const show = c === "all" ? lists : c === "starred" ? [{ id: "starred", title: "Starred" }] : lists.filter(l => l.id === c);
  UI.title.textContent = c === "all" ? "Tasks" : show[0]?.title || "Tasks";
  for (const l of show) main.append(column(l));
  v.append(cbEl("div", { class: "ml-wrap" }, side, cbEl("div", { class: "tk-cols" }, main)));
}
async function newList() {
  const t = await cbPrompt("New list", "", "Name");
  if (t) { try { const l = await q(sb.from("tk_lists").insert({ title: t }).select().single()); location.hash = "l=" + l.id; } catch (e) { hubErr(e); } }
}
function column(l) {
  const star = l.id === "starred";
  const mine = tasks.filter(t => !t.parent && (star ? t.starred : t.list_id === l.id));
  const open = mine.filter(t => !t.done).sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999") || a.position - b.position), done = mine.filter(t => t.done);
  const col = cbEl("section", { class: "tk-col" }, cbEl("div", { class: "tk-head" }, cbEl("b", { text: l.title }), cbEl("div", { class: "grow" }),
    star ? null : cbEl("button", { class: "icon-btn", html: cbIcon("more"), onclick: e => cbMenuAt(e.currentTarget, [
      { label: "Rename list", icon: "edit", run: async () => { const t = await cbPrompt("Rename list", l.title); if (t) q(sb.from("tk_lists").update({ title: t }).eq("id", l.id)).then(render, hubErr); } },
      done.length ? { label: "Delete all completed tasks", icon: "check", run: () => q(sb.from("tk_tasks").delete().eq("list_id", l.id).eq("done", true)).then(render, hubErr) } : null,
      lists.length > 1 ? { label: "Delete list", icon: "trash", danger: true, run: async () => { if (await cbConfirm("Delete " + l.title + "?", "All its tasks are deleted too.", "Delete", true)) q(sb.from("tk_lists").delete().eq("id", l.id)).then(() => { location.hash = ""; render(); }, hubErr); } } : null]) })));
  if (!star) {
    const inp = cbEl("input", { class: "field", placeholder: "Add a task", onkeydown: async e => { if (e.key === "Enter" && inp.value.trim()) { const title = inp.value.trim(); inp.value = ""; await q(sb.from("tk_tasks").insert({ list_id: l.id, title })).catch(hubErr); await render(); document.querySelector(".tk-add input")?.focus(); } } });
    col.append(cbEl("div", { class: "tk-add" }, cbIconEl("plus"), inp));
  }
  for (const t of open) col.append(row(t));
  if (!open.length) col.append(cbEl("div", { class: "tk-none" }, cbEl("div", { class: "ring", html: cbIcon("check") }), cbEl("b", { text: "All tasks complete" }), cbEl("span", { class: "muted", text: "Nice work!" })));
  if (done.length) {
    const d = cbEl("details", { class: "tk-done" }, cbEl("summary", { text: `Completed (${done.length})` }));
    for (const t of done) d.append(row(t));
    col.append(d);
  }
  return col;
}
function row(t) {
  const subs = tasks.filter(s => s.parent === t.id).sort((a, b) => a.position - b.position);
  const due = dueText(t.due);
  const el = cbEl("div", { class: "tk-task" + (t.done ? " done" : "") },
    cbEl("button", { class: "tk-check", title: t.done ? "Mark not done" : "Mark complete", html: cbIcon("check"), onclick: () => q(sb.from("tk_tasks").update({ done: !t.done, done_at: t.done ? null : new Date().toISOString() }).eq("id", t.id)).then(() => { if (!t.done) cbToast("1 task completed"); render(); }, hubErr) }),
    cbEl("div", { class: "grow", onclick: () => edit(t) }, cbEl("div", { class: "tk-title", text: t.title }), t.notes ? cbEl("div", { class: "muted small", text: t.notes.slice(0, 120) }) : null,
      due ? cbEl("span", { class: "chip" + (due.late && !t.done ? " red" : ""), text: due.text }) : null),
    cbEl("button", { class: "icon-btn tk-star" + (t.starred ? " on" : ""), title: "Star", html: cbIcon("star"), onclick: () => q(sb.from("tk_tasks").update({ starred: !t.starred }).eq("id", t.id)).then(render, hubErr) }));
  if (!subs.length) return el;
  return cbEl("div", {}, el, cbEl("div", { class: "tk-subs" }, ...subs.map(row)));
}
async function edit(t) {
  const f = await hubForm("Task", [
    { key: "title", label: "Title", value: t.title, required: true }, { key: "notes", label: "Details", type: "textarea", rows: 4, value: t.notes },
    { key: "due", label: "Date", type: "date", value: t.due }, { key: "list_id", label: "List", type: "select", value: t.list_id, options: lists.map(l => [l.id, l.title]) },
    ...(t.parent ? [] : [{ key: "sub", label: "Add a subtask", placeholder: "Subtask title" }]),
  ], "Save", [{ label: "Delete", result: "delete" }]);
  if (f === "delete") return q(sb.from("tk_tasks").delete().eq("id", t.id)).then(() => { cbToast("Task deleted"); render(); }, hubErr);
  if (!f) return;
  try {
    await q(sb.from("tk_tasks").update({ title: f.title, notes: f.notes || "", due: f.due, list_id: f.list_id }).eq("id", t.id));
    if (f.list_id !== t.list_id) await q(sb.from("tk_tasks").update({ list_id: f.list_id }).eq("parent", t.id));
    if (f.sub) await q(sb.from("tk_tasks").insert({ list_id: f.list_id, parent: t.id, title: f.sub }));
  } catch (e) { hubErr(e); }
  render();
}

(async () => {
  UI = await hubBoot("Tasks");
  addEventListener("hashchange", render);
  render();
})();
