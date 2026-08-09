import { json, oops } from "./_lib/respond.mjs"
import { store } from "./_lib/store.mjs"
import { isIndexKey } from "./_lib/collection.mjs"
import { currentUser, isAdmin } from "./_lib/auth.mjs"

const VAULTS = ["projects", "versions", "characters", "posts", "plans", "stars", "reports", "users", "activity"]

async function dumpVault(name) {
  const s = store(name)
  const idx = await s.list({})
  const out = {}
  for (const b of idx.blobs) {
    if (isIndexKey(b.key)) continue
    try { const v = await s.getJSON(b.key); if (v != null) out[b.key] = v } catch {}
  }
  return out
}

export default async (req) => {
  const me = await currentUser(req)
  if (!me || !isAdmin(me)) return oops("需要管理员权限", 403)

  if (req.method === "GET") {
    const stores = {}
    let tally = 0
    for (const name of VAULTS) {
      stores[name] = await dumpVault(name)
      tally += Object.keys(stores[name]).length
    }
    const stamp = new Date().toISOString()
    const dump = { format: "changshengtian-backup", v: 1, exportedAt: stamp, by: me.handle, records: tally, stores }
    return new Response(JSON.stringify(dump), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": 'attachment; filename="changshengtian-backup-' + stamp.slice(0, 10) + '.json"',
        "cache-control": "no-store"
      }
    })
  }

  if (req.method === "POST") {
    let parcel
    try { parcel = await req.json() } catch { return oops("备份文件无效（不是 JSON）") }
    if (!parcel || parcel.format !== "changshengtian-backup" || !parcel.stores || typeof parcel.stores !== "object") {
      return oops("这不是本站的备份文件")
    }
    const ledger = {}
    let wrote = 0
    for (const name of VAULTS) {
      const bag = parcel.stores[name]
      if (!bag || typeof bag !== "object") continue
      const s = store(name)
      let n = 0
      for (const [k, v] of Object.entries(bag)) {
        if (v == null || isIndexKey(k)) continue
        await s.setJSON(k, v)
        n++; wrote++
      }
      ledger[name] = n
    }
    return json({ ok: true, merged: wrote, detail: ledger })
  }

  return oops("方法不允许", 405)
}

export const config = { path: "/api/admin/backup" }
