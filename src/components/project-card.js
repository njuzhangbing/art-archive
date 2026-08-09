import { h, bi } from "../lib/dom.js"
import { fmtAgo } from "../lib/fmt.js"
import { starButton } from "./star-button.js"
import { authorLink } from "./author.js"
import { secOf, isRedacted } from "../lib/classify.js"

// A plate in the opening row is the largest thing on screen, so deferring it
// only delays the moment the page looks finished. Everything past the fold
// stays lazy.
export const EAGER_PLATES = 4

export function projectCard(p, i = 99) {
  const above = i < EAGER_PLATES
  const cover = p.coverUrl
    // Only the deferred plates get async decoding: it lets the browser put off
    // painting, which is the opposite of what the opening row wants.
    ? h("div", { class: "card__cover" }, h("img", above
      ? { src: p.coverUrl, alt: p.title, loading: "eager", fetchpriority: "high" }
      : { src: p.coverUrl, alt: p.title, loading: "lazy", decoding: "async" }))
    : h("div", { class: "card__cover card__cover--empty" }, h("span", { class: "mono" }, bi("未着色", "NO COVER")))
  cover.append(h("div", { class: "card__star" }, starButton(p)))

  const tags = (p.tags && p.tags.length)
    ? h("div", { class: "tagrow" }, ...p.tags.slice(0, 4).map((t) => h("span", { class: "tag" }, t)))
    : null

  return h("a", { class: "card", href: "/projects/" + p.id, "data-link": "1", "data-sec": p.sec || "PUBLIC", "data-redacted": isRedacted(p) ? "1" : "0" },
    cover,
    p.no != null ? h("span", { class: "card__no" }, "#" + String(p.no).padStart(2, "0")) : null,
    h("div", { class: "card__body" },
      h("div", { class: "badge", "data-sec": p.sec || "PUBLIC" }, h("span", { class: "badge__dot" }), secOf(p.sec).zh + " " + secOf(p.sec).en),
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
