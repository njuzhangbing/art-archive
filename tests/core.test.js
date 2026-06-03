import { describe, it, expect, beforeAll } from "vitest"
import os from "node:os"
import path from "node:path"
import { promises as fs } from "node:fs"

let store, hashPass, checkPass

beforeAll(async () => {
  process.env.LOCAL_BLOBS_DIR = await fs.mkdtemp(path.join(os.tmpdir(), "cst-"))
  delete process.env.NETLIFY
  delete process.env.NETLIFY_BLOBS_CONTEXT
  ;({ store } = await import("../netlify/functions/_lib/store.mjs"))
  ;({ hashPass, checkPass } = await import("../netlify/functions/_lib/auth.mjs"))
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

  it("stores binary with contentType metadata", async () => {
    const s = store("t_files")
    const buf = new Uint8Array([1, 2, 3, 4]).buffer
    await s.set("f1", buf, { contentType: "image/webp" })
    const back = await s.get("f1", { type: "arrayBuffer" })
    expect(Array.from(new Uint8Array(back))).toEqual([1, 2, 3, 4])
    expect((await s.getMetadata("f1")).contentType).toBe("image/webp")
  })
})
