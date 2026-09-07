import { h, bi, clear } from "../lib/dom.js"
import { api } from "../lib/api.js"
import { toast } from "../components/toast.js"
import { createCamera, supported } from "../lib/camera.js"
import { writePSD, pixelsOf } from "../lib/psd.write.js"

/**
 * The transparency card: a figure standing in a real place.
 *
 * A cut-out is laid over the live camera, moved and turned until it sits where
 * it should, and taken away either flattened as a PNG or — the reason this
 * exists — as a PSD where the photograph and the figure are still two separate
 * layers, so the placement can be argued with afterwards.
 *
 * Entirely local. The camera frame never leaves the device: no upload, no
 * server round trip, nothing for the archive to store or pay for. The only
 * thing fetched is the cut-out itself, and that is an image the archive already
 * has.
 */

const GRAB = 2048

export default function cardView(root) {
  const cam = createCamera()
  const stage = h("div", { class: "card__stage" })
  const overlay = h("canvas", { class: "card__overlay" })
  const shelf = h("div", { class: "card__shelf" })

  // Where the figure stands, in fractions of the frame so it survives a resize.
  const put = { x: 0.5, y: 0.62, scale: 0.55, rot: 0, flip: false, alpha: 1 }
  let cut = null           // the cut-out image
  let cutName = "figure"
  let frozen = null        // a grabbed frame, once the shutter is pressed
  let alive = true
  let raf = 0

  if (!supported) {
    root.append(h("div", { class: "wrap soon" },
      h("h2", {}, "这台设备用不了"),
      h("p", {}, "电子透卡需要摄像头。")))
    return {}
  }

  cam.video.className = "card__view"

  // ---- drawing ----

  function paint() {
    raf = 0
    const box = stage.getBoundingClientRect()
    const w = Math.max(2, Math.round(box.width)), hh = Math.max(2, Math.round(box.height))
    if (overlay.width !== w || overlay.height !== hh) { overlay.width = w; overlay.height = hh }
    const g = overlay.getContext("2d")
    g.clearRect(0, 0, w, hh)
    if (cut) drawFigure(g, w, hh)
  }

  /** The same placement maths for the screen and for the export. */
  function drawFigure(g, w, hh) {
    const k = (hh * put.scale) / cut.naturalHeight
    const dw = cut.naturalWidth * k, dh = cut.naturalHeight * k
    g.save()
    g.globalAlpha = put.alpha
    g.translate(put.x * w, put.y * hh)
    g.rotate(put.rot)
    g.scale(put.flip ? -1 : 1, 1)
    g.drawImage(cut, -dw / 2, -dh / 2, dw, dh)
    g.restore()
  }

  const nudge = () => { if (!raf) raf = requestAnimationFrame(paint) }

  // ---- moving the figure ----

  let drag = null
  const pointers = new Map()
  overlay.addEventListener("pointerdown", (e) => {
    overlay.setPointerCapture(e.pointerId)
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.size === 1) {
      const b = stage.getBoundingClientRect()
      drag = { ox: put.x - (e.clientX - b.left) / b.width, oy: put.y - (e.clientY - b.top) / b.height }
    } else if (pointers.size === 2) {
      drag = null
      const [a, c] = [...pointers.values()]
      pinch = { d: Math.hypot(a.x - c.x, a.y - c.y), a: Math.atan2(c.y - a.y, c.x - a.x), s: put.scale, r: put.rot }
    }
  })
  let pinch = null
  overlay.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const b = stage.getBoundingClientRect()
    if (pointers.size === 1 && drag) {
      put.x = clamp(drag.ox + (e.clientX - b.left) / b.width, -0.2, 1.2)
      put.y = clamp(drag.oy + (e.clientY - b.top) / b.height, -0.2, 1.2)
      nudge()
    } else if (pointers.size === 2 && pinch) {
      const [a, c] = [...pointers.values()]
      const d = Math.hypot(a.x - c.x, a.y - c.y)
      put.scale = clamp(pinch.s * (d / Math.max(1, pinch.d)), 0.05, 3)
      put.rot = pinch.r + (Math.atan2(c.y - a.y, c.x - a.x) - pinch.a)
      sync()
      nudge()
    }
  })
  const release = (e) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null; if (!pointers.size) drag = null }
  ;["pointerup", "pointercancel", "pointerleave"].forEach((k) => overlay.addEventListener(k, release))
  overlay.addEventListener("wheel", (e) => {
    e.preventDefault()
    put.scale = clamp(put.scale * (e.deltaY < 0 ? 1.06 : 0.94), 0.05, 3)
    sync(); nudge()
  }, { passive: false })

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

  // ---- controls ----

  const knob = (label, en, min, max, step, get, set) => {
    const r = h("input", { class: "wb__range", type: "range", min, max, step, value: get() })
    r.addEventListener("input", () => { set(parseFloat(r.value)); nudge() })
    return { el: h("label", { class: "wb__knob" }, h("span", { class: "wb__knobName mono" }, label, h("i", {}, en)), r), r }
  }
  const kScale = knob("大小", "SCALE", 0.05, 3, 0.01, () => put.scale, (v) => (put.scale = v))
  const kRot = knob("旋转", "ROTATE", -3.14, 3.14, 0.01, () => put.rot, (v) => (put.rot = v))
  const kAlpha = knob("不透明", "OPACITY", 0.1, 1, 0.01, () => put.alpha, (v) => (put.alpha = v))
  function sync() { kScale.r.value = put.scale; kRot.r.value = put.rot }

  // ---- the cut-out ----

  const pick = h("input", { type: "file", accept: "image/png,image/webp,image/*", style: "display:none" })
  pick.addEventListener("change", () => {
    if (pick.files && pick.files[0]) useCut(URL.createObjectURL(pick.files[0]), pick.files[0].name.replace(/\.[^.]+$/, ""))
    pick.value = ""
  })

  async function useCut(src, name) {
    try {
      const img = await new Promise((ok, no) => {
        const i = new Image(); i.crossOrigin = "anonymous"
        i.onload = () => ok(i); i.onerror = () => no(new Error("这张图读不出来"))
        i.src = src
      })
      cut = img; cutName = name || "figure"
      nudge()
    } catch (e) { toast(e.message, "bad") }
  }

  async function loadShelf() {
    clear(shelf)
    shelf.append(h("button", { class: "card__pick card__pick--file", type: "button", onClick: () => pick.click() },
      h("span", { class: "card__pickMark" }, "＋"), bi("本机图片", "LOCAL PNG")))
    try {
      const r = await api.get("/api/characters")
      const withArt = (r.characters || []).filter((c) => c.coverUrl).slice(0, 24)
      withArt.forEach((c) => {
        const b = h("button", { class: "card__pick", type: "button", title: c.name,
          onClick: () => useCut(c.coverUrl, c.name) },
          h("img", { src: c.coverUrl, alt: "", loading: "lazy" }),
          h("span", { class: "card__pickName mono" }, c.name))
        shelf.append(b)
      })
      if (!withArt.length) shelf.append(h("div", { class: "roll__none mono" }, "档案里还没有带立绘的角色"))
    } catch (e) {
      shelf.append(h("div", { class: "roll__none mono" }, "读不到角色名录：" + (e.message || "")))
    }
  }

  // ---- taking it away ----

  /** Render photo, figure and composite at the sensor's size, not the screen's. */
  function compose() {
    const frame = frozen || cam.grab(GRAB)
    if (!frame) return null
    const { canvas: photo, w, h: hh } = frame

    const fig = document.createElement("canvas")
    fig.width = w; fig.height = hh
    if (cut) drawFigure(fig.getContext("2d"), w, hh)

    const flat = document.createElement("canvas")
    flat.width = w; flat.height = hh
    const g = flat.getContext("2d")
    g.drawImage(photo, 0, 0)
    g.drawImage(fig, 0, 0)
    return { photo, fig, flat, w, h: hh }
  }

  function download(blob, ext) {
    const a = h("a", { href: URL.createObjectURL(blob), download: `透卡-${stamp()}.${ext}` })
    document.body.append(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 4000)
  }

  async function savePNG() {
    const c = compose()
    if (!c) { toast("先打开镜头", "bad"); return }
    c.flat.toBlob((b) => { if (b) { download(b, "png"); toast(`已导出 ${(b.size / 1048576).toFixed(1)} MB`, "ok") } }, "image/png")
  }

  function savePSD() {
    const c = compose()
    if (!c) { toast("先打开镜头", "bad"); return }
    toast("正在写 PSD…", "info")
    // Yielded to the next frame so the toast paints before the encode blocks.
    setTimeout(() => {
      try {
        const blob = writePSD({
          width: c.w, height: c.h,
          layers: [
            { name: "底图 PHOTO", rgba: pixelsOf(c.photo) },
            { name: cutName + " FIGURE", rgba: pixelsOf(c.fig) }
          ],
          composite: pixelsOf(c.flat)
        })
        download(blob, "psd")
        toast(`已导出 ${(blob.size / 1048576).toFixed(1)} MB，两个图层`, "ok")
      } catch (e) { toast("PSD 写入失败：" + (e.message || ""), "bad") }
    }, 60)
  }

  // ---- chrome ----

  const openCam = h("button", { class: "btn btn--red", type: "button", onClick: async () => {
    try { await cam.start(); stage.setAttribute("data-live", "1"); nudge() }
    catch (e) { toast("打不开摄像头：" + (e.message || "权限被拒绝"), "bad") }
  } }, "打开镜头")

  const freeze = h("button", { class: "btn btn--sm", type: "button", onClick: () => {
    if (frozen) { frozen = null; freeze.textContent = "定格"; stage.removeAttribute("data-frozen"); return }
    frozen = cam.grab(GRAB)
    if (!frozen) { toast("先打开镜头", "bad"); return }
    freeze.textContent = "解除定格"
    stage.setAttribute("data-frozen", "1")
    const shot = h("img", { class: "card__frozen", src: frozen.canvas.toDataURL("image/webp", 0.9), alt: "" })
    stage.querySelector(".card__frozen")?.remove()
    stage.insertBefore(shot, overlay)
  } }, "定格")

  stage.append(cam.video, overlay)

  const view = h("div", { class: "wrap card" },
    h("div", { class: "section__head" },
      h("div", {},
        h("span", { class: "kicker" }, "Card / 透卡"),
        h("h1", { class: "h-section", style: "margin-top:12px" }, "电子透卡")),
      openCam),
    h("div", { class: "card__grid" },
      h("div", {}, stage,
        h("div", { class: "roll__bar" },
          freeze,
          h("button", { class: "btn btn--sm", type: "button", onClick: () => { put.flip = !put.flip; nudge() } }, "镜像"),
          h("button", { class: "btn btn--sm btn--ghost", type: "button", onClick: async () => {
            try { await cam.flip(); nudge() } catch { toast("切换失败", "bad") }
          } }, "切镜头"),
          h("button", { class: "btn btn--red btn--sm", type: "button", onClick: savePNG }, "导出 PNG"),
          h("button", { class: "btn btn--red btn--sm", type: "button", onClick: savePSD }, "导出 PSD"))),
      h("div", { class: "card__side" },
        h("div", { class: "wb__shelfHead mono" }, "人物 / FIGURE"),
        shelf,
        h("div", { class: "wb__shelfHead mono" }, "摆位 / PLACEMENT"),
        h("div", { class: "wb__knobs" }, kScale.el, kRot.el, kAlpha.el))),
    pick)

  root.append(view)
  loadShelf()
  const onResize = () => nudge()
  addEventListener("resize", onResize)

  return {
    destroy() {
      alive = false
      if (raf) cancelAnimationFrame(raf)
      removeEventListener("resize", onResize)
      cam.stop()
    }
  }
}

function stamp() {
  const d = new Date(); const p = (n) => String(n).padStart(2, "0")
  return `${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}
