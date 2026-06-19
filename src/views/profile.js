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
import { buildAsset } from "../lib/upload.js"
import { exportAll } from "../lib/exporter.js"

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
    const sealEl = h("div", { class: "profile__seal" }, seal)
    if (me.avatarKey) { sealEl.style.backgroundImage = "url(/media/" + me.avatarKey + ")"; sealEl.style.backgroundSize = "cover"; sealEl.style.backgroundPosition = "center"; sealEl.style.color = "transparent" }
    return h("section", { class: "profile__head" },
      sealEl,
      h("div", { class: "profile__id" },
        h("div", { class: "profile__roles" },
          h("span", { class: "badge", "data-grade": me.role === "owner" ? "ALEPH" : me.role === "admin" ? "WAW" : "TETH" }, h("span", { class: "badge__dot" }), me.role === "owner" ? "站长" : me.role === "admin" ? "管理员" : "成员"),
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
    let avatarKey = me.avatarKey || null
    const fallbackChar = (me.handle || "?").slice(0, 1).toUpperCase()
    const avPrev = h("span", { class: "authoravatar authoravatar--lg avset" }, fallbackChar)
    if (avatarKey) { avPrev.style.backgroundImage = "url(/media/" + avatarKey + ")"; avPrev.classList.add("has"); avPrev.textContent = "" }
    const avFile = h("input", { type: "file", accept: "image/*", style: "display:none" })
    avFile.addEventListener("change", async () => {
      if (!avFile.files.length) return
      const f = avFile.files[0]; avFile.value = ""
      toast("上传头像中…", "info")
      try { const a = await buildAsset(f); avatarKey = a.previewKey || a.originalKey; avPrev.style.backgroundImage = "url(/media/" + avatarKey + ")"; avPrev.classList.add("has"); avPrev.textContent = "" }
      catch (e) { toast(e.message || "头像上传失败", "bad") }
    })
    const avField = h("div", { class: "field" },
      h("span", { class: "field__label" }, "头像 / AVATAR"),
      h("div", { class: "avsetrow" }, avPrev,
        h("button", { class: "btn btn--sm", type: "button", onClick: () => avFile.click() }, "上传 / 更换"),
        h("button", { class: "btn btn--sm btn--ghost", type: "button", onClick: () => { avatarKey = null; avPrev.style.backgroundImage = ""; avPrev.classList.remove("has"); avPrev.textContent = fallbackChar } }, "移除"),
        avFile))
    const form = h("form", { class: "panel stack" },
      h("div", { class: "panel__head" }, h("span", { class: "kicker" }, "Account / 账户设置")),
      avField,
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
      const body = { displayName: grab("display"), bio: grab("bio"), avatarKey: avatarKey || "" }
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
    box.append(reportsPanel(), backupPanel())
    return box
  }

  function backupPanel() {
    const fileIn = h("input", { type: "file", accept: "application/json,.json", style: "display:none" })
    const status = h("span", { class: "mono tiny muted" })
    async function pullDown() {
      status.textContent = "导出中…"
      try {
        const res = await fetch("/api/admin/backup", { credentials: "same-origin" })
        if (!res.ok) throw new Error("导出失败 " + res.status)
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = h("a", { href: url, download: "changshengtian-backup-" + new Date().toISOString().slice(0, 10) + ".json" })
        document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(url)
        status.textContent = "已下载备份（" + (blob.size / 1024).toFixed(0) + " KB）"
      } catch (e) { status.textContent = ""; toast(e.message || "导出失败", "bad") }
    }
    async function fullExport() {
      status.textContent = "全量导出中… 0%（含文件，可能较久）"
      try {
        const blob = await exportAll((done, total) => { status.textContent = "全量导出中… " + Math.round(done / total * 100) + "%" })
        const url = URL.createObjectURL(blob)
        const a = h("a", { href: url, download: "changshengtian-full-" + new Date().toISOString().slice(0, 10) + ".zip" })
        document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(url)
        status.textContent = "已下载全量包（" + (blob.size / 1048576).toFixed(1) + " MB）"
      } catch (e) { status.textContent = ""; toast(e.message || "全量导出失败", "bad") }
    }
    fileIn.addEventListener("change", async () => {
      const f = fileIn.files[0]; fileIn.value = ""
      if (!f) return
      if (!confirm("导入备份「" + f.name + "」？\n将按记录合并写入（同 key 覆盖，不会删除现有数据）。")) return
      status.textContent = "导入中…"
      try {
        const parcel = JSON.parse(await f.text())
        const r = await api.post("/api/admin/backup", parcel)
        status.textContent = "已合并 " + r.merged + " 条记录"
        toast("导入完成，合并 " + r.merged + " 条", "ok")
      } catch (e) { status.textContent = ""; toast(e.message || "导入失败（文件过大或格式不符）", "bad") }
    })
    return h("div", { class: "panel", style: "margin-top:20px" },
      h("div", { class: "panel__head" },
        h("span", { class: "kicker" }, "Backup / 数据备份"),
        h("div", { style: "display:flex;gap:8px" },
          h("button", { class: "btn btn--sm btn--red", onClick: fullExport }, "全量导出(含文件)"),
          h("button", { class: "btn btn--sm", onClick: pullDown }, "JSON 备份"),
          h("button", { class: "btn btn--sm", onClick: () => fileIn.click() }, "导入合并"))),
      h("div", { class: "rows" },
        h("p", { class: "mono tiny muted", style: "line-height:1.6" }, "「全量导出」把 Blobs 里全部数据（所有库 + 上传的图片/视频/PSD 文件）打包成一个 zip，离线留档/迁移用。「JSON 备份」仅文本记录，可再「导入合并」（同 key 覆盖、不删现有）。两者均含成员密码哈希，请妥善保管。"),
        status, fileIn))
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
    const RANK = { member: 0, admin: 1, owner: 2 }
    const canManage = (RANK[me.role] || 0) > (RANK[u.role] || 0)
    const roleGrade = u.role === "owner" ? "ALEPH" : u.role === "admin" ? "WAW" : "ZAYIN"
    const roleText = u.role === "owner" ? "站长" : u.role === "admin" ? "ADMIN" : "MEMBER"
    return h("div", { class: "urow" },
      h("div", { class: "urow__who" },
        h("span", { class: "badge", "data-grade": roleGrade }, h("span", { class: "badge__dot" }), roleText),
        h("b", {}, "@" + u.handle), h("span", { class: "mono tiny muted" }, u.displayName || "")
      ),
      h("div", { class: "urow__st" }, h("span", { class: "badge", "data-grade": stat }, h("span", { class: "badge__dot" }), u.status)),
      h("div", { class: "urow__btns" },
        (canManage && u.status !== "active") ? h("button", { class: "btn btn--sm", onClick: () => act(() => api.patch("/api/admin/users/" + u.id, { status: "active" })) }, "批准") : null,
        (canManage && u.status === "active") ? h("button", { class: "btn btn--sm", onClick: () => act(() => api.patch("/api/admin/users/" + u.id, { status: "blocked" })) }, "停用") : null,
        canManage ? h("button", { class: "btn btn--sm", onClick: () => act(() => api.patch("/api/admin/users/" + u.id, { role: u.role === "admin" ? "member" : "admin" })) }, u.role === "admin" ? "撤销管理员" : "升为管理员") : null,
        canManage ? h("button", { class: "btn btn--sm btn--danger", onClick: () => { if (confirm("删除 @" + u.handle + " ?")) act(() => api.del("/api/admin/users/" + u.id)) } }, "删") : null
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
