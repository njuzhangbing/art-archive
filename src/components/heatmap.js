import { h } from "../lib/dom.js"
import { tame, gsap } from "../lib/anim.js"

const DAY = 86400000
const ymd = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0")

export function heatmap(daily, opts = {}) {
  const weeks = opts.weeks || 53
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  const start = new Date(today.getTime() - ((weeks - 1) * 7 + today.getDay()) * DAY)

  let max = 1
  for (const k in daily) if (daily[k] > max) max = daily[k]
  const level = (c) => (!c ? 0 : c >= max ? 4 : Math.max(1, Math.ceil((c / max) * 4)))

  const grid = h("div", { class: "hm__grid", style: "grid-template-columns:repeat(" + weeks + ",1fr)" })
  const cells = []
  let cur = new Date(start)
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const key = ymd(cur)
      const c = daily[key] || 0
      const cell = h("i", { class: "hm__c", "data-l": cur > today ? "x" : level(c), title: key + " · " + c + " 次提交", style: "grid-row:" + (d + 1) + ";grid-column:" + (w + 1) })
      grid.append(cell)
      cells.push(cell)
      cur = new Date(cur.getTime() + DAY)
    }
  }

  const wrap = h("div", { class: "hm" },
    h("div", { class: "hm__scroll" }, grid),
    h("div", { class: "hm__legend mono tiny" }, "少", ...[0, 1, 2, 3, 4].map((l) => h("i", { class: "hm__c", "data-l": l })), "多")
  )
  if (!tame) gsap.from(cells, { autoAlpha: 0, scale: 0.3, duration: 0.5, ease: "power2.out", stagger: { each: 0.0014, from: "start" } })
  return wrap
}
