import { h, clear } from "../lib/dom.js"
import { tame, clearScroll } from "../lib/anim.js"
import { session } from "../lib/store.js"
import { api } from "../lib/api.js"
import { go } from "../router.js"
import { greetingFor } from "../lib/greeting.js"

const MENU = [
  { n: "01", en: "START · 作品档案", zh: "开始", to: "/projects" },
  { n: "02", en: "STATS · 创作总账", zh: "统计", to: "/activity" },
  { n: "03", en: "CHARACTERS · 名录立绘", zh: "角色", to: "/characters" },
  { n: "04", en: "COMMUNITY · 频道博客", zh: "社区", to: "/talk" }
]

export default function home(root) {
  const me = session.me
  const name = me ? (me.displayName || me.handle) : "访客"
  document.body.classList.add("home-dark")

  const bg = h("div", { class: "cine__layer cine__bg", "data-depth": "0.02" })
  const haze = h("div", { class: "cine__layer cine__haze", "data-depth": "0.06" })
  const world = h("div", { class: "cine__world" }, bg, haze)
  const grain = h("div", { class: "cine__grain" })
  const vignette = h("div", { class: "cine__vignette" })
  const hud = h("div", { class: "cine__hud mono tiny" })
  const cine = h("div", { class: "cine" }, world, grain, vignette,
    h("div", { class: "cine__bar cine__bar--t" }), h("div", { class: "cine__bar cine__bar--b" }), hud)

  const g = greetingFor(name)
  const startBtn = h("button", { class: "cine__start mono", type: "button" }, h("span", { class: "blip" }), "PRESS TO START")
  const splash = h("div", { class: "cine__splash" },
    h("div", { class: "cine__kicker mono" }, "ETERNAL TENGRI ARCHIVE"),
    h("h1", { class: "cine__title serif" }, "长生天", h("span", { class: "cine__accent" }, "計劃")),
    h("div", { class: "cine__sub mono" }, "艺作存档库 / ARCHIVE OF WORKS"),
    h("div", { class: "cine__greet" }, me ? (g.greet + "，" + name) : "尚未登入 · 点击载入"),
    startBtn
  )

  const menu = h("nav", { class: "cine__menu" })
  function buildMenu(extra) {
    clear(menu)
    const items = extra ? [extra, ...MENU] : MENU.slice()
    items.forEach((m, i) => {
      const row = h("button", { class: "gtab" + (m.cont ? " gtab--cont" : ""), type: "button", style: "--i:" + i },
        h("span", { class: "gtab__bar" }),
        h("span", { class: "gtab__n mono" }, m.n),
        h("span", { class: "gtab__labels" },
          h("span", { class: "gtab__zh serif" }, m.zh),
          h("span", { class: "gtab__en mono tiny" }, m.en)),
        h("span", { class: "gtab__arrow mono" }, "→"))
      row.addEventListener("click", () => navTo(m.to))
      row.addEventListener("mouseenter", () => cine.classList.add("focus"))
      row.addEventListener("mouseleave", () => cine.classList.remove("focus"))
      menu.append(row)
    })
  }
  buildMenu(null)

  const panel = h("div", { class: "cine__panel" },
    h("div", { class: "cine__titlemini serif" }, "长生天", h("span", { class: "cine__accent" }, "計劃")),
    menu)

  cine.append(splash, panel)
  root.append(cine)

  let started = false
  let mx = 0, my = 0, tmx = 0, tmy = 0, raf = null
  function loop() {
    mx += (tmx - mx) * 0.05
    my += (tmy - my) * 0.05
    world.style.transform = "rotateX(" + (-my * 2.2).toFixed(2) + "deg) rotateY(" + (mx * 2.2).toFixed(2) + "deg)"
    ;[bg, haze].forEach((el) => {
      const d = parseFloat(el.dataset.depth) || 0
      el.style.transform = "translate3d(" + (mx * d * 200).toFixed(1) + "px," + (my * d * 200).toFixed(1) + "px,0)"
    })
    raf = requestAnimationFrame(loop)
  }
  function onMove(e) { tmx = (e.clientX / window.innerWidth - 0.5) * 2; tmy = (e.clientY / window.innerHeight - 0.5) * 2 }

  function start() { if (started) return; started = true; cine.classList.add("on") }
  function navTo(to) { if (!to) return; if (tame) { go(to); return } cine.classList.add("leaving"); setTimeout(() => go(to), 320) }

  startBtn.addEventListener("click", (e) => { e.stopPropagation(); start() })
  splash.addEventListener("click", start)
  const onKey = (e) => { if (!started && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); start() } }
  window.addEventListener("keydown", onKey)

  if (!tame) { window.addEventListener("mousemove", onMove); raf = requestAnimationFrame(loop) } else { start() }

  if (me) {
    api.get("/api/projects").then((r) => {
      const ps = r.projects || []
      if (ps.length) buildMenu({ cont: true, n: "▶", en: "CONTINUE · 上次的档案", zh: (ps[0].title || "继续").slice(0, 10), to: "/projects/" + ps[0].id })
    }).catch(() => {})
    api.get("/api/stats").then((s) => { const t = s.totals || {}; hud.textContent = "作品 " + (t.projects || 0) + "　·　提交 " + (t.versions || 0) + "　·　成员 " + (t.members || 0) }).catch(() => { hud.textContent = "MMXXVI · NETLIFY · BLOBS" })
  } else { hud.textContent = "MMXXVI · NETLIFY · BLOBS" }

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
