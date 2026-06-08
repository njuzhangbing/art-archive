import { h } from "../lib/dom.js"
import { api } from "../lib/api.js"
import { levelOf, levelRank } from "../lib/announce.js"
import { toast } from "./toast.js"
import { fmtAgo } from "../lib/fmt.js"

export function announceBanner(anns) {
  if (!anns || !anns.length) return null
  const sorted = [...anns].sort((a, b) => levelRank(b.level) - levelRank(a.level) || (a.createdAt < b.createdAt ? 1 : -1))
  const wrap = h("div", { class: "annsec" })
  sorted.forEach((a) => wrap.append(annCard(a)))
  return wrap
}

function annCard(a) {
  const lvl = levelOf(a.level)
  const cnt = h("span", { class: "mono tiny annread" }, (a.readCount || 0) + " 人已读")
  const readBtn = h("button", { class: "btn btn--sm" + (a.iRead ? "" : " btn--red"), type: "button" }, a.iRead ? "✓ 已读" : "我已读")
  readBtn.addEventListener("click", async (e) => {
    e.preventDefault()
    try {
      const r = await api.post("/api/posts/" + a.id + "/read", {})
      a.iRead = true; a.readCount = r.readCount
      readBtn.textContent = "✓ 已读"; readBtn.classList.remove("btn--red")
      cnt.textContent = (a.readCount || 0) + " 人已读"
    } catch (err) { toast(err.message || "失败", "bad") }
  })
  return h("div", { class: "anncard", "data-level": a.level },
    h("a", { class: "anncard__main", href: "/blog/" + a.id, "data-link": "1" },
      h("div", { class: "anncard__tag mono tiny" }, h("span", { class: "anncard__badge" }, "公告"), h("span", { class: "anncard__lvl" }, lvl.zh)),
      h("h3", { class: "anncard__title serif" }, a.title),
      a.excerpt ? h("p", { class: "anncard__ex" }, a.excerpt) : null,
      h("div", { class: "anncard__meta mono tiny" }, "@" + a.author, h("span", { class: "dotsep" }, fmtAgo(a.createdAt)))
    ),
    h("div", { class: "anncard__side" }, a.isAdmin ? cnt : null, readBtn)
  )
}
