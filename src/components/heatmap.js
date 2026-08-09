import { h } from "../lib/dom.js"
import { tame, gsap } from "../lib/anim.js"

const DAY = 86400000
const ymd = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0")

export function heatmap(daily, opts = {}) {
  const weeks = opts.weeks || 53
  const future = opts.future || 0
  const onPick = opts.onPickDay
  const plans = opts.plans || {}

  const today = new Date()
  today.setHours(12, 0, 0, 0)
  const todayStr = ymd(today)
  const start = new Date(today.getTime() - ((weeks - 1) * 7 + today.getDay()) * DAY)
  const end = new Date(today.getTime() + future * DAY)
  const totalCols = Math.floor((end - start) / (7 * DAY)) + 1

  let max = 1
  for (const k in daily) if (daily[k] > max) max = daily[k]
  const level = (c) => (!c ? 0 : c >= max ? 4 : Math.max(1, Math.ceil((c / max) * 4)))

  const grid = h("div", { class: "hm__grid", style: "grid-template-columns:repeat(" + totalCols + ",1fr)" })
  const cells = []
  let cur = new Date(start)
  while (cur <= end) {
    const key = ymd(cur)
    const col = Math.floor((cur - start) / (7 * DAY)) + 1
    const row = cur.getDay() + 1
    const isFuture = cur > today
    const isToday = key === todayStr
    const pl = plans[key]
    const c = daily[key] || 0
    const cls = "hm__c" + (isFuture ? " hm__c--future" : "") + (isToday ? " hm__c--today" : "") + (pl ? " hm__c--plan" : "")
    const cell = h("i", {
      class: cls,
      "data-l": isFuture ? "f" : level(c),
      title: key + (isFuture ? " 未来" : " " + c + " 次提交") + (pl ? "（计划 " + pl.done + "/" + pl.total + "）" : ""),
      style: "grid-row:" + row + ";grid-column:" + col
    })
    if (pl && pl.total && pl.done >= pl.total) cell.setAttribute("data-plan-done", "1")
    if (onPick && cur >= today) {
      cell.classList.add("hm__c--click")
      const dstr = key
      cell.addEventListener("click", () => onPick(dstr))
    }
    grid.append(cell)
    cells.push(cell)
    cur = new Date(cur.getTime() + DAY)
  }

  const scroll = h("div", { class: "hm__scroll" }, grid)
  const wrap = h("div", { class: "hm" },
    scroll,
    h("div", { class: "hm__legend mono tiny" },
      "少", ...[0, 1, 2, 3, 4].map((l) => h("i", { class: "hm__c", "data-l": l })), "多",
      onPick ? h("span", { class: "hm__plan-key" }, h("i", { class: "hm__c hm__c--future hm__c--click" }), "未来日 点击规划") : null
    )
  )
  if (onPick) requestAnimationFrame(() => { scroll.scrollLeft = scroll.scrollWidth })
  if (!tame) gsap.from(cells, { autoAlpha: 0, scale: 0.3, duration: 0.5, ease: "power2.out", stagger: { each: 0.0014, from: "start" } })
  return wrap
}
