import { json, oops, bakeCookie, freshId, isNative } from "./_lib/respond.mjs"
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

  if (!HANDLE_RX.test(handle)) return oops("用户名需 3–20 位字母、数字或下划线")
  if (password.length < 8) return oops("密码至少 8 位")

  const users = store("users")
  if (await users.getJSON("handle/" + handle.toLowerCase())) return oops("用户名已被占用", 409)

  const roster = await users.list({ prefix: "user/" })
  const firstSoul = !roster.blobs.length

  // Registration is open: no invite code and no approval queue. The account is
  // usable the moment it is made. The first one still takes the admin role, so
  // there is someone who can block an account after the fact.
  const status = "active"
  const role = firstSoul ? "admin" : "member"

  const id = freshId(10)
  const user = {
    id, handle, handleLower: handle.toLowerCase(), displayName, bio: "",
    passHash: await hashPass(password), role, status, createdAt: new Date().toISOString()
  }
  await users.setJSON("user/" + id, user)
  await users.setJSON("handle/" + handle.toLowerCase(), id)

  const tok = await signSession(user)
  const out = isNative(req)
    ? { user: shareable(user), firstSoul, token: tok }
    : { user: shareable(user), firstSoul }
  return json(out, { headers: { "set-cookie": bakeCookie("sess", tok) } })
}

export const config = { path: "/api/register" }
