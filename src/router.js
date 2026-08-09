import { clear } from "./lib/dom.js"
import { hideLoader } from "./components/loader.js"
import { syncNav } from "./components/nav.js"
import { session } from "./lib/store.js"

let table = []
let outlet = null
let active = null
let booted = false
let ready = Promise.resolve()

/**
 * Pages change the way a CRT changes signal. The effect is loaded on the first
 * navigation rather than up front: it is never needed for the first paint, and
 * the entry bundle should not carry it there.
 */
async function transition(swap) {
  try {
    const { crtSwap } = await import("./components/crt.js")
    await crtSwap(swap)
  } catch (e) {
    console.error("transition failed, swapping outright", e)
    swap()
    window.scrollTo(0, 0)
  }
}

/**
 * Guarded routes need to know who is signed in, but the public ones do not.
 * Gating only the routes that care lets the landing page paint without waiting
 * on a session round-trip first.
 */
export function gateOn(promise) { ready = promise }

export function defineRoutes(list) {
  table = list.map((r) => ({ ...compile(r.p), load: r.view, tag: r.tag, guard: !!r.guard }))
}

export function mountOutlet(node) { outlet = node }

function compile(p) {
  const keys = []
  const src = p
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/:([A-Za-z0-9_]+)/g, (_, k) => { keys.push(k); return "([^/]+)" })
  return { rx: new RegExp("^" + src + "/?$"), keys }
}

function match() {
  const path = location.pathname.length > 1 ? location.pathname.replace(/\/$/, "") : location.pathname
  for (const r of table) {
    const m = r.rx.exec(path)
    if (m) {
      const params = {}
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]) })
      return { r, params }
    }
  }
  return null
}

async function paint() {
  const hit = match()
  if (hit && hit.r.guard) {
    if (!session.ready) await ready
    if (!session.me) {
      history.replaceState({}, "", "/login")
      return paint()
    }
  }
  let mod = null
  if (hit) {
    try { mod = await hit.r.load() } catch (e) { console.error("view load failed", e) }
  }
  const swap = () => {
    if (active && typeof active.destroy === "function") { try { active.destroy() } catch (e) { console.error(e) } }
    clear(outlet)
    if (!mod) { outlet.append(notFound()); active = null }
    else active = mod.default(outlet, hit ? hit.params : {}) || null
    syncNav()
  }
  if (!booted) { booted = true; swap(); hideLoader() }
  else await transition(swap)
}

function notFound() {
  const wrap = document.createElement("div")
  wrap.className = "wrap soon"
  wrap.innerHTML = '<h2>404</h2><p>此档案不存在于长生天之下</p>'
  return wrap
}

export function go(to) {
  if (to === location.pathname + location.search) return
  history.pushState({}, "", to)
  paint()
}

export function startRouter() {
  addEventListener("popstate", () => paint())
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-link]")
    if (!a) return
    const href = a.getAttribute("href")
    if (!href || /^https?:\/\//.test(href) || a.target === "_blank") return
    e.preventDefault()
    go(href)
  })
  paint()
}
