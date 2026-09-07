/**
 * The camera, and a frame out of it.
 *
 * Shared by the photo roll and the transparency card. Both want the same three
 * things — a live preview, a way to turn the lens around, and a still at the
 * sensor's own resolution rather than the preview's — and neither wants to know
 * about MediaStream lifecycles.
 *
 * A stream left running keeps the indicator light on and the battery draining,
 * so `stop()` is not optional housekeeping: every caller must run it, including
 * on the way out of a view.
 */

export const supported = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)

/** Sensor-side request. The browser gives what it can and we take what we get. */
const WANT = { width: { ideal: 2560 }, height: { ideal: 2560 } }

export function createCamera() {
  const video = document.createElement("video")
  video.playsInline = true
  video.muted = true
  video.setAttribute("playsinline", "")

  let stream = null
  let facing = "environment"

  async function start(which = facing) {
    stop()
    facing = which
    stream = await navigator.mediaDevices.getUserMedia({
      video: { ...WANT, facingMode: { ideal: facing } },
      audio: false
    })
    video.srcObject = stream
    await video.play().catch(() => {})
    // Chrome reports 0×0 until the first frame is decoded.
    if (!video.videoWidth) {
      await new Promise((done) => {
        const on = () => { video.removeEventListener("loadeddata", on); done() }
        video.addEventListener("loadeddata", on)
        setTimeout(done, 2500)
      })
    }
    return { w: video.videoWidth, h: video.videoHeight, facing }
  }

  function stop() {
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null }
    video.srcObject = null
  }

  async function flip() {
    return start(facing === "environment" ? "user" : "environment")
  }

  /**
   * Grab the current frame.
   * @param {number} [maxEdge] longest side of the result
   * @returns {{canvas: HTMLCanvasElement, w: number, h: number}}
   */
  function grab(maxEdge = 2048) {
    const vw = video.videoWidth, vh = video.videoHeight
    if (!vw || !vh) return null
    const k = Math.min(1, maxEdge / Math.max(vw, vh))
    const w = Math.round(vw * k), h = Math.round(vh * k)
    const c = document.createElement("canvas")
    c.width = w; c.height = h
    const g = c.getContext("2d")
    // A front camera shows you a mirror; a photograph from it should not be one.
    if (facing === "user") { g.translate(w, 0); g.scale(-1, 1) }
    g.drawImage(video, 0, 0, w, h)
    return { canvas: c, w, h }
  }

  return {
    video,
    start, stop, flip, grab,
    get facing() { return facing },
    get live() { return !!stream }
  }
}

/**
 * Encode a canvas as small as the format allows without visibly hurting it.
 *
 * WebP at 0.82 is roughly a fifth of the same picture as JPEG at the quality a
 * phone camera writes, which matters here more than usual: every byte saved is
 * a byte not carried over someone's mobile data and not paid for at the other
 * end.
 */
export function encode(canvas, quality = 0.82) {
  return new Promise((done) => {
    canvas.toBlob((b) => {
      if (b) return done({ blob: b, mime: "image/webp" })
      canvas.toBlob((j) => done({ blob: j, mime: "image/jpeg" }), "image/jpeg", quality)
    }, "image/webp", quality)
  })
}
