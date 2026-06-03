import { json, oops, bakeCookie, freshId } from "./_lib/respond.mjs"
import { store } from "./_lib/store.mjs"
import { hashPass, signSession, shareable } from "./_lib/auth.mjs"

const HANDLE_RX = /^[a-zA-Z0-9_]{3,20}$/

export default async (req) => {
  if (req.method !== "POST") return oops("方法不允许", 405)
  let body
  try { body = await req.json() } catch { return oops("请求体无效") }

  const handle = String(body.handle || "").trim()
  const password = String(body.password || "")
  const displayName = String(body.displayName || "").trim() || handle
  const invite = String(body.invite || "").trim().toUpperCase()

  if (!HANDLE_RX.test(handle)) return oops("用户名需 3–20 位字母、数字或下划线")
  if (password.length < 8) return oops("密码至少 8 位")

  const users = store("users")
  if (await users.getJSON("handle/" + handle.toLowerCase())) return oops("用户名已被占用", 409)

  const roster = await users.list({ prefix: "user/" })
  const firstSoul = !roster.blobs.length

  let status = "pending"
  let role = "member"

  if (firstSoul) {
    status = "active"
    role = "admin"
  } else if (invite) {
    const inv = await store("invites").getJSON("code/" + invite)
    const dead = !inv || (inv.usesLeft != null && inv.usesLeft <= 0) || (inv.expiresAt && Date.parse(inv.expiresAt) < Date.now())
    if (dead) return oops("邀请码无效或已用尽")
    status = "active"
    if (inv.usesLeft != null) { inv.usesLeft -= 1; await store("invites").setJSON("code/" + invite, inv) }
  }

  const id = freshId(10)
  const user = {
    id, handle, handleLower: handle.toLowerCase(), displayName, bio: "",
    passHash: await hashPass(password), role, status, createdAt: new Date().toISOString()
  }
  await users.setJSON("user/" + id, user)
  await users.setJSON("handle/" + handle.toLowerCase(), id)

  if (status !== "active") return json({ pending: true, message: "注册成功，等待管理员审批后即可登录" })

  const tok = await signSession(user)
  return json({ user: shareable(user), firstSoul }, { headers: { "set-cookie": bakeCookie("sess", tok) } })
}

export const config = { path: "/api/register" }
