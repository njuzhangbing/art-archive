import { api } from "./api.js"

let cache = null
let pending = null

export async function loadDirectory(force) {
  if (cache && !force) return cache
  if (!pending) {
    pending = api.get("/api/users")
      .then((r) => {
        cache = {}
        ;(r.users || []).forEach((u) => { cache[u.handle.toLowerCase()] = u })
        return cache
      })
      .catch(() => (cache = cache || {}))
      .finally(() => { pending = null })
  }
  return pending
}

export function userByHandle(handle) {
  if (!cache || !handle) return null
  return cache[String(handle).toLowerCase()] || null
}

export function allMembers() {
  return cache ? Object.values(cache) : []
}
