export function fmtAgo(ts) {
  if (!ts) return "—"
  const ms = typeof ts === "number" ? ts : Date.parse(ts)
  if (Number.isNaN(ms)) return "—"
  const s = Math.max(1, (Date.now() - ms) / 1000)
  if (s < 60) return Math.floor(s) + " 秒前"
  if (s < 3600) return Math.floor(s / 60) + " 分前"
  if (s < 86400) return Math.floor(s / 3600) + " 时前"
  if (s < 2592000) return Math.floor(s / 86400) + " 天前"
  return new Date(ms).toLocaleDateString("zh-CN")
}

export function fmtNum(n) {
  return Number(n || 0).toLocaleString("en-US")
}

export function fmtBytes(n) {
  if (!n) return "0 B"
  const u = ["B", "KB", "MB", "GB"]
  let i = 0
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++ }
  return (i === 0 ? n : n.toFixed(n < 10 ? 1 : 0)) + " " + u[i]
}

export function fmtDate(ts) {
  const ms = typeof ts === "number" ? ts : Date.parse(ts)
  if (Number.isNaN(ms)) return "—"
  return new Date(ms).toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
}

export function slugish() {
  return Math.random().toString(36).slice(2, 8)
}
