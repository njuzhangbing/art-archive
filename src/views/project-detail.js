import { h, clear } from "../lib/dom.js"
import { api } from "../lib/api.js"
import { gradeOf } from "../lib/grades.js"
import { projectFormModal } from "../components/project-form.js"
import { toast } from "../components/toast.js"
import { go } from "../router.js"
import { reveal, clearScroll } from "../lib/anim.js"
import { fmtAgo, fmtDate } from "../lib/fmt.js"

export default function projectDetail(root, params) {
  const view = h("div", { class: "wrap pdetail" }, h("div", { class: "muted mono", style: "padding:70px 0" }, "加载中…"))
  root.append(view)
  let project = null
  let canEdit = false

  async function boot() {
    try {
      const r = await api.get("/api/projects/" + params.id)
      project = r.project
      canEdit = r.canEdit
      render()
    } catch (err) {
      clear(view)
      view.append(notFound(err))
    }
  }

  function render() {
    clear(view)
    view.append(header(), body())
    reveal([...view.children], { y: 24, stagger: 0.08 })
  }

  function header() {
    const g = gradeOf(project.grade)
    const acts = h("div", { class: "pd__acts" },
      h("button", { class: "btn btn--red", onClick: () => toast("上传更新将在 P3 上线", "info") }, "上传更新"),
      canEdit ? h("button", { class: "btn btn--sm", onClick: edit }, "编辑") : null,
      canEdit ? h("button", { class: "btn btn--sm btn--danger", onClick: del }, "删除") : null
    )
    return h("section", { class: "pd__head", "data-grade": project.grade },
      h("div", { class: "pd__crumb mono" }, h("a", { href: "/projects", "data-link": "1" }, "项目库"), " / ", project.grade),
      h("div", { class: "pd__top" },
        h("div", { class: "pd__id" },
          h("div", { class: "badge badge--fill", "data-grade": project.grade }, h("span", { class: "badge__dot" }), project.grade + " · " + g.zh),
          h("h1", { class: "pd__title serif" }, project.title),
          project.tags && project.tags.length ? h("div", { class: "tagrow", style: "margin-top:14px" }, ...project.tags.map((t) => h("span", { class: "tag" }, t))) : null,
          h("div", { class: "pd__meta mono" },
            h("span", {}, "@" + project.author),
            h("span", { class: "dotsep" }, "建于 " + fmtDate(project.createdAt)),
            h("span", { class: "dotsep" }, "更新 " + fmtAgo(project.updatedAt)),
            h("span", { class: "dotsep" }, "v" + project.versions)
          )
        ),
        acts
      ),
      project.desc ? h("p", { class: "pd__desc" }, project.desc) : null
    )
  }

  function body() {
    return h("section", { class: "pd__body" },
      h("div", { class: "empty" },
        h("div", { class: "mono" }, "尚无版本"),
        h("p", { class: "mono tiny muted", style: "margin-top:10px" }, "上传首个作品即创建 v1（上传管线 P3 上线）")
      )
    )
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
