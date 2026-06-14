import { store } from "./store.mjs"

const base = (uid) => "notif/" + uid + "/"

export async function pushNotif(userId, n) {
  if (!userId) return
  const id = String(Date.now()).padStart(15, "0") + "-" + Math.random().toString(36).slice(2, 7)
  await store("notifs").setJSON(base(userId) + id, {
    id, type: n.type || "info", text: String(n.text || "").slice(0, 240),
    link: n.link || "", fromHandle: n.fromHandle || "", at: new Date().toISOString(), read: false
  })
  const idx = await store("notifs").list({ prefix: base(userId) })
  const keys = idx.blobs.map((b) => b.key.slice(base(userId).length)).sort()
  if (keys.length > 100) for (const k of keys.slice(0, keys.length - 100)) await store("notifs").delete(base(userId) + k)
}

export function mentionHandles(text) {
  const out = new Set()
  String(text || "").replace(/(^|[^A-Za-z0-9_])@([A-Za-z0-9_]{3,20})/g, (m, p, hd) => { out.add(hd.toLowerCase()); return m })
  return [...out]
}

export async function notifyMentions(text, opts) {
  const handles = mentionHandles(text)
  if (!handles.length) return
  const users = store("users")
  for (const hd of handles) {
    const uid = await users.getJSON("handle/" + hd)
    if (!uid || uid === opts.excludeId) continue
    await pushNotif(uid, { type: "mention", text: "@" + opts.fromHandle + " 在" + (opts.label || "讨论") + "提到了你", link: opts.link, fromHandle: opts.fromHandle })
  }
}
