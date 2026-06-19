import { h, clear } from "../lib/dom.js"
import { fmtBytes } from "../lib/fmt.js"
import { pinLayer } from "./pins.js"

export function assetStage(version, opts = {}) {
  const assets = version.assets || []
  let cur = assets.find((a) => a.id === version.coverAssetId) || assets[0]
  const project = opts.project || null
  let activePins = null

  const stage = h("div", { class: "stage__main" })
  const side = h("div", { class: "stage__side" })
  const strip = h("div", { class: "stage__strip" })
  const wrap = h("div", { class: "stage" }, h("div", { class: "stage__view" }, stage, side), strip)

  function syncStrip() {
    for (const c of strip.children) c.setAttribute("data-on", c.dataset.id === cur.id ? "1" : "0")
  }

  function layerRow(l) {
    return h("div", { class: "lrow" + (l.hidden ? " lrow--off" : "") },
      l.thumbUrl ? h("img", { src: l.thumbUrl, loading: "lazy", alt: l.name }) : h("div", { class: "lrow__noimg mono" }, "—"),
      h("div", { class: "lrow__name" }, l.name),
      h("div", { class: "lrow__op mono tiny" }, l.hidden ? "隐藏" : Math.round((l.opacity == null ? 1 : l.opacity) * 100) + "%")
    )
  }

  function draw() {
    if (activePins) { activePins.destroy(); activePins = null }
    clear(stage)
    clear(side)
    if (!cur) { stage.append(h("div", { class: "muted mono" }, "无资源")); return }

    if (cur.kind === "video") {
      stage.append(h("video", { class: "stage__vid", src: cur.originalUrl, controls: true, poster: cur.posterUrl || "", playsinline: true }))
    } else if (project) {
      const canvas = h("div", { class: "stage__canvas" },
        h("img", { class: "stage__img", src: cur.previewUrl || cur.originalUrl, alt: cur.filename }))
      activePins = pinLayer({ projectId: project.id, versionId: version.id, assetId: cur.id })
      canvas.append(activePins.el)
      stage.append(canvas)
    } else {
      stage.append(h("a", { class: "stage__link", href: cur.originalUrl, target: "_blank", title: "打开原始文件" },
        h("img", { class: "stage__img", src: cur.previewUrl || cur.originalUrl, alt: cur.filename })))
    }

    side.append(h("div", { class: "stage__meta mono tiny" },
      h("span", {}, cur.kind.toUpperCase()),
      cur.w ? h("span", { class: "dotsep" }, cur.w + "×" + cur.h) : null,
      cur.bytes ? h("span", { class: "dotsep" }, fmtBytes(cur.bytes)) : null
    ))
    side.append(h("a", { class: "btn btn--sm", href: cur.originalUrl, target: "_blank", style: "margin-top:12px" }, "下载原始文件"))

    if (cur.kind === "psd" && cur.layers && cur.layers.length) {
      side.append(h("div", { class: "layers" },
        h("div", { class: "layers__head kicker" }, "Layers · 图层 " + cur.layers.length),
        h("div", { class: "layers__list" }, ...cur.layers.map(layerRow))
      ))
    }
    syncStrip()
  }

  for (const a of assets) {
    const t = h("button", { class: "sthumb", "data-id": a.id, title: a.filename },
      a.kind === "video"
        ? h("div", { class: "sthumb__v mono" }, "▶")
        : h("img", { src: a.previewUrl || a.posterUrl || a.originalUrl, loading: "lazy", alt: a.filename }),
      a.kind === "psd" ? h("span", { class: "sthumb__tag mono" }, "PSD") : null
    )
    t.addEventListener("click", () => { cur = a; draw() })
    strip.append(t)
  }
  if (assets.length <= 1) strip.style.display = "none"

  draw()
  return wrap
}
