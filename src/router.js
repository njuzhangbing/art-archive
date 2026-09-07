import { clear } from "./lib/dom.js"
import { hideLoader } from "./components/loader.js"
import { syncNav } from "./components/nav.js"
import { session } from "./lib/store.js"
import { isOpen } from "./lib/gate.js"

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
  // Checked first, and deliberately: a closed section should cost nothing —
  // no session round trip, no view module fetched, no request from a page that
  // is not going to be shown.
  if (!isOpen(location.pathname)) { swapIn(shuttered()); return }
  if (hit && hit.r.guard) {
    if (!session.ready) await ready
    if (!session.me) {
      // Being unable to reach the archive is not the same as not being welcome
      // in it. Sending someone to a sign-in form they cannot use, and calling
      // an outage an empty archive, is the wrong answer to give.
      if (session.offline) { swapIn(unreachable()); return }
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

/** Replace whatever is on screen with a single node, no transition. */
function swapIn(node) {
  if (active && typeof active.destroy === "function") { try { active.destroy() } catch (e) { console.error(e) } }
  active = null
  clear(outlet)
  outlet.append(node)
  if (!booted) { booted = true; hideLoader() }
  syncNav()
}

function shuttered() {
  const wrap = document.createElement("div")
  wrap.className = "wrap soon"
  wrap.innerHTML = "<h2>权限不足</h2><p>该板块暂未开放。</p>"
  const back = document.createElement("a")
  back.className = "btn btn--red"
  back.style.marginTop = "22px"
  back.href = "/blog"
  back.setAttribute("data-link", "1")
  back.textContent = "去博客 / JOURNAL"
  wrap.append(back)
  return wrap
}

function unreachable() {
  const wrap = document.createElement("div")
  wrap.className = "wrap soon"
  wrap.innerHTML = "<h2>连不上服务器</h2><p>档案库没有应答。检查网络后重试。</p>"
  const again = document.createElement("button")
  again.className = "btn btn--red"
  again.style.marginTop = "22px"
  again.textContent = "重试 / RETRY"
  again.addEventListener("click", () => location.reload())
  wrap.append(again)
  return wrap
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
