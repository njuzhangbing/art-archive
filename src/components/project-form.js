import { h } from "../lib/dom.js"
import { api } from "../lib/api.js"
import { toast } from "./toast.js"
import { openModal } from "./modal.js"
import { GRADES } from "../lib/grades.js"

export function projectFormModal({ project, onSaved }) {
  const editing = !!project
  let grade = (project && project.grade) || "ZAYIN"

  const gradeBtns = GRADES.map((g) =>
    h("button", { type: "button", "data-grade": g.key, "data-on": g.key === grade ? "1" : "0", title: g.zh },
      h("span", { class: "swatch" }), g.key)
  )
  gradeBtns.forEach((b) => b.addEventListener("click", () => {
    grade = b.getAttribute("data-grade")
    gradeBtns.forEach((x) => x.setAttribute("data-on", x === b ? "1" : "0"))
  }))

  const form = h("form", { class: "stack pform" },
    h("label", { class: "field" }, h("span", { class: "field__label" }, "标题 / TITLE"),
      h("input", { class: "input", name: "title", value: (project && project.title) || "", maxlength: "80", placeholder: "作品名", autofocus: true })),
    h("label", { class: "field" }, h("span", { class: "field__label" }, "描述 / DESC"),
      h("textarea", { class: "textarea", name: "desc", maxlength: "500", placeholder: "这件作品是…" })),
    h("div", { class: "field" }, h("span", { class: "field__label" }, "分级 / GRADE"), h("div", { class: "gradepick" }, ...gradeBtns)),
    h("label", { class: "field" }, h("span", { class: "field__label" }, "标签 / TAGS（逗号分隔）"),
      h("input", { class: "input", name: "tags", value: (project && (project.tags || []).join(", ")) || "", placeholder: "油画, 城市, 概念" })),
    h("button", { class: "btn btn--red btn--lg", type: "submit", style: "width:100%" }, editing ? "保存修改" : "建立项目")
  )
  form.querySelector("[name=desc]").value = (project && project.desc) || ""

  const modal = openModal(editing ? "Edit / 编辑项目" : "New / 新建项目", form)

  form.addEventListener("submit", async (e) => {
    e.preventDefault()
    const grab = (n) => (form.querySelector("[name=" + n + "]") || {}).value || ""
    const payload = { title: grab("title"), desc: grab("desc"), grade, tags: grab("tags") }
    if (!payload.title.trim()) { toast("请填写标题", "bad"); return }
    const btn = form.querySelector("button[type=submit]")
    btn.disabled = true
    try {
      const r = editing
        ? await api.patch("/api/projects/" + project.id, payload)
        : await api.post("/api/projects", payload)
      toast(editing ? "已保存" : "项目已建立", "ok")
      modal.close()
      onSaved && onSaved(r.project)
    } catch (err) {
      toast(err.message || "失败", "bad")
      btn.disabled = false
    }
  })

  return modal
}
