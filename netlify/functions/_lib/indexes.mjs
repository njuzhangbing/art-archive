import { collection } from "./collection.mjs"
import { projectRow, characterRow } from "./rows.mjs"
import { postRow } from "./blog.mjs"

/**
 * The list indexes, declared in one place so every endpoint that needs a
 * collection reads through the same cache rather than rescanning the store.
 */
export const projectIndex = collection({ name: "projects", prefix: "project/", project: projectRow })
export const postIndex = collection({ name: "posts", prefix: "post/", project: postRow })
export const characterIndex = collection({ name: "characters", prefix: "char/", project: characterRow })

// Versions carry their whole asset manifest, which the activity page never
// shows — it only ever counts them. Indexing the counts keeps the heavy part
// out of both the index and the scan.
export const versionIndex = collection({
  name: "versions",
  prefix: "version/",
  project: (v) => {
    const assets = v.assets || []
    return {
      id: v.id, projectId: v.projectId,
      authorId: v.authorId, authorHandle: v.authorHandle,
      createdAt: v.createdAt,
      kinds: assets.map((a) => a.kind),
      layers: assets.reduce((n, a) => n + (a.kind === "psd" ? (a.layers || []).length : 0), 0)
    }
  }
})

export const userIndex = collection({
  name: "users",
  prefix: "user/",
  project: (u) => ({
    id: u.id, handle: u.handle, displayName: u.displayName || u.handle,
    bio: u.bio || "", role: u.role, status: u.status,
    avatarUrl: u.avatarKey ? "/media/" + u.avatarKey : null,
    createdAt: u.createdAt
  })
})
