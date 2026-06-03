import gsap from "gsap"
import Flip from "gsap/Flip"
import ScrollTrigger from "gsap/ScrollTrigger"

gsap.registerPlugin(Flip, ScrollTrigger)

export const tame = matchMedia("(prefers-reduced-motion: reduce)").matches

function arrify(t) {
  if (!t) return []
  if (Array.isArray(t)) return t
  if (t.length != null) return [...t]
  return [t]
}

function guardedFrom(arr, vars) {
  const tw = gsap.from(arr, vars)
  const span = ((vars.duration ?? 0.8) + (arr.length - 1) * (vars.stagger ?? 0) + (vars.delay ?? 0)) * 1000 + 800
  const safety = setTimeout(() => gsap.set(arr, { autoAlpha: 1, x: 0, y: 0, scale: 1 }), span)
  tw.eventCallback("onComplete", () => clearTimeout(safety))
  return tw
}

export function reveal(targets, opts = {}) {
  if (tame) return null
  const arr = arrify(targets)
  if (!arr.length) return null
  return guardedFrom(arr, {
    y: opts.y ?? 36,
    autoAlpha: 0,
    duration: opts.duration ?? 0.8,
    ease: opts.ease ?? "expo.out",
    stagger: opts.stagger ?? 0.07,
    delay: opts.delay ?? 0
  })
}

export function entrance(targets, vars) {
  if (tame) return null
  const arr = arrify(targets)
  if (!arr.length) return null
  return guardedFrom(arr, vars)
}

export function scrollReveal(scope, sel, opts = {}) {
  const nodes = arrify(scope.querySelectorAll(sel))
  if (tame || !nodes.length) return
  nodes.forEach((n) => {
    gsap.set(n, { autoAlpha: 0, y: opts.y ?? 46 })
    let shown = false
    const show = (instant) => {
      if (shown) return
      shown = true
      if (instant) gsap.set(n, { autoAlpha: 1, y: 0 })
      else gsap.to(n, { autoAlpha: 1, y: 0, duration: 0.82, ease: "expo.out" })
    }
    ScrollTrigger.create({ trigger: n, start: "top 90%", once: true, onEnter: () => show(false) })
    setTimeout(() => show(true), 2800)
  })
}

export function countUp(el, to, opts = {}) {
  const fin = Number(to) || 0
  if (tame) { el.textContent = fin.toLocaleString("en-US"); return }
  const bag = { v: 0 }
  let ran = false
  const play = () => {
    if (ran) return
    ran = true
    gsap.to(bag, { v: fin, duration: opts.duration ?? 1.5, ease: "power2.out", onUpdate() { el.textContent = Math.round(bag.v).toLocaleString("en-US") } })
  }
  ScrollTrigger.create({ trigger: opts.trigger || el, start: "top 92%", once: true, onEnter: play })
  setTimeout(() => { if (!ran) el.textContent = fin.toLocaleString("en-US") }, 3000)
}

export function pageWipe(swap, tag = "长生天") {
  return new Promise((resolve) => {
    if (tame) { swap && swap(); window.scrollTo(0, 0); resolve(); return }
    let fired = false
    const finish = () => { if (fired) return; fired = true; resolve() }
    let swapped = false
    const doSwap = () => { if (swapped) return; swapped = true; swap && swap(); window.scrollTo(0, 0) }
    const sheet = document.createElement("div")
    sheet.className = "wipe"
    const word = document.createElement("div")
    word.className = "wipe__tag"
    word.textContent = tag
    sheet.appendChild(word)
    document.body.appendChild(sheet)
    const tl = gsap.timeline({ onComplete() { sheet.remove(); finish() } })
    tl.to(sheet, { scaleX: 1, duration: 0.42, ease: "power4.inOut" })
    tl.to(word, { autoAlpha: 1, duration: 0.18 }, "-=0.22")
    tl.add(doSwap)
    tl.to(word, { autoAlpha: 0, duration: 0.14 })
    tl.set(sheet, { transformOrigin: "right center" })
    tl.to(sheet, { scaleX: 0, duration: 0.46, ease: "power4.inOut" })
    setTimeout(() => { doSwap(); sheet.remove(); finish() }, 1700)
  })
}

export function clearScroll() {
  ScrollTrigger.getAll().forEach((t) => t.kill())
}

export { gsap, Flip, ScrollTrigger }
