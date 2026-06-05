import { h } from "../lib/dom.js"
import { damageOf } from "../lib/damage.js"

function excerpt(md, n = 130) {
  if (!md) return ""
  const t = md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s*[-+>*]\s+/gm, "")
    .replace(/[#`_~*]/g, "")
    .replace(/\s+/g, " ")
    .trim()
  return t.length > n ? t.slice(0, n) + "…" : t
}

export function characterCard(c) {
  const d = damageOf(c.damage)
  const ex = excerpt(c.body)
  return h("a", { class: "ccard", "data-grade": c.grade, href: "/characters/" + c.id, "data-link": "1" },
    h("div", { class: "ccard__por" },
      c.coverUrl ? h("img", { src: c.coverUrl, loading: "lazy", alt: c.name }) : h("div", { class: "ccard__noimg mono" }, "无立绘"),
      h("img", { class: "ccard__dmg", src: d.icon, alt: d.label, title: "Damage · " + d.label })
    ),
    h("div", { class: "ccard__main" },
      h("div", { class: "ccard__top" },
        h("span", { class: "badge", "data-grade": c.grade, style: "padding:2px 7px" }, c.grade),
        c.code ? h("span", { class: "mono tiny ccode" }, c.code) : null
      ),
      h("h3", { class: "ccard__name serif" }, c.name),
      h("p", { class: "ccard__ex" + (ex ? "" : " muted") }, ex || "词条尚未编写"),
      h("div", { class: "ccard__foot" },
        h("span", { class: "dmgbadge", "data-dmg": c.damage }, h("img", { src: d.icon, alt: d.label }), h("b", {}, d.label))
      )
    )
  )
}
