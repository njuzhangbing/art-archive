import "./styles/reset.css"
import "./styles/tokens.css"
import "./styles/catalogue.css"
import "./styles/views.css"
import "./styles/fx.css"
import "./styles/fonts.css"
import { h, bi } from "./lib/dom.js"
import { defineRoutes, mountOutlet, startRouter, gateOn } from "./router.js"
import { buildNav } from "./components/nav.js"
import { mountToasts } from "./components/toast.js"
import { session } from "./lib/store.js"
import { api } from "./lib/api.js"
import { loadDirectory } from "./lib/directory.js"
import { initCursor } from "./lib/cursor.js"
import { showLoader } from "./components/loader.js"

const app = document.getElementById("app")
showLoader()
const shell = h("div", { class: "shell" })
const main = h("main")
shell.append(main, footer())
app.append(buildNav(), shell)
mountOutlet(main)
mountToasts()
initCursor()

defineRoutes([
  { p: "/", tag: "主页", view: () => import("./views/home.js") },
  { p: "/projects", tag: "项目", guard: true, view: () => import("./views/projects.js") },
  { p: "/projects/:id", tag: "档案", guard: true, view: () => import("./views/project-detail.js") },
  { p: "/programmes", tag: "企划", guard: true, view: () => import("./views/programmes.js") },
  { p: "/activity", tag: "活动", guard: true, view: () => import("./views/stats.js") },
  { p: "/characters", tag: "角色", guard: true, view: () => import("./views/characters.js") },
  { p: "/characters/:id", tag: "档案", guard: true, view: () => import("./views/character-detail.js") },
  { p: "/blog", tag: "博客", guard: true, view: () => import("./views/blog.js") },
  { p: "/blog/series/:id", tag: "系列", guard: true, view: () => import("./views/blog-series.js") },
  { p: "/blog/:id", tag: "文章", guard: true, view: () => import("./views/blog-post.js") },
  { p: "/talk", tag: "讨论", guard: true, view: () => import("./views/talk.js") },
  { p: "/talk/:cid", tag: "讨论", guard: true, view: () => import("./views/talk.js") },
  { p: "/talk/:cid/:tid", tag: "讨论", guard: true, view: () => import("./views/talk.js") },
  { p: "/u/:handle", tag: "用户", guard: true, view: () => import("./views/user.js") },
  { p: "/notifications", tag: "通知", guard: true, view: () => import("./views/notifications.js") },
  { p: "/dm", tag: "私信", guard: true, view: () => import("./views/dm.js") },
  { p: "/dm/:handle", tag: "私信", guard: true, view: () => import("./views/dm.js") },
  { p: "/me", tag: "个人", view: () => import("./views/profile.js") },
  { p: "/login", tag: "登录", view: () => import("./views/auth.js") }
])

// The first screen used to wait on /api/me before anything was drawn, even
// though the landing page does not care who is looking. Start painting now and
// let the router hold back only the routes that actually need a session.
gateOn(probe())
startRouter()
app.setAttribute("data-boot", "1")

async function probe() {
  try { const me = await api.get("/api/me"); session.set(me && me.user); if (me && me.user) loadDirectory() }
  catch { session.set(null) }
}

function footer() {
  return h("footer", { class: "footer" },
    h("div", { class: "wrap" },
      h("div", { class: "footer__big serif" }, "长生天", h("span", { class: "red" }, "计划")),
      h("div", { class: "mono" }, bi("艺作存档库", "ARCHIVE OF WORKS"))
    )
  )
}
