import { json, oops } from "./_lib/respond.mjs"
import { store } from "./_lib/store.mjs"
import { currentUser } from "./_lib/auth.mjs"

export default async (req) => {
  const me = await currentUser(req)
  if (!me) return oops("未登录", 401)
  const notifs = store("notifs")
  const base = "notif/" + me.id + "/"
  const path = new URL(req.url).pathname

  if (path.endsWith("/read") && req.method === "POST") {
    const idx = await notifs.list({ prefix: base })
    for (const b of idx.blobs) { const n = await notifs.getJSON(b.key); if (n && !n.read) { n.read = true; await notifs.setJSON(b.key, n) } }
    return json({ ok: true })
  }

  if (req.method === "GET") {
    const idx = await notifs.list({ prefix: base })
    const rows = (await Promise.all(idx.blobs.map((b) => notifs.getJSON(b.key)))).filter(Boolean)
    rows.sort((a, b) => (a.at < b.at ? 1 : -1))
    return json({ notifications: rows.slice(0, 60), unread: rows.filter((n) => !n.read).length })
  }

  return oops("方法不允许", 405)
}

export const config = { path: ["/api/notifications", "/api/notifications/read"] }
