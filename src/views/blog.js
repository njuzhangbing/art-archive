import { h, clear } from "../lib/dom.js"
import { api } from "../lib/api.js"
import { postFormModal } from "../components/post-form.js"
import { seriesFormModal } from "../components/series-form.js"
import { announceBanner } from "../components/announce-banner.js"
import { reveal } from "../lib/anim.js"
import { toast } from "../components/toast.js"
import { fmtAgo } from "../lib/fmt.js"
import { authorLink } from "../components/author.js"

export default function blog(root) {
  const annEl = h("div", { class: "blogann" })
  const seriesEl = h("div", { class: "blogseries" })
  const standaloneEl = h("div", { class: "bloglist" })
  const head = h("div", { class: "section__head" },
    h("div", {}, h("span", { class: "kicker" }, "Blog / 博客"), h("h1", { class: "h-section", style: "margin-top:12px" }, "文章")),
    h("div", { class: "blog__acts" },
      h("button", { class: "btn", onClick: newSeries }, "＋ 新建系列"),
      h("button", { class: "btn btn--red", onClick: write }, "✎ 写文章"))
  )
  const view = h("div", { class: "wrap blogv" }, head, annEl, seriesEl, standaloneEl)
  root.append(view)

  function write() { postFormModal({ onSaved: () => load() }) }
  function newSeries() { seriesFormModal({ onSaved: () => load() }) }

  function seriesCard(s) {
    return h("a", { class: "scard", href: "/blog/series/" + s.id, "data-link": "1" },
      h("div", { class: "scard__cv" }, s.coverUrl ? h("img", { src: s.coverUrl, loading: "lazy", alt: "" }) : h("span", { class: "mono tiny muted" }, "SERIES")),
      h("div", { class: "scard__b" },
        h("div", { class: "scard__tag mono tiny" }, "系列 · " + s.count + " 篇"),
        h("h3", { class: "scard__title serif" }, s.title),
        s.desc ? h("p", { class: "scard__desc" }, s.desc) : null,
        h("div", { class: "scard__meta mono tiny" }, "@" + s.owner))
    )
  }

  function postRow(p) {
    return h("a", { class: "blogrow" + (p.pinned ? " blogrow--pin" : ""), href: "/blog/" + p.id, "data-link": "1" },
      h("div", { class: "blogrow__main" },
        h("div", { class: "blogrow__top" },
          p.pinned ? h("span", { class: "blogrow__pin mono tiny" }, "置顶") : null,
          p.hidden ? h("span", { class: "blogrow__pin blogrow__pin--hide mono tiny" }, "已隐藏") : null,
          h("h3", { class: "blogrow__title serif" }, p.title)),
        p.excerpt ? h("p", { class: "blogrow__ex" }, p.excerpt) : h("p", { class: "blogrow__ex muted" }, "（无正文）"),
        h("div", { class: "blogrow__meta mono tiny" }, authorLink(p.author, { avatar: false }), h("span", { class: "dotsep" }, fmtAgo(p.createdAt)))
      )
    )
  }

  async function load() {
    try {
      const [pr, sr] = await Promise.all([api.get("/api/posts"), api.get("/api/series").catch(() => ({ series: [] }))])
      const anns = pr.posts.filter((p) => p.kind === "announcement")
      const standalone = pr.posts.filter((p) => p.kind !== "announcement" && !p.seriesId)
      const series = sr.series || []

      clear(annEl)
      const ab = announceBanner(anns)
      if (ab) annEl.append(ab)

      clear(seriesEl)
      if (series.length) {
        seriesEl.append(h("div", { class: "blogsub mono tiny" }, "系列 / SERIES"))
        seriesEl.append(h("div", { class: "sgrid" }, ...series.map(seriesCard)))
      }

      clear(standaloneEl)
      if (standalone.length) {
        standaloneEl.append(h("div", { class: "blogsub mono tiny" }, "独立文章 / POSTS"))
        standalone.forEach((p) => standaloneEl.append(postRow(p)))
      }
      if (!anns.length && !series.length && !standalone.length) {
        standaloneEl.append(h("div", { class: "empty" }, h("div", { class: "mono" }, "还没有内容"), h("button", { class: "btn btn--red", style: "margin-top:14px", onClick: write }, "✎ 写第一篇")))
      }
      reveal([...view.children], { y: 20, stagger: 0.05 })
    } catch (err) { toast(err.message || "加载失败", "bad") }
  }

  reveal([head], { y: 20 })
  load()
  return {}
}
