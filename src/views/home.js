import { h, clear } from "../lib/dom.js"
import { tame, clearScroll } from "../lib/anim.js"
import { session } from "../lib/store.js"
import { api } from "../lib/api.js"
import { go } from "../router.js"
import { greetingFor } from "../lib/greeting.js"

const MENU = [
  { n: "01", en: "PROJECTS", zh: "项目库", desc: "版本化的作品档案", to: "/projects" },
  { n: "02", en: "ACTIVITY", zh: "活动", desc: "创作总账 · 热力图", to: "/activity" },
  { n: "03", en: "CHARACTERS", zh: "角色", desc: "名录 · 立绘 · 词条", to: "/characters" },
  { n: "04", en: "BLOG", zh: "博客", desc: "文章 · 系列 · 公告", to: "/blog" },
  { n: "05", en: "DISCUSS", zh: "讨论", desc: "频道 · 聊天 · 帖子", to: "/talk" }
]

export default function home(root) {
  const me = session.me
  const name = me ? (me.displayName || me.handle) : "访客"
  document.body.classList.add("home-dark")

  const bg = h("div", { class: "cine__layer cine__bg", "data-depth": "0.018" })
  const grunge = h("div", { class: "cine__layer cine__grunge", "data-depth": "0.045" })
  const seal = h("div", { class: "cine__seal serif", "data-depth": "0.13" }, "天")
  const stage = h("div", { class: "cine__stage" })
  const world = h("div", { class: "cine__world" }, bg, grunge, seal, stage)
  const grain = h("div", { class: "cine__grain" })
  const scan = h("div", { class: "cine__scan" })
  const vignette = h("div", { class: "cine__vignette" })
  const hud = h("div", { class: "cine__hud mono tiny" })
  const cine = h("div", { class: "cine" }, world, grain, scan, vignette, hud)

  const g = greetingFor(name)
  const startBtn = h("button", { class: "cine__start mono", type: "button" }, h("span", { class: "blip" }), me ? "PRESS TO START · 点击开始" : "PRESS TO START · 登录载入")
  const splash = h("div", { class: "cine__splash" },
    h("div", { class: "cine__kicker mono" }, "ETERNAL TENGRI ARCHIVE"),
    h("h1", { class: "cine__title serif" }, "长生天", h("span", { class: "cine__red" }, "計劃")),
    h("div", { class: "cine__sub mono" }, "艺作存档库 / ARCHIVE OF WORKS"),
    h("div", { class: "cine__greet" }, me ? (g.greet + "，" + name) : "尚未登入"),
    startBtn
  )

  const menu = h("div", { class: "cine__menu" })
  let cards = []
  function buildMenu(extra) {
    clear(menu)
    const items = extra ? [extra, ...MENU] : MENU.slice()
    cards = items.map((m, i) => {
      const card = h("button", { class: "gtab" + (m.cont ? " gtab--cont" : ""), type: "button", style: "--i:" + i },
        h("span", { class: "gtab__edge" }),
        h("div", { class: "gtab__n mono" }, m.n),
        h("div", { class: "gtab__en mono" }, m.en),
        h("div", { class: "gtab__zh serif" }, m.zh),
        h("div", { class: "gtab__desc mono tiny" }, m.desc))
      card.addEventListener("click", () => navTo(m.to))
      menu.append(card)
      return card
    })
  }
  buildMenu(null)
  stage.append(splash, menu)
  root.append(cine)

  let started = false
  let mx = 0, my = 0, tmx = 0, tmy = 0, raf = null

  function loop() {
    mx += (tmx - mx) * 0.06
    my += (tmy - my) * 0.06
    world.style.transform = "rotateX(" + (-my * 4.5).toFixed(2) + "deg) rotateY(" + (mx * 4.5).toFixed(2) + "deg)"
    ;[bg, grunge].forEach((el) => {
      const d = parseFloat(el.dataset.depth) || 0
      el.style.transform = "translate3d(" + (mx * d * 160).toFixed(1) + "px," + (my * d * 160).toFixed(1) + "px,0)"
    })
    seal.style.transform = "translate(-50%,-50%) translate3d(" + (mx * 21).toFixed(1) + "px," + (my * 21).toFixed(1) + "px,0)"
    raf = requestAnimationFrame(loop)
  }
  function onMove(e) {
    tmx = (e.clientX / window.innerWidth - 0.5) * 2
    tmy = (e.clientY / window.innerHeight - 0.5) * 2
  }

  function start() {
    if (started) return
    started = true
    cine.classList.add("on")
  }

  function navTo(to) {
    if (!to) return
    if (tame) { go(to); return }
    cine.classList.add("leaving")
    setTimeout(() => go(to), 300)
  }

  startBtn.addEventListener("click", start)
  splash.addEventListener("click", start)
  const onKey = (e) => { if (!started && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); start() } }
  window.addEventListener("keydown", onKey)

  if (!tame) {
    window.addEventListener("mousemove", onMove)
    raf = requestAnimationFrame(loop)
  } else {
    start()
  }

  if (me) {
    api.get("/api/projects").then((r) => {
      const ps = r.projects || []
      if (ps.length) {
        buildMenu({ cont: true, n: "▶", en: "CONTINUE", zh: (ps[0].title || "档案").slice(0, 14), desc: "继续上次的档案", to: "/projects/" + ps[0].id })
      }
    }).catch(() => {})
    api.get("/api/stats").then((s) => {
      const t = s.totals || {}
      hud.textContent = "作品 " + (t.projects || 0) + "  ·  提交 " + (t.versions || 0) + "  ·  成员 " + (t.members || 0)
    }).catch(() => { hud.textContent = "MMXXVI · NETLIFY · BLOBS" })
  } else {
    hud.textContent = "MMXXVI · NETLIFY · BLOBS"
  }

  return {
    destroy() {
      document.body.classList.remove("home-dark")
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("keydown", onKey)
      if (raf) cancelAnimationFrame(raf)
      clearScroll()
    }
  }
}
