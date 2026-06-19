import { h, clear } from "../lib/dom.js"
import { openModal } from "./modal.js"

function attachZoom(view, pan, onChange) {
  let scale = 1, tx = 0, ty = 0
  const MIN = 1, MAX = 8
  function clampPan() {
    const w = view.clientWidth, hh = view.clientHeight
    const cw = pan.clientWidth * scale, ch = pan.clientHeight * scale
    tx = cw <= w ? (w - cw) / 2 : Math.min(0, Math.max(w - cw, tx))
    ty = ch <= hh ? (hh - ch) / 2 : Math.min(0, Math.max(hh - ch, ty))
  }
  function apply() { clampPan(); pan.style.transform = "translate(" + tx + "px," + ty + "px) scale(" + scale + ")"; onChange && onChange(scale) }
  function zoomAt(cx, cy, f) {
    const r = view.getBoundingClientRect()
    const px = cx - r.left, py = cy - r.top
    const ix = (px - tx) / scale, iy = (py - ty) / scale
    scale = Math.max(MIN, Math.min(MAX, scale * f))
    tx = px - ix * scale; ty = py - iy * scale
    apply()
  }
  view.addEventListener("wheel", (e) => { e.preventDefault(); zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.2 : 1 / 1.2) }, { passive: false })
  return {
    reset() { scale = 1; tx = 0; ty = 0; apply() },
    panBy(dx, dy) { tx += dx; ty += dy; apply() },
    screenToImage(cx, cy) { const r = view.getBoundingClientRect(); return { x: (cx - r.left - tx) / scale, y: (cy - r.top - ty) / scale } },
    apply, get scale() { return scale }
  }
}

