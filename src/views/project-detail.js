import { h, clear } from "../lib/dom.js"
import { api } from "../lib/api.js"
import { projectFormModal } from "../components/project-form.js"
import { uploadModal } from "../components/uploader.js"
import { assetStage } from "../components/viewer.js"
import { diffModal } from "../components/diff.js"
import { starButton } from "../components/star-button.js"
import { toast } from "../components/toast.js"
import { go } from "../router.js"
import { reveal, clearScroll } from "../lib/anim.js"
import { fmtAgo, fmtDate } from "../lib/fmt.js"

export default function projectDetail(root, params) {
  const view = h("div", { class: "wrap pdetail" }, h("div", { class: "muted mono", style: "padding:70px 0" }, "加载中…"))
  root.append(view)

  let project = null
  let versions = []
  let headId = null
  let canEdit = false
  let viewingId = null
  let charMap = {}

  async function boot() {
    try {
      const pr = await api.get("/api/projects/" + params.id)
      project = pr.project
      canEdit = pr.canEdit
      const vr = await api.get("/api/projects/" + params.id + "/versions")
      versions = vr.versions
      headId = vr.headVersionId
      viewingId = headId
      if ((project.characters || []).length) {
        const cr = await api.get("/api/characters").catch(() => ({ characters: [] }))
        cr.characters.forEach((c) => { charMap[c.id] = c })
      }
      render()
    } catch (err) {
      clear(view)
      view.append(notFound(err))
    }
  }

  function charRow() {
    const ids = (project.characters || []).filter((id) => charMap[id])
    if (!ids.length) return null
    return h("div", { class: "pd__chars" },
      h("span", { class: "mono tiny muted" }, "涉及角色"),
      ...ids.map((id) => {
        const c = charMap[id]
        return h("a", { class: "cpchip", "data-grade": c.grade, href: "/characters/" + c.id, "data-link": "1" }, c.code ? h("span", { class: "mono tiny" }, c.code) : null, c.name)
      })
    )
  }

  const numberOf = (id) => { const i = versions.findIndex((v) => v.id === id); return i < 0 ? 0 : versions.length - i }
  const current = () => versions.find((v) => v.id === viewingId) || versions[0] || null

  function render() {
    clear(view)
    view.append(header())
    if (versions.length) view.append(stageBlock(), timelineBlock())
    else view.append(emptyBlock())
    reveal([...view.children], { y: 24, stagger: 0.07 })
  }

  function header() {
    const acts = h("div", { class: "pd__acts" },
      starButton(project),
      canEdit ? h("button", { class: "btn btn--red", onClick: startUpload }, "上传更新") : null,
      versions.length >= 2 ? h("button", { class: "btn btn--sm btn--ghost", onClick: openDiff }, "版本对比") : null,
      canEdit ? h("button", { class: "btn btn--sm", onClick: edit }, "编辑") : null,
      canEdit ? h("button", { class: "btn btn--sm btn--danger", onClick: del }, "删除") : null
    )
    return h("section", { class: "pd__head", "data-grade": project.grade },
      h("div", { class: "pd__crumb mono" }, h("a", { href: "/projects", "data-link": "1" }, "项目库"), " / ", project.grade),
      h("div", { class: "pd__top" },
        h("div", { class: "pd__id" },
          h("div", { class: "badge badge--fill", "data-grade": project.grade }, h("span", { class: "badge__dot" }), project.grade),
          h("h1", { class: "pd__title serif" }, project.title),
          project.tags && project.tags.length ? h("div", { class: "tagrow", style: "margin-top:14px" }, ...project.tags.map((t) => h("span", { class: "tag" }, t))) : null,
          h("div", { class: "pd__meta mono" },
            h("span", {}, "@" + project.author),
            h("span", { class: "dotsep" }, "建于 " + fmtDate(project.createdAt)),
            h("span", { class: "dotsep" }, "更新 " + fmtAgo(project.updatedAt)),
            h("span", { class: "dotsep" }, "v" + versions.length)
          )
        ),
        acts
      ),
      project.desc ? h("p", { class: "pd__desc" }, project.desc) : null,
      charRow()
    )
  }

  function stageBlock() {
    const v = current()
    const head = v.id === headId
    return h("section", { class: "pd__stage" },
      h("div", { class: "pd__stagebar" },
        h("span", { class: "badge", "data-grade": project.grade }, h("span", { class: "badge__dot" }), "v" + numberOf(v.id) + (head ? " · 最新" : " · 历史")),
        h("span", { class: "mono tiny muted pd__stagemsg" }, v.message),
        h("div", { class: "pd__stageacts" },
          !head ? h("button", { class: "btn btn--sm", onClick: () => { viewingId = headId; render() } }, "回到最新") : null,
          (!head && canEdit) ? h("button", { class: "btn btn--sm btn--red", onClick: () => doRollback(v) }, "回滚到此版") : null
        )
      ),
      assetStage(v)
    )
  }

  function timelineBlock() {
    return h("section", { class: "pd__time" },
      h("div", { class: "section__head" }, h("div", {}, h("span", { class: "kicker" }, "History / 版本时间轴"), h("h2", { class: "pd__h2 serif" }, "变更记录"))),
      h("div", { class: "timeline" }, ...versions.map(timeNode))
    )
  }

  function timeNode(v) {
    const n = numberOf(v.id)
    const cover = (v.assets || []).find((a) => a.id === v.coverAssetId) || (v.assets || [])[0]
    const on = v.id === viewingId
    const card = h("button", { class: "tnode__card" },
      cover ? h("div", { class: "tnode__th" }, cover.kind === "video" ? h("div", { class: "sthumb__v mono" }, "▶") : h("img", { src: cover.previewUrl || cover.posterUrl || cover.originalUrl, loading: "lazy", alt: "" })) : null,
      h("div", { class: "tnode__body" },
        h("div", { class: "tnode__top" }, h("b", { class: "mono" }, "v" + n), v.id === headId ? h("span", { class: "badge badge--fill", "data-grade": project.grade, style: "padding:2px 7px" }, "HEAD") : null),
        h("div", { class: "tnode__msg" }, v.message),
        h("div", { class: "tnode__meta mono tiny muted" }, "@" + v.author, h("span", { class: "dotsep" }, fmtAgo(v.createdAt)), h("span", { class: "dotsep" }, (v.assets || []).length + " 文件"))
      )
    )
    card.addEventListener("click", () => { viewingId = v.id; render(); window.scrollTo({ top: 0, behavior: "smooth" }) })
    return h("div", { class: "tnode" + (on ? " tnode--on" : "") + (v.id === headId ? " tnode--head" : "") },
      h("div", { class: "tnode__rail" }, h("span", { class: "tnode__dot" })),
      card
    )
  }

  function emptyBlock() {
    return h("section", { class: "pd__body" },
      h("div", { class: "empty" },
        h("div", { class: "mono" }, "尚无版本"),
        h("p", { class: "mono tiny muted", style: "margin:10px 0 18px" }, "上传首个作品即创建 v1"),
        canEdit ? h("button", { class: "btn btn--red btn--lg", onClick: startUpload }, "上传首个版本") : h("span", { class: "mono tiny muted" }, "仅作者或管理员可上传")
      )
    )
  }

  function startUpload() {
    uploadModal({ project, onDone: reloadVersions })
  }

  function openDiff() {
    diffModal({ project, versions })
  }

  async function reloadVersions() {
    const vr = await api.get("/api/projects/" + params.id + "/versions")
    versions = vr.versions
    headId = vr.headVersionId
    viewingId = headId
    render()
  }

  async function doRollback(v) {
    if (!confirm("回滚到 v" + numberOf(v.id) + "？将基于该版本生成一个新版本，历史不会被删除")) return
    try {
      await api.post("/api/projects/" + project.id + "/rollback", { vid: v.id })
      toast("已回滚，已生成新版本", "ok")
      await reloadVersions()
      window.scrollTo({ top: 0, behavior: "smooth" })
    } catch (err) { toast(err.message || "回滚失败", "bad") }
  }

  function edit() {
    projectFormModal({ project, onSaved: (p) => { project = { ...project, ...p }; render() } })
  }

  async function del() {
    if (!confirm("删除项目「" + project.title + "」？此操作不可撤销")) return
    try { await api.del("/api/projects/" + project.id); toast("已删除", "info"); go("/projects") }
    catch (err) { toast(err.message || "删除失败", "bad") }
  }

  function notFound(err) {
    return h("div", { class: "soon" },
      h("h2", {}, "404"),
      h("p", {}, err && err.status === 404 ? "此档案不存在于长生天之下" : (err && err.message) || "加载失败"),
      h("a", { class: "btn btn--red", href: "/projects", "data-link": "1", style: "margin-top:22px" }, "返回项目库")
    )
  }

  boot()
  return { destroy: clearScroll }
}
