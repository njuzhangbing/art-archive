# 长生天计划 · 安卓 App

一个极薄的 **WebView 壳**：打开即加载线上站点 `https://ptrart.netlify.app/`。
所有页面、功能、数据都来自网站本身——**网站更新，App 内容就跟着更新，永远不用重装 App**。

- 兼容 **Android 5.0（API 21）及以上**，覆盖绝大多数设备
- 系统 WebView 渲染，等同"直连网站"
- 支持站内导航、登录态 Cookie、**文件上传**（图片 / 视频 / PSD，含多选）、外链跳浏览器、下载交给浏览器
- 返回键 = 网页后退；旋转不重载；断网显示重试页

## 拿到 APK 的两种方式

### A. 云端自动编译（推荐，本机不用装任何东西）
1. 把本仓库（含 `android/` 和 `.github/workflows/android.yml`）推到 GitHub
2. 进 GitHub 仓库 → **Actions** → 选 “Build Android APK” 这次运行（push 后会自动跑；也可点 “Run workflow” 手动触发）
3. 跑完后在该运行页面底部 **Artifacts** 里下载 `changshengtian-app`，解压得到 `app-debug.apk`
4. 传到手机安装（需在系统里允许“安装未知来源应用”）

> 这是 **debug 签名** 的 APK，自用/小圈子直接装即可。要上架或长期分发再配 release 签名。

### B. 本地用 Android Studio
1. Android Studio 打开 `android/` 目录，等待 Gradle 同步（会自动补全 Gradle Wrapper 与 SDK）
2. Run ▶ 直接装到手机，或 Build → Build APK(s)

## 改东西
- **换网址**（比如以后绑了自定义域名）：改 `app/src/main/java/com/changshengtian/archive/MainActivity.kt` 里的 `startUrl` 和 `host`
- **改名**：`app/src/main/res/values/strings.xml` 的 `app_name`
- **换图标**：替换 `res/drawable/ic_launcher_*.xml` / `res/mipmap*/ic_launcher.xml`（现为红底白菱形矢量图）
- **包名 / 版本**：`app/build.gradle` 的 `applicationId` / `versionCode` / `versionName`

## 为什么不用 TWA / 不打包网页
你要“高兼容 + 不用定期更新 + 像直连网站”。WebView 壳最契合：它不内置任何网页资源，只是个浏览器窗口指向你的线上站，因此功能迭代全在服务端完成，App 本体几乎永不需要更新。
