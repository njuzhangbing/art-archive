import { h } from "../lib/dom.js"
import { reveal } from "../lib/anim.js"

export function soon(root, { tag, title, sub }) {
  const view = h("div", { class: "wrap soon" },
    h("span", { class: "kicker", style: "display:inline-flex;justify-content:center" }, tag),
    h("h2", { style: "margin-top:18px" }, title),
    h("p", {}, sub),
    h("div", { class: "badge", "data-tone": "mid", style: "margin:22px auto 0" }, h("span", { class: "badge__dot" }), "IN PROGRESS")
  )
  root.append(view)
  reveal([...view.children], { stagger: 0.08, y: 30 })
  return {}
}
