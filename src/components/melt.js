import { h } from "../lib/dom.js"
import { MELT_VERT, MELT_FRAG } from "../lib/melt-shader.js"

/**
 * The plate beside the contents list, and the melt that carries one image into
 * the next.
 *
 * A vanilla WebGL2 port of the reference transition: the incoming picture is
 * its own displacement map, so the tearing belongs to the image arriving, and
 * the displacement sign flips at the cut so the motion reads as one continuous
 * downward slump rather than a fall and a rebound.
 *
 * Two things differ from the reference, both because this runs inside a page
 * rather than as a full-screen demo:
 *
 *  - It draws only while a transition is in flight. A page that keeps a GPU
 *    loop running behind a document it is not animating is just a battery
 *    drain, so the loop stops as soon as progress lands.
 *  - Without WebGL2, or when the viewer asks for reduced motion, it falls back
 *    to stacked <img> elements and a plain cross-fade. The plate still works;
 *    it simply stops melting.
 */

const tame = matchMedia("(prefers-reduced-motion: reduce)").matches

// The reference implementation's own defaults, so the transition behaves
// exactly as it does in the test bench. Two deliberate departures:
//
//  - `ease` is expo rather than linear. It is one of the bench's own easings
//    and was asked for by name.
//  - `threshold` is raised. Pixel Sort only reorders pixels *darker* than it,
//    and these plates are bright: at the bench's 0.28 the sort reaches 9% of
//    plate-04 and 20% of plate-03, so the effect the parameter exists for was
//    all but invisible. At 0.55 it engages across 40–85% of every plate.
const PARAMS = {
  duration: 0.60,
  displace: 0.35,
  dispBias: 0.00,
  sortSpan: 0.22,
  threshold: 0.55,
  sortMix: 1.00,
  invertAt: 0.50,
  ca: 0.006,
  switchAt: 0.50,
  wash: 0.10
}

/** Reference easing. Nearly all of the travel happens around the cut. */
function expo(t) {
  if (t === 0) return 0
  if (t === 1) return 1
  return t < 0.5
    ? Math.pow(2, 20 * t - 10) / 2
    : (2 - Math.pow(2, -20 * t + 10)) / 2
}

const UNIFORMS = [
  "uTexA", "uTexB", "uRes", "uSizeA", "uSizeB", "uProgress", "uDir",
  "uDisplace", "uDispBias", "uSortSpan", "uThreshold", "uSortMix",
  "uInvertAt", "uCA", "uSwitch", "uWash", "uTime"
]

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const im = new Image()
    im.crossOrigin = "anonymous"
    im.onload = () => resolve(im)
    im.onerror = () => reject(new Error("plate failed: " + src))
    im.src = src
  })
}

/** Stacked images with a cross-fade, for when the GPU path is unavailable. */
function fallbackStage(sources, alts) {
  const layers = sources.map((src, i) => h("img", {
    class: "melt__fallback" + (i === 0 ? " is-on" : ""),
    src, alt: alts[i] || "", loading: i === 0 ? "eager" : "lazy", decoding: "async"
  }))
  const el = h("div", { class: "melt melt--plain" }, ...layers)
  let at = 0
  return {
    el,
    get index() { return at },
    to(next) {
      if (next === at || !layers[next]) return
      layers[at].classList.remove("is-on")
      layers[next].classList.add("is-on")
      at = next
    },
    destroy() {}
  }
}

