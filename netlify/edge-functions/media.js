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
      "cache-control": "public, max-age=86400"
    }
  })
}

export const config = { path: "/media/*" }
