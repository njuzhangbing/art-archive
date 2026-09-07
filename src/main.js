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
import { session, recall } from "./lib/store.js"
import { api, ApiError } from "./lib/api.js"
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
  { p: "/tools", tag: "工具", guard: true, view: () => import("./views/tools.js") },
  { p: "/tools/image", tag: "工作台", guard: true, view: () => import("./views/tools-image.js") },
  { p: "/roll", tag: "照片带", guard: true, view: () => import("./views/roll.js") },
  { p: "/photos", tag: "相册", guard: true, view: () => import("./views/photos.js") },
  { p: "/card", tag: "透卡", guard: true, view: () => import("./views/card.js") },
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

/**
 * Establish who is reading, before the guarded routes are allowed to paint.
 *
 * The distinction that matters: the archive replying "nobody" is an answer, and
 * the archive being unreachable is not. Treating the second as the first is why
 * a moment of bad signal used to empty the whole site — every guarded route saw
 * a null session and bounced to the sign-in page, and it stayed that way until
 * the page was reloaded at a luckier moment.
 */
/**
 * Establish who is reading — without making the site wait on it.
 *
 * A remembered identity is used immediately, so a page load paints from local
 * knowledge and every guarded route works even while the network is being
 * difficult. The server is then asked in the background, and only its answer
 * changes anything:
 *
 *   it says who you are   →  the memory is corrected
 *   it says nobody        →  the memory is dropped, you are signed out
 *   it cannot be reached  →  nothing happens; you carry on as you were
 *
 * That last line is the whole point. Before, an unreachable archive and an
 * empty one were the same event, and a moment of bad signal took the site down
 * for the reader until they reloaded at a luckier moment.
 */
async function probe() {
  const known = recall()
  if (known) { session.set(known); loadDirectory() }

  for (let attempt = 0; ; attempt++) {
    try {
      const me = await api.get("/api/me")
      // Only a JSON body is an answer about who this is. A 200 carrying the
      // page shell is what Netlify serves when a function is missing or a
      // redirect swallows the path — trusting it would sign everybody out the
      // moment a deploy went wrong.
      if (!me || typeof me !== "object" || Array.isArray(me)) throw new TypeError("非 JSON 应答")
      const who = me.user
      // Only announce a change; re-setting the same identity would churn every
      // subscriber on every load for nothing.
      if (!known || !who || who.id !== known.id || who.role !== known.role) session.set(who)
      if (who && !known) loadDirectory()
      return
    } catch (err) {
      // Only a refusal is an answer about identity. A 404 means the endpoint
      // is not where it should be, a 502 means the function did not come up —
      // both are the archive being broken, not the reader being unwelcome, and
      // treating them as a sign-out is how one bad deploy logs everybody out.
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        session.set(null)
        return
      }
      if (attempt >= 2) {
        // Could not ask. If we already know who this is, that stands.
        if (!known) session.set(null, { offline: true })
        return
      }
      await new Promise((done) => setTimeout(done, 400 * 2 ** attempt))
    }
  }
}

function footer() {
  return h("footer", { class: "footer" },
    h("div", { class: "wrap" },
      h("div", { class: "footer__big serif" }, "长生天", h("span", { class: "red" }, "计划")),
      h("div", { class: "mono" }, bi("艺作存档库", "ARCHIVE OF WORKS"))
    )
  )
}
