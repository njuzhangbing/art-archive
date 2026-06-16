import { json, oops } from "./_lib/respond.mjs"
import { store } from "./_lib/store.mjs"
import { currentUser, isAdmin, shareable } from "./_lib/auth.mjs"

const RANK = { member: 0, admin: 1, owner: 2 }
const rank = (r) => RANK[r] || 0

export default async (req, context) => {
  const me = await currentUser(req)
  if (!isAdmin(me)) return oops("需要管理员权限", 403)

  const users = store("users")
  const id = context && context.params && context.params.id

  if (req.method === "GET") {
    const idx = await users.list({ prefix: "user/" })
    const rows = (await Promise.all(idx.blobs.map((b) => users.getJSON(b.key)))).filter(Boolean)
    rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    return json({ users: rows.map(shareable), myRank: rank(me.role) })
  }

  if (req.method === "PATCH" && id) {
    let body
    try { body = await req.json() } catch { return oops("请求体无效") }
    const u = await users.getJSON("user/" + id)
    if (!u) return oops("用户不存在", 404)
    if (rank(me.role) <= rank(u.role)) return oops("权限不足，无法操作该用户", 403)
    if (body.status && ["active", "pending", "blocked"].includes(body.status)) u.status = body.status
    if (body.role && ["admin", "member"].includes(body.role)) u.role = body.role
    await users.setJSON("user/" + u.id, u)
    return json({ user: shareable(u) })
  }

  if (req.method === "DELETE" && id) {
    const u = await users.getJSON("user/" + id)
    if (!u) return json({ ok: true })
    if (rank(me.role) <= rank(u.role)) return oops("权限不足，无法操作该用户", 403)
    await users.delete("user/" + id)
    await users.delete("handle/" + u.handleLower)
    return json({ ok: true })
  }

  return oops("方法不允许", 405)
}

export const config = { path: ["/api/admin/users", "/api/admin/users/:id"] }
