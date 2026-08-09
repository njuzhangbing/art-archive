import { h, bi, clear } from "../lib/dom.js"
import { api } from "../lib/api.js"
import { session } from "../lib/store.js"
import { toast } from "../components/toast.js"
import { go } from "../router.js"
import { tracker } from "../components/tracker.js"
import { bearer } from "../lib/net.js"
import { conduit } from "../components/conduit.js"
import { offerApp } from "../components/appcard.js"

/**
 * The sign-in screen.
 *
 * Built out of movement rather than copy: the plate drifts to a stop, the panel
 * arrives under a mask that opens left to right, the wordmark rises out of its
 * own crop, and each field slides in behind its own wipe a beat after the last.
 * Switching between sign-in and register wipes the old form out before the new
 * one comes back, so the two never cut against each other.
 *
 * Below it an intake conduit runs into three terminals. When a sign-in lands,
 * every strand fires at once, the panel wipes shut, and a sheet crosses the
 * frame — then the route changes behind it.
 */

const tame = matchMedia("(prefers-reduced-motion: reduce)").matches

const PLATE = "/persona/plate-00.webp"

/** How long the exit runs before the route is allowed to change. */
const EXIT_MS = tame ? 0 : 560

export default function auth(root) {
  if (session.me) { go("/me"); return {} }

  let mode = "login"
  let dead = false
  const timers = []
  const wait = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t }

  const pane = h("div", { class: "term__pane" })
  const trk = tracker()
  const cdt = conduit()

  const stage = h("div", { class: "term__stage" },
    h("img", { class: "term__plate", src: PLATE, alt: "", loading: "eager", fetchpriority: "high" }),
    h("div", { class: "term__veil" }),
    trk.el,
    h("div", { class: "term__deck" }, cdt.el),
    h("div", { class: "term__bar term__bar--t" }),
    h("div", { class: "term__bar term__bar--b" }),
    h("div", { class: "term__sheet" }))

  const brackets = ["tl", "tr", "bl", "br"].map((k) => h("span", { class: "term__bracket term__bracket--" + k }))

  // Each line is cropped by its own parent and slides up out of it, so the text
  // is uncovered rather than faded in.
  const line = (cls, d, ...kids) =>
    h("span", { class: "term__crop", style: "--cd:" + d + "ms" }, h("span", { class: cls }, ...kids))

  // Brackets sit outside the card, so the card carries the mask on its own —
  // a clip-path on the panel would cut them off with it.
  const card = h("div", { class: "term__card" },
    h("div", { class: "term__head" },
      h("div", { class: "term__mark" },
        h("span", { class: "term__markGhost", "aria-hidden": "true" }, "长生天计划"),
        line("term__markInk", 150, "长生天计划")),
      h("div", { class: "term__rule" }),
      line("term__sub", 330, bi("中央档案库", "CENTRAL ARCHIVE"))),
    pane)

  const panel = h("div", { class: "term__panel" }, ...brackets, card)

  const view = h("div", { class: "term" }, stage, panel)
  root.append(view)

  // Flush layout, then flip the state in the same task. A frame callback would
  // never fire in a background tab and the panel would sit invisible.
  void view.offsetWidth
  view.setAttribute("data-on", "1")

  const grab = (form, name) => (form.querySelector("[name=" + name + "]") || {}).value || ""

  // Red is the one colour left on this site that means "this did not work".
  // The frame beats a few times so a wrong password is felt, not just read,
  // then holds until the next keystroke.
  const alarm = h("div", { class: "term__alarm", role: "alert", "aria-live": "assertive" })

  function refuse(zh, en) {
    alarm.replaceChildren(bi(zh, en))
    card.setAttribute("data-err", "1")
    card.classList.remove("term__card--hit")
    void card.offsetWidth
    card.classList.add("term__card--hit")
  }

  function settle() {
    if (!card.hasAttribute("data-err")) return
    card.removeAttribute("data-err")
    card.classList.remove("term__card--hit")
    alarm.replaceChildren()
  }

  function field(label, attrs, i) {
    return h("label", { class: "field term__field", style: "--d:" + (420 + i * 90) + "ms" },
      h("span", { class: "field__label" }, label),
      h("input", { class: "input", ...attrs }))
  }

  function draw(replay) {
    clear(pane)
    const isLogin = mode === "login"
    const label = isLogin ? bi("登 录", "SIGN IN") : bi("注 册", "REGISTER")
    const submit = h("button", {
      class: "term__submit", type: "submit", style: "--d:" + (isLogin ? 690 : 780) + "ms"
    }, label)
    const toggle = h("button", {
      class: "term__toggle", type: "button", style: "--d:" + (isLogin ? 780 : 870) + "ms"
    }, isLogin ? "还没有账号？前往注册 →" : "已有账号？返回登录 →")

    const fields = [
      field(bi("用户名", "HANDLE"), { name: "handle", autocomplete: "username", placeholder: "tengri", maxlength: "20" }, 0),
      field(bi("密码", "PASSWORD"), { name: "password", type: "password", autocomplete: isLogin ? "current-password" : "new-password", placeholder: "至少 8 位" }, 1),
      isLogin ? null : field(bi("显示名", "DISPLAY"), { name: "display", placeholder: "可留空，默认同用户名", maxlength: "40" }, 2)
    ].filter(Boolean)

    const form = h("form", { class: "term__form" }, ...fields, submit, alarm, toggle)
    form.addEventListener("input", settle)

    form.addEventListener("submit", async (e) => {
      e.preventDefault()
      const handle = grab(form, "handle").trim()
      const password = grab(form, "password")
      // Caught here rather than at the server so the frame answers the moment
      // the reader presses the button.
      if (!handle) { refuse("请填写用户名", "HANDLE REQUIRED"); return }
      if (!password) { refuse("请填写密码", "PASSWORD REQUIRED"); return }
      if (!isLogin && password.length < 8) { refuse("密码至少 8 位", "PASSWORD TOO SHORT"); return }
      settle()
      submit.disabled = true
      submit.replaceChildren(bi("验 证 中", "VERIFYING"))
      try {
        const r = isLogin
          ? await api.post("/api/login", { handle, password })
          : await api.post("/api/register", { handle, password, displayName: grab(form, "display") })
        submit.replaceChildren(bi("已 授 权", "AUTHORISED"))
        submit.setAttribute("data-ok", "1")
        // Only ever present in the Android build; the website gets a cookie.
        bearer.set(r.token)
        session.set(r.user)
        depart(() => {
          toast(isLogin ? "欢迎回来，@" + r.user.handle
            : (r.firstSoul ? "你是长生天第一位管理员" : "注册成功"), "ok")
          go("/projects")
          // Website, Android, first time asked: mention the app once the page
          // behind the transition has settled.
          offerApp()
        })
      } catch (err) {
        refuse(err.message || (isLogin ? "登录失败" : "注册失败"),
          err.message ? "" : (isLogin ? "SIGN-IN REFUSED" : "REGISTRATION REFUSED"))
        submit.disabled = false
        submit.replaceChildren(label)
        const pw = form.querySelector("[name=password]")
        if (pw) { pw.value = ""; pw.focus() }
      }
    })

    toggle.addEventListener("click", () => {
      if (tame) { mode = isLogin ? "register" : "login"; draw(); return }
      // Wipe the current form out to the right first; the new one comes back
      // through the same mask from the left.
      form.setAttribute("data-on", "0")
      wait(() => { mode = isLogin ? "register" : "login"; draw(true) }, 260)
    })

    settle()
    pane.append(form)
    void form.offsetWidth
    form.setAttribute("data-on", "1")
    if (replay) form.classList.add("term__form--again")
  }

  /** The payoff: the conduit floods, the panel shuts, a sheet crosses. */
  function depart(then) {
    cdt.surge()
    view.setAttribute("data-out", "1")
    wait(() => { if (!dead) then() }, EXIT_MS)
  }

  draw()

  return {
    destroy() {
      dead = true
      timers.forEach(clearTimeout)
      trk.destroy()
      cdt.destroy()
    }
  }
}
