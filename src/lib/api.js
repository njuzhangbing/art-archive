import { BASE, remote, bearer, absolve } from "./net.js"

export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message || "请求失败")
    this.status = status
    this.payload = payload
  }
}

/**
 * The request never reached the archive.
 *
 * Worth its own type: a server answering "no" and a server that could not be
 * asked are different facts, and callers that treat them alike end up telling a
 * reader they are signed out because a train went into a tunnel.
 */
export class Offline extends Error {
  constructor(cause) {
    super("连不上服务器")
    this.status = 0
    this.cause = cause
  }
}

const nap = (ms) => new Promise((done) => setTimeout(done, ms))

async function hit(method, url, body, asForm) {
  const opts = { method, headers: {}, credentials: remote ? "include" : "same-origin" }
  // The native build has no usable cookie jar, so it presents the session it
  // was handed at sign-in instead.
  const tok = bearer.get()
  if (tok) opts.headers.authorization = "Bearer " + tok
  if (body != null) {
    if (asForm) opts.body = body
    else { opts.headers["content-type"] = "application/json"; opts.body = JSON.stringify(body) }
  }
  // A read that fails at the network layer is retried once — most blips are a
  // single packet, and a GET can always be asked again. Writes are never
  // retried here: this layer cannot know whether the first one landed.
  const target = url.startsWith("/") ? BASE + url : url
  let res
  for (let attempt = 0; ; attempt++) {
    try { res = await fetch(target, opts); break }
    catch (err) {
      if (method !== "GET" || attempt > 0) throw new Offline(err)
      await nap(350)
    }
  }
  const ct = res.headers.get("content-type") || ""
  const data = ct.includes("application/json") ? await res.json().catch(() => null) : await res.text()
  if (!res.ok) throw new ApiError(data && data.error, res.status, data)
  return absolve(data)
}

export const api = {
  get: (u) => hit("GET", u),
  post: (u, b) => hit("POST", u, b),
  patch: (u, b) => hit("PATCH", u, b),
  del: (u) => hit("DELETE", u),
  postForm: (u, fd) => hit("POST", u, fd, true)
}
