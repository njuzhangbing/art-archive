import { json, oops, freshId } from "./_lib/respond.mjs"
import { store, updateJSON } from "./_lib/store.mjs"
import { currentUser, isAdmin } from "./_lib/auth.mjs"
import { collection } from "./_lib/collection.mjs"
import { postDigest, postRow, forViewer } from "./_lib/blog.mjs"

const postIndex = collection({ name: "posts", prefix: "post/", project: postRow })

const LEVELS = ["normal", "important", "urgent"]

function cleanMarg(raw) {
  if (!raw || typeof raw !== "object") return {}
  const out = {}
  let n = 0
  for (const k of Object.keys(raw)) {
    if (n >= 300) break
    const v = raw[k]
    if (!v || typeof v !== "object") continue
    const id = String(k).slice(0, 24)
    if (v.t === "note") { out[id] = { t: "note", note: String(v.note || "").slice(0, 4000) }; n++ }
    else if (v.t === "quote") { out[id] = { t: "quote", s: String(v.s || "").slice(0, 8000), a: Math.max(0, v.a | 0), b: Math.max(0, v.b | 0) }; n++ }
  }
  return out
}

async function readerIds(id) {
  const base = "read/" + id + "/"
  const idx = await store("reads").list({ prefix: base })
  return idx.blobs.map((b) => b.key.slice(base.length))
}

async function attachRead(d, id, me) {
  const ids = await readerIds(id)
  d.readCount = ids.length
  d.iRead = ids.includes(me.id)
}

async function seriesAdd(sid, pid) {
  const updated = await updateJSON(store("series"), "series/" + sid, (s) => {
    s.order = s.order || []
    if (s.order.includes(pid)) return undefined
    s.order.push(pid)
    s.updatedAt = new Date().toISOString()
    return s
  })
  return !!updated
}

async function seriesRemove(sid, pid) {
  await updateJSON(store("series"), "series/" + sid, (s) => {
    if (!(s.order || []).includes(pid)) return undefined
    s.order = s.order.filter((x) => x !== pid)
    s.updatedAt = new Date().toISOString()
    return s
  })
}

async function wipePrefix(name, prefix) {
  const sx = store(name)
  const ix = await sx.list({ prefix })
  for (const b of ix.blobs) await sx.delete(b.key)
}

