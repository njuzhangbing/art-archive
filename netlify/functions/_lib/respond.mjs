export function json(data, init = {}) {
  const headers = { "content-type": "application/json; charset=utf-8", ...(init.headers || {}) }
  return new Response(JSON.stringify(data), { status: init.status || 200, headers })
}

export function oops(message, status = 400, extra = {}) {
  return json({ error: message, ...extra }, { status })
}

/**
 * The origin the Android build talks from. The APK carries the pages inside it
 * and the WebView serves them over androidx's asset domain, so a request under
 * that origin is the app rather than the website — which is what lets a session
 * token be handed to the app and to nothing else.
 *
 * Exactly one entry, on purpose. Reflecting whatever Origin turns up would let
 * any site on the internet make credentialed calls with a reader's session.
 */
export const NATIVE_ORIGINS = new Set(["https://appassets.androidplatform.net"])

export function isNative(req) {
  return NATIVE_ORIGINS.has(req.headers.get("origin") || "")
}

export function readCookies(req) {
  const raw = req.headers.get("cookie") || ""
  const jar = {}
  for (const piece of raw.split(";")) {
    const i = piece.indexOf("=")
    if (i > 0) jar[piece.slice(0, i).trim()] = decodeURIComponent(piece.slice(i + 1).trim())
  }
  return jar
}

export function bakeCookie(name, value, opts = {}) {
  const secure = !!(process.env.NETLIFY_BLOBS_CONTEXT || process.env.NETLIFY)
  const bits = [`${name}=${opts.clear ? "" : encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Lax"]
  if (secure) bits.push("Secure")
  bits.push(`Max-Age=${opts.clear ? 0 : (opts.maxAge ?? 60 * 60 * 24 * 30)}`)
  return bits.join("; ")
}

export function freshId(len = 16) {
  const bytes = new Uint8Array(len)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}
