import { json, oops } from "./_lib/respond.mjs"
import { store, updateJSON } from "./_lib/store.mjs"
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

  // The star itself is one blob per user, so only count it against the project
  // once the write really flipped the state — a double-tapped button otherwise
  // bumps the tally twice for the same star.
  let delta = 0
  if (has) {
    await stars.delete(k)
    delta = -1
  } else {
    const res = await stars.setJSONIf(k, { at: new Date().toISOString() }, { onlyIfNew: true })
    delta = res.modified ? 1 : 0
  }

  const updated = delta === 0
    ? p
    : await updateJSON(projects, "project/" + pid, (doc) => {
      doc.starCount = Math.max(0, (doc.starCount || 0) + delta)
      return doc
    })

  return json({ starred: !has, starCount: (updated || p).starCount || 0 })
}

export const config = { path: "/api/projects/:id/star" }
