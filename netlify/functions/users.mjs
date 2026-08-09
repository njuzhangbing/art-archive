import { json, oops } from "./_lib/respond.mjs"
import { store } from "./_lib/store.mjs"
import { userIndex, projectIndex, characterIndex, postIndex } from "./_lib/indexes.mjs"
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
    const rows = (await userIndex.rows())
      .filter((u) => u.status === "active")
      .sort((a, b) => (a.handle.toLowerCase() < b.handle.toLowerCase() ? -1 : 1))
    return json({ users: rows.map(pubUser) })
  }

  const id = await users.getJSON("handle/" + String(handle).toLowerCase())
  if (!id) return oops("用户不存在", 404)
  const u = await users.getJSON("user/" + id)
  if (!u || u.status !== "active") return oops("用户不存在", 404)

  const [allProjects, allChars, allPosts] = await Promise.all([
    projectIndex.rows(), characterIndex.rows(), postIndex.rows()
  ])
  const prows = allProjects.filter((p) => p.ownerId === id).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
  const crows = allChars.filter((c) => c.ownerId === id).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
  const postrows = allPosts
    .filter((p) => p.authorId === id && !p.hidden && p.kind !== "announcement")
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))

  const follows = store("follows")
  const [followerCount, followingCount, iFollowRec] = await Promise.all([
    follows.list({ prefix: "follower/" + id + "/" }).then((r) => r.blobs.length),
    follows.list({ prefix: "follow/" + id + "/" }).then((r) => r.blobs.length),
    follows.getJSON("follow/" + me.id + "/" + id)
  ])

  return json({
    user: pubUser(u),
    isMe: me.id === id,
    follow: { followers: followerCount, following: followingCount, iFollow: !!iFollowRec },
    projects: prows.map((p) => ({ id: p.id, title: p.title, sec: p.sec, coverUrl: p.coverUrl, versions: p.versions, updatedAt: p.updatedAt })),
    characters: crows.map((c) => ({ id: c.id, name: c.name, code: c.code, sec: c.sec, coverUrl: c.coverUrl })),
    posts: postrows.map((p) => ({ id: p.id, title: p.title, createdAt: p.createdAt })),
    stats: { projects: prows.length, characters: crows.length, posts: postrows.length }
  })
}

export const config = { path: ["/api/users", "/api/users/:handle"] }
