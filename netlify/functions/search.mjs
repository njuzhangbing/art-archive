import { json, oops } from "./_lib/respond.mjs"
import { store } from "./_lib/store.mjs"
import { currentUser, isAdmin } from "./_lib/auth.mjs"
import { secrecyOf, canRead } from "./_lib/classify.mjs"

function hit(text, q) { return String(text || "").toLowerCase().includes(q) }

function snippet(text, q, n = 90) {
  const s = String(text || "").replace(/\[\[[注引]:[^\]]+\]\]/g, "").replace(/\s+/g, " ").trim()
  const i = s.toLowerCase().indexOf(q)
  if (i < 0) return s.slice(0, n)
  const start = Math.max(0, i - 26)
  return (start > 0 ? "…" : "") + s.slice(start, start + n)
}

async function rows(name, prefix) {
  const s = store(name)
  const idx = await s.list({ prefix })
  return (await Promise.all(idx.blobs.map((b) => s.getJSON(b.key)))).filter(Boolean)
}

export default async (req) => {
  const me = await currentUser(req)
  if (!me) return oops("未登录", 401)
  const q = (new URL(req.url).searchParams.get("q") || "").trim().toLowerCase()
  const out = { q, projects: [], characters: [], posts: [], users: [], threads: [] }
  if (!q) return json(out)
  const cap = 8

  const [pj, ch, po, us, th] = await Promise.all([
    rows("projects", "project/"), rows("characters", "char/"),
    rows("posts", "post/"), rows("users", "user/"), rows("threads", "thread/")
  ])

  out.projects = pj.filter((p) => canRead(p, me) && (hit(p.title, q) || hit(p.desc, q) || hit((p.tags || []).join(" "), q))).slice(0, cap)
    .map((p) => ({ id: p.id, title: p.title, sec: secrecyOf(p), coverUrl: p.coverKey ? "/media/" + p.coverKey : null, snippet: snippet(p.desc, q) }))

  out.characters = ch.filter((c) => canRead(c, me) && (hit(c.name, q) || hit(c.code, q) || hit(c.body, q))).slice(0, cap)
    .map((c) => ({ id: c.id, name: c.name, code: c.code, sec: secrecyOf(c), coverUrl: c.coverKey ? "/media/" + c.coverKey : null, snippet: snippet(c.body, q) }))

  out.posts = po.filter((p) => (!p.hidden || p.authorId === me.id || isAdmin(me)) && (hit(p.title, q) || hit(p.body, q))).slice(0, cap)
    .map((p) => ({ id: p.id, title: p.title, author: p.authorHandle, snippet: snippet(p.body, q) }))

  out.threads = th.filter((t) => hit(t.title, q) || hit(t.body, q)).slice(0, cap)
    .map((t) => ({ id: t.id, cid: t.cid, title: t.title, snippet: snippet(t.body, q) }))

  out.users = us.filter((u) => u.status === "active" && (hit(u.handle, q) || hit(u.displayName, q) || hit(u.bio, q))).slice(0, cap)
    .map((u) => ({ handle: u.handle, displayName: u.displayName || u.handle, avatarUrl: u.avatarKey ? "/media/" + u.avatarKey : null }))

  return json(out)
}

export const config = { path: "/api/search" }
