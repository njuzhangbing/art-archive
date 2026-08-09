import { scrypt as scryptCb, randomBytes, timingSafeEqual } from "node:crypto"
import { promisify } from "node:util"
import { SignJWT, jwtVerify } from "jose"
import { store } from "./store.mjs"
import { readCookies, freshId } from "./respond.mjs"

const scrypt = promisify(scryptCb)
const keyBytes = new TextEncoder().encode(process.env.AUTH_SECRET || "changshengtian-tengri-dev-key-swap-me")

export async function hashPass(pw) {
  const salt = randomBytes(16)
  const dk = await scrypt(pw, salt, 32)
  return salt.toString("hex") + ":" + Buffer.from(dk).toString("hex")
}

export async function checkPass(pw, stored) {
  if (!stored || !stored.includes(":")) return false
  const [saltHex, dkHex] = stored.split(":")
  const dk = await scrypt(pw, Buffer.from(saltHex, "hex"), 32)
  const want = Buffer.from(dkHex, "hex")
  return dk.length === want.length && timingSafeEqual(dk, want)
}

export async function signSession(user) {
  return new SignJWT({ uid: user.id, handle: user.handle, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(keyBytes)
}

export async function readSession(req) {
  // The website sends the HttpOnly cookie. The Android build has no usable
  // cookie jar across origins, so it presents the same signed token as a
  // bearer instead — verified identically either way.
  const auth = req.headers.get("authorization") || ""
  const tok = auth.startsWith("Bearer ") ? auth.slice(7).trim() : readCookies(req).sess
  if (!tok) return null
  try { return (await jwtVerify(tok, keyBytes)).payload } catch { return null }
}

/**
 * Apply the standing promotion named by OWNER_HANDLE.
 *
 * It has to run everywhere a user object is handed to the client, not only on
 * /api/me. Sign-in used to skip it, so the very first answer a browser got
 * carried the stored role while every later one carried the promoted role —
 * which is why the archive's owner could sign in and find the admin controls
 * missing until the page was reloaded.
 */
export async function settle(u) {
  if (!u) return null
  const envOwner = (process.env.OWNER_HANDLE || "").trim().toLowerCase()
  if (envOwner && u.handleLower === envOwner && u.role !== "owner") {
    u.role = "owner"
    await store("users").setJSON("user/" + u.id, u)
  }
  return u
}

export async function currentUser(req) {
  const claim = await readSession(req)
  if (!claim) return null
  const u = await store("users").getJSON("user/" + claim.uid)
  if (!u || u.status !== "active") return null
  return settle(u)
}

export function shareable(u) {
  if (!u) return null
  const { passHash, handleLower, ...rest } = u
  return rest
}

export function isAdmin(u) {
  return !!u && (u.role === "admin" || u.role === "owner")
}

export function isOwner(u) {
  return !!u && u.role === "owner"
}

/**
 * Attempt counter for a bucket, e.g. failed logins for one handle.
 *
 * Each attempt is its own blob rather than an increment of a shared counter:
 * a counter has to be read before it is written, so a burst of parallel guesses
 * all read the same low number and the gate lets every one of them through —
 * exactly the traffic it exists to stop. Keys carry their own timestamp, so the
 * window is counted straight off the key listing without reading the blobs.
 */
const rateKey = (bucket) => "hit/" + bucket + "/"

export async function rateGate(bucket, max = 8, windowMs = 10 * 60 * 1000) {
  const rl = store("ratelimit")
  const base = rateKey(bucket)
  const now = Date.now()
  const mine = String(now).padStart(15, "0") + "-" + freshId(4)
  await rl.setJSON(base + mine, { at: now })

  const idx = await rl.list({ prefix: base })
  const live = idx.blobs
    .map((b) => b.key.slice(base.length))
    .filter((k) => {
      const t = Number(k.split("-")[0])
      return !Number.isNaN(t) && now - t <= windowMs
    })

  // Attempts fired in parallel all see each other, so counting the whole window
  // would turn any burst into a blanket denial. Zero-padded stamps sort in real
  // order, so each attempt instead counts the ones queued ahead of it — every
  // caller derives the same ranking, and the first `max` through still pass.
  const rank = live.filter((k) => k <= mine).length
  if (idx.blobs.length - live.length > 20) await pruneRate(rl, base, now, windowMs)

  return rank <= max
}

async function pruneRate(rl, base, now, windowMs) {
  const idx = await rl.list({ prefix: base })
  for (const b of idx.blobs) {
    const t = Number(b.key.slice(base.length).split("-")[0])
    if (!Number.isNaN(t) && now - t > windowMs) await rl.delete(b.key)
  }
}

export async function clearRate(bucket) {
  const rl = store("ratelimit")
  const idx = await rl.list({ prefix: rateKey(bucket) })
  await Promise.all(idx.blobs.map((b) => rl.delete(b.key)))
}
