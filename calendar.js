/* Cinnabar Calendar: personal events, class events (teachers add them, members see them) and assignment due dates. */
"use strict";
let UI, cursor = new Date(), teach = [], classesById = {};
const q = async p => { const { data, error } = await p; if (error) throw new Error(error.message); return data; };
const dayKey = d => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

async function render() {
  const v = UI.view = hubView(UI.view);
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));   // weeks start on Monday
  const end = new Date(start); end.setDate(start.getDate() + 42);
  let events = [];
  try { events = await q(sb.from("cal_events").select("*").gte("starts_at", start.toISOString()).lt("starts_at", end.toISOString()).order("starts_at")); }
  catch (e) { hubErr(/cal_events|relation|schema cache/.test(e.message) ? new Error("Calendar isn't set up on this Cinnabar server yet (db/classroom.sql).") : e); }
  const byDay = {};
  for (const e of events) (byDay[dayKey(new Date(e.starts_at))] ||= []).push(e);
  const head = cbEl("div", { class: "cal-head" },
    cbEl("button", { class: "icon-btn", title: "Previous month", html: cbIcon("left"), onclick: () => { cursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1); render(); } }),
    cbEl("button", { class: "icon-btn", title: "Next month", html: cbIcon("right"), onclick: () => { cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1); render(); } }),
    cbEl("h2", { text: first.toLocaleString([], { month: "long", year: "numeric" }) }),
    cbEl("button", { class: "btn", text: "Today", onclick: () => { cursor = new Date(); render(); } }));
  v.append(head);
  const grid = cbEl("div", { class: "cal" });
  ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].forEach(d => grid.append(cbEl("div", { class: "dow", text: d })));
  const today = dayKey(new Date());
  for (let i = 0; i < 42; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const cell = cbEl("div", { class: `day ${d.getMonth() !== first.getMonth() ? "out" : ""} ${dayKey(d) === today ? "today" : ""}`, onclick: e => { if (e.target === cell || e.target.classList.contains("n")) edit(null, d); } }, cbEl("span", { class: "n", text: d.getDate() }));
    for (const e of byDay[dayKey(d)] || []) {
      const due = (e.notes || "").startsWith("classroom:");
      const col = e.color || classesById[e.class_id]?.color || "#e2361f";
      const time = new Date(e.starts_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      cell.append(cbEl("div", { class: "ev" + (due ? " due" : ""), style: due ? {} : { background: col }, title: `${e.title} · ${time}`, text: `${time} ${e.title}`, onclick: ev => { ev.stopPropagation(); due ? location.href = "classroom.html#a=" + e.notes.slice(10) : edit(e); } }));
    }
    grid.append(cell);
  }
  v.append(grid);
  const upcoming = events.filter(e => new Date(e.starts_at) >= new Date()).slice(0, 6);
  if (upcoming.length) {
    v.append(cbEl("div", { class: "cap", text: "Coming up", style: { padding: "20px 2px 8px" } }));
    v.append(cbEl("div", { class: "tiles anim", style: { gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" } }, ...upcoming.map(e => cbEl("button", { class: "post click", style: { textAlign: "left" }, onclick: () => edit(e) },
      cbEl("div", { class: "head" }, hubGlyph("calendar", e.color || classesById[e.class_id]?.color || "#e2361f"), cbEl("div", { class: "who" }, cbEl("b", { text: e.title }), cbEl("span", { text: hubWhen(e.starts_at) + (e.location ? " · " + e.location : "") })))))));
  }
}
async function edit(e, day) {
  const own = !e || e.owner === CB_USER.id;
  if (!own) return cbDialog(e.title, cbEl("div", {}, cbEl("p", { text: hubWhen(e.starts_at) + (e.ends_at ? " – " + hubWhen(e.ends_at) : "") }), e.location ? cbEl("p", { class: "muted", text: e.location }) : null, e.notes ? cbEl("p", { text: e.notes }) : null, cbEl("p", { class: "muted", text: "From " + (classesById[e.class_id]?.name || "a class") })), [{ label: "Close", cls: "primary", result: true }]);
  let start = e?.starts_at;
  if (!start) { const d = new Date(day); d.setHours(9, 0, 0, 0); start = d.toISOString(); }
  const f = await hubForm(e ? "Edit event" : "New event", [
    { key: "title", label: "Title", value: e?.title, required: true },
    { key: "starts_at", label: "Starts", type: "datetime-local", value: hubLocal(start), required: true },
    { key: "ends_at", label: "Ends", type: "datetime-local", value: hubLocal(e?.ends_at || new Date(new Date(start).getTime() + 36e5).toISOString()) },
    { key: "location", label: "Where", value: e?.location },
    { key: "class_id", label: "Calendar", type: "select", value: e?.class_id || "", options: [["", "Just me"], ...teach.map(c => [c.id, "Class: " + c.name])] },
    { key: "color", label: "Colour", type: "select", value: e?.color || "", options: [["", "Default"], ...HUB_COLORS.map(c => [c, c])] },
    { key: "notes", label: "Notes", type: "textarea", rows: 3, value: e?.notes },
  ], e ? "Save" : "Add", e ? [{ label: "Delete", cls: "danger", result: "delete" }] : []);
  if (f === "delete") { try { await q(sb.from("cal_events").delete().eq("id", e.id)); render(); } catch (ex) { hubErr(ex); } return; }
  if (!f) return;
  f.starts_at = hubISO(f.starts_at); f.ends_at = hubISO(f.ends_at);
  if (f.ends_at && f.ends_at < f.starts_at) return cbToast("The event ends before it starts.");
  try { await q(e ? sb.from("cal_events").update(f).eq("id", e.id) : sb.from("cal_events").insert(f)); render(); } catch (ex) { hubErr(ex); }
}

(async () => {
  UI = await hubBoot("Calendar");
  UI.actions.append(cbEl("button", { class: "btn primary", text: "New event", onclick: () => edit(null, new Date()) }));
  UI.title.textContent = "Calendar";
  try {
    const mem = await q(sb.from("cr_members").select("class_id,role").eq("user_id", CB_USER.id));
    const cs = mem.length ? await q(sb.from("cr_classes").select("id,name,color").in("id", mem.map(m => m.class_id))) : [];
    classesById = Object.fromEntries(cs.map(c => [c.id, c]));
    teach = cs.filter(c => mem.find(m => m.class_id === c.id).role === "teacher");
  } catch (e) { /* calendar still works for personal events */ }
  render();
})();
