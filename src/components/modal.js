import { h } from "../lib/dom.js"
import { gsap, tame } from "../lib/anim.js"

export function openModal(title, content, opts = {}) {
  const x = h("button", { class: "modal__x", type: "button", "aria-label": "关闭" }, "✕")
  const card = h("div", { class: "modal__card" },
    h("div", { class: "modal__head" }, h("span", { class: "kicker" }, title), x),
    h("div", { class: "modal__body" }, content)
  )
  const back = h("div", { class: "modal" }, card)
  document.body.append(back)
  const prevOverflow = document.body.style.overflow
  document.body.style.overflow = "hidden"

  let dead = false
  const close = () => {
    if (dead) return
    dead = true
    removeEventListener("keydown", onKey)
    document.body.style.overflow = prevOverflow
    if (tame) { back.remove(); opts.onClose && opts.onClose(); return }
    gsap.to(card, { y: 22, autoAlpha: 0, duration: 0.22, ease: "power2.in" })
    gsap.to(back, { autoAlpha: 0, duration: 0.28, onComplete: () => { back.remove(); opts.onClose && opts.onClose() } })
  }
  const onKey = (e) => { if (e.key === "Escape") close() }

  x.addEventListener("click", close)
  back.addEventListener("click", (e) => { if (e.target === back) close() })
  addEventListener("keydown", onKey)

  if (!tame) {
    gsap.from(back, { autoAlpha: 0, duration: 0.22 })
    gsap.from(card, { y: 42, autoAlpha: 0, duration: 0.42, ease: "expo.out" })
  }
  return { close, card }
}
