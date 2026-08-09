import { secrecyOf } from "./classify.mjs"

/**
 * Viewer-independent projections of each record type.
 *
 * These are what the list indexes cache and hand to every reader alike, so
 * nothing in here may depend on the current user — fold in per-viewer fields
 * (starred, canEdit, isOwn) after the rows come back.
 */

export function projectRow(p) {
  return {
    id: p.id, title: p.title, desc: p.desc, sec: secrecyOf(p), tags: p.tags || [],
    ownerId: p.ownerId, author: p.ownerHandle,
    versions: (p.versionIds || []).length,
    coverUrl: p.coverKey ? "/media/" + p.coverKey : null,
    headVersionId: p.headVersionId || null,
    characters: p.characters || [],
    starCount: p.starCount || 0,
    createdAt: p.createdAt, updatedAt: p.updatedAt
  }
}

export function projectForViewer(row, me, starred) {
  return { ...row, starred: !!starred, isOwn: me ? row.ownerId === me.id : false }
}

export function charExcerpt(md, n = 130) {
  const t = String(md || "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s*[-+>*]\s+/gm, "")
    .replace(/[#`_~*]/g, "")
    .replace(/\s+/g, " ")
    .trim()
  return t.length > n ? t.slice(0, n) + "…" : t
}

export function characterDigest(c) {
  return {
    id: c.id, name: c.name, code: c.code, sec: secrecyOf(c),
    persona: c.persona || "FULL", experimental: !!c.experimental,
    mimicry: c.mimicry || "",
    owner: c.ownerHandle, ownerId: c.ownerId,
    coverUrl: c.coverKey ? "/media/" + c.coverKey : null,
    portraits: (c.portraits || []).map((p) => ({ id: p.id, key: p.key, url: "/media/" + p.key, w: p.w, h: p.h, filename: p.filename })),
    excerpt: charExcerpt(c.body),
    body: c.body || "", createdAt: c.createdAt, updatedAt: c.updatedAt
  }
}

// The roster only ever renders the excerpt, so the full entry — up to 20KB a
// character — stays out of the list payload and out of the index.
export function characterRow(c) {
  const { body, ...rest } = characterDigest(c)
  return rest
}
