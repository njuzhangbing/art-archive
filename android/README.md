# 长生天计划 · 安卓 App

**整站打包进 APK**：页面、样式、字体子集、图版全部随包安装，开机即出画面，弱网也能用。
只有**数据**走网络——API 与媒体文件都请求线上站 `https://painthub.netlify.app`。

- 兼容 **Android 5.0（API 21）及以上**
- 本地资源由 `WebViewAssetLoader` 以 `https://appassets.androidplatform.net` 提供
  （不是 `file://`，所以 localStorage / fetch / history 都正常，服务器也只需放行这一个来源）
- 支持双指缩放、站内导航、文件上传（图片 / 视频 / PSD，多选）、外链跳浏览器
- 返回键 = 网页后退；旋转不重载；断网显示重试页

## 登录态

网页版用 HttpOnly Cookie。App 里页面来自另一个来源，安卓 WebView 会把站点 Cookie 当第三方
丢掉，所以 App 改用 **Bearer Token**：

- 服务器只在请求 `Origin` 是 `https://appassets.androidplatform.net` 时才在登录/注册响应里附带 token
  （网页版永远拿不到，站点上被注入的脚本也拿不到）
- token 存在页面自己的 localStorage 里，其他进程读不到
- 后台通知轮询由 `MainActivity.keepToken()` 把它同步进 SharedPreferences 给 `NotifWorker` 用

## 编译

### A. 本机

    npm run apk

等价于 `npm run build:app`（构建站点 + 拷进 `android/app/src/main/webassets/www`）再
`cd android && ./gradlew assembleDebug`。产物：

    android/app/build/outputs/apk/debug/app-debug.apk

首次需要 JDK 17 与 Android SDK（`platforms;android-34`、`build-tools;34.0.0`），
并在 `android/local.properties` 写 `sdk.dir=<SDK 路径>`（该文件已被 gitignore）。

### B. 云端自动编译

推到 GitHub → **Actions** → “Build Android APK” → 跑完在 **Artifacts** 下载
`changshengtian-app`。工作流已包含 `npm ci && npm run build:app`，会连站点一起打包。

> 这是 **debug 签名** 的 APK，自用直接装即可（需允许“安装未知来源应用”）。
> 要上架或长期分发再配 release 签名。

## 手机通知

后台每约 15 分钟轮询一次 `/api/notifications`，有新未读就弹系统通知，点开直达站内
`/notifications`。需要先在 App 里登录过一次；安卓 13+ 首次启动会请求通知权限。
省电策略下最小周期约 15 分钟，**不是秒推**。

## 改东西

- **换网址**：`package.json` 的 `build:app`（`VITE_API_BASE`）和
  `MainActivity.SITE` 两处要一起改
- **改名**：`app/src/main/res/values/strings.xml` 的 `app_name`
- **换图标**：`res/drawable/ic_launcher_*.xml` / `res/mipmap*/ic_launcher.xml`
- **包名 / 版本**：`app/build.gradle` 的 `applicationId` / `versionCode` / `versionName`

## 为什么不是纯 WebView 壳了

壳的好处是"网站更新 App 就更新"，代价是每次打开都要等网络下发整站资源。现在改成
**壳装资源、数据联网**：界面随包走本地，内容仍旧实时。站点改版时重新出一版 APK 即可；
只改数据不用动 App。
