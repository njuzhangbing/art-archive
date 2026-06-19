import { json, oops, freshId } from "./_lib/respond.mjs"
import { store } from "./_lib/store.mjs"
import { currentUser, isAdmin } from "./_lib/auth.mjs"
import { notifyMentions, pushNotif } from "./_lib/notify.mjs"

const pins = () => store("pins")

function nameOf(u) { return u.displayName || u.handle }

function pinOut(p, me, ownerId) {
  const mayKill = me ? (p.authorId === me.id || ownerId === me.id || isAdmin(me)) : false
  return {
    id: p.id, vid: p.versionId, aid: p.assetId, x: p.x, y: p.y,
    body: p.body, author: p.authorHandle, authorName: p.authorName, authorId: p.authorId,
    createdAt: p.createdAt, done: !!p.done, canModerate: mayKill,
    replies: (p.replies || []).map((r) => ({ id: r.id, body: r.body, author: r.authorHandle, authorName: r.authorName, authorId: r.authorId, createdAt: r.createdAt }))
  }
}

export default async (req, context) => {
  const me = await currentUser(req)
  if (!me) return oops("未登录", 401)

  const pid = context.params.id
  const pinId = context.params.pinId
  const projects = store("projects")
  const p = await projects.getJSON("project/" + pid)
  if (!p) return oops("项目不存在", 404)
  const ownerId = p.ownerId
  const canModerate = ownerId === me.id || isAdmin(me)
  const key = (id) => "pin/" + pid + "/" + id

  if (req.method === "GET") {
    const u = new URL(req.url)
    const vid = u.searchParams.get("vid")
    const aid = u.searchParams.get("aid")
    const idx = await pins().list({ prefix: "pin/" + pid + "/" })
    let rows = (await Promise.all(idx.blobs.map((b) => pins().getJSON(b.key)))).filter(Boolean)
    if (vid) rows = rows.filter((r) => r.versionId === vid)
    if (aid) rows = rows.filter((r) => r.assetId === aid)
    rows.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
    return json({ pins: rows.map((r) => pinOut(r, me, ownerId)), canModerate })
  }

  if (req.method === "POST" && !pinId) {
    let b
    try { b = await req.json() } catch { return oops("请求体无效") }
    const body = String(b.body || "").trim()
    if (!body) return oops("批注内容不能为空")
    const x = Math.min(1, Math.max(0, Number(b.x)))
    const y = Math.min(1, Math.max(0, Number(b.y)))
    if (!b.vid || !b.aid || Number.isNaN(x) || Number.isNaN(y)) return oops("缺少定位信息")
    const id = freshId(8)
    const now = new Date().toISOString()
    const pin = {
      id, projectId: pid, versionId: b.vid, assetId: b.aid, x, y,
      authorId: me.id, authorHandle: me.handle, authorName: nameOf(me),
      body: body.slice(0, 1200), createdAt: now, done: false, replies: []
    }
    await pins().setJSON(key(id), pin)
    await notifyMentions(body, { fromHandle: me.handle, link: "/projects/" + pid, label: "批注", excludeId: me.id })
    if (ownerId !== me.id) await pushNotif(ownerId, { type: "pin", text: "@" + me.handle + " 在《" + p.title + "》上钉了一条批注", link: "/projects/" + pid, fromHandle: me.handle })
    return json({ pin: pinOut(pin, me, ownerId) })
  }

  if (req.method === "POST" && pinId) {
    const pin = await pins().getJSON(key(pinId))
    if (!pin) return oops("批注不存在", 404)
    let b
    try { b = await req.json() } catch { return oops("请求体无效") }
    const body = String(b.body || "").trim()
    if (!body) return oops("回复不能为空")
    const reply = { id: freshId(6), authorId: me.id, authorHandle: me.handle, authorName: nameOf(me), body: body.slice(0, 1200), createdAt: new Date().toISOString() }
    pin.replies = [...(pin.replies || []), reply]
    await pins().setJSON(key(pinId), pin)
    await notifyMentions(body, { fromHandle: me.handle, link: "/projects/" + pid, label: "批注回复", excludeId: me.id })
    if (pin.authorId !== me.id) await pushNotif(pin.authorId, { type: "pin", text: "@" + me.handle + " 回复了你在《" + p.title + "》上的批注", link: "/projects/" + pid, fromHandle: me.handle })
    return json({ pin: pinOut(pin, me, ownerId) })
  }

  if (req.method === "PATCH" && pinId) {
    const pin = await pins().getJSON(key(pinId))
    if (!pin) return oops("批注不存在", 404)
    if (pin.authorId !== me.id && !canModerate) return oops("无权操作此批注", 403)
    let b
    try { b = await req.json() } catch { return oops("请求体无效") }
    pin.done = !!b.done
    await pins().setJSON(key(pinId), pin)
    return json({ pin: pinOut(pin, me, ownerId) })
  }

  if (req.method === "DELETE" && pinId) {
    const pin = await pins().getJSON(key(pinId))
    if (!pin) return oops("批注不存在", 404)
    if (pin.authorId !== me.id && !canModerate) return oops("无权删除此批注", 403)
    await pins().delete(key(pinId))
    return json({ ok: true })
  }

  return oops("方法不允许", 405)
}

export const config = { path: ["/api/projects/:id/pins", "/api/projects/:id/pins/:pinId"] }
