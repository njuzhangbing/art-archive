import { json, oops, freshId } from "./_lib/respond.mjs"
import { store } from "./_lib/store.mjs"
import { currentUser } from "./_lib/auth.mjs"
import { excerpt } from "./_lib/blog.mjs"

function digest(s, me) {
  return {
    id: s.id, title: s.title, desc: s.desc || "",
    coverKey: s.coverKey || null,
    coverUrl: s.coverKey ? "/media/" + s.coverKey : null,
    owner: s.ownerHandle, ownerId: s.ownerId,
    count: (s.order || []).length,
    canEdit: me ? (s.ownerId === me.id || me.role === "admin") : false,
    createdAt: s.createdAt, updatedAt: s.updatedAt
  }
}

function rowOf(p) {
  return {
    id: p.id, title: p.title, excerpt: excerpt(p.body),
    author: p.authorHandle, createdAt: p.createdAt,
    kind: p.kind === "announcement" ? "announcement" : "post", level: p.level || "normal"
  }
}

export default async (req, context) => {
  const me = await currentUser(req)
  if (!me) return oops("未登录", 401)
  const series = store("series")
  const id = context && context.params && context.params.id

  if (!id) {
    if (req.method === "GET") {
      const idx = await series.list({ prefix: "series/" })
      const rows = (await Promise.all(idx.blobs.map((b) => series.getJSON(b.key)))).filter(Boolean)
      rows.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
      return json({ series: rows.map((s) => digest(s, me)) })
    }
    if (req.method === "POST") {
      let b
      try { b = await req.json() } catch { return oops("请求体无效") }
      const title = String(b.title || "").trim()
      if (!title) return oops("请填写系列标题")
      const sid = freshId(8)
      const now = new Date().toISOString()
      const s = {
        id: sid, ownerId: me.id, ownerHandle: me.handle,
        title: title.slice(0, 100), desc: String(b.desc || "").slice(0, 600),
        coverKey: b.coverKey || null, order: [], createdAt: now, updatedAt: now
      }
      await series.setJSON("series/" + sid, s)
      return json({ series: digest(s, me) })
    }
    return oops("方法不允许", 405)
  }

  const s = await series.getJSON("series/" + id)
  if (!s) return oops("系列不存在", 404)

  if (req.method === "GET") {
    const posts = store("posts")
    const order = (s.order || []).filter(Boolean)
    const loaded = await Promise.all(order.map((pid) => posts.getJSON("post/" + pid)))
    const visible = loaded.filter((p) => p && (!p.hidden || p.authorId === me.id || me.role === "admin"))
    return json({ series: digest(s, me), posts: visible.map(rowOf) })
  }

  const owns = s.ownerId === me.id || me.role === "admin"
  if (!owns) return oops("无权操作此系列", 403)

  if (req.method === "PATCH") {
    let b
    try { b = await req.json() } catch { return oops("请求体无效") }
    if (typeof b.title === "string" && b.title.trim()) s.title = b.title.trim().slice(0, 100)
    if (typeof b.desc === "string") s.desc = b.desc.slice(0, 600)
    if (b.coverKey !== undefined) s.coverKey = b.coverKey || null
    if (Array.isArray(b.order)) {
      const have = new Set(s.order || [])
      const next = b.order.filter((x) => have.has(x))
      for (const x of (s.order || [])) if (!next.includes(x)) next.push(x)
      s.order = next
    }
    s.updatedAt = new Date().toISOString()
    await series.setJSON("series/" + id, s)
    return json({ series: digest(s, me) })
  }

  if (req.method === "DELETE") {
    const posts = store("posts")
    for (const pid of s.order || []) {
      const p = await posts.getJSON("post/" + pid)
      if (p && p.seriesId === id) { p.seriesId = null; await posts.setJSON("post/" + pid, p) }
    }
    await series.delete("series/" + id)
    return json({ ok: true })
  }

  return oops("方法不允许", 405)
}

export const config = { path: ["/api/series", "/api/series/:id"] }
