import { h, clear } from "../lib/dom.js"
import { api } from "../lib/api.js"
import { personaOf } from "../lib/persona.js"
import { mimicryLabel } from "../lib/mimicry.js"
import { characterFormModal } from "../components/character-form.js"
import { reportButton } from "../components/report-button.js"
import { investigationBoard } from "../components/investigation-board.js"
import { session } from "../lib/store.js"
import { mdToHtml } from "../lib/markdown.js"
import { toast } from "../components/toast.js"
import { go } from "../router.js"
import { reveal, clearScroll } from "../lib/anim.js"
import { fmtAgo } from "../lib/fmt.js"
import { authorLink } from "../components/author.js"

export default function characterDetail(root, params) {
  const view = h("div", { class: "wrap cdetail" }, h("div", { class: "muted mono", style: "padding:70px 0" }, "加载中…"))
  root.append(view)

  let c = null
  let projects = []
  let canEdit = false
  let cur = 0
  let editingBody = false

  async function boot() {
    try {
      const r = await api.get("/api/characters/" + params.id)
      c = r.character; projects = r.projects || []; canEdit = r.canEdit; cur = 0
      render()
    } catch (err) { clear(view); view.append(notFound(err)) }
  }

  function render() {
    clear(view)
    view.append(header(), entry(), involved())
    reveal([...view.children], { y: 24, stagger: 0.07 })
  }

  function header() {
    const por = c.portraits && c.portraits.length ? c.portraits[cur] : null
    const strip = (c.portraits && c.portraits.length > 1)
      ? h("div", { class: "cd__strip" }, ...c.portraits.map((p, i) => {
          const t = h("button", { class: "sthumb", "data-on": i === cur ? "1" : "0" }, h("img", { src: p.url, loading: "lazy", alt: "" }))
          t.addEventListener("click", () => { cur = i; render() })
          return t
        }))
      : null
    return h("section", { class: "cd__head", "data-sec": c.sec || "PUBLIC" },
      h("div", { class: "cd__por" },
        por ? h("img", { class: "cd__porimg", src: por.url, alt: c.name }) : h("div", { class: "cd__noimg mono" }, "无立绘"),
        strip
      ),
      h("div", { class: "cd__id" },
        h("div", { class: "cd__crumb mono" }, h("a", { href: "/characters", "data-link": "1" }, "角色名录"), " / ", c.code || (c.sec === "SECRET" ? "保密" : "公开")),
        h("div", { class: "cd__badges" },
          h("span", { class: "badge badge--fill", "data-sec": c.sec || "PUBLIC" }, h("span", { class: "badge__dot" }), c.sec === "SECRET" ? "保密 CLOSED" : "公开 OPEN"),
          c.code ? h("span", { class: "badge ccode-badge mono" }, c.code) : null,
          h("span", { class: "badge ptag-badge mono" }, personaOf(c.persona).label),
          h("span", { class: "badge mim-badge mono" }, "拟态 " + mimicryLabel(c.mimicry)),
          c.experimental ? h("span", { class: "expbadge mono" }, "实验性实体") : null
        ),
        h("h1", { class: "cd__name serif" }, c.name),
        h("div", { class: "cd__meta mono" }, authorLink(c.owner), h("span", { class: "dotsep" }, "更新 " + fmtAgo(c.updatedAt)), h("span", { class: "dotsep" }, projects.length + " 个项目")),
        h("div", { class: "cd__acts" },
          canEdit ? h("button", { class: "btn btn--sm", onClick: edit }, "编辑信息") : null,
          canEdit ? h("button", { class: "btn btn--sm btn--danger", onClick: del }, "删除") : null,
          (session.me && c.ownerId !== session.me.id) ? reportButton({ kind: "character", id: c.id, title: c.name }) : null)
      )
    )
  }

  function entry() {
    const sec = h("section", { class: "cd__entry" })
    sec.append(h("div", { class: "section__head" },
      h("div", {}, h("span", { class: "kicker" }, "Entry / 词条"), h("h2", { class: "pd__h2 serif" }, "角色档案")),
      canEdit && !editingBody ? h("button", { class: "btn btn--sm", onClick: () => { editingBody = true; render() } }, "编辑词条") : null
    ))

    if (editingBody) {
      const ta = h("textarea", { class: "textarea wikied", placeholder: "# 标题\n\n用 Markdown 写角色设定：**加粗**、*斜体*、- 列表、> 引用、[链接](url)、![图](url)、--- 分割线" })
      ta.value = c.body || ""
      const preview = h("div", { class: "wiki" })
      const sync = () => { preview.innerHTML = mdToHtml(ta.value) || '<p class="muted">预览…</p>' }
      ta.addEventListener("input", sync); sync()
      sec.append(h("div", { class: "wikiedit" },
        h("div", { class: "wikiedit__pane" }, h("div", { class: "wikiedit__lbl mono tiny" }, "Markdown 源码"), ta),
        h("div", { class: "wikiedit__pane" }, h("div", { class: "wikiedit__lbl mono tiny" }, "预览"), preview)
      ))
      sec.append(h("div", { class: "wikiedit__act" },
        h("button", { class: "btn btn--red", onClick: saveBody }, "保存词条"),
        h("button", { class: "btn btn--sm btn--ghost", onClick: () => { editingBody = false; render() } }, "取消")
      ))
      async function saveBody() {
        try { const r = await api.patch("/api/characters/" + c.id, { body: ta.value }); c = r.character; editingBody = false; toast("词条已保存", "ok"); render() }
        catch (e) { toast(e.message || "保存失败", "bad") }
      }
    } else if (c.body && c.body.trim()) {
      const w = h("div", { class: "wiki" })
      w.innerHTML = mdToHtml(c.body)
      sec.append(w)
    } else {
      sec.append(h("div", { class: "empty" },
        h("div", { class: "mono" }, "词条尚未编写"),
        canEdit ? h("button", { class: "btn btn--red", style: "margin-top:14px", onClick: () => { editingBody = true; render() } }, "+ 编写词条") : null))
    }
    return sec
  }

  function involved() {
    return h("section", { class: "cd__proj" },
      h("div", { class: "section__head" }, h("div", {}, h("span", { class: "kicker" }, "Appears in / 涉及项目"), h("h2", { class: "pd__h2 serif" }, "出场作品")), projects.length ? h("span", { class: "mono tiny muted" }, projects.length + " 份案卷") : null),
      projects.length
        ? investigationBoard({ character: { name: c.name, code: c.code, sec: c.sec, img: (c.portraits && c.portraits[0] ? c.portraits[0].url : c.coverUrl) }, projects })
        : h("div", { class: "empty" }, h("div", { class: "mono" }, "暂未关联项目"), h("p", { class: "mono tiny muted", style: "margin-top:8px" }, "在项目的「新建 / 编辑」里勾选此角色即可双向关联"))
    )
  }

  function edit() { characterFormModal({ character: c, onSaved: (nc) => { c = { ...c, ...nc }; cur = 0; render() } }) }

  async function del() {
    if (!confirm("删除角色「" + c.name + "」？此操作不可撤销")) return
    try { await api.del("/api/characters/" + c.id); toast("已删除", "info"); go("/characters") }
    catch (e) { toast(e.message || "删除失败", "bad") }
  }

  function notFound(err) {
    return h("div", { class: "soon" }, h("h2", {}, "404"), h("p", {}, err && err.status === 404 ? "此角色不存在于长生天之下" : (err && err.message) || "加载失败"),
      h("a", { class: "btn btn--red", href: "/characters", "data-link": "1", style: "margin-top:22px" }, "返回角色名录"))
  }

  boot()
  return { destroy: clearScroll }
}
