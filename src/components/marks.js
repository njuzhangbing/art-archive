import { h } from "../lib/dom.js"

/**
 * Archival marks: the things a document picks up while it is being handled.
 *
 * Three kinds, scattered around a heading and revealed on scroll:
 *
 *  - **Sublinear text** — a short run of Tangut or of clerical English set very
 *    small above or below the heading. When it comes into view a black bar
 *    wipes across and covers it completely, the way a passage gets struck out
 *    before a file is released.
 *  - **Inspection marks** — rings and ticks drawn as SVG strokes, the loops a
 *    reader leaves in a margin.
 *  - **Hand annotations** — a few words in a casual script, as if pencilled in.
 *
 * Everything is decorative: the layer is inert to the pointer and hidden from
 * assistive technology, and every position is drawn from a seeded generator so
 * a given heading always gets the same marks rather than reshuffling on each
 * paint.
 */

const tame = matchMedia("(prefers-reduced-motion: reduce)").matches

// Tangut. The script the archive's seals are cut in, so the marginalia is in
// the same hand as the stamps.
const TANGUT = [
  "𗼇𗾧", "𘜶𗗚", "𗀔𗾧𘂜", "𗦻𗄊", "𘟩𗓑", "𗌭𘊳𗹦", "𗋽𗤒", "𘃎𗏹",
  "𗐱𗆧𘉦", "𗍁𗤋", "𘋨𗍫", "𗀁𗋔𗊱", "𗄈𗤩", "𘀀𗥃𘄒"
]

const CLERICAL = [
  "ENTERED IN REGISTER", "SEE FILE APPENDIX", "COPY 2 OF 3", "RETAINED",
  "NOT FOR CIRCULATION", "CROSS-REFERENCED", "SUPERSEDED", "VERIFIED BY CLERK",
  "PENDING REVIEW", "ORIGINAL HELD", "MARGINAL NOTE FOLLOWS"
]

const HAND = [
  "checked against the ledger", "cf. vol. II", "see overleaf", "clerk's copy",
  "re-filed 04.iii", "initialled", "held pending", "wrong shelf?",
  "duplicate — destroy", "confirmed"
]

/** Deterministic 32-bit hash, so a heading's marks are stable across paints. */
function seedOf(str) {
  let n = 2166136261
  for (let i = 0; i < str.length; i++) {
    n ^= str.charCodeAt(i)
    n = Math.imul(n, 16777619)
  }
  return n >>> 0
}

/** mulberry32 — small, fast, and repeatable from a seed. */
function rng(seed) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pick = (rand, list) => list[Math.floor(rand() * list.length) % list.length]

/** A ring or a tick, as the loops a reader leaves in a margin. */
function inspectionMark(rand) {
  const kind = rand()
  const w = 60 + rand() * 46
  const hgt = 34 + rand() * 26
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  svg.setAttribute("class", "mk__ring")
  svg.setAttribute("viewBox", "0 0 " + Math.round(w) + " " + Math.round(hgt))
  svg.setAttribute("width", Math.round(w))
  svg.setAttribute("height", Math.round(hgt))
  svg.setAttribute("aria-hidden", "true")

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path")
  const cx = w / 2
  const cy = hgt / 2
  let d

  if (kind < 0.5) {
    // An ellipse drawn by hand never closes cleanly, so it is swept a little
    // past a full turn and left slightly open.
    const rx = w / 2 - 3 - rand() * 4
    const ry = hgt / 2 - 3 - rand() * 3
    const start = rand() * Math.PI * 2
    const sweep = Math.PI * (1.75 + rand() * 0.5)
    const pts = []
    const steps = 26
    for (let i = 0; i <= steps; i++) {
      const t = start + (sweep * i) / steps
      const wob = 1 + (rand() - 0.5) * 0.06
      pts.push([
        (cx + Math.cos(t) * rx * wob).toFixed(1),
        (cy + Math.sin(t) * ry * wob).toFixed(1)
      ])
    }
    d = "M" + pts.map((p) => p.join(",")).join("L")
  } else {
    // A tick: down-stroke and a longer up-stroke.
    const x0 = 6 + rand() * 6
    const y0 = cy
    d = "M" + x0.toFixed(1) + "," + y0.toFixed(1) +
        "L" + (x0 + w * 0.22).toFixed(1) + "," + (hgt - 6).toFixed(1) +
        "L" + (w - 6).toFixed(1) + "," + (5 + rand() * 5).toFixed(1)
  }

  path.setAttribute("d", d)
  svg.append(path)
  // The stroke draws itself in; length is set once the node is measured.
  return { el: svg, path }
}

