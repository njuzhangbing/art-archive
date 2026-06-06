import { h, clear } from "../lib/dom.js"
import { api } from "../lib/api.js"
import { session, isAdmin } from "../lib/store.js"
import { toast } from "../components/toast.js"
import { go } from "../router.js"
import { reveal } from "../lib/anim.js"
import { fmtAgo, fmtDate } from "../lib/fmt.js"
import { heatmap } from "../components/heatmap.js"
import { planDialog } from "../components/plan-dialog.js"
import { projectCard } from "../components/project-card.js"

export default function profile(root) {
  if (!session.me) { root.append(wall()); reveal([...root.firstChild.children], { y: 24, stagger: 0.06 }); return {} }

  const view = h("div", { class: "wrap profile" })
  root.append(view)
  render()

  function render() {
    const me = session.me
    clear(view)
    view.append(header(me), settings(me), mineBlock())
    if (isAdmin()) view.append(adminBlock())
    reveal([...view.children], { y: 26, stagger: 0.06 })
  }

  function mineBlock() {
    const projWrap = h("div", { class: "grid-cards" }, h("div", { class: "muted mono tiny" }, "加载中…"))
    const heatWrap = h("div", {}, h("div", { class: "muted mono tiny" }, "加载中…"))
    const box = h("section", { class: "mine" },
      h("div", { class: "section__head" }, h("div", {}, h("span", { class: "kicker" }, "Mine / 我的档案"))),
      projWrap,
      h("div", { class: "panel", style: "margin-top:22px" }, h("div", { class: "panel__head" }, h("span", { class: "kicker" }, "Contribution / 我的贡献")), heatWrap)
    )
    loadMine(projWrap, heatWrap)
    return box
  }

  async function loadMine(projWrap, heatWrap) {
    try {
      const r = await api.get("/api/projects?mine=1")
      clear(projWrap)
      if (!r.projects.length) projWrap.append(h("div", { class: "empty" }, h("div", { class: "mono" }, "你还没有项目"), h("a", { class: "btn btn--red", href: "/projects", "data-link": "1", style: "margin-top:14px" }, "去新建")))
      else r.projects.slice(0, 6).forEach((p, i) => { p.no = i + 1; projWrap.append(projectCard(p)) })
    } catch (e) { clear(projWrap); projWrap.append(h("div", { class: "muted mono tiny" }, e.message)) }
    renderHeat(heatWrap)
  }

  async function renderHeat(heatWrap) {
    try {
      const [s, pl] = await Promise.all([api.get("/api/stats"), api.get("/api/plans")])
      const daily = s.myDaily || {}
      const plans = pl.plans || {}
      clear(heatWrap)
      heatWrap.append(heatmap(daily, { future: 14, plans, onPickDay: (date) => planDialog({ date, onSaved: () => renderHeat(heatWrap) }) }))
    } catch (e) { clear(heatWrap); heatWrap.append(h("div", { class: "muted mono tiny" }, e.message)) }
  }

  function header(me) {
    const seal = (me.displayName || me.handle || "天").trim()[0]
    return h("section", { class: "profile__head" },
      h("div", { class: "profile__seal" }, seal),
      h("div", { class: "profile__id" },
        h("div", { class: "profile__roles" },
          h("span", { class: "badge", "data-grade": me.role === "admin" ? "ALEPH" : "TETH" }, h("span", { class: "badge__dot" }), me.role === "admin" ? "管理员" : "成员"),
          h("span", { class: "mono tiny" }, "入库 " + fmtAgo(me.createdAt))
        ),
        h("h1", { class: "profile__name serif" }, me.displayName || me.handle),
        h("div", { class: "profile__handle mono" }, "@" + me.handle),
        me.bio ? h("p", { class: "profile__bio" }, me.bio) : null
      ),
      h("div", { class: "profile__act" },
        h("button", { class: "btn btn--ghost btn--sm", onClick: doLogout }, "登出")
      )
    )
  }

  async function doLogout() {
    try { await api.post("/api/logout") } catch {}
    session.set(null)
    toast("已登出", "info")
    go("/")
  }

  function settings(me) {
    const grab = (n) => (form.querySelector("[name=" + n + "]") || {}).value || ""
    const form = h("form", { class: "panel stack" },
      h("div", { class: "panel__head" }, h("span", { class: "kicker" }, "Account / 账户设置")),
      h("label", { class: "field" }, h("span", { class: "field__label" }, "显示名"), h("input", { class: "input", name: "display", value: me.displayName || "", maxlength: "40" })),
      h("label", { class: "field" }, h("span", { class: "field__label" }, "简介 / BIO"), h("textarea", { class: "textarea", name: "bio", maxlength: "280", placeholder: "一句话介绍自己" }, me.bio || "")),
      h("div", { class: "split2" },
        h("label", { class: "field" }, h("span", { class: "field__label" }, "原密码"), h("input", { class: "input", name: "old", type: "password", autocomplete: "current-password", placeholder: "仅改密码时填" })),
        h("label", { class: "field" }, h("span", { class: "field__label" }, "新密码"), h("input", { class: "input", name: "neu", type: "password", autocomplete: "new-password", placeholder: "≥ 8 位" }))
      ),
      h("button", { class: "btn btn--red", type: "submit" }, "保存修改")
    )
    const bio = form.querySelector("[name=bio]")
    if (bio) bio.value = me.bio || ""
    form.addEventListener("submit", async (e) => {
      e.preventDefault()
      const body = { displayName: grab("display"), bio: grab("bio") }
      if (grab("neu")) { body.oldPassword = grab("old"); body.newPassword = grab("neu") }
      try {
        const r = await api.patch("/api/me", body)
        session.set(r.user)
        toast("已保存", "ok")
        render()
      } catch (err) { toast(err.message || "保存失败", "bad") }
    })
    return form
  }

  function adminBlock() {
    const box = h("section", { class: "admin" },
      h("div", { class: "section__head" }, h("div", {}, h("span", { class: "kicker" }, "Console / 管理控制台"), h("h2", { class: "h-section", style: "margin-top:12px" }, "成员与邀请"))),
      h("div", { class: "admin__cols" })
    )
    const cols = box.querySelector(".admin__cols")
    cols.append(usersPanel(), invitesPanel())
    box.append(reportsPanel())
    return box
  }

  function reportsPanel() {
    const list = h("div", { class: "rows" }, h("div", { class: "muted mono tiny" }, "加载中…"))
    const panel = h("div", { class: "panel", style: "margin-top:20px" }, h("div", { class: "panel__head" }, h("span", { class: "kicker" }, "Reports / 举报")), list)
    const load = async () => {
      try {
        const { reports } = await api.get("/api/reports")
        clear(list)
        if (!reports.length) { list.append(h("div", { class: "muted mono tiny" }, "暂无举报")); return }
        reports.forEach((r) => list.append(reportRow(r, load)))
      } catch (e) { clear(list); list.append(h("div", { class: "muted mono tiny" }, e.message)) }
    }
    load()
    return panel
  }

  function reportRow(r, reload) {
    const link = r.kind === "project" ? "/projects/" + r.targetId : r.kind === "character" ? "/characters/" + r.targetId : "/blog/" + r.targetId
    const kindLabel = { project: "项目", character: "角色", post: "文章" }[r.kind] || r.kind
    const act = async (fn) => { try { await fn(); reload() } catch (e) { toast(e.message || "失败", "bad") } }
    return h("div", { class: "urow urow--rep" },
      h("div", { class: "urow__who" },
        h("span", { class: "badge", "data-grade": r.resolved ? "ZAYIN" : "ALEPH" }, h("span", { class: "badge__dot" }), r.resolved ? "已处理" : "待处理"),
        h("a", { class: "mono", href: link, "data-link": "1" }, kindLabel + "《" + (r.targetTitle || r.targetId) + "》")
      ),
      r.reason ? h("div", { class: "urow__reason mono tiny muted" }, "原因：" + r.reason) : null,
      h("span", { class: "mono tiny muted" }, "by @" + r.byHandle),
      h("div", { class: "urow__btns" },
        h("button", { class: "btn btn--sm", onClick: () => act(() => api.patch("/api/reports/" + r.id, { resolved: !r.resolved })) }, r.resolved ? "重开" : "标记处理"),
        h("button", { class: "btn btn--sm btn--danger", onClick: () => act(() => api.del("/api/reports/" + r.id)) }, "删")
      )
    )
  }

  function usersPanel() {
    const list = h("div", { class: "rows" }, h("div", { class: "muted mono tiny" }, "加载中…"))
    const panel = h("div", { class: "panel" }, h("div", { class: "panel__head" }, h("span", { class: "kicker" }, "Members / 成员")), list)
    const load = async () => {
      try {
        const { users } = await api.get("/api/admin/users")
        clear(list)
        if (!users.length) { list.append(h("div", { class: "muted mono tiny" }, "暂无成员")); return }
        users.forEach((u) => list.append(userRow(u, load)))
      } catch (err) { clear(list); list.append(h("div", { class: "muted mono tiny" }, err.message)) }
    }
    load()
    return panel
  }

  function userRow(u, reload) {
    const stat = u.status === "active" ? "TETH" : u.status === "pending" ? "HE" : "ALEPH"
    const act = async (fn) => { try { await fn(); reload() } catch (e) { toast(e.message || "失败", "bad") } }
    const me = session.me
    const self = u.id === me.id
    return h("div", { class: "urow" },
      h("div", { class: "urow__who" },
        h("span", { class: "badge", "data-grade": u.role === "admin" ? "ALEPH" : "ZAYIN" }, h("span", { class: "badge__dot" }), u.role === "admin" ? "ADMIN" : "MEMBER"),
        h("b", {}, "@" + u.handle), h("span", { class: "mono tiny muted" }, u.displayName || "")
      ),
      h("div", { class: "urow__st" }, h("span", { class: "badge", "data-grade": stat }, h("span", { class: "badge__dot" }), u.status)),
      h("div", { class: "urow__btns" },
        u.status !== "active" ? h("button", { class: "btn btn--sm", onClick: () => act(() => api.patch("/api/admin/users/" + u.id, { status: "active" })) }, "批准") : null,
        u.status === "active" && !self ? h("button", { class: "btn btn--sm", onClick: () => act(() => api.patch("/api/admin/users/" + u.id, { status: "blocked" })) }, "停用") : null,
        !self ? h("button", { class: "btn btn--sm", onClick: () => act(() => api.patch("/api/admin/users/" + u.id, { role: u.role === "admin" ? "member" : "admin" })) }, u.role === "admin" ? "降权" : "升管") : null,
        !self ? h("button", { class: "btn btn--sm btn--danger", onClick: () => { if (confirm("删除 @" + u.handle + " ?")) act(() => api.del("/api/admin/users/" + u.id)) } }, "删") : null
      )
    )
  }

  function invitesPanel() {
    const list = h("div", { class: "rows" })
    const mk = h("button", { class: "btn btn--sm btn--red", onClick: gen }, "+ 生成邀请码")
    const panel = h("div", { class: "panel" },
      h("div", { class: "panel__head" }, h("span", { class: "kicker" }, "Invites / 邀请码"), mk),
      list
    )
    async function load() {
      try {
        const { invites } = await api.get("/api/invites")
        clear(list)
        if (!invites.length) { list.append(h("div", { class: "muted mono tiny" }, "暂无邀请码，点上方生成")); return }
        invites.forEach((iv) => list.append(inviteRow(iv, load)))
      } catch (err) { clear(list); list.append(h("div", { class: "muted mono tiny" }, err.message)) }
    }
    async function gen() {
      try { const { invite } = await api.post("/api/invites", { uses: 1 }); toast("已生成 " + invite.code, "ok"); load() }
      catch (e) { toast(e.message || "失败", "bad") }
    }
    load()
    return panel
  }

  function inviteRow(iv, reload) {
    return h("div", { class: "urow urow--inv" },
      h("code", { class: "invcode", onClick: () => { navigator.clipboard && navigator.clipboard.writeText(iv.code); toast("已复制 " + iv.code, "ok") } }, iv.code),
      h("span", { class: "mono tiny muted" }, "剩 " + (iv.usesLeft ?? "∞") + " 次 · " + fmtAgo(iv.createdAt)),
      h("button", { class: "btn btn--sm btn--danger", onClick: async () => { try { await api.post("/api/invites", { action: "delete", code: iv.code }); reload() } catch (e) { toast(e.message, "bad") } } }, "删")
    )
  }

  function wall() {
    return h("div", { class: "wrap soon" },
      h("span", { class: "kicker", style: "display:inline-flex;justify-content:center" }, "Personal / 个人"),
      h("h2", { style: "margin-top:18px" }, "尚未登录"),
      h("p", {}, "登录后可管理你的项目、查看活动与设置"),
      h("a", { class: "btn btn--red btn--lg", href: "/login", "data-link": "1", style: "margin-top:26px" }, "登录 / 注册")
    )
  }

  return {}
}
