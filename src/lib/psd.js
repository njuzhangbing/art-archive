import { readPsd } from "ag-psd"

function shrink(canvas, max) {
  const w = canvas.width, hgt = canvas.height
  if (!w || !hgt) return null
  const f = Math.min(1, max / Math.max(w, hgt))
  const out = document.createElement("canvas")
  out.width = Math.max(1, Math.round(w * f))
  out.height = Math.max(1, Math.round(hgt * f))
  out.getContext("2d").drawImage(canvas, 0, 0, out.width, out.height)
  return out
}

function toBlob(canvas, type = "image/webp", q = 0.85) {
  return new Promise((res) => canvas.toBlob((b) => res(b), type, q))
}

function walk(nodes, sink) {
  for (const node of nodes || []) {
    if (node.children && node.children.length) walk(node.children, sink)
    else sink.push(node)
  }
}

export async function parsePsd(file) {
  const buf = await file.arrayBuffer()
  const psd = readPsd(buf, { skipThumbnail: true })
  const flat = []
  walk(psd.children, flat)

  const layers = []
  for (const ly of flat) {
    if (!ly.canvas) continue
    const tc = shrink(ly.canvas, 220)
    if (!tc) continue
    layers.push({
      name: ly.name || "图层",
      hidden: !!ly.hidden,
      opacity: ly.opacity == null ? 1 : ly.opacity,
      w: ly.canvas.width, h: ly.canvas.height,
      blob: await toBlob(tc)
    })
  }

  const comp = psd.canvas ? shrink(psd.canvas, 1600) : null
  return {
    width: psd.width, height: psd.height,
    previewBlob: comp ? await toBlob(comp) : null,
    layers
  }
}
