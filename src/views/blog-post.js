import { h, clear } from "../lib/dom.js"
import { api } from "../lib/api.js"
import { mdToHtml } from "../lib/markdown.js"
import { hydrateMarginalia } from "../lib/marginalia.js"
import { postFormModal } from "../components/post-form.js"
import { reportButton } from "../components/report-button.js"
import { commentsSection } from "../components/comments.js"
import { openModal } from "../components/modal.js"
import { toast } from "../components/toast.js"
import { levelOf, LEVELS } from "../lib/announce.js"
import { go } from "../router.js"
import { reveal, clearScroll } from "../lib/anim.js"
import { fmtDate, fmtAgo } from "../lib/fmt.js"

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
    const isAnn = post.kind === "announcement"
    const lvl = levelOf(post.level)
    const bodyEl = h("article", { class: "wiki blogpost__body" })
    bodyEl.innerHTML = mdToHtml(post.body || "")
    hydrateMarginalia(bodyEl, post.marg)

    view.append(
      h("div", { class: "blogpost__crumb mono" },
        h("a", { href: "/blog", "data-link": "1" }, "博客"), " / ",
        post.series ? h("a", { href: "/blog/series/" + post.series.id, "data-link": "1" }, post.series.title) : (isAnn ? "公告" : "文章")),
      h("header", { class: "blogpost__head" + (isAnn ? " blogpost__head--ann" : ""), "data-level": isAnn ? post.level : null },
        h("div", { class: "blogpost__badges" },
          isAnn ? h("span", { class: "annbadge", "data-level": post.level }, "公告 · " + lvl.zh) : null,
          post.pinned ? h("span", { class: "blogrow__pin mono tiny" }, "置顶") : null,
          post.hidden ? h("span", { class: "blogrow__pin blogrow__pin--hide mono tiny" }, "已隐藏") : null),
        h("h1", { class: "blogpost__title serif" }, post.title),
        h("div", { class: "blogpost__meta mono" }, "@" + post.author, h("span", { class: "dotsep" }, fmtDate(post.createdAt))),
        isAnn ? readRow() : null,
        acts()
      ),
      bodyEl,
      post.series ? seriesNav() : null,
      commentsSection(post.id)
    )
    reveal([...view.children], { y: 22, stagger: 0.05 })
  }

  function readRow() {
    const cnt = h("span", { class: "mono tiny annread" }, (post.readCount || 0) + " 人已读")
    const btn = h("button", { class: "btn btn--sm" + (post.iRead ? "" : " btn--red") }, post.iRead ? "✓ 已读" : "我已读")
    btn.addEventListener("click", async () => {
      try { const r = await api.post("/api/posts/" + post.id + "/read", {}); post.iRead = true; post.readCount = r.readCount; render() }
      catch (e) { toast(e.message || "失败", "bad") }
    })
    return h("div", { class: "blogpost__read" }, btn, cnt, post.isAdmin ? h("button", { class: "btn btn--sm btn--ghost", onClick: showReaders }, "查看名单") : null)
  }

  async function showReaders() {
    try {
      const r = await api.get("/api/posts/" + post.id + "/reads")
      const rows = r.readers.length
        ? r.readers.map((x) => h("div", { class: "readers__row mono" }, "@" + x.handle, h("span", { class: "tiny muted" }, fmtAgo(x.at))))
        : [h("div", { class: "muted mono tiny" }, "还没有人已读")]
      openModal("已读名单 · " + r.count + " 人", h("div", { class: "readers" }, ...rows))
    } catch (e) { toast(e.message || "加载失败", "bad") }
  }

  function acts() {
    const a = h("div", { class: "blogpost__acts" })
    if (post.canPin) a.append(actBtn(post.pinned ? "取消置顶" : "置顶", togglePin, post.pinned))
    if (post.isAdmin) a.append(annControl())
    if (post.canEdit) {
      a.append(actBtn(post.commentsLocked ? "开放评论" : "关闭评论", toggleLock, post.commentsLocked))
      a.append(actBtn(post.hidden ? "取消隐藏" : "隐藏", toggleHide, post.hidden))
      a.append(h("button", { class: "btn btn--sm", onClick: edit }, "编辑"))
      a.append(h("button", { class: "btn btn--sm btn--danger", onClick: del }, "删除"))
    }
    a.append(reportButton({ kind: "post", id: post.id, title: post.title }))
    return a
  }

  function actBtn(label, fn, on) { return h("button", { class: "btn btn--sm" + (on ? " btn--red" : ""), onClick: fn }, label) }

  function annControl() {
    const sel = h("select", { class: "annpick" }, h("option", { value: "" }, "不是公告"), ...LEVELS.map((l) => h("option", { value: l.key }, "公告·" + l.zh)))
    sel.value = post.kind === "announcement" ? (post.level || "normal") : ""
    sel.addEventListener("change", () => {
      const payload = sel.value ? { kind: "announcement", level: sel.value } : { kind: "post" }
      patchAndRefresh(payload, "公告设置已更新")
    })
    return sel
  }

  function seriesNav() {
    const nav = post.series
    return h("nav", { class: "seriesnav" },
      nav.prevId ? h("a", { class: "seriesnav__b seriesnav__b--prev", href: "/blog/" + nav.prevId, "data-link": "1" }, h("span", { class: "mono tiny" }, "← 上一篇"), h("b", { class: "serif" }, nav.prevTitle)) : h("span", { class: "seriesnav__gap" }),
      h("a", { class: "seriesnav__mid mono tiny", href: "/blog/series/" + nav.id, "data-link": "1" }, nav.title + " · " + (nav.index + 1) + "/" + nav.total),
      nav.nextId ? h("a", { class: "seriesnav__b seriesnav__b--next", href: "/blog/" + nav.nextId, "data-link": "1" }, h("span", { class: "mono tiny" }, "下一篇 →"), h("b", { class: "serif" }, nav.nextTitle)) : h("span", { class: "seriesnav__gap" })
    )
  }

  async function patchAndRefresh(payload, okMsg) {
    try { const r = await api.patch("/api/posts/" + post.id, payload); post = r.post; if (okMsg) toast(okMsg, "ok"); render() }
    catch (e) { toast(e.message || "失败", "bad") }
  }
  function togglePin() { patchAndRefresh({ pinned: !post.pinned }, post.pinned ? "已取消置顶" : "已置顶") }
  function toggleLock() { patchAndRefresh({ commentsLocked: !post.commentsLocked }, post.commentsLocked ? "已开放评论" : "已关闭评论") }
  function toggleHide() { patchAndRefresh({ hidden: !post.hidden }, post.hidden ? "已取消隐藏" : "已隐藏") }
  function edit() { postFormModal({ post, onSaved: () => boot() }) }
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
