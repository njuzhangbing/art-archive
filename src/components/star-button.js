import { h } from "../lib/dom.js"
import { api } from "../lib/api.js"
import { toast } from "./toast.js"

export function starButton(p, onChange) {
  const num = h("span", { class: "starbtn__n mono" }, String(p.starCount || 0))
  const btn = h("button", {
    class: "starbtn" + (p.starred ? " starbtn--on" : "") + (p.isOwn ? " starbtn--own" : ""),
    type: "button",
    title: p.isOwn ? "自己的项目不能收藏" : (p.starred ? "取消收藏" : "收藏")
  }, h("span", { class: "starbtn__ico" }, "★"), num)

  if (p.isOwn) { btn.disabled = true; return btn }

  btn.addEventListener("click", async (e) => {
    e.preventDefault()
    e.stopPropagation()
    btn.disabled = true
    try {
      const r = await api.post("/api/projects/" + p.id + "/star")
      p.starred = r.starred
      p.starCount = r.starCount
      btn.classList.toggle("starbtn--on", r.starred)
      btn.title = r.starred ? "取消收藏" : "收藏"
      num.textContent = String(r.starCount)
      onChange && onChange(r)
    } catch (err) { toast(err.message || "操作失败", "bad") }
    finally { btn.disabled = false }
  })
  return btn
}
