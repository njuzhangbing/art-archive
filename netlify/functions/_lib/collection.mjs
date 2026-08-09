import { store } from "./store.mjs"

// Bumped whenever the shape of a projected row changes. The cache only
// refreshes when a *record* changes, so after a projection change the stored
// rows would otherwise be served indefinitely — the deployed archive would keep
// handing out the old grade field and never learn about secrecy.
const INDEX_KEY = "_index/v2"

/**
 * True for the cache blob a collection keeps beside its records. Backups and
 * exports walk whole stores and should skip it — it is derived data that
 * rebuilds itself, and a restored copy would only be stale.
 */
export function isIndexKey(key) {
  // Matches superseded versions too, so an older cache left on a deployed
  // archive is skipped by backups rather than restored as if it were data.
  return typeof key === "string" && key.startsWith("_index/")
}

/**
 * A cached list view over a blob collection.
 *
 * Listing a prefix is one round trip and hands back an etag per key, but
 * turning those keys into rows used to cost one more round trip each — so a
 * gallery of 500 projects opened 500 connections to render one page, and the
 * function timed out long before the archive felt large.
 *
 * This keeps the rendered rows in a single blob beside the records. A read
 * lists the prefix, compares each etag against the cached row, and re-reads
 * only the records that actually changed: two round trips in the steady state,
 * plus one per edit since the last read.
 *
 * The etag comparison is also what keeps the cache honest — it is rebuilt from
 * whatever the listing says is really there, so a write that never made it into
 * the index, or a record deleted behind its back, corrects itself on the next
 * read instead of needing every writer to remember to invalidate.
 *
 * `project` must not depend on who is asking: the rows are shared by every
 * reader. Fold in per-viewer fields after this returns.
 */
export function collection({ name, prefix, project }) {
  const s = store(name)

  async function rows() {
    const [listed, cached] = await Promise.all([s.list({ prefix }), s.getJSON(INDEX_KEY)])
    const live = listed.blobs.filter((b) => b.key !== INDEX_KEY)
    const known = new Map(((cached && cached.rows) || []).map((r) => [r.k, r]))
    const present = new Set(live.map((b) => b.key))

    const stale = live.filter((b) => {
      const row = known.get(b.key)
      return !row || row.e !== etagOf(b)
    })
    const vanished = [...known.keys()].filter((k) => !present.has(k))

    if (!stale.length && !vanished.length) return known.size ? [...known.values()].map((r) => r.d) : []

    const refreshed = await Promise.all(stale.map(async (b) => {
      const doc = await s.getJSON(b.key)
      return doc ? { k: b.key, e: etagOf(b), d: project(doc) } : null
    }))

    const merged = new Map(known)
    for (const k of vanished) merged.delete(k)
    for (const row of refreshed) if (row) merged.set(row.k, row)
    // A record can disappear between the listing and the read above.
    for (const b of stale) if (!merged.has(b.key)) merged.delete(b.key)

    const next = { rows: [...merged.values()] }
    // Purely a cache: a write lost to a racing reader costs one extra rebuild,
    // never a wrong answer, so this does not need a conditional write.
    try { await s.setJSON(INDEX_KEY, next) } catch { /* serve the rows anyway */ }

    return next.rows.map((r) => r.d)
  }

  return { rows }
}

function etagOf(blob) {
  return blob.etag || ""
}
