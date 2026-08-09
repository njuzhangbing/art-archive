/**
 * Cross-origin access for the Android build, and for nothing else.
 *
 * The website is served from the same origin as the API and never goes near
 * this. The app's pages are bundled into the APK and served by the WebView over
 * androidx's asset domain, so every call it makes is cross-origin and needs both
 * a preflight answer and an explicit allow on the response.
 *
 * The allow list is exact. Reflecting whatever Origin arrives — the usual
 * shortcut — would let any site on the internet make credentialed calls against
 * a signed-in reader's session.
 */

const ALLOWED = new Set(["https://appassets.androidplatform.net"])

function allow(origin) {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "access-control-allow-headers": "content-type, authorization",
    "access-control-max-age": "86400",
    // The same path answers the website too, and that answer must not be
    // handed to the app from a cache keyed only on the URL.
    vary: "Origin"
  }
}

export default async (request, context) => {
  const origin = request.headers.get("origin") || ""
  const ok = ALLOWED.has(origin)

  if (request.method === "OPTIONS") {
    return ok
      ? new Response(null, { status: 204, headers: allow(origin) })
      : new Response(null, { status: 403 })
  }

  const res = await context.next()
  if (!ok) return res
  const out = new Response(res.body, res)
  const headers = allow(origin)
  for (const k in headers) out.headers.set(k, headers[k])
  return out
}

export const config = { path: "/api/*" }
