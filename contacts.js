/* Cinnabar Contacts: your own address book, by username (db/suite.sql ct_contacts). No email addresses are stored. */
"use strict";
let UI, people = [];
const q = async p => { const { data, error } = await p; if (error) throw new Error(error.message); return data; };
const view = () => new URLSearchParams(location.hash.slice(1)).get("v") || "all";

async function render() {
  people = await q(sb.from("ct_contacts").select("*").order("name")).catch(e => (hubErr(e), []));
  const v_ = view(), term = (UI.search?.value || "").toLowerCase();
  const labels = [...new Set(people.flatMap(p => p.labels))].sort();
  UI.title.textContent = v_ === "all" ? "Contacts" : v_ === "starred" ? "Favourites" : v_;
  const v = UI.view = hubView(UI.view);
  const side = cbEl("div", { class: "ml-side" },
    cbEl("button", { class: "btn primary ml-compose", html: cbIcon("plus") + "<span>Create contact</span>", onclick: () => edit({}) }),
    cbEl("button", { class: "ml-f" + (v_ === "all" ? " on" : ""), onclick: () => { location.hash = ""; } }, cbIconEl("people"), cbEl("span", { text: "Contacts" }), cbEl("b", { text: people.length || "" })),
    cbEl("button", { class: "ml-f" + (v_ === "starred" ? " on" : ""), onclick: () => { location.hash = "v=starred"; } }, cbIconEl("star"), cbEl("span", { text: "Favourites" })),
    labels.length ? cbEl("div", { class: "cap", text: "Labels" }) : null,
    ...labels.map(l => cbEl("button", { class: "ml-f" + (v_ === l ? " on" : ""), onclick: () => { location.hash = "v=" + encodeURIComponent(l); } }, cbIconEl("grid"), cbEl("span", { text: l }))));
  let shown = people.filter(p => v_ === "all" || (v_ === "starred" ? p.starred : p.labels.includes(v_)));
  if (term) shown = shown.filter(p => [p.name, p.username, p.phone, p.company, p.notes].join(" ").toLowerCase().includes(term));
  const main = cbEl("div", { class: "ct-main" });
  if (!shown.length) main.append(hubEmpty("people", people.length ? "No one matches" : "No contacts yet", "Add the people you mail, chat and meet with. Contacts with a username are suggested in Mail.", cbEl("button", { class: "btn primary", text: "Create contact", onclick: () => edit({}) })));
  else {
    const t = cbEl("div", { class: "ct-table" }, cbEl("div", { class: "ct-row head" }, cbEl("span", { text: "Name" }), cbEl("span", { text: "Username" }), cbEl("span", { text: "Phone" }), cbEl("span", { text: "Company" }), cbEl("span")));
    for (const p of shown) t.append(cbEl("div", { class: "ct-row", onclick: e => { if (!e.target.closest("button")) edit(p); } },
      cbEl("span", { class: "ct-name" }, cbEl("span", { class: "avatar", text: p.name[0], style: { background: cbColorFor(p.username || p.name) } }), cbEl("b", { text: p.name })),
      cbEl("span", { class: p.user_id ? "" : "muted", text: p.username ? p.username + (p.user_id ? "" : " (not found)") : "—" }),
      cbEl("span", { text: p.phone || "" }), cbEl("span", { text: p.company || "" }),
      cbEl("span", { class: "ct-act" },
        p.user_id ? cbEl("a", { class: "icon-btn", title: "Send mail", href: "mail.html#compose=" + encodeURIComponent(p.username), html: cbIcon("send") }) : null,
        p.user_id ? cbEl("button", { class: "icon-btn", title: "Chat", html: cbIcon("forum"), onclick: async () => { try { location.href = "chat.html#s=" + await q(sb.rpc("ch_dm", { p_username: p.username })); } catch (e) { hubErr(e); } } }) : null,
        cbEl("button", { class: "icon-btn" + (p.starred ? " on" : ""), title: "Favourite", html: cbIcon("star"), onclick: () => q(sb.from("ct_contacts").update({ starred: !p.starred }).eq("id", p.id)).then(render, hubErr) }))));
    main.append(t);
  }
  v.append(cbEl("div", { class: "ml-wrap" }, side, main));
}
async function edit(p) {
  const f = await hubForm(p.id ? "Edit contact" : "Create contact", [
    { key: "name", label: "Name", value: p.name, required: true }, { key: "username", label: "Cinnabar username", value: p.username, placeholder: "ava.cho" },
    { key: "phone", label: "Phone", type: "tel", value: p.phone }, { key: "company", label: "Company or school", value: p.company },
    { key: "labels", label: "Labels (comma separated)", value: (p.labels || []).join(", ") }, { key: "notes", label: "Notes", type: "textarea", rows: 3, value: p.notes },
  ], "Save", p.id ? [{ label: "Delete", result: "delete" }] : []);
  if (f === "delete") { if (await cbConfirm("Delete " + p.name + "?", "This contact is removed from your address book.", "Delete", true)) await q(sb.from("ct_contacts").delete().eq("id", p.id)).catch(hubErr); return render(); }
  if (!f) return;
  const row = { name: f.name, username: f.username ? f.username.toLowerCase() : null, phone: f.phone, company: f.company, notes: f.notes || "", labels: (f.labels || "").split(",").map(x => x.trim()).filter(Boolean) };
  try { p.id ? await q(sb.from("ct_contacts").update(row).eq("id", p.id)) : await q(sb.from("ct_contacts").insert(row)); } catch (e) { hubErr(e); }
  render();
}

(async () => {
  UI = await hubBoot("Contacts");
  UI.search = cbEl("input", { class: "field", type: "search", placeholder: "Search contacts", style: { width: "240px", height: "32px" }, oninput: () => { clearTimeout(UI.t); UI.t = setTimeout(render, 250); } });
  UI.actions.append(UI.search);
  addEventListener("hashchange", render);
  render();
})();