/**
 * Decorate a heading element with marks.
 *
 * @param {HTMLElement} host  positioned container the marks are placed in
 * @param {string} key        stable identity for the heading (drives the seed)
 * @param {object} [opts]     { density } roughly how many marks to place
 */
export function archivalMarks(host, key, opts = {}) {
  const rand = rng(seedOf(key))
  const layer = h("div", { class: "mk", "aria-hidden": "true" })
  const items = []
  const paths = []

  const density = opts.density ?? 3

  // --- struck-out lines of small text ---
  const strikes = 1 + Math.floor(rand() * 2)
  for (let i = 0; i < strikes; i++) {
    const useTangut = rand() < 0.62
    const text = useTangut ? pick(rand, TANGUT) + " " + pick(rand, TANGUT) : pick(rand, CLERICAL)
    const above = rand() < 0.5
    // Positions travel as custom properties rather than as literal left/top,
    // so the stylesheet can clamp them into a narrow column. Inline geometry
    // cannot be overridden by a media query, which is what forced these to be
    // hidden on small screens instead of simply repositioned.
    const el = h("span", {
      class: "mk__strike" + (useTangut ? " mk__strike--tangut" : ""),
      "data-v": above ? "above" : "below",
      style: [
        "--gap:" + (2 + rand() * 12).toFixed(0) + "px",
        "--mx:" + (rand() * 62).toFixed(1) + "%",
        "--lean:" + (rand() * 2 - 1).toFixed(2) + "deg",
        "--wipe:" + (240 + rand() * 220).toFixed(0) + "ms",
        "--hold:" + (i * 90 + rand() * 160).toFixed(0) + "ms"
      ].join(";")
    }, h("span", { class: "mk__strikeTxt" }, text), h("span", { class: "mk__bar" }))
    layer.append(el)
    items.push(el)
  }

  // --- inspection rings and ticks ---
  const rings = 1 + Math.floor(rand() * density)
  for (let i = 0; i < rings; i++) {
    const { el, path } = inspectionMark(rand)
    el.setAttribute("data-h", rand() < 0.5 ? "left" : "right")
    el.setAttribute("data-v", rand() < 0.5 ? "top" : "bottom")
    el.style.cssText = [
      "--mx:" + (-4 + rand() * 26).toFixed(1) + "%",
      "--my:" + (-26 + rand() * 32).toFixed(0) + "px",
      "--turn:" + (rand() * 16 - 8).toFixed(1) + "deg",
      "--hold:" + (120 + i * 130 + rand() * 200).toFixed(0) + "ms"
    ].join(";")
    layer.append(el)
    items.push(el)
    paths.push(path)
  }

  // --- pencilled hand annotation ---
  if (rand() < 0.8) {
    const el = h("span", {
      class: "mk__hand",
      "data-v": rand() < 0.5 ? "below" : "above",
      "data-h": rand() < 0.5 ? "left" : "right",
      style: [
        "--gap:" + (8 + rand() * 16).toFixed(0) + "px",
        "--mx:" + (2 + rand() * 34).toFixed(1) + "%",
        "--turn:" + (rand() * 7 - 3.5).toFixed(1) + "deg",
        "--hold:" + (260 + rand() * 260).toFixed(0) + "ms"
      ].join(";")
    }, pick(rand, HAND))
    layer.append(el)
    items.push(el)
  }

  host.append(layer)

  // Dash each stroke by its own length so it can be drawn on. Measured now that
  // the nodes are attached, rather than on a frame callback — those never
  // arrive in a background tab, which would leave the strokes undashed.
  paths.forEach((path) => {
    let len = 240
    try { len = path.getTotalLength() || 240 } catch { /* keep the default */ }
    path.style.setProperty("--len", len.toFixed(1))
  })

  const show = () => items.forEach((el) => el.setAttribute("data-on", "1"))

  if (tame) {
    show()
    return { el: layer, destroy() {} }
  }

  // Marks land when the heading they belong to reaches the reader.
  const spy = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return
      reveal()
    })
  }, { rootMargin: "0px 0px -18% 0px", threshold: 0.2 })
  spy.observe(host)

  // A backstop, because the observer is the only thing that would ever reveal
  // these: a tab that is in the background when the heading scrolls past may
  // never deliver the callback, and marks that stay hidden forever are worse
  // than marks that arrive without their cue.
  let done = false
  const backstop = setTimeout(reveal, 6000)
  function reveal() {
    if (done) return
    done = true
    clearTimeout(backstop)
    spy.disconnect()
    show()
  }

  return { el: layer, destroy() { clearTimeout(backstop); spy.disconnect() } }
}
