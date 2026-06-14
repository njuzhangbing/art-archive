import { h } from "../lib/dom.js"
import { fmtAgo } from "../lib/fmt.js"
import { starButton } from "./star-button.js"
import { authorLink } from "./author.js"

export function projectCard(p) {
  const cover = p.coverUrl
    ? h("div", { class: "card__cover" }, h("img", { src: p.coverUrl, alt: p.title, loading: "lazy" }))
    : h("div", { class: "card__cover card__cover--empty" }, h("span", { class: "mono" }, "未着色 / NO COVER"))
  cover.append(h("div", { class: "card__star" }, starButton(p)))

  const tags = (p.tags && p.tags.length)
    ? h("div", { class: "tagrow" }, ...p.tags.slice(0, 4).map((t) => h("span", { class: "tag" }, t)))
    : null

  return h("a", { class: "card", href: "/projects/" + p.id, "data-link": "1", "data-grade": p.grade },
    cover,
    p.no != null ? h("span", { class: "card__no" }, "#" + String(p.no).padStart(2, "0")) : null,
    h("div", { class: "card__body" },
      h("div", { class: "badge", "data-grade": p.grade }, h("span", { class: "badge__dot" }), p.grade),
      h("h3", { class: "card__title" }, p.title),
      tags,
      h("div", { class: "card__meta" },
        h("span", {}, "v" + (p.versions ?? 1)),
        h("span", { class: "dotsep" }, fmtAgo(p.updatedAt)),
        p.author ? h("span", { class: "dotsep" }, authorLink(p.author, { avatar: false })) : null
      )
    )
  )
}
