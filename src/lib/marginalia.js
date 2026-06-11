import { gsap, tame } from "./anim.js"

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]))
}

function b64enc(str) {
  try { return btoa(unescape(encodeURIComponent(String(str)))) } catch { return "" }
}
function b64dec(str) {
  try { return decodeURIComponent(escape(atob(str))) } catch { return null }
}

export function encodeQuote(obj) { return b64enc(JSON.stringify(obj)) }
export function encodeNote(str) { return b64enc(str) }

function decodeQuote(str) {
  const raw = b64dec(str)
  if (raw == null) return null
  try { return JSON.parse(raw) } catch { return null }
}
function decodeNote(str) {
  const raw = b64dec(str)
  return raw == null ? str : raw
}

const CAP_W = 384

const registry = []
let docWired = false
function wireDoc() {
  if (docWired) return
  docWired = true
  document.addEventListener("pointerdown", (e) => {
    for (let i = registry.length - 1; i >= 0; i--) {
      const r = registry[i]
      if (!r.wrap.isConnected) { registry.splice(i, 1); continue }
      if (r.isOpen() && !r.wrap.contains(e.target)) r.close()
    }
  })
}

function buildPanel(kind) {
  const panel = document.createElement("div")
  panel.className = "margpanel" + (kind === "quote" ? " margpanel--quote" : "")
  panel.style.width = "0px"
  panel.style.height = "4px"
  return panel
}

function place(wrap, panel) {
  panel.style.left = "0px"; panel.style.right = "auto"
  panel.style.top = "calc(100% + 8px)"; panel.style.bottom = "auto"
  const r = wrap.getBoundingClientRect()
  if (r.left + CAP_W > window.innerWidth - 12) { panel.style.left = "auto"; panel.style.right = "0px" }
  if (window.innerHeight - r.bottom < 200 && r.top > 240) { panel.style.top = "auto"; panel.style.bottom = "calc(100% + 8px)" }
}

function measure(panel) {
  const s = panel.style
  const sw = s.width, sh = s.height, so = s.overflow, sv = s.visibility
  s.visibility = "hidden"; s.width = "auto"; s.height = "auto"; s.overflow = "visible"
  const W = Math.min(panel.offsetWidth, CAP_W), H = panel.offsetHeight
  s.width = sw; s.height = sh; s.overflow = so; s.visibility = sv
  return { W, H }
}

function openPanel(wrap, panel, onOpened) {
  panel.classList.add("on")
  place(wrap, panel)
  const inner = panel.firstChild
  if (tame) {
    gsap.set(panel, { width: "auto", height: "auto", overflow: "", autoAlpha: 1 })
    if (inner) gsap.set(inner, { autoAlpha: 1 })
    if (onOpened) onOpened(true)
    return
  }
  const { W, H } = measure(panel)
  gsap.killTweensOf([panel, inner])
  gsap.set(panel, { width: 0, height: 4, overflow: "hidden", autoAlpha: 1 })
  if (inner) gsap.set(inner, { autoAlpha: 0 })
  const tl = gsap.timeline()
  tl.to(panel, { width: W, duration: 0.22, ease: "power3.out" })
  tl.to(panel, { height: H, duration: 0.28, ease: "power3.out" })
  if (inner) tl.to(inner, { autoAlpha: 1, duration: 0.18 }, "-=0.12")
  tl.add(() => { panel.style.width = "auto"; panel.style.height = "auto"; panel.style.overflow = ""; if (onOpened) onOpened(false) })
}

function closePanel(panel) {
  const inner = panel.firstChild
  if (tame) { gsap.set(panel, { width: 0, height: 4, autoAlpha: 0 }); panel.classList.remove("on"); return }
  gsap.killTweensOf([panel, inner])
  gsap.set(panel, { overflow: "hidden", height: panel.offsetHeight, width: panel.offsetWidth })
  const tl = gsap.timeline({ onComplete: () => panel.classList.remove("on") })
  if (inner) tl.to(inner, { autoAlpha: 0, duration: 0.1 })
  tl.to(panel, { height: 4, duration: 0.16, ease: "power2.in" }, "-=0.04")
  tl.to(panel, { width: 0, duration: 0.16, ease: "power2.in" })
  tl.set(panel, { autoAlpha: 0 })
}

