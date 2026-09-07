import { h, clear } from "../lib/dom.js"
import { api } from "../lib/api.js"
import { authorLink } from "../components/author.js"
import { toast } from "../components/toast.js"
import { clearScroll } from "../lib/anim.js"
import { fmtAgo } from "../lib/fmt.js"

function escText(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])).replace(/\n/g, "<br>")
}

export default function dm(root, params) {
  const handle = params.handle || null
  let convs = []
  let poll = null
  let onWake = null
  const rail = h("aside", { class: "talk__rail" }, h("div", { class: "muted mono tiny" }, "加载…"))
  const main = h("section", { class: "talk__main" })
  const view = h("div", { class: "wrap talk" }, rail, main)
  root.append(view)
  const stopPoll = () => { if (poll) { clearTimeout(poll); poll = null } }

/**
 * How often to ask for new messages, by how long it has been quiet.
 *
 * A fixed 2.5s loop is a conversation's pace applied to an empty room: eleven
 * thousand requests a day from one open tab, which is nearly three times the
 * whole month's free allowance for one reader who forgot to close it. Live
 * while it is live, then let go.
 */
const CADENCE = [
  [60_000, 3_000],     // spoken in the last minute: keep up
  [10 * 60_000, 15_000],
  [60 * 60_000, 60_000]
]
const IDLE_MS = 180_000  // beyond an hour quiet, once every three minutes

  async function boot() {
    try { const r = await api.get("/api/dm"); convs = r.conversations || [] } catch (e) { convs = [] }
    renderRail()
    renderMain()
  }

  function renderRail() {
    clear(rail)
    rail.append(h("div", { class: "talk__railhead" }, h("span", { class: "kicker" }, "DM / 私信")))
    if (!convs.length) rail.append(h("div", { class: "muted mono tiny", style: "padding:10px 4px" }, "还没有私信。去某人主页点「私信」开始"))
    convs.forEach((c) => rail.append(
      h("a", { class: "chitem dmitem" + (c.handle === handle ? " on" : ""), href: "/dm/" + c.handle, "data-link": "1" },
        h("span", { class: "chitem__name" }, "@" + c.handle),
        c.lastText ? h("span", { class: "dmitem__last mono tiny muted" }, c.lastText) : null,
        (c.unread && c.handle !== handle) ? h("span", { class: "chitem__dot" }) : null)))
  }

  function renderMain() {
    stopPoll()
    clear(main)
    if (!handle) { main.append(h("div", { class: "talk__empty mono" }, "选择左侧对话，或去某人主页点「私信」")); return }
    renderChat(handle)
  }

  function renderChat(handle) {
    let cursor = ""
    const head = h("div", { class: "talk__head" }, h("div", { class: "talk__title serif" }, "私信"), h("div", { class: "talk__headacts" }))
    const log = h("div", { class: "chatlog" })
    const input = h("textarea", { class: "textarea chatinput", rows: "1", placeholder: "私信 @" + handle + "…（Enter 发送）" })
    const sendBtn = h("button", { class: "btn btn--red", onClick: send }, "发送")
    main.append(head, log, h("div", { class: "chatbar" }, input, sendBtn))

    const atBottom = () => log.scrollHeight - log.scrollTop - log.clientHeight < 60
    const scrollEnd = () => { log.scrollTop = log.scrollHeight }
    function addMsgs(msgs, jump) { const stick = atBottom(); msgs.forEach((m) => log.append(msgRow(m))); if (jump || stick) scrollEnd() }
    function msgRow(m) {
      return h("div", { class: "chatmsg" + (m.mine ? " chatmsg--mine" : "") },
        authorLink(m.author),
        h("div", { class: "chatmsg__b" },
          h("div", { class: "chatmsg__top mono tiny" }, h("span", { class: "muted" }, fmtAgo(m.createdAt))),
          h("div", { class: "chatmsg__body", html: escText(m.body) })))
    }
    async function load() {
      try {
        const r = await api.get("/api/dm/" + encodeURIComponent(handle))
        cursor = r.cursor || ""
        clear(head)
        head.append(h("div", { class: "talk__title serif" }, "@" + r.other.handle), h("div", { class: "talk__headacts" }, h("a", { class: "btn btn--sm", href: "/u/" + r.other.handle, "data-link": "1" }, "看主页")))
        clear(log)
        if (!r.messages.length) log.append(h("div", { class: "muted mono tiny", style: "padding:16px" }, "还没有消息，打个招呼吧"))
        else addMsgs(r.messages, true)
      } catch (e) { clear(log); log.append(h("div", { class: "muted mono tiny", style: "padding:16px" }, e.message || "加载失败")) }
    }
    let lastWord = Date.now()

    function nextIn() {
      const quiet = Date.now() - lastWord
      for (const [under, wait] of CADENCE) if (quiet < under) return wait
      return IDLE_MS
    }

    /** Ask once, then schedule the next ask from how live the room is. */
    async function tick() {
      poll = null
      // A hidden tab is not a conversation. The visibility handler restarts it.
      if (document.hidden) return
      try {
        const r = await api.get("/api/dm/" + encodeURIComponent(handle) + "?since=" + encodeURIComponent(cursor))
        if (r.messages.length) { cursor = r.cursor || cursor; addMsgs(r.messages); lastWord = Date.now() }
      } catch (e) { /* keep the loop alive; the next tick tries again */ }
      poll = setTimeout(tick, nextIn())
    }
    async function send() {
      const body = input.value.trim()
      if (!body) return
      input.value = ""; input.style.height = "auto"
      try { const r = await api.post("/api/dm/" + encodeURIComponent(handle), { body }); cursor = r.cursor || cursor; addMsgs([r.message], true) }
      catch (e) { toast(e.message || "发送失败", "bad"); input.value = body }
    }
    input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send() } })
    input.addEventListener("input", () => { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 120) + "px" })

    load()
    // Sending is speaking: it makes the room live again.
    input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) lastWord = Date.now() })
    poll = setTimeout(tick, nextIn())
    onWake = () => { if (!document.hidden && !poll) { lastWord = Date.now(); tick() } }
    document.addEventListener("visibilitychange", onWake)
  }

  boot()
  return { destroy: () => {
    stopPoll()
    if (onWake) document.removeEventListener("visibilitychange", onWake)
    clearScroll()
  } }
}
