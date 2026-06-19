import { h, clear } from "../lib/dom.js"
import { api } from "../lib/api.js"
import { toast } from "./toast.js"
import { fmtAgo } from "../lib/fmt.js"

export function pinLayer({ projectId, versionId, assetId }) {
  let pins = []
  let adding = false

  const dots = h("div", { class: "pinlayer__dots" })
  const pop = h("div", { class: "pinlayer__pop" })
  const countChip = h("span", { class: "pinbar__n mono tiny" }, "0")
  const toggle = h("button", { class: "pinbar__btn", type: "button", title: "在画面上添加批注" }, "＋ 批注")
  const bar = h("div", { class: "pinbar" }, toggle, countChip)
  const el = h("div", { class: "pinlayer" }, dots, pop, bar)

  toggle.addEventListener("click", () => setAdd(!adding))
  el.addEventListener("click", (e) => {
    if (!adding || e.target.closest(".pin, .pinpop, .pinbar")) return
    const r = el.getBoundingClientRect()
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
    openComposer(x, y)
  })

  const idxOf = (id) => pins.findIndex((x) => x.id === id)
  const find = (id) => pins.find((x) => x.id === id)
  function swap(np) { const i = idxOf(np.id); if (i >= 0) pins[i] = np }

  function setAdd(on) {
    adding = on
    el.classList.toggle("adding", on)
    toggle.classList.toggle("on", on)
    toggle.textContent = on ? "取消" : "＋ 批注"
    if (!on) closePop()
  }

  function closePop() { clear(pop); pop.classList.remove("show") }

  function place(node, x, y) {
    node.style.left = x * 100 + "%"
    node.style.top = y * 100 + "%"
    node.classList.toggle("flipx", x > 0.56)
    node.classList.toggle("flipy", y > 0.6)
  }

  function openComposer(x, y) {
    closePop()
    const ta = h("textarea", { class: "pinpop__ta", rows: "3", placeholder: "写下对这个位置的批注…" })
    const card = h("div", { class: "pinpop pinpop--new" },
      h("span", { class: "pinpop__beak" }),
      ta,
      h("div", { class: "pinpop__row" },
        h("button", { class: "btn btn--sm btn--ghost", type: "button", onClick: closePop }, "取消"),
        h("button", { class: "btn btn--sm btn--red", type: "button", onClick: () => submitNew(x, y, ta.value) }, "钉上")
      )
    )
    place(card, x, y)
    pop.append(card); pop.classList.add("show")
    setTimeout(() => ta.focus(), 20)
  }

  async function submitNew(x, y, text) {
    const body = (text || "").trim()
    if (!body) { toast("批注不能为空", "bad"); return }
    try {
      const r = await api.post("/api/projects/" + projectId + "/pins", { vid: versionId, aid: assetId, x, y, body })
      pins.push(r.pin)
      setAdd(false); closePop(); render()
      toast("已钉上批注", "ok")
    } catch (err) { toast(err.message || "提交失败", "bad") }
  }

  function openThread(p) {
    closePop()
    const thread = h("div", { class: "pinpop__thread" })
    ;(p.replies || []).forEach((r) => thread.append(
      h("div", { class: "pinrep" },
        h("div", { class: "pinrep__top mono tiny" }, h("b", {}, r.authorName || r.author), h("span", { class: "muted dotsep" }, fmtAgo(r.createdAt))),
        h("div", { class: "pinrep__body" }, r.body))
    ))
    const reply = h("textarea", { class: "pinpop__ta", rows: "2", placeholder: "回复批注…" })
    const card = h("div", { class: "pinpop pinpop--view" + (p.done ? " is-done" : "") },
      h("span", { class: "pinpop__beak" }),
      h("div", { class: "pinpop__head" },
        h("b", {}, "#" + (idxOf(p.id) + 1) + " " + (p.authorName || p.author)),
        h("span", { class: "mono tiny muted" }, fmtAgo(p.createdAt)),
        p.done ? h("span", { class: "pinpop__tag mono tiny" }, "已解决") : null
      ),
      h("div", { class: "pinpop__body" }, p.body),
      thread,
      h("div", { class: "pinpop__reply" }, reply, h("button", { class: "btn btn--sm", type: "button", onClick: () => submitReply(p, reply.value) }, "回复")),
      h("div", { class: "pinpop__acts" },
        p.canModerate ? h("button", { class: "btn btn--sm btn--ghost", type: "button", onClick: () => toggleDone(p) }, p.done ? "重新打开" : "标记解决") : null,
        p.canModerate ? h("button", { class: "btn btn--sm btn--danger", type: "button", onClick: () => removePin(p) }, "删除") : null,
        h("button", { class: "btn btn--sm btn--ghost", style: "margin-left:auto", type: "button", onClick: closePop }, "关闭")
      )
    )
    place(card, p.x, p.y)
    pop.append(card); pop.classList.add("show")
  }

  async function submitReply(p, text) {
    const body = (text || "").trim()
    if (!body) return
    try { const r = await api.post("/api/projects/" + projectId + "/pins/" + p.id, { body }); swap(r.pin); render(); openThread(find(p.id)) }
    catch (err) { toast(err.message || "回复失败", "bad") }
  }
  async function toggleDone(p) {
    try { const r = await api.patch("/api/projects/" + projectId + "/pins/" + p.id, { done: !p.done }); swap(r.pin); render(); openThread(find(p.id)) }
    catch (err) { toast(err.message || "操作失败", "bad") }
  }
  async function removePin(p) {
    if (!confirm("删除这条批注？")) return
    try { await api.del("/api/projects/" + projectId + "/pins/" + p.id); pins = pins.filter((x) => x.id !== p.id); closePop(); render(); toast("已删除", "info") }
    catch (err) { toast(err.message || "删除失败", "bad") }
  }

  function render() {
    clear(dots)
    countChip.textContent = String(pins.length)
    pins.forEach((p, i) => {
      const dot = h("button", { class: "pin" + (p.done ? " pin--done" : "") + ((p.replies || []).length ? " pin--talk" : ""), type: "button", title: p.body.slice(0, 48) },
        h("span", { class: "pin__n" }, p.done ? "✓" : String(i + 1)))
      dot.style.left = p.x * 100 + "%"
      dot.style.top = p.y * 100 + "%"
      dot.addEventListener("click", (e) => { e.stopPropagation(); if (adding) setAdd(false); openThread(p) })
      dots.append(dot)
    })
  }

  async function load() {
    try {
      const r = await api.get("/api/projects/" + projectId + "/pins?vid=" + encodeURIComponent(versionId) + "&aid=" + encodeURIComponent(assetId))
      pins = r.pins || []
      render()
    } catch (e) { /* silent: pins are non-critical */ }
  }

  load()
  return { el, destroy: closePop }
}
