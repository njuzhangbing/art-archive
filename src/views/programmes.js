import { h, bi, clear, frag } from "../lib/dom.js"
import { api } from "../lib/api.js"
import { isAdmin } from "../lib/store.js"
import { toast } from "../components/toast.js"
import { SECRECY, isRedacted } from "../lib/classify.js"

/**
 * Programmes — the standing initiatives the archive runs.
 *
 * Laid out as a selector rather than a list: the whole set lives on a rail
 * along the bottom that drags, wheels and arrows sideways, and whatever is
 * selected opens in a panel down the right. Picking a new one closes the panel
 * first and lets it come back with the new contents, so the two never cut
 * against each other, and the rail dims and shrinks everything the reader is
 * not on so the eye has one place to be.
 *
 * Mostly a title and a link out to wherever the work actually lives. Admins
 * post them; everyone reads them.
 */

const tame = matchMedia("(prefers-reduced-motion: reduce)").matches

const STATUS = [
  { key: "OPEN", zh: "征集中", en: "OPEN" },
  { key: "RUNNING", zh: "进行中", en: "RUNNING" },
  { key: "CLOSED", zh: "已结项", en: "CLOSED" }
]

const statusOf = (k) => STATUS.find((s) => s.key === k) || STATUS[0]
const pad = (n) => String(n).padStart(2, "0")

function ordinal(n) {
  const t = n % 100
  const s = t >= 11 && t <= 13 ? "TH" : ["TH", "ST", "ND", "RD"][n % 10] || "TH"
  return pad(n) + s
}

function stamp(ts) {
  const d = new Date(typeof ts === "number" ? ts : Date.parse(ts))
  if (Number.isNaN(+d)) return "—"
  return pad(d.getMonth() + 1) + "/" + pad(d.getDate()) + "  " + pad(d.getHours()) + ":" + pad(d.getMinutes())
}

