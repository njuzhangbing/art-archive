import { json, oops, freshId } from "./_lib/respond.mjs"
import { store } from "./_lib/store.mjs"
import { currentUser, isAdmin } from "./_lib/auth.mjs"
import { notifyMentions, pushNotif } from "./_lib/notify.mjs"

function out(c, me, postOwnerId) {
  return {
    id: c.id, body: c.body, author: c.authorHandle, authorId: c.authorId, createdAt: c.createdAt,
    canDelete: me ? (c.authorId === me.id || postOwnerId === me.id || isAdmin(me)) : false
  }
}

export default async (req, context) => {
  const me = await currentUser(req)
  if (!me) return oops("未登录", 401)
  const pid = context.params.id
  const cid = context.params.cid
  const posts = store("posts")
  const comments = store("comments")
  const p = await posts.getJSON("post/" + pid)
  if (!p) return oops("文章不存在", 404)

  if (req.method === "GET") {
    const idx = await comments.list({ prefix: "comment/" + pid + "/" })
    const rows = (await Promise.all(idx.blobs.map((b) => comments.getJSON(b.key)))).filter(Boolean)
    rows.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
    return json({ comments: rows.map((c) => out(c, me, p.authorId)), locked: !!p.commentsLocked, canModerate: p.authorId === me.id || isAdmin(me) })
  }

  if (req.method === "POST") {
    if (p.commentsLocked) return oops("该文章评论已关闭", 403)
    let b
    try { b = await req.json() } catch { return oops("请求体无效") }
    const body = String(b.body || "").trim()
    if (!body) return oops("评论不能为空")
    const id = freshId(8)
    const now = new Date().toISOString()
    const c = { id, postId: pid, authorId: me.id, authorHandle: me.handle, body: body.slice(0, 2000), createdAt: now }
    await comments.setJSON("comment/" + pid + "/" + id, c)
    await notifyMentions(body, { fromHandle: me.handle, link: "/blog/" + pid, label: "评论", excludeId: me.id })
    if (p.authorId !== me.id) await pushNotif(p.authorId, { type: "comment", text: "@" + me.handle + " 评论了你的《" + p.title + "》", link: "/blog/" + pid, fromHandle: me.handle })
    return json({ comment: out(c, me, p.authorId) })
  }

  if (req.method === "DELETE") {
    if (!cid) return oops("缺少评论编号")
    const c = await comments.getJSON("comment/" + pid + "/" + cid)
    if (!c) return oops("评论不存在", 404)
    if (c.authorId !== me.id && p.authorId !== me.id && !isAdmin(me)) return oops("无权删除此评论", 403)
    await comments.delete("comment/" + pid + "/" + cid)
    return json({ ok: true })
  }

  return oops("方法不允许", 405)
}

export const config = { path: ["/api/posts/:id/comments", "/api/posts/:id/comments/:cid"] }
