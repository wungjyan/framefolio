# Framefolio

Framefolio 是一个以照片展示为核心的极简摄影作品集。项目使用 Nuxt 4 构建，原始照片保存在运行时数据目录中，通过离线同步命令提取 EXIF，并生成适合网页加载的 WebP 缩略图和预览图。

> 当前进度：工程基线和照片同步管线已经完成。照片 API、媒体路由、Gallery 界面、Viewer 与 Docker 部署仍在开发中。

## 已实现能力

- 递归扫描 `data/originals`。
- 支持 JPEG、PNG、TIFF 和 WebP 输入。
- 根据相对路径生成稳定照片 ID。
- 根据文件大小、修改时间和处理版本执行增量同步。
- 选择性读取相机、镜头、焦距、光圈、快门、ISO 和拍摄时间，不读取 GPS。
- 自动校正 EXIF Orientation，并生成两种 sRGB WebP：
  - Thumbnail：最长边 960 px，质量 82。
  - Preview：最长边 2560 px，质量 88。
- 原子发布 `photos.json`，安全清理失效生成图。
- 单张照片失败时保留上一份可用索引，并以非零状态结束命令。

HEIC、HEIF、AVIF、GIF、相机 RAW 和多页图片暂不支持，可以在后续处理管线中按格式扩展。

## 环境要求

- Node.js `^22.19.0`、`^24.11.0` 或 `>=26.0.0`
- pnpm 11

建议通过 Corepack 使用项目声明的 pnpm 版本：

```bash
corepack enable
pnpm install
```

## 照片同步

将照片复制到：

```text
data/originals/
```

然后执行：

```bash
pnpm gallery:sync
```

同步结果写入：

```text
data/
├── originals/       # 原始照片，唯一数据源
├── generated/       # 自动生成的 WebP
└── photos.json      # 自动生成的照片索引
```

命令会报告本次新增、更新、跳过、删除和失败数量。未变化的照片不会重复处理；删除原图后，对应索引项和失效生成图会在下次同步时清理。

原图、生成图和 `photos.json` 都不会提交到 Git。需要备份时，至少应备份 `data/originals`；其余内容可以重新生成。

如需使用其他数据目录：

```bash
NUXT_GALLERY_DATA_DIR=/absolute/path/to/data pnpm gallery:sync
```

## 本地开发

```bash
pnpm dev
```

默认地址为 `http://localhost:3000`。当前浏览器端 Gallery 尚未实现，现阶段主要可独立验证照片同步管线。

## 提交前检查

```bash
pnpm test
pnpm typecheck
pnpm build
```

## 文档

- [产品需求](./docs/DEV.md)
- [开发计划与技术决策](./docs/IMPLEMENTATION_PLAN.md)
