import { parsePsd } from "./psd.js"
import { BASE, remote, bearer } from "./net.js"

const CHUNK = 1_000_000
const DIRECT_MAX = 1_000_000
const TRIES = 4

function nap(ms) { return new Promise((done) => setTimeout(done, ms)) }

function rand() { return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2, 6) }

export function kindOf(file) {
  const name = (file.name || "").toLowerCase()
  if (file.type === "image/vnd.adobe.photoshop" || name.endsWith(".psd")) return "psd"
  if ((file.type || "").startsWith("video/")) return "video"
  return "image"
}

async function whyFail(r, where) {
  let msg = ""
  try { const e = await r.clone().json(); if (e && e.error) msg = e.error } catch {}
  if (!msg) { try { msg = (await r.text()).trim().slice(0, 140) } catch {} }
  return new Error(msg ? (where + "：" + msg) : (where + "失败 " + r.status))
}

async function shove(url, opts, where) {
  // These three endpoints were the only ones talking to the server without
  // going through lib/api.js, so they never learned either of the things the
  // Android build needs: the absolute origin, and the bearer session. In the
  // app a relative /api/upload resolved against the APK's own asset domain,
  // came back as the page shell, and .json() choked on the leading "<".
  const full = url.startsWith("/") ? BASE + url : url
  const tok = bearer.get()
  const req = { ...opts, credentials: remote ? "include" : "same-origin" }
  if (tok) req.headers = { ...(req.headers || {}), authorization: "Bearer " + tok }

  let last
  for (let attempt = 1; attempt <= TRIES; attempt++) {
    let r
    try {
      r = await fetch(full, req)
    } catch (e) {
      last = e instanceof Error ? e : new Error(String(e))
      if (attempt < TRIES) { await nap(500 * attempt); continue }
      throw new Error(where + "：网络中断，文件没传到服务器（" + (last.message || "fetch failed") + "）")
    }
    if (r.ok) return r
    if (r.status > 0 && r.status < 500) throw await whyFail(r, where)
    last = await whyFail(r, where)
    if (attempt < TRIES) await nap(500 * attempt)
  }
  throw last || new Error(where + "失败")
}

async function putBlob(blob, contentType, onDelta) {
  const size = blob.size
  const mb = (size / 1048576).toFixed(1)
  if (size <= DIRECT_MAX) {
    const r = await shove("/api/upload", { method: "POST", headers: { "content-type": contentType || blob.type || "application/octet-stream" }, body: blob }, "上传(" + mb + "MB)")
    onDelta && onDelta(size)
    return (await r.json()).key
  }
  const uid = rand()
  const parts = Math.ceil(size / CHUNK)
  for (let i = 0; i < parts; i++) {
    const slice = blob.slice(i * CHUNK, (i + 1) * CHUNK)
    await shove("/api/upload-chunk?uid=" + uid + "&n=" + i, { method: "POST", body: slice }, "分块 " + (i + 1) + "/" + parts)
    onDelta && onDelta(slice.size)
  }
  const fin = await shove("/api/upload-finalize", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ uid, parts, contentType: contentType || blob.type }) }, "合并(" + mb + "MB)")
  return (await fin.json()).key
}

function loadImage(src) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error("图片读取失败")); im.src = src })
}

async function imagePreview(file, max = 1600) {
  const u = URL.createObjectURL(file)
  try {
    const im = await loadImage(u)
    const f = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight))
    const c = document.createElement("canvas")
    c.width = Math.max(1, Math.round(im.naturalWidth * f))
    c.height = Math.max(1, Math.round(im.naturalHeight * f))
    c.getContext("2d").drawImage(im, 0, 0, c.width, c.height)
    const blob = await new Promise((r) => c.toBlob(r, "image/webp", 0.85))
    return { blob, w: im.naturalWidth, h: im.naturalHeight }
  } finally { URL.revokeObjectURL(u) }
}

function videoPoster(file) {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video")
    v.preload = "metadata"; v.muted = true; v.playsInline = true
    const u = URL.createObjectURL(file)
    let done = false
    const fail = () => { if (done) return; done = true; URL.revokeObjectURL(u); reject(new Error("视频解析失败")) }
    v.addEventListener("loadeddata", () => { try { v.currentTime = Math.min(0.5, (v.duration || 1) / 3) } catch { fail() } })
    v.addEventListener("seeked", async () => {
      if (done) return; done = true
      const max = 1280
      const f = Math.min(1, max / Math.max(v.videoWidth, v.videoHeight))
      const c = document.createElement("canvas")
      c.width = Math.max(1, Math.round(v.videoWidth * f))
      c.height = Math.max(1, Math.round(v.videoHeight * f))
      c.getContext("2d").drawImage(v, 0, 0, c.width, c.height)
      const blob = await new Promise((r) => c.toBlob(r, "image/webp", 0.82))
      URL.revokeObjectURL(u)
      resolve({ blob, w: v.videoWidth, h: v.videoHeight })
    })
    v.addEventListener("error", fail)
    v.src = u
  })
}

export async function buildAsset(file, step = () => {}, onProgress = () => {}) {
  const id = "a_" + rand().slice(0, 8)
  const kind = kindOf(file)
  let sent = 0
  const span = Math.max(file.size, 1)
  const bump = (d) => { sent += d; onProgress(Math.min(sent / span, 1)) }

  if (kind === "psd") {
    step("解析 PSD…")
    let parsed = null
    try { parsed = await parsePsd(file) } catch { parsed = null }
    step("上传源文件…")
    const originalKey = await putBlob(file, "image/vnd.adobe.photoshop", bump)
    let previewKey = null
    const layers = []
    if (parsed) {
      if (parsed.previewBlob) previewKey = await putBlob(parsed.previewBlob, "image/webp")
      let i = 0
      for (const ly of parsed.layers) {
        step("上传图层 " + (++i) + "/" + parsed.layers.length)
        layers.push({ name: ly.name, hidden: ly.hidden, opacity: ly.opacity, w: ly.w, h: ly.h, thumbKey: await putBlob(ly.blob, "image/webp") })
      }
    }
    return { id, kind, filename: file.name, originalKey, previewKey, layers, w: parsed ? parsed.width : 0, h: parsed ? parsed.height : 0, bytes: file.size }
  }

  if (kind === "video") {
    step("抽取封面…")
    let posterKey = null, dims = { w: 0, h: 0 }
    try { const p = await videoPoster(file); posterKey = await putBlob(p.blob, "image/webp"); dims = { w: p.w, h: p.h } } catch {}
    step("上传视频…")
    const originalKey = await putBlob(file, file.type || "video/mp4", bump)
    return { id, kind, filename: file.name, originalKey, posterKey, w: dims.w, h: dims.h, bytes: file.size }
  }

  step("生成预览…")
  let previewKey = null, dims = { w: 0, h: 0 }
  try { const p = await imagePreview(file); previewKey = await putBlob(p.blob, "image/webp"); dims = { w: p.w, h: p.h } } catch {}
  step("上传原图…")
  const originalKey = await putBlob(file, file.type || "image/png", bump)
  return { id, kind, filename: file.name, originalKey, previewKey: previewKey || originalKey, w: dims.w, h: dims.h, bytes: file.size }
}
