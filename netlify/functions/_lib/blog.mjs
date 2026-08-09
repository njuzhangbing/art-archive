import { isAdmin } from "./auth.mjs"
export function excerpt(md, n = 150) {
  return String(md || "")
    .replace(/\[\[[注引]:[^\]]+\]\]/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#>*`_~]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, n)
}

const LEVELS = ["normal", "important", "urgent"]

// The viewer-independent half of a post digest. This is what the list index
// caches, so it must not depend on who is asking — and it drops the body, which
// can run to 50KB a post and is never rendered on a list page.
export function postRow(p) {
  return {
    id: p.id, title: p.title, author: p.authorHandle, authorId: p.authorId,
    pinned: !!p.pinned, hidden: !!p.hidden,
    kind: p.kind === "announcement" ? "announcement" : "post",
    level: LEVELS.includes(p.level) ? p.level : "normal",
    seriesId: p.seriesId || null,
    commentsLocked: !!p.commentsLocked,
    excerpt: excerpt(p.body),
    createdAt: p.createdAt, updatedAt: p.updatedAt
  }
}

export function forViewer(row, me) {
  const mine = me ? (row.authorId === me.id || isAdmin(me)) : false
  return { ...row, canEdit: mine, isAdmin: me ? isAdmin(me) : false }
}

export function postDigest(p, me) {
  return forViewer(postRow(p), me)
}
