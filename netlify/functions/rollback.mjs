import { json, oops, freshId } from "./_lib/respond.mjs"
import { store } from "./_lib/store.mjs"
import { currentUser } from "./_lib/auth.mjs"

async function bumpActivity(scope, day) {
  const act = store("activity")
  const k = "act/" + scope + "/" + day
  const cur = (await act.getJSON(k)) || { c: 0 }
  cur.c += 1
  await act.setJSON(k, cur)
}

export default async (req, context) => {
  if (req.method !== "POST") return oops("方法不允许", 405)
  const me = await currentUser(req)
  if (!me) return oops("未登录", 401)

  const pid = context.params.id
  const projects = store("projects")
  const versions = store("versions")
  const p = await projects.getJSON("project/" + pid)
  if (!p) return oops("项目不存在", 404)
  if (p.ownerId !== me.id && me.role !== "admin") return oops("无权操作", 403)

  let body
  try { body = await req.json() } catch { return oops("请求体无效") }
  const vid = body.vid
  const target = await versions.getJSON("version/" + pid + "/" + vid)
  if (!target) return oops("目标版本不存在", 404)

  const targetNum = (p.versionIds || []).indexOf(vid) + 1
  const id = freshId(8)
  const now = new Date().toISOString()
  const v = {
    id, projectId: pid, authorId: me.id, authorHandle: me.handle,
    message: String(body.message || "").slice(0, 200) || ("回滚到 v" + targetNum),
    parentId: p.headVersionId || null, createdAt: now,
    coverAssetId: target.coverAssetId, assets: target.assets, rolledFrom: vid
  }
  await versions.setJSON("version/" + pid + "/" + id, v)

  const cover = (target.assets || []).find((a) => a.id === target.coverAssetId) || (target.assets || [])[0]
  p.versionIds = [...(p.versionIds || []), id]
  p.headVersionId = id
  p.coverKey = cover ? (cover.previewKey || cover.posterKey || cover.originalKey) : p.coverKey
  p.updatedAt = now
  await projects.setJSON("project/" + pid, p)

  const day = now.slice(0, 10)
  await bumpActivity("global", day)
  await bumpActivity("user/" + me.id, day)

  return json({ ok: true, headVersionId: id })
}

export const config = { path: "/api/projects/:id/rollback" }
