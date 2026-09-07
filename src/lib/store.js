const seat = { me: undefined }
const watchers = new Set()

/**
 * The last identity this browser was told about.
 *
 * Kept so a page load does not have to reach the server before it can show
 * anything. The archive's whole front end used to wait on /api/me: one failed
 * call — a tunnel, a dropped packet, a slow cold start — and every guarded
 * route had nothing to go on, so the entire site became unreachable until the
 * reader happened to reload at a better moment.
 *
 * This grants nothing. It is a name, a role and an avatar for drawing the
 * chrome; every request is still authorised by the server against the cookie or
 * the bearer token, and a stale role here only decides which buttons get drawn,
 * never what the server will do. If the server later says the session is over,
 * the memory is dropped and the reader is sent to sign in.
 */
const SEAT_KEY = "tengri.seat"
const SEAT_LIFE = 30 * 24 * 60 * 60 * 1000

export function recall() {
  try {
    const raw = localStorage.getItem(SEAT_KEY)
    if (!raw) return null
    const { at, user } = JSON.parse(raw)
    if (!user || !at || Date.now() - at > SEAT_LIFE) return null
    return user
  } catch { return null }
}

function remember(user) {
  try {
    if (user) localStorage.setItem(SEAT_KEY, JSON.stringify({ at: Date.now(), user }))
    else localStorage.removeItem(SEAT_KEY)
  } catch { /* private mode; the session simply will not survive a reload */ }
}

export const session = {
  get me() { return seat.me },
  get ready() { return seat.me !== undefined },
  /**
   * @param {object|null} user
   * @param {{offline?: boolean}} [how] why there is no user, when there is none
   */
  set(user, how) {
    seat.me = user || null
    // Remembered so the guard can tell "not signed in" from "could not ask".
    seat.offline = !seat.me && !!(how && how.offline)
    // An unreachable server is not evidence about who the reader is, so it must
    // not wipe what we already knew — otherwise a tunnel signs everybody out.
    if (!seat.offline) remember(seat.me)
    watchers.forEach((fn) => { try { fn(seat.me) } catch (e) { console.error(e) } })
  },
  get offline() { return !!seat.offline },
  sub(fn) { watchers.add(fn); return () => watchers.delete(fn) }
}

export function isAdmin() {
  return !!(seat.me && (seat.me.role === "admin" || seat.me.role === "owner"))
}

export function isOwner() {
  return !!(seat.me && seat.me.role === "owner")
}
