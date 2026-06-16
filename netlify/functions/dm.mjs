import { json, oops } from "./_lib/respond.mjs"
import { store } from "./_lib/store.mjs"
import { currentUser, isAdmin } from "./_lib/auth.mjs"
import { pushNotif } from "./_lib/notify.mjs"

const MAX_KEEP = 500
function convId(a, b) { return "c-" + [a, b].sort().join("-") }
function msgId() { return String(Date.now()).padStart(15, "0") + "-" + Math.random().toString(36).slice(2, 7) }
function pub(u, handle) { return u ? { handle: u.handle, displayName: u.displayName || u.handle, avatarUrl: u.avatarKey ? "/media/" + u.avatarKey : null } : { handle, displayName: handle, avatarUrl: null } }

export default async (req, context) => {
  const me = await currentUser(req)
  if (!me) return oops("未登录", 401)
  const users = store("users")
  const handle = context.params.handle
  const mid = context.params.mid

  if (!handle) {
    const dmconv = store("dmconv")
    const dmread = store("dmread")
    const base = "dmconv/" + me.id + "/"
    const idx = await dmconv.list({ prefix: base })
    const rows = (await Promise.all(idx.blobs.map((b) => dmconv.getJSON(b.key).then((v) => (v ? { otherId: b.key.slice(base.length), ...v } : null))))).filter(Boolean)
    rows.sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1))
    const reads = await Promise.all(rows.map((c) => dmread.getJSON("dr/" + me.id + "/" + convId(me.id, c.otherId))))
    return json({ conversations: rows.map((c, i) => ({ handle: c.otherHandle, lastText: c.lastText || "", lastAt: c.lastAt, unread: !!(c.lastAt && (!reads[i] || c.lastAt > reads[i])) })) })
  }

  const otherId = await users.getJSON("handle/" + String(handle).toLowerCase())
  if (!otherId) return oops("用户不存在", 404)
  if (otherId === me.id) return oops("不能给自己发私信", 400)
  const cv = convId(me.id, otherId)
  const messages = store("dms")
  const mbase = "dm/" + cv + "/"

  if (req.method === "GET") {
    const since = new URL(req.url).searchParams.get("since")
    const idx = await messages.list({ prefix: mbase })
    const keys = idx.blobs.map((b) => b.key.slice(mbase.length)).sort()
    const pick = since ? keys.filter((k) => k > since) : keys.slice(-60)
    const rows = (await Promise.all(pick.map((k) => messages.getJSON(mbase + k)))).filter(Boolean)
    await store("dmread").setJSON("dr/" + me.id + "/" + cv, new Date().toISOString())
    const other = await users.getJSON("user/" + otherId)
    return json({ other: pub(other, handle), messages: rows.map((m) => ({ id: m.id, author: m.fromHandle, mine: m.fromId === me.id, body: m.body, createdAt: m.createdAt })), cursor: keys.length ? keys[keys.length - 1] : (since || "") })
  }

  if (req.method === "POST") {
    let b
    try { b = await req.json() } catch { return oops("请求体无效") }
    const body = String(b.body || "").trim()
    if (!body) return oops("不能发空消息")
    const id = msgId()
    const now = new Date().toISOString()
    const m = { id, fromId: me.id, fromHandle: me.handle, body: body.slice(0, 2000), createdAt: now }
    await messages.setJSON(mbase + id, m)
    const keys = (await messages.list({ prefix: mbase })).blobs.map((x) => x.key.slice(mbase.length)).sort()
    if (keys.length > MAX_KEEP) for (const k of keys.slice(0, keys.length - MAX_KEEP)) await messages.delete(mbase + k)
    const other = await users.getJSON("user/" + otherId)
    const snip = body.slice(0, 60)
    const dmconv = store("dmconv")
    await dmconv.setJSON("dmconv/" + me.id + "/" + otherId, { otherHandle: (other && other.handle) || handle, lastAt: now, lastText: snip })
    await dmconv.setJSON("dmconv/" + otherId + "/" + me.id, { otherHandle: me.handle, lastAt: now, lastText: snip })
    await store("dmread").setJSON("dr/" + me.id + "/" + cv, now)
    await pushNotif(otherId, { type: "dm", text: "@" + me.handle + " 给你发了私信", link: "/dm/" + me.handle, fromHandle: me.handle })
    return json({ message: { id: m.id, author: m.fromHandle, mine: true, body: m.body, createdAt: m.createdAt }, cursor: id })
  }

  if (req.method === "DELETE") {
    if (!mid) return oops("缺少消息编号")
    const m = await messages.getJSON(mbase + mid)
    if (!m) return oops("消息不存在", 404)
    if (m.fromId !== me.id && !isAdmin(me)) return oops("无权删除", 403)
    await messages.delete(mbase + mid)
    return json({ ok: true })
  }

  return oops("方法不允许", 405)
}

export const config = { path: ["/api/dm", "/api/dm/:handle", "/api/dm/:handle/:mid"] }
