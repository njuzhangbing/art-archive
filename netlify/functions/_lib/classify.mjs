import { isAdmin } from "./auth.mjs"

/**
 * Secrecy, and how records written under the old scheme are read.
 *
 * A record is either open to every member or closed to all but its owner and
 * the admins. It replaces the five-tier grade (ALEPH · WAW · HE · TETH · ZAYIN)
 * and the four damage types, neither of which gated anything.
 *
 * Compatibility matters here because the deployed archive already holds records
 * written under the old scheme. Nothing is migrated in place: the old fields are
 * simply read as PUBLIC.
 *
 * That is the safe reading rather than the clever one. The old grade was a
 * label, not a permission — every signed-in member could open every record
 * whatever its grade — so treating those records as public preserves exactly
 * the access they already had. Inferring SECRET from a high grade would
 * retroactively hide work nobody ever asked to hide, and on a shared archive
 * that is the more damaging way to be wrong.
 */

export const SECRECY = ["PUBLIC", "SECRET"]

export const SECRECY_LABEL = {
  PUBLIC: { zh: "公开", en: "OPEN" },
  SECRET: { zh: "保密", en: "CLOSED" }
}

/** The secrecy of a stored record, defaulting legacy rows to open. */
export function secrecyOf(doc) {
  return doc && doc.sec === "SECRET" ? "SECRET" : "PUBLIC"
}

/** Normalise whatever a client sent into a storable value. */
export function cleanSecrecy(raw, fallback = "PUBLIC") {
  return SECRECY.includes(raw) ? raw : fallback
}

/** Whether this viewer may see a closed record in full. */
export function canRead(doc, me) {
  if (secrecyOf(doc) === "PUBLIC") return true
  if (!me) return false
  if (isAdmin(me)) return true
  return doc.ownerId === me.id || doc.authorId === me.id
}

/**
 * Blank the parts of a closed record a viewer is not cleared for.
 *
 * The record still comes back — the reader is told the file exists and that it
 * is closed, which is the point — but every field that carries content is
 * replaced rather than merely hidden by the page. A viewer who cannot read it
 * never receives it.
 */
export function redactFor(row, me, fields = ["desc", "body", "excerpt"]) {
  if (canRead(row, me)) return { ...row, redacted: false }
  const out = { ...row, redacted: true, sec: "SECRET" }
  fields.forEach((f) => { if (f in out) out[f] = "" })
  // Cover art gives away as much as the text does.
  if ("coverUrl" in out) out.coverUrl = null
  if ("portraits" in out) out.portraits = []
  return out
}
