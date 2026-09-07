import { h, clear, frag } from "../lib/dom.js"
import { session } from "../lib/store.js"
import { api } from "../lib/api.js"
import { openSearch } from "./search.js"
import { isOpen } from "../lib/gate.js"
import { asset } from "../lib/net.js"

const LINKS = [
  { path: "/", i: "00", label: "主页" },
  { path: "/projects", i: "01", label: "项目" },
  { path: "/programmes", i: "02", label: "企划" },
  { path: "/characters", i: "03", label: "角色" },
  { path: "/blog", i: "04", label: "博客" },
  { path: "/talk", i: "05", label: "讨论" },
  { path: "/tools", i: "06", label: "工具" }
]

/**
 * On a phone the six sections and the four icon buttons are ten targets in a
 * 64px strip, none of them thumb-sized. They collapse into three doors, each
 * opening a sheet of full-width rows: what the archive holds, what it is
 * writing, and the reader's own business. The masthead is the way home.
 */
const DOORS = [
  {
    key: "hold", zh: "馆藏", en: "COLLECTION", at: ["/projects", "/characters"],
    items: [
      { p: "/projects", zh: "项目", en: "PROJECTS" },
      { p: "/characters", zh: "角色", en: "FIGURES" }
    ]
  },
  {
    key: "note", zh: "记事", en: "RECORD", at: ["/programmes", "/blog", "/talk", "/tools", "/roll", "/photos", "/card"],
    items: [
      { p: "/programmes", zh: "企划", en: "PROGRAMMES" },
      { p: "/blog", zh: "博客", en: "JOURNAL" },
      { p: "/talk", zh: "讨论", en: "FORUM" },
      { p: "/tools", zh: "工具", en: "WORKSHOP" },
      { p: "/roll", zh: "照片带", en: "PHOTO ROLL" },
      { p: "/photos", zh: "相册", en: "PHOTOS" },
      { p: "/card", zh: "透卡", en: "CARD" }
    ]
  },
  {
    key: "self", zh: "我的", en: "ACCOUNT", at: ["/me", "/notifications", "/dm", "/login"],
    items: [
      { p: "/me", zh: "个人", en: "PROFILE" },
      { p: "/notifications", zh: "通知", en: "ALERTS" },
      { p: "/dm", zh: "私信", en: "MESSAGES" },
      { find: true, zh: "检索", en: "SEARCH" }
    ],
    out: [{ p: "/login", zh: "登录 / 注册", en: "SIGN IN" }]
  }
]

