import { json, oops, freshId } from "./_lib/respond.mjs"
import { store } from "./_lib/store.mjs"
import { currentUser } from "./_lib/auth.mjs"

const MAX_MB = Number(process.env.MAX_UPLOAD_MB) || 128
const MAX_BYTES = MAX_MB * 1024 * 1024

export default async (req) => {
  if (req.method !== "POST") return oops("方法不允许", 405)
  const me = await currentUser(req)
  if (!me) return oops("未登录", 401)
  let body
  try { body = await req.json() } catch { return oops("请求体无效") }
  const uid = body.uid
  const parts = Number(body.parts)
  if (!uid || !/^[a-z0-9]{6,}$/i.test(uid) || !parts) return oops("参数无效")

  const uploads = store("uploads")
  const slices = []
  let total = 0
  for (let i = 0; i < parts; i++) {
    const part = await uploads.get("tmp/" + uid + "/" + String(i).padStart(5, "0"), { type: "arrayBuffer" })
    if (!part) return oops("缺少分块 " + i)
    slices.push(new Uint8Array(part))
    total += part.byteLength
  }
  if (total > MAX_BYTES) return oops("文件超过 " + MAX_MB + "MB 上限", 413)

  const merged = new Uint8Array(total)
  let off = 0
  for (const s of slices) { merged.set(s, off); off += s.byteLength }

  const key = "f_" + freshId(12)
  await store("files").set(key, merged.buffer, { contentType: body.contentType || "application/octet-stream" })
  for (let i = 0; i < parts; i++) await uploads.delete("tmp/" + uid + "/" + String(i).padStart(5, "0"))

  return json({ key, bytes: total })
}

export const config = { path: "/api/upload-finalize" }
