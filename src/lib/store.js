const seat = { me: undefined }
const watchers = new Set()

export const session = {
  get me() { return seat.me },
  get ready() { return seat.me !== undefined },
  set(user) {
    seat.me = user || null
    watchers.forEach((fn) => { try { fn(seat.me) } catch (e) { console.error(e) } })
  },
  sub(fn) { watchers.add(fn); return () => watchers.delete(fn) }
}

export function isAdmin() {
  return !!(seat.me && seat.me.role === "admin")
}
