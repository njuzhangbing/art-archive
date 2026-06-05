import { json, oops, freshId } from "./_lib/respond.mjs"
import { store } from "./_lib/store.mjs"
import { currentUser } from "./_lib/auth.mjs"

const DATE_RX = /^\d{4}-\d{2}-\d{2}$/

async function userDayStats(userId) {
  const versions = store("versions")
  const idx = await versions.list({ prefix: "version/" })
  const rows = (await Promise.all(idx.blobs.map((b) => versions.getJSON(b.key)))).filter(Boolean)
  const map = {}
  for (const v of rows) {
    if (v.authorId !== userId) continue
    const d = (v.createdAt || "").slice(0, 10)
    if (!d) continue
    if (!map[d]) map[d] = { projects: new Set(), images: 0 }
    map[d].projects.add(v.projectId)
    for (const a of v.assets || []) if (a.kind === "image" || a.kind === "psd") map[d].images++
  }
  return map
}

function resolveItem(it, stat) {
  if (it.kind === "version") return { ...it, done: !!(stat && stat.projects.has(it.projectId)) }
  if (it.kind === "images") { const cur = stat ? stat.images : 0; return { ...it, done: cur >= it.count, progress: cur } }
  return { ...it, done: !!it.checked }
}

function cleanItems(raw) {
  return (Array.isArray(raw) ? raw : []).map((it) => {
    const id = it.id || "i_" + freshId(5)
    if (it.kind === "version" && it.projectId) return { id, kind: "version", projectId: String(it.projectId), projectTitle: String(it.projectTitle || "").slice(0, 80) }
    if (it.kind === "images") return { id, kind: "images", count: Math.max(1, Math.min(999, Number(it.count) || 1)) }
    if (it.kind === "manual") return { id, kind: "manual", text: String(it.text || "").slice(0, 120), checked: !!it.checked }
    return null
  }).filter(Boolean).slice(0, 30)
}

export default async (req) => {
  const me = await currentUser(req)
  if (!me) return oops("未登录", 401)
  const plans = store("plans")
  const url = new URL(req.url)

  if (req.method === "GET") {
    const date = url.searchParams.get("date")
    if (date) {
      if (!DATE_RX.test(date)) return oops("日期无效")
      const plan = (await plans.getJSON("plan/" + me.id + "/" + date)) || { date, items: [] }
      const stats = await userDayStats(me.id)
      return json({ plan: { date, items: (plan.items || []).map((it) => resolveItem(it, stats[date])) } })
    }
    const idx = await plans.list({ prefix: "plan/" + me.id + "/" })
    const rows = (await Promise.all(idx.blobs.map((b) => plans.getJSON(b.key)))).filter(Boolean)
    const stats = await userDayStats(me.id)
    const summary = {}
    for (const pl of rows) {
      const items = (pl.items || []).map((it) => resolveItem(it, stats[pl.date]))
      if (items.length) summary[pl.date] = { total: items.length, done: items.filter((x) => x.done).length }
    }
    return json({ plans: summary })
  }

  if (req.method === "POST") {
    let body
    try { body = await req.json() } catch { return oops("请求体无效") }
    const date = String(body.date || "")
    if (!DATE_RX.test(date)) return oops("日期无效")
    const items = cleanItems(body.items)
    const key = "plan/" + me.id + "/" + date
    if (!items.length) { await plans.delete(key); return json({ plan: { date, items: [] } }) }
    await plans.setJSON(key, { date, items })
    const stats = await userDayStats(me.id)
    return json({ plan: { date, items: items.map((it) => resolveItem(it, stats[date])) } })
  }

  return oops("方法不允许", 405)
}

export const config = { path: "/api/plans" }
