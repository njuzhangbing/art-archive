import { h, clear } from "../lib/dom.js"
import { openModal } from "./modal.js"
import { toast } from "./toast.js"
import { api } from "../lib/api.js"
import { buildAsset, kindOf } from "../lib/upload.js"
import { fmtBytes } from "../lib/fmt.js"

export function uploadModal({ project, onDone }) {
  const picked = []

  const input = h("input", { type: "file", multiple: true, accept: "image/*,video/*,.psd,image/vnd.adobe.photoshop", style: "display:none" })
  const drop = h("div", { class: "drop" },
    h("div", { class: "drop__in" },
      h("b", { class: "serif" }, "拖拽文件到此"),
      h("span", { class: "mono tiny" }, "或点击选择 · 图片 / 视频 / PSD"),
      input
    )
  )
  const listEl = h("div", { class: "uplist" })
  const msg = h("input", { class: "input", name: "message", placeholder: "本次更新说明，如：完成线稿上色" })
  const presets = ["草稿", "线稿", "色草", "光影", "成图", "修订"].map((p) => {
    const c = h("button", { class: "msgpreset mono", type: "button" }, p)
    c.addEventListener("click", () => { msg.value = p; msg.focus() })
    return c
  })
  const submit = h("button", { class: "btn btn--red btn--lg", type: "button", style: "width:100%", disabled: true }, "提交更新")

  const body = h("div", { class: "stack" },
    drop, listEl,
    h("div", { class: "field", style: "margin-top:6px" },
      h("span", { class: "field__label" }, "更新说明 / MESSAGE"),
      h("div", { class: "msgpresets" }, ...presets),
      msg
    ),
    submit
  )
  const modal = openModal(project.versions ? "Update / 上传更新" : "First / 上传首个版本", body)

  function add(files) {
    for (const f of files) picked.push({ file: f, kind: kindOf(f), thumb: kindOf(f) !== "psd" ? URL.createObjectURL(f) : null, statusEl: null })
    renderList()
  }

  function renderList() {
    clear(listEl)
    picked.forEach((item, i) => {
      const status = h("span", { class: "uprow__status mono tiny" }, "待提交")
      item.statusEl = status
      const thumb = item.thumb && item.kind === "image"
        ? h("img", { src: item.thumb })
        : h("div", { class: "uprow__ico mono" }, item.kind === "video" ? "▶" : item.kind === "psd" ? "PSD" : "IMG")
      listEl.append(h("div", { class: "uprow", "data-kind": item.kind },
        h("div", { class: "uprow__th" }, thumb),
        h("div", { class: "uprow__info" },
          h("div", { class: "uprow__name" }, item.file.name),
          h("div", { class: "mono tiny muted" }, item.kind.toUpperCase() + " · " + fmtBytes(item.file.size))
        ),
        status,
        h("button", { class: "uprow__x", type: "button", title: "移除", onClick: () => { picked.splice(i, 1); renderList() } }, "✕")
      ))
    })
    submit.disabled = picked.length === 0
  }

  drop.addEventListener("click", () => input.click())
  input.addEventListener("change", () => { if (input.files.length) add([...input.files]); input.value = "" })
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.setAttribute("data-over", "1") })
  drop.addEventListener("dragleave", () => drop.removeAttribute("data-over"))
  drop.addEventListener("drop", (e) => {
    e.preventDefault(); drop.removeAttribute("data-over")
    if (e.dataTransfer && e.dataTransfer.files.length) add([...e.dataTransfer.files])
  })

  submit.addEventListener("click", async () => {
    if (!picked.length) return
    submit.disabled = true
    const assets = []
    try {
      for (const item of picked) {
        const set = (t) => { if (item.statusEl) item.statusEl.textContent = t }
        set("处理中…")
        const asset = await buildAsset(item.file, set)
        assets.push(asset)
        set("✓ 已上传")
      }
      submit.textContent = "建立版本…"
      const r = await api.post("/api/projects/" + project.id + "/versions", { message: msg.value, assets, coverAssetId: assets[0] && assets[0].id })
      toast("已提交 " + assets.length + " 个文件", "ok")
      modal.close()
      onDone && onDone(r)
    } catch (err) {
      toast(err.message || "上传失败", "bad")
      submit.disabled = false
      submit.textContent = "提交更新"
    }
  })

  return modal
}
