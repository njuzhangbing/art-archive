import { json, oops } from "./_lib/respond.mjs"
import { store } from "./_lib/store.mjs"
import { currentUser } from "./_lib/auth.mjs"

export default async (req) => {
  if (req.method !== "POST") return oops("方法不允许", 405)
  const me = await currentUser(req)
  if (!me) return oops("未登录", 401)
  const url = new URL(req.url)
  const uid = url.searchParams.get("uid")
  const n = url.searchParams.get("n")
  if (!uid || !/^[a-z0-9]{6,}$/i.test(uid) || n == null || !/^\d+$/.test(n)) return oops("分块参数无效")
  const buf = await req.arrayBuffer()
  if (buf.byteLength > 6 * 1024 * 1024) return oops("分块过大", 413)
  await store("uploads").set("tmp/" + uid + "/" + n.padStart(5, "0"), buf)
  return json({ ok: true })
}

export const config = { path: "/api/upload-chunk" }
