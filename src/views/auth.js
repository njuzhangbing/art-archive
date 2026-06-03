import { soon } from "../components/soon.js"

export default function auth(root) {
  return soon(root, { tag: "Gate / 登录注册", title: "登录 / 注册", sub: "P1 · 邀请码注册 · scrypt · JWT 会话" })
}
