import { h, bi } from "../lib/dom.js"
import { remote } from "../lib/net.js"

/**
 * Mention the Android build, once, to someone who could actually install it.
 *
 * Shown after a sign-in on the website and nowhere else. Not inside the app —
 * it is the app — and not on iOS or a desktop, where an APK is a file that
 * cannot be opened; offering someone a download they have no use for is worse
 * than saying nothing.
 *
 * Asked once. Whether they take it or wave it away, it is remembered and does
 * not come back.
 */

const KEY = "tengri.appcard"
const APK = "/app/tengri-archive.apk"
const tame = matchMedia("(prefers-reduced-motion: reduce)").matches

function asked() {
  try { return localStorage.getItem(KEY) === "1" } catch { return true }
}

function remember() {
  try { localStorage.setItem(KEY, "1") } catch { /* private mode; it will ask again */ }
}

/** True when this reader is on the website, on a device the APK installs on. */
function worthAsking() {
  if (remote) return false                       // already inside the app
  if (asked()) return false
  return /\bAndroid\b/i.test(navigator.userAgent)
}

/**
 * Offer the app, if there is anything to offer.
 * @param {number} [delay] ms to wait, so it lands after the page transition
 */
export function offerApp(delay = 900) {
  if (!worthAsking()) return
  setTimeout(() => { if (worthAsking()) show() }, tame ? 0 : delay)
}

function show() {
  const card = h("div", { class: "appcard", role: "dialog", "aria-label": "安卓 App" })

  const close = () => {
    remember()
    card.setAttribute("data-on", "0")
    setTimeout(() => card.remove(), tame ? 0 : 320)
  }

  const get = h("a", {
    class: "appcard__get", href: APK, download: "tengri-archive.apk"
  }, bi("下载 APK", "DOWNLOAD"))
  // The download navigates nothing, so the card would otherwise sit there after
  // the file starts; close it on the way out.
  get.addEventListener("click", () => setTimeout(close, 400))

  card.append(
    h("div", { class: "appcard__in" },
      h("div", { class: "appcard__seal" }, "天"),
      h("div", { class: "appcard__body" },
        h("div", { class: "appcard__title" }, bi("长生天档案库", "ANDROID APP")),
        h("p", { class: "appcard__note" }, "整站随包安装，开机即出画面，弱网也能看；改版后自己更新，不用重装。")),
      h("button", { class: "appcard__no", type: "button", onClick: close, "aria-label": "关闭" }, "×")),
    h("div", { class: "appcard__acts" }, get,
      h("button", { class: "appcard__later", type: "button", onClick: close }, "以后再说"))
  )

  document.body.append(card)
  // Flush layout so the entrance has a start value; a frame callback would not
  // run in a backgrounded tab and the card would sit invisible.
  void card.offsetWidth
  card.setAttribute("data-on", "1")
}
