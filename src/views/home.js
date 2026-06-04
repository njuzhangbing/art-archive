import { h, clear } from "../lib/dom.js"
import { GRADES } from "../lib/grades.js"
import { reveal, entrance, scrollReveal, countUp, clearScroll, gsap, tame } from "../lib/anim.js"
import { projectCard } from "../components/project-card.js"
import { projectFormModal } from "../components/project-form.js"
import { session } from "../lib/store.js"
import { api } from "../lib/api.js"
import { toast } from "../components/toast.js"
import { quoteFor } from "../lib/quotes.js"
import { go } from "../router.js"

const DAY = 86400000
const ymd = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0")

function computeStreak(daily) {
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  let cursor = new Date(today)
  if (!daily[ymd(today)]) cursor = new Date(today.getTime() - DAY)
  let streak = 0
  while (daily[ymd(cursor)]) { streak++; cursor = new Date(cursor.getTime() - DAY) }
  let week = 0
  for (let i = 0; i < 7; i++) week += daily[ymd(new Date(today.getTime() - i * DAY))] || 0
  return { streak, week }
}

export default function home(root) {
  const me = session.me
  const name = me ? (me.displayName || me.handle) : "你"
  let projects = []

  const quoteEl = h("blockquote", { class: "quote serif" })
  const byEl = h("div", { class: "quote__by mono" })
  const streakEl = h("div", { class: "streak" })

  function roll() {
    const q = quoteFor(name)
    const apply = () => {
      quoteEl.textContent = q.text
      byEl.textContent = q.by ? "—— " + q.by : (me ? "@" + me.handle + " · 长生天计划" : "长生天计划 · 创作者语录")
    }
    if (tame) { apply(); return }
    gsap.to([quoteEl, byEl], {
      autoAlpha: 0, y: 10, duration: 0.16, onComplete() {
        apply()
        gsap.to([quoteEl, byEl], { autoAlpha: 1, y: 0, duration: 0.45, ease: "expo.out", stagger: 0.06 })
      }
    })
  }

  const reroll = h("button", { class: "btn btn--sm reroll", onClick: roll }, "换一句 ↻")
  const cta = h("div", { class: "hero__cta rv" },
    me ? h("button", { class: "btn btn--red btn--block", onClick: newProject }, "+ 新建项目")
      : h("a", { class: "btn btn--red btn--block", href: "/login", "data-link": "1" }, "登录 / 注册"),
    h("a", { class: "btn btn--ghost", href: me ? "/projects" : "/login", "data-link": "1" }, "进入项目库")
  )

  const hero = h("section", { class: "hero hero--quote" },
    h("div", { class: "hero__bg" }, h("i", { class: "hb1" }), h("i", { class: "hb2" }), h("i", { class: "hb3" })),
    h("div", { class: "wrap" },
      h("span", { class: "kicker rv" }, "长生天计划 · 创作者语录"),
      h("div", { class: "quote__wrap rv" }, quoteEl, byEl),
      h("div", { class: "hero__row rv" }, reroll, streakEl),
      cta,
      h("div", { class: "gradestrip rv" }, ...GRADES.map((g) => h("div", { "data-grade": g.key }, g.key)))
    )
  )

  const recentGrid = h("div", { class: "grid-cards" })
  const recentSec = h("section", { class: "section" }, h("div", { class: "wrap" },
    h("div", { class: "section__head" },
      h("div", {}, h("span", { class: "kicker" }, "Continue / 继续创作"), h("h2", { class: "h-section", style: "margin-top:12px" }, "最近的档案")),
      h("div", { class: "hgap" },
        h("button", { class: "btn btn--sm", onClick: randomJump }, "🎲 随机回顾"),
        h("a", { class: "btn btn--sm btn--ghost", href: me ? "/projects" : "/login", "data-link": "1" }, "查看全部 →"))
    ),
    recentGrid
  ))

  const wall = h("div", { class: "numwall" })
  const wallSec = h("section", { class: "section", style: "padding-top:0" }, h("div", { class: "wrap" },
    h("span", { class: "kicker", style: "display:inline-flex;margin-bottom:20px" }, "Ledger / 总账"), wall))

  const view = h("div", { class: "page page--home" }, hero, h("hr", { class: "rule rule--thick" }), recentSec, wallSec)
  root.append(view)

  roll()
  reveal(view.querySelectorAll(".hero .rv"), { stagger: 0.08, y: 40 })
  if (!tame) entrance(view.querySelectorAll(".hero__bg i"), { scale: 0.6, autoAlpha: 0, duration: 1.1, ease: "expo.out", stagger: 0.1, delay: 0.1 })

  if (me) hydrate()
  else gate()

  function newProject() { projectFormModal({ onSaved: () => loadRecent() }) }

  function randomJump() {
    if (!projects.length) { toast(me ? "还没有可回顾的档案" : "登录后才能回顾", "info"); return }
    go("/projects/" + projects[Math.floor(Math.random() * projects.length)].id)
  }

  function chip(icon, text) { return h("span", { class: "chipi mono tiny" }, h("b", {}, icon), text) }
  function numCell(k, v) { return h("div", { class: "num" }, h("div", { class: "num__v", "data-to": v }, "0"), h("div", { class: "num__k" }, k)) }

  function emptyGuide() {
    const step = (n, t, d) => h("div", { class: "gstep" }, h("span", { class: "gstep__n mono" }, n), h("div", {}, h("b", {}, t), h("span", { class: "mono tiny muted" }, d)))
    return h("div", { class: "empty guide", style: "grid-column:1/-1" },
      h("div", { class: "mono", style: "letter-spacing:.2em;text-transform:uppercase;opacity:.6" }, "三步开始你的第一个档案"),
      h("div", { class: "guide__steps" },
        step("01", "新建项目", "选个分级，起个标题"),
        step("02", "上传更新", "拖入图片 / 视频 / PSD，每次即一个版本"),
        step("03", "回滚 · 对比", "时间轴回看往期，滑块对比变化")),
      me ? h("button", { class: "btn btn--red btn--lg", style: "margin-top:6px", onClick: newProject }, "+ 新建第一个项目") : null
    )
  }

  async function loadRecent() {
    try {
      const r = await api.get("/api/projects")
      projects = r.projects
      clear(recentGrid)
      if (!projects.length) { recentGrid.append(emptyGuide()); return }
      projects.slice(0, 6).forEach((p, i) => { p.no = i + 1; recentGrid.append(projectCard(p)) })
      scrollReveal(view, ".grid-cards .card", { y: 40 })
    } catch { clear(recentGrid) }
  }

  async function hydrate() {
    await loadRecent()
    try {
      const s = await api.get("/api/stats")
      const st = computeStreak(s.myDaily || {})
      const mine = projects.filter((p) => me && p.author === me.handle).length
      clear(streakEl)
      streakEl.append(chip("🔥", "连续创作 " + st.streak + " 天"), chip("✦", "本周 " + st.week + " 次提交"), chip("◆", "我的项目 " + mine + " 个"))
      clear(wall)
      const nums = [["Works / 作品", s.totals.projects], ["Commits / 提交", s.totals.versions], ["Layers / 图层", s.totals.layers], ["Members / 成员", s.totals.members]]
      nums.forEach(([k, v]) => wall.append(numCell(k, v)))
      wall.querySelectorAll(".num__v").forEach((el) => countUp(el, +el.dataset.to, { trigger: el }))
    } catch (e) { void e }
  }

  function gate() {
    clear(recentGrid)
    recentGrid.append(h("div", { class: "empty", style: "grid-column:1/-1" },
      h("div", { class: "mono" }, "登录后浏览并续作你的档案"),
      h("a", { class: "btn btn--red btn--lg", href: "/login", "data-link": "1", style: "margin-top:16px" }, "登录 / 注册")))
    clear(wall);
    [["EST.", "MMXXVI"], ["ENGINE", "NETLIFY"], ["STORE", "BLOBS"], ["GRADES", "5"]].forEach(([k, v]) =>
      wall.append(h("div", { class: "num" }, h("div", { class: "num__v", style: "font-size:clamp(26px,4vw,48px)" }, v), h("div", { class: "num__k" }, k))))
  }

  return { destroy: clearScroll }
}
