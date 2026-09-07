/**
 * Write a layered PSD in the browser.
 *
 * The transparency card is a photograph with a figure standing on it, and the
 * whole point of taking one home as a PSD rather than a PNG is that the two are
 * still separable afterwards. So this writes real layers — not a flattened
 * image with a layer group drawn around it.
 *
 * Only as much of the format as that needs: 8-bit RGB, one or more full-canvas
 * layers with alpha, PackBits on every channel. No masks, no adjustment layers,
 * no colour profile. Photoshop, Photopea, GIMP and Affinity all open the
 * result; anything that reads the composite alone sees the flattened picture.
 *
 * Format reference: Adobe Photoshop File Formats Specification, "Layer and Mask
 * Information Section".
 */

class Sink {
  constructor() { this.parts = []; this.n = 0 }
  raw(u8) { this.parts.push(u8); this.n += u8.length; return this }
  u8(v) { return this.raw(new Uint8Array([v & 255])) }
  u16(v) { return this.raw(new Uint8Array([(v >> 8) & 255, v & 255])) }
  i16(v) { return this.u16(v < 0 ? v + 0x10000 : v) }
  u32(v) {
    return this.raw(new Uint8Array([(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]))
  }
  ascii(s) { return this.raw(new Uint8Array([...s].map((c) => c.charCodeAt(0) & 255))) }
  zeros(k) { return this.raw(new Uint8Array(k)) }
  blob(type = "image/vnd.adobe.photoshop") { return new Blob(this.parts, { type }) }
}

/**
 * PackBits, one scanline at a time.
 *
 * The format wants each row compressed independently and its length recorded,
 * which is also what makes a corrupted row survivable rather than fatal.
 */
function packRow(src, from, len) {
  const out = []
  let i = 0
  while (i < len) {
    // How long is the run starting here?
    let run = 1
    while (i + run < len && run < 128 && src[from + i + run] === src[from + i]) run++
    if (run >= 2) {
      out.push(257 - run, src[from + i])
      i += run
      continue
    }
    // No run: gather literals until one starts.
    let lit = 1
    while (i + lit < len && lit < 128) {
      const a = src[from + i + lit], b = src[from + i + lit + 1]
      if (i + lit + 1 < len && a === b) break
      lit++
    }
    out.push(lit - 1)
    for (let k = 0; k < lit; k++) out.push(src[from + i + k])
    i += lit
  }
  return Uint8Array.from(out)
}

/** One channel of one layer: RLE rows plus the table of their lengths. */
function packChannel(plane, w, h) {
  const rows = []
  const counts = new Uint8Array(h * 2)
  for (let y = 0; y < h; y++) {
    const r = packRow(plane, y * w, w)
    rows.push(r)
    counts[y * 2] = (r.length >> 8) & 255
    counts[y * 2 + 1] = r.length & 255
  }
  let total = counts.length
  for (const r of rows) total += r.length
  const out = new Uint8Array(total)
  out.set(counts, 0)
  let at = counts.length
  for (const r of rows) { out.set(r, at); at += r.length }
  return out
}

/** Split RGBA bytes into four planes. */
function planes(rgba, w, h) {
  const n = w * h
  const R = new Uint8Array(n), G = new Uint8Array(n), B = new Uint8Array(n), A = new Uint8Array(n)
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    R[i] = rgba[j]; G[i] = rgba[j + 1]; B[i] = rgba[j + 2]; A[i] = rgba[j + 3]
  }
  return { R, G, B, A }
}

/**
 * The legacy layer name: a Pascal string in a single-byte encoding, padded to
 * four. Anything outside ASCII cannot be spelled here at all, so it is replaced
 * rather than truncated into mojibake — the real name goes in the Unicode block
 * below, which is where a modern reader looks first.
 */
