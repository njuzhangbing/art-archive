export function initCursor() {
  if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) return

  const dot = document.createElement("div"); dot.className = "cur cur--dot"
  const ring = document.createElement("div"); ring.className = "cur cur--ring"
  document.body.append(dot, ring)
  document.documentElement.classList.add("has-cursor")

  let tx = window.innerWidth / 2, ty = window.innerHeight / 2, rx = tx, ry = ty, on = false
  const setT = (el, x, y) => { el.style.translate = x + "px " + y + "px" }
  setT(dot, tx, ty); setT(ring, rx, ry)

  const wake = (e) => {
    tx = e.clientX; ty = e.clientY; setT(dot, tx, ty)
    if (!on) { on = true; document.body.classList.add("cur-on") }
  }
  const sleep = () => { on = false; document.body.classList.remove("cur-on", "cur-hot", "cur-down") }
  window.addEventListener("mousemove", wake, { passive: true })
  document.addEventListener("mouseenter", wake)
  document.addEventListener("mouseleave", sleep)
  window.addEventListener("blur", sleep)
  document.addEventListener("mousedown", () => document.body.classList.add("cur-down"))
  document.addEventListener("mouseup", () => document.body.classList.remove("cur-down"))

  const HOT = "a,button,input,textarea,select,label,summary,code,[role=button],[data-link],.gtab,.chitem,.invcode,.cpchip,.msgpreset"
  document.addEventListener("pointerover", (e) => { if (e.target.closest && e.target.closest(HOT)) document.body.classList.add("cur-hot") })
  document.addEventListener("pointerout", (e) => {
    const to = e.relatedTarget
    if (!to || !(to.closest && to.closest(HOT))) document.body.classList.remove("cur-hot")
  })

  const loop = () => {
    rx += (tx - rx) * 0.2; ry += (ty - ry) * 0.2
    setT(ring, rx, ry)
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
}
