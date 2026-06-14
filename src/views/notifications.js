import { h, clear } from "../lib/dom.js"
import { api } from "../lib/api.js"
import { toast } from "../components/toast.js"
import { reveal, clearScroll } from "../lib/anim.js"
import { fmtAgo } from "../lib/fmt.js"

export default function notifications(root) {
  const listEl = h("div", { class: "notiflist" })
  const head = h("div", { class: "section__head" },
    h("div", {}, h("span", { class: "kicker" }, "Inbox / 通知"), h("h1", { class: "h-section", style: "margin-top:12px" }, "通知")),
    h("button", { class: "btn btn--sm", onClick: markAll }, "全部已读"))
  const view = h("div", { class: "wrap notifv" }, head, listEl)
  root.append(view)

  async function markAll() { try { await api.post("/api/notifications/read", {}); load() } catch (e) { toast(e.message || "失败", "bad") } }

  function row(n) {
    return h("a", { class: "notifrow" + (n.read ? "" : " unread"), href: n.link || "#", "data-link": n.link && n.link.startsWith("/") ? "1" : null },
      h("span", { class: "notifrow__dot" }),
      h("div", { class: "notifrow__b" },
        h("div", { class: "notifrow__t" }, n.text),
        h("div", { class: "notifrow__m mono tiny muted" }, fmtAgo(n.at))))
  }

  async function load() {
    try {
      const r = await api.get("/api/notifications")
      clear(listEl)
      if (!r.notifications.length) { listEl.append(h("div", { class: "empty" }, h("div", { class: "mono" }, "还没有通知"))); return }
      r.notifications.forEach((n) => listEl.append(row(n)))
      reveal([...listEl.children], { y: 16, stagger: 0.03 })
      if (r.unread) setTimeout(() => api.post("/api/notifications/read", {}).catch(() => {}), 1500)
    } catch (e) { clear(listEl); listEl.append(h("div", { class: "muted mono" }, "加载失败")) }
  }

  reveal([head], { y: 18 })
  load()
  return { destroy: clearScroll }
}
