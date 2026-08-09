import { describe, it, expect, beforeAll } from "vitest"
import os from "node:os"
import path from "node:path"
import { promises as fs } from "node:fs"

/**
 * Drives the real function handlers end to end against the local blob backend.
 *
 * The unit tests cover the storage primitives; this covers the wiring — that
 * every list endpoint still answers with the shape the frontend reads after
 * being moved onto the cached indexes.
 */

const fns = {}
let cookie = ""

function request(url, { method = "GET", body } = {}) {
  const headers = new Headers()
  if (cookie) headers.set("cookie", cookie)
  const init = { method, headers }
  if (body !== undefined) {
    headers.set("content-type", "application/json")
    init.body = JSON.stringify(body)
  }
  return new Request("http://local" + url, init)
}

async function call(name, url, opts = {}, params = {}) {
  const res = await fns[name](request(url, opts), { params })
  for (const c of (res.headers.getSetCookie ? res.headers.getSetCookie() : [])) {
    if (c.startsWith("sess=")) cookie = c.split(";")[0]
  }
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = text }
  return { status: res.status, data }
}

let pid = ""
let cid = ""

beforeAll(async () => {
  process.env.LOCAL_BLOBS_DIR = await fs.mkdtemp(path.join(os.tmpdir(), "cst-api-"))
  process.env.AUTH_SECRET = "integration-test-secret"
  delete process.env.NETLIFY
  delete process.env.NETLIFY_BLOBS_CONTEXT

  const dir = new URL("../netlify/functions/", import.meta.url)
  for (const n of ["register", "login", "projects", "versions", "star", "posts", "characters", "users", "stats", "search"]) {
    fns[n] = (await import(new URL(n + ".mjs", dir).href)).default
  }

  await call("register", "/api/register", { method: "POST", body: { handle: "tengri", password: "eternalsky2026", displayName: "长生天" } })
  await call("login", "/api/login", { method: "POST", body: { handle: "tengri", password: "eternalsky2026" } })

  const made = await call("projects", "/api/projects", { method: "POST", body: { title: "无题 001", desc: "第一件", sec: "SECRET", tags: "水彩,试作" } })
  pid = made.data.project.id
  for (let i = 2; i <= 6; i++) {
    await call("projects", "/api/projects", { method: "POST", body: { title: "无题 00" + i } })
  }
})

describe("projects", () => {
  it("lists every project with the viewer fields the cards read", async () => {
    const r = await call("projects", "/api/projects")
    expect(r.status).toBe(200)
    expect(r.data.projects.length).toBe(6)
    expect(r.data.projects.every((p) => "starred" in p && "isOwn" in p)).toBe(true)
    expect(r.data.projects[0].author).toBe("tengri")
    expect(r.data.projects[0]).toHaveProperty("coverUrl")
  })

  it("serves a repeat listing identically", async () => {
    const a = await call("projects", "/api/projects")
    const b = await call("projects", "/api/projects")
    expect(b.data.projects.map((p) => p.id).sort()).toEqual(a.data.projects.map((p) => p.id).sort())
  })

  it("shows an edit on the very next listing", async () => {
    await call("projects", "/api/projects/" + pid, { method: "PATCH", body: { title: "改名了" } }, { id: pid })
    const r = await call("projects", "/api/projects")
    expect(r.data.projects.find((p) => p.id === pid).title).toBe("改名了")
  })

  it("filters by owner and by character without dropping rows", async () => {
    const mine = await call("projects", "/api/projects?mine=1")
    expect(mine.data.projects.length).toBe(6)
    const none = await call("projects", "/api/projects?character=nobody")
    expect(none.data.projects.length).toBe(0)
  })
})

