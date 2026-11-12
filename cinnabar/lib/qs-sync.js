/* Quicksilver sync bridge: runs in a hidden page inside Quicksilver, signed in with the same Cinnabar
 * session as the Cinnabar app (same origin, so token refresh is shared). Quicksilver asks it to read and
 * write the user's sync rows and gets told when another device changes something. */
"use strict";
const qsHost = () => window.webkit.messageHandlers.qsSync;
let qsUid = null, qsChannel = null;

async function qsHello() {
  const u = await cbSession();
  const id = u ? u.id : null;
  if (id !== qsUid && qsChannel) { sb.removeChannel(qsChannel); qsChannel = null; }
  qsUid = id;
  if (u && !qsChannel) {
    qsChannel = sb.channel("qs-sync-" + u.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "sync_items", filter: "owner=eq." + u.id },
        p => qsHost().postMessage({ m: "changed", device: (p.new && p.new.device) || (p.old && p.old.device) || "", kind: (p.new && p.new.kind) || "" }))
      .subscribe();
  }
  qsHost().postMessage({ m: "hello", user: u ? { id: u.id, email: u.email, name: cbName(u) } : null });
}

const check = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
const qsSync = {
  async pull() {
    const items = check(await sb.from("sync_items").select("device,kind,data,updated_at"));
    const devices = check(await sb.from("sync_devices").select("id,name,platform,last_seen"));
    return { items, devices };
  },
  async push(rows) {
    if (!rows.length) return true;
    const now = new Date().toISOString();
    check(await sb.from("sync_items").upsert(rows.map(r => ({ owner: qsUid, device: r.device, kind: r.kind, data: r.data, updated_at: now })), { onConflict: "owner,device,kind" }));
    return true;
  },
  async heartbeat(d) {
    check(await sb.from("sync_devices").upsert({ id: d.id, owner: qsUid, name: d.name, platform: d.platform, last_seen: new Date().toISOString() }));
    return true;
  },
  async forget(id) {
    check(await sb.from("sync_items").delete().eq("device", id));
    check(await sb.from("sync_devices").delete().eq("id", id));
    return true;
  },
};
sb.auth.onAuthStateChange(ev => { if (ev === "SIGNED_IN" || ev === "SIGNED_OUT") qsHello(); });
qsHello();
