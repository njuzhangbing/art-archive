import { h, clear } from "../lib/dom.js"
import { api } from "../lib/api.js"
import { toast } from "./toast.js"
import { fmtAgo } from "../lib/fmt.js"

function atHtml(s) {
  const esc = String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  return esc.replace(/(^|[\s(])@([\w一-龥]+)/g, '$1<span class="cm-at">@$2</span>').replace(/\n/g, "<br>")
}

export function commentsSection(postId) {
  const listEl = h("div", { class: "cmlist" })
  const countEl = h("span", { class: "mono tiny muted" }, "")
  const ta = h("textarea", { class: "textarea cmbox", rows: "3", placeholder: "写条评论… 可 @某人" })
  const sendBtn = h("button", { class: "btn btn--red", type: "button" }, "发表评论")
  const box = h("div", { class: "cmform" }, ta, h("div", { class: "cmform__act" }, sendBtn))
  const lockedEl = h("div", { class: "cmlocked mono tiny", style: "display:none" }, "🔒 该文章评论已关闭")
  const sec = h("section", { class: "cmsec" },
    h("div", { class: "section__head" }, h("div", {}, h("span", { class: "kicker" }, "Comments / 评论"), h("h2", { class: "pd__h2 serif" }, "评论 ", countEl))),
    listEl, lockedEl, box
  )

  function commentRow(c) {
    const del = c.canDelete ? h("button", { class: "cm__x", type: "button", title: "删除" }, "✕") : null
    if (del) del.addEventListener("click", async () => {
      if (!confirm("删除这条评论？")) return
      try { await api.del("/api/posts/" + postId + "/comments/" + c.id); load() }
      catch (e) { toast(e.message || "删除失败", "bad") }
    })
    return h("div", { class: "cmrow" },
      h("div", { class: "cmrow__head" }, h("b", { class: "mono" }, "@" + c.author), h("span", { class: "mono tiny muted" }, fmtAgo(c.createdAt)), del),
      h("div", { class: "cmrow__body", html: atHtml(c.body) })
    )
  }

  async function load() {
    try {
      const r = await api.get("/api/posts/" + postId + "/comments")
      countEl.textContent = r.comments.length ? "· " + r.comments.length : ""
      clear(listEl)
      if (!r.comments.length) listEl.append(h("div", { class: "muted mono tiny", style: "padding:12px 0" }, "还没有评论，来抢沙发"))
      else r.comments.forEach((c) => listEl.append(commentRow(c)))
      lockedEl.style.display = r.locked ? "" : "none"
      box.style.display = r.locked ? "none" : ""
    } catch (e) { clear(listEl); listEl.append(h("div", { class: "muted mono tiny" }, "评论加载失败")) }
  }

  sendBtn.addEventListener("click", async () => {
    const body = ta.value.trim()
    if (!body) return
    sendBtn.disabled = true
    try { await api.post("/api/posts/" + postId + "/comments", { body }); ta.value = ""; await load() }
    catch (e) { toast(e.message || "评论失败", "bad") }
    sendBtn.disabled = false
  })

  load()
  return sec
}