export function meltStage(sources, alts = []) {
  if (tame || sources.length < 2) return fallbackStage(sources, alts)

  const canvas = h("canvas", { class: "melt__canvas" })
  const el = h("div", { class: "melt" }, canvas)

  const gl = canvas.getContext("webgl2", {
    antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: "high-performance"
  })
  if (!gl) return fallbackStage(sources, alts)

  function compile(type, src) {
    const s = gl.createShader(type)
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s))
    return s
  }

  let program
  try {
    program = gl.createProgram()
    gl.attachShader(program, compile(gl.VERTEX_SHADER, MELT_VERT))
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, MELT_FRAG))
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program))
  } catch (e) {
    console.error("melt shader unavailable, falling back", e)
    return fallbackStage(sources, alts)
  }
  gl.useProgram(program)

  // One oversized triangle covers the viewport with no index buffer.
  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const aPos = gl.getAttribLocation(program, "aPos")
  gl.enableVertexAttribArray(aPos)
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

  const U = {}
  UNIFORMS.forEach((n) => { U[n] = gl.getUniformLocation(program, n) })
  gl.uniform1i(U.uTexA, 0)
  gl.uniform1i(U.uTexB, 1)

  const slides = []
  function makeTexture(img) {
    const t = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, t)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return { tex: t, w: img.naturalWidth || img.width, h: img.naturalHeight || img.height }
  }

  let at = 0
  let target = 0
  let elapsed = 0
  let progress = 0
  let dir = 1
  let playing = false
  let raf = null
  let last = 0
  let dead = false

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2)
    const w = Math.round(el.clientWidth * dpr)
    const h2 = Math.round(el.clientHeight * dpr)
    if (!w || !h2) return false
    if (canvas.width !== w || canvas.height !== h2) {
      canvas.width = w
      canvas.height = h2
      gl.viewport(0, 0, w, h2)
    }
    return true
  }

  function draw(now) {
    if (!slides.length || !resize()) return
    const A = slides[at]
    const B = slides[target] || A
    if (!A || !B) return

    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, A.tex)
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, B.tex)

    gl.uniform2f(U.uRes, canvas.width, canvas.height)
    gl.uniform2f(U.uSizeA, A.w, A.h)
    gl.uniform2f(U.uSizeB, B.w, B.h)
    gl.uniform1f(U.uProgress, progress)
    gl.uniform1f(U.uDir, dir)
    gl.uniform1f(U.uDisplace, PARAMS.displace)
    gl.uniform1f(U.uDispBias, PARAMS.dispBias)
    gl.uniform1f(U.uSortSpan, PARAMS.sortSpan)
    gl.uniform1f(U.uThreshold, PARAMS.threshold)
    gl.uniform1f(U.uSortMix, PARAMS.sortMix)
    gl.uniform1f(U.uInvertAt, PARAMS.invertAt)
    gl.uniform1f(U.uCA, PARAMS.ca)
    gl.uniform1f(U.uSwitch, PARAMS.switchAt)
    gl.uniform1f(U.uWash, PARAMS.wash)
    gl.uniform1f(U.uTime, (now || 0) * 0.001)

    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  function frame(now) {
    if (dead) return
    const dt = Math.min((now - last) / 1000, 0.05)
    last = now
    elapsed = Math.min(1, elapsed + dt / Math.max(PARAMS.duration, 0.05))
    progress = expo(elapsed)
    draw(now)
    if (elapsed >= 1) {
      // Land on the new plate and stop the loop; a still page should not be
      // holding the GPU awake.
      at = target
      elapsed = 0
      progress = 0
      playing = false
      raf = null
      draw(now)
      return
    }
    raf = requestAnimationFrame(frame)
  }

  function to(next) {
    if (dead || !slides.length) return
    const n = ((next % slides.length) + slides.length) % slides.length
    if (n === at && !playing) return
    if (playing) {
      // Snap the in-flight transition home before starting the next one, so a
      // fast scroll cannot leave two melts fighting over the same canvas.
      at = target
      elapsed = 0
      progress = 0
    }
    if (n === at) return
    dir = n > at ? 1 : -1
    target = n
    playing = true
    elapsed = 0
    progress = 0
    last = performance.now()
    if (!raf) raf = requestAnimationFrame(frame)
  }

  // Textures arrive asynchronously; the first plate paints as soon as it lands.
  Promise.all(sources.map((s) => loadImage(s).catch(() => null))).then((imgs) => {
    if (dead) return
    imgs.forEach((im) => { if (im) slides.push(makeTexture(im)) })
    if (slides.length) draw(performance.now())
  })

  const onResize = () => { if (!playing) draw(performance.now()) }
  addEventListener("resize", onResize)

  return {
    el,
    get index() { return at },
    to,
    destroy() {
      dead = true
      removeEventListener("resize", onResize)
      if (raf) cancelAnimationFrame(raf)
      slides.forEach((s) => gl.deleteTexture(s.tex))
      gl.deleteBuffer(buf)
      gl.deleteProgram(program)
      const lose = gl.getExtension("WEBGL_lose_context")
      if (lose) lose.loseContext()
    }
  }
}
