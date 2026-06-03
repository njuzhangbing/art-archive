import { soon } from "../components/soon.js"

export default function projectDetail(root, params) {
  return soon(root, { tag: "Archive / 档案 #" + (params.id || ""), title: "项目详情", sub: "P3·P4 · 上传更新 · 版本时间轴 · 回滚 · 对比" })
}
