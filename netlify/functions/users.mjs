import { json, oops } from "./_lib/respond.mjs"
import { store } from "./_lib/store.mjs"
import { currentUser } from "./_lib/auth.mjs"

function pubUser(u) {
  return {
    id: u.id, handle: u.handle, displayName: u.displayName || u.handle,
    role: u.role, bio: u.bio || "", createdAt: u.createdAt,
    avatarUrl: u.avatarKey ? "/media/" + u.avatarKey : null
  }
}

export default async (req, context) => {
  const me = await currentUser(req)
  if (!me) return oops("未登录", 401)
  const users = store("users")
  const handle = context && context.params && context.params.handle

  if (!handle) {
    const idx = await users.list({ prefix: "user/" })
    const rows = (await Promise.all(idx.blobs.map((b) => users.getJSON(b.key)))).filter((u) => u && u.status === "active")
    rows.sort((a, b) => ((a.handleLower || "") < (b.handleLower || "") ? -1 : 1))
    return json({ users: rows.map(pubUser) })
  }

  const id = await users.getJSON("handle/" + String(handle).toLowerCase())
  if (!id) return oops("用户不存在", 404)
  const u = await users.getJSON("user/" + id)
  if (!u || u.status !== "active") return oops("用户不存在", 404)

  const projects = store("projects"), chars = store("characters"), posts = store("posts")
  const [pidx, cidx, postidx] = await Promise.all([
    projects.list({ prefix: "project/" }),
    chars.list({ prefix: "char/" }),
    posts.list({ prefix: "post/" })
  ])
  const prows = (await Promise.all(pidx.blobs.map((b) => projects.getJSON(b.key)))).filter((p) => p && p.ownerId === id)
  const crows = (await Promise.all(cidx.blobs.map((b) => chars.getJSON(b.key)))).filter((c) => c && c.ownerId === id)
  const postrows = (await Promise.all(postidx.blobs.map((b) => posts.getJSON(b.key)))).filter((p) => p && p.authorId === id && !p.hidden && p.kind !== "announcement")
  prows.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
  crows.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
  postrows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))

  return json({
    user: pubUser(u),
    isMe: me.id === id,
    projects: prows.map((p) => ({ id: p.id, title: p.title, grade: p.grade, coverUrl: p.coverKey ? "/media/" + p.coverKey : null, versions: (p.versionIds || []).length, updatedAt: p.updatedAt })),
    characters: crows.map((c) => ({ id: c.id, name: c.name, code: c.code, grade: c.grade, coverUrl: c.coverKey ? "/media/" + c.coverKey : null })),
    posts: postrows.map((p) => ({ id: p.id, title: p.title, createdAt: p.createdAt })),
    stats: { projects: prows.length, characters: crows.length, posts: postrows.length }
  })
}

export const config = { path: ["/api/users", "/api/users/:handle"] }
