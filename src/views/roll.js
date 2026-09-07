import { h, bi, clear } from "../lib/dom.js"
import { api } from "../lib/api.js"
import { toast } from "../components/toast.js"
import { createCamera, encode, supported } from "../lib/camera.js"
import { putBlob } from "../lib/upload.js"
import * as roll from "../lib/roll-store.js"

/**
 * The photo roll: shoot now, send later.
 *
 * Photographing a hundred things and uploading a hundred things are separate
 * problems, and the second one is not allowed to hold up the first. A shot is
 * compressed the moment it is taken and put on a shelf in the device's own
 * storage; from there one uploader walks the queue, one file at a time, and
 * stops the instant the connection or the reader says so.
 *
 * One at a time on purpose. Six parallel uploads finish a queue slightly sooner
 * and make a phone's radio, a shared connection and a metered plan all worse;
 * a roll is not in a hurry.
 */

const MAX_EDGE = 2048
const QUALITY = 0.82
/** Between files, so a long queue never becomes a wall of requests. */
const BREATH_MS = 700

export default function rollView(root) {
  const cam = createCamera()
  const list = h("div", { class: "roll__grid" })
  const tallyLine = h("div", { class: "roll__tally mono" })
  const stageBox = h("div", { class: "roll__stage" })

  let sending = false
  let stop = false
  let alive = true

  if (!supported || !roll.ready()) {
    root.append(h("div", { class: "wrap soon" },
      h("h2", {}, "这台设备用不了"),
      h("p", {}, "照片带需要摄像头权限和本地数据库支持。")))
    return {}
  }

  // ---- the camera ----

  cam.video.className = "roll__view"
  const shutter = h("button", { class: "roll__shutter", type: "button", "aria-label": "拍摄" })
  const flip = h("button", { class: "roll__flip", type: "button", title: "切换镜头" }, "⟲")
  const hint = h("div", { class: "roll__hint mono" }, "点开镜头开始")

  const openCam = h("button", { class: "btn btn--red", type: "button", onClick: async () => {
    try {
      const r = await cam.start()
      stageBox.setAttribute("data-live", "1")
      hint.textContent = `${r.w}×${r.h}  ${r.facing === "user" ? "前置" : "后置"}`
    } catch (e) {
      toast("打不开摄像头：" + (e.message || "权限被拒绝"), "bad")
    }
  } }, "打开镜头")

  flip.addEventListener("click", async () => {
    try { const r = await cam.flip(); hint.textContent = `${r.w}×${r.h}  ${r.facing === "user" ? "前置" : "后置"}` }
    catch (e) { toast("切换失败", "bad") }
  })

  let shooting = false
  async function shoot() {
    if (shooting || !cam.live) return
    shooting = true
    try {
      const frame = cam.grab(MAX_EDGE)
      if (!frame) return
      const { blob, mime } = await encode(frame.canvas, QUALITY)
      await roll.add(blob, { mime, w: frame.w, h: frame.h })
      stageBox.setAttribute("data-flash", "1")
      setTimeout(() => stageBox.removeAttribute("data-flash"), 140)
      await refresh()
    } catch (e) {
      toast(e.message || "拍摄失败", "bad")
    } finally { shooting = false }
  }
  shutter.addEventListener("click", shoot)
  // Hold the shutter for a burst, at a pace the encoder can keep up with.
  let burst = null
  shutter.addEventListener("pointerdown", () => { burst = setInterval(shoot, 550) })
  ;["pointerup", "pointerleave", "pointercancel"].forEach((e) =>
    shutter.addEventListener(e, () => { if (burst) { clearInterval(burst); burst = null } }))

  stageBox.append(cam.video, hint, h("div", { class: "roll__controls" }, flip, shutter))

  // ---- the queue ----

  async function refresh() {
    if (!alive) return
    const [rows, t] = await Promise.all([roll.all(), roll.tally()])
    tallyLine.textContent =
      `${t.total} 张  待传 ${t.waiting + t.failed}  已传 ${t.done}  本机占用 ${mb(t.bytes)}  待发 ${mb(t.owed)}`
    clear(list)
    if (!rows.length) {
      list.append(h("div", { class: "roll__none mono" }, "还没有照片"))
      return
    }
    rows.slice(0, 120).forEach((r) => list.append(tile(r)))
    if (rows.length > 120) {
      list.append(h("div", { class: "roll__none mono" }, `另有 ${rows.length - 120} 张未显示`))
    }
  }

  function tile(r) {
    const img = h("img", { class: "roll__thumb", alt: "", loading: "lazy" })
    // Object URLs are revoked as soon as the picture is decoded; a hundred live
    // ones would pin a hundred blobs in memory.
    const url = URL.createObjectURL(r.blob)
    img.src = url
    img.addEventListener("load", () => URL.revokeObjectURL(url), { once: true })
    return h("div", { class: "roll__cell", "data-state": r.state },
      img,
      h("span", { class: "roll__badge mono" },
        r.state === roll.DONE ? "已传" : r.state === roll.SENDING ? "上传中"
          : r.state === roll.FAILED ? "失败" : "待传"),
      h("button", { class: "roll__drop", type: "button", title: "删除", onClick: async () => {
        if (r.state === roll.SENDING) { toast("正在上传，稍后再删", "info"); return }
        await roll.remove(r.id); refresh()
      } }, "×"))
  }

  // ---- the uploader ----

  async function drain() {
    if (sending) return
    sending = true
    stop = false
    setSendUI()
    try {
      for (;;) {
        if (stop || !alive) break
        if (!navigator.onLine) { toast("离线，已暂停", "info"); break }
        const next = await roll.nextPending()
        if (!next) break
        await roll.patch(next.id, { state: roll.SENDING })
        await refresh()
        try {
          const key = await putBlob(next.blob, next.mime)
          await api.post("/api/photos", {
            key, w: next.w, h: next.h, bytes: next.bytes, shotAt: next.shotAt
          })
          await roll.patch(next.id, { state: roll.DONE, key, err: null })
        } catch (e) {
          await roll.patch(next.id, {
            state: roll.FAILED, tries: (next.tries || 0) + 1, err: (e.message || "失败").slice(0, 80)
          })
          // Three failures on one file means the file, not the line; leave it
          // for the reader to look at rather than spinning on it.
          if ((next.tries || 0) + 1 >= 3) { toast("有照片连续失败，已跳过", "bad"); }
        }
        await refresh()
        await new Promise((d) => setTimeout(d, BREATH_MS))
      }
    } finally {
      sending = false
      setSendUI()
      await refresh()
    }
  }

  const sendBtn = h("button", { class: "btn btn--red", type: "button", onClick: () => {
    if (sending) { stop = true; toast("将在当前这张之后停下", "info") } else drain()
  } }, "开始上传")
  function setSendUI() { sendBtn.textContent = sending ? "暂停上传" : "开始上传" }

  const sweep = h("button", { class: "btn btn--sm btn--ghost", type: "button", onClick: async () => {
    const n = await roll.sweepDone()
    toast(n ? `已清理 ${n} 张` : "没有可清理的", n ? "ok" : "info")
    refresh()
  } }, "清理已传")

  // The queue keeps itself honest when the connection comes back.
  const onOnline = () => { if (!sending) drain() }
  addEventListener("online", onOnline)

  const view = h("div", { class: "wrap roll" },
    h("div", { class: "section__head" },
      h("div", {},
        h("span", { class: "kicker" }, "Roll / 照片带"),
        h("h1", { class: "h-section", style: "margin-top:12px" }, "照片带")),
      h("div", { style: "display:flex;gap:8px;align-items:center" },
        h("a", { class: "btn btn--sm btn--ghost", href: "/photos", "data-link": "1" }, "相册"),
        openCam)),
    stageBox,
    h("div", { class: "roll__bar" }, sendBtn, sweep, tallyLine),
    list)

  root.append(view)
  refresh()

  return {
    destroy() {
      alive = false
      stop = true
      if (burst) clearInterval(burst)
      removeEventListener("online", onOnline)
      cam.stop()
    }
  }
}

const mb = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.round(n / 1024) + " KB")
