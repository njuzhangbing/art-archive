import { promises as fs } from "node:fs"
import path from "node:path"

const onCloud = !!(process.env.NETLIFY_BLOBS_CONTEXT || process.env.NETLIFY)
const lair = process.env.LOCAL_BLOBS_DIR || path.join(process.cwd(), ".localblobs")

function asBuffer(v) {
  if (typeof v === "string") return Buffer.from(v)
  if (v instanceof ArrayBuffer) return Buffer.from(v)
  if (ArrayBuffer.isView(v)) return Buffer.from(v.buffer, v.byteOffset, v.byteLength)
  return Buffer.from(v)
}

function diskStore(name) {
  const base = path.join(lair, name)
  const at = (k) => path.join(base, k)
  const ensure = (file) => fs.mkdir(path.dirname(file), { recursive: true })
  return {
    async setJSON(k, val) {
      await this.set(k, JSON.stringify(val), { contentType: "application/json" })
    },
    async getJSON(k) {
      const raw = await this.get(k, { type: "text" })
      return raw == null ? null : JSON.parse(raw)
    },
    async set(k, val, opts = {}) {
      const file = at(k)
      await ensure(file)
      await fs.writeFile(file, asBuffer(val))
      const meta = opts.metadata || (opts.contentType ? { contentType: opts.contentType } : {})
      await fs.writeFile(file + ".meta", JSON.stringify(meta))
    },
    async get(k, opts = {}) {
      let buf
      try { buf = await fs.readFile(at(k)) } catch { return null }
      if (opts.type === "json") return JSON.parse(buf.toString())
      if (opts.type === "arrayBuffer") return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
      if (opts.type === "stream") return buf
      return buf.toString()
    },
    async getMetadata(k) {
      try { return JSON.parse(await fs.readFile(at(k) + ".meta", "utf8")) } catch { return null }
    },
    async delete(k) {
      await fs.rm(at(k), { force: true })
      await fs.rm(at(k) + ".meta", { force: true })
    },
    async list(opts = {}) {
      const prefix = opts.prefix || ""
      const found = []
      const walk = async (dir, rel) => {
        let ents = []
        try { ents = await fs.readdir(dir, { withFileTypes: true }) } catch { return }
        for (const e of ents) {
          const next = rel ? rel + "/" + e.name : e.name
          if (e.isDirectory()) await walk(path.join(dir, e.name), next)
          else if (!e.name.endsWith(".meta") && next.startsWith(prefix)) found.push({ key: next })
        }
      }
      await walk(base, "")
      return { blobs: found }
    }
  }
}

function cloudStore(name) {
  let pending
  const grab = async () => {
    if (!pending) pending = import("@netlify/blobs").then((m) => m.getStore({ name, consistency: "strong" }))
    return pending
  }
  return {
    async setJSON(k, val) { return (await grab()).setJSON(k, val) },
    async getJSON(k) { return (await grab()).get(k, { type: "json" }) },
    async set(k, val, opts = {}) {
      const s = await grab()
      const metadata = opts.metadata || (opts.contentType ? { contentType: opts.contentType } : undefined)
      return s.set(k, val instanceof ArrayBuffer || ArrayBuffer.isView(val) ? val : asBuffer(val), metadata ? { metadata } : undefined)
    },
    async get(k, opts = {}) { return (await grab()).get(k, opts) },
    async getMetadata(k) { const r = await (await grab()).getMetadata(k); return r ? (r.metadata || r) : null },
    async delete(k) { return (await grab()).delete(k) },
    async list(opts = {}) { return (await grab()).list(opts) }
  }
}

const cache = new Map()

export function store(name) {
  if (!cache.has(name)) cache.set(name, onCloud ? cloudStore(name) : diskStore(name))
  return cache.get(name)
}
