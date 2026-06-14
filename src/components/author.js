import { h } from "../lib/dom.js"
import { go } from "../router.js"
import { loadDirectory, userByHandle } from "../lib/directory.js"

export function authorLink(handle, opts = {}) {
  if (!handle) return h("span", { class: "muted mono" }, "@?")
  const showAvatar = opts.avatar !== false
  const el = h("span", { class: "authorlink", role: "link", tabindex: "0", title: "@" + handle })
  let av = null
  if (showAvatar) {
    av = h("span", { class: "authoravatar" }, String(handle).slice(0, 1).toUpperCase())
    el.append(av)
  }
  el.append(h("span", { class: "authorhandle" }, "@" + handle))

  const nav = (e) => { e.preventDefault(); e.stopPropagation(); go("/u/" + encodeURIComponent(handle)) }
  el.addEventListener("click", nav)
  el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") nav(e) })

  const fill = () => {
    if (!av) return
    const u = userByHandle(handle)
    if (u && u.avatarUrl) { av.style.backgroundImage = "url(" + u.avatarUrl + ")"; av.classList.add("has") }
  }
  fill()
  if (av && !av.classList.contains("has")) loadDirectory().then(fill).catch(() => {})
  return el
}

export function avatarBlock(handle, avatarUrl, size) {
  const el = h("span", { class: "authoravatar authoravatar--lg" }, String(handle || "?").slice(0, 1).toUpperCase())
  if (size) { el.style.width = size + "px"; el.style.height = size + "px" }
  if (avatarUrl) { el.style.backgroundImage = "url(" + avatarUrl + ")"; el.classList.add("has") }
  return el
}
