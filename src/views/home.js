import { h, clear } from "../lib/dom.js"
import { GRADES } from "../lib/grades.js"
import { reveal, entrance, scrollReveal, countUp, clearScroll, gsap, tame } from "../lib/anim.js"
import { projectCard } from "../components/project-card.js"
import { session } from "../lib/store.js"
import { api } from "../lib/api.js"

function hero() {
  const bg = h("div", { class: "hero__bg" }, h("i", { class: "hb1" }), h("i", { class: "hb2" }), h("i", { class: "hb3" }), h("i", { class: "hb4" }))
  return h("section", { class: "hero" },
    bg,
    h("div", { class: "wrap" },
      h("div", { class: "hero__grid" },
        h("div", {},
          h("span", { class: "kicker rv" }, "长生天计划 · 艺作存档库"),
          h("h1", { class: "hero__title rv" }, h("em", {}, "长生天"), h("span", { class: "l2" }, "计划艺作存档库")),
          h("div", { class: "hero__meta rv" },
            h("span", {}, h("b", {}, "版本存档"), " / 每次更新即一次提交"),
            h("span", {}, h("b", {}, "变更可视化"), " / 时间轴 · 回滚 · 对比"),
            h("span", {}, h("b", {}, "五级归档"), " / ALEPH → ZAYIN")
          ),
          h("div", { class: "hero__cta rv" },
            h("a", { class: "btn btn--red btn--block", href: "/projects", "data-link": "1" }, "进入项目库"),
            h("a", { class: "btn btn--ghost", href: "/activity", "data-link": "1" }, "活动与统计")
          )
        ),
        h("div", { class: "hero__index rv" }, h("span", { class: "hero__index__g" }, "天"))
      ),
      h("div", { class: "gradebar rv" }, ...GRADES.map((g) => h("div", { "data-grade": g.key }, g.key, h("small", {}, g.zh + " · " + g.note))))
    )
  )
}

function ladder() {
  return h("section", { class: "section" },
    h("div", { class: "wrap" },
      h("div", { class: "section__head" },
        h("div", {}, h("span", { class: "kicker" }, "Classification / 分级体系"), h("h2", { class: "h-section", style: "margin-top:14px" }, "风险等级，自高至低")),
        h("p", { class: "lede" }, "借自 Project Moon 的五阶风险标记——每件作品依其分量被收入相应层级，颜色贯穿全库。")
      ),
      h("div", { class: "glist" },
        ...GRADES.map((g, i) => h("div", { class: "grow", "data-grade": g.key },
          h("div", { class: "grow__rank" }, String(i + 1).padStart(2, "0")),
          h("div", { class: "grow__name" }, g.key, h("span", {}, g.zh + " · " + g.note)),
          h("div", { class: "grow__bar" })
        ))
      )
    )
  )
}

export default function home(root) {
  const works = h("div", { class: "grid-cards" })
  const wall = h("div", { class: "numwall" })

  const worksSec = h("section", { class: "section", style: "padding-top:0" },
    h("div", { class: "wrap" },
      h("div", { class: "section__head" },
        h("div", {}, h("span", { class: "kicker" }, "Recent / 最近收录"), h("h2", { class: "h-section", style: "margin-top:14px" }, "档案预览")),
        h("a", { class: "btn btn--sm btn--ghost", href: "/projects", "data-link": "1" }, "查看全部 →")
      ),
      works
    )
  )
  const wallSec = h("section", { class: "section", style: "padding-top:0" },
    h("div", { class: "wrap" }, h("span", { class: "kicker", style: "margin-bottom:20px;display:inline-flex" }, "Ledger / 总账"), wall)
  )

  const view = h("div", { class: "page page--home" }, hero(), h("hr", { class: "rule rule--thick" }), ladder(), worksSec, wallSec)
  root.append(view)

  reveal(view.querySelectorAll(".hero .rv"), { stagger: 0.09, y: 50 })
  if (!tame) {
    entrance(view.querySelectorAll(".hero__bg i"), { scale: 0.6, autoAlpha: 0, duration: 1.1, ease: "expo.out", stagger: 0.08, delay: 0.1 })
    gsap.to(view.querySelector(".hero__index__g"), { y: -16, duration: 2.4, ease: "sine.inOut", repeat: -1, yoyo: true })
  }
  scrollReveal(view, ".grow")

  if (session.me) hydrate()
  else gate()

  function gate() {
    clear(works)
    works.append(h("div", { class: "empty", style: "grid-column:1/-1" },
      h("div", { class: "mono" }, "登录后浏览全部档案"),
      h("a", { class: "btn btn--red btn--lg", href: "/login", "data-link": "1", style: "margin-top:16px" }, "登录 / 注册")
    ))
    wall.append(...[["EST.", "MMXXVI"], ["GRADES", "5"], ["ENGINE", "NETLIFY"], ["STORE", "BLOBS"]].map(([k, v]) =>
      h("div", { class: "num" }, h("div", { class: "num__v", style: "font-size:clamp(28px,4vw,52px)" }, v), h("div", { class: "num__k" }, k))))
  }

  async function hydrate() {
    try {
      const r = await api.get("/api/projects")
      clear(works)
      if (!r.projects.length) works.append(h("div", { class: "empty", style: "grid-column:1/-1" }, h("div", { class: "mono" }, "档案库还空着"), h("a", { class: "btn btn--red", href: "/projects", "data-link": "1", style: "margin-top:14px" }, "+ 新建第一个项目")))
      else r.projects.slice(0, 6).forEach((p, i) => { p.no = i + 1; works.append(projectCard(p)) })
      scrollReveal(view, ".grid-cards .card", { y: 60 })
    } catch { clear(works) }
    try {
      const s = await api.get("/api/stats")
      const items = [["Works / 作品", s.totals.projects], ["Commits / 提交", s.totals.versions], ["Layers / 图层", s.totals.layers], ["Members / 成员", s.totals.members]]
      clear(wall)
      items.forEach(([k, v]) => wall.append(h("div", { class: "num" }, h("div", { class: "num__v", "data-to": v }, "0"), h("div", { class: "num__k" }, k))))
      wall.querySelectorAll(".num__v").forEach((el) => countUp(el, +el.dataset.to, { trigger: el }))
    } catch (e) { void e }
  }

  return { destroy: clearScroll }
}
