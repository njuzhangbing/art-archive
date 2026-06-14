import { h, clear } from "../lib/dom.js"
import { api } from "../lib/api.js"
import { seriesFormModal } from "../components/series-form.js"
import { postFormModal } from "../components/post-form.js"
import { toast } from "../components/toast.js"
import { go } from "../router.js"
import { reveal, clearScroll } from "../lib/anim.js"
import { fmtAgo } from "../lib/fmt.js"
import { authorLink } from "../components/author.js"

export default function blogSeries(root, params) {
  const view = h("div", { class: "wrap blogseriesv" }, h("div", { class: "muted mono", style: "padding:70px 0" }, "加载中…"))
  root.append(view)
  let s = null, posts = [], canEdit = false

  async function boot() {
    try {
      const r = await api.get("/api/series/" + params.id)
      s = r.series; posts = r.posts || []; canEdit = s.canEdit
      render()
    } catch (err) { clear(view); view.append(notFound(err)) }
  }

  function render() {
    clear(view)
    view.append(header(), listSec())
    reveal([...view.children], { y: 22, stagger: 0.06 })
  }

  function header() {
    return h("section", { class: "ser__head" },
      h("div", { class: "ser__cv" }, s.coverUrl ? h("img", { src: s.coverUrl, alt: s.title }) : h("span", { class: "mono tiny muted" }, "SERIES")),
      h("div", { class: "ser__id" },
        h("div", { class: "blogpost__crumb mono" }, h("a", { href: "/blog", "data-link": "1" }, "博客"), " / 系列"),
        h("div", { class: "ser__tag mono tiny" }, "系列 · " + posts.length + " 篇"),
        h("h1", { class: "ser__title serif" }, s.title),
        s.desc ? h("p", { class: "ser__desc" }, s.desc) : null,
        h("div", { class: "ser__meta mono tiny" }, authorLink(s.owner)),
        h("div", { class: "ser__acts" },
          h("button", { class: "btn btn--red btn--sm", onClick: writeHere }, "✎ 在此写文章"),
          canEdit ? h("button", { class: "btn btn--sm", onClick: editSeries }, "编辑系列") : null,
          canEdit ? h("button", { class: "btn btn--sm btn--danger", onClick: delSeries }, "删除系列") : null)
      )
    )
  }

  function listSec() {
    if (!posts.length) return h("div", { class: "empty" }, h("div", { class: "mono" }, "此系列还没有文章"),
      h("p", { class: "mono tiny muted", style: "margin-top:8px" }, "点上方「在此写文章」开始"))
    return h("div", { class: "serlist" }, ...posts.map((p, i) => row(p, i)))
  }

  function row(p, i) {
    return h("div", { class: "serrow" },
      h("span", { class: "serrow__n mono" }, String(i + 1).padStart(2, "0")),
      h("a", { class: "serrow__main", href: "/blog/" + p.id, "data-link": "1" },
        h("h3", { class: "serrow__title serif" }, p.title),
        p.excerpt ? h("p", { class: "serrow__ex" }, p.excerpt) : null,
        h("div", { class: "blogrow__meta mono tiny" }, authorLink(p.author, { avatar: false }), h("span", { class: "dotsep" }, fmtAgo(p.createdAt)))),
      canEdit ? h("div", { class: "serrow__mv" },
        i > 0 ? mvBtn("↑", i, i - 1) : null,
        i < posts.length - 1 ? mvBtn("↓", i, i + 1) : null) : null
    )
  }

  function mvBtn(label, from, to) {
    const b = h("button", { class: "btn btn--sm mvbtn", type: "button" }, label)
    b.addEventListener("click", async () => {
      const order = posts.map((p) => p.id)
      const moved = order.splice(from, 1)[0]; order.splice(to, 0, moved)
      try {
        await api.patch("/api/series/" + s.id, { order })
        const t = posts.splice(from, 1)[0]; posts.splice(to, 0, t); render()
      } catch (e) { toast(e.message || "排序失败", "bad") }
    })
    return b
  }

  function writeHere() { postFormModal({ presetSeriesId: s.id, onSaved: () => boot() }) }
  function editSeries() { seriesFormModal({ series: s, onSaved: () => boot() }) }
  async function delSeries() {
    if (!confirm("删除系列「" + s.title + "」？文章不会被删除，只是脱离系列")) return
    try { await api.del("/api/series/" + s.id); toast("已删除系列", "info"); go("/blog") }
    catch (e) { toast(e.message || "删除失败", "bad") }
  }

  function notFound(err) {
    return h("div", { class: "soon" }, h("h2", {}, "404"), h("p", {}, err && err.status === 404 ? "系列不存在" : (err && err.message) || "加载失败"),
      h("a", { class: "btn btn--red", href: "/blog", "data-link": "1", style: "margin-top:20px" }, "返回博客"))
  }

  boot()
  return { destroy: clearScroll }
}
