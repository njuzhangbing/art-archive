import { h, clear } from "../lib/dom.js"
import { api } from "../lib/api.js"
import { toast } from "./toast.js"
import { openModal } from "./modal.js"
import { GRADES } from "../lib/grades.js"
import { DAMAGE } from "../lib/damage.js"
import { PERSONA } from "../lib/persona.js"
import { buildAsset } from "../lib/upload.js"

export function characterFormModal({ character, onSaved }) {
  const editing = !!character
  let grade = (character && character.grade) || "ZAYIN"
  let damage = (character && character.damage) || "RED"
  let persona = (character && character.persona) || "FULL"
  let experimental = !!(character && character.experimental)
  let slots = editing ? (character.portraits || []).map((p) => ({ type: "have", key: p.key, url: p.url, w: p.w, h: p.h, filename: p.filename })) : []

  const personaBtns = PERSONA.map((p) => h("button", { type: "button", class: "perpick__b", "data-key": p.key, "data-on": p.key === persona ? "1" : "0" }, h("b", {}, p.label), h("span", { class: "mono tiny" }, p.en)))
  personaBtns.forEach((b) => b.addEventListener("click", () => { persona = b.dataset.key; personaBtns.forEach((x) => x.setAttribute("data-on", x === b ? "1" : "0")) }))

  const gradeBtns = GRADES.map((g) => h("button", { type: "button", "data-grade": g.key, "data-on": g.key === grade ? "1" : "0" }, h("span", { class: "swatch" }), g.key))
  gradeBtns.forEach((b) => b.addEventListener("click", () => { grade = b.dataset.grade; gradeBtns.forEach((x) => x.setAttribute("data-on", x === b ? "1" : "0")) }))

  const dmgBtns = DAMAGE.map((d) => h("button", { type: "button", class: "dmgpick__b", "data-dmg": d.key, "data-on": d.key === damage ? "1" : "0" }, h("img", { src: d.icon, alt: d.label }), h("span", { class: "mono tiny" }, d.label)))
  dmgBtns.forEach((b) => b.addEventListener("click", () => { damage = b.dataset.dmg; dmgBtns.forEach((x) => x.setAttribute("data-on", x === b ? "1" : "0")) }))

  const fileInput = h("input", { type: "file", multiple: true, accept: "image/*", style: "display:none" })
  const porGrid = h("div", { class: "porgrid" })

  function addFiles(files) { for (const f of files) slots.push({ type: "file", file: f, url: URL.createObjectURL(f) }); renderPortraits() }
  fileInput.addEventListener("change", () => { if (fileInput.files.length) addFiles([...fileInput.files]); fileInput.value = "" })

  function renderPortraits() {
    clear(porGrid)
    slots.forEach((s, i) => {
      const cover = i === 0
      porGrid.append(h("div", { class: "porth" + (cover ? " porth--cover" : "") },
        h("img", { src: s.url }),
        cover ? h("span", { class: "porth__c mono" }, "封面") : null,
        h("button", { type: "button", class: "porth__x", title: "移除", onClick: () => { slots.splice(i, 1); renderPortraits() } }, "✕"),
        !cover ? h("button", { type: "button", class: "porth__cv mono", title: "设为封面", onClick: () => { const [it] = slots.splice(i, 1); slots.unshift(it); renderPortraits() } }, "设封面") : null
      ))
    })
    porGrid.append(h("button", { type: "button", class: "poradd", onClick: () => fileInput.click() }, "+ 立绘"))
  }
  renderPortraits()

  const codeInput = h("input", { class: "input mono", name: "code", value: (character && character.code) || "", maxlength: "24", placeholder: experimental ? "E-01-45" : "O-01-45" })
  const codeHint = h("span", { class: "mono tiny exphint", style: experimental ? "" : "display:none" }, "实验性实体 · 编号首位锁定 E")
  codeInput.addEventListener("input", () => {
    if (experimental && codeInput.value && codeInput.value[0].toUpperCase() !== "E") codeInput.value = "E" + codeInput.value.slice(1)
  })

  const expBox = h("input", { type: "checkbox", checked: experimental })
  const expToggle = h("label", { class: "expcheck" + (experimental ? " expcheck--on" : "") }, expBox, h("span", { class: "expcheck__box" }), h("span", { class: "expcheck__lbl" }, "实验性实体 / EXPERIMENTAL"))
  expBox.addEventListener("change", () => {
    experimental = expBox.checked
    expToggle.classList.toggle("expcheck--on", experimental)
    codeInput.placeholder = experimental ? "E-01-45" : "O-01-45"
    codeHint.style.display = experimental ? "" : "none"
    if (experimental && codeInput.value) codeInput.value = "E" + codeInput.value.slice(1)
  })

  const form = h("form", { class: "stack pform" },
    h("label", { class: "field" }, h("span", { class: "field__label" }, "角色名 / NAME"), h("input", { class: "input", name: "name", value: (character && character.name) || "", maxlength: "80", placeholder: "角色名", autofocus: true })),
    h("label", { class: "field" }, h("span", { class: "field__label" }, "编号 / CODE（X-xx-xx）"), codeInput, codeHint),
    h("div", { class: "field" }, h("span", { class: "field__label" }, "拟人化 / PERSONA"), h("div", { class: "perpick" }, ...personaBtns)),
    h("div", { class: "field" }, expToggle),
    h("div", { class: "field" }, h("span", { class: "field__label" }, "分级 / GRADE"), h("div", { class: "gradepick" }, ...gradeBtns)),
    h("div", { class: "field" }, h("span", { class: "field__label" }, "伤害类型 / DAMAGE"), h("div", { class: "dmgpick" }, ...dmgBtns)),
    h("div", { class: "field" }, h("span", { class: "field__label" }, "立绘 / PORTRAITS（第一张为封面）"), porGrid, fileInput),
    h("button", { class: "btn btn--red btn--lg", type: "submit", style: "width:100%" }, editing ? "保存角色" : "建立角色")
  )

  const modal = openModal(editing ? "Edit / 编辑角色" : "New / 新建角色", form)

  form.addEventListener("submit", async (e) => {
    e.preventDefault()
    const grab = (n) => (form.querySelector("[name=" + n + "]") || {}).value || ""
    const name = grab("name").trim()
    if (!name) { toast("请填写角色名", "bad"); return }
    let code = grab("code").trim()
    if (experimental && code) code = "E" + code.slice(1)
    if (code && !/^[A-Za-z]-\d{2}-\d{2}$/.test(code)) toast("编号建议格式 X-xx-xx，已按原样保存", "info")
    const btn = form.querySelector("button[type=submit]")
    btn.disabled = true
    btn.textContent = "上传立绘…"
    try {
      for (const s of slots) {
        if (s.type === "file" && !s.key) {
          const a = await buildAsset(s.file)
          s.key = a.previewKey || a.originalKey
          s.w = a.w; s.h = a.h; s.filename = a.filename
        }
      }
      const portraits = slots.map((s) => ({ key: s.key, w: s.w, h: s.h, filename: s.filename })).filter((s) => s.key)
      const payload = { name, code, grade, damage, persona, experimental, portraits, coverKey: portraits[0] ? portraits[0].key : null }
      const r = editing ? await api.patch("/api/characters/" + character.id, payload) : await api.post("/api/characters", payload)
      toast(editing ? "已保存" : "角色已建立", "ok")
      modal.close()
      onSaved && onSaved(r.character)
    } catch (err) {
      toast(err.message || "保存失败", "bad")
      btn.disabled = false
      btn.textContent = editing ? "保存角色" : "建立角色"
    }
  })

  return modal
}
