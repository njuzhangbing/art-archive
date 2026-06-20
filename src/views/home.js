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

function todayStr() {
  const d = new Date()
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0")
}

function focusChars(str, accent, offset) {
  return str.split("").map((c, i) => h("span", { class: "ch" + (accent ? " cine__accent" : ""), style: "--ci:" + (offset + i) }, c))
}

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
  const board = h("div", { class: "cine__console mono" })
  const cine = h("div", { class: "cine" }, world, grain, vignette,
    h("div", { class: "cine__bar cine__bar--t" }), h("div", { class: "cine__bar cine__bar--b" }), board, hud)

  const g = greetingFor(name)
  const splash = h("div", { class: "cine__splash" },
    h("div", { class: "cine__kicker mono" }, "PROJECT TANGRI CENTRAL DATABASE"),
    h("h1", { class: "cine__title serif" }, ...focusChars("长生天", false, 0), ...focusChars("计划", true, 3)),
    h("div", { class: "cine__sub mono" }, "艺作存档库 / ARCHIVE OF WORKS"),
    h("div", { class: "cine__greet" }, me ? (g.greet + "，" + name) : "尚未登入 · 点击载入"),
    h("div", { class: "cine__hint mono" }, "点击任意键开始")
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
    h("div", { class: "cine__titlemini serif" }, "长生天", h("span", { class: "cine__accent" }, "计划")),
    menu)

  cine.append(splash, panel)
  root.append(cine)

  const today = todayStr()
  function renderBoard(plan) {
    clear(board)
    const items = (plan && plan.items) || []
    const done = items.filter((x) => x.done).length
    board.append(
      h("div", { class: "cc__top" }, h("span", { class: "cc__dot" }), h("span", { class: "cc__h" }, "今日计划"), h("span", { class: "cc__date" }, today)),
      h("div", { class: "cc__rule" }))
    if (!items.length) {
      board.append(h("div", { class: "cc__empty" }, me ? "// 暂无指令 · STANDBY" : "// 登入后载入指令"))
      return
    }
    const list = h("div", { class: "cc__list" })
    items.slice(0, 6).forEach((it) => {
      const label = it.kind === "version" ? (it.projectTitle || "提交更新")
        : it.kind === "images" ? ("产出画作 " + (it.progress || 0) + " / " + it.count)
        : (it.text || "")
      list.append(h("div", { class: "cc__item" + (it.done ? " is-done" : "") },
        h("span", { class: "cc__box" }, it.done ? "✓" : "·"), h("span", { class: "cc__txt" }, label)))
    })
    board.append(list, h("div", { class: "cc__foot" }, h("span", {}, done + " / " + items.length + " EXECUTED"), h("span", { class: "cc__cursor" }, "▮")))
  }
  renderBoard(null)

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

  splash.addEventListener("click", start)
  const onKey = (e) => {
    if (started) return
    if (e.metaKey || e.ctrlKey || e.altKey) return
    if (["Shift", "Control", "Alt", "Meta", "Tab", "Escape", "F5", "F11", "F12"].includes(e.key)) return
    e.preventDefault(); start()
  }
  window.addEventListener("keydown", onKey)

  if (!tame) { window.addEventListener("mousemove", onMove); raf = requestAnimationFrame(loop) } else { start() }

  if (me) {
    api.get("/api/projects").then((r) => {
      const ps = r.projects || []
      if (ps.length) buildMenu({ cont: true, n: "▶", en: "CONTINUE · 上次的档案", zh: (ps[0].title || "继续").slice(0, 10), to: "/projects/" + ps[0].id })
    }).catch(() => {})
    api.get("/api/stats").then((s) => { const t = s.totals || {}; hud.textContent = "作品 " + (t.projects || 0) + "　·　提交 " + (t.versions || 0) + "　·　成员 " + (t.members || 0) }).catch(() => { hud.textContent = "MMXXVI · 长生天" })
    api.get("/api/plans?date=" + today).then((r) => renderBoard(r.plan)).catch(() => {})
  } else { hud.textContent = "MMXXVI · 长生天" }

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
