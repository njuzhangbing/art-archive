import { h } from "../lib/dom.js"
import { personaOf } from "../lib/persona.js"
import { secOf, isRedacted } from "../lib/classify.js"

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

export const EAGER_PLATES = 4

export function characterCard(c, i = 99) {
  const above = i < EAGER_PLATES
  // The roster ships a ready-made excerpt so it never has to carry whole
  // entries; the fallback covers the detail record, which still has the body.
  const ex = c.excerpt != null ? c.excerpt : excerpt(c.body)
  return h("a", { class: "ccard" + (c.experimental ? " ccard--exp" : ""), "data-sec": c.sec || "PUBLIC", "data-redacted": isRedacted(c) ? "1" : "0", href: "/characters/" + c.id, "data-link": "1" },
    h("div", { class: "ccard__por" },
      c.coverUrl
        // Async decoding only below the fold — up top it just delays the paint.
        ? h("img", above
          ? { src: c.coverUrl, alt: c.name, loading: "eager", fetchpriority: "high" }
          : { src: c.coverUrl, alt: c.name, loading: "lazy", decoding: "async" })
        : h("div", { class: "ccard__noimg mono" }, "无立绘")
    ),
    h("div", { class: "ccard__main" },
      h("div", { class: "ccard__top" },
        h("span", { class: "badge", "data-sec": c.sec || "PUBLIC" }, h("span", { class: "badge__dot" }), secOf(c.sec).zh),
        c.code ? h("span", { class: "mono tiny ccode" }, c.code) : null,
        h("span", { class: "ptag mono tiny" }, personaOf(c.persona).label),
        c.experimental ? h("span", { class: "expbadge mono tiny" }, "实验性实体") : null
      ),
      h("h3", { class: "ccard__name serif" }, c.name),
      h("p", { class: "ccard__ex" + (ex ? "" : " muted") }, ex || "词条尚未编写")
    )
  )
}
