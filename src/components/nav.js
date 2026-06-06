import { h, clear } from "../lib/dom.js"
import { session } from "../lib/store.js"

const LINKS = [
  { path: "/", i: "00", label: "主页" },
  { path: "/projects", i: "01", label: "项目" },
  { path: "/activity", i: "02", label: "活动" },
  { path: "/characters", i: "03", label: "角色" },
  { path: "/blog", i: "04", label: "博客" }
]

export function buildNav() {
  const links = LINKS.map((l) =>
    h("a", { class: "navlink", href: l.path, "data-link": "1", "data-path": l.path },
      h("span", { class: "navlink__i" }, l.i),
      h("span", { class: "lbl" }, l.label)
    )
  )

  const me = h("div", { class: "topbar__me" })
  const drawMe = (u) => {
    clear(me)
    me.append(
      u
        ? h("a", { class: "btn btn--sm", href: "/me", "data-link": "1" }, "@" + (u.handle || "me"))
        : h("a", { class: "btn btn--sm btn--red", href: "/login", "data-link": "1" }, "登录/注册")
    )
  }
  session.sub(drawMe)
  drawMe(session.me)

  return h("header", { class: "topbar" },
    h("a", { class: "topbar__brand", href: "/", "data-link": "1" },
      h("div", { class: "topbar__seal" }, "天"),
      h("div", { class: "topbar__word" }, "长生天", h("small", {}, "ARCHIVE OF WORKS"))
    ),
    h("nav", { class: "topbar__nav" }, ...links, me)
  )
}

export function syncNav() {
  const path = location.pathname
  document.querySelectorAll(".navlink").forEach((a) => {
    const p = a.getAttribute("data-path")
    const on = p === "/" ? path === "/" : path.startsWith(p)
    a.setAttribute("data-active", on ? "1" : "0")
  })
}
