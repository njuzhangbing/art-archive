import { json, oops, freshId } from "./_lib/respond.mjs"
import { store } from "./_lib/store.mjs"
import { currentUser } from "./_lib/auth.mjs"

const KINDS = ["chat", "board"]

function digest(c, me) {
  return {
    id: c.id, name: c.name, topic: c.topic || "", kind: c.kind,
    owner: c.createdByHandle, ownerId: c.createdBy, createdAt: c.createdAt,
    canDelete: me ? (c.createdBy === me.id || me.role === "admin") : false
  }
}

async function wipePrefix(name, prefix) {
  const sx = store(name)
  const ix = await sx.list({ prefix })
  for (const b of ix.blobs) await sx.delete(b.key)
}

export default async (req, context) => {
  const me = await currentUser(req)
  if (!me) return oops("未登录", 401)
  const channels = store("channels")
  const cid = context && context.params && context.params.id

  if (!cid) {
    if (req.method === "GET") {
      const idx = await channels.list({ prefix: "channel/" })
      const rows = (await Promise.all(idx.blobs.map((b) => channels.getJSON(b.key)))).filter(Boolean)
      rows.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
      return json({ channels: rows.map((c) => digest(c, me)) })
    }
    if (req.method === "POST") {
      let b
      try { b = await req.json() } catch { return oops("请求体无效") }
      const name = String(b.name || "").trim()
      if (!name) return oops("请填写频道名")
      const kind = KINDS.includes(b.kind) ? b.kind : "chat"
      const id = freshId(8)
      const now = new Date().toISOString()
      const c = { id, name: name.slice(0, 50), topic: String(b.topic || "").slice(0, 160), kind, createdBy: me.id, createdByHandle: me.handle, createdAt: now }
      await channels.setJSON("channel/" + id, c)
      return json({ channel: digest(c, me) })
    }
    return oops("方法不允许", 405)
  }

  const c = await channels.getJSON("channel/" + cid)
  if (!c) return oops("频道不存在", 404)

  if (req.method === "GET") return json({ channel: digest(c, me) })

  if (req.method === "DELETE") {
    if (c.createdBy !== me.id && me.role !== "admin") return oops("只能删除自己建的频道", 403)
    if (c.kind === "chat") {
      await wipePrefix("messages", "msg/" + cid + "/")
    } else {
      const tidx = await store("threads").list({ prefix: "thread/" + cid + "/" })
      for (const tb of tidx.blobs) {
        const t = await store("threads").getJSON(tb.key)
        if (t) await wipePrefix("replies", "reply/" + t.id + "/")
        await store("threads").delete(tb.key)
      }
    }
    await channels.delete("channel/" + cid)
    return json({ ok: true })
  }

  return oops("方法不允许", 405)
}

export const config = { path: ["/api/channels", "/api/channels/:id"] }
