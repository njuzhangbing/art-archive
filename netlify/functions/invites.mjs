import { json, oops, freshId } from "./_lib/respond.mjs"
import { store } from "./_lib/store.mjs"
import { currentUser, isAdmin } from "./_lib/auth.mjs"

const coin = () => freshId(4).toUpperCase()

export default async (req) => {
  const me = await currentUser(req)
  if (!me || !isAdmin(me)) return oops("需要管理员权限", 403)

  const invites = store("invites")

  if (req.method === "GET") {
    const idx = await invites.list({ prefix: "code/" })
    const rows = (await Promise.all(idx.blobs.map((b) => invites.getJSON(b.key)))).filter(Boolean)
    rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    return json({ invites: rows })
  }

  if (req.method === "POST") {
    let body = {}
    try { body = await req.json() } catch {}
    if (body.action === "delete" && body.code) {
      await invites.delete("code/" + String(body.code).toUpperCase())
      return json({ ok: true })
    }
    const code = (body.code ? String(body.code).trim().toUpperCase() : coin())
    const inv = {
      code, createdBy: me.handle,
      usesLeft: body.uses != null ? Math.max(1, Number(body.uses) || 1) : 1,
      createdAt: new Date().toISOString(), expiresAt: null
    }
    await invites.setJSON("code/" + code, inv)
    return json({ invite: inv })
  }

  return oops("方法不允许", 405)
}

export const config = { path: "/api/invites" }
