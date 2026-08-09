# 原始素材 / Source plates

存放拍摄原图，**不参与构建**：这些文件不在 `public/` 下，所以不会进 `dist/`，
也不会被打进安卓 APK。站点上用的是 `tools/section-plates.py` 由它们压出来的
`public/persona/plate-*.webp`（438 KB，原图 36 MB）。

重新生成：

    python3 tools/section-plates.py
