// The cover sheet's own styling, loaded with this chunk rather than sitting in
// the stylesheet every other page has to download.
import "../styles/home.css"
import { h, bi, clear } from "../lib/dom.js"
import { session } from "../lib/store.js"
import { api } from "../lib/api.js"
import { go } from "../router.js"
import { fileTrees } from "../components/filetree.js"
import { meltStage } from "../components/melt.js"
import { archivalMarks } from "../components/marks.js"
import { requireAccess } from "../components/authgate.js"
import { HEAD_ASCII, HEAD_COLS, HEAD_ROWS, HEAD_CELL, HEAD_ASPECT } from "../data/head-ascii.js"

// The artwork as supplied — no knockout, no recolouring.
const PLATE = "/persona/logo.png"

const CONTENTS = [
  { n: "○一", zh: "作品档案", en: "Works", to: "/projects", count: (s) => s.projects, plate: "/persona/plate-01.webp" },
  { n: "○二", zh: "企划登记", en: "Programmes", to: "/programmes", count: (s) => s.programmes, plate: "/persona/plate-02.webp" },
  { n: "○三", zh: "角色名录", en: "Personnel", to: "/characters", count: (s) => s.characters, plate: "/persona/plate-03.webp" },
  { n: "○四", zh: "频道与博客", en: "Bulletin", to: "/talk", count: () => null, plate: "/persona/plate-04.webp" }
]

const tame = matchMedia("(prefers-reduced-motion: reduce)").matches

// Per row of type. The whole plate lands in a little over a second.
const STEP_MS = 17
const HOLD_MS = 420

function stamp(d = new Date()) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0")
}

function buildMasthead() {
  const type = h("pre", { class: "mast__type", "aria-hidden": "true" })
  type.style.setProperty("--cols", HEAD_COLS)
  type.style.setProperty("--rows", HEAD_ROWS)
  type.style.setProperty("--cell", HEAD_CELL)
  type.style.setProperty("--step", STEP_MS + "ms")
  HEAD_ASCII.forEach((line, i) => {
    type.append(h("span", { style: "--i:" + i }, line + "\n"))
  })

  const img = h("img", {
    class: "mast__img", src: PLATE, alt: "长生天计划徽记",
    loading: "eager", fetchpriority: "high"
  })

  const skip = h("button", { class: "mast__skip", type: "button" }, bi("跳过", "SKIP"))
  const plate = h("div", { class: "mast__plate" }, type, img, skip)
  plate.style.setProperty("--plate-aspect", HEAD_ASPECT.toFixed(4))

  const mast = h("header", { class: "mast" },
    h("div", { class: "mast__inner" }, plate))

  return { mast, plate, img, skip }
}

