import { h, bi, clear } from "../lib/dom.js"
import { api } from "../lib/api.js"
import { toast } from "./toast.js"
import { openModal } from "./modal.js"
import { buildAsset } from "../lib/upload.js"
import { asset } from "../lib/net.js"

export function seriesFormModal({ series, onSaved }) {
  const editing = !!series
  const titleInput = h("input", { class: "input", value: (series && series.title) || "", maxlength: "100", placeholder: "系列标题" })
  const descInput = h("textarea", { class: "textarea", rows: "3", placeholder: "系列简介（可选）" })
  descInput.value = (series && series.desc) || ""
  let coverKey = (series && series.coverKey) || null
  const coverPrev = h("div", { class: "sfcover" }, series && series.coverUrl ? h("img", { src: series.coverUrl }) : h("span", { class: "mono tiny muted" }, "无封面"))
  const coverInput = h("input", { type: "file", accept: "image/*", style: "display:none" })
  coverInput.addEventListener("change", async () => {
    if (!coverInput.files.length) return
    const f = coverInput.files[0]; coverInput.value = ""
    toast("上传封面中…", "info")
    try {
      const a = await buildAsset(f)
      coverKey = a.previewKey || a.originalKey
      clear(coverPrev); coverPrev.append(h("img", { src: asset("/media/" + coverKey) }))
    } catch (e) { toast(e.message || "封面上传失败", "bad") }
  })

  const form = h("form", { class: "stack" },
    h("label", { class: "field" }, h("span", { class: "field__label" }, bi("标题", "TITLE")), titleInput),
    h("label", { class: "field" }, h("span", { class: "field__label" }, bi("简介", "ABOUT")), descInput),
    h("div", { class: "field" },
      h("span", { class: "field__label" }, bi("封面（可选）", "COVER")),
      h("div", { class: "sfcoverrow" }, coverPrev, h("button", { class: "btn btn--sm", type: "button", onClick: () => coverInput.click() }, "选择图片"), coverInput)
    ),
    h("button", { class: "btn btn--red btn--lg", type: "submit", style: "width:100%" }, editing ? "保存系列" : "创建系列")
  )

  const modal = openModal(editing ? "Edit Series / 编辑系列" : "New Series / 新建系列", form)

  form.addEventListener("submit", async (e) => {
    e.preventDefault()
    const title = titleInput.value.trim()
    if (!title) { toast("请填写系列标题", "bad"); return }
    const btn = form.querySelector("button[type=submit]"); btn.disabled = true
    try {
      const payload = { title, desc: descInput.value, coverKey }
      const r = editing ? await api.patch("/api/series/" + series.id, payload) : await api.post("/api/series", payload)
      toast(editing ? "已保存" : "系列已创建", "ok")
      modal.close()
      onSaved && onSaved(r.series)
    } catch (err) { toast(err.message || "失败", "bad"); btn.disabled = false }
  })

  return modal
}
