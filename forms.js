/* Cinnabar Forms: build surveys and auto-graded quizzes, share a link, see results as charts. */
"use strict";
let UI;
const q = async p => { const { data, error } = await p; if (error) throw new Error(error.message); return data; };
const route = () => Object.fromEntries(new URLSearchParams(location.hash.slice(1)));
const go = h => { location.hash = new URLSearchParams(h).toString(); };
const KINDS = { choice: ["Multiple choice", "check"], checks: ["Checkboxes", "task"], short: ["Short answer", "text"], long: ["Paragraph", "edit"], scale: ["Scale 1–5", "star"] };
const uid = () => Math.random().toString(36).slice(2, 9);
const link = id => new URL("forms.html#f=" + id, location.href).href;

async function render() {
  const r = route(); UI.actions.innerHTML = "";
  try {
    if (r.edit) return await renderEditor(r.edit, r.tab || "questions");
    if (r.f) return await renderAnswer(r.f);
    return await renderHome();
  } catch (e) { hubErr(/fm_|schema cache/.test(e.message) ? new Error("Forms aren't set up on this Cinnabar server yet (db/forms.sql).") : e); }
}

async function renderHome() {
  UI.title.textContent = "Forms";
  const v = UI.view = hubView(UI.view);
  UI.actions.append(cbEl("button", { class: "btn", text: "New quiz", onclick: () => create(true) }), cbEl("button", { class: "btn primary", text: "New form", onclick: () => create(false) }));
  const forms = await q(sb.from("fm_forms").select("id,title,quiz,accepting,color,updated_at,questions").eq("owner", CB_USER.id).order("updated_at", { ascending: false }));
  const tiles = cbEl("div", { class: "tiles" });
  tiles.append(cbEl("button", { class: "tile add", onclick: () => create(false), html: cbIcon("plus") + "<span>Blank form</span>" }));
  tiles.append(cbEl("button", { class: "tile add", onclick: () => create(true), html: cbIcon("check") + "<span>Blank quiz</span>" }));
  for (const f of forms) tiles.append(cbEl("button", { class: "tile", onclick: () => go({ edit: f.id }) },
    cbEl("div", { class: "ban", style: { background: `linear-gradient(135deg, ${f.color}, ${f.color}aa)` } }, cbEl("b", { text: f.title }), cbEl("span", { text: (f.quiz ? "Quiz" : "Form") + ` · ${f.questions.length} question${f.questions.length === 1 ? "" : "s"}` })),
    cbEl("div", { class: "body" }, cbEl("span", { text: "Edited " + cbAgo(f.updated_at) }), f.accepting ? null : cbEl("span", { class: "chip", text: "Closed", style: { alignSelf: "flex-start" } }))));
  v.append(tiles);
}
async function create(quiz) {
  try {
    const f = await q(sb.from("fm_forms").insert({ title: quiz ? "Untitled quiz" : "Untitled form", quiz, color: quiz ? "#7a4fd1" : "#e2361f", questions: [{ id: uid(), kind: "choice", text: "Question", options: ["Option 1"], required: false, points: 1 }] }).select("id").single());
    go({ edit: f.id });
  } catch (e) { hubErr(e); }
}

