function esc(s) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]))
}

function safeUrl(u) {
  return /^(https?:\/\/|\/|mailto:|data:image\/)/i.test(u) ? u : "#"
}

function linkTag(text, url) {
  const u = safeUrl(url)
  if (u.startsWith("/")) return '<a href="' + u + '" data-link="1">' + text + "</a>"
  return '<a href="' + u + '" target="_blank" rel="noopener">' + text + "</a>"
}

function inline(s) {
  const slots = []
  const stash = (html) => { slots.push(html); return "xMRGz" + (slots.length - 1) + "zMRGx" }
  s = s
    .replace(/\[\[引:([A-Za-z0-9+/=]+)\]\]/g, (m, d) => stash('<span class="quoteref" data-q="' + d + '" tabindex="0">引</span>'))
    .replace(/\[\[注:([^\]]*)\]\]/g, (m, t) => stash('<sup class="anno" data-note="' + t.trim() + '" tabindex="0"></sup>'))
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, a, u) => '<img alt="' + a + '" src="' + safeUrl(u) + '">')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) => linkTag(t, u))
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
  return s.replace(/xMRGz(\d+)zMRGx/g, (m, i) => slots[+i])
}

export function mdToHtml(src) {
  const lines = esc(src || "").replace(/\r\n/g, "\n").split("\n")
  const out = []
  let list = null
  let para = []

  const flushPara = () => { if (para.length) { out.push("<p>" + inline(para.join(" ")) + "</p>"); para = [] } }
  const flushList = () => { if (list) { out.push("<" + list.tag + ">" + list.items.map((it) => "<li>" + inline(it) + "</li>").join("") + "</" + list.tag + ">"); list = null } }

  for (const raw of lines) {
    const line = raw.trimEnd()
    if (!line.trim()) { flushPara(); flushList(); continue }

    const head = line.match(/^(#{1,4})\s+(.*)$/)
    if (head) { flushPara(); flushList(); out.push("<h" + head[1].length + ">" + inline(head[2]) + "</h" + head[1].length + ">"); continue }

    if (/^(-{3,}|\*{3,})$/.test(line.trim())) { flushPara(); flushList(); out.push('<hr class="mdhr">'); continue }

    const quote = line.match(/^&gt;\s?(.*)$/)
    if (quote) { flushPara(); flushList(); out.push("<blockquote>" + inline(quote[1]) + "</blockquote>"); continue }

    const ul = line.match(/^[-*]\s+(.*)$/)
    const ol = line.match(/^\d+\.\s+(.*)$/)
    if (ul || ol) {
      flushPara()
      const tag = ul ? "ul" : "ol"
      if (!list || list.tag !== tag) { flushList(); list = { tag, items: [] } }
      list.items.push((ul ? ul[1] : ol[1]))
      continue
    }

    flushList()
    para.push(line.trim())
  }
  flushPara()
  flushList()
  return out.join("\n")
}
