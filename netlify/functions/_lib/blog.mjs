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

export function postDigest(p, me) {
  const mine = me ? (p.authorId === me.id || isAdmin(me)) : false
  return {
    id: p.id, title: p.title, author: p.authorHandle, authorId: p.authorId,
    pinned: !!p.pinned, hidden: !!p.hidden,
    kind: p.kind === "announcement" ? "announcement" : "post",
    level: LEVELS.includes(p.level) ? p.level : "normal",
    seriesId: p.seriesId || null,
    commentsLocked: !!p.commentsLocked,
    excerpt: excerpt(p.body),
    createdAt: p.createdAt, updatedAt: p.updatedAt,
    canEdit: mine, isAdmin: me ? isAdmin(me) : false
  }
}
