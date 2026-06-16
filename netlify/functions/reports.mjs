import { json, oops, freshId } from "./_lib/respond.mjs"
import { store } from "./_lib/store.mjs"
import { currentUser, isAdmin } from "./_lib/auth.mjs"

const KINDS = ["project", "character", "post"]

export default async (req, context) => {
  const me = await currentUser(req)
  if (!me) return oops("未登录", 401)
  const reports = store("reports")
  const id = context && context.params && context.params.id

  if (!id) {
    if (req.method === "POST") {
      let body
      try { body = await req.json() } catch { return oops("请求体无效") }
      if (!KINDS.includes(body.kind) || !body.targetId) return oops("参数无效")
      const rid = freshId(8)
      const r = {
        id: rid, kind: body.kind, targetId: String(body.targetId),
        targetTitle: String(body.targetTitle || "").slice(0, 120), reason: String(body.reason || "").slice(0, 500),
        byId: me.id, byHandle: me.handle, resolved: false, createdAt: new Date().toISOString()
      }
      await reports.setJSON("report/" + rid, r)
      return json({ ok: true })
    }
    if (req.method === "GET") {
      if (!isAdmin(me)) return oops("需要管理员权限", 403)
      const idx = await reports.list({ prefix: "report/" })
      const rows = (await Promise.all(idx.blobs.map((b) => reports.getJSON(b.key)))).filter(Boolean)
      rows.sort((a, b) => (a.resolved ? 1 : 0) - (b.resolved ? 1 : 0) || (a.createdAt < b.createdAt ? 1 : -1))
      return json({ reports: rows })
    }
    return oops("方法不允许", 405)
  }

  if (!isAdmin(me)) return oops("需要管理员权限", 403)
  if (req.method === "PATCH") {
    let body
    try { body = await req.json() } catch { return oops("请求体无效") }
    const r = await reports.getJSON("report/" + id)
    if (!r) return oops("举报不存在", 404)
    if (typeof body.resolved === "boolean") r.resolved = body.resolved
    await reports.setJSON("report/" + id, r)
    return json({ report: r })
  }
  if (req.method === "DELETE") { await reports.delete("report/" + id); return json({ ok: true }) }
  return oops("方法不允许", 405)
}

export const config = { path: ["/api/reports", "/api/reports/:id"] }
