import { describe, it, expect, beforeAll } from "vitest"
import os from "node:os"
import path from "node:path"
import { promises as fs } from "node:fs"

let store, updateJSON, collection, hashPass, checkPass, rateGate, clearRate

beforeAll(async () => {
  process.env.LOCAL_BLOBS_DIR = await fs.mkdtemp(path.join(os.tmpdir(), "cst-"))
  delete process.env.NETLIFY
  delete process.env.NETLIFY_BLOBS_CONTEXT
  ;({ store, updateJSON } = await import("../netlify/functions/_lib/store.mjs"))
  ;({ collection } = await import("../netlify/functions/_lib/collection.mjs"))
  ;({ hashPass, checkPass, rateGate, clearRate } = await import("../netlify/functions/_lib/auth.mjs"))
})

describe("collection index", () => {
  // Counts the per-record reads the index is meant to avoid. The prefix listing
  // and the index blob itself are not what we are trying to save.
  function countReads(s, prefix) {
    const real = s.getJSON.bind(s)
    const seen = { n: 0 }
    s.getJSON = async (k) => { if (k.startsWith(prefix)) seen.n++; return real(k) }
    seen.stop = () => { s.getJSON = real }
    return seen
  }

  async function seed(s, n) {
    for (let i = 0; i < n; i++) await s.setJSON("doc/" + i, { id: String(i), title: "t" + i, heavy: "x".repeat(500) })
  }

  const lens = { name: "t_coll", prefix: "doc/", project: (d) => ({ id: d.id, title: d.title }) }

  it("reads every record once, then serves later calls without touching them", async () => {
    const s = store("t_coll")
    await seed(s, 20)
    const c = collection(lens)

    const cold = countReads(s, "doc/")
    expect((await c.rows()).length).toBe(20)
    expect(cold.n).toBe(20)
    cold.stop()

    const warm = countReads(s, "doc/")
    const again = await c.rows()
    expect(again.length).toBe(20)
    expect(warm.n).toBe(0)
    warm.stop()

    expect(again.find((r) => r.id === "7").title).toBe("t7")
    expect(again[0].heavy).toBeUndefined()
  })

  it("re-reads only the record that changed", async () => {
    const s = store("t_coll2")
    await seed(s, 10)
    const c = collection({ ...lens, name: "t_coll2" })
    await c.rows()

    await s.setJSON("doc/3", { id: "3", title: "renamed" })
    const spy = countReads(s, "doc/")
    const out = await c.rows()
    expect(spy.n).toBe(1)
    spy.stop()
    expect(out.length).toBe(10)
    expect(out.find((r) => r.id === "3").title).toBe("renamed")
  })

  it("drops rows for records deleted behind its back", async () => {
    const s = store("t_coll3")
    await seed(s, 6)
    const c = collection({ ...lens, name: "t_coll3" })
    expect((await c.rows()).length).toBe(6)

    await s.delete("doc/2")
    await s.delete("doc/5")
    const out = await c.rows()
    expect(out.length).toBe(4)
    expect(out.map((r) => r.id).sort()).toEqual(["0", "1", "3", "4"])
  })

  it("picks up records added behind its back", async () => {
    const s = store("t_coll4")
    await seed(s, 3)
    const c = collection({ ...lens, name: "t_coll4" })
    expect((await c.rows()).length).toBe(3)

    await s.setJSON("doc/99", { id: "99", title: "late" })
    const out = await c.rows()
    expect(out.length).toBe(4)
    expect(out.find((r) => r.id === "99").title).toBe("late")
  })

  it("rebuilds from the records when the index blob is lost", async () => {
    const s = store("t_coll5")
    await seed(s, 5)
    const c = collection({ ...lens, name: "t_coll5" })
    await c.rows()

    await s.delete((await s.list({ prefix: "_index/" })).blobs[0].key)
    const out = await c.rows()
    expect(out.length).toBe(5)
  })

  it("keeps the index out of its own rows", async () => {
    const s = store("t_coll6")
    await seed(s, 2)
    const c = collection({ ...lens, name: "t_coll6" })
    await c.rows()
    const listed = await s.list({ prefix: "" })
    expect(listed.blobs.some((b) => b.key.startsWith("_index/"))).toBe(true)
    expect((await c.rows()).length).toBe(2)
  })
})

describe("login rate gate", () => {
  it("counts attempts that arrive together, not just one at a time", async () => {
    const allowed = await Promise.all(Array.from({ length: 20 }, () => rateGate("burst", 8)))
    expect(allowed.filter(Boolean).length).toBe(8)
  })

  it("lets a bucket through again once it is cleared", async () => {
    for (let i = 0; i < 9; i++) await rateGate("serial", 8)
    expect(await rateGate("serial", 8)).toBe(false)
    await clearRate("serial")
    expect(await rateGate("serial", 8)).toBe(true)
  })

  it("ignores attempts that fell out of the window", async () => {
    for (let i = 0; i < 10; i++) await rateGate("aged", 8, 1)
    await new Promise((r) => setTimeout(r, 20))
    expect(await rateGate("aged", 8, 1)).toBe(true)
  })
})

describe("password hashing", () => {
  it("verifies the right password and rejects the wrong one", async () => {
    const stored = await hashPass("eternalsky2026")
    expect(stored).toContain(":")
    expect(await checkPass("eternalsky2026", stored)).toBe(true)
    expect(await checkPass("nope", stored)).toBe(false)
    expect(await checkPass("x", "")).toBe(false)
  })
})

