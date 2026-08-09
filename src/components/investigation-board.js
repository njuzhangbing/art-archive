import { h, bi } from "../lib/dom.js"
import { gsap, tame } from "../lib/anim.js"

const PHOTO_HALF = 168
const HALFX = 236
const HALFY = 152
const PAD = 118

function seedFrom(s) {
  let acc = 2166136261
  for (let i = 0; i < s.length; i++) { acc ^= s.charCodeAt(i); acc = Math.imul(acc, 16777619) }
  return acc >>> 0
}

function rng(seed) {
  let a = seed >>> 0
  return () => {
    a += 0x6d2b79f5
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function ringSpots(n) {
  const out = []
  const RX0 = 466, RY0 = 350, SX = 296, SY = 232, MIN = 432
  let done = 0, ring = 1
  while (done < n) {
    const rx = RX0 + (ring - 1) * SX
    const ry = RY0 + (ring - 1) * SY
    const peri = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)))
    const cap = Math.min(Math.max(1, Math.floor(peri / MIN)), n - done)
    const base = cap === 2 ? 0 : -Math.PI / 2 + (ring % 2 ? 0 : Math.PI / cap)
    for (let k = 0; k < cap; k++) {
      const ang = base + (k / cap) * Math.PI * 2
      out.push({ x: Math.cos(ang) * rx, y: Math.sin(ang) * ry })
      done++
    }
    ring++
  }
  return out
}

function buildCluster(p) {
  const roll = rng(seedFrom(p.id || p.title || "x"))
  const tilt = (roll() * 2 - 1) * 5
  const lean = (roll() * 2 - 1) * 3.4
  const tape = ["red", "ink", "kraft"][Math.floor(roll() * 3)]
  const shot = p.coverUrl ? h("img", { src: p.coverUrl, loading: "lazy", alt: "" }) : h("div", { class: "board__nocover mono tiny" }, "无封面")
  const photo = h("div", { class: "board__photo" }, h("span", { class: "board__tape", "data-tape": tape }), shot)
  const memo = h("div", { class: "board__note", style: `--nrot:${lean.toFixed(2)}deg` },
    h("div", { class: "board__notehd serif" }, p.title),
    h("div", { class: "board__notemeta" },
      h("span", { class: "badge badge--fill", "data-sec": p.sec || "PUBLIC" }, h("span", { class: "badge__dot" }), p.sec === "SECRET" ? "保密" : "公开"),
      h("span", { class: "board__by mono tiny" }, "@" + (p.author || "匿名"))),
    p.desc && p.desc.trim() ? h("div", { class: "board__desc" }, p.desc.trim()) : null,
    h("a", { class: "board__open mono", href: "/projects/" + p.id, "data-link": "1" }, "查看档案 →")
  )
  return h("div", { class: "board__cluster", "data-sec": p.sec || "PUBLIC", style: `--rot:${tilt.toFixed(2)}deg` }, photo, memo)
}

function buildHub(who) {
  const face = who.img ? h("img", { src: who.img, alt: who.name || "" }) : h("div", { class: "board__nocover mono tiny" }, "无立绘")
  return h("div", { class: "board__hub", "data-sec": who.sec || "PUBLIC" },
    h("div", { class: "board__hubphoto" }, h("span", { class: "board__pin" }), face),
    h("div", { class: "board__hublabel" },
      who.code ? h("span", { class: "board__hubcode mono" }, who.code) : null,
      h("span", { class: "board__hubname serif" }, who.name || "角色"))
  )
}