function wire(wrap, panel, onOpened) {
  let closeT = null
  let open = false
  const doOpen = () => { if (open) return; open = true; openPanel(wrap, panel, onOpened) }
  const doClose = () => { if (!open) return; open = false; closePanel(panel) }
  const enter = () => { if (closeT) { clearTimeout(closeT); closeT = null } doOpen() }
  const leave = () => { if (closeT) clearTimeout(closeT); closeT = setTimeout(doClose, 150) }
  wrap.addEventListener("mouseenter", enter)
  wrap.addEventListener("mouseleave", leave)
  wrap.addEventListener("focusin", enter)
  wrap.addEventListener("focusout", leave)
  wrap.addEventListener("click", (e) => { e.preventDefault(); doOpen() })
  registry.push({ wrap, isOpen: () => open, close: doClose })
}

function wrapMarker(el, cls, num) {
  el.textContent = "[" + num + "]"
  const wrap = document.createElement("span")
  wrap.className = "margwrap " + cls
  el.replaceWith(wrap); wrap.appendChild(el)
  return wrap
}

function noteMarker(el, num) {
  const note = decodeNote(el.getAttribute("data-note") || "")
  const wrap = wrapMarker(el, "margwrap--note", num)
  const panel = buildPanel("note")
  const inner = document.createElement("div"); inner.className = "margpanel__in"
  const body = document.createElement("div"); body.className = "margnote"
  body.textContent = note || "（空注释）"
  inner.appendChild(body); panel.appendChild(inner); wrap.appendChild(panel)
  wire(wrap, panel)
}

function quoteMarker(el, num) {
  const data = decodeQuote(el.getAttribute("data-q") || "")
  const wrap = wrapMarker(el, "margwrap--quote", num)
  const panel = buildPanel("quote")
  const inner = document.createElement("div"); inner.className = "margpanel__in"
  const scroll = document.createElement("div"); scroll.className = "margpanel__scroll"
  const src = document.createElement("div"); src.className = "qsrc"
  if (data && typeof data.s === "string") {
    const len = data.s.length
    const a = Math.max(0, Math.min(data.a | 0, len))
    const b = Math.max(a, Math.min(data.b | 0, len))
    src.innerHTML = esc(data.s.slice(0, a)) +
      '<mark class="qhl"><span class="qhl__ink"></span><span class="qhl__t">' + esc(data.s.slice(a, b)) + "</span></mark>" +
      esc(data.s.slice(b))
  } else {
    src.textContent = "（引用内容无法解析）"
  }
  scroll.appendChild(src); inner.appendChild(scroll); panel.appendChild(inner); wrap.appendChild(panel)
  const sweep = (instant) => {
    const mark = panel.querySelector(".qhl")
    const ink = panel.querySelector(".qhl__ink")
    if (!mark) return
    const target = Math.max(0, mark.offsetTop - 18)
    if (instant || tame) { if (ink) gsap.set(ink, { scaleX: 1 }); scroll.scrollTop = target; return }
    if (ink) gsap.set(ink, { scaleX: 0 })
    scroll.scrollTop = 0
    const tl = gsap.timeline()
    tl.to(scroll, { scrollTop: target, duration: 0.5, ease: "power2.inOut" })
    if (ink) tl.to(ink, { scaleX: 1, duration: 0.42, ease: "power2.out" }, "-=0.04")
  }
  wire(wrap, panel, sweep)
}

export function hydrateMarginalia(container) {
  if (!container) return
  wireDoc()
  let n = 0
  container.querySelectorAll("sup.anno").forEach((el) => {
    if (el.closest(".margwrap")) return
    n += 1
    if (el.classList.contains("qref")) quoteMarker(el, n)
    else noteMarker(el, n)
  })
}
