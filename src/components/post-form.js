import { h } from "../lib/dom.js"
import { api } from "../lib/api.js"
import { toast } from "./toast.js"
import { openModal } from "./modal.js"
import { mdToHtml } from "../lib/markdown.js"
import { buildAsset } from "../lib/upload.js"
import { session } from "../lib/store.js"
import { LEVELS } from "../lib/announce.js"

function insertAt(ta, text) {
  const s = ta.selectionStart, e = ta.selectionEnd
  ta.value = ta.value.slice(0, s) + text + ta.value.slice(e)
  ta.focus()
  const pos = s + text.length
  ta.setSelectionRange(pos, pos)
  ta.dispatchEvent(new Event("input", { bubbles: true }))
}

export function postFormModal({ post, presetSeriesId, onSaved }) {
  const editing = !!post
  const isAdmin = !!(session.me && session.me.role === "admin")
  const titleInput = h("input", { class: "input", name: "title", value: (post && post.title) || "", maxlength: "140", placeholder: "文章标题" })
  const ta = h("textarea", { class: "textarea wikied", placeholder: "用 Markdown 写作…\n\n# 标题\n**加粗** *斜体* > 引用 - 列表\n用上方按钮插入图片 / 引用项目 / 引用角色" })
  ta.value = (post && post.body) || ""
  const preview = h("div", { class: "wiki" })
  const sync = () => { preview.innerHTML = mdToHtml(ta.value) || '<p class="muted">预览…</p>' }
  ta.addEventListener("input", sync)

  const imgInput = h("input", { type: "file", accept: "image/*", style: "display:none" })
  imgInput.addEventListener("change", async () => {
    if (!imgInput.files.length) return
    const f = imgInput.files[0]
    imgInput.value = ""
    toast("上传图片中…", "info")
    try { const a = await buildAsset(f); insertAt(ta, "\n![图片](/media/" + (a.previewKey || a.originalKey) + ")\n") }
    catch (err) { toast(err.message || "图片上传失败", "bad") }
  })

  async function pickRef(label, url, key, toMd, toText) {
    let data
    try { data = await api.get(url) } catch { toast("加载失败", "bad"); return }
    const items = data[key] || []
    const listEl = h("div", { class: "reflist" })
    if (!items.length) listEl.append(h("div", { class: "muted mono tiny" }, "暂无" + label))
    const m = openModal("引用" + label, listEl)
    items.forEach((x) => {
      const b = h("button", { class: "refrow", type: "button" }, toText(x))
      b.addEventListener("click", () => { insertAt(ta, toMd(x)); m.close() })
      listEl.append(b)
    })
  }

  const toolbar = h("div", { class: "ptoolbar" },
    h("button", { class: "btn btn--sm", type: "button", onClick: () => imgInput.click() }, "＋ 插入图片"),
    h("button", { class: "btn btn--sm", type: "button", onClick: () => pickRef("项目", "/api/projects", "projects", (x) => "[《" + x.title + "》](/projects/" + x.id + ")", (x) => x.title) }, "＠ 引用项目"),
    h("button", { class: "btn btn--sm", type: "button", onClick: () => pickRef("角色", "/api/characters", "characters", (x) => "[" + x.name + "](/characters/" + x.id + ")", (x) => x.name + (x.code ? " · " + x.code : "")) }, "＠ 引用角色"),
    imgInput
  )

  const seriesSel = h("select", { class: "input" }, h("option", { value: "" }, "（不属于系列）"))
  const currentSeries = (post && post.seriesId) || presetSeriesId || ""
  api.get("/api/series").then((r) => {
    (r.series || []).forEach((s) => {
      const o = h("option", { value: s.id }, s.title)
      if (s.id === currentSeries) o.selected = true
      seriesSel.append(o)
    })
  }).catch(() => {})

  const annSel = isAdmin
    ? h("select", { class: "input" }, h("option", { value: "" }, "不是公告"), ...LEVELS.map((l) => h("option", { value: l.key }, "公告 · " + l.zh)))
    : null
  if (annSel && editing && post.kind === "announcement") annSel.value = post.level || "normal"

  const metaRow = h("div", { class: "pformmeta" },
    h("label", { class: "field" }, h("span", { class: "field__label" }, "归入系列 / SERIES"), seriesSel),
    isAdmin ? h("label", { class: "field" }, h("span", { class: "field__label" }, "公告 / ANNOUNCE"), annSel) : null
  )

  const form = h("form", { class: "stack pform" },
    h("label", { class: "field" }, h("span", { class: "field__label" }, "标题 / TITLE"), titleInput),
    metaRow,
    toolbar,
    h("div", { class: "wikiedit" },
      h("div", { class: "wikiedit__pane" }, h("div", { class: "wikiedit__lbl mono tiny" }, "Markdown"), ta),
      h("div", { class: "wikiedit__pane" }, h("div", { class: "wikiedit__lbl mono tiny" }, "预览"), preview)
    ),
    h("button", { class: "btn btn--red btn--lg", type: "submit", style: "width:100%" }, editing ? "保存文章" : "发布文章")
  )
  sync()

  const modal = openModal(editing ? "Edit / 编辑文章" : "Write / 写文章", form)
  modal.card.classList.add("modal__card--wide")

  form.addEventListener("submit", async (e) => {
    e.preventDefault()
    const title = titleInput.value.trim()
    if (!title) { toast("请填写标题", "bad"); return }
    const btn = form.querySelector("button[type=submit]")
    btn.disabled = true
    try {
      const payload = { title, body: ta.value, seriesId: seriesSel.value || null }
      if (isAdmin && annSel) {
        if (annSel.value) { payload.kind = "announcement"; payload.level = annSel.value }
        else payload.kind = "post"
      }
      const r = editing ? await api.patch("/api/posts/" + post.id, payload) : await api.post("/api/posts", payload)
      toast(editing ? "已保存" : "已发布", "ok")
      modal.close()
      onSaved && onSaved(r.post)
    } catch (err) { toast(err.message || "失败", "bad"); btn.disabled = false }
  })

  return modal
}
