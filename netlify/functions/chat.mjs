import { json, oops } from "./_lib/respond.mjs"
import { store } from "./_lib/store.mjs"
import { currentUser } from "./_lib/auth.mjs"
import { notifyMentions } from "./_lib/notify.mjs"

const MAX_KEEP = 400

function out(m, me) {
  return { id: m.id, author: m.handle, authorId: m.authorId, body: m.body, createdAt: m.createdAt, canDelete: me ? (m.authorId === me.id || me.role === "admin") : false }
}

function newId() {
  return String(Date.now()).padStart(15, "0") + "-" + Math.random().toString(36).slice(2, 8)
}

export default async (req, context) => {
  const me = await currentUser(req)
  if (!me) return oops("未登录", 401)
  const cid = context.params.id
  const mid = context.params.mid
  const messages = store("messages")
  const base = "msg/" + cid + "/"

  if (req.method === "GET") {
    const since = new URL(req.url).searchParams.get("since")
    const idx = await messages.list({ prefix: base })
    const keys = idx.blobs.map((b) => b.key.slice(base.length)).sort()
    const pick = since ? keys.filter((k) => k > since) : keys.slice(-60)
    const rows = (await Promise.all(pick.map((k) => messages.getJSON(base + k)))).filter(Boolean)
    await store("chanread").setJSON("cr/" + me.id + "/" + cid, new Date().toISOString())
    return json({ messages: rows.map((m) => out(m, me)), cursor: keys.length ? keys[keys.length - 1] : (since || "") })
  }

  if (req.method === "POST") {
    const ch = await store("channels").getJSON("channel/" + cid)
    if (!ch) return oops("频道不存在", 404)
    let b
    try { b = await req.json() } catch { return oops("请求体无效") }
    const body = String(b.body || "").trim()
    if (!body) return oops("不能发空消息")
    const id = newId()
    const m = { id, cid, authorId: me.id, handle: me.handle, body: body.slice(0, 2000), createdAt: new Date().toISOString() }
    await messages.setJSON(base + id, m)
    const idx = await messages.list({ prefix: base })
    const keys = idx.blobs.map((x) => x.key.slice(base.length)).sort()
    if (keys.length > MAX_KEEP) for (const k of keys.slice(0, keys.length - MAX_KEEP)) await messages.delete(base + k)
    ch.lastMsgAt = m.createdAt
    await store("channels").setJSON("channel/" + cid, ch)
    await notifyMentions(body, { fromHandle: me.handle, link: "/talk/" + cid, label: "频道 #" + ch.name, excludeId: me.id })
    return json({ message: out(m, me), cursor: id })
  }

  if (req.method === "DELETE") {
    if (!mid) return oops("缺少消息编号")
    const m = await messages.getJSON(base + mid)
    if (!m) return oops("消息不存在", 404)
    if (m.authorId !== me.id && me.role !== "admin") return oops("无权删除", 403)
    await messages.delete(base + mid)
    return json({ ok: true })
  }

  return oops("方法不允许", 405)
}

export const config = { path: ["/api/channels/:id/messages", "/api/channels/:id/messages/:mid"] }
