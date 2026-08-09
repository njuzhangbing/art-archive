import { json, oops } from "./_lib/respond.mjs"
import { projectIndex, versionIndex, userIndex } from "./_lib/indexes.mjs"
import { currentUser } from "./_lib/auth.mjs"


export default async (req) => {
  const me = await currentUser(req)
  if (!me) return oops("未登录", 401)

  const [pRows, vRows, uRows] = await Promise.all([
    projectIndex.rows(), versionIndex.rows(), userIndex.rows()
  ])

  const grades = { PUBLIC: 0, SECRET: 0 }
  for (const p of pRows) grades[p.sec === "SECRET" ? "SECRET" : "PUBLIC"]++

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
    layers += v.layers || 0
    for (const kind of v.kinds || []) {
      files++
      if (types[kind] != null) types[kind]++
    }
  }

  const topProjects = pRows
    .map((p) => ({ id: p.id, title: p.title, sec: p.sec, versions: p.versions }))
    .sort((a, b) => b.versions - a.versions)
    .slice(0, 6)

  const topContributors = Object.entries(contrib)
    .map(([handle, count]) => ({ handle, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)

  return json({
    totals: { projects: pRows.length, versions: vRows.length, members: uRows.length, layers, files },
    grades, types, daily, myDaily, topProjects, topContributors
  })
}

export const config = { path: "/api/stats" }
