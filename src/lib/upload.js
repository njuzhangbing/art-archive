import { parsePsd } from "./psd.js"

const CHUNK = 5 * 1024 * 1024
const DIRECT_MAX = 4 * 1024 * 1024

function rand() { return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2, 6) }

export function kindOf(file) {
  const name = (file.name || "").toLowerCase()
  if (file.type === "image/vnd.adobe.photoshop" || name.endsWith(".psd")) return "psd"
  if ((file.type || "").startsWith("video/")) return "video"
  return "image"
}

async function whyFail(r, where) {
  const e = await r.json().catch(() => null)
  return new Error((e && e.error) ? (where + "：" + e.error) : (where + "失败 " + r.status))
}

async function putBlob(blob, contentType) {
  const size = blob.size
  const mb = (size / 1048576).toFixed(1)
  if (size <= DIRECT_MAX) {
    const r = await fetch("/api/upload", { method: "POST", headers: { "content-type": contentType || blob.type || "application/octet-stream" }, body: blob })
    if (!r.ok) throw await whyFail(r, "上传(" + mb + "MB)")
    return (await r.json()).key
  }
  const uid = rand()
  const parts = Math.ceil(size / CHUNK)
  for (let i = 0; i < parts; i++) {
    const slice = blob.slice(i * CHUNK, (i + 1) * CHUNK)
    const r = await fetch("/api/upload-chunk?uid=" + uid + "&n=" + i, { method: "POST", body: slice })
    if (!r.ok) throw await whyFail(r, "分块 " + (i + 1) + "/" + parts)
  }
  const fin = await fetch("/api/upload-finalize", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ uid, parts, contentType: contentType || blob.type }) })
  if (!fin.ok) throw await whyFail(fin, "合并(" + mb + "MB)")
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

export async function buildAsset(file, step = () => {}) {
  const id = "a_" + rand().slice(0, 8)
  const kind = kindOf(file)

  if (kind === "psd") {
    step("解析 PSD…")
    let parsed = null
    try { parsed = await parsePsd(file) } catch { parsed = null }
    step("上传源文件…")
    const originalKey = await putBlob(file, "image/vnd.adobe.photoshop")
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
    const originalKey = await putBlob(file, file.type || "video/mp4")
    return { id, kind, filename: file.name, originalKey, posterKey, w: dims.w, h: dims.h, bytes: file.size }
  }

  step("生成预览…")
  let previewKey = null, dims = { w: 0, h: 0 }
  try { const p = await imagePreview(file); previewKey = await putBlob(p.blob, "image/webp"); dims = { w: p.w, h: p.h } } catch {}
  step("上传原图…")
  const originalKey = await putBlob(file, file.type || "image/png")
  return { id, kind, filename: file.name, originalKey, previewKey: previewKey || originalKey, w: dims.w, h: dims.h, bytes: file.size }
}
