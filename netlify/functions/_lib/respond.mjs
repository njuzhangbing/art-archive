export function json(data, init = {}) {
  const headers = { "content-type": "application/json; charset=utf-8", ...(init.headers || {}) }
  return new Response(JSON.stringify(data), { status: init.status || 200, headers })
}

export function oops(message, status = 400, extra = {}) {
  return json({ error: message, ...extra }, { status })
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
