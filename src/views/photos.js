import { h, clear } from "../lib/dom.js"
import { api } from "../lib/api.js"
import { asset } from "../lib/net.js"
import { toast } from "../components/toast.js"
import { fmtAgo } from "../lib/fmt.js"

/**
 * What the roll actually got to the server.
 *
 * The roll shows the device's queue — what is still owed. This shows the other
 * end: the photographs that are safely away, which is the only place to check
 * before clearing the queue off a phone. A roll is private to whoever shot it,
 * and so is this.
 *
 * The list is one small request; the pictures come from /media, which the edge
 * serves immutable and the app keeps on disk, so opening this a second time
 * costs a few hundred bytes.
 */

export default function photos(root) {
  const grid = h("div", { class: "roll__grid" })
  const tally = h("div", { class: "roll__tally mono" })
  let rows = []
  let dead = false

  async function load() {
    try {
      const r = await api.get("/api/photos")
      if (dead) return
      rows = r.photos || []
      draw()
    } catch (e) {
      if (dead) return
      clear(grid)
      grid.append(h("div", { class: "roll__none mono" }, e.message || "读不到相册"))
    }
  }

  function draw() {
    clear(grid)
    const bytes = rows.reduce((n, r) => n + (r.bytes || 0), 0)
    tally.textContent = rows.length
      ? `${rows.length} 张  ${(bytes / 1048576).toFixed(1)} MB`
      : ""
    if (!rows.length) {
      grid.append(h("div", { class: "roll__none mono" }, "还没有上传的照片"))
      return
    }
    rows.forEach((p) => grid.append(cell(p)))
  }

  function cell(p) {
    const src = asset("/media/" + p.key)
    return h("div", { class: "roll__cell" },
      h("a", { href: src, target: "_blank", rel: "noopener noreferrer" },
        h("img", { class: "roll__thumb", src, alt: "", loading: "lazy", decoding: "async" })),
      h("span", { class: "roll__badge mono" }, fmtAgo(p.shotAt || p.createdAt)),
      h("button", { class: "roll__drop", type: "button", title: "删除", onClick: () => drop(p) }, "×"))
  }

  async function drop(p) {
    if (!confirm("删除这张照片？服务器上的文件也会一并删除。")) return
    try {
      await api.del("/api/photos/" + p.id)
      rows = rows.filter((r) => r.id !== p.id)
      draw()
      toast("已删除", "info")
    } catch (e) { toast(e.message || "删除失败", "bad") }
  }

  const view = h("div", { class: "wrap roll" },
    h("div", { class: "section__head" },
      h("div", {},
        h("span", { class: "kicker" }, "Photos / 相册"),
        h("h1", { class: "h-section", style: "margin-top:12px" }, "相册")),
      h("a", { class: "btn btn--sm", href: "/roll", "data-link": "1" }, "去拍照")),
    h("div", { class: "roll__bar" }, tally),
    grid)

  root.append(view)
  load()

  return { destroy() { dead = true } }
}
