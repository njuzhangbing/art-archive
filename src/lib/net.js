/**
 * Where the archive actually lives, as far as this build is concerned.
 *
 * On the web the pages and the API are the same origin and this is all inert —
 * `BASE` is empty, every path stays relative, and the session rides an HttpOnly
 * cookie the way it always has.
 *
 * In the Android build the pages are bundled into the APK and served by the
 * WebView from its own asset domain, so every call has to be sent across to the
 * deployed site. Cookies do not survive that trip on Android — the WebView treats them
 * as third-party — so the native build carries the session as a bearer token
 * instead, kept in app storage that no web page can reach.
 */

/** Set at build time by `npm run build:app`; empty for the website. */
export const BASE = (import.meta.env.VITE_API_BASE || "").replace(/\/+$/, "")

/** True when this bundle is talking to a server on another origin. */
export const remote = !!BASE

/** Absolute-ise a root-relative archive URL. Inert on the web. */
export function asset(u) {
  if (!remote || typeof u !== "string") return u
  return u.startsWith("/") && !u.startsWith("//") ? BASE + u : u
}

/**
 * Server payloads carry media paths of their own — portrait URLs, covers,
 * attachments. Rewriting them here means call sites never have to know which
 * build they are running in.
 */
export function absolve(v) {
  if (!remote || v == null) return v
  if (typeof v === "string") return v.startsWith("/media/") ? BASE + v : v
  if (Array.isArray(v)) return v.map(absolve)
  if (typeof v === "object") {
    for (const k in v) v[k] = absolve(v[k])
    return v
  }
  return v
}

const KEY = "tengri.sess"

/**
 * The native session. Never populated on the web: the server only hands a token
 * to a request whose Origin is the app's, so an injected script on the site
 * cannot ask for one.
 */
export const bearer = {
  get() {
    if (!remote) return null
    try { return localStorage.getItem(KEY) } catch { return null }
  },
  set(t) {
    if (!remote || !t) return
    try { localStorage.setItem(KEY, t) } catch { /* private mode */ }
  },
  clear() {
    try { localStorage.removeItem(KEY) } catch { /* nothing to do */ }
  }
}
