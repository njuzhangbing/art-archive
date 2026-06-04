import { h } from "../lib/dom.js"
import { damageOf } from "../lib/damage.js"

export function characterCard(c) {
  const d = damageOf(c.damage)
  return h("a", { class: "ccard", "data-grade": c.grade, href: "/characters/" + c.id, "data-link": "1" },
    h("div", { class: "ccard__por" },
      c.coverUrl ? h("img", { src: c.coverUrl, loading: "lazy", alt: c.name }) : h("div", { class: "ccard__noimg mono" }, "无立绘"),
      h("img", { class: "ccard__dmg", src: d.icon, alt: d.label, title: "Damage · " + d.label })
    ),
    h("div", { class: "ccard__body" },
      h("div", { class: "ccard__top" },
        h("span", { class: "badge", "data-grade": c.grade, style: "padding:2px 7px" }, c.grade),
        c.code ? h("span", { class: "mono tiny ccode" }, c.code) : null
      ),
      h("h3", { class: "ccard__name serif" }, c.name)
    )
  )
}
