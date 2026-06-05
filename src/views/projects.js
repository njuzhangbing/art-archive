import { h, clear } from "../lib/dom.js"
import { api } from "../lib/api.js"
import { GRADES, gradeRank } from "../lib/grades.js"
import { projectCard } from "../components/project-card.js"
import { projectFormModal } from "../components/project-form.js"
import { reveal } from "../lib/anim.js"
import { toast } from "../components/toast.js"

export default function projects(root) {
  let all = []
  const picked = new Set()
  let q = ""
  let sort = "recent"

  const chips = GRADES.map((g) =>
    h("button", { class: "chip", "data-grade": g.key, "data-on": "0", title: g.zh }, h("span", { class: "chip__dot" }), g.key)
  )
  chips.forEach((c) => c.addEventListener("click", () => {
    const k = c.getAttribute("data-grade")
    if (picked.has(k)) picked.delete(k); else picked.add(k)
    c.setAttribute("data-on", picked.has(k) ? "1" : "0")
    paint()
  }))

  const searchBox = h("input", { placeholder: "搜索标题 / 标签 / 作者…", "aria-label": "搜索" })
  searchBox.addEventListener("input", (e) => { q = e.target.value.trim().toLowerCase(); paint() })

  const sortSel = h("select", {},
    h("option", { value: "recent" }, "最近更新"),
    h("option", { value: "grade" }, "分级 高→低"),
    h("option", { value: "name" }, "名称 A–Z"),
    h("option", { value: "versions" }, "版本最多"),
    h("option", { value: "stars" }, "收藏最多")
  )
  sortSel.addEventListener("change", (e) => { sort = e.target.value; paint() })

  const grid = h("div", { class: "grid-cards" })
  const count = h("span", { class: "mono tiny muted pcount" }, "")

  const head = h("div", { class: "section__head" },
    h("div", {}, h("span", { class: "kicker" }, "Projects / 项目库"), h("h1", { class: "h-section", style: "margin-top:12px" }, "档案总览")),
    h("button", { class: "btn btn--red", onClick: create }, "+ 新建项目")
  )
  const bar = h("div", { class: "filters" },
    h("div", { class: "search" }, h("span", { class: "search__ic" }, "⌕"), searchBox),
    h("div", { class: "select" }, sortSel),
    ...chips
  )

  const view = h("div", { class: "wrap projects" }, head, bar, count, grid)
  root.append(view)

  function create() {
    projectFormModal({ onSaved: (p) => { all.unshift(p); paint() } })
  }

  function paint() {
    let rows = all.slice()
    if (picked.size) rows = rows.filter((p) => picked.has(p.grade))
    if (q) rows = rows.filter((p) => (p.title + " " + (p.tags || []).join(" ") + " " + (p.author || "")).toLowerCase().includes(q))
    if (sort === "recent") rows.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    else if (sort === "grade") rows.sort((a, b) => gradeRank(a.grade) - gradeRank(b.grade) || (a.updatedAt < b.updatedAt ? 1 : -1))
    else if (sort === "name") rows.sort((a, b) => String(a.title).localeCompare(String(b.title), "zh"))
    else if (sort === "versions") rows.sort((a, b) => (b.versions || 0) - (a.versions || 0))
    else if (sort === "stars") rows.sort((a, b) => (b.starCount || 0) - (a.starCount || 0) || (a.updatedAt < b.updatedAt ? 1 : -1))

    clear(grid)
    count.textContent = rows.length + " / " + all.length + " 项"
    if (!rows.length) { grid.append(empty()); return }
    rows.forEach((p, i) => { p.no = i + 1; grid.append(projectCard(p)) })
    reveal([...grid.children], { y: 30, stagger: 0.04, duration: 0.6 })
  }

  function empty() {
    return h("div", { class: "empty" },
      h("div", { class: "mono" }, all.length ? "无匹配结果" : "档案库还空着"),
      all.length ? null : h("button", { class: "btn btn--red", style: "margin-top:16px", onClick: create }, "+ 新建第一个项目")
    )
  }

  async function boot() {
    reveal([head, bar], { y: 20, stagger: 0.08 })
    try { const r = await api.get("/api/projects"); all = r.projects; paint() }
    catch (err) { toast(err.message || "加载失败", "bad"); grid.append(empty()) }
  }
  boot()
  return {}
}
