import { h, clear } from "../lib/dom.js"
import { api } from "../lib/api.js"
import { authorLink } from "../components/author.js"
import { openModal } from "../components/modal.js"
import { toast } from "../components/toast.js"
import { go } from "../router.js"
import { clearScroll } from "../lib/anim.js"
import { fmtAgo } from "../lib/fmt.js"

function escText(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])).replace(/\n/g, "<br>")
}

export default function talk(root, params) {
  const cid = params.cid || null
  const tid = params.tid || null
  let channels = []
  let poll = null

  const rail = h("aside", { class: "talk__rail" }, h("div", { class: "muted mono tiny" }, "加载频道…"))
  const main = h("section", { class: "talk__main" })
  const view = h("div", { class: "wrap talk" }, rail, main)
  root.append(view)

  const stopPoll = () => { if (poll) { clearInterval(poll); poll = null } }

  async function boot() {
    try { const r = await api.get("/api/channels"); channels = r.channels || [] } catch (e) { channels = [] }
    renderRail()
    renderMain()
  }

  function renderRail() {
    clear(rail)
    rail.append(h("div", { class: "talk__railhead" },
      h("span", { class: "kicker" }, "Channels / 频道"),
      h("button", { class: "btn btn--sm btn--red", onClick: newChannel }, "＋ 新建")))
    const group = (kind, label) => {
      const items = channels.filter((c) => c.kind === kind)
      if (!items.length) return
      rail.append(h("div", { class: "talk__group mono tiny" }, label))
      items.forEach((c) => rail.append(
        h("a", { class: "chitem" + (c.id === cid ? " on" : ""), href: "/talk/" + c.id, "data-link": "1" },
          h("span", { class: "chitem__sig mono" }, kind === "chat" ? "#" : "≡"),
          h("span", { class: "chitem__name" }, c.name),
          (c.unread && c.id !== cid) ? h("span", { class: "chitem__dot" }) : null)))
    }
    group("chat", "聊天")
    group("board", "帖子板")
    if (!channels.length) rail.append(h("div", { class: "muted mono tiny", style: "padding:10px 2px" }, "还没有频道，点＋新建"))
  }

  function currentChannel() { return channels.find((c) => c.id === cid) || null }

  function renderMain() {
    stopPoll()
    clear(main)
    const ch = currentChannel()
    if (!ch) { main.append(h("div", { class: "talk__empty mono" }, channels.length ? "← 选择一个频道" : "新建一个频道开始讨论")); return }
    if (ch.kind === "chat") renderChat(ch)
    else if (tid) renderThread(ch, tid)
    else renderBoard(ch)
  }

  function header(ch, extra) {
    return h("div", { class: "talk__head" },
      h("div", { class: "talk__headl" },
        h("div", { class: "talk__title serif" }, (ch.kind === "chat" ? "# " : "≡ ") + ch.name),
        ch.topic ? h("div", { class: "talk__topic mono tiny muted" }, ch.topic) : null),
      h("div", { class: "talk__headacts" }, extra || null,
        ch.canDelete ? h("button", { class: "btn btn--sm btn--danger", onClick: () => delChannel(ch) }, "删频道") : null))
  }

  function renderChat(ch) {
    let cursor = ""
    const log = h("div", { class: "chatlog" })
    const input = h("textarea", { class: "textarea chatinput", rows: "1", placeholder: "说点什么…（Enter 发送，Shift+Enter 换行）" })
    const sendBtn = h("button", { class: "btn btn--red", onClick: send }, "发送")
    main.append(header(ch), log, h("div", { class: "chatbar" }, input, sendBtn))

    const atBottom = () => log.scrollHeight - log.scrollTop - log.clientHeight < 60
    const scrollEnd = () => { log.scrollTop = log.scrollHeight }

    function addMsgs(msgs, jump) {
      const stick = atBottom()
      msgs.forEach((m) => log.append(msgRow(m)))
      if (jump || stick) scrollEnd()
    }
    function msgRow(m) {
      const del = m.canDelete ? h("button", { class: "chatmsg__x", title: "删除" }, "✕") : null
      const row = h("div", { class: "chatmsg" },
        authorLink(m.author),
        h("div", { class: "chatmsg__b" },
          h("div", { class: "chatmsg__top mono tiny" }, h("span", { class: "muted" }, fmtAgo(m.createdAt)), del),
          h("div", { class: "chatmsg__body", html: escText(m.body) })))
      if (del) del.addEventListener("click", async () => { try { await api.del("/api/channels/" + ch.id + "/messages/" + m.id); row.remove() } catch (e) { toast(e.message || "删除失败", "bad") } })
      return row
    }
    async function load() {
      try {
        const r = await api.get("/api/channels/" + ch.id + "/messages")
        cursor = r.cursor || ""
        clear(log)
        if (!r.messages.length) log.append(h("div", { class: "muted mono tiny", style: "padding:16px" }, "还没有消息，开个头吧"))
        else addMsgs(r.messages, true)
      } catch (e) { clear(log); log.append(h("div", { class: "muted mono tiny", style: "padding:16px" }, "加载失败")) }
    }
    async function tick() {
      try { const r = await api.get("/api/channels/" + ch.id + "/messages?since=" + encodeURIComponent(cursor)); if (r.messages.length) { cursor = r.cursor || cursor; addMsgs(r.messages) } } catch (e) {}
    }
    async function send() {
      const body = input.value.trim()
      if (!body) return
      input.value = ""; input.style.height = "auto"
      try { const r = await api.post("/api/channels/" + ch.id + "/messages", { body }); cursor = r.cursor || cursor; addMsgs([r.message], true) }
      catch (e) { toast(e.message || "发送失败", "bad"); input.value = body }
    }
    input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send() } })
    input.addEventListener("input", () => { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 120) + "px" })

    load()
    poll = setInterval(tick, 2500)
  }

  function renderBoard(ch) {
    const listEl = h("div", { class: "threadlist" }, h("div", { class: "muted mono tiny" }, "加载…"))
    main.append(header(ch, h("button", { class: "btn btn--sm btn--red", onClick: () => newThread(ch) }, "＋ 发帖")), listEl)
    api.get("/api/channels/" + ch.id + "/threads").then((r) => {
      clear(listEl)
      if (!r.threads.length) { listEl.append(h("div", { class: "empty" }, h("div", { class: "mono" }, "还没有帖子"), h("button", { class: "btn btn--red", style: "margin-top:12px", onClick: () => newThread(ch) }, "＋ 发第一帖"))); return }
      r.threads.forEach((t) => listEl.append(threadRow(ch, t)))
    }).catch(() => { clear(listEl); listEl.append(h("div", { class: "muted mono tiny" }, "加载失败")) })
  }

  function threadRow(ch, t) {
    return h("a", { class: "threadrow", href: "/talk/" + ch.id + "/" + t.id, "data-link": "1" },
      h("div", { class: "threadrow__main" },
        h("h3", { class: "threadrow__title serif" }, t.title),
        t.excerpt ? h("p", { class: "threadrow__ex" }, t.excerpt) : null,
        h("div", { class: "threadrow__meta mono tiny" }, authorLink(t.author, { avatar: false }), h("span", { class: "dotsep" }, fmtAgo(t.lastAt)))),
      h("div", { class: "threadrow__count mono" }, h("b", {}, String(t.replyCount)), h("span", { class: "tiny" }, "回复")))
  }

  function renderThread(ch, theId) {
    const box = h("div", { class: "threadview" }, h("div", { class: "muted mono tiny" }, "加载…"))
    main.append(box)
    let known = -1
    async function load(force) {
      let r
      try { r = await api.get("/api/channels/" + ch.id + "/threads/" + theId) }
      catch (e) { clear(box); box.append(h("div", { class: "soon" }, h("h2", {}, "404"), h("p", {}, "话题不存在"), h("a", { class: "btn btn--red", href: "/talk/" + ch.id, "data-link": "1", style: "margin-top:18px" }, "返回"))); stopPoll(); return }
      if (!force && r.replies.length === known) return
      known = r.replies.length
      const t = r.thread
      clear(box)
      box.append(
        h("div", { class: "talk__head" },
          h("a", { class: "mono tiny talkback", href: "/talk/" + ch.id, "data-link": "1" }, "← " + ch.name),
          t.canDelete ? h("button", { class: "btn btn--sm btn--danger", onClick: () => delThread(ch, theId) }, "删帖") : null),
        h("article", { class: "threadpost" },
          h("h1", { class: "threadpost__title serif" }, t.title),
          h("div", { class: "threadpost__meta mono tiny" }, authorLink(t.author), h("span", { class: "dotsep" }, fmtAgo(t.createdAt))),
          h("div", { class: "threadpost__body", html: escText(t.body) })),
        h("div", { class: "blogsub mono tiny" }, "回复 · " + r.replies.length),
        h("div", { class: "replylist" }, ...(r.replies.length ? r.replies.map((rp) => replyRow(ch, theId, rp)) : [h("div", { class: "muted mono tiny", style: "padding:8px 0" }, "还没有回复")])),
        replyBox(ch, theId))
    }
    function replyRow(ch, theId, rp) {
      const del = rp.canDelete ? h("button", { class: "cm__x", title: "删除" }, "✕") : null
      if (del) del.addEventListener("click", async () => { try { await api.del("/api/channels/" + ch.id + "/threads/" + theId + "/replies/" + rp.id); load(true) } catch (e) { toast(e.message || "删除失败", "bad") } })
      return h("div", { class: "cmrow" },
        h("div", { class: "cmrow__head" }, authorLink(rp.author), h("span", { class: "mono tiny muted" }, fmtAgo(rp.createdAt)), del),
        h("div", { class: "cmrow__body", html: escText(rp.body) }))
    }
    function replyBox(ch, theId) {
      const ta = h("textarea", { class: "textarea cmbox", rows: "3", placeholder: "回复…" })
      const btn = h("button", { class: "btn btn--red" }, "回复")
      btn.addEventListener("click", async () => {
        const body = ta.value.trim()
        if (!body) return
        btn.disabled = true
        try { await api.post("/api/channels/" + ch.id + "/threads/" + theId + "/replies", { body }); ta.value = ""; await load(true) } catch (e) { toast(e.message || "回复失败", "bad") }
        btn.disabled = false
      })
      return h("div", { class: "cmform" }, ta, h("div", { class: "cmform__act" }, btn))
    }
    load(true)
    poll = setInterval(() => load(false), 5000)
  }

  function newChannel() {
    const name = h("input", { class: "input", placeholder: "频道名", maxlength: "50" })
    const topic = h("input", { class: "input", placeholder: "频道简介（可选）", maxlength: "160" })
    let kind = "chat"
    const picks = []
    const mkPick = (k, label) => {
      const btn = h("button", { class: "kindpick" + (k === "chat" ? " on" : ""), type: "button" }, label)
      btn.addEventListener("click", () => { kind = k; picks.forEach((p) => p.classList.toggle("on", p === btn)) })
      picks.push(btn); return btn
    }
    const create = h("button", { class: "btn btn--red btn--lg", style: "width:100%" }, "创建频道")
    const m = openModal("新建频道", h("div", { class: "stack" },
      h("label", { class: "field" }, h("span", { class: "field__label" }, "名称"), name),
      h("label", { class: "field" }, h("span", { class: "field__label" }, "简介"), topic),
      h("div", { class: "field" }, h("span", { class: "field__label" }, "类型"), h("div", { class: "kindrow" }, mkPick("chat", "# 聊天室"), mkPick("board", "≡ 帖子板"))),
      create))
    create.addEventListener("click", async () => {
      if (!name.value.trim()) { toast("请填写频道名", "bad"); return }
      create.disabled = true
      try { const r = await api.post("/api/channels", { name: name.value, topic: topic.value, kind }); toast("频道已建", "ok"); m.close(); go("/talk/" + r.channel.id) }
      catch (e) { toast(e.message || "创建失败", "bad"); create.disabled = false }
    })
  }

  function newThread(ch) {
    const title = h("input", { class: "input", placeholder: "帖子标题", maxlength: "140" })
    const body = h("textarea", { class: "textarea", rows: "6", placeholder: "正文…" })
    const post = h("button", { class: "btn btn--red btn--lg", style: "width:100%" }, "发布")
    const m = openModal("发帖 · " + ch.name, h("div", { class: "stack" },
      h("label", { class: "field" }, h("span", { class: "field__label" }, "标题"), title),
      h("label", { class: "field" }, h("span", { class: "field__label" }, "正文"), body),
      post))
    post.addEventListener("click", async () => {
      if (!title.value.trim()) { toast("请填写标题", "bad"); return }
      post.disabled = true
      try { const r = await api.post("/api/channels/" + ch.id + "/threads", { title: title.value, body: body.value }); toast("已发布", "ok"); m.close(); go("/talk/" + ch.id + "/" + r.thread.id) }
      catch (e) { toast(e.message || "发布失败", "bad"); post.disabled = false }
    })
  }

  async function delChannel(ch) {
    if (!confirm("删除频道「" + ch.name + "」？里面的内容都会删除")) return
    try { await api.del("/api/channels/" + ch.id); toast("已删除", "info"); go("/talk") } catch (e) { toast(e.message || "删除失败", "bad") }
  }
  async function delThread(ch, theId) {
    if (!confirm("删除此帖？")) return
    try { await api.del("/api/channels/" + ch.id + "/threads/" + theId); toast("已删除", "info"); go("/talk/" + ch.id) } catch (e) { toast(e.message || "删除失败", "bad") }
  }

  boot()
  return { destroy: () => { stopPoll(); clearScroll() } }
}
