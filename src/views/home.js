import { h } from "../lib/dom.js"
import { GRADES } from "../lib/grades.js"
import { reveal, entrance, scrollReveal, countUp, clearScroll, gsap, tame } from "../lib/anim.js"
import { projectCard } from "../components/project-card.js"

const sampleWorks = [
  { id: "demo-a", no: 1, title: "锈红广场的清晨", grade: "ALEPH", tags: ["油画", "城市"], versions: 7, updatedAt: Date.now() - 3600e3 * 5, author: "muye" },
  { id: "demo-b", no: 2, title: "齿轮与白鸽", grade: "WAW", tags: ["插画"], versions: 4, updatedAt: Date.now() - 86400e3 * 2, author: "kira" },
  { id: "demo-c", no: 3, title: "黄昏电报", grade: "HE", tags: ["速涂", "概念"], versions: 12, updatedAt: Date.now() - 86400e3 * 1, author: "muye" },
  { id: "demo-d", no: 4, title: "蓝图练习 No.18", grade: "TETH", tags: ["线稿"], versions: 2, updatedAt: Date.now() - 3600e3 * 30, author: "lou" },
  { id: "demo-e", no: 5, title: "苔原的呼吸", grade: "ZAYIN", tags: ["风景", "水彩"], versions: 5, updatedAt: Date.now() - 86400e3 * 6, author: "kira" },
  { id: "demo-f", no: 6, title: "无题构成", grade: "WAW", tags: ["拼贴"], versions: 9, updatedAt: Date.now() - 86400e3 * 9, author: "lou" }
]

function hero() {
  const bg = h("div", { class: "hero__bg" }, h("i", { class: "hb1" }), h("i", { class: "hb2" }), h("i", { class: "hb3" }), h("i", { class: "hb4" }))
  const bars = GRADES.map((g) =>
    h("div", { "data-grade": g.key }, g.key, h("small", {}, g.zh + " · " + g.note))
  )
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
      h("div", { class: "gradebar rv" }, ...bars)
    )
  )
}

function ladder() {
  return h("section", { class: "section" },
    h("div", { class: "wrap" },
      h("div", { class: "section__head" },
        h("div", {},
          h("span", { class: "kicker" }, "Classification / 分级体系"),
          h("h2", { class: "h-section", style: "margin-top:14px" }, "风险等级，自高至低")
        ),
        h("p", { class: "lede" }, "借自 Project Moon 的五阶风险标记——每件作品依其分量被收入相应层级，颜色贯穿全库。")
      ),
      h("div", { class: "glist" },
        ...GRADES.map((g, i) =>
          h("div", { class: "grow", "data-grade": g.key },
            h("div", { class: "grow__rank" }, String(i + 1).padStart(2, "0")),
            h("div", { class: "grow__name" }, g.key, h("span", {}, g.zh + " · " + g.note)),
            h("div", { class: "grow__bar" })
          )
        )
      )
    )
  )
}

function works() {
  return h("section", { class: "section", style: "padding-top:0" },
    h("div", { class: "wrap" },
      h("div", { class: "section__head" },
        h("div", {},
          h("span", { class: "kicker" }, "Recent / 最近收录"),
          h("h2", { class: "h-section", style: "margin-top:14px" }, "档案预览")
        ),
        h("span", { class: "note" }, "示例数据 ·", h("b", {}, "DEMO"), "· 项目板块上线后替换")
      ),
      h("div", { class: "grid-cards" }, ...sampleWorks.map(projectCard))
    )
  )
}

function wall() {
  const stats = [
    { k: "Works / 作品", v: 128 },
    { k: "Commits / 提交", v: 1426 },
    { k: "Layers / 图层", v: 9032 },
    { k: "Members / 成员", v: 6 }
  ]
  const nums = stats.map((s) =>
    h("div", { class: "num" }, h("div", { class: "num__v", "data-to": s.v }, "0"), h("div", { class: "num__k" }, s.k))
  )
  return h("section", { class: "section", style: "padding-top:0" },
    h("div", { class: "wrap" },
      h("span", { class: "kicker", style: "margin-bottom:20px;display:inline-flex" }, "Ledger / 总账"),
      h("div", { class: "numwall" }, ...nums)
    )
  )
}

export default function home(root) {
  const view = h("div", { class: "page page--home" }, hero(), h("hr", { class: "rule rule--thick" }), ladder(), works(), wall())
  root.append(view)

  reveal(view.querySelectorAll(".hero .rv"), { stagger: 0.09, y: 50 })
  if (!tame) {
    entrance(view.querySelectorAll(".hero__bg i"), { scale: 0.6, autoAlpha: 0, duration: 1.1, ease: "expo.out", stagger: 0.08, delay: 0.1 })
    gsap.to(view.querySelector(".hero__index__g"), { y: -16, duration: 2.4, ease: "sine.inOut", repeat: -1, yoyo: true })
  }
  scrollReveal(view, ".grow")
  scrollReveal(view, ".grid-cards .card", { y: 60 })
  view.querySelectorAll(".num__v").forEach((el) => countUp(el, +el.dataset.to, { trigger: el }))

  return { destroy: clearScroll }
}