describe("versions", () => {
  it("keeps every commit when eight land at once", async () => {
    const commit = (n) => call("versions", "/api/projects/" + pid + "/versions", {
      method: "POST",
      body: { message: "commit " + n, assets: [{ kind: "image", filename: n + ".png", originalKey: "f_" + n, previewKey: "f_" + n }] }
    }, { id: pid })

    await Promise.all([1, 2, 3, 4, 5, 6, 7, 8].map(commit))

    const r = await call("versions", "/api/projects/" + pid + "/versions", {}, { id: pid })
    expect(r.data.versions.length).toBe(8)
    expect(new Set(r.data.versions.map((v) => v.id)).size).toBe(8)
  })

  it("reports the new count on the project listing", async () => {
    const r = await call("projects", "/api/projects")
    expect(r.data.projects.find((p) => p.id === pid).versions).toBe(8)
  })
})

describe("posts", () => {
  it("lists posts without shipping their bodies", async () => {
    await call("posts", "/api/posts", { method: "POST", body: { title: "开幕", body: "# 标题\n\n正文内容 ".repeat(200) } })
    const r = await call("posts", "/api/posts")
    expect(r.status).toBe(200)
    expect(r.data.posts.length).toBe(1)
    expect(r.data.posts[0].body).toBeUndefined()
    expect(r.data.posts[0].excerpt.length).toBeGreaterThan(0)
    expect(r.data.posts[0].canEdit).toBe(true)
  })

  it("still returns the body on a single post", async () => {
    const list = await call("posts", "/api/posts")
    const id = list.data.posts[0].id
    const r = await call("posts", "/api/posts/" + id, {}, { id })
    expect(r.data.post.body.length).toBeGreaterThan(100)
  })
})

describe("characters", () => {
  it("lists characters with an excerpt instead of the full entry", async () => {
    const made = await call("characters", "/api/characters", { method: "POST", body: { name: "无名者", code: "A-001", body: "词条正文 ".repeat(1000) } })
    cid = made.data.character.id
    expect(made.data.character.excerpt.length).toBeGreaterThan(0)

    const r = await call("characters", "/api/characters")
    expect(r.data.characters.length).toBe(1)
    expect(r.data.characters[0].body).toBeUndefined()
    expect(r.data.characters[0].excerpt.length).toBeGreaterThan(0)
    expect(r.data.characters[0].name).toBe("无名者")
  })

  it("still returns the full entry on the detail route", async () => {
    const r = await call("characters", "/api/characters/" + cid, {}, { id: cid })
    expect(r.data.character.body.length).toBeGreaterThan(1000)
    expect(Array.isArray(r.data.projects)).toBe(true)
  })
})

describe("profile and activity", () => {
  it("builds a profile from the indexes", async () => {
    const r = await call("users", "/api/users/tengri", {}, { handle: "tengri" })
    expect(r.status).toBe(200)
    expect(r.data.projects.length).toBe(6)
    expect(r.data.projects[0]).toHaveProperty("coverUrl")
    expect(r.data.projects[0].versions).not.toBeUndefined()
    expect(r.data.characters.length).toBe(1)
  })

  it("lists members", async () => {
    const r = await call("users", "/api/users")
    expect(r.status).toBe(200)
    expect(r.data.users.length).toBeGreaterThanOrEqual(1)
  })

  it("aggregates activity without reading version manifests", async () => {
    const r = await call("stats", "/api/stats")
    expect(r.status).toBe(200)
    expect(r.data.totals.projects).toBe(6)
    expect(r.data.totals.versions).toBe(8)
    expect(r.data.totals.files).toBe(8)
    expect(r.data.grades.SECRET).toBe(1)
    expect(r.data.grades.PUBLIC).toBe(5)
    expect(r.data.types.image).toBe(8)
    expect(Object.values(r.data.daily).reduce((a, b) => a + b, 0)).toBe(8)
    expect(r.data.topProjects[0].versions).toBe(8)
  })
})

describe("search", () => {
  it("still finds records across collections", async () => {
    const r = await call("search", "/api/search?q=" + encodeURIComponent("改名"))
    expect(r.status).toBe(200)
    expect(r.data.projects.length).toBe(1)
    const c = await call("search", "/api/search?q=" + encodeURIComponent("无名者"))
    expect(c.data.characters.length).toBe(1)
  })
})
