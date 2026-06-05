import { json, oops, freshId } from "./_lib/respond.mjs"
import { store } from "./_lib/store.mjs"
import { currentUser } from "./_lib/auth.mjs"

const GRADE_KEYS = ["ALEPH", "WAW", "HE", "TETH", "ZAYIN"]

function digest(p, me, starredSet) {
  return {
    id: p.id, title: p.title, desc: p.desc, grade: p.grade, tags: p.tags || [],
    ownerId: p.ownerId, author: p.ownerHandle,
    versions: (p.versionIds || []).length,
    coverUrl: p.coverKey ? "/media/" + p.coverKey : null,
    headVersionId: p.headVersionId || null,
    characters: p.characters || [],
    starCount: p.starCount || 0,
    starred: starredSet ? starredSet.has(p.id) : false,
    isOwn: me ? p.ownerId === me.id : false,
    createdAt: p.createdAt, updatedAt: p.updatedAt
  }
}

function cleanCharRefs(raw) {
  return (Array.isArray(raw) ? raw : []).filter((x) => typeof x === "string").slice(0, 40)
}

function tidyTags(raw) {
  if (Array.isArray(raw)) raw = raw.join(",")
  const seen = new Set()
  return String(raw || "").split(/[,，\s]+/).map((t) => t.trim()).filter((t) => {
    if (!t || seen.has(t.toLowerCase())) return false
    seen.add(t.toLowerCase()); return true
  }).slice(0, 8)
}

export default async (req, context) => {
  const me = await currentUser(req)
  if (!me) return oops("未登录", 401)

  const projects = store("projects")
  const id = context && context.params && context.params.id
  const url = new URL(req.url)

  if (!id) {
    if (req.method === "GET") {
      const idx = await projects.list({ prefix: "project/" })
      let rows = (await Promise.all(idx.blobs.map((b) => projects.getJSON(b.key)))).filter(Boolean)
      if (url.searchParams.get("mine") === "1") rows = rows.filter((p) => p.ownerId === me.id)
      const ch = url.searchParams.get("character")
      if (ch) rows = rows.filter((p) => (p.characters || []).includes(ch))
      rows.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
      const starIdx = await store("stars").list({ prefix: "star/" })
      const mineStar = new Set()
      const tail = "/" + me.id
      for (const b of starIdx.blobs) if (b.key.endsWith(tail)) mineStar.add(b.key.slice(5, b.key.length - tail.length))
      return json({ projects: rows.map((p) => digest(p, me, mineStar)) })
    }
    if (req.method === "POST") {
      let body
      try { body = await req.json() } catch { return oops("请求体无效") }
      const title = String(body.title || "").trim()
      if (!title) return oops("请填写标题")
      const grade = GRADE_KEYS.includes(body.grade) ? body.grade : "ZAYIN"
      const pid = freshId(8)
      const now = new Date().toISOString()
      const p = {
        id: pid, ownerId: me.id, ownerHandle: me.handle,
        title: title.slice(0, 80), desc: String(body.desc || "").slice(0, 500),
        grade, tags: tidyTags(body.tags), characters: cleanCharRefs(body.characters),
        headVersionId: null, versionIds: [], coverKey: null,
        createdAt: now, updatedAt: now
      }
      await projects.setJSON("project/" + pid, p)
      return json({ project: digest(p, me) })
    }
    return oops("方法不允许", 405)
  }

  const p = await projects.getJSON("project/" + id)
  if (!p) return oops("项目不存在", 404)

  if (req.method === "GET") {
    const starred = !!(await store("stars").getJSON("star/" + id + "/" + me.id))
    return json({ project: digest(p, me, starred ? new Set([id]) : null), canEdit: p.ownerId === me.id || me.role === "admin" })
  }

  const owns = p.ownerId === me.id || me.role === "admin"
  if (!owns) return oops("无权操作此项目", 403)

  if (req.method === "PATCH") {
    let body
    try { body = await req.json() } catch { return oops("请求体无效") }
    if (typeof body.title === "string" && body.title.trim()) p.title = body.title.trim().slice(0, 80)
    if (typeof body.desc === "string") p.desc = body.desc.slice(0, 500)
    if (GRADE_KEYS.includes(body.grade)) p.grade = body.grade
    if (body.tags !== undefined) p.tags = tidyTags(body.tags)
    if (body.characters !== undefined) p.characters = cleanCharRefs(body.characters)
    p.updatedAt = new Date().toISOString()
    await projects.setJSON("project/" + id, p)
    return json({ project: digest(p, me) })
  }

  if (req.method === "DELETE") {
    const versions = store("versions")
    const files = store("files")
    for (const vid of p.versionIds || []) {
      const v = await versions.getJSON("version/" + id + "/" + vid)
      if (v) {
        for (const a of v.assets || []) {
          for (const k of [a.originalKey, a.previewKey, a.posterKey, ...(a.layers || []).map((l) => l.thumbKey)]) {
            if (k) await files.delete(k)
          }
        }
      }
      await versions.delete("version/" + id + "/" + vid)
    }
    const starIdx = await store("stars").list({ prefix: "star/" + id + "/" })
    for (const b of starIdx.blobs) await store("stars").delete(b.key)
    await projects.delete("project/" + id)
    return json({ ok: true })
  }

  return oops("方法不允许", 405)
}

export const config = { path: ["/api/projects", "/api/projects/:id"] }
