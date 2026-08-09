import { h, bi } from "../lib/dom.js"
import { go } from "../router.js"
import { session } from "../lib/store.js"

/**
 * The access refusal, staged as a terminal coming up against a closed file.
 *
 * A visitor may read the cover sheet, but the moment they try to open a section
 * the page is struck out in front of them — every run of text on screen takes a
 * black bar — and a terminal panel drops in to say the file is closed.
 *
 * The staging follows a boot sequence rather than a dialog appearing: corner
 * brackets fly in and snap to the panel's corners first, the wordmark lands
 * with a printer's misregistered ghost trailing it, the rules draw themselves,
 * and only then does the refusal begin to pulse. Everything is offset by a beat
 * from the thing before it, which is where the smoothness comes from — nothing
 * arrives at the same instant as anything else.
 */

const tame = matchMedia("(prefers-reduced-motion: reduce)").matches

// Every run of text the redaction will strike, in the order it walks the page.
const REDACT_SEL = [
  ".cover__title", ".cover__latin", ".cover__label",
  ".entry__n", ".entry__zh", ".entry__en", ".entry__meta", ".entry__go",
  ".ledger__k", ".ledger__v", ".ledger__none", ".entries__cap"
].join(",")

const LINES = [
  ["卷宗状态", "FILE STATUS", "闭卷 CLOSED"],
  ["密级", "CLASSIFICATION", "内部 INTERNAL"],
  ["请求", "REQUEST", "驳回 DENIED"]
]

let open = false

/**
 * Strike out the page, then present the refusal.
 * @param {string} [intent] the path the visitor was trying to reach
 */
export function denyAccess(intent) {
  if (open) return
  open = true

  // ---- 1. strike the page out ----
  const struck = [...document.querySelectorAll(REDACT_SEL)]
    .filter((el) => el.offsetParent !== null && el.textContent.trim())
  struck.forEach((el, i) => {
    el.classList.add("redact")
    // Walked top to bottom rather than all at once, so it reads as something
    // moving down the page and not as a light being switched off.
    el.style.setProperty("--rd", (i * 26) + "ms")
  })

  // ---- 2. the terminal ----
  const brackets = ["tl", "tr", "bl", "br"].map((k) =>
    h("span", { class: "gate__bracket gate__bracket--" + k }))

  const wordmark = h("div", { class: "gate__mark" },
    h("span", { class: "gate__markGhost", "aria-hidden": "true" }, "长生天计划"),
    h("span", { class: "gate__markInk" }, "长生天计划"))

  const rows = LINES.map(([zh, en, val], i) => h("div", {
    class: "gate__row", style: "--d:" + (520 + i * 90) + "ms"
  },
    h("span", { class: "gate__k" }, bi(zh, en)),
    h("span", { class: "gate__dots" }),
    h("span", { class: "gate__v" }, val)))

  const panel = h("div", { class: "gate__panel", role: "dialog", "aria-modal": "true", "aria-label": "需要验证权限" },
    ...brackets,
    h("div", { class: "gate__head" },
      wordmark,
      h("div", { class: "gate__rule" }),
      h("div", { class: "gate__sub" }, bi("中央档案库终端", "CENTRAL ARCHIVE TERMINAL"))),
    h("div", { class: "gate__body" }, ...rows),
    h("div", { class: "gate__alarm" },
      h("span", { class: "gate__alarmDot" }),
      h("span", {}, bi("需要验证权限", "AUTHORISATION REQUIRED"))),
    h("div", { class: "gate__acts" },
      h("button", { class: "gate__btn gate__btn--go", type: "button", onClick: () => { close(); go("/login") } }, bi("登录", "SIGN IN")),
      h("button", { class: "gate__btn", type: "button", onClick: () => close() }, bi("返回封面", "BACK"))))

  const root = h("div", { class: "gate" },
    h("div", { class: "gate__veil", onClick: () => close() }),
    panel)

  if (intent) panel.setAttribute("data-intent", intent)
  document.body.append(root)
  document.body.classList.add("gate-on")

  // Flush layout so the transitions have a start value to move from, then flip
  // the state in the same task.
  //
  // Deferring this to requestAnimationFrame is the usual trick and it is a trap
  // here: a backgrounded tab never runs those callbacks, so the panel would
  // stay at opacity zero while the page sat struck out behind it. Reading a
  // layout property forces the same flush synchronously.
  void root.offsetWidth
  root.setAttribute("data-on", "1")

  const onKey = (e) => { if (e.key === "Escape") close() }
  document.addEventListener("keydown", onKey)

  function close() {
    if (!open) return
    open = false
    document.removeEventListener("keydown", onKey)
    root.setAttribute("data-on", "0")
    struck.forEach((el) => { el.classList.remove("redact"); el.style.removeProperty("--rd") })
    document.body.classList.remove("gate-on")
    const drop = () => root.remove()
    if (tame) drop()
    else setTimeout(drop, 420)
  }

  return { close }
}

/**
 * Guard a navigation. Returns true when the visitor may pass; otherwise stages
 * the refusal and returns false.
 */
export function requireAccess(to) {
  return function guarded() {
    if (session.me) { go(to); return true }
    denyAccess(to)
    return false
  }
}
