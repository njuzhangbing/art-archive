import "./styles/reset.css"
import "./styles/tokens.css"
import "./styles/constructivism.css"
import "./styles/views.css"
import { h } from "./lib/dom.js"
import { defineRoutes, mountOutlet, startRouter } from "./router.js"
import { buildNav } from "./components/nav.js"
import { mountToasts } from "./components/toast.js"
import { session } from "./lib/store.js"
import { api } from "./lib/api.js"

const app = document.getElementById("app")
const shell = h("div", { class: "shell has-ticker" })
const main = h("main")
shell.append(main, footer())
app.append(buildNav(), ticker(), shell)
mountOutlet(main)
mountToasts()

defineRoutes([
  { p: "/", tag: "主页", view: () => import("./views/home.js") },
  { p: "/projects", tag: "项目", view: () => import("./views/projects.js") },
  { p: "/projects/:id", tag: "档案", view: () => import("./views/project-detail.js") },
  { p: "/activity", tag: "活动", view: () => import("./views/stats.js") },
  { p: "/me", tag: "个人", view: () => import("./views/profile.js") },
  { p: "/login", tag: "登录", view: () => import("./views/auth.js") }
])

probe().finally(startRouter)
app.setAttribute("data-boot", "1")

async function probe() {
  try { const me = await api.get("/api/me"); session.set(me && me.user) }
  catch { session.set(null) }
}

function ticker() {
  const items = ["长生天计划", "ARCHIVE OF WORKS", "ALEPH / WAW / HE / TETH / ZAYIN", "版本存档 · 变更可视化 · 回滚", "构成主义 · MMXXVI"]
  const run = items.concat(items).map((t) => h("span", { html: t.replace(/(ALEPH|WAW|HE|TETH|ZAYIN)/g, "<b>$1</b>") }))
  return h("div", { class: "ticker" }, h("div", { class: "ticker__run" }, ...run))
}

function footer() {
  return h("footer", { class: "footer" },
    h("div", { class: "wrap" },
      h("div", { class: "footer__big serif" }, "长生天", h("span", { class: "red" }, "計劃")),
      h("div", { class: "mono" }, "艺作存档库 / ARCHIVE OF WORKS"),
      h("div", { class: "mono", style: "margin-left:auto" }, "NETLIFY · BLOBS · MMXXVI")
    )
  )
}
