# 配置参考

## 环境变量

| 变量 | 默认值 | 使用方 |
| --- | --- | --- |
| `NUXT_GALLERY_DATA_DIR` | `./data` | 服务和同步管线 |
| `NITRO_HOST` | 开发环境为 `localhost` | Nitro 服务 |
| `NITRO_PORT` | `3123` | Nitro 服务 |
| `foo-cli web --host` | `127.0.0.1` | Web 服务绑定地址 |
| `foo-cli web --port` | `3123` | Web 服务端口 |

## 数据契约

```text
NUXT_GALLERY_DATA_DIR/
├── originals/       # JPEG、PNG、TIFF 和 WebP 原图
├── generated/       # WebP 缩略图和预览图
└── photos.json      # 画廊索引
```

索引以 JSON 写入，并在返回公开字段前完成校验。每个照片条目包含稳定标识符、生成资源 URL、尺寸以及可选的 EXIF 字段。

## Turbo 输出

| 任务 | 所属方 | 输出或行为 |
| --- | --- | --- |
| `docs:build` | `framefolio-docs` | `docs/.vitepress/dist/**` |
| `docs:dev` | `framefolio-docs` | 持久运行的 VitePress 服务 |
| `docs:preview` | `framefolio-docs` | 持久运行的预览服务 |
| `typecheck` | `foo-cli`、`framefolio-docs` | TypeScript 类型检查 |

应用生命周期命令暴露在根 package 中，并通过 `pnpm exec` 委托给 `foo-cli`。当命令开始读取新的环境变量时，应在此处记录，并同步更新根目录入口。
