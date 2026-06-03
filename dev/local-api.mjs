import { readdir } from "node:fs/promises"
import { pathToFileURL, fileURLToPath } from "node:url"
import path from "node:path"
import { store } from "../netlify/functions/_lib/store.mjs"

const fnDir = fileURLToPath(new URL("../netlify/functions/", import.meta.url))

function compile(spec) {
  const keys = []
  const body = spec
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/:([A-Za-z0-9_]+)/g, (_, k) => { keys.push(k); return "([^/]+)" })
    .replace(/\*/g, "(.*)")
  return { rx: new RegExp("^" + body + "$"), keys }
}

async function harvestRoutes() {
  const table = []
  let files = []
  try { files = await readdir(fnDir) } catch { return table }
  for (const f of files) {
    if (!f.endsWith(".mjs") || f.startsWith("_")) continue
    const href = pathToFileURL(path.join(fnDir, f)).href + "?bust=" + Date.now()
    let mod
    try { mod = await import(href) } catch (e) { console.error("[local-api] load fail", f, e.message); continue }
    if (typeof mod.default !== "function") continue
    const cfg = mod.config || {}
    const specs = Array.isArray(cfg.path) ? cfg.path : cfg.path ? [cfg.path] : ["/api/" + f.replace(/\.mjs$/, "")]
    for (const s of specs) table.push({ ...compile(s), run: mod.default })
  }
  return table
}

async function toRequest(req, url) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  const headers = new Headers()
  for (const [k, v] of Object.entries(req.headers)) if (v != null) headers.set(k, Array.isArray(v) ? v.join(", ") : v)
  const init = { method: req.method, headers }
  if (chunks.length && req.method !== "GET" && req.method !== "HEAD") init.body = Buffer.concat(chunks)
  return new Request(url.href, init)
}

async function flush(res, response) {
  res.statusCode = response.status
  const cookies = response.headers.getSetCookie ? response.headers.getSetCookie() : []
  if (cookies.length) res.setHeader("set-cookie", cookies)
  response.headers.forEach((v, k) => { if (k.toLowerCase() !== "set-cookie") res.setHeader(k, v) })
  res.end(Buffer.from(await response.arrayBuffer()))
}

async function serveMedia(res, url) {
  const key = decodeURIComponent(url.pathname.slice("/media/".length))
  const files = store("files")
  const data = await files.get(key, { type: "arrayBuffer" })
  if (!data) { res.statusCode = 404; res.end("missing"); return }
  const meta = await files.getMetadata(key)
  res.statusCode = 200
  res.setHeader("content-type", (meta && meta.contentType) || "application/octet-stream")
  res.setHeader("cache-control", "public, max-age=3600")
  res.end(Buffer.from(data))
}

export function localApi() {
  return {
    name: "changshengtian-local-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, "http://localhost")
        if (!url.pathname.startsWith("/api/") && !url.pathname.startsWith("/media/")) return next()
        try {
          if (url.pathname.startsWith("/media/")) return await serveMedia(res, url)
          const routes = await harvestRoutes()
          let hit = null
          for (const r of routes) {
            const m = r.rx.exec(url.pathname)
            if (m) { const params = {}; r.keys.forEach((k, i) => params[k] = decodeURIComponent(m[i + 1] ?? "")); hit = { r, params }; break }
          }
          if (!hit) { res.statusCode = 404; res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ error: "no such route" })); return }
          const request = await toRequest(req, url)
          const response = await hit.r.run(request, { params: hit.params })
          await flush(res, response)
        } catch (e) {
          res.statusCode = 500
          res.setHeader("content-type", "application/json")
          res.end(JSON.stringify({ error: String((e && e.stack) || e) }))
        }
      })
    }
  }
}
