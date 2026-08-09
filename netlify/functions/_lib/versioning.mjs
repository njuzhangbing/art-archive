import { store, updateJSON } from "./store.mjs"

export async function bumpActivity(scope, day) {
  await updateJSON(store("activity"), "act/" + scope + "/" + day, (a) => ({ c: a.c + 1 }), { seed: { c: 0 } })
}

/**
 * Record a freshly written version as the new head of its project.
 *
 * The version blob is already durable by the time this runs — this only moves
 * the project's pointers. It goes through a conditional update because two
 * commits landing at once used to read the same versionIds array and write back
 * rival copies, quietly dropping one project's history entry.
 */
export async function attachVersion(pid, { id, coverKey, at }) {
  return updateJSON(store("projects"), "project/" + pid, (p) => {
    p.versionIds = [...(p.versionIds || []), id]
    p.headVersionId = id
    if (coverKey) p.coverKey = coverKey
    p.updatedAt = at
    return p
  })
}
