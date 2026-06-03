import { json } from "./_lib/respond.mjs"
import { store } from "./_lib/store.mjs"

export default async () => {
  let blobs = "ok"
  try {
    const probe = store("health")
    await probe.setJSON("ping", { at: new Date().toISOString() })
    const back = await probe.getJSON("ping")
    if (!back) blobs = "empty"
  } catch (err) {
    blobs = "down: " + (err && err.message)
  }
  return json({ ok: true, service: "changshengtian", blobs, now: new Date().toISOString() })
}

export const config = { path: "/api/health" }
