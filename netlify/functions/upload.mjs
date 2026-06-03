import { json, oops, freshId } from "./_lib/respond.mjs"
import { store } from "./_lib/store.mjs"
import { currentUser } from "./_lib/auth.mjs"

export default async (req) => {
  if (req.method !== "POST") return oops("方法不允许", 405)
  const me = await currentUser(req)
  if (!me) return oops("未登录", 401)
  const buf = await req.arrayBuffer()
  if (!buf || !buf.byteLength) return oops("空文件")
  if (buf.byteLength > 6 * 1024 * 1024) return oops("超出单次上传限制，请分块", 413)
  const key = "f_" + freshId(12)
  const contentType = req.headers.get("content-type") || "application/octet-stream"
  await store("files").set(key, buf, { contentType })
  return json({ key, bytes: buf.byteLength })
}

export const config = { path: "/api/upload" }
