import { h, clear } from "../lib/dom.js"
import { openModal } from "./modal.js"
import { api } from "../lib/api.js"
import { toast } from "./toast.js"

export function planDialog({ date, onSaved }) {
  let items = []
  let myProjects = []

  const list = h("div", { class: "planlist" })
  const projSel = h("select", {})
  const imgCount = h("input", { class: "input mono", type: "number", min: "1", max: "999", value: "5", style: "width:74px" })
  const manualText = h("input", { class: "input", placeholder: "手动事项，如：找参考、画线稿…", maxlength: "120" })

  const body = h("div", { class: "plandlg" },
    list,
    h("div", { class: "plandlg__add" },
      h("div", { class: "kicker" }, "自动目标 · 可自动判定"),
      h("div", { class: "planrow" }, h("div", { class: "select", style: "flex:1;min-width:0" }, projSel), h("button", { class: "btn btn--sm", type: "button", onClick: addVersion }, "+ 该作品新版本")),
      h("div", { class: "planrow" }, imgCount, h("span", { class: "mono tiny" }, "张图"), h("button", { class: "btn btn--sm", type: "button", onClick: addImages, style: "margin-left:auto" }, "+ 上传图片")),
      h("div", { class: "kicker", style: "margin-top:16px" }, "手动事项 · 手动勾选"),
      h("div", { class: "planrow" }, manualText, h("button", { class: "btn btn--sm", type: "button", onClick: addManual }, "+ 添加"))
    ),
    h("button", { class: "btn btn--red btn--lg", type: "button", style: "width:100%;margin-top:8px", onClick: save }, "保存计划")
  )
  const modal = openModal("Plan · " + date, body)

  function render() {
    clear(list)
    if (!items.length) { list.append(h("div", { class: "muted mono tiny", style: "padding:4px 0 10px" }, "还没有计划项，在下面添加")); return }
    items.forEach((it, i) => list.append(itemRow(it, i)))
  }

  function itemRow(it, i) {
    const rm = h("button", { class: "planx", type: "button", title: "移除", onClick: () => { items.splice(i, 1); render() } }, "✕")
    if (it.kind === "manual") {
      const cb = h("input", { type: "checkbox", checked: it.checked })
      cb.addEventListener("change", () => { it.checked = cb.checked })
      return h("div", { class: "pitem" }, h("label", { class: "pitem__chk" }, cb, h("span", { class: "pitem__box" })), h("span", { class: "pitem__t" }, it.text), rm)
    }
    const label = it.kind === "version" ? "上传《" + (it.projectTitle || "项目") + "》的新版本" : "上传 " + it.count + " 张图片"
    return h("div", { class: "pitem pitem--auto" + (it.done ? " pitem--done" : "") },
      h("span", { class: "pitem__auto mono" }, "AUTO"),
      h("span", { class: "pitem__t" }, label),
      it.done ? h("span", { class: "pitem__ok" }, "✓") : null,
      rm)
  }

  function addVersion() {
    const pid = projSel.value
    const proj = myProjects.find((p) => p.id === pid)
    if (!proj) { toast("你还没有项目可选", "info"); return }
    if (items.some((it) => it.kind === "version" && it.projectId === pid)) { toast("已添加该作品", "info"); return }
    items.push({ kind: "version", projectId: pid, projectTitle: proj.title }); render()
  }
  function addImages() { items.push({ kind: "images", count: Math.max(1, Math.min(999, Number(imgCount.value) || 1)) }); render() }
  function addManual() { const t = manualText.value.trim(); if (!t) return; items.push({ kind: "manual", text: t, checked: false }); manualText.value = ""; render() }

  async function save() {
    try {
      const r = await api.post("/api/plans", { date, items })
      toast("计划已保存", "ok")
      modal.close()
      onSaved && onSaved(r.plan)
    } catch (err) { toast(err.message || "保存失败", "bad") }
  }

  ;(async () => {
    try {
      const [plan, projs] = await Promise.all([api.get("/api/plans?date=" + date), api.get("/api/projects?mine=1")])
      items = (plan.plan.items || []).map((it) => ({ ...it }))
      myProjects = projs.projects || []
      clear(projSel)
      if (!myProjects.length) projSel.append(h("option", { value: "" }, "（暂无项目）"))
      else myProjects.forEach((p) => projSel.append(h("option", { value: p.id }, p.title)))
      render()
    } catch (err) { toast(err.message || "加载失败", "bad"); render() }
  })()

  return modal
}
