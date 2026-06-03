import { json, oops } from "./_lib/respond.mjs"
import { store } from "./_lib/store.mjs"
import { currentUser } from "./_lib/auth.mjs"

const GRADE_KEYS = ["ALEPH", "WAW", "HE", "TETH", "ZAYIN"]

export default async (req) => {
  const me = await currentUser(req)
  if (!me) return oops("未登录", 401)

  const projects = store("projects")
  const versions = store("versions")
  const users = store("users")

  const pIdx = await projects.list({ prefix: "project/" })
  const pRows = (await Promise.all(pIdx.blobs.map((b) => projects.getJSON(b.key)))).filter(Boolean)
  const vIdx = await versions.list({ prefix: "version/" })
  const vRows = (await Promise.all(vIdx.blobs.map((b) => versions.getJSON(b.key)))).filter(Boolean)
  const uIdx = await users.list({ prefix: "user/" })

  const grades = {}
  GRADE_KEYS.forEach((k) => { grades[k] = 0 })
  for (const p of pRows) if (grades[p.grade] != null) grades[p.grade]++

  const types = { image: 0, video: 0, psd: 0 }
  let layers = 0
  let files = 0
  const daily = {}
  const myDaily = {}
  const contrib = {}

  for (const v of vRows) {
    const day = (v.createdAt || "").slice(0, 10)
    if (day) {
      daily[day] = (daily[day] || 0) + 1
      if (v.authorId === me.id) myDaily[day] = (myDaily[day] || 0) + 1
    }
    if (v.authorHandle) contrib[v.authorHandle] = (contrib[v.authorHandle] || 0) + 1
    for (const a of v.assets || []) {
      files++
      if (types[a.kind] != null) types[a.kind]++
      if (a.kind === "psd") layers += (a.layers || []).length
    }
  }

  const topProjects = pRows
    .map((p) => ({ id: p.id, title: p.title, grade: p.grade, versions: (p.versionIds || []).length }))
    .sort((a, b) => b.versions - a.versions)
    .slice(0, 6)

  const topContributors = Object.entries(contrib)
    .map(([handle, count]) => ({ handle, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)

  return json({
    totals: { projects: pRows.length, versions: vRows.length, members: uIdx.blobs.length, layers, files },
    grades, types, daily, myDaily, topProjects, topContributors
  })
}

export const config = { path: "/api/stats" }
