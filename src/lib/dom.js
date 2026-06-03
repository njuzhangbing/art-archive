export function h(tag, props, ...kids) {
  const el = document.createElement(tag)
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue
      if (k === "class") el.className = v
      else if (k === "html") el.innerHTML = v
      else if (k === "style") { if (typeof v === "string") el.style.cssText = v; else Object.assign(el.style, v) }
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v)
      else if (k === "ref" && typeof v === "function") v(el)
      else if (k in el && k !== "list" && k !== "form" && typeof v !== "boolean") { try { el[k] = v } catch { el.setAttribute(k, v) } }
      else if (v === true) el.setAttribute(k, "")
      else el.setAttribute(k, v)
    }
  }
  append(el, kids)
  return el
}

function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false || k === true) continue
    el.append(k.nodeType ? k : document.createTextNode(String(k)))
  }
}

export function clear(node) {
  while (node && node.firstChild) node.removeChild(node.firstChild)
  return node
}

export function frag(...kids) {
  const f = document.createDocumentFragment()
  append(f, kids)
  return f
}
