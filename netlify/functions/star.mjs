import { json, oops } from "./_lib/respond.mjs"
import { store } from "./_lib/store.mjs"
import { currentUser } from "./_lib/auth.mjs"

export default async (req, context) => {
  if (req.method !== "POST") return oops("方法不允许", 405)
  const me = await currentUser(req)
  if (!me) return oops("未登录", 401)

  const pid = context.params.id
  const projects = store("projects")
  const p = await projects.getJSON("project/" + pid)
  if (!p) return oops("项目不存在", 404)
  if (p.ownerId === me.id) return oops("不能收藏自己的项目", 403)

  const stars = store("stars")
  const k = "star/" + pid + "/" + me.id
  const has = await stars.getJSON(k)
  if (has) { await stars.delete(k); p.starCount = Math.max(0, (p.starCount || 0) - 1) }
  else { await stars.setJSON(k, { at: new Date().toISOString() }); p.starCount = (p.starCount || 0) + 1 }
  await projects.setJSON("project/" + pid, p)

  return json({ starred: !has, starCount: p.starCount })
}

export const config = { path: "/api/projects/:id/star" }
