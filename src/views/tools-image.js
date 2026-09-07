import { h, bi, clear } from "../lib/dom.js"
import { toast } from "../components/toast.js"
import { EFFECTS, freshStep } from "../lib/fx-effects.js"
import { createStage, MAX_EDGE } from "../lib/fx-gl.js"

/**
 * The workbench.
 *
 * Open a picture, stack effects on it, take it away. Everything happens on the
 * reader's own machine — the file is never uploaded, nothing is processed on a
 * server, and the archive is not billed for anyone's afternoon of playing. The
 * export is rendered at the image's real size, not the preview's.
 */

const OUT = [
  { ext: "png", mime: "image/png", zh: "PNG 无损", en: "LOSSLESS" },
  { ext: "webp", mime: "image/webp", zh: "WebP", en: "SMALL" },
  { ext: "jpg", mime: "image/jpeg", zh: "JPEG", en: "PHOTO" }
]

export default function tools(root) {
  const stage = createStage()
  const shelf = h("div", { class: "wb__shelf" })
  const stack = h("div", { class: "wb__stack" })
  const plate = h("div", { class: "wb__plate" })
  const meta = h("div", { class: "wb__meta mono" })

  let steps = []
  let loaded = false
  let queued = 0
  let name = "untitled"

  if (!stage) {
    root.append(h("div", { class: "wrap soon" },
      h("h2", {}, "这台设备不支持"),
      h("p", {}, "图像工作台需要 WebGL2。换一个较新的浏览器再来。")))
    return {}
  }

  stage.canvas.className = "wb__canvas"

  // ---- taking a picture in ----

  const file = h("input", { type: "file", accept: "image/*", style: "display:none" })
  file.addEventListener("change", () => {
    if (file.files && file.files[0]) open(file.files[0])
    file.value = ""
  })

  const drop = h("button", { class: "wb__drop", type: "button", onClick: () => file.click() },
    h("span", { class: "wb__dropMark" }, "＋"),
    h("span", { class: "wb__dropTxt" }, bi("选择或拖入一张图片", "DROP AN IMAGE")))
  plate.append(drop)

  ;["dragenter", "dragover"].forEach((e) => plate.addEventListener(e, (ev) => {
    ev.preventDefault(); plate.setAttribute("data-over", "1")
  }))
  ;["dragleave", "drop"].forEach((e) => plate.addEventListener(e, () => plate.removeAttribute("data-over")))
  plate.addEventListener("drop", (ev) => {
    ev.preventDefault()
    const f = [...(ev.dataTransfer.files || [])].find((x) => x.type.startsWith("image/"))
    if (f) open(f)
  })

  async function open(f) {
    const url = URL.createObjectURL(f)
    try {
      const img = await new Promise((ok, no) => {
        const i = new Image()
        i.onload = () => ok(i); i.onerror = () => no(new Error("读不出这张图"))
        i.src = url
      })
      const { w, h: hh } = stage.load(img)
      name = (f.name || "image").replace(/\.[^.]+$/, "")
      loaded = true
      clear(plate)
      plate.append(stage.canvas)
      const big = (img.naturalWidth > MAX_EDGE || img.naturalHeight > MAX_EDGE)
      meta.textContent = `${img.naturalWidth}×${img.naturalHeight}` +
        (big ? `  →  ${w}×${hh}（超出 ${MAX_EDGE}px，已缩）` : "")
      paint()
    } catch (e) {
      toast(e.message || "打不开这个文件", "bad")
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  // ---- the stack ----

  /** Coalesced into one frame: a slider drag must not queue a render per pixel. */
  function paint() {
    if (!loaded || queued) return
    queued = requestAnimationFrame(() => {
      queued = 0
      stage.render(steps.filter((s) => s.on))
    })
  }

  function add(id) {
    const s = freshStep(id)
    if (!s) return
    steps.push(s)
    drawStack()
    paint()
  }

  function drawStack() {
    clear(stack)
    if (!steps.length) {
      stack.append(h("div", { class: "wb__none mono" }, "还没有效果。从上面挑一个。"))
      return
    }
    steps.forEach((s, i) => {
      const fx = EFFECTS.find((e) => e.id === s.id)
      const head = h("div", { class: "wb__cardHead" },
        h("button", {
          class: "wb__eye", type: "button", "data-on": s.on ? "1" : "0",
          title: s.on ? "停用" : "启用",
          onClick: () => { s.on = !s.on; drawStack(); paint() }
        }, s.on ? "●" : "○"),
        h("div", { class: "wb__cardName" }, bi(fx.zh, fx.en)),
        h("div", { class: "wb__cardActs" },
          h("button", { class: "wb__mini", type: "button", title: "上移", disabled: i === 0,
            onClick: () => { steps.splice(i - 1, 0, steps.splice(i, 1)[0]); drawStack(); paint() } }, "↑"),
          h("button", { class: "wb__mini", type: "button", title: "下移", disabled: i === steps.length - 1,
            onClick: () => { steps.splice(i + 1, 0, steps.splice(i, 1)[0]); drawStack(); paint() } }, "↓"),
          h("button", { class: "wb__mini", type: "button", title: "移除",
            onClick: () => { steps.splice(i, 1); drawStack(); paint() } }, "×")))

      const knobs = fx.params.map((p, k) => {
        const out = h("span", { class: "wb__val mono" }, fmt(s.values[k], p))
        const range = h("input", {
          class: "wb__range", type: "range",
          min: p.min, max: p.max, step: p.step, value: s.values[k]
        })
        range.addEventListener("input", () => {
          s.values[k] = parseFloat(range.value)
          out.textContent = fmt(s.values[k], p)
          paint()
        })
        return h("label", { class: "wb__knob" },
          h("span", { class: "wb__knobName mono" }, p.key, h("i", {}, p.en)),
          range, out)
      })

      stack.append(h("div", { class: "wb__card", "data-on": s.on ? "1" : "0" },
        head,
        h("div", { class: "wb__knobs" }, ...knobs)))
    })
  }

  const fmt = (v, p) => (p.step >= 1 ? String(Math.round(v)) : v.toFixed(p.step < 0.01 ? 3 : 2))

  EFFECTS.forEach((fx) => {
    shelf.append(h("button", { class: "wb__add", type: "button", onClick: () => add(fx.id) },
      bi(fx.zh, fx.en)))
  })

  // ---- taking it away ----

  async function save(kind) {
    if (!loaded) { toast("先选一张图", "bad"); return }
    stage.render(steps.filter((s) => s.on))
    const blob = await new Promise((ok) => stage.canvas.toBlob(ok, kind.mime, kind.ext === "png" ? undefined : 0.92))
    if (!blob) { toast("导出失败", "bad"); return }
    const a = h("a", { href: URL.createObjectURL(blob), download: `${name}-${stampish()}.${kind.ext}` })
    document.body.append(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 4000)
    toast(`已导出 ${(blob.size / 1048576).toFixed(1)} MB`, "ok")
  }

  const outs = OUT.map((k) => h("button", { class: "wb__save", type: "button", onClick: () => save(k) },
    bi(k.zh, k.en)))

  const view = h("div", { class: "wrap wb" },
    h("div", { class: "section__head" },
      h("div", {},
        h("span", { class: "kicker" }, "Workbench / 工具"),
        h("h1", { class: "h-section", style: "margin-top:12px" }, "图像工作台")),
      h("button", { class: "btn btn--sm btn--ghost", type: "button", onClick: () => {
        steps = []; drawStack(); paint(); toast("已清空效果", "info")
      } }, "清空效果")),
    h("div", { class: "wb__grid" },
      h("div", { class: "wb__left" }, plate, meta,
        h("div", { class: "wb__saves" }, ...outs)),
      h("div", { class: "wb__right" },
        h("div", { class: "wb__shelfHead mono" }, "效果 / EFFECTS"),
        shelf,
        h("div", { class: "wb__shelfHead mono" }, "叠加顺序 / STACK"),
        stack)),
    file)

  root.append(view)
  drawStack()

  return {
    destroy() {
      if (queued) cancelAnimationFrame(queued)
      stage.destroy()
    }
  }
}

function stampish() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, "0")
  return `${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}