export default function home(root) {
  const me = session.me
  const name = me ? (me.displayName || me.handle) : "访客"
  const today = stamp()

  const { mast, img, skip } = buildMasthead()

  const title = h("h1", { class: "cover__title" }, "长生天计划中央档案库")
  const latin = h("div", { class: "cover__latin" }, "Project Tangri Central Archive")

  // ---- the four entries, as a long scroll ----
  // One image per entry, held behind the whole run and melting from one to the
  // next as each block takes the screen. A single sticky backdrop rather than
  // one canvas per block: a browser only grants a handful of live WebGL
  // contexts, and four of them for one page would be four too many.
  let activeSection = -1
  const stage = meltStage(CONTENTS.map((c) => c.plate), CONTENTS.map((c) => c.zh + " " + c.en))
  const stageCap = h("div", { class: "entries__cap mono" })

  const tocFigs = new Map()
  const entryEls = []
  const marks = []

  const blocks = CONTENTS.map((c, i) => {
    const fig = h("span", { class: "entry__fig" }, "—")
    tocFigs.set(c.zh, { el: fig, of: c.count })

    const head = h("div", { class: "entry__head" },
      h("h2", { class: "entry__zh" }, c.zh))
    marks.push(archivalMarks(head, "entry-" + c.en, { density: 3 }))

    const card = h("div", { class: "entry__card" },
      h("div", { class: "entry__n mono" }, c.n),
      head,
      h("div", { class: "entry__en mono" }, c.en),
      h("div", { class: "entry__meta mono" }, h("span", {}, "卷内件数 "), fig),
      h("button", { class: "entry__go mono", type: "button", onClick: requireAccess(c.to) },
        bi("进入", "ENTER"), h("span", { class: "entry__arrow" }, "→")))

    const block = h("section", {
      class: "entry", "data-side": i % 2 === 0 ? "left" : "right", "data-i": String(i)
    }, card)
    entryEls.push(block)
    return block
  })

  const entries = h("div", { class: "entries" },
    h("div", { class: "entries__bg" },
      stage.el,
      h("div", { class: "entries__scrim" }),
      stageCap),
    ...blocks)

  function setSection(i) {
    if (i === activeSection) return
    activeSection = i
    stage.to(i)
    entryEls.forEach((el, n) => el.setAttribute("data-on", n === i ? "1" : "0"))
    const c = CONTENTS[i]
    clear(stageCap)
    stageCap.append(
      h("span", { class: "entries__capN" }, c.n),
      h("span", { class: "entries__capZh" }, c.zh),
      h("span", { class: "entries__capEn" }, c.en))
  }

  const duty = h("div", { class: "ledger" })
  const register = h("div", { class: "ledger" })

  const trees = fileTrees({})

  const view = h("div", { class: "cover" },
    trees.el,
    mast,
    h("div", { class: "wrap" },
      h("div", { class: "cover__head" }, title, latin)),
    entries,
    h("div", { class: "wrap" },
      h("div", { class: "cover__cols" },
        h("section", {},
          h("div", { class: "cover__label" }, bi("本日勤务", "Duty Log " + today)),
          duty),
        h("section", {},
          h("div", { class: "cover__label" }, bi("登记摘要", "Summary")),
          register))))

  root.append(view)

  // ---- masthead sequence ----
  // The plate is pulled every time the cover is opened. It was previously shown
  // once per session, which meant that after the first visit the sequence never
  // appeared again and looked simply broken.
  let timer = null

  function toPlate() {
    if (timer) { clearTimeout(timer); timer = null }
    mast.classList.add("is-plate")
  }

  if (tame) {
    mast.classList.add("is-plate")
    // Nothing to reveal, so drop the type rather than fading it out.
    mast.querySelector(".mast__type").remove()
  } else {
    timer = setTimeout(toPlate, HEAD_ROWS * STEP_MS + HOLD_MS)
  }
  skip.addEventListener("click", toPlate)
  img.addEventListener("error", () => { mast.classList.add("is-plate") })

  // ---- the plate follows the reading position ----
  // The active entry is the last one whose top edge has crossed the middle of
  // the viewport.
  //
  // Two earlier rules were wrong. An IntersectionObserver over a narrow band
  // let several entries cross at once, so the winner came down to the order the
  // callback happened to deliver them in. Picking whichever entry sat nearest
  // the centre then broke at the end of the page: the document stops scrolling
  // with the last entry still half a screen short of the middle, so it could
  // never win and the final section was unreachable. Asking which entries have
  // *started* is monotonic and has no such dead zone.
  let queued = false
  function pickSection() {
    queued = false
    const mid = window.innerHeight / 2
    let best = 0
    entryEls.forEach((row, i) => {
      if (row.getBoundingClientRect().top <= mid) best = i
    })
    setSection(best)
  }
  const onScroll = () => {
    if (queued) return
    queued = true
    requestAnimationFrame(pickSection)
  }
  addEventListener("scroll", onScroll, { passive: true })
  addEventListener("resize", onScroll, { passive: true })
  // Mount may happen at any scroll offset — a restored position, or a return to
  // the cover part-way down — so the opening state is measured, not assumed.
  pickSection()

  // ---- figures ----
  function fillDuty(plan) {
    clear(duty)
    const items = (plan && plan.items) || []
    if (!items.length) {
      duty.append(h("div", { class: "ledger__none" }, me ? "无待办事项 STANDBY" : "登入后载入"))
      return
    }
    items.slice(0, 7).forEach((it) => {
      const label = it.kind === "version" ? (it.projectTitle || "提交更新")
        : it.kind === "images" ? ("产出画作 " + (it.progress || 0) + " / " + it.count)
        : (it.text || "")
      duty.append(h("div", { class: "ledger__row" + (it.done ? " is-done" : "") },
        h("span", { class: "ledger__k" }, label),
        h("span", { class: "ledger__v" }, it.done ? "已办" : "待办")))
    })
  }

  function fillRegister(t) {
    clear(register)
    const rows = [
      ["作品 WORKS", t.projects], ["提交 COMMITS", t.versions],
      ["角色 PERSONNEL", t.characters], ["成员 MEMBERS", t.members],
      ["文件 FILES", t.files]
    ]
    rows.forEach(([k, v]) => register.append(h("div", { class: "ledger__row" },
      h("span", { class: "ledger__k" }, k),
      h("span", { class: "ledger__v" }, v == null ? "—" : String(v)))))
  }

  fillDuty(null)
  fillRegister({})

  if (me) {
    Promise.all([
      api.get("/api/stats").catch(() => null),
      api.get("/api/characters").catch(() => null),
      api.get("/api/projects").catch(() => null),
      api.get("/api/posts").catch(() => null)
    ]).then(([s, c, p, b]) => {
      const t = (s && s.totals) || {}
      const characters = (c && c.characters) || []
      const projects = (p && p.projects) || []
      const posts = (b && b.posts) || []
      const totals = { ...t, characters: characters.length }
      fillRegister(totals)
      tocFigs.forEach(({ el, of }) => {
        const n = of(totals)
        el.textContent = n == null ? "—" : String(n)
      })
      // Let the watermark listings show what the archive actually holds.
      trees.update({ projects, characters, posts })
    })
    api.get("/api/plans?date=" + today).then((r) => fillDuty(r.plan)).catch(() => {})
  }

  return {
    destroy() {
      if (timer) clearTimeout(timer)
      removeEventListener("scroll", onScroll)
      removeEventListener("resize", onScroll)
      // Releases the GL context and its textures; leaving them behind would
      // burn through the browser's small budget of live contexts.
      stage.destroy()
      marks.forEach((m) => m.destroy())
      trees.destroy()
    }
  }
}

