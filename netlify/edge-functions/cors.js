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

  // Only the app's preflight is answered here. Anything else asking OPTIONS is
  // passed through rather than refused — this layer sits in front of every API
  // call on the site and is not the place to invent a new way to fail.
  if (ok && request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: allow(origin) })
  }

  const res = await context.next()
  if (!ok) return res
  try {
    // Headers on a response that has already been produced are sealed, so the
    // allow has to go onto a copy.
    const out = new Response(res.body, res)
    const headers = allow(origin)
    for (const k in headers) out.headers.set(k, headers[k])
    return out
  } catch (err) {
    // A failure here costs the app its cross-origin access. Taking the whole
    // API down with it would cost everyone else the site.
    console.error("cors: could not re-wrap response", err)
    return res
  }
}

export const config = { path: "/api/*" }
