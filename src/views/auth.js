import { h, clear } from "../lib/dom.js"
import { api } from "../lib/api.js"
import { session } from "../lib/store.js"
import { toast } from "../components/toast.js"
import { go } from "../router.js"
import { reveal, gsap, tame } from "../lib/anim.js"
import { GRADES } from "../lib/grades.js"

export default function auth(root) {
  if (session.me) { go("/me"); return {} }

  let mode = "login"
  const pane = h("div", { class: "auth__pane" })

  const brand = h("aside", { class: "auth__brand" },
    h("div", { class: "auth__bg" }, h("i", {}), h("i", {}), h("i", {})),
    h("div", { class: "auth__seal" }, "天"),
    h("div", { class: "auth__slog" },
      h("span", { class: "kicker" }, "长生天计划"),
      h("h2", { class: "serif" }, "艺作", h("br"), "存档库"),
      h("p", { class: "mono" }, "VERSIONED · GRADED · ETERNAL")
    ),
    h("div", { class: "auth__grades" }, ...GRADES.map((g) => h("i", { "data-grade": g.key, title: g.key })))
  )

  const view = h("div", { class: "auth" }, brand, h("div", { class: "auth__col" }, pane))
  root.append(view)
  if (!tame) gsap.from(brand.querySelectorAll(".auth__bg i"), { scale: 0.4, autoAlpha: 0, duration: 1, ease: "expo.out", stagger: 0.1 })

  const grab = (form, name) => (form.querySelector("[name=" + name + "]") || {}).value || ""

  function field(label, attrs) {
    return h("label", { class: "field" },
      h("span", { class: "field__label" }, label),
      h("input", { class: "input", ...attrs })
    )
  }

  function draw() {
    clear(pane)
    const isLogin = mode === "login"
    const submit = h("button", { class: "btn btn--red btn--lg", type: "submit", style: "width:100%" }, isLogin ? "登 录" : "注 册")
    const toggle = h("button", { class: "linkish", type: "button" }, isLogin ? "还没有账号？前往注册 →" : "已有账号？返回登录 →")

    const form = h("form", { class: "stack" },
      h("div", { class: "auth__head" },
        h("span", { class: "kicker" }, isLogin ? "Sign in / 登录" : "Sign up / 注册"),
        h("h2", { class: "h-section", style: "margin-top:12px" }, isLogin ? "进入档案库" : "加入长生天")
      ),
      field("用户名 / HANDLE", { name: "handle", autocomplete: "username", placeholder: "tengri", maxlength: "20" }),
      field("密码 / PASSWORD", { name: "password", type: "password", autocomplete: isLogin ? "current-password" : "new-password", placeholder: "至少 8 位" }),
      isLogin ? null : field("显示名 / DISPLAY", { name: "display", placeholder: "可留空，默认同用户名", maxlength: "40" }),
      isLogin ? null : field("邀请码 / INVITE", { name: "invite", placeholder: "首位注册者可留空" }),
      submit,
      h("div", { class: "auth__alt" }, toggle,
        isLogin ? null : h("span", { class: "mono tiny" }, "无邀请码将转为待审批")
      )
    )

    form.addEventListener("submit", async (e) => {
      e.preventDefault()
      submit.disabled = true
      const old = submit.textContent
      submit.textContent = "···"
      try {
        if (isLogin) {
          const r = await api.post("/api/login", { handle: grab(form, "handle"), password: grab(form, "password") })
          session.set(r.user)
          toast("欢迎回来，@" + r.user.handle, "ok")
          go("/projects")
        } else {
          const r = await api.post("/api/register", {
            handle: grab(form, "handle"), password: grab(form, "password"),
            displayName: grab(form, "display"), invite: grab(form, "invite")
          })
          if (r.pending) { toast(r.message || "已提交，等待审批", "info"); mode = "login"; draw() }
          else { session.set(r.user); toast(r.firstSoul ? "你是长生天第一位管理员" : "注册成功", "ok"); go("/projects") }
        }
      } catch (err) {
        toast(err.message || "操作失败", "bad")
        submit.disabled = false
        submit.textContent = old
      }
    })
    toggle.addEventListener("click", () => { mode = isLogin ? "register" : "login"; draw() })

    pane.append(form)
    reveal([...form.children].filter(Boolean), { y: 22, stagger: 0.05 })
  }

  draw()
  return {}
}
