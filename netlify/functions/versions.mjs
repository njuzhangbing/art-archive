import { json, oops, freshId } from "./_lib/respond.mjs"
import { store } from "./_lib/store.mjs"
import { currentUser, isAdmin } from "./_lib/auth.mjs"
import { attachVersion, bumpActivity } from "./_lib/versioning.mjs"

function url(k) { return k ? "/media/" + k : null }

function assetOut(a) {
  return {
    id: a.id, kind: a.kind, filename: a.filename,
    originalUrl: url(a.originalKey),
    previewUrl: url(a.previewKey || a.originalKey),
    posterUrl: url(a.posterKey),
    layers: (a.layers || []).map((l) => ({ name: l.name, hidden: l.hidden, opacity: l.opacity, w: l.w, h: l.h, thumbUrl: url(l.thumbKey) })),
    w: a.w, h: a.h, bytes: a.bytes
  }
}

function versionOut(v) {
  return {
    id: v.id, projectId: v.projectId, author: v.authorHandle, message: v.message,
    parentId: v.parentId, createdAt: v.createdAt, coverAssetId: v.coverAssetId,
    assets: (v.assets || []).map(assetOut)
  }
}

export default async (req, context) => {
  const me = await currentUser(req)
  if (!me) return oops("未登录", 401)

  const pid = context.params.id
  const vid = context.params.vid
  const projects = store("projects")
  const versions = store("versions")
  const p = await projects.getJSON("project/" + pid)
  if (!p) return oops("项目不存在", 404)

  if (vid) {
    const v = await versions.getJSON("version/" + pid + "/" + vid)
    if (!v) return oops("版本不存在", 404)
    return json({ version: versionOut(v) })
  }

  if (req.method === "GET") {
    const raw = await Promise.all((p.versionIds || []).map((id) => versions.getJSON("version/" + pid + "/" + id)))
    const rows = raw.filter(Boolean).map(versionOut).reverse()
    return json({ versions: rows, headVersionId: p.headVersionId, canEdit: p.ownerId === me.id || isAdmin(me) })
  }

  if (req.method === "POST") {
    if (p.ownerId !== me.id && !isAdmin(me)) return oops("无权上传更新", 403)
    let body
    try { body = await req.json() } catch { return oops("请求体无效") }
    const assets = (Array.isArray(body.assets) ? body.assets : []).map((a) => ({ ...a, id: a.id || "a_" + freshId(6) }))
    if (!assets.length) return oops("没有要提交的文件")

    const id = freshId(8)
    const now = new Date().toISOString()
    const cover = assets.find((a) => a.id === body.coverAssetId) || assets.find((a) => a.kind !== "video") || assets[0]
    const v = {
      id, projectId: pid, authorId: me.id, authorHandle: me.handle,
      message: String(body.message || "").slice(0, 200) || "更新", parentId: p.headVersionId || null,
      createdAt: now, coverAssetId: cover ? cover.id : null, assets
    }
    await versions.setJSON("version/" + pid + "/" + id, v)

    await attachVersion(pid, {
      id,
      coverKey: cover ? (cover.previewKey || cover.posterKey || cover.originalKey) : null,
      at: now
    })

    const day = now.slice(0, 10)
    await bumpActivity("global", day)
    await bumpActivity("user/" + me.id, day)

    return json({ version: versionOut(v), headVersionId: id })
  }

  return oops("方法不允许", 405)
}

export const config = { path: ["/api/projects/:id/versions", "/api/projects/:id/versions/:vid"] }
