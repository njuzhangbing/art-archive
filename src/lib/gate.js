/**
 * Which parts of the archive are open right now.
 *
 * A temporary shutter, kept in one place so it can be raised again by editing
 * one line. A path outside this list is answered with a refusal before the
 * router does anything else — before the session is waited on, before the view
 * module is fetched, before that view makes a single request. Closing a section
 * therefore also stops all of its traffic, which is the point of closing it.
 *
 * `/login` and `/me` stay open on purpose: a reader who cannot sign in or sign
 * out is stuck, not merely limited.
 */
export const OPEN = [
  "/",         // the cover
  "/login",
  "/me",
  "/blog"      // and everything under it
]

/** True when this path is one of the sections still open. */
export function isOpen(path) {
  return OPEN.some((p) => (p === "/" ? path === "/" : path === p || path.startsWith(p + "/")))
}
