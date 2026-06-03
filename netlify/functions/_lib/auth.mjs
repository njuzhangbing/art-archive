import { scrypt as scryptCb, randomBytes, timingSafeEqual } from "node:crypto"
import { promisify } from "node:util"
import { SignJWT, jwtVerify } from "jose"
import { store } from "./store.mjs"
import { readCookies } from "./respond.mjs"

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
  const tok = readCookies(req).sess
  if (!tok) return null
  try { return (await jwtVerify(tok, keyBytes)).payload } catch { return null }
}

export async function currentUser(req) {
  const claim = await readSession(req)
  if (!claim) return null
  const u = await store("users").getJSON("user/" + claim.uid)
  return u && u.status === "active" ? u : null
}

export function shareable(u) {
  if (!u) return null
  const { passHash, handleLower, ...rest } = u
  return rest
}

export async function rateGate(bucket, max = 8, windowMs = 10 * 60 * 1000) {
  const rl = store("ratelimit")
  const now = Date.now()
  const cur = (await rl.getJSON(bucket)) || { n: 0, t: now }
  if (now - cur.t > windowMs) { cur.n = 0; cur.t = now }
  cur.n += 1
  await rl.setJSON(bucket, cur)
  return cur.n <= max
}

export async function clearRate(bucket) {
  await store("ratelimit").delete(bucket)
}
