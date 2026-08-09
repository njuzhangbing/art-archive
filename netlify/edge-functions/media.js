import { getStore } from "@netlify/blobs"

export default async (request) => {
  const url = new URL(request.url)
  const key = decodeURIComponent(url.pathname.slice("/media/".length))
  if (!key) return new Response("bad key", { status: 400 })
  const files = getStore("files")
  const meta = await files.getMetadata(key)
  if (!meta) return new Response("missing", { status: 404 })
  const stream = await files.get(key, { type: "stream" })
  return new Response(stream, {
    headers: {
      "content-type": (meta.metadata && meta.metadata.contentType) || "application/octet-stream",
      // Keys are random and a stored file is never rewritten under the same
      // one — a new upload gets a new key — so this can be cached for good
      // instead of being revalidated once a day.
      "cache-control": "public, max-age=31536000, immutable",
      // An <img> needs nothing, but the export tool reads these with fetch, and
      // in the Android build that is a cross-origin read. Files here are public
      // by key alone, so a blanket allow costs nothing.
      "access-control-allow-origin": "*",
      ...(meta.etag ? { etag: meta.etag } : {})
    }
  })
}

export const config = { path: "/media/*" }