export default function programmes(root) {
  const admin = isAdmin()
  let items = []
  let cur = 0
  let dead = false
  let swap = 0

  const bg = h("div", { class: "pgm__bg" })
  // The selected number, set enormous and hollow across the empty half. It is
  // the only thing holding that side of the frame.
  const ghost = h("div", { class: "pgm__ghost", "aria-hidden": "true" })
  const pc = h("div", { class: "pgm__pc" })
  const panel = h("div", { class: "pgm__panel" }, pc)
  const go = h("a", { class: "pgm__go", target: "_blank", rel: "noopener noreferrer" },
    h("span", {}, "前往"), h("span", { class: "pgm__goEn" }, "OPEN"),
    h("span", { class: "pgm__goArrow" }, "→"))

  const ruler = h("div", { class: "pgm__ruler" })
  const track = h("div", { class: "pgm__track" }, ruler)
  const rail = h("div", { class: "pgm__rail" }, track)

  const top = h("div", { class: "pgm__top" },
    h("div", { class: "pgm__brand" },
      h("span", { class: "pgm__kicker" }, "Programmes"),
      h("span", { class: "pgm__brandZh" }, "企划登记")),
    admin ? h("button", { class: "pgm__new", type: "button", onClick: () => openForm() }, "+ 发布企划") : null)

  const view = h("section", { class: "pgm" },
    bg,
    ghost,
    h("div", { class: "pgm__noise" }),
    h("span", { class: "pgm__deco" }),
    top, panel, go, rail)

  root.append(view)
  void view.offsetWidth
  view.setAttribute("data-on", "1")

  // ---- selection ----

  function paint() {
    ;[...track.querySelectorAll(".pgm__item")].forEach((el, i) => {
      el.setAttribute("data-state", i === cur ? "on" : "dim")
      el.setAttribute("aria-current", i === cur ? "true" : "false")
    })
  }

  /** Land the selected item in the middle of whatever the panel leaves free. */
  function centre(i, smooth) {
    const el = track.querySelectorAll(".pgm__item")[i]
    if (!el) return
    const free = innerWidth <= 880 ? rail.clientWidth : rail.clientWidth - panel.offsetWidth
    const left = el.offsetLeft + el.offsetWidth / 2 - free / 2
    rail.scrollTo({ left: Math.max(0, left), behavior: smooth && !tame ? "smooth" : "auto" })
  }

  function select(i, first) {
    if (!items.length) return
    if (i === cur && !first) return
    cur = i
    paint()
    centre(i, !first)
    if (first || tame) { fill(i); open(); return }
    panel.setAttribute("data-open", "0")
    go.setAttribute("data-on", "0")
    ghost.setAttribute("data-on", "0")
    clearTimeout(swap)
    swap = setTimeout(() => { if (!dead) { fill(i); open() } }, 380)
  }

  function open() {
    panel.setAttribute("data-open", "1")
    const p = items[cur]
    const live = p && p.url && !isRedacted(p)
    go.setAttribute("data-on", live ? "1" : "0")
    if (live) go.href = p.url; else go.removeAttribute("href")
  }

  // ---- the panel ----

  function fill(i) {
    const p = items[i]
    if (!p) return
    const st = statusOf(p.status)
    const shut = isRedacted(p)
    ghost.textContent = pad(i + 1)
    ghost.setAttribute("data-on", "1")
    clear(pc)
    // frag() drops the null branches; Element.append would stringify them.
    pc.append(frag(
      h("div", { class: "pgm__meta" },
        h("span", { class: "pgm__label" }, ordinal(i + 1)),
        h("span", { class: "pgm__num" }, pad(i + 1))),
      h("h1", { class: "pgm__title" },
        shut ? h("span", { class: "pgm__bar pgm__bar--title" }) : p.title),
      h("div", { class: "pgm__st" },
        h("span", {}, st.en),
        h("span", { class: "pgm__stZh" }, st.zh),
        p.sec === "SECRET" ? h("span", { class: "pgm__sec" }, "CLASSIFIED") : null),
      shut
        ? h("p", { class: "pgm__desc" }, h("span", { class: "pgm__bar" }), h("span", { class: "pgm__bar pgm__bar--short" }))
        : h("p", { class: "pgm__desc" }, p.note || "—"),
      h("div", { class: "pgm__foot" },
        h("span", {}, p.url && !shut ? p.url.replace(/^https?:\/\//, "").slice(0, 46) : "NO LINK")),
      admin
        ? h("div", { class: "pgm__acts" },
            h("button", { class: "pgm__act", type: "button", onClick: () => openForm(p) }, "编辑"),
            h("button", { class: "pgm__act", type: "button", onClick: () => remove(p) }, "撤下"))
        : null
    ))
  }

  // ---- the rail ----

  function build() {
    clear(track)
    track.append(ruler)
    items.forEach((p, i) => {
      const shut = isRedacted(p)
      const st = statusOf(p.status)
      const item = h("button", { class: "pgm__item", type: "button", "data-state": "dim" },
        h("span", { class: "pgm__iNum" }, pad(i + 1),
          p.sec === "SECRET" ? h("span", { class: "pgm__iMark" }) : null),
        h("span", { class: "pgm__iTitle" },
          shut ? h("span", { class: "pgm__bar pgm__bar--rail" }) : p.title),
        h("span", { class: "pgm__iSub" }, st.en),
        h("span", { class: "pgm__iWhen" }, stamp(p.createdAt)))
      item.addEventListener("click", () => { if (!dragged) select(i) })
      track.append(item)
    })
    if (!items.length) {
      view.setAttribute("data-empty", "1")
      clear(pc)
      pc.append(h("div", { class: "pgm__none" }, admin ? "尚无企划，点右上发布" : "尚无企划"))
      panel.setAttribute("data-open", "1")
      return
    }
    view.removeAttribute("data-empty")
    select(0, true)
  }

  // Drag to scroll. `dragged` keeps a drag from also firing the item's click.
  let down = false, dragged = false, startX = 0, startL = 0
  rail.addEventListener("pointerdown", (e) => {
    down = true; dragged = false
    startX = e.clientX; startL = rail.scrollLeft
    rail.setAttribute("data-grab", "1")
  })
  rail.addEventListener("pointermove", (e) => {
    if (!down) return
    const dx = e.clientX - startX
    if (Math.abs(dx) > 4) dragged = true
    rail.scrollLeft = startL - dx
  })
  const up = () => { down = false; rail.removeAttribute("data-grab"); setTimeout(() => { dragged = false }, 0) }
  rail.addEventListener("pointerup", up)
  rail.addEventListener("pointercancel", up)
  rail.addEventListener("pointerleave", up)

  // A vertical wheel on the rail moves it sideways — there is nowhere else for
  // the page to scroll.
  rail.addEventListener("wheel", (e) => {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
    e.preventDefault()
    rail.scrollLeft += e.deltaY
  }, { passive: false })

  view.addEventListener("keydown", (e) => {
    if (!items.length) return
    if (e.key === "ArrowRight") { e.preventDefault(); select(Math.min(items.length - 1, cur + 1)) }
    if (e.key === "ArrowLeft") { e.preventDefault(); select(Math.max(0, cur - 1)) }
  })

  const onMove = (e) => {
    const x = (e.clientX / innerWidth - 0.5) * 12
    const y = (e.clientY / innerHeight - 0.5) * 12
    bg.style.transform = "translate(" + x.toFixed(2) + "px," + y.toFixed(2) + "px) scale(1.03)"
  }
  if (!tame) document.addEventListener("mousemove", onMove)

  const onResize = () => centre(cur, false)
  addEventListener("resize", onResize)

  // ---- admin ----

  function openForm(existing) {
    const f = {
      title: h("input", { class: "input", value: existing ? existing.title : "", placeholder: "企划名称" }),
      url: h("input", { class: "input", value: existing ? existing.url : "", placeholder: "https://" }),
      note: h("textarea", { class: "textarea", placeholder: "说明（可留空）" })
    }
    if (existing) f.note.value = existing.note || ""

    // Buttons rather than a <select>: a native option is one line of text and
    // cannot carry the label under its Chinese the way the rest of the site does.
    let status = (existing && existing.status) || STATUS[0].key
    let sec = (existing && existing.sec) || SECRECY[0].key

    function picker(options, current, onPick) {
      const btns = options.map((o) => {
        const b = h("button", { type: "button", "data-sec": o.key, "data-on": o.key === current ? "1" : "0" },
          h("span", { class: "swatch" }), bi(o.zh, o.en))
        b.addEventListener("click", () => {
          btns.forEach((x) => x.setAttribute("data-on", x === b ? "1" : "0"))
          onPick(o.key)
        })
        return b
      })
      return h("div", { class: "secpick" }, ...btns)
    }

    const sheet = h("div", { class: "pgm__sheet" },
      h("div", { class: "pgm__form" },
        h("div", { class: "pgm__formHead" }, existing ? "编辑企划" : "发布企划"),
        field(bi("名称", "TITLE"), f.title),
        field(bi("链接", "LINK"), f.url),
        field(bi("说明", "NOTE"), f.note),
        h("div", { class: "pgm__formRow" },
          field(bi("状态", "STATUS"), picker(STATUS, status, (k) => { status = k })),
          field(bi("密级", "CLASSIFICATION"), picker(SECRECY, sec, (k) => { sec = k }))),
        h("div", { class: "pgm__formActs" },
          h("button", { class: "pgm__go pgm__go--flat", type: "button", onClick: save }, existing ? "保存" : "发布"),
          h("button", { class: "pgm__act", type: "button", onClick: shut }, "取消"))))

    function shut() { sheet.setAttribute("data-on", "0"); setTimeout(() => sheet.remove(), tame ? 0 : 240) }

    async function save() {
      const body = {
        title: f.title.value.trim(), url: f.url.value.trim(),
        note: f.note.value, status, sec
      }
      if (!body.title) { toast("请填写名称", "bad"); return }
      try {
        if (existing) await api.patch("/api/programmes/" + existing.id, body)
        else await api.post("/api/programmes", body)
        shut()
        toast(existing ? "已保存" : "已发布", "ok")
        load()
      } catch (e) { toast(e.message || "失败", "bad") }
    }

    view.append(sheet)
    void sheet.offsetWidth
    sheet.setAttribute("data-on", "1")
    f.title.focus()
  }

  async function remove(p) {
    try { await api.del("/api/programmes/" + p.id); toast("已撤下", "ok"); load() }
    catch (e) { toast(e.message || "失败", "bad") }
  }

  async function load() {
    try {
      const r = await api.get("/api/programmes")
      if (dead) return
      items = r.programmes || []
      cur = Math.min(cur, Math.max(0, items.length - 1))
      build()
    } catch (err) {
      if (dead) return
      items = []
      build()
      toast(err.message || "加载失败", "bad")
    }
  }

  load()

  return {
    destroy() {
      dead = true
      clearTimeout(swap)
      document.removeEventListener("mousemove", onMove)
      removeEventListener("resize", onResize)
    }
  }
}

function field(label, input) {
  return h("div", { class: "field" }, h("span", { class: "field__label" }, label), input)
}
