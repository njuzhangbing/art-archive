import { h, clear } from "../lib/dom.js"
import { api } from "../lib/api.js"
import { go } from "../router.js"

let mounted = null

export function openSearch() {
  if (mounted) { mounted.field.focus(); mounted.field.select(); return }

  const field = h("input", {
    class: "kbar__field", type: "text", autocomplete: "off",
    spellcheck: "false", placeholder: "搜索项目 角色 文章 成员 讨论…"
  })
  const results = h("div", { class: "kbar__results" })
  const box = h("div", { class: "kbar__box" },
    h("div", { class: "kbar__bar" },
      h("span", { class: "kbar__lens" }, "🔍"),
      field,
      h("kbd", { class: "kbar__esc mono" }, "ESC")
    ),
    results
  )
  const scrim = h("div", { class: "kbar" }, box)
  scrim.addEventListener("mousedown", (e) => { if (e.target === scrim) close() })
  document.body.appendChild(scrim)
  document.body.classList.add("kbar-on")
  mounted = { scrim, field }
  setTimeout(() => field.focus(), 24)

  let live = []
  let cursor = -1
  let beat = null
  let turn = 0

  idle("输入关键词，开始翻找档案 Esc 退出")

  function idle(msg) {
    clear(results)
    results.append(h("div", { class: "kbar__idle mono tiny" }, msg))
    live = []; cursor = -1
  }

  async function fire() {
    const q = field.value.trim()
    if (!q) { idle("输入关键词，开始翻找档案 Esc 退出"); return }
    const mine = ++turn
    clear(results)
    results.append(h("div", { class: "kbar__idle mono tiny" }, "翻找中…"))
    try {
      const r = await api.get("/api/search?q=" + encodeURIComponent(q))
      if (mine !== turn) return
      paint(r)
    } catch (e) {
      if (mine === turn) idle("搜索失败，稍后再试")
    }
  }

  field.addEventListener("input", () => { clearTimeout(beat); beat = setTimeout(fire, 220) })

  field.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); move(1) }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1) }
    else if (e.key === "Enter") { e.preventDefault(); if (live[cursor]) live[cursor].click(); else if (live[0]) live[0].click() }
    else if (e.key === "Escape") { e.preventDefault(); close() }
  })

  function move(dir) {
    if (!live.length) return
    cursor = (cursor + dir + live.length) % live.length
    live.forEach((el, i) => el.classList.toggle("on", i === cursor))
    live[cursor].scrollIntoView({ block: "nearest" })
  }

  function paint(r) {
    clear(results); live = []; cursor = -1
    const n = r.projects.length + r.characters.length + r.posts.length + r.threads.length + r.users.length
    if (!n) { results.append(h("div", { class: "kbar__idle mono tiny" }, "没有匹配「" + r.q + "」的结果")); return }
    section("项目", "PJ", r.projects, (p) => ({ to: "/projects/" + p.id, cover: p.coverUrl, sec: p.sec, title: p.title, sub: p.snippet }))
    section("角色", "CH", r.characters, (c) => ({ to: "/characters/" + c.id, cover: c.coverUrl, sec: c.sec, title: c.name + (c.code ? "  " + c.code : ""), sub: c.snippet }))
    section("文章", "BL", r.posts, (p) => ({ to: "/blog/" + p.id, title: p.title, sub: "@" + p.author + (p.snippet ? " " + p.snippet : "") }))
    section("讨论", "TK", r.threads, (t) => ({ to: "/talk/" + t.cid + "/" + t.id, title: t.title, sub: t.snippet }))
    section("成员", "ME", r.users, (u) => ({ to: "/u/" + u.handle, cover: u.avatarUrl, title: u.displayName, sub: "@" + u.handle }))
  }

  function section(label, code, arr, map) {
    if (!arr.length) return
    results.append(h("div", { class: "kbar__grp mono tiny" }, h("span", {}, label), h("i", {}, code + " " + arr.length)))
    arr.forEach((x) => {
      const m = map(x)
      const thumb = h("span", { class: "kbar__thumb", "data-sec": m.sec || null },
        m.cover ? h("img", { src: m.cover, loading: "lazy", alt: "" }) : h("span", { class: "mono tiny" }, code))
      const row = h("button", {
        class: "kbar__row", type: "button",
        onClick: () => { go(m.to); close() },
        onMouseenter: () => { cursor = live.indexOf(row); live.forEach((el, i) => el.classList.toggle("on", i === cursor)) }
      }, thumb, h("span", { class: "kbar__lines" },
        h("b", {}, m.title),
        m.sub ? h("span", { class: "kbar__sub" }, m.sub) : null))
      results.append(row)
      live.push(row)
    })
  }

  function close() {
    clearTimeout(beat)
    scrim.remove()
    document.body.classList.remove("kbar-on")
    mounted = null
  }
}
