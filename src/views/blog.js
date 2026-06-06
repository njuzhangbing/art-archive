import { h, clear } from "../lib/dom.js"
import { api } from "../lib/api.js"
import { postFormModal } from "../components/post-form.js"
import { reveal } from "../lib/anim.js"
import { toast } from "../components/toast.js"
import { fmtAgo } from "../lib/fmt.js"

export default function blog(root) {
  const listEl = h("div", { class: "bloglist" })
  const head = h("div", { class: "section__head" },
    h("div", {}, h("span", { class: "kicker" }, "Blog / 博客"), h("h1", { class: "h-section", style: "margin-top:12px" }, "文章")),
    h("button", { class: "btn btn--red", onClick: write }, "✎ 写文章")
  )
  const view = h("div", { class: "wrap blogv" }, head, listEl)
  root.append(view)

  function write() { postFormModal({ onSaved: () => load() }) }

  function postRow(p) {
    return h("a", { class: "blogrow" + (p.pinned ? " blogrow--pin" : ""), href: "/blog/" + p.id, "data-link": "1" },
      h("div", { class: "blogrow__main" },
        h("div", { class: "blogrow__top" },
          p.pinned ? h("span", { class: "blogrow__pin mono tiny" }, "置顶") : null,
          h("h3", { class: "blogrow__title serif" }, p.title)),
        p.excerpt ? h("p", { class: "blogrow__ex" }, p.excerpt) : h("p", { class: "blogrow__ex muted" }, "（无正文）"),
        h("div", { class: "blogrow__meta mono tiny" }, "@" + p.author, h("span", { class: "dotsep" }, fmtAgo(p.createdAt)))
      )
    )
  }

  async function load() {
    try {
      const r = await api.get("/api/posts")
      clear(listEl)
      if (!r.posts.length) { listEl.append(h("div", { class: "empty" }, h("div", { class: "mono" }, "还没有文章"), h("button", { class: "btn btn--red", style: "margin-top:14px", onClick: write }, "✎ 写第一篇"))); return }
      r.posts.forEach((p) => listEl.append(postRow(p)))
      reveal([...listEl.children], { y: 24, stagger: 0.05 })
    } catch (err) { toast(err.message || "加载失败", "bad") }
  }

  reveal([head], { y: 20 })
  load()
  return {}
}
