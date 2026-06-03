import { h } from "../lib/dom.js"
import { gsap, tame } from "../lib/anim.js"

let host = null

export function mountToasts() {
  if (host) return
  host = h("div", { class: "toasts" })
  document.body.append(host)
}

export function toast(message, kind = "info") {
  mountToasts()
  const cls = kind === "ok" ? "toast toast--ok" : kind === "bad" ? "toast toast--bad" : "toast"
  const node = h("div", { class: cls }, message)
  host.append(node)
  if (!tame) gsap.from(node, { x: 40, autoAlpha: 0, duration: 0.4, ease: "back.out(1.7)" })
  const life = kind === "bad" ? 4600 : 3000
  setTimeout(() => {
    if (tame) { node.remove(); return }
    gsap.to(node, { x: 30, autoAlpha: 0, duration: 0.3, ease: "power2.in", onComplete: () => node.remove() })
  }, life)
  return node
}
