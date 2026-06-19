import { zip } from "fflate"
import { api } from "./api.js"

export async function exportAll(onProgress) {
  const enc = new TextEncoder()
  const man = await api.get("/api/admin/export")
  const fileKeys = (await api.get("/api/admin/export?store=__files__").catch(() => ({ keys: [] }))).keys || []

  const files = {}
  files["manifest.json"] = enc.encode(JSON.stringify({ ...man, fileCount: fileKeys.length }, null, 2))

  const total = man.stores.length + fileKeys.length
  let done = 0
  const tick = () => { done++; if (onProgress) onProgress(done, total) }

  for (const name of man.stores) {
    try {
      const r = await api.get("/api/admin/export?store=" + name)
      files["data/" + name + ".json"] = enc.encode(JSON.stringify(r.data || {}))
    } catch (e) {
      files["data/" + name + ".ERROR.txt"] = enc.encode(String((e && e.message) || e))
    }
    tick()
  }

  for (const key of fileKeys) {
    try {
      const res = await fetch("/media/" + key, { credentials: "same-origin" })
      if (res.ok) files["files/" + key] = [new Uint8Array(await res.arrayBuffer()), { level: 0 }]
    } catch (e) { /* skip unreadable file */ }
    tick()
  }

  const packed = await new Promise((resolve, reject) => {
    zip(files, { level: 6 }, (err, data) => (err ? reject(err) : resolve(data)))
  })
  return new Blob([packed], { type: "application/zip" })
}