export function investigationBoard({ character, projects }) {
  const cramped = matchMedia("(max-width: 760px)").matches
  const clusters = projects.map(buildCluster)
  let pick = () => {}
  const items = projects.map((p, i) => {
    const it = h("button", { class: "board__railitem", "data-sec": p.sec || "PUBLIC" },
      h("span", { class: "board__rnum mono" }, String(i + 1).padStart(2, "0")),
      h("span", { class: "board__rdot" }),
      h("span", { class: "board__rtt" }, p.title))
    it.addEventListener("click", () => pick(i))
    return it
  })
  const rail = h("div", { class: "board__rail" }, h("div", { class: "board__railtt mono tiny" }, bi("档案索引", "INDEX")), ...items)

  if (cramped) {
    const mark = (i) => {
      items.forEach((r, k) => r.setAttribute("data-on", k === i ? "1" : "0"))
      clusters.forEach((c, k) => c.setAttribute("data-on", k === i ? "1" : "0"))
    }
    clusters.forEach((cl, i) => cl.addEventListener("click", (e) => { if (e.target.closest("a,button")) return; mark(i) }))
    pick = (i) => { mark(i); clusters[i].scrollIntoView({ behavior: tame ? "auto" : "smooth", block: "center" }) }
    const stack = h("div", { class: "board__stack" }, buildHub(character), ...clusters)
    return h("section", { class: "board board--flat" }, rail, h("div", { class: "board__stage" }, stack))
  }

  const spots = ringSpots(projects.length)
  let reachX = 0, reachY = 0
  for (const s of spots) { reachX = Math.max(reachX, Math.abs(s.x)); reachY = Math.max(reachY, Math.abs(s.y)) }
  const cw = (reachX + HALFX + PAD) * 2
  const ch = (reachY + HALFY + PAD) * 2
  const hx = cw / 2, hy = ch / 2

  const NS = "http://www.w3.org/2000/svg"
  const yarn = document.createElementNS(NS, "svg")
  yarn.setAttribute("class", "board__svg")
  yarn.setAttribute("width", cw)
  yarn.setAttribute("height", ch)
  yarn.setAttribute("viewBox", `0 0 ${cw} ${ch}`)

  const threads = [], pos = []
  projects.forEach((p, i) => {
    const sx = hx + spots[i].x, sy = hy + spots[i].y
    pos.push({ x: sx, y: sy })
    const span = Math.hypot(sx - hx, sy - hy)
    const cpx = (hx + sx) / 2
    const cpy = (hy + sy) / 2 + span * 0.13 + 24
    const line = document.createElementNS(NS, "path")
    line.setAttribute("d", `M ${hx} ${hy} Q ${cpx.toFixed(1)} ${cpy.toFixed(1)} ${sx.toFixed(1)} ${sy.toFixed(1)}`)
    line.setAttribute("class", "board__str")
    yarn.appendChild(line)
    threads.push(line)
    const cl = clusters[i]
    cl.style.left = sx + "px"
    cl.style.top = sy + "px"
    cl.addEventListener("click", (e) => { if (e.target.closest("a,button")) return; focusOn(i, true) })
  })

  const hub = buildHub(character)
  hub.style.left = hx + "px"
  hub.style.top = hy + "px"

  const canvas = h("div", { class: "board__canvas" }, yarn, hub, ...clusters)
  const hint = h("div", { class: "board__hint mono tiny" }, "拖动平移 点档案聚焦")
  const stage = h("div", { class: "board__stage" }, canvas, hint)
  const board = h("section", { class: "board" }, rail, stage)

  let fit = 1, cur = -1
  const vp = () => ({ w: stage.clientWidth || stage.offsetWidth || 900, h: stage.clientHeight || 560 })

  function openHub() {
    const { w, h: vh } = vp()
    fit = Math.min(w / cw, vh / ch)
    const s = Math.min(Math.max(fit * 1.5, 0.72), 1.05)
    gsap.set(canvas, { x: w / 2 - s * hx, y: vh / 2 - s * hy, scale: s })
  }
  const focusScale = () => Math.min(1.12, Math.max(0.94, fit * 1.7))

  function focusOn(i, fly) {
    cur = i
    threads.forEach((t, k) => t.setAttribute("data-on", k === i ? "1" : "0"))
    clusters.forEach((c, k) => c.setAttribute("data-on", k === i ? "1" : "0"))
    items.forEach((r, k) => r.setAttribute("data-on", k === i ? "1" : "0"))
    if (!fly) return
    const { w, h: vh } = vp()
    const s = focusScale(), t = pos[i]
    const x = w / 2 - s * t.x, y = vh / 2 - s * t.y
    if (tame) gsap.set(canvas, { x, y, scale: s })
    else gsap.to(canvas, { x, y, scale: s, duration: 0.9, ease: "power3.inOut" })
  }
  pick = (i) => focusOn(i, true)

  let grab = null
  stage.addEventListener("pointerdown", (e) => {
    if (e.target.closest("a,button,.board__cluster")) return
    grab = { px: e.clientX, py: e.clientY, x: +gsap.getProperty(canvas, "x"), y: +gsap.getProperty(canvas, "y") }
    stage.classList.add("is-grab")
    try { stage.setPointerCapture(e.pointerId) } catch {}
  })
  stage.addEventListener("pointermove", (e) => {
    if (!grab) return
    const s = +gsap.getProperty(canvas, "scale")
    const { w, h: vh } = vp(), slack = 240
    let x = grab.x + (e.clientX - grab.px), y = grab.y + (e.clientY - grab.py)
    x = Math.max(Math.min(0, w - s * cw) - slack, Math.min(slack, x))
    y = Math.max(Math.min(0, vh - s * ch) - slack, Math.min(slack, y))
    gsap.set(canvas, { x, y })
  })
  const release = (e) => { if (!grab) return; grab = null; stage.classList.remove("is-grab"); try { stage.releasePointerCapture(e.pointerId) } catch {} }
  stage.addEventListener("pointerup", release)
  stage.addEventListener("pointercancel", release)

  let tries = 0
  const boot = () => {
    if ((stage.clientWidth || 0) < 60 && tries < 12) { tries++; requestAnimationFrame(boot); return }
    gsap.set(canvas, { transformOrigin: "0 0" })
    openHub()
    if (!tame) {
      gsap.set([hub, ...clusters], { autoAlpha: 0 })
      threads.forEach((t) => { const len = t.getTotalLength(); gsap.set(t, { strokeDasharray: len, strokeDashoffset: len }) })
      const tl = gsap.timeline({ delay: 0.12 })
      tl.to(threads, { strokeDashoffset: 0, duration: 0.66, ease: "power2.out", stagger: 0.04 })
      tl.to(hub, { autoAlpha: 1, duration: 0.4 }, 0.04)
      tl.to(clusters, { autoAlpha: 1, duration: 0.5, ease: "power2.out", stagger: 0.05 }, 0.18)
    }
  }
  requestAnimationFrame(() => requestAnimationFrame(boot))
  return board
}