export function buildNav() {
  const links = LINKS.map((l) =>
    h("a", { class: "navlink", href: l.path, "data-link": "1", "data-path": l.path },
      h("span", { class: "navlink__i" }, l.i),
      h("span", { class: "lbl" }, l.label)
    )
  )

  const me = h("div", { class: "topbar__me" })
  const pollNotif = () => {
    // Closing a section stops its traffic too: there is no point keeping a dot
    // accurate for a page nobody can open.
    if (!session.me || !isOpen("/notifications")) return
    api.get("/api/notifications").then((r) => { const dot = me.querySelector(".navdot"); if (dot) dot.classList.toggle("on", (r.unread || 0) > 0) }).catch(() => {})
  }
  const drawMe = (u) => {
    clear(me)
    if (u) {
      const av = h("span", { class: "navavatar" }, (u.handle || "?").slice(0, 1).toUpperCase())
      if (u.avatarKey) { av.style.backgroundImage = "url(" + asset("/media/" + u.avatarKey) + ")"; av.classList.add("has") }
      me.append(
        h("button", { class: "navbell navfind", type: "button", title: "搜索 ( / )", onClick: openSearch }, "🔍"),
        h("a", { class: "navbell", href: "/dm", "data-link": "1", title: "私信" }, "✉"),
        h("a", { class: "navbell", href: "/notifications", "data-link": "1", title: "通知" }, "🔔", h("span", { class: "navdot" })),
        h("a", { class: "btn btn--sm navme", href: "/me", "data-link": "1" }, av, h("span", {}, "@" + (u.handle || "me"))))
      pollNotif()
    } else {
      me.append(h("a", { class: "btn btn--sm btn--red", href: "/login", "data-link": "1" }, "登录/注册"))
    }
  }
  session.sub(drawMe)
  drawMe(session.me)

  /**
   * The unread dot, checked rarely and never behind your back.
   *
   * Every thirty seconds came to twenty-nine thousand requests a month from one
   * tab left open — a quarter of the month's whole allowance to keep one dot
   * accurate. Five minutes is well inside how fast anyone notices, and a hidden
   * tab is not asked at all; it catches up the moment it is looked at again.
   */
  const NOTIF_MS = 5 * 60_000
  let notifTimer = null
  const tickNotif = () => {
    notifTimer = null
    if (!document.hidden) pollNotif()
    notifTimer = setTimeout(tickNotif, NOTIF_MS)
  }
  notifTimer = setTimeout(tickNotif, NOTIF_MS)
  document.addEventListener("visibilitychange", () => { if (!document.hidden) pollNotif() })

  addEventListener("keydown", (e) => {
    if (!session.me) return
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable
    const slash = e.key === "/" && !typing
    const palette = (e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")
    if (slash || palette) { e.preventDefault(); openSearch() }
  })

  // ---- the three doors, phone only ----
  const sheet = h("div", { class: "mnav__sheet", "data-open": "0" })
  const tabs = DOORS.map((d, i) => h("button", {
    class: "mnav__tab", type: "button", "data-at": d.at.join(" "),
    "aria-expanded": "false", "aria-label": d.zh
  }, h("b", {}, d.zh), h("i", {}, d.en)))

  let ajar = -1

  function fillSheet(i) {
    clear(sheet)
    const d = DOORS[i]
    if (!d) return
    const rows = (!session.me && d.out) ? d.out : d.items
    rows.forEach((it) => {
      const body = [h("span", { class: "mrow__zh" }, it.zh), h("span", { class: "mrow__en" }, it.en)]
      sheet.append(it.find
        ? h("button", { class: "mrow", type: "button", onClick: () => { shut(); openSearch() } }, ...body)
        : h("a", { class: "mrow", href: it.p, "data-link": "1" }, ...body, h("span", { class: "mrow__go" }, "→")))
    })
  }

  function shut() {
    ajar = -1
    sheet.setAttribute("data-open", "0")
    tabs.forEach((t) => { t.setAttribute("data-open", "0"); t.setAttribute("aria-expanded", "false") })
  }

  function pull(i) {
    if (ajar === i) { shut(); return }
    ajar = i
    fillSheet(i)
    sheet.setAttribute("data-open", "1")
    tabs.forEach((t, k) => {
      t.setAttribute("data-open", k === i ? "1" : "0")
      t.setAttribute("aria-expanded", k === i ? "true" : "false")
    })
  }

  tabs.forEach((t, i) => t.addEventListener("click", () => pull(i)))
  sheet.addEventListener("click", (e) => { if (e.target.closest("a")) shut() })
  document.addEventListener("click", (e) => {
    if (ajar < 0) return
    if (e.target.closest(".mnav") || e.target.closest(".mnav__sheet")) return
    shut()
  })
  addEventListener("keydown", (e) => { if (e.key === "Escape") shut() })
  // A door left open across a page change would hang over the new page.
  addEventListener("popstate", shut)
  session.sub(() => { if (ajar >= 0) fillSheet(ajar) })

  return frag(
    h("header", { class: "topbar" },
      h("a", { class: "topbar__brand", href: "/", "data-link": "1" },
        h("div", { class: "topbar__seal" }, "天"),
        h("div", { class: "topbar__word" }, "长生天", h("small", {}, "ARCHIVE OF WORKS"))
      ),
      h("nav", { class: "topbar__nav" }, ...links, me),
      h("div", { class: "mnav" }, ...tabs)
    ),
    sheet
  )
}

export function syncNav() {
  const path = location.pathname
  document.querySelectorAll(".navlink").forEach((a) => {
    const p = a.getAttribute("data-path")
    const on = p === "/" ? path === "/" : path.startsWith(p)
    a.setAttribute("data-active", on ? "1" : "0")
  })
  document.querySelectorAll(".mnav__tab").forEach((t) => {
    const on = (t.getAttribute("data-at") || "").split(" ").some((p) => p && path.startsWith(p))
    t.setAttribute("data-active", on ? "1" : "0")
  })
}