/* ── editor ── */
async function renderEditor(id, tab) {
  const f = await q(sb.from("fm_forms").select("*").eq("id", id).single());
  UI.title.innerHTML = "";
  UI.title.append(cbEl("span", { class: "crumb", text: "Forms", onclick: () => go({}) }), cbEl("span", { class: "muted", text: "›" }), cbEl("span", { text: f.title }));
  let saveT, dirty = false;
  const status = cbEl("span", { class: "muted", style: { fontSize: "12px" }, text: "Saved" });
  const save = (now) => { dirty = true; status.textContent = "Saving…"; clearTimeout(saveT); saveT = setTimeout(async () => {
    try { await q(sb.from("fm_forms").update({ title: f.title, description: f.description, questions: f.questions, quiz: f.quiz, accepting: f.accepting, show_score: f.show_score, one_response: f.one_response, class_id: f.class_id, color: f.color }).eq("id", f.id)); dirty = false; status.textContent = "Saved"; }
    catch (e) { status.textContent = "Not saved"; hubErr(e); } }, now ? 0 : 600); };
  addEventListener("beforeunload", e => { if (dirty) e.preventDefault(); });
  UI.actions.append(status,
    cbEl("button", { class: "btn", onclick: () => go({ f: f.id }) }, cbIconEl("open"), cbEl("span", { text: "Preview" })),
    cbEl("button", { class: "btn primary", onclick: async () => { await navigator.clipboard.writeText(link(f.id)).catch(() => 0); cbToast("Link copied. Anyone signed in to Cinnabar can answer" + (f.class_id ? " (in that class)." : ".")); } }, cbIconEl("link"), cbEl("span", { text: "Copy link" })));
  const v = UI.view = hubView(UI.view);
  const tabs = cbEl("div", { class: "tabs" });
  for (const [k, n] of [["questions", "Questions"], ["responses", "Responses"], ["settings", "Settings"]]) tabs.append(cbEl("button", { class: k === tab ? "on" : "", text: n, onclick: () => go({ edit: f.id, tab: k }) }));
  v.append(tabs);
  const body = cbEl("div", { class: "stack anim", style: { maxWidth: "780px", margin: "0 auto" } }); v.append(body);
  if (tab === "responses") return responses(f, body);
  if (tab === "settings") return settings(f, body, save);
  // title card
  const title = cbEl("input", { class: "field", value: f.title, style: { fontSize: "24px", height: "48px", fontWeight: 700, border: 0, background: "transparent", padding: 0 } });
  title.oninput = () => { f.title = title.value || "Untitled"; save(); };
  const desc = cbEl("textarea", { class: "field", rows: 2, placeholder: "Description", style: { minHeight: "50px" } }); desc.value = f.description;
  desc.oninput = () => { f.description = desc.value; save(); };
  body.append(cbEl("div", { class: "post", style: { borderTop: `8px solid ${f.color}` } }, title, desc));
  const list = cbEl("div", { class: "stack" }); body.append(list);
  const draw = () => { list.innerHTML = ""; f.questions.forEach((x, i) => list.append(qCard(f, x, i, save, draw))); };
  draw();
  const add = cbEl("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "center", padding: "6px 0 30px" } });
  for (const [k, [n, ic]] of Object.entries(KINDS)) add.append(cbEl("button", { class: "btn", onclick: () => { f.questions.push({ id: uid(), kind: k, text: "", options: k === "choice" || k === "checks" ? ["Option 1", "Option 2"] : [], required: false, points: 1 }); save(); draw(); list.lastChild?.scrollIntoView({ behavior: "smooth", block: "center" }); list.lastChild?.querySelector("input")?.focus(); } }, cbIconEl(ic), cbEl("span", { text: n })));
  body.append(add);
}
function qCard(f, x, i, save, draw) {
  const card = cbEl("div", { class: "post" });
  const text = cbEl("input", { class: "field", value: x.text, placeholder: "Question", style: { flex: 1 } }); text.oninput = () => { x.text = text.value; save(); };
  const kind = cbEl("select", { class: "field", style: { width: "170px" } }); for (const [k, [n]] of Object.entries(KINDS)) kind.append(cbEl("option", { value: k, text: n })); kind.value = x.kind;
  kind.onchange = () => { x.kind = kind.value; if ((x.kind === "choice" || x.kind === "checks") && !x.options?.length) x.options = ["Option 1"]; delete x.answer; save(); draw(); };
  card.append(cbEl("div", { style: { display: "flex", gap: "8px" } }, text, kind));
  if (x.kind === "choice" || x.kind === "checks") {
    const opts = cbEl("div", { class: "stack", style: { gap: "6px", marginTop: "10px" } });
    x.options.forEach((o, j) => {
      const correct = f.quiz && (x.kind === "choice" ? x.answer === o : (x.answer || []).includes(o));
      const mark = cbEl("button", { class: "icon-btn" + (correct ? " on" : ""), title: f.quiz ? "Mark as a correct answer" : "", html: cbIcon(x.kind === "choice" ? "check" : "task"), disabled: !f.quiz,
        onclick: () => { if (x.kind === "choice") x.answer = x.answer === o ? undefined : o; else { const s = new Set(x.answer || []); s.has(o) ? s.delete(o) : s.add(o); x.answer = [...s]; } save(); draw(); } });
      const inp = cbEl("input", { class: "field", value: o, style: { height: "32px" } });
      inp.onchange = () => { const old = x.options[j]; x.options[j] = inp.value || `Option ${j + 1}`; if (x.answer === old) x.answer = x.options[j]; if (Array.isArray(x.answer)) x.answer = x.answer.map(a => a === old ? x.options[j] : a); save(); };
      opts.append(cbEl("div", { style: { display: "flex", gap: "6px", alignItems: "center" } }, mark, inp, cbEl("button", { class: "icon-btn", title: "Remove option", html: cbIcon("close"), onclick: () => { x.options.splice(j, 1); save(); draw(); } })));
    });
    opts.append(cbEl("button", { class: "btn ghost", style: { alignSelf: "flex-start" }, text: "Add option", onclick: () => { x.options.push(`Option ${x.options.length + 1}`); save(); draw(); } }));
    card.append(opts);
  } else if (f.quiz && x.kind === "short") {
    const ans = cbEl("input", { class: "field", value: x.answer || "", placeholder: "Correct answer (separate alternatives with |)", style: { marginTop: "10px" } });
    ans.oninput = () => { x.answer = ans.value.trim() || undefined; save(); }; card.append(ans);
  } else if (f.quiz && x.kind === "scale") {
    const ans = cbEl("select", { class: "field", style: { marginTop: "10px", width: "200px" } }, cbEl("option", { value: "", text: "No correct answer" }), ...[1, 2, 3, 4, 5].map(n => cbEl("option", { value: n, text: "Correct: " + n })));
    ans.value = x.answer || ""; ans.onchange = () => { x.answer = ans.value || undefined; save(); }; card.append(ans);
  }
  const req = cbEl("label", { style: { display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" } }, cbEl("input", { type: "checkbox", checked: !!x.required, onchange: e => { x.required = e.target.checked; save(); } }), cbEl("span", { text: "Required" }));
  const pts = f.quiz ? cbEl("label", { style: { display: "flex", alignItems: "center", gap: "6px" } }, cbEl("span", { class: "muted", text: "Points" }), cbEl("input", { class: "field", type: "number", min: 0, value: x.points ?? 1, style: { width: "70px", height: "30px" }, oninput: e => { x.points = Number(e.target.value) || 0; save(); } })) : null;
  const move = d => { const k = i + d; if (k < 0 || k >= f.questions.length) return; [f.questions[i], f.questions[k]] = [f.questions[k], f.questions[i]]; save(); draw(); };
  card.append(cbEl("div", { class: "meta", style: { justifyContent: "flex-end", borderTop: "1px solid var(--line)", paddingTop: "8px" } }, pts, req,
    cbEl("button", { class: "icon-btn", title: "Move up", html: cbIcon("up"), onclick: () => move(-1) }),
    cbEl("button", { class: "icon-btn", title: "Duplicate", html: cbIcon("copy"), onclick: () => { f.questions.splice(i + 1, 0, { ...structuredClone(x), id: uid() }); save(); draw(); } }),
    cbEl("button", { class: "icon-btn", title: "Delete question", html: cbIcon("trash"), onclick: () => { f.questions.splice(i, 1); save(); draw(); } })));
  return card;
}
async function settings(f, body, save) {
  const mem = await q(sb.from("cr_members").select("class_id").eq("user_id", CB_USER.id).eq("role", "teacher")).catch(() => []);
  const cs = mem.length ? await q(sb.from("cr_classes").select("id,name").in("id", mem.map(m => m.class_id))).catch(() => []) : [];
  const toggle = (key, label, sub) => cbEl("label", { class: "post", style: { display: "flex", gap: "12px", alignItems: "center", cursor: "pointer" } },
    cbEl("input", { type: "checkbox", checked: !!f[key], style: { width: "20px", height: "20px" }, onchange: e => { f[key] = e.target.checked; save(true); } }), cbEl("div", {}, cbEl("b", { text: label }), cbEl("div", { class: "muted", text: sub })));
  body.append(toggle("quiz", "Make this a quiz", "Mark correct answers and give points. Scores are worked out on the server."), toggle("accepting", "Accepting responses", "Turn off to close the form."),
    toggle("show_score", "Show people their score", "Right after they submit."), toggle("one_response", "One response per person", "People must be signed in to Cinnabar."));
  const who = cbEl("select", { class: "field" }, cbEl("option", { value: "", text: "Anyone signed in to Cinnabar with the link" }), ...cs.map(c => cbEl("option", { value: c.id, text: "Only " + c.name })));
  who.value = f.class_id || ""; who.onchange = () => { f.class_id = who.value || null; save(true); };
  const col = cbEl("select", { class: "field" }, ...HUB_COLORS.map(c => cbEl("option", { value: c, text: c }))); col.value = f.color; col.onchange = () => { f.color = col.value; save(true); };
  body.append(cbEl("div", { class: "post" }, cbEl("label", { class: "lbl", text: "Who can answer" }), who, cbEl("label", { class: "lbl", text: "Colour" }), col));
  if (cs.length) body.append(cbEl("button", { class: "btn", style: { alignSelf: "flex-start" }, text: "Post to a class as an assignment", onclick: async () => {
    const c = cs.find(x => x.id === (f.class_id || cs[0].id));
    try { await q(sb.from("cr_posts").insert({ class_id: c.id, kind: "assignment", title: f.title, body: "Answer the form: " + link(f.id), link: link(f.id), points: null })); cbToast("Posted to " + c.name); } catch (e) { hubErr(e); }
  } }));
  body.append(cbEl("button", { class: "btn danger", style: { alignSelf: "flex-start" }, text: "Delete form", onclick: async () => {
    if (await cbConfirm("Delete “" + f.title + "”?", "Every response is deleted too. This can't be undone.", "Delete")) { await q(sb.from("fm_forms").delete().eq("id", f.id)).catch(hubErr); go({}); } } }));
}
async function responses(f, body) {
  const rows = await q(sb.rpc("fm_results", { p_form: f.id }));
  await hubPeople(rows.map(r => r.respondent));
  if (!rows.length) return body.append(hubEmpty("forum", "No responses yet", "Copy the link and send it to people.", cbEl("button", { class: "btn primary", text: "Copy link", onclick: async () => { await navigator.clipboard.writeText(link(f.id)).catch(() => 0); cbToast("Link copied"); } })));
  const scored = rows.filter(r => r.max_score);
  const avg = scored.length ? Math.round(scored.reduce((a, r) => a + r.score / r.max_score, 0) / scored.length * 100) : null;
  body.append(cbEl("div", { class: "tiles", style: { gridTemplateColumns: "repeat(3, 1fr)" } },
    ...[[rows.length, "Responses"], [avg != null ? avg + "%" : "—", "Average score"], [f.accepting ? "Open" : "Closed", "Status"]].map(([n, l]) => cbEl("div", { class: "side-card", style: { textAlign: "center" } }, cbEl("div", { text: n, style: { font: "700 30px var(--display)" } }), cbEl("div", { class: "muted", text: l })))));
  for (const x of f.questions) {
    const card = cbEl("div", { class: "post" }, cbEl("b", { text: x.text || "Question" }));
    const vals = rows.map(r => r.answers[x.id]).filter(a => a != null && a !== "" && !(Array.isArray(a) && !a.length));
    card.append(cbEl("div", { class: "muted", style: { fontSize: "12px", margin: "2px 0 10px" }, text: `${vals.length} answer${vals.length === 1 ? "" : "s"}` }));
    if (x.kind === "choice" || x.kind === "checks" || x.kind === "scale") {
      const opts = x.kind === "scale" ? ["1", "2", "3", "4", "5"] : x.options;
      const count = o => vals.filter(a => Array.isArray(a) ? a.includes(o) : String(a) === o).length;
      const max = Math.max(1, ...opts.map(count));
      for (const o of opts) {
        const n = count(o), right = f.quiz && (Array.isArray(x.answer) ? x.answer.includes(o) : String(x.answer) === o);
        card.append(cbEl("div", { style: { display: "grid", gridTemplateColumns: "140px 1fr 40px", gap: "10px", alignItems: "center", margin: "4px 0" } },
          cbEl("span", { text: o + (right ? " ✓" : ""), style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: right ? "#9fe0b2" : "" } }),
          cbEl("div", { style: { height: "18px", borderRadius: "6px", background: "rgba(255,236,228,.06)", overflow: "hidden" } }, cbEl("div", { style: { height: "100%", width: (n / max * 100) + "%", background: right ? "#2f8f55" : f.color, borderRadius: "6px", transition: "width .6s cubic-bezier(.2,.8,.2,1)" } })),
          cbEl("b", { text: n })));
      }
    } else for (const a of vals.slice(0, 50)) card.append(cbEl("div", { class: "txt", style: { padding: "6px 10px", borderRadius: "8px", background: "rgba(255,236,228,.04)", marginTop: "4px" }, text: String(a) }));
    body.append(card);
  }
  const people = cbEl("div", { class: "gradebook" }); const tb = cbEl("table");
  tb.append(cbEl("thead", {}, cbEl("tr", {}, cbEl("th", { text: "Person" }), cbEl("th", { text: "When" }), f.quiz ? cbEl("th", { text: "Score" }) : null)));
  const tbody = cbEl("tbody"); for (const r of rows) tbody.append(cbEl("tr", {}, cbEl("td", { text: hubWho(r.respondent) }), cbEl("td", { text: hubWhen(r.created_at) }), f.quiz ? cbEl("td", { text: r.max_score ? `${r.score}/${r.max_score}` : "—" }) : null));
  tb.append(tbody); people.append(tb); body.append(people);
  body.append(cbEl("button", { class: "btn", style: { alignSelf: "flex-start" }, onclick: () => {
    const head = ["Person", "Email", "When", ...(f.quiz ? ["Score"] : []), ...f.questions.map(x => x.text)];
    const lines = [head, ...rows.map(r => [hubWho(r.respondent), HUB_PEOPLE[r.respondent]?.email || "", r.created_at, ...(f.quiz ? [r.max_score ? `${r.score}/${r.max_score}` : ""] : []), ...f.questions.map(x => [].concat(r.answers[x.id] ?? "").join("; "))])];
    cbDownload(cbSafeName(f.title) + " responses.csv", lines.map(l => l.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n"), "text/csv");
  } }, cbIconEl("download"), cbEl("span", { text: "Download responses (CSV)" })));
}

/* ── answering ── */
async function renderAnswer(id) {
  const f = await q(sb.rpc("fm_open", { p_form: id }));
  UI.title.textContent = f.title;
  if (f.owner === CB_USER.id) UI.actions.append(cbEl("button", { class: "btn", text: "Edit", onclick: () => go({ edit: f.id }) }));
  const v = UI.view = hubView(UI.view);
  const body = cbEl("div", { class: "stack anim", style: { maxWidth: "720px", margin: "0 auto" } }); v.append(body);
  body.append(cbEl("div", { class: "post", style: { borderTop: `8px solid ${f.color}` } }, cbEl("h2", { text: f.title, style: { margin: "0 0 6px", font: "700 26px var(--display)" } }), f.description ? cbEl("div", { class: "txt", text: f.description }) : null,
    cbEl("div", { class: "muted", style: { fontSize: "12px", marginTop: "8px" }, text: `Answering as ${CB_USER.email}` + (f.questions.some(x => x.required) ? " · * required" : "") })));
  if (f.mine && f.one_response) return body.append(thanks(f, f.mine));
  if (!f.accepting) return body.append(cbEl("div", { class: "post", text: "This form isn't accepting responses any more." }));
  const ans = {};
  for (const x of f.questions) {
    const card = cbEl("div", { class: "post" }, cbEl("b", { text: (x.text || "Question") + (x.required ? " *" : "") }), f.quiz && x.points ? cbEl("span", { class: "chip", style: { marginLeft: "8px" }, text: x.points + " pt" + (x.points === 1 ? "" : "s") }) : null);
    const box = cbEl("div", { class: "stack", style: { gap: "6px", marginTop: "10px" } }); card.append(box);
    if (x.kind === "choice" || x.kind === "checks") for (const o of x.options) {
      const inp = cbEl("input", { type: x.kind === "choice" ? "radio" : "checkbox", name: x.id, value: o, style: { width: "18px", height: "18px" } });
      inp.onchange = () => { ans[x.id] = x.kind === "choice" ? o : [...box.querySelectorAll("input:checked")].map(i => i.value); };
      box.append(cbEl("label", { style: { display: "flex", gap: "10px", alignItems: "center", cursor: "pointer", padding: "6px 8px", borderRadius: "8px" } }, inp, cbEl("span", { text: o })));
    } else if (x.kind === "scale") {
      const row = cbEl("div", { class: "att" });
      for (const n of [1, 2, 3, 4, 5]) row.append(cbEl("button", { text: n, style: { width: "42px", height: "42px", fontSize: "15px" }, onclick: e => { ans[x.id] = String(n); [...row.children].forEach(b => b.classList.remove("on", "present")); e.currentTarget.classList.add("on", "present"); } }));
      box.append(row);
    } else {
      const inp = x.kind === "long" ? cbEl("textarea", { class: "field", rows: 4 }) : cbEl("input", { class: "field", placeholder: "Your answer" });
      inp.oninput = () => { ans[x.id] = inp.value; }; box.append(inp);
    }
    body.append(card);
  }
  const send = cbEl("button", { class: "btn primary", style: { alignSelf: "flex-start", height: "40px", padding: "0 24px" }, text: "Submit" });
  send.onclick = async () => {
    const missing = f.questions.find(x => x.required && (ans[x.id] == null || ans[x.id] === "" || (Array.isArray(ans[x.id]) && !ans[x.id].length)));
    if (missing) return cbToast("Please answer: " + (missing.text || "a required question"));
    send.disabled = true;
    try {
      await q(sb.from("fm_responses").insert({ form_id: f.id, answers: ans }));   // no .select(): the score comes back through fm_open
      const again = await q(sb.rpc("fm_open", { p_form: f.id }));
      body.innerHTML = ""; body.append(thanks(again, again.mine || { answers: ans }));
    } catch (e) { hubErr(e); send.disabled = false; }
  };
  body.append(send);
}
function thanks(f, mine) {
  const c = cbEl("div", { class: "post", style: { textAlign: "center", padding: "40px 20px" } }, cbEl("div", { class: "empty-art", style: { padding: "0" } }, cbEl("div", { class: "ring", html: cbIcon("check") }), cbEl("b", { text: "Your response was recorded" }), cbEl("div", { text: "Submitted " + hubWhen(mine.created_at || new Date().toISOString()) })));
  if (mine.max_score) c.append(cbEl("div", { text: `${mine.score} / ${mine.max_score}`, style: { font: "800 48px var(--display)", color: f.color, marginTop: "14px" } }));
  return c;
}

(async () => { UI = await hubBoot("Forms"); addEventListener("hashchange", render); render(); })();
