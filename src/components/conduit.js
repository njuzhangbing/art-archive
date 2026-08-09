/**
 * The intake conduit.
 *
 * Bundles of line rise out of three terminals standing on a receding floor and
 * fan out across the frame, crossing each other on the way up into the dark.
 * Light runs down them at intervals and lands in a terminal, which flares.
 *
 * It is one canvas: the cabling is static geometry redrawn each frame (twenty
 * one curves is nothing), and only the travelling light actually animates. The
 * depth-of-field at the top is faked with a second wide, faint pass rather than
 * a real blur, which would cost a filter on every frame.
 *
 * `surge()` is the sign-in payoff — every strand fires at once and runs fast.
 */

const tame = matchMedia("(prefers-reduced-motion: reduce)").matches

/** Terminals, placed as fractions of the band's width. */
const NODES = [
  { x: 0.125, label: "ARCHIVE" },
  { x: 0.500, label: "IDENTITY" },
  { x: 0.875, label: "ACCESS" }
]

const PER = 7          // strands per bundle
const SPREAD = 0.155   // how far apart neighbouring strands land at the top
const NODE_Y = 0.845   // top edge of a terminal, as a fraction of band height
const SAMPLES = 26

function bez(p0, p1, p2, p3, t) {
  const u = 1 - t
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t
  return [
    a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
    a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]
  ]
}

/** Lay out the cabling. t runs 0 at the terminal to 1 at the top of the frame. */
function weave() {
  const out = []
  NODES.forEach((n, i) => {
    for (let j = 0; j < PER; j++) {
      const off = j - (PER - 1) / 2
      const foot = n.x + off * 0.007
      const head = n.x + off * SPREAD + (((i * 7 + j * 3) % 5) - 2) * 0.012
      out.push({
        node: i,
        // Straight up out of the terminal first, then away — cabling leaves a
        // rack vertically before it is allowed to bend. The band is short, so
        // the bend has to open early enough that the fans cross inside it.
        p0: [foot, NODE_Y],
        p1: [foot, NODE_Y - 0.30],
        p2: [head + (foot - head) * 0.06, 0.09],
        p3: [head, -0.16],
        speed: 0.62 + ((i + j) % 4) * 0.11,
        wait: 0.3 + ((i * 5 + j * 7) % 13) * 0.42,
        t: -1
      })
    }
  })
  return out
}

