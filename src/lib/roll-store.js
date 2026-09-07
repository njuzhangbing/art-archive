/**
 * The roll's own shelf: shots kept on the device until they are safely away.
 *
 * IndexedDB rather than memory, because the point of the feature is that you
 * can photograph a hundred things in a basement with no signal, close the app,
 * and find the queue still there tomorrow. Blobs go in whole; nothing is
 * base64'd, which would cost a third more space for no reason.
 *
 * A shot leaves the shelf only after the server has acknowledged it. Until
 * then it is the only copy, so nothing here deletes optimistically.
 */

const DB = "tengri-roll"
const SHOTS = "shots"
const VERSION = 1

let open = null

function db() {
  if (open) return open
  open = new Promise((ok, no) => {
    const req = indexedDB.open(DB, VERSION)
    req.onupgradeneeded = () => {
      const d = req.result
      if (!d.objectStoreNames.contains(SHOTS)) {
        const s = d.createObjectStore(SHOTS, { keyPath: "id" })
        s.createIndex("state", "state")
        s.createIndex("shotAt", "shotAt")
      }
    }
    req.onsuccess = () => ok(req.result)
    req.onerror = () => no(req.error || new Error("打不开本地相册"))
  })
  return open
}

function run(mode, fn) {
  return db().then((d) => new Promise((ok, no) => {
    const tx = d.transaction(SHOTS, mode)
    const store = tx.objectStore(SHOTS)
    let out
    try { out = fn(store) } catch (e) { no(e); return }
    tx.oncomplete = () => ok(out && out.result !== undefined ? out.result : out)
    tx.onerror = () => no(tx.error)
    tx.onabort = () => no(tx.error || new Error("写入被中止"))
  }))
}

export const ready = () => typeof indexedDB !== "undefined"

/** States a shot passes through, in order. */
export const WAITING = "waiting"
export const SENDING = "sending"
export const DONE = "done"
export const FAILED = "failed"

export async function add(blob, meta) {
  const id = (Date.now().toString(36) + Math.random().toString(36).slice(2, 8))
  const shot = {
    id, blob,
    mime: meta.mime || blob.type || "image/webp",
    w: meta.w || 0, h: meta.h || 0, bytes: blob.size,
    shotAt: meta.shotAt || new Date().toISOString(),
    state: WAITING, tries: 0, key: null, err: null
  }
  await run("readwrite", (s) => s.put(shot))
  return shot
}

export function all() {
  return run("readonly", (s) => s.getAll()).then((rows) =>
    (rows || []).sort((a, b) => (a.shotAt < b.shotAt ? 1 : -1)))
}

export function get(id) {
  return run("readonly", (s) => s.get(id))
}

export async function patch(id, fields) {
  const cur = await get(id)
  if (!cur) return null
  const next = { ...cur, ...fields }
  await run("readwrite", (s) => s.put(next))
  return next
}

export function remove(id) {
  return run("readwrite", (s) => s.delete(id))
}

/** The oldest shot still owed to the server, or null when the queue is clear. */
export async function nextPending() {
  const rows = await all()
  return rows.filter((r) => r.state === WAITING || r.state === FAILED)
    .sort((a, b) => (a.shotAt < b.shotAt ? -1 : 1))[0] || null
}

export async function tally() {
  const rows = await all()
  const by = { waiting: 0, sending: 0, done: 0, failed: 0 }
  let bytes = 0, owed = 0
  for (const r of rows) {
    by[r.state] = (by[r.state] || 0) + 1
    bytes += r.bytes || 0
    if (r.state !== DONE) owed += r.bytes || 0
  }
  return { total: rows.length, ...by, bytes, owed }
}

/** Clear the shots the server already has. The only safe thing to bulk-delete. */
export async function sweepDone() {
  const rows = await all()
  const gone = rows.filter((r) => r.state === DONE)
  for (const r of gone) await remove(r.id)
  return gone.length
}
