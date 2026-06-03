export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message || "请求失败")
    this.status = status
    this.payload = payload
  }
}

async function hit(method, url, body, asForm) {
  const opts = { method, headers: {}, credentials: "same-origin" }
  if (body != null) {
    if (asForm) opts.body = body
    else { opts.headers["content-type"] = "application/json"; opts.body = JSON.stringify(body) }
  }
  const res = await fetch(url, opts)
  const ct = res.headers.get("content-type") || ""
  const data = ct.includes("application/json") ? await res.json().catch(() => null) : await res.text()
  if (!res.ok) throw new ApiError(data && data.error, res.status, data)
  return data
}

export const api = {
  get: (u) => hit("GET", u),
  post: (u, b) => hit("POST", u, b),
  patch: (u, b) => hit("PATCH", u, b),
  del: (u) => hit("DELETE", u),
  postForm: (u, fd) => hit("POST", u, fd, true)
}
