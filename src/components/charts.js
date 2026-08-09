import { h } from "../lib/dom.js"
import { SECRECY } from "../lib/classify.js"

export function secBars(grades) {
  const max = Math.max(1, ...SECRECY.map((g) => grades[g.key] || 0))
  return h("div", { class: "gbars" },
    ...SECRECY.map((g) => {
      const n = grades[g.key] || 0
      return h("div", { class: "gbar", "data-sec": g.key },
        h("div", { class: "gbar__name mono" }, g.zh),
        h("div", { class: "gbar__track" }, h("div", { class: "gbar__fill", style: "width:" + Math.round((n / max) * 100) + "%" })),
        h("div", { class: "gbar__n mono" }, n)
      )
    })
  )
}

const TYPE_META = [
  { key: "image", zh: "图片", color: "var(--teth)" },
  { key: "psd", zh: "PSD", color: "var(--waw)" },
  { key: "video", zh: "视频", color: "var(--he)" }
]

export function typeBar(types) {
  const total = Math.max(1, TYPE_META.reduce((s, t) => s + (types[t.key] || 0), 0))
  return h("div", { class: "tbar" },
    h("div", { class: "tbar__track" },
      ...TYPE_META.filter((t) => types[t.key]).map((t) =>
        h("div", { class: "tbar__seg", style: "width:" + ((types[t.key] / total) * 100) + "%;background:" + t.color }, types[t.key] > 0 ? String(types[t.key]) : "")
      )
    ),
    h("div", { class: "tbar__legend" },
      ...TYPE_META.map((t) => h("span", { class: "tleg mono tiny" }, h("i", { style: "background:" + t.color }), t.zh + " " + (types[t.key] || 0)))
    )
  )
}

export function rankList(rows, render) {
  if (!rows.length) return h("div", { class: "muted mono tiny" }, "暂无数据")
  return h("div", { class: "ranks" },
    ...rows.map((r, i) => h("div", { class: "rankrow" }, h("span", { class: "rankrow__i mono" }, String(i + 1).padStart(2, "0")), render(r)))
  )
}
