import { json, oops, freshId } from "./_lib/respond.mjs"
import { store } from "./_lib/store.mjs"
import { collection } from "./_lib/collection.mjs"
import { currentUser } from "./_lib/auth.mjs"

/**
 * The photo roll: shots taken in the app, registered here once their bytes are
 * already in storage.
 *
 * This endpoint never carries an image. The client uploads through /api/upload,
 * which hands back a key, and then files a line here saying what that key is.
 * So a roll of two hundred photographs is two hundred small writes and one
 * cheap list — the pictures themselves are fetched from /media, which the edge
 * serves immutable and the app keeps on disk.
 *
 * A roll is private to whoever shot it. There is no listing across members.
 */

/** The row shape, kept as a function so the POST can answer in it too. */
const asRow = (p) => ({
  id: p.id, key: p.key, w: p.w, h: p.h, bytes: p.bytes,
  ownerId: p.ownerId, shotAt: p.shotAt, createdAt: p.createdAt
})

const photoIndex = collection({ name: "photos", prefix: "shot/", project: asRow })

/** One roll should not be able to become the whole archive. */
const CEILING = 2000

export default async (req, context) => {
  const me = await currentUser(req)
  if (!me) return oops("未登录", 401)

  const shots = store("photos")
  const id = context && context.params && context.params.id

  if (!id) {
    if (req.method === "GET") {
      const url = new URL(req.url)
      const limit = Math.min(400, Math.max(1, parseInt(url.searchParams.get("limit") || "200", 10) || 200))
      const rows = (await photoIndex.rows())
        .filter((r) => r.ownerId === me.id)
        .sort((a, b) => (a.shotAt < b.shotAt ? 1 : -1))
        .slice(0, limit)
      return json({ photos: rows })
    }

    if (req.method === "POST") {
      let b
      try { b = await req.json() } catch { return oops("请求体无效") }
      const key = String(b.key || "").trim()
      if (!key || key.length > 200) return oops("缺少文件键")

      const mine = (await photoIndex.rows()).filter((r) => r.ownerId === me.id)
      if (mine.length >= CEILING) return oops("相册已满，请先清理", 409)
      // The client keys each shot; filing the same one twice is a retry, not a
      // second photograph, and must not leave two rows behind.
      const already = mine.find((r) => r.key === key)
      if (already) return json({ photo: already, already: true })

      const pid = freshId(10)
      const now = new Date().toISOString()
      const shot = {
        id: pid, key, ownerId: me.id,
        w: Math.max(0, Math.min(20000, parseInt(b.w, 10) || 0)),
        h: Math.max(0, Math.min(20000, parseInt(b.h, 10) || 0)),
        bytes: Math.max(0, Math.min(80 * 1024 * 1024, parseInt(b.bytes, 10) || 0)),
        shotAt: typeof b.shotAt === "string" && b.shotAt.length <= 40 ? b.shotAt : now,
        createdAt: now
      }
      await shots.setJSON("shot/" + pid, shot)
      return json({ photo: asRow(shot) }, { status: 201 })
    }

    return oops("方法不允许", 405)
  }

  const shot = await shots.getJSON("shot/" + id)
  if (!shot) return oops("没有这张照片", 404)
  if (shot.ownerId !== me.id) return oops("这不是你的照片", 403)

  if (req.method === "DELETE") {
    await shots.delete("shot/" + id)
    // The bytes go too: a roll is the only thing that referred to them.
    try { await store("files").delete(shot.key) } catch { /* already gone */ }
    return json({ ok: true })
  }

  return oops("方法不允许", 405)
}

export const config = { path: ["/api/photos", "/api/photos/:id"] }
