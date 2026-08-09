/**
 * Secrecy, as the page speaks it.
 *
 * Replaces the five-tier grade and the four damage types with the only
 * distinction the archive actually enforces: a record is open to every member,
 * or it is closed and reaches uncleared readers struck out.
 *
 * Records written before this change carry no `sec` at all and read as open —
 * which is the access they already had, since the old grade never gated
 * anything.
 */

export const SECRECY = [
  { key: "PUBLIC", zh: "公开", en: "OPEN", note: "全体成员可阅" },
  { key: "SECRET", zh: "保密", en: "CLOSED", note: "仅本人与管理员" }
]

export const SECRECY_KEYS = SECRECY.map((s) => s.key)

export function secOf(key) {
  return SECRECY.find((s) => s.key === key) || SECRECY[0]
}

export function isSecret(row) {
  return !!row && row.sec === "SECRET"
}

/** True when the server sent this row with its contents withheld. */
export function isRedacted(row) {
  return !!row && row.redacted === true
}