const pascal4 = (name) => {
  const ascii = [...name].map((c) => (c.charCodeAt(0) < 128 ? c.charCodeAt(0) : 95)).slice(0, 255)
  const body = [ascii.length, ...ascii]
  while (body.length % 4) body.push(0)
  return Uint8Array.from(body)
}

/** '8BIM'/'luni': the layer's name in UTF-16, which is what Photoshop shows. */
const luni = (name) => {
  const chars = [...name].map((c) => c.codePointAt(0))
  const body = new Sink()
  body.u32(chars.length)
  for (const c of chars) {
    if (c > 0xFFFF) {
      const v = c - 0x10000
      body.u16(0xD800 + (v >> 10)).u16(0xDC00 + (v & 0x3FF))
    } else body.u16(c)
  }
  if (body.n % 2) body.u8(0)
  const out = new Sink()
  out.ascii("8BIM").ascii("luni").u32(body.n)
  for (const part of body.parts) out.raw(part)
  return out
}

/**
 * @param {{width:number,height:number,layers:Array<{name:string,rgba:Uint8ClampedArray}>,composite:Uint8ClampedArray}} doc
 *   layers are bottom-first; every layer and the composite are full canvas size
 * @returns {Blob}
 */
export function writePSD({ width: w, height: h, layers, composite }) {
  const s = new Sink()

  // ---- header ----
  s.ascii("8BPS").u16(1).zeros(6).u16(3).u32(h).u32(w).u16(8).u16(3)
  s.u32(0)   // colour mode data
  s.u32(0)   // image resources

  // ---- layers ----
  const packed = layers.map((L) => {
    const p = planes(L.rgba, w, h)
    return {
      name: L.name,
      // Alpha first: the spec orders channel records -1, 0, 1, 2.
      chans: [
        { id: -1, data: packChannel(p.A, w, h) },
        { id: 0, data: packChannel(p.R, w, h) },
        { id: 1, data: packChannel(p.G, w, h) },
        { id: 2, data: packChannel(p.B, w, h) }
      ]
    }
  })

  const recs = new Sink()
  recs.i16(packed.length)
  for (const L of packed) {
    recs.u32(0).u32(0).u32(h).u32(w)          // top, left, bottom, right
    recs.u16(L.chans.length)
    for (const c of L.chans) {
      recs.i16(c.id)
      recs.u32(c.data.length + 2)             // + the compression marker
    }
    recs.ascii("8BIM").ascii("norm")
    recs.u8(255).u8(0).u8(1).u8(0)            // opacity, clipping, flags, filler
    const name = pascal4(L.name)
    const uni = luni(L.name)
    recs.u32(4 + 4 + name.length + uni.n)     // extra data length
    recs.u32(0)                               // layer mask
    recs.u32(0)                               // blending ranges
    recs.raw(name)
    for (const part of uni.parts) recs.raw(part)
  }
  for (const L of packed) {
    for (const c of L.chans) { recs.u16(1); recs.raw(c.data) }
  }
  // The layer info block must end on an even byte.
  if (recs.n % 2) recs.u8(0)

  const layerInfoLen = 4 + recs.n            // its own length field + the records
  s.u32(layerInfoLen + 4)                    // layer & mask section: layer info + global mask
  s.u32(recs.n)
  for (const p of recs.parts) s.raw(p)
  s.u32(0)                                   // global layer mask info

  // ---- flattened image ----
  const cp = planes(composite, w, h)
  s.u16(1)
  const merged = [cp.R, cp.G, cp.B].map((pl) => packChannel(pl, w, h))
  // Every channel's row table comes first, then every channel's rows.
  for (const m of merged) s.raw(m.subarray(0, h * 2))
  for (const m of merged) s.raw(m.subarray(h * 2))

  return s.blob()
}

/** Pull RGBA out of a canvas at its own size. */
export function pixelsOf(canvas) {
  const g = canvas.getContext("2d")
  return g.getImageData(0, 0, canvas.width, canvas.height).data
}