export function diffModal({ project, versions }) {
  const num = (id) => { const i = versions.findIndex((v) => v.id === id); return i < 0 ? 0 : versions.length - i }
  const cover = (v) => (v.assets || []).find((a) => a.id === v.coverAssetId) || (v.assets || [])[0]
  const imgOf = (v) => { const c = cover(v); return c ? (c.previewUrl || c.posterUrl || c.originalUrl) : null }

  let B = versions[0].id
  let A = (versions[1] || versions[0]).id
  let mode = "slider"

  const optA = h("select", {}, ...versions.map((v) => h("option", { value: v.id }, "v" + num(v.id) + " · " + v.message)))
  const optB = h("select", {}, ...versions.map((v) => h("option", { value: v.id }, "v" + num(v.id) + " · " + v.message)))
  optA.value = A
  optB.value = B
  optA.addEventListener("change", () => { A = optA.value; draw() })
  optB.addEventListener("change", () => { B = optB.value; draw() })

  const modeDefs = [["slider", "滑块"], ["side", "并排"], ["onion", "洋葱皮"]]
  const modeBtns = modeDefs.map(([k, label]) => h("button", { class: "chip", "data-on": k === mode ? "1" : "0", "data-k": k }, label))
  modeBtns.forEach((b) => b.addEventListener("click", () => {
    mode = b.dataset.k
    modeBtns.forEach((x) => x.setAttribute("data-on", x.dataset.k === mode ? "1" : "0"))
    draw()
  }))

  const stage = h("div", { class: "diff__stage" })
  const hud = h("div", { class: "diff__hud" })
  const body = h("div", { class: "diff" },
    h("div", { class: "diff__bar" },
      h("div", { class: "diff__pick" }, h("span", { class: "mono tiny" }, "旧 A"), h("div", { class: "select" }, optA)),
      h("div", { class: "diff__pick" }, h("span", { class: "mono tiny" }, "新 B"), h("div", { class: "select" }, optB)),
      h("div", { class: "diff__modes" }, ...modeBtns)
    ),
    stage, hud
  )

  const modal = openModal("Diff / 版本对比", body)
  modal.card.classList.add("modal__card--wide")

  function draw() {
    clear(stage); clear(hud)
    const ia = imgOf(versions.find((v) => v.id === A))
    const ib = imgOf(versions.find((v) => v.id === B))
    if (!ia || !ib) { stage.append(h("div", { class: "muted mono", style: "padding:50px" }, "所选版本无可对比图像")); return }

    if (mode === "side") {
      stage.append(h("div", { class: "diff__side" },
        h("figure", {}, h("img", { src: ia }), h("figcaption", { class: "mono tiny" }, "A · v" + num(A))),
        h("figure", {}, h("img", { src: ib }), h("figcaption", { class: "mono tiny" }, "B · v" + num(B)))
      ))
      return
    }

    const base = h("img", { class: "dz__img", src: ib, draggable: "false", alt: "" })
    const over = h("img", { class: "dz__img dz__over", src: ia, draggable: "false", alt: "" })
    const handle = mode === "slider" ? h("div", { class: "dz__handle" }, h("span", { class: "dz__grip mono" }, "↔")) : null
    const pan = h("div", { class: "dz__pan" }, base, over, handle)
    const view = h("div", { class: "dz__view" }, pan)
    stage.append(view)

    const tag = h("span", { class: "dz__lvl mono tiny" }, "100%")
    const zoom = attachZoom(view, pan, (s) => { tag.textContent = Math.round(s * 100) + "%" })
    base.addEventListener("load", () => zoom.apply())
    requestAnimationFrame(() => zoom.apply())

    if (mode === "onion") {
      over.style.opacity = "0.5"
      const range = h("input", { type: "range", min: "0", max: "100", value: "50", class: "diff__range" })
      range.addEventListener("input", () => { over.style.opacity = String(range.value / 100) })
      hud.append(h("div", { class: "dz__onion" }, h("span", { class: "mono tiny" }, "B 新"), range, h("span", { class: "mono tiny" }, "A 旧")))
      let last = null
      view.addEventListener("pointerdown", (e) => { if (e.target.closest(".dz__hud")) return; view.setPointerCapture(e.pointerId); last = { x: e.clientX, y: e.clientY } })
      view.addEventListener("pointermove", (e) => { if (!last) return; zoom.panBy(e.clientX - last.x, e.clientY - last.y); last = { x: e.clientX, y: e.clientY } })
      view.addEventListener("pointerup", () => { last = null })
    } else {
      let pct = 50
      const setPct = (p) => { pct = Math.max(0, Math.min(100, p)); over.style.clipPath = "inset(0 " + (100 - pct) + "% 0 0)"; handle.style.left = pct + "%" }
      setPct(50)
      let drag = null
      const divAt = (cx, cy) => { const { x } = zoom.screenToImage(cx, cy); setPct(pan.clientWidth ? (x / pan.clientWidth) * 100 : 50) }
      view.addEventListener("pointerdown", (e) => {
        view.setPointerCapture(e.pointerId)
        if (e.target.closest(".dz__handle")) { drag = { type: "div" }; divAt(e.clientX, e.clientY) }
        else drag = { type: "pan", x: e.clientX, y: e.clientY }
      })
      view.addEventListener("pointermove", (e) => {
        if (!drag) return
        if (drag.type === "div") divAt(e.clientX, e.clientY)
        else { zoom.panBy(e.clientX - drag.x, e.clientY - drag.y); drag.x = e.clientX; drag.y = e.clientY }
      })
      view.addEventListener("pointerup", () => { drag = null })
    }

    view.addEventListener("dblclick", () => zoom.reset())
    hud.append(
      tag,
      h("button", { class: "btn btn--sm btn--ghost", type: "button", onClick: () => zoom.reset() }, "复位"),
      h("span", { class: "mono tiny muted dz__hint" }, mode === "slider" ? "拖动分割线对比 · 滚轮缩放 · 双击复位" : "拖动平移 · 滚轮缩放 · 双击复位")
    )
  }

  draw()
  addEventListener("resize", draw)
  return modal
}
