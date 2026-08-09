const seat = { me: undefined }
const watchers = new Set()

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
