import { json, oops } from "./_lib/respond.mjs"
import { store } from "./_lib/store.mjs"
import { isIndexKey } from "./_lib/collection.mjs"
import { currentUser, isAdmin } from "./_lib/auth.mjs"

const JSON_STORES = [
  "projects", "versions", "characters", "posts", "series", "comments",
  "channels", "messages", "threads", "replies", "plans", "stars", "reports",
  "users", "activity", "notifs", "follows", "reads", "chanread",
  "dms", "dmconv", "dmread"
]

export default async (req) => {
  const me = await currentUser(req)
  if (!isAdmin(me)) return oops("需要管理员权限", 403)

  const part = new URL(req.url).searchParams.get("store")

  if (part === "__files__") {
    const idx = await store("files").list({})
    return json({ keys: idx.blobs.map((b) => b.key) })
  }

  if (part) {
    if (!JSON_STORES.includes(part)) return oops("未知库", 400)
    const s = store(part)
    const idx = await s.list({})
    const data = {}
    for (const b of idx.blobs) {
      if (isIndexKey(b.key)) continue
      try { const v = await s.getJSON(b.key); if (v != null) data[b.key] = v } catch {}
    }
    return json({ store: part, data })
  }

  return json({ stores: JSON_STORES, exportedAt: new Date().toISOString(), by: me.handle, format: "changshengtian-full-export", v: 1 })
}

export const config = { path: "/api/admin/export" }
