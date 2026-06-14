import { h, clear } from "../lib/dom.js"
import { api } from "../lib/api.js"
import { avatarBlock } from "../components/author.js"
import { reveal, clearScroll } from "../lib/anim.js"
import { fmtDate, fmtAgo } from "../lib/fmt.js"
import { toast } from "../components/toast.js"

const ROLE_ZH = { admin: "管理员", member: "成员" }

export default function userPage(root, params) {
  const view = h("div", { class: "wrap userv" }, h("div", { class: "muted mono", style: "padding:70px 0" }, "加载中…"))
  root.append(view)
  let data = null

  async function boot() {
    try { data = await api.get("/api/users/" + encodeURIComponent(params.handle)); render() }
    catch (err) { clear(view); view.append(notFound(err)) }
  }

  function render() {
    clear(view)
    view.append(
      header(data.user),
      section("项目 / PROJECTS", data.stats.projects, projGrid()),
      section("角色 / CHARACTERS", data.stats.characters, charGrid()),
      section("博客 / POSTS", data.stats.posts, postList())
    )
    reveal([...view.children], { y: 22, stagger: 0.06 })
  }

  function header(u) {
    return h("section", { class: "uhead" },
      avatarBlock(u.handle, u.avatarUrl, 132),
      h("div", { class: "uhead__id" },
        h("div", { class: "uhead__badges" }, h("span", { class: "rolebadge mono", "data-role": u.role }, ROLE_ZH[u.role] || u.role)),
        h("h1", { class: "uhead__name serif" }, u.displayName),
        h("div", { class: "uhead__handle mono" }, "@" + u.handle, h("span", { class: "dotsep" }, "加入于 " + fmtDate(u.createdAt))),
        u.bio ? h("p", { class: "uhead__bio" }, u.bio) : h("p", { class: "uhead__bio muted" }, "这位创作者还没写简介"),
        h("div", { class: "uhead__stats mono" },
          stat(data.stats.projects, "项目"), stat(data.stats.characters, "角色"), stat(data.stats.posts, "文章"),
          stat(data.follow ? data.follow.followers : 0, "粉丝"), stat(data.follow ? data.follow.following : 0, "关注")),
        data.isMe ? h("div", { style: "margin-top:16px" }, h("a", { class: "btn btn--sm", href: "/me", "data-link": "1" }, "编辑资料")) : followRow()
      )
    )
  }

  function followRow() {
    const f = data.follow || { iFollow: false }
    const btn = h("button", { class: "btn btn--sm" + (f.iFollow ? "" : " btn--red") }, f.iFollow ? "已关注 ✓" : "＋ 关注")
    btn.addEventListener("click", async () => {
      btn.disabled = true
      try {
        const r = await api.post("/api/users/" + data.user.handle + "/follow", {})
        f.iFollow = r.following
        btn.textContent = f.iFollow ? "已关注 ✓" : "＋ 关注"
        btn.classList.toggle("btn--red", !f.iFollow)
      } catch (e) { toast(e.message || "操作失败", "bad") }
      btn.disabled = false
    })
    return h("div", { style: "margin-top:16px;display:flex;gap:8px" }, btn,
      h("a", { class: "btn btn--sm", href: "/dm/" + data.user.handle, "data-link": "1" }, "私信"))
  }

  function stat(n, label) { return h("span", { class: "ustat" }, h("b", {}, String(n)), " " + label) }

  function section(title, count, body) {
    return h("section", { class: "usec" }, h("div", { class: "blogsub mono tiny" }, title + " · " + count), body)
  }

  function projGrid() {
    if (!data.projects.length) return empty("还没有项目")
    return h("div", { class: "chargrid" }, ...data.projects.map((p) =>
      h("a", { class: "pmini", "data-grade": p.grade, href: "/projects/" + p.id, "data-link": "1" },
        h("div", { class: "pmini__cv" }, p.coverUrl ? h("img", { src: p.coverUrl, loading: "lazy", alt: "" }) : h("span", { class: "mono tiny muted" }, "NO COVER")),
        h("div", { class: "pmini__t" }, h("span", { class: "badge", "data-grade": p.grade, style: "padding:2px 6px" }, p.grade), h("b", {}, p.title)))))
  }

  function charGrid() {
    if (!data.characters.length) return empty("还没有角色")
    return h("div", { class: "chargrid" }, ...data.characters.map((c) =>
      h("a", { class: "pmini", "data-grade": c.grade, href: "/characters/" + c.id, "data-link": "1" },
        h("div", { class: "pmini__cv" }, c.coverUrl ? h("img", { src: c.coverUrl, loading: "lazy", alt: "" }) : h("span", { class: "mono tiny muted" }, "无立绘")),
        h("div", { class: "pmini__t" }, c.code ? h("span", { class: "mono tiny" }, c.code) : null, h("b", {}, c.name)))))
  }

  function postList() {
    if (!data.posts.length) return empty("还没有文章")
    return h("div", { class: "bloglist" }, ...data.posts.map((p) =>
      h("a", { class: "blogrow", href: "/blog/" + p.id, "data-link": "1" },
        h("div", { class: "blogrow__main" }, h("h3", { class: "blogrow__title serif" }, p.title), h("div", { class: "blogrow__meta mono tiny" }, fmtAgo(p.createdAt))))))
  }

  function empty(msg) { return h("div", { class: "muted mono tiny", style: "padding:8px 0 4px" }, msg) }

  function notFound(err) {
    return h("div", { class: "soon" }, h("h2", {}, "404"), h("p", {}, err && err.status === 404 ? "查无此人" : (err && err.message) || "加载失败"),
      h("a", { class: "btn btn--red", href: "/", "data-link": "1", style: "margin-top:20px" }, "回首页"))
  }

  boot()
  return { destroy: clearScroll }
}
