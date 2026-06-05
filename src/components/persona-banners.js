import { h } from "../lib/dom.js"
import { PERSONA } from "../lib/persona.js"

export function personaBanners(onPick, getActive) {
  const cards = PERSONA.map((p) => {
    const img = h("img", { src: p.img, alt: p.label, loading: "lazy" })
    img.addEventListener("error", () => card.setAttribute("data-empty", "1"))
    const card = h("button", { class: "pbanner", type: "button", "data-key": p.key, "data-on": getActive() === p.key ? "1" : "0" },
      h("div", { class: "pbanner__img" }, img),
      h("div", { class: "pbanner__lbl" },
        h("span", { class: "kicker" }, p.en),
        h("h3", { class: "serif" }, p.label),
        h("span", { class: "mono tiny pbanner__hint" }, "点击筛选")
      )
    )
    card.addEventListener("click", () => onPick(p.key))
    return card
  })
  const wrap = h("div", { class: "personae" }, ...cards)
  wrap.sync = (active) => cards.forEach((c) => c.setAttribute("data-on", c.getAttribute("data-key") === active ? "1" : "0"))
  return wrap
}
