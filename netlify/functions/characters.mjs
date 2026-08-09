import { json, oops, freshId } from "./_lib/respond.mjs"
import { store } from "./_lib/store.mjs"
import { characterIndex, projectIndex } from "./_lib/indexes.mjs"
import { characterDigest as digest } from "./_lib/rows.mjs"
import { currentUser, isAdmin } from "./_lib/auth.mjs"
import { cleanSecrecy, redactFor } from "./_lib/classify.mjs"

const PERSONA = ["FULL", "SEMI"]
const MIMICRY = ["MALE", "FEMALE", "HERM", "NONE", "UNKNOWN"]

function lockCode(raw, experimental) {
  let code = String(raw || "").trim().slice(0, 24)
  if (experimental && code) code = "E" + code.slice(1)
  return code
}

function cleanPortraits(raw) {
  return (Array.isArray(raw) ? raw : []).map((p) => ({ id: p.id || "p_" + freshId(5), key: p.key, w: p.w || 0, h: p.h || 0, filename: p.filename || "" })).filter((p) => p.key).slice(0, 24)
}

export default async (req, context) => {
  const me = await currentUser(req)
  if (!me) return oops("未登录", 401)

  const chars = store("characters")
  const id = context && context.params && context.params.id

  if (!id) {
    if (req.method === "GET") {
      const rows = (await characterIndex.rows()).slice()
      rows.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
      return json({ characters: rows.map((r) => redactFor(r, me)) })
    }
    if (req.method === "POST") {
      let b
      try { b = await req.json() } catch { return oops("请求体无效") }
      const name = String(b.name || "").trim()
      if (!name) return oops("请填写角色名")
      const cid = freshId(8)
      const now = new Date().toISOString()
      const portraits = cleanPortraits(b.portraits)
      const experimental = !!b.experimental
      const c = {
        id: cid, ownerId: me.id, ownerHandle: me.handle,
        name: name.slice(0, 80), code: lockCode(b.code, experimental),
        sec: cleanSecrecy(b.sec),
        persona: PERSONA.includes(b.persona) ? b.persona : "FULL",
        mimicry: MIMICRY.includes(b.mimicry) ? b.mimicry : "",
        experimental,
        body: String(b.body || "").slice(0, 20000),
        portraits, coverKey: portraits[0] ? portraits[0].key : null,
        createdAt: now, updatedAt: now
      }
      await chars.setJSON("char/" + cid, c)
      return json({ character: digest(c) })
    }
    return oops("方法不允许", 405)
  }

  const c = await chars.getJSON("char/" + id)
  if (!c) return oops("角色不存在", 404)

  if (req.method === "GET") {
    const involved = (await projectIndex.rows())
      .filter((p) => (p.characters || []).includes(id))
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
      .map((p) => ({ id: p.id, title: p.title, sec: p.sec, coverUrl: p.coverUrl, author: p.author, desc: (p.desc || "").slice(0, 160) }))
    return json({ character: redactFor(digest(c), me), projects: involved, canEdit: c.ownerId === me.id || isAdmin(me) })
  }

  if (c.ownerId !== me.id && !isAdmin(me)) return oops("无权操作此角色", 403)

  if (req.method === "PATCH") {
    let b
    try { b = await req.json() } catch { return oops("请求体无效") }
    if (typeof b.name === "string" && b.name.trim()) c.name = b.name.trim().slice(0, 80)
    if (PERSONA.includes(b.persona)) c.persona = b.persona
    if (typeof b.mimicry === "string") c.mimicry = MIMICRY.includes(b.mimicry) ? b.mimicry : ""
    if (typeof b.experimental === "boolean") c.experimental = b.experimental
    if (typeof b.code === "string") c.code = lockCode(b.code, c.experimental)
    else if (b.experimental === true) c.code = lockCode(c.code, true)
    if (b.sec !== undefined) c.sec = cleanSecrecy(b.sec, c.sec)
    if (typeof b.body === "string") c.body = b.body.slice(0, 20000)
    if (b.portraits !== undefined) {
      c.portraits = cleanPortraits(b.portraits)
      if (!c.portraits.some((p) => p.key === c.coverKey)) c.coverKey = c.portraits[0] ? c.portraits[0].key : null
    }
    if (b.coverKey !== undefined && (c.portraits || []).some((p) => p.key === b.coverKey)) c.coverKey = b.coverKey
    c.updatedAt = new Date().toISOString()
    await chars.setJSON("char/" + id, c)
    return json({ character: digest(c) })
  }

  if (req.method === "DELETE") {
    const files = store("files")
    for (const p of c.portraits || []) if (p.key) await files.delete(p.key)
    await chars.delete("char/" + id)
    const projects = store("projects")
    const pidx = await projects.list({ prefix: "project/" })
    for (const bl of pidx.blobs) {
      const p = await projects.getJSON(bl.key)
      if (p && (p.characters || []).includes(id)) { p.characters = p.characters.filter((x) => x !== id); await projects.setJSON(bl.key, p) }
    }
    return json({ ok: true })
  }

  return oops("方法不允许", 405)
}

export const config = { path: ["/api/characters", "/api/characters/:id"] }
