import { json, oops, freshId } from "./_lib/respond.mjs"
import { store } from "./_lib/store.mjs"
import { collection } from "./_lib/collection.mjs"
import { currentUser, isAdmin } from "./_lib/auth.mjs"
import { cleanSecrecy, redactFor } from "./_lib/classify.mjs"

/**
 * Programmes — the standing initiatives the archive runs.
 *
 * An entry is usually little more than a title and a link out to wherever the
 * work actually lives, plus a note saying what it is for. Only admins post
 * them; every member reads them. This replaces the activity ledger, which
 * reported numbers nobody acted on.
 */

const progIndex = collection({
  name: "programmes",
  prefix: "prog/",
  project: (p) => ({
    id: p.id, title: p.title, url: p.url || "", note: p.note || "",
    status: p.status || "OPEN", sec: p.sec === "SECRET" ? "SECRET" : "PUBLIC",
    ownerId: p.ownerId, author: p.authorHandle,
    createdAt: p.createdAt, updatedAt: p.updatedAt
  })
})

const STATUS = ["OPEN", "RUNNING", "CLOSED"]

/** Only http(s) links go out from here — no javascript: or data: targets. */
function cleanUrl(raw) {
  const u = String(raw || "").trim()
  if (!u) return ""
  return /^https?:\/\//i.test(u) ? u.slice(0, 500) : ""
}

export default async (req, context) => {
  const me = await currentUser(req)
  if (!me) return oops("未登录", 401)

  const progs = store("programmes")
  const id = context && context.params && context.params.id

  if (!id) {
    if (req.method === "GET") {
      const rows = (await progIndex.rows())
        .slice()
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      return json({ programmes: rows.map((r) => redactFor(r, me, ["note", "url"])) })
    }

    if (req.method === "POST") {
      if (!isAdmin(me)) return oops("仅管理员可发布企划", 403)
      let b
      try { b = await req.json() } catch { return oops("请求体无效") }
      const title = String(b.title || "").trim()
      if (!title) return oops("请填写企划名称")
      const pid = freshId(8)
      const now = new Date().toISOString()
      const p = {
        id: pid, ownerId: me.id, authorHandle: me.handle,
        title: title.slice(0, 120),
        url: cleanUrl(b.url),
        note: String(b.note || "").slice(0, 600),
        status: STATUS.includes(b.status) ? b.status : "OPEN",
        sec: cleanSecrecy(b.sec),
        createdAt: now, updatedAt: now
      }
      await progs.setJSON("prog/" + pid, p)
      return json({ programme: p })
    }
    return oops("方法不允许", 405)
  }

  const p = await progs.getJSON("prog/" + id)
  if (!p) return oops("企划不存在", 404)

  if (req.method === "GET") return json({ programme: redactFor(p, me, ["note", "url"]) })

  if (!isAdmin(me)) return oops("仅管理员可修改企划", 403)

  if (req.method === "PATCH") {
    let b
    try { b = await req.json() } catch { return oops("请求体无效") }
    if (typeof b.title === "string" && b.title.trim()) p.title = b.title.trim().slice(0, 120)
    if (b.url !== undefined) p.url = cleanUrl(b.url)
    if (typeof b.note === "string") p.note = b.note.slice(0, 600)
    if (STATUS.includes(b.status)) p.status = b.status
    if (b.sec !== undefined) p.sec = cleanSecrecy(b.sec, p.sec)
    p.updatedAt = new Date().toISOString()
    await progs.setJSON("prog/" + id, p)
    return json({ programme: p })
  }

  if (req.method === "DELETE") {
    await progs.delete("prog/" + id)
    return json({ ok: true })
  }

  return oops("方法不允许", 405)
}

export const config = { path: ["/api/programmes", "/api/programmes/:id"] }