export default async (req, context) => {
  const me = await currentUser(req)
  if (!me) return oops("未登录", 401)
  const posts = store("posts")
  const id = context && context.params && context.params.id
  const path = new URL(req.url).pathname

  if (id && path.endsWith("/reads")) {
    if (!isAdmin(me)) return oops("需要管理员权限", 403)
    const base = "read/" + id + "/"
    const idx = await store("reads").list({ prefix: base })
    const rows = (await Promise.all(idx.blobs.map((b) => store("reads").getJSON(b.key)))).filter(Boolean)
    rows.sort((a, b) => (a.at < b.at ? 1 : -1))
    return json({ readers: rows.map((r) => ({ handle: r.handle || "?", at: r.at })), count: rows.length })
  }

  if (id && path.endsWith("/read")) {
    const p = await posts.getJSON("post/" + id)
    if (!p) return oops("文章不存在", 404)
    if (req.method !== "POST") return oops("方法不允许", 405)
    await store("reads").setJSON("read/" + id + "/" + me.id, { at: new Date().toISOString(), handle: me.handle })
    const ids = await readerIds(id)
    return json({ ok: true, readCount: ids.length, iRead: true })
  }

  if (!id) {
    if (req.method === "GET") {
      const all = await postIndex.rows()
      const rows = all
        .filter((p) => !p.hidden || p.authorId === me.id || isAdmin(me))
        .slice()
        .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (a.createdAt < b.createdAt ? 1 : -1))
      const out = rows.map((r) => forViewer(r, me))
      // Read receipts live outside the post record, so they still cost a lookup
      // each — but they no longer queue up behind one another.
      await Promise.all(out.map((d) => (d.kind === "announcement" ? attachRead(d, d.id, me) : null)))
      return json({ posts: out })
    }
    if (req.method === "POST") {
      let body
      try { body = await req.json() } catch { return oops("请求体无效") }
      const title = String(body.title || "").trim()
      if (!title) return oops("请填写标题")
      const pid = freshId(8)
      const now = new Date().toISOString()
      const p = {
        id: pid, authorId: me.id, authorHandle: me.handle,
        title: title.slice(0, 140), body: String(body.body || "").slice(0, 50000),
        pinned: false, seriesId: null, kind: "post", level: "normal",
        commentsLocked: false, hidden: false, marg: cleanMarg(body.marg), createdAt: now, updatedAt: now
      }
      if (isAdmin(me) && body.kind === "announcement") {
        p.kind = "announcement"
        p.level = LEVELS.includes(body.level) ? body.level : "normal"
      }
      if (body.seriesId && await seriesAdd(body.seriesId, pid)) p.seriesId = body.seriesId
      await posts.setJSON("post/" + pid, p)
      return json({ post: { ...postDigest(p, me), body: p.body, canPin: isAdmin(me) } })
    }
    return oops("方法不允许", 405)
  }

  const p = await posts.getJSON("post/" + id)
  if (!p) return oops("文章不存在", 404)
  if (p.hidden && p.authorId !== me.id && !isAdmin(me)) return oops("文章不存在", 404)

  if (req.method === "GET") {
    const d = { ...postDigest(p, me), body: p.body, marg: p.marg || {}, canPin: isAdmin(me) }
    if (d.kind === "announcement") await attachRead(d, id, me)
    if (p.seriesId) {
      const s = await store("series").getJSON("series/" + p.seriesId)
      if (s) {
        const order = (s.order || []).filter(Boolean)
        const i = order.indexOf(id)
        const nav = { id: s.id, title: s.title, index: i, total: order.length, prevId: null, prevTitle: null, nextId: null, nextTitle: null }
        const fill = async (nid, which) => {
          if (!nid) return
          const np = await posts.getJSON("post/" + nid)
          if (np && !np.hidden) { nav[which + "Id"] = nid; nav[which + "Title"] = np.title }
        }
        if (i >= 0) { await fill(order[i - 1], "prev"); await fill(order[i + 1], "next") }
        d.series = nav
      }
    }
    return json({ post: d })
  }

  const owns = p.authorId === me.id || isAdmin(me)

  if (req.method === "PATCH") {
    let body
    try { body = await req.json() } catch { return oops("请求体无效") }
    if (body.pinned !== undefined) {
      if (!isAdmin(me)) return oops("仅管理员可置顶", 403)
      p.pinned = !!body.pinned
    }
    if (body.kind !== undefined || body.level !== undefined) {
      if (!isAdmin(me)) return oops("仅管理员可设公告", 403)
      if (body.kind === "announcement") { p.kind = "announcement"; if (LEVELS.includes(body.level)) p.level = body.level; else p.level = p.level || "normal" }
      else if (body.kind === "post") p.kind = "post"
      else if (LEVELS.includes(body.level)) p.level = body.level
    }
    if (body.hidden !== undefined) { if (!owns) return oops("无权操作", 403); p.hidden = !!body.hidden }
    if (body.commentsLocked !== undefined) { if (!owns) return oops("无权操作", 403); p.commentsLocked = !!body.commentsLocked }
    if (body.seriesId !== undefined) {
      if (!owns) return oops("无权操作", 403)
      const next = body.seriesId || null
      if (next !== (p.seriesId || null)) {
        if (p.seriesId) await seriesRemove(p.seriesId, id)
        if (next && await seriesAdd(next, id)) p.seriesId = next
        else p.seriesId = null
      }
    }
    if (body.title !== undefined || body.body !== undefined) {
      if (!owns) return oops("无权编辑此文章", 403)
      if (typeof body.title === "string" && body.title.trim()) p.title = body.title.trim().slice(0, 140)
      if (typeof body.body === "string") p.body = body.body.slice(0, 50000)
    }
    if (body.marg !== undefined) {
      if (!owns) return oops("无权操作", 403)
      p.marg = cleanMarg(body.marg)
    }
    p.updatedAt = new Date().toISOString()
    await posts.setJSON("post/" + id, p)
    return json({ post: { ...postDigest(p, me), body: p.body, canPin: isAdmin(me) } })
  }

  if (req.method === "DELETE") {
    if (!owns) return oops("只能删除自己的文章", 403)
    if (p.seriesId) await seriesRemove(p.seriesId, id)
    await wipePrefix("comments", "comment/" + id + "/")
    await wipePrefix("reads", "read/" + id + "/")
    await posts.delete("post/" + id)
    return json({ ok: true })
  }

  return oops("方法不允许", 405)
}

export const config = { path: ["/api/posts", "/api/posts/:id", "/api/posts/:id/read", "/api/posts/:id/reads"] }
