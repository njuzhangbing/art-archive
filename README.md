# 长生天计划艺作存档库

构成主义风格的「艺术版 GitHub」：给画作做版本存档、变更可视化、分级归档。
100% 运行在 Netlify 上（Functions + Edge Functions + Blobs），无需任何外部账号或数据库。

## 功能

- **四大板块**：主页 / 项目 / 活动统计 / 个人
- **账户**：邀请码注册、管理员审批、scrypt 密码 + JWT 会话（首位注册者自动成为管理员）
- **项目**：五级分级（ALEPH 红 · WAW 紫 · HE 黄 · TETH 蓝 · ZAYIN 绿）、搜索 / 筛选 / 排序
- **上传**：图片 / 视频 / PSD；浏览器端解析 PSD（合成预览 + 图层缩略图）；大文件分块上传
- **版本**：每次更新即一次提交，版本时间轴、往期时间旅行、非破坏式回滚、版本对比（滑块 / 并排 / 洋葱皮）
- **统计**：贡献热力图、分级分布、文件类型占比、Top 榜

## 本地开发

```bash
npm install
npm run dev          # 仅 Vite（5176）：内置插件把 netlify/functions 与 /media 跑在本地，数据落在 .localblobs/
```

完整 Netlify 运行时（可选）：

```bash
npm i -g netlify-cli
npm run stack        # netlify dev：真正的 Functions / Edge / Blobs 沙箱
```

```bash
npm run build        # 产物到 dist/
npm test             # Vitest 单测（密码哈希 + 存储抽象）
```

## 部署到 Netlify

1. 把仓库推到 GitHub，在 Netlify 选 **Add new site → Import**。
2. 构建设置已写在 `netlify.toml`（command `npm run build`，publish `dist`，functions `netlify/functions`，edge `netlify/edge-functions`）。
3. 环境变量里设 **`AUTH_SECRET`**（任意长随机串，用于签发 JWT）。
4. 部署完成后，**第一个注册的账号自动成为管理员**；之后注册需管理员在「个人 → 管理控制台」生成的邀请码，或等待审批。

Netlify Blobs 在部署环境自动可用，无需配置。本地用 `npm run dev` 时数据写入 `.localblobs/`（已 gitignore）。

## 结构

```
src/            前端（Vanilla ESM + 自写路由 + GSAP）
  views/        home projects project-detail stats profile auth
  components/   nav project-card uploader viewer diff heatmap charts modal toast project-form
  lib/          api dom anim store fmt grades upload psd
netlify/
  functions/    register login logout me admin-users invites projects versions upload upload-chunk upload-finalize rollback stats health（_lib 为共享：store / auth / respond）
  edge-functions/ media（流式发文件）
dev/local-api.mjs  本地把函数 + /media 接到 Vite
```
