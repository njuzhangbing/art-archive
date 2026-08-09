import { h } from "../lib/dom.js"

/**
 * Target acquisition over a still image.
 *
 * Reticles sweep in, settle onto a point, hold, read out a bearing, then
 * release and move to the next — the loop a tower-defence targeting layer runs
 * while it decides what it is looking at. Drawn in SVG over the artwork so it
 * scales with whatever it is laid on.
 *
 * The points are fractions of the frame rather than pixels, so they stay on the
 * same part of the picture at every size. Everything here is decorative: the
 * layer never takes the pointer and is hidden from assistive technology.
 */

const tame = matchMedia("(prefers-reduced-motion: reduce)").matches
const NS = "http://www.w3.org/2000/svg"

const el = (name, attrs = {}) => {
  const n = document.createElementNS(NS, name)
  for (const k in attrs) n.setAttribute(k, attrs[k])
  return n
}

/** Where on the frame the reticles look, as fractions, with a label each. */
const DEFAULT_MARKS = [
  { x: 0.545, y: 0.28, id: "TGT-01", note: "SUBJECT" },
  { x: 0.470, y: 0.235, id: "TGT-02", note: "GESTURE" },
  { x: 0.300, y: 0.52, id: "TGT-03", note: "DRIFT" },
  { x: 0.735, y: 0.46, id: "TGT-04", note: "FIELD" },
  { x: 0.135, y: 0.40, id: "TGT-05", note: "EMBER" }
]

const DWELL_MS = 2100

export function tracker(marks = DEFAULT_MARKS) {
  const svg = el("svg", {
    class: "trk", viewBox: "0 0 1000 600", preserveAspectRatio: "none",
    "aria-hidden": "true", focusable: "false"
  })

  // A faint grid, the way a targeting overlay divides the field it watches.
  const grid = el("g", { class: "trk__grid" })
  for (let i = 1; i < 6; i++) grid.append(el("line", { x1: i * 166.6, y1: 0, x2: i * 166.6, y2: 600 }))
  for (let i = 1; i < 4; i++) grid.append(el("line", { x1: 0, y1: i * 150, x2: 1000, y2: i * 150 }))
  svg.append(grid)

  // The sweep line that crosses the frame between acquisitions.
  const sweep = el("line", { class: "trk__sweep", x1: 0, y1: 0, x2: 0, y2: 600 })
  svg.append(sweep)

  const box = el("g", { class: "trk__box" })
  const corners = ["M-26,-26 L-26,-8 M-26,-26 L-8,-26",
                   "M26,-26 L26,-8 M26,-26 L8,-26",
                   "M-26,26 L-26,8 M-26,26 L-8,26",
                   "M26,26 L26,8 M26,26 L8,26"]
  corners.forEach((d) => box.append(el("path", { class: "trk__corner", d })))
  box.append(el("circle", { class: "trk__ring", r: 34 }))
  box.append(el("line", { class: "trk__cross", x1: -6, y1: 0, x2: 6, y2: 0 }))
  box.append(el("line", { class: "trk__cross", x1: 0, y1: -6, x2: 0, y2: 6 }))

  const lead = el("line", { class: "trk__lead", x1: 26, y1: 0, x2: 92, y2: 0 })
  const tag = el("text", { class: "trk__tag", x: 98, y: -4 })
  const sub = el("text", { class: "trk__sub", x: 98, y: 10 })
  box.append(lead, tag, sub)
  svg.append(box)

  let i = -1
  let timer = null

  function acquire() {
    i = (i + 1) % marks.length
    const m = marks[i]
    const x = m.x * 1000
    const y = m.y * 600

    // Cross the frame to the new bearing, then lock.
    sweep.setAttribute("x1", x)
    sweep.setAttribute("x2", x)
    svg.setAttribute("data-locking", "1")
    box.setAttribute("transform", `translate(${x.toFixed(1)},${y.toFixed(1)})`)
    tag.textContent = m.id
    sub.textContent = m.note + "  " + String(Math.round(m.x * 360)).padStart(3, "0") + "°"

    // The lead line and labels flip to the other side near the right edge so
    // they never run off the frame.
    const flip = m.x > 0.66
    lead.setAttribute("x1", flip ? -26 : 26)
    lead.setAttribute("x2", flip ? -92 : 92)
    tag.setAttribute("x", flip ? -98 : 98)
    sub.setAttribute("x", flip ? -98 : 98)
    tag.setAttribute("text-anchor", flip ? "end" : "start")
    sub.setAttribute("text-anchor", flip ? "end" : "start")

    setTimeout(() => svg.setAttribute("data-locking", "0"), 420)
    timer = setTimeout(acquire, DWELL_MS)
  }

  function start() {
    if (tame) {
      // Settle on the primary subject and stay there.
      i = -1
      acquire()
      clearTimeout(timer)
      timer = null
      return
    }
    if (!timer) acquire()
  }
  function stop() { if (timer) { clearTimeout(timer); timer = null } }

  const onVis = () => (document.hidden ? stop() : start())
  document.addEventListener("visibilitychange", onVis)
  start()

  return {
    el: svg,
    destroy() {
      stop()
      document.removeEventListener("visibilitychange", onVis)
    }
  }
}
