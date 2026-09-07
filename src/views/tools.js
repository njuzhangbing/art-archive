import { h, bi } from "../lib/dom.js"
import { reveal, clearScroll } from "../lib/anim.js"

/**
 * The workshop door.
 *
 * A list of benches and nothing else. It exists because the alternative was
 * four more entries in a running head that already carries six — and because
 * without it a desktop reader had no way at all to reach half of them.
 */

const BENCHES = [
  { to: "/tools/image", zh: "图像工作台", en: "IMAGE WORKBENCH", n: "01" },
  { to: "/roll", zh: "照片带", en: "PHOTO ROLL", n: "02" },
  { to: "/photos", zh: "相册", en: "PHOTOS", n: "03" },
  { to: "/card", zh: "电子透卡", en: "CARD", n: "04" }
]

export default function tools(root) {
  const view = h("div", { class: "wrap hub" },
    h("div", { class: "section__head" },
      h("div", {},
        h("span", { class: "kicker" }, "Workshop / 工具"),
        h("h1", { class: "h-section", style: "margin-top:12px" }, "工具"))),
    h("div", { class: "hub__list" }, ...BENCHES.map(bench))
  )
  root.append(view)
  reveal([...view.children], { y: 22, stagger: 0.07 })
  return { destroy: clearScroll }
}

function bench(b) {
  return h("a", { class: "hub__row", href: b.to, "data-link": "1" },
    h("span", { class: "hub__n mono" }, b.n),
    h("span", { class: "hub__body" }, bi(b.zh, b.en)),
    h("span", { class: "hub__go mono" }, "进入", h("i", {}, "→")))
}