describe("blob store (local fs backend)", () => {
  it("round-trips JSON and lists by prefix", async () => {
    const s = store("t_users")
    await s.setJSON("user/1", { id: "1", handle: "a" })
    await s.setJSON("user/2", { id: "2", handle: "b" })
    expect((await s.getJSON("user/1")).handle).toBe("a")
    const list = await s.list({ prefix: "user/" })
    expect(list.blobs.length).toBe(2)
    await s.delete("user/1")
    expect(await s.getJSON("user/1")).toBe(null)
  })

  it("keeps concurrent counter bumps from overwriting each other", async () => {
    const s = store("t_race")
    await s.setJSON("counter", { n: 0 })
    const settled = await Promise.allSettled(
      Array.from({ length: 12 }, () => updateJSON(s, "counter", (c) => ({ n: c.n + 1 })))
    )
    // Within the retry budget nobody should have to give up...
    expect(settled.every((r) => r.status === "fulfilled")).toBe(true)
    // ...and the stored total must account for every one of them.
    expect((await s.getJSON("counter")).n).toBe(12)
  })

  it("never loses a write that reported success, even past the retry budget", async () => {
    const s = store("t_race")
    await s.setJSON("hot", { n: 0 })
    // Deliberately more writers than the retry budget: some are expected to
    // throw. The invariant is that a throw means "did not write", never
    // "wrote and got clobbered".
    const settled = await Promise.allSettled(
      Array.from({ length: 40 }, () => updateJSON(s, "hot", (c) => ({ n: c.n + 1 }), { tries: 3 }))
    )
    const won = settled.filter((r) => r.status === "fulfilled").length
    expect(won).toBeGreaterThan(0)
    expect((await s.getJSON("hot")).n).toBe(won)
  })

  it("keeps concurrent appends to one array from dropping entries", async () => {
    const s = store("t_race")
    await s.setJSON("log", { items: [] })
    await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        updateJSON(s, "log", (d) => ({ items: [...d.items, i] }))
      )
    )
    const { items } = await s.getJSON("log")
    expect(items.length).toBe(12)
    expect([...items].sort((a, b) => a - b)).toEqual(Array.from({ length: 12 }, (_, i) => i))
  })

  it("seeds a missing key exactly once under concurrency", async () => {
    const s = store("t_race")
    await Promise.all(
      Array.from({ length: 10 }, () =>
        updateJSON(s, "seeded", (c) => ({ n: c.n + 1 }), { seed: { n: 0 } })
      )
    )
    expect((await s.getJSON("seeded")).n).toBe(10)
  })

  it("leaves the value alone when the mutator returns undefined", async () => {
    const s = store("t_race")
    await s.setJSON("untouched", { n: 7 })
    const back = await updateJSON(s, "untouched", () => undefined)
    expect(back.n).toBe(7)
    expect((await s.getJSON("untouched")).n).toBe(7)
  })

  it("stores binary with contentType metadata", async () => {
    const s = store("t_files")
    const buf = new Uint8Array([1, 2, 3, 4]).buffer
    await s.set("f1", buf, { contentType: "image/webp" })
    const back = await s.get("f1", { type: "arrayBuffer" })
    expect(Array.from(new Uint8Array(back))).toEqual([1, 2, 3, 4])
    expect((await s.getMetadata("f1")).contentType).toBe("image/webp")
  })
})

describe("secrecy", () => {
  let secrecyOf, cleanSecrecy, canRead, redactFor

  beforeAll(async () => {
    ;({ secrecyOf, cleanSecrecy, canRead, redactFor } = await import("../netlify/functions/_lib/classify.mjs"))
  })

  it("reads records written before secrecy existed as open", () => {
    // What the deployed archive is full of: a five-tier grade and no `sec`.
    expect(secrecyOf({ grade: "ALEPH", title: "旧档" })).toBe("PUBLIC")
    expect(secrecyOf({ grade: "ZAYIN" })).toBe("PUBLIC")
    expect(secrecyOf({})).toBe("PUBLIC")
    expect(secrecyOf(null)).toBe("PUBLIC")
  })

  it("does not infer secrecy from the old top grade", () => {
    // ALEPH was a label, not a permission — every member could already read it,
    // so promoting it to SECRET would hide work nobody asked to hide.
    expect(canRead({ grade: "ALEPH" }, { id: "someone", role: "member" })).toBe(true)
  })

  it("keeps a closed record from members who are not its owner", () => {
    const doc = { sec: "SECRET", ownerId: "owner" }
    expect(canRead(doc, { id: "owner", role: "member" })).toBe(true)
    expect(canRead(doc, { id: "other", role: "member" })).toBe(false)
    expect(canRead(doc, { id: "boss", role: "admin" })).toBe(true)
    expect(canRead(doc, null)).toBe(false)
  })

  it("withholds the contents rather than leaving them for the page to hide", () => {
    const row = { id: "1", title: "封存件", desc: "涉密说明", sec: "SECRET", ownerId: "owner", coverUrl: "/media/x" }
    const seen = redactFor(row, { id: "other", role: "member" })
    expect(seen.redacted).toBe(true)
    expect(seen.desc).toBe("")
    expect(seen.coverUrl).toBe(null)
    // The reader is still told the file exists — that is the point of a register.
    expect(seen.title).toBe("封存件")

    const owner = redactFor(row, { id: "owner", role: "member" })
    expect(owner.redacted).toBe(false)
    expect(owner.desc).toBe("涉密说明")
  })

  it("falls back rather than storing junk from a client", () => {
    expect(cleanSecrecy("SECRET")).toBe("SECRET")
    expect(cleanSecrecy("ALEPH")).toBe("PUBLIC")
    expect(cleanSecrecy(undefined, "SECRET")).toBe("SECRET")
  })
})
