import { json, oops, freshId } from "./_lib/respond.mjs"
import { store } from "./_lib/store.mjs"
import { currentUser } from "./_lib/auth.mjs"
import { notifyMentions, pushNotif } from "./_lib/notify.mjs"

function excerpt(s, n = 120) { return String(s || "").replace(/\s+/g, " ").trim().slice(0, n) }

function threadRow(t, me) {
  return {
    id: t.id, title: t.title, author: t.handle, authorId: t.authorId,
    replyCount: t.replyCount || 0, createdAt: t.createdAt, lastAt: t.lastAt || t.createdAt,
    excerpt: excerpt(t.body), canDelete: me ? (t.authorId === me.id || me.role === "admin") : false
  }
}

function replyOut(r, me) {
  return { id: r.id, author: r.handle, authorId: r.authorId, body: r.body, createdAt: r.createdAt, canDelete: me ? (r.authorId === me.id || me.role === "admin") : false }
}

export default async (req, context) => {
  const me = await currentUser(req)
  if (!me) return oops("未登录", 401)
  const cid = context.params.id
  const tid = context.params.tid
  const rid = context.params.rid
  const path = new URL(req.url).pathname
  const threads = store("threads")
  const replies = store("replies")

  if (path.includes("/replies")) {
    const t = await threads.getJSON("thread/" + cid + "/" + tid)
    if (!t) return oops("话题不存在", 404)
    if (req.method === "POST") {
      let b
      try { b = await req.json() } catch { return oops("请求体无效") }
      const body = String(b.body || "").trim()
      if (!body) return oops("回复不能为空")
      const id = freshId(8)
      const now = new Date().toISOString()
      const r = { id, tid, authorId: me.id, handle: me.handle, body: body.slice(0, 4000), createdAt: now }
      await replies.setJSON("reply/" + tid + "/" + id, r)
      t.replyCount = (t.replyCount || 0) + 1
      t.lastAt = now
      await threads.setJSON("thread/" + cid + "/" + tid, t)
      const ch = await store("channels").getJSON("channel/" + cid)
      if (ch) { ch.lastMsgAt = now; await store("channels").setJSON("channel/" + cid, ch) }
      await notifyMentions(body, { fromHandle: me.handle, link: "/talk/" + cid + "/" + tid, label: "帖子", excludeId: me.id })
      if (t.authorId !== me.id) await pushNotif(t.authorId, { type: "reply", text: "@" + me.handle + " 回复了你的帖《" + t.title + "》", link: "/talk/" + cid + "/" + tid, fromHandle: me.handle })
      return json({ reply: replyOut(r, me) })
    }
    if (req.method === "DELETE") {
      if (!rid) return oops("缺少回复编号")
      const r = await replies.getJSON("reply/" + tid + "/" + rid)
      if (!r) return oops("回复不存在", 404)
      if (r.authorId !== me.id && me.role !== "admin") return oops("无权删除", 403)
      await replies.delete("reply/" + tid + "/" + rid)
      t.replyCount = Math.max(0, (t.replyCount || 0) - 1)
      await threads.setJSON("thread/" + cid + "/" + tid, t)
      return json({ ok: true })
    }
    return oops("方法不允许", 405)
  }

  if (tid) {
    const t = await threads.getJSON("thread/" + cid + "/" + tid)
    if (!t) return oops("话题不存在", 404)
    if (req.method === "GET") {
      const idx = await replies.list({ prefix: "reply/" + tid + "/" })
      const rows = (await Promise.all(idx.blobs.map((b) => replies.getJSON(b.key)))).filter(Boolean)
      rows.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
      return json({ thread: { ...threadRow(t, me), body: t.body }, replies: rows.map((r) => replyOut(r, me)) })
    }
    if (req.method === "DELETE") {
      if (t.authorId !== me.id && me.role !== "admin") return oops("无权删除", 403)
      const idx = await replies.list({ prefix: "reply/" + tid + "/" })
      for (const b of idx.blobs) await replies.delete(b.key)
      await threads.delete("thread/" + cid + "/" + tid)
      return json({ ok: true })
    }
    return oops("方法不允许", 405)
  }

  if (req.method === "GET") {
    const idx = await threads.list({ prefix: "thread/" + cid + "/" })
    const rows = (await Promise.all(idx.blobs.map((b) => threads.getJSON(b.key)))).filter(Boolean)
    rows.sort((a, b) => ((a.lastAt || a.createdAt) < (b.lastAt || b.createdAt) ? 1 : -1))
    await store("chanread").setJSON("cr/" + me.id + "/" + cid, new Date().toISOString())
    return json({ threads: rows.map((t) => threadRow(t, me)) })
  }
  if (req.method === "POST") {
    const ch = await store("channels").getJSON("channel/" + cid)
    if (!ch) return oops("频道不存在", 404)
    let b
    try { b = await req.json() } catch { return oops("请求体无效") }
    const title = String(b.title || "").trim()
    if (!title) return oops("请填写标题")
    const id = freshId(8)
    const now = new Date().toISOString()
    const t = { id, cid, title: title.slice(0, 140), authorId: me.id, handle: me.handle, body: String(b.body || "").slice(0, 8000), createdAt: now, replyCount: 0, lastAt: now }
    await threads.setJSON("thread/" + cid + "/" + id, t)
    ch.lastMsgAt = now
    await store("channels").setJSON("channel/" + cid, ch)
    await notifyMentions(title + " " + (b.body || ""), { fromHandle: me.handle, link: "/talk/" + cid + "/" + id, label: "帖子板", excludeId: me.id })
    return json({ thread: threadRow(t, me) })
  }
  return oops("方法不允许", 405)
}

export const config = { path: ["/api/channels/:id/threads", "/api/channels/:id/threads/:tid", "/api/channels/:id/threads/:tid/replies", "/api/channels/:id/threads/:tid/replies/:rid"] }
