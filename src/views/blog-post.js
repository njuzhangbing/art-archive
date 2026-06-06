import { h, clear } from "../lib/dom.js"
import { api } from "../lib/api.js"
import { mdToHtml } from "../lib/markdown.js"
import { postFormModal } from "../components/post-form.js"
import { reportButton } from "../components/report-button.js"
import { toast } from "../components/toast.js"
import { go } from "../router.js"
import { reveal, clearScroll } from "../lib/anim.js"
import { fmtDate } from "../lib/fmt.js"

export default function blogPost(root, params) {
  const view = h("div", { class: "wrap blogpost" }, h("div", { class: "muted mono", style: "padding:70px 0" }, "加载中…"))
  root.append(view)
  let post = null

  async function boot() {
    try { const r = await api.get("/api/posts/" + params.id); post = r.post; render() }
    catch (err) { clear(view); view.append(notFound(err)) }
  }

  function render() {
    clear(view)
    const bodyEl = h("article", { class: "wiki blogpost__body" })
    bodyEl.innerHTML = mdToHtml(post.body || "")
    view.append(
      h("div", { class: "blogpost__crumb mono" }, h("a", { href: "/blog", "data-link": "1" }, "博客"), " / ", post.pinned ? "置顶" : "文章"),
      h("header", { class: "blogpost__head" },
        post.pinned ? h("span", { class: "blogrow__pin mono tiny" }, "置顶") : null,
        h("h1", { class: "blogpost__title serif" }, post.title),
        h("div", { class: "blogpost__meta mono" }, "@" + post.author, h("span", { class: "dotsep" }, fmtDate(post.createdAt))),
        h("div", { class: "blogpost__acts" },
          post.canPin ? h("button", { class: "btn btn--sm" + (post.pinned ? " btn--red" : ""), onClick: togglePin }, post.pinned ? "取消置顶" : "置顶") : null,
          post.canEdit ? h("button", { class: "btn btn--sm", onClick: edit }, "编辑") : null,
          post.canEdit ? h("button", { class: "btn btn--sm btn--danger", onClick: del }, "删除") : null,
          reportButton({ kind: "post", id: post.id, title: post.title })
        )
      ),
      bodyEl
    )
    reveal([...view.children], { y: 22, stagger: 0.06 })
  }

  async function togglePin() {
    try { const r = await api.patch("/api/posts/" + post.id, { pinned: !post.pinned }); post = r.post; toast(post.pinned ? "已置顶" : "已取消置顶", "ok"); render() }
    catch (e) { toast(e.message || "失败", "bad") }
  }
  function edit() { postFormModal({ post, onSaved: (np) => { post = { ...post, ...np }; render() } }) }
  async function del() {
    if (!confirm("删除文章「" + post.title + "」？")) return
    try { await api.del("/api/posts/" + post.id); toast("已删除", "info"); go("/blog") }
    catch (e) { toast(e.message || "删除失败", "bad") }
  }
  function notFound(err) {
    return h("div", { class: "soon" }, h("h2", {}, "404"), h("p", {}, err && err.status === 404 ? "文章不存在" : (err && err.message) || "加载失败"),
      h("a", { class: "btn btn--red", href: "/blog", "data-link": "1", style: "margin-top:20px" }, "返回博客"))
  }

  boot()
  return { destroy: clearScroll }
}
