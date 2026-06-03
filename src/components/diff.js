import { h, clear } from "../lib/dom.js"
import { openModal } from "./modal.js"

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
  const body = h("div", { class: "diff" },
    h("div", { class: "diff__bar" },
      h("div", { class: "diff__pick" }, h("span", { class: "mono tiny" }, "旧 A"), h("div", { class: "select" }, optA)),
      h("div", { class: "diff__pick" }, h("span", { class: "mono tiny" }, "新 B"), h("div", { class: "select" }, optB)),
      h("div", { class: "diff__modes" }, ...modeBtns)
    ),
    stage
  )

  const modal = openModal("Diff / 版本对比", body)
  modal.card.classList.add("modal__card--wide")

  function draw() {
    clear(stage)
    const va = versions.find((v) => v.id === A)
    const vb = versions.find((v) => v.id === B)
    const ia = imgOf(va)
    const ib = imgOf(vb)
    if (!ia || !ib) { stage.append(h("div", { class: "muted mono", style: "padding:50px" }, "所选版本无可对比图像")); return }

    if (mode === "side") {
      stage.append(h("div", { class: "diff__side" },
        h("figure", {}, h("img", { src: ia }), h("figcaption", { class: "mono tiny" }, "A · v" + num(A))),
        h("figure", {}, h("img", { src: ib }), h("figcaption", { class: "mono tiny" }, "B · v" + num(B)))
      ))
      return
    }

    if (mode === "onion") {
      const top = h("img", { class: "diff__onA", src: ia })
      const box = h("div", { class: "diff__onion" }, h("img", { class: "diff__onB", src: ib }), top)
      const range = h("input", { type: "range", min: "0", max: "100", value: "50", class: "diff__range" })
      top.style.opacity = "0.5"
      range.addEventListener("input", () => { top.style.opacity = String(range.value / 100) })
      stage.append(box, h("div", { class: "diff__ctl" }, h("span", { class: "mono tiny" }, "B 新"), range, h("span", { class: "mono tiny" }, "A 旧")))
      return
    }

    const aimg = h("img", { src: ia })
    const aWrap = h("div", { class: "diff__cmpA" }, aimg)
    const handle = h("div", { class: "diff__handle" })
    const box = h("div", { class: "diff__cmp" }, h("img", { class: "diff__cmpBase", src: ib }), aWrap, handle)
    stage.append(box)

    const setPct = (pct) => {
      pct = Math.max(0, Math.min(100, pct))
      aWrap.style.width = pct + "%"
      handle.style.left = pct + "%"
      aimg.style.width = box.clientWidth + "px"
    }
    const move = (clientX) => { const r = box.getBoundingClientRect(); setPct(((clientX - r.left) / r.width) * 100) }
    box.addEventListener("pointerdown", (e) => { box.setPointerCapture(e.pointerId); move(e.clientX) })
    box.addEventListener("pointermove", (e) => { if (e.buttons) move(e.clientX) })
    requestAnimationFrame(() => setPct(50))
    addEventListener("resize", () => setPct(parseFloat(aWrap.style.width) || 50))
  }

  draw()
  return modal
}
