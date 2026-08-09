import { json, oops, bakeCookie, isNative } from "./_lib/respond.mjs"
import { store } from "./_lib/store.mjs"
import { checkPass, signSession, shareable, rateGate, clearRate } from "./_lib/auth.mjs"

export default async (req) => {
  if (req.method !== "POST") return oops("方法不允许", 405)
  let body
  try { body = await req.json() } catch { return oops("请求体无效") }

  const handle = String(body.handle || "").trim().toLowerCase()
  const password = String(body.password || "")
  if (!handle || !password) return oops("请填写用户名与密码")

  const bucket = "login/" + handle
  if (!(await rateGate(bucket))) return oops("尝试过于频繁，请稍后再试", 429)

  const users = store("users")
  const uid = await users.getJSON("handle/" + handle)
  const user = uid ? await users.getJSON("user/" + uid) : null
  const good = user && (await checkPass(password, user.passHash))
  if (!good) return oops("用户名或密码错误", 401)
  if (user.status === "blocked") return oops("账号已被停用", 403)

  await clearRate(bucket)
  const tok = await signSession(user)
  // Only the app is told the token; a script injected into the website sends
  // the site's own Origin and gets the cookie alone, as before.
  const out = isNative(req) ? { user: shareable(user), token: tok } : { user: shareable(user) }
  return json(out, { headers: { "set-cookie": bakeCookie("sess", tok) } })
}

export const config = { path: "/api/login" }
