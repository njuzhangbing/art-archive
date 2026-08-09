import { h } from "../lib/dom.js"

/**
 * Faint directory listings drifting behind the cover sheet.
 *
 * They are drawn from the archive's real holdings rather than from invented
 * filler, so what shows through the page is the collection indexing itself —
 * branches opening and closing, a cursor working down the listing. Kept far
 * enough back that it reads as watermark rather than as content, and inert to
 * the pointer so it never gets in the way of the page proper.
 */

const tame = matchMedia("(prefers-reduced-motion: reduce)").matches

const TICK_MS = 1700

function leaf(label) { return { label } }
function dir(label, children, open = true) { return { label: label + "/", children, open } }

/** Flatten a node into printable lines with box-drawing gutters. */
function lines(node, prefix, last, out, depth = 0) {
  const isRoot = depth === 0
  if (isRoot) out.push({ text: node.label, node })
  else out.push({ text: prefix + (last ? "└── " : "├── ") + node.label, node })

  if (!node.children || !node.open) return out
  const nextPrefix = isRoot ? "" : prefix + (last ? "    " : "│   ")
  node.children.forEach((c, i) => lines(c, nextPrefix, i === node.children.length - 1, out, depth + 1))
  return out
}

function collapsibles(node, acc = []) {
  if (node.children && node.children.length) acc.push(node)
  if (node.children) node.children.forEach((c) => collapsibles(c, acc))
  return acc
}

function trim(s, n) {
  const t = String(s || "").trim()
  return t.length > n ? t.slice(0, n - 1) + "…" : t
}

/** Build the three listings out of whatever the archive currently holds. */
function buildTrees(data) {
  const projects = (data.projects || []).slice(0, 6)
  const characters = (data.characters || []).slice(0, 6)
  const posts = (data.posts || []).slice(0, 5)

  const works = dir("作品档案", projects.length
    ? projects.map((p) => dir(trim(p.title, 14), [
      leaf("class " + (p.sec === "SECRET" ? "closed" : "open")),
      leaf("versions " + (p.versions ?? 0)),
      leaf("updated " + String(p.updatedAt || "").slice(0, 10))
    ], false))
    : [leaf("(空)")])

  const roster = dir("角色名录", characters.length
    ? characters.map((c) => dir(trim(c.name, 12) + " " + (c.code || ""), [
      leaf("class " + (c.sec === "SECRET" ? "closed" : "open")),
      leaf("persona " + (c.persona || "FULL"))
    ], false))
    : [leaf("(空)")])

  const bulletin = dir("文告", posts.length ? posts.map((p) => leaf(trim(p.title, 18))) : [leaf("(空)")])

  const system = dir("系统", [
    dir("索引", [leaf("projects.idx"), leaf("characters.idx"), leaf("posts.idx"), leaf("versions.idx")], false),
    dir("保管", [leaf("retention permanent"), leaf("classification internal")], false),
    leaf("checksum.log")
  ])

  const intake = dir("待归档", [
    dir("扫描", [leaf("scan-0001.tif"), leaf("scan-0002.tif"), leaf("scan-0003.tif")], false),
    dir("校对", [leaf("proof-a.diff"), leaf("proof-b.diff")], false),
    leaf("index.lock")
  ])

  return [
    { root: dir("中央档案库", [works]), cls: "ft--a" },
    { root: dir("登记", [roster, bulletin]), cls: "ft--b" },
    { root: dir("卷宗", [intake]), cls: "ft--c" },
    { root: dir("系统", [system]), cls: "ft--d" }
  ]
}

export function fileTrees(data = {}) {
  const layer = h("div", { class: "ftlayer", "aria-hidden": "true" })
  const trees = buildTrees(data)

  const panes = trees.map((t) => {
    const pre = h("pre", { class: "ft " + t.cls })
    layer.append(pre)
    return { ...t, pre, cursor: 0 }
  })

  function paint(pane) {
    const rows = lines(pane.root, "", true, [])
    pane.pre.textContent = rows
      .map((r, i) => (i === pane.cursor ? "▸" + r.text : " " + r.text))
      .join("\n")
    return rows.length
  }

  panes.forEach(paint)

  let timer = null
  let step = 0

  function tick() {
    // Two beats out of three just walk the cursor down; the third opens or
    // closes a branch, so the listing keeps changing shape without thrashing.
    const pane = panes[step % panes.length]
    const rows = lines(pane.root, "", true, []).length
    if (step % 3 === 2) {
      const folders = collapsibles(pane.root).slice(1)
      if (folders.length) {
        const pick = folders[Math.floor(Math.random() * folders.length)]
        pick.open = !pick.open
      }
    } else {
      pane.cursor = (pane.cursor + 1 + Math.floor(Math.random() * 2)) % Math.max(1, rows)
    }
    paint(pane)
    step++
  }

  function play() {
    if (timer || tame) return
    timer = setInterval(tick, TICK_MS)
  }
  function pause() {
    if (!timer) return
    clearInterval(timer)
    timer = null
  }

  // Nothing to animate while the tab is in the background.
  const onVis = () => (document.hidden ? pause() : play())
  document.addEventListener("visibilitychange", onVis)
  play()

  return {
    el: layer,
    /** Re-seed once the archive's real contents arrive. */
    update(next) {
      const rebuilt = buildTrees(next)
      panes.forEach((p, i) => { if (rebuilt[i]) p.root = rebuilt[i].root })
      panes.forEach(paint)
    },
    destroy() {
      pause()
      document.removeEventListener("visibilitychange", onVis)
    }
  }
}