export function conduit() {
  const cv = document.createElement("canvas")
  cv.className = "cdt"
  cv.setAttribute("aria-hidden", "true")

  const ctx = cv.getContext("2d")
  const strands = weave()
  const flash = NODES.map(() => 0)

  let W = 0, H = 0, dpr = 1
  let raf = 0, last = 0, surgeT = -1

  function size() {
    const r = cv.getBoundingClientRect()
    if (!r.width || !r.height) return
    dpr = Math.min(devicePixelRatio || 1, 2)
    W = r.width; H = r.height
    cv.width = Math.round(W * dpr)
    cv.height = Math.round(H * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    draw()
  }

  // ---- the floor ----
  function floor() {
    ctx.lineWidth = 1
    ctx.strokeStyle = "rgba(116, 148, 220, .13)"
    ctx.beginPath()
    // Horizontals, spaced wider as they come toward the viewer.
    for (let k = 0; k < 9; k++) {
      const y = (0.70 + Math.pow(k / 8, 1.9) * 0.36) * H
      ctx.moveTo(0, y); ctx.lineTo(W, y)
    }
    // Verticals converging on a point above the frame.
    const vx = 0.5 * W, vy = 0.70 * H
    for (let k = -6; k <= 6; k++) {
      const bx = 0.5 * W + k * 0.115 * W * 1.7
      ctx.moveTo(bx, H)
      ctx.lineTo(vx + (bx - vx) * 0.16, vy)
    }
    ctx.stroke()
  }

  // ---- the cabling ----
  function cables() {
    const g = ctx.createLinearGradient(0, 0, 0, H)
    g.addColorStop(0, "rgba(198, 214, 255, .04)")
    g.addColorStop(0.40, "rgba(206, 220, 255, .20)")
    g.addColorStop(0.84, "rgba(228, 237, 255, .55)")
    g.addColorStop(1, "rgba(228, 237, 255, .12)")

    // Wide faint pass over the upper half only — the strands nearest the
    // camera read as out of focus rather than merely thicker.
    ctx.strokeStyle = "rgba(198, 214, 255, .085)"
    ctx.lineWidth = 3.4
    ctx.beginPath()
    for (const s of strands) trace(s, 0.34, 1)
    ctx.stroke()

    ctx.strokeStyle = g
    ctx.lineWidth = 1.05
    ctx.beginPath()
    for (const s of strands) trace(s, 0, 1)
    ctx.stroke()
  }

  function trace(s, from, to) {
    for (let k = 0; k <= SAMPLES; k++) {
      const t = from + (to - from) * (k / SAMPLES)
      const [x, y] = bez(s.p0, s.p1, s.p2, s.p3, t)
      if (k === 0) ctx.moveTo(x * W, y * H); else ctx.lineTo(x * W, y * H)
    }
  }

  /** The light running down a strand, brightest at its head. */
  function spark(s) {
    if (s.t < 0) return
    ctx.globalCompositeOperation = "lighter"
    const N = 9, LEN = 0.13
    for (let k = 0; k < N; k++) {
      const a = 1 - s.t + LEN * (k / N)
      const b = 1 - s.t + LEN * ((k + 1) / N)
      if (b < 0 || a > 1) continue
      const [x0, y0] = bez(s.p0, s.p1, s.p2, s.p3, Math.min(1, Math.max(0, a)))
      const [x1, y1] = bez(s.p0, s.p1, s.p2, s.p3, Math.min(1, Math.max(0, b)))
      const f = Math.pow(1 - k / N, 1.6)
      ctx.strokeStyle = "rgba(178, 204, 255, " + (0.55 * f).toFixed(3) + ")"
      ctx.lineWidth = 1 + 1.5 * f
      ctx.beginPath()
      ctx.moveTo(x0 * W, y0 * H); ctx.lineTo(x1 * W, y1 * H)
      ctx.stroke()
    }
    ctx.globalCompositeOperation = "source-over"
  }

  // ---- the terminals ----
  function terminals() {
    // Wide enough to hold the label, never wide enough for the outer two to
    // run off a narrow frame.
    const bw = Math.min(Math.max(78, Math.min(0.17 * W, 172)), W * 0.24)
    const bh = 30
    ctx.textBaseline = "middle"
    ctx.font = "600 10px 'Space Mono', ui-monospace, SFMono-Regular, monospace"

    NODES.forEach((n, i) => {
      const f = flash[i]
      const x = Math.max(4, Math.min(n.x * W - bw / 2, W - bw - 4))
      const y = NODE_Y * H

      ctx.fillStyle = "rgba(8, 12, 26, .74)"
      ctx.fillRect(x, y, bw, bh)

      ctx.shadowColor = "rgba(90, 133, 255, " + (0.28 + 0.5 * f).toFixed(3) + ")"
      ctx.shadowBlur = 12 + 20 * f
      ctx.lineWidth = 1
      ctx.strokeStyle = "rgba(216, 228, 255, " + (0.5 + 0.45 * f).toFixed(3) + ")"
      ctx.strokeRect(x + 0.5, y + 0.5, bw - 1, bh - 1)
      ctx.shadowBlur = 0

      ctx.strokeStyle = "rgba(110, 150, 240, " + (0.22 + 0.3 * f).toFixed(3) + ")"
      ctx.strokeRect(x + 3.5, y + 3.5, bw - 7, bh - 7)

      // The plinth it stands on.
      ctx.strokeStyle = "rgba(196, 212, 255, " + (0.24 + 0.24 * f).toFixed(3) + ")"
      ctx.beginPath()
      ctx.moveTo(x + bw * 0.03, y + bh + 6)
      ctx.lineTo(x + bw * 0.97, y + bh + 6)
      ctx.stroke()

      label(n.label, x + bw / 2, y + bh / 2, f)
    })
  }

  /** Letterspaced by hand — canvas letterSpacing is too new to rely on. */
  function label(text, cx, cy, f) {
    const gap = 2.4
    const chars = [...text]
    let w = -gap
    for (const c of chars) w += ctx.measureText(c).width + gap
    let x = cx - w / 2
    ctx.fillStyle = "rgba(122, 158, 255, " + (0.82 + 0.18 * f).toFixed(3) + ")"
    ctx.shadowColor = "rgba(90, 133, 255, .55)"
    ctx.shadowBlur = 8 + 14 * f
    for (const c of chars) {
      ctx.fillText(c, x, cy)
      x += ctx.measureText(c).width + gap
    }
    ctx.shadowBlur = 0
  }

  function draw() {
    if (!W || !H) return
    ctx.clearRect(0, 0, W, H)
    floor()
    cables()
    for (const s of strands) spark(s)
    terminals()
  }

  function step(now) {
    raf = requestAnimationFrame(step)
    const dt = Math.min((now - last) / 1000, 0.05)
    last = now

    const rush = surgeT >= 0 ? 1 + 5 * Math.min(1, surgeT) : 1
    if (surgeT >= 0) surgeT += dt

    for (const s of strands) {
      if (s.t < 0) {
        s.wait -= dt
        if (s.wait <= 0) s.t = 0
        continue
      }
      s.t += dt * s.speed * rush
      if (s.t >= 1) {
        s.t = -1
        s.wait = surgeT >= 0 ? 0.05 : 1.4 + ((s.speed * 97) % 1) * 3.4
        flash[s.node] = 1
      }
    }
    for (let i = 0; i < flash.length; i++) {
      flash[i] = surgeT >= 0 ? Math.max(flash[i], 0.85) : Math.max(0, flash[i] - dt * 2.4)
    }
    draw()
  }

  function start() {
    if (tame || raf) return
    last = performance.now()
    raf = requestAnimationFrame(step)
  }
  function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0 } }

  const ro = new ResizeObserver(size)
  ro.observe(cv)
  const onVis = () => (document.hidden ? stop() : start())
  document.addEventListener("visibilitychange", onVis)

  // Lay the first frame down synchronously — a rAF callback never runs in a
  // backgrounded tab and the band would stay blank.
  queueMicrotask(size)
  start()

  return {
    el: cv,
    /** Everything fires at once and runs hot. Used when a sign-in lands. */
    surge() {
      surgeT = 0
      for (const s of strands) if (s.t < 0) { s.t = 0; s.wait = 0 }
      if (tame) draw()
    },
    destroy() {
      stop()
      ro.disconnect()
      document.removeEventListener("visibilitychange", onVis)
    }
  }
}
