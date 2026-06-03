# 长生天计划艺作存档库 — 设计文档

日期：2026-06-03
工作目录：`art-archive`（站名：长生天计划艺作存档库）

## 定位

「艺术版 GitHub」：给画作做版本存档、变更可视化、分级归档的私人/小圈子平台。
构成主义美术风格（零圆角、红黑白 + 分级色、硬边丝滑动画）。100% 跑在 Netlify 上，零外部账号。

## 技术栈

- 前端：Vanilla ESM + Vite 打包，自写小路由（SPA），GSAP + Flip + ScrollTrigger 做动画
- 后端：Netlify Functions v2（ESM）
- 发文件：Netlify Edge Function（流式，绕开 6MB 同步限制）
- 存储：Netlify Blobs（元数据 + 文件，唯一存储）
- PSD：`ag-psd`（浏览器端解析）
- 鉴权：`jose`（JWT，HS256）+ Node `crypto.scrypt`（密码哈希，无额外依赖）
- 代码风格：纯 JS、不写注释、命名带手作随机感

## 架构与数据流

```
浏览器(SPA, GSAP)
  ├─ fetch /api/*  → Functions：注册/登录/me、项目&版本 CRUD、上传、分块合并、管理、统计
  └─ <img>/<video> /media/* → Edge Function：从 Blobs 流式吐文件
        ↓
   Netlify Blobs（强一致）
   users / projects / versions / files(二进制) / activity / invites
```

## Blobs 存储模型

- `users`：`user/{id}` → {id, handle, displayName, passHash, salt, role(admin/member), status(active/pending), bio, createdAt}；`handle/{handle}` → id（登录索引）
- `projects`：`project/{id}` → {id, ownerId, title, desc, grade, tags[], headVersionId, versionIds[], coverKey, createdAt, updatedAt}
- `versions`：`version/{projectId}/{id}` → {id, projectId, authorId, message, parentId, createdAt, assets[], coverAssetId}
  - asset：{id, kind(image/video/psd), originalKey, previewKey, posterKey?, layers?[{name,visible,opacity,thumbKey,bounds}], w, h, bytes, filename}
- `files`：`file/{key}` → 原始二进制 + metadata.contentType
- `activity`：`act/{scope}/{YYYY-MM-DD}` → 计数
- `invites`：`code/{code}` → {createdBy, usesLeft, expiresAt}

## 分级系统（高→低，Project Moon 风险等级）

| 级别 | 色 | Hex |
|---|---|---|
| ALEPH | 红 | `#D7263D` |
| WAW | 紫 | `#6A2C9C` |
| HE | 黄 | `#F0A202` |
| TETH | 蓝 | `#1B6CA8` |
| ZAYIN | 绿 | `#2A9D4A` |

贯穿徽标、卡片厚边、热力图着色、详情页强调线。

## 四大板块

1. 主页：构成主义 hero + 跨项目最新提交流 + 精选/最近项目网格 + 全局迷你统计
2. 项目：分级色片/标签/搜索/排序/网格列表筛选条；项目卡；项目详情（大图查看器、版本时间轴、新建更新、回滚、对比、PSD 图层面板）；新建项目弹窗
3. 活动/统计：贡献热力图 + 手绘 SVG 图表（分级分布/上传趋势/类型占比/Top 榜）+ 数字墙
4. 个人：未登录→登录/注册（邀请码）；已登录→资料、我的项目、我的热力图、账户设置；admin→待审批 + 邀请码管理

## 上传管线

- 图片：canvas 生成预览（~1600px WebP <1MB）+ 原图
- 视频：抽帧做 poster + 原文件
- PSD：`ag-psd` 解析 → 合成预览 + 图层缩略图 + 图层元数据；失败降级仅存原文件
- >~4MB：客户端切 ~3MB 块 → `/api/upload-chunk` → `/api/upload-finalize` 服务端拼接（幂等、清临时）
- 发文件：统一 Edge `/media/{key}` 流式返回。写有 6MB 限制走分块；读走 Edge 无虑

## 版本与回滚 + 对比

- 每次「上传更新」= 一次提交：新版本 = asset 快照 + 信息 + 作者 + 时间；head 前移；旧 blob 全留
- 回滚：查看 = 只读时间旅行；回滚到此版 = 新建指向旧 asset 的提交（git-revert 式，非破坏）
- 对比：选两版 → 并排 / 滑块 / 洋葱皮；视频比 poster；PSD 比合成图 + 图层增删

## 活动 + 统计

- 热力图：按天聚合提交，53 周日历格，构成主义色阶；个人页看己、统计页看全局
- 统计：分级分布、上传趋势、类型占比、Top 项目/贡献者、总计——手绘 SVG

## 账户与权限

- 首个注册者自动 admin + active；之后注册需有效邀请码，状态 pending，admin 批准转 active
- 登录：handle + 密码 → scrypt 校验 → jose 签 JWT → httpOnly·Secure·SameSite=Lax cookie；`/api/me` 取用户
- 全站登录门；登录限速；错误模糊化防枚举
- 角色：admin（批人/管邀请码/删任意）、member（建项目/上传）

## 设计系统 + 动画

- 零圆角（全局 `border-radius:0`）；墨黑 `#0E0E0E`、纸白 `#F2EFE6`、主红 `#E2231A` + 5 分级色；极高对比
- 字体：拉丁重型 grotesk 做标题，中文标题思源宋体，正文思源黑体；大字号紧字距
- 版式：强网格、斜切、粗分割线、色块构成、离轴旋转标签、巨型数字、刻意不对称
- 动画：色块滑入/擦除、分割线绘制、数字跳动、错峰揭示、路由 FLIP、悬停色块位移；GSAP 时间轴 + ScrollTrigger + Flip；尊重 `prefers-reduced-motion`

## 仓库结构

```
art-archive/
  index.html  vite.config.js  netlify.toml  package.json
  src/  main.js router.js
    views/ home projects project-detail stats profile auth
    components/ nav gradeBadge projectCard heatmap timeline diffViewer layerPanel uploader modal toast
    lib/ api psd anim store fmt
    styles/ reset tokens constructivism + 各 view
  netlify/ functions/ edge-functions/
  tests/
```

## 测试与错误处理

- TDD 关键后端逻辑（哈希/JWT、项目&版本 CRUD、分块拼接、diff/回滚）+ lib 纯函数，内存 Blobs mock，Vitest
- 一条 Playwright 黄金路径冒烟
- 统一 JSON 错误体；上传双校验 + 块重试 + finalize 幂等 + 孤儿清理；PSD 降级；动画降级

## 分阶段

- P0 脚手架 + 设计系统 + 外壳 + Blobs 接通
- P1 账户（注册/邀请/审批/登录/me/JWT）+ 登录门
- P2 项目（建/列/详情 + 分级 + 检索）
- P3 上传管线 + PSD 解析
- P4 版本 + 回滚 + 对比
- P5 活动热力图 + 统计
- P6 主页 hero + 动画过场 + 响应式 + 部署
