import { h, clear } from "../lib/dom.js"
import { api } from "../lib/api.js"
import { gradeOf } from "../lib/grades.js"
import { heatmap } from "../components/heatmap.js"
import { gradeBars, typeBar, rankList } from "../components/charts.js"
import { countUp, reveal, clearScroll } from "../lib/anim.js"

export default function stats(root) {
  const view = h("div", { class: "wrap statsv" }, h("div", { class: "muted mono", style: "padding:60px 0" }, "汇总中…"))
  root.append(view)

  api.get("/api/stats").then(render).catch((err) => {
    clear(view)
    view.append(h("div", { class: "soon" }, h("h2", {}, "—"), h("p", {}, err.message || "加载失败")))
  })

  function render(s) {
    clear(view)
    view.append(head(), numbers(s.totals), heatBlock(s.daily), grids(s))
    reveal([...view.children], { y: 24, stagger: 0.06 })
    view.querySelectorAll(".num__v").forEach((el) => countUp(el, +el.dataset.to, { trigger: el }))
  }

  function head() {
    return h("div", { class: "section__head" },
      h("div", {}, h("span", { class: "kicker" }, "Activity / 活动与统计"), h("h1", { class: "h-section", style: "margin-top:12px" }, "全库总账"))
    )
  }

  function numbers(t) {
    const items = [
      { k: "Projects / 项目", v: t.projects },
      { k: "Commits / 提交", v: t.versions },
      { k: "Files / 文件", v: t.files },
      { k: "Layers / 图层", v: t.layers },
      { k: "Members / 成员", v: t.members }
    ]
    return h("div", { class: "numwall", style: "margin-bottom:30px" },
      ...items.map((s) => h("div", { class: "num" }, h("div", { class: "num__v", "data-to": s.v }, "0"), h("div", { class: "num__k" }, s.k)))
    )
  }

  function heatBlock(daily) {
    const total = Object.values(daily).reduce((a, b) => a + b, 0)
    return h("section", { class: "panel" },
      h("div", { class: "panel__head" }, h("span", { class: "kicker" }, "Contribution / 贡献热力图"), h("span", { class: "mono tiny muted" }, "近 53 周 · 共 " + total + " 次提交")),
      heatmap(daily)
    )
  }

  function grids(s) {
    return h("div", { class: "statgrid" },
      h("div", { class: "panel" }, h("div", { class: "panel__head" }, h("span", { class: "kicker" }, "Grades / 分级分布")), gradeBars(s.grades)),
      h("div", { class: "panel" }, h("div", { class: "panel__head" }, h("span", { class: "kicker" }, "Types / 文件类型")), typeBar(s.types)),
      h("div", { class: "panel" }, h("div", { class: "panel__head" }, h("span", { class: "kicker" }, "Top / 最多版本")),
        rankList(s.topProjects, (p) => h("a", { class: "rankrow__main", href: "/projects/" + p.id, "data-link": "1" },
          h("span", { class: "badge", "data-grade": p.grade, style: "padding:2px 7px" }, p.grade),
          h("b", {}, p.title), h("span", { class: "mono tiny muted" }, "v" + p.versions)))),
      h("div", { class: "panel" }, h("div", { class: "panel__head" }, h("span", { class: "kicker" }, "Authors / 活跃贡献者")),
        rankList(s.topContributors, (c) => h("div", { class: "rankrow__main" }, h("b", { class: "mono" }, "@" + c.handle), h("span", { class: "mono tiny muted" }, c.count + " 次提交"))))
    )
  }

  return { destroy: clearScroll }
}
