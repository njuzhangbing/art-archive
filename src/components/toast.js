import { h } from "../lib/dom.js"

/**
 * Toasts animate with CSS rather than the animation library.
 *
 * This module is reachable from the entry bundle, so importing the library here
 * pulled the whole engine into the first script the browser has to parse — for
 * a slide in and a fade out that two keyframes cover.
 */

const tame = matchMedia("(prefers-reduced-motion: reduce)").matches

let host = null

export function mountToasts() {
  if (host) return
  host = h("div", { class: "toasts" })
  document.body.append(host)
}

export function toast(message, kind = "info") {
  mountToasts()
  const cls = kind === "ok" ? "toast toast--ok" : kind === "bad" ? "toast toast--bad" : "toast"
  const node = h("div", { class: cls + (tame ? "" : " toast--in") }, message)
  host.append(node)

  const life = kind === "bad" ? 4600 : 3000
  setTimeout(() => {
    if (tame) { node.remove(); return }
    node.classList.remove("toast--in")
    node.classList.add("toast--out")
    node.addEventListener("animationend", () => node.remove(), { once: true })
    // A dropped animationend event would otherwise leave the toast on screen.
    setTimeout(() => node.remove(), 500)
  }, life)

  return node
}
