import { json, oops, freshId } from "./_lib/respond.mjs"
import { store } from "./_lib/store.mjs"
import { currentUser } from "./_lib/auth.mjs"

function excerpt(md, n = 150) {
  return String(md || "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#>*`_~]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, n)
}

function digest(p, me) {
  return {
    id: p.id, title: p.title, author: p.authorHandle, authorId: p.authorId,
    pinned: !!p.pinned, excerpt: excerpt(p.body),
    createdAt: p.createdAt, updatedAt: p.updatedAt,
    canEdit: me ? (p.authorId === me.id || me.role === "admin") : false
  }
}

export default async (req, context) => {
  const me = await currentUser(req)
  if (!me) return oops("未登录", 401)
  const posts = store("posts")
  const id = context && context.params && context.params.id

  if (!id) {
    if (req.method === "GET") {
      const idx = await posts.list({ prefix: "post/" })
      const rows = (await Promise.all(idx.blobs.map((b) => posts.getJSON(b.key)))).filter(Boolean)
      rows.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (a.createdAt < b.createdAt ? 1 : -1))
      return json({ posts: rows.map((p) => digest(p, me)) })
    }
    if (req.method === "POST") {
      let body
      try { body = await req.json() } catch { return oops("请求体无效") }
      const title = String(body.title || "").trim()
      if (!title) return oops("请填写标题")
      const pid = freshId(8)
      const now = new Date().toISOString()
      const p = { id: pid, authorId: me.id, authorHandle: me.handle, title: title.slice(0, 140), body: String(body.body || "").slice(0, 50000), pinned: false, createdAt: now, updatedAt: now }
      await posts.setJSON("post/" + pid, p)
      return json({ post: { ...digest(p, me), body: p.body, canPin: me.role === "admin" } })
    }
    return oops("方法不允许", 405)
  }

  const p = await posts.getJSON("post/" + id)
  if (!p) return oops("文章不存在", 404)

  if (req.method === "GET") return json({ post: { ...digest(p, me), body: p.body, canPin: me.role === "admin" } })

  const owns = p.authorId === me.id || me.role === "admin"

  if (req.method === "PATCH") {
    let body
    try { body = await req.json() } catch { return oops("请求体无效") }
    if (body.pinned !== undefined) {
      if (me.role !== "admin") return oops("仅管理员可置顶", 403)
      p.pinned = !!body.pinned
    }
    if (body.title !== undefined || body.body !== undefined) {
      if (!owns) return oops("无权编辑此文章", 403)
      if (typeof body.title === "string" && body.title.trim()) p.title = body.title.trim().slice(0, 140)
      if (typeof body.body === "string") p.body = body.body.slice(0, 50000)
    }
    p.updatedAt = new Date().toISOString()
    await posts.setJSON("post/" + id, p)
    return json({ post: { ...digest(p, me), body: p.body, canPin: me.role === "admin" } })
  }

  if (req.method === "DELETE") {
    if (!owns) return oops("只能删除自己的文章", 403)
    await posts.delete("post/" + id)
    return json({ ok: true })
  }

  return oops("方法不允许", 405)
}

export const config = { path: ["/api/posts", "/api/posts/:id"] }
