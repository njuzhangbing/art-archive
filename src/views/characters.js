import { h, clear } from "../lib/dom.js"
import { api } from "../lib/api.js"
import { GRADES, gradeRank } from "../lib/grades.js"
import { DAMAGE } from "../lib/damage.js"
import { characterCard } from "../components/character-card.js"
import { characterFormModal } from "../components/character-form.js"
import { personaBanners } from "../components/persona-banners.js"
import { reveal } from "../lib/anim.js"
import { toast } from "../components/toast.js"

export default function characters(root) {
  let all = []
  const pickG = new Set()
  const pickD = new Set()
  let q = ""
  let persona = null

  const banners = personaBanners((key) => { persona = persona === key ? null : key; banners.sync(persona); paint() }, () => persona)

  const gchips = GRADES.map((g) => h("button", { class: "chip", "data-grade": g.key, "data-on": "0" }, h("span", { class: "chip__dot" }), g.key))
  gchips.forEach((c) => c.addEventListener("click", () => { toggle(pickG, c.getAttribute("data-grade"), c); paint() }))

  const dchips = DAMAGE.map((d) => h("button", { class: "chip chip--dmg", "data-dmg": d.key, "data-on": "0" }, h("img", { src: d.icon, alt: "" }), d.label))
  dchips.forEach((c) => c.addEventListener("click", () => { toggle(pickD, c.getAttribute("data-dmg"), c); paint() }))

  function toggle(set, key, el) { if (set.has(key)) set.delete(key); else set.add(key); el.setAttribute("data-on", set.has(key) ? "1" : "0") }

  const searchBox = h("input", { placeholder: "搜索角色名 / 编号…", "aria-label": "搜索" })
  searchBox.addEventListener("input", (e) => { q = e.target.value.trim().toLowerCase(); paint() })

  const grid = h("div", { class: "charlist" })
  const count = h("span", { class: "mono tiny muted pcount" }, "")

  const head = h("div", { class: "section__head" },
    h("div", {}, h("span", { class: "kicker" }, "Characters / 角色档案"), h("h1", { class: "h-section", style: "margin-top:12px" }, "角色名录")),
    h("button", { class: "btn btn--red", onClick: create }, "+ 新建角色")
  )
  const bar = h("div", { class: "filters filters--char" },
    h("div", { class: "search" }, h("span", { class: "search__ic" }, "⌕"), searchBox),
    h("div", { class: "chiprow" }, ...gchips),
    h("div", { class: "chiprow" }, ...dchips)
  )

  const view = h("div", { class: "wrap characters" }, head, banners, bar, count, grid)
  root.append(view)

  function create() { characterFormModal({ onSaved: (c) => { all.unshift(c); paint() } }) }

  function paint() {
    let rows = all.slice()
    if (persona) rows = rows.filter((c) => (c.persona || "FULL") === persona)
    if (pickG.size) rows = rows.filter((c) => pickG.has(c.grade))
    if (pickD.size) rows = rows.filter((c) => pickD.has(c.damage))
    if (q) rows = rows.filter((c) => (c.name + " " + (c.code || "")).toLowerCase().includes(q))
    rows.sort((a, b) => gradeRank(a.grade) - gradeRank(b.grade) || (a.updatedAt < b.updatedAt ? 1 : -1))
    clear(grid)
    count.textContent = rows.length + " / " + all.length + " 名"
    if (!rows.length) { grid.append(empty()); return }
    rows.forEach((c) => grid.append(characterCard(c)))
    reveal([...grid.children], { y: 28, stagger: 0.04, duration: 0.55 })
  }

  function empty() {
    return h("div", { class: "empty", style: "grid-column:1/-1" },
      h("div", { class: "mono" }, all.length ? "无匹配角色" : "还没有角色档案"),
      all.length ? null : h("button", { class: "btn btn--red", style: "margin-top:16px", onClick: create }, "+ 建立第一个角色"))
  }

  async function boot() {
    reveal([head, banners, bar], { y: 20, stagger: 0.08 })
    try { const r = await api.get("/api/characters"); all = r.characters; paint() }
    catch (err) { toast(err.message || "加载失败", "bad"); grid.append(empty()) }
  }
  boot()
  return {}
}
