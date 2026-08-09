import { h, bi } from "../lib/dom.js"
import { api } from "../lib/api.js"
import { toast } from "./toast.js"
import { openModal } from "./modal.js"

export function reportButton({ kind, id, title }) {
  const btn = h("button", { class: "btn btn--sm btn--ghost reportbtn", type: "button", title: "举报给管理员" }, "⚑ 举报")
  btn.addEventListener("click", () => {
    const reason = h("textarea", { class: "textarea", placeholder: "说明举报原因（可选）", maxlength: "500" })
    const send = h("button", { class: "btn btn--red", type: "button", style: "width:100%" }, "提交举报")
    const body = h("div", { class: "stack" },
      h("p", { class: "mono tiny muted" }, "举报对象：" + (title || kind)),
      h("label", { class: "field" }, h("span", { class: "field__label" }, bi("原因", "REASON")), reason),
      send
    )
    const m = openModal("Report / 举报", body)
    send.addEventListener("click", async () => {
      send.disabled = true
      try { await api.post("/api/reports", { kind, targetId: id, targetTitle: title, reason: reason.value }); toast("已提交举报，管理员会处理", "ok"); m.close() }
      catch (err) { toast(err.message || "提交失败", "bad"); send.disabled = false }
    })
  })
  return btn
}
