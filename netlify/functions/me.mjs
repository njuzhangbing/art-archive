import { json, oops } from "./_lib/respond.mjs"
import { store } from "./_lib/store.mjs"
import { currentUser, hashPass, checkPass, shareable } from "./_lib/auth.mjs"

export default async (req) => {
  const me = await currentUser(req)
  if (req.method === "GET") return json({ user: shareable(me) })
  if (!me) return oops("未登录", 401)

  if (req.method === "PATCH") {
    let body
    try { body = await req.json() } catch { return oops("请求体无效") }
    const users = store("users")
    const u = await users.getJSON("user/" + me.id)
    if (typeof body.displayName === "string" && body.displayName.trim()) u.displayName = body.displayName.trim().slice(0, 40)
    if (typeof body.bio === "string") u.bio = body.bio.slice(0, 280)
    if (body.newPassword) {
      if (!(await checkPass(String(body.oldPassword || ""), u.passHash))) return oops("原密码不正确", 403)
      if (String(body.newPassword).length < 8) return oops("新密码至少 8 位")
      u.passHash = await hashPass(String(body.newPassword))
    }
    await users.setJSON("user/" + u.id, u)
    return json({ user: shareable(u) })
  }
  return oops("方法不允许", 405)
}

export const config = { path: "/api/me" }
