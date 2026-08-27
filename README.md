# Framefolio

Framefolio 是一个以照片展示为核心的极简摄影作品集。项目使用 Nuxt 4 构建，原始照片保存在运行时数据目录中，通过离线同步命令提取 EXIF，并生成适合网页加载的 WebP 缩略图和预览图。

> 当前进度：可部署 MVP 已完成，包含照片同步管线、只读照片 API、媒体路由、响应式 Gallery、Photo Viewer，以及基于单一镜像的 Docker Compose 部署流程。

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
- 通过 `GET /api/photos` 返回不含内部同步字段的公开照片数据。
- 通过 `GET /media/:filename` 安全提供带长期缓存的 WebP 生成图。
- 提供响应式 Gallery 页面外壳、图片比例占位、加载状态和移动端基础照片流。
- 桌面端支持 Editorial 与 Justified 布局切换，移动端固定使用单列照片流。
- 点击照片可进入全屏 Viewer，支持关闭、非循环前后导航、方向键与 `Escape`。
- Viewer 锁定背景滚动、约束焦点并在关闭后返回原照片，按已有字段显示极简 EXIF。
- 支持浅色 / 深色双主题：首次访问跟随系统偏好，手动切换后记住选择；移动端同样显示切换按钮，刷新无闪屏。

HEIC、HEIF、AVIF、GIF、相机 RAW 和多页图片暂不支持，可以在后续处理管线中按格式扩展。

## 环境要求

使用 Docker 部署仅需要：

- Docker Engine 及 Docker Compose v2

本地开发需要：

- Node.js `^22.19.0`、`^24.11.0` 或 `>=26.0.0`
- pnpm 11

建议通过 Corepack 使用项目声明的 pnpm 版本：

```bash
corepack enable
pnpm install
```

## Docker 部署

复制环境变量示例，并确保运行时目录存在：

```bash
cp .env.example .env
mkdir -p data/originals data/generated
```

Linux 主机建议将 `.env` 中的 `PUID`、`PGID` 改为部署用户的实际值，可分别通过 `id -u` 和 `id -g` 查询。这样同步容器生成的文件仍归当前宿主机用户所有。

构建镜像并启动站点：

```bash
docker compose up -d --build
```

默认访问地址为 `http://localhost:3123`。如需修改宿主机端口，请调整 `.env` 中的 `FRAMEFOLIO_PORT`。

`gallery` 服务以只读方式挂载 `./data`，只负责运行 Nuxt 和提供照片；`docker compose up -d` 不会启动同步服务。`sync` 服务复用完全相同的镜像，仅在显式执行时以可读写方式挂载数据目录。

### 导入和更新照片

将原图复制到 `data/originals/`，然后执行：

```bash
docker compose run --rm sync
```

新增、修改或删除原图后都使用同一条命令。同步会原子更新 `photos.json` 和生成图；完成后刷新网页即可，不需要重新构建镜像，也不需要重启 `gallery`。

### 日常运维

查看服务和健康状态：

```bash
docker compose ps
```

查看站点日志：

```bash
docker compose logs -f gallery
```

拉取基础镜像更新并重建应用：

```bash
docker compose build --pull
docker compose up -d
```

停止容器：

```bash
docker compose down
```

`down`、重建容器和重建镜像都不会删除绑定挂载的 `./data`。备份时至少保留 `data/originals/`；如需快速恢复且不希望重新处理图片，可备份整个 `data/`。

### Docker 故障排查

- `sync` 报 `EACCES`：确认 `data` 目录允许 `.env` 中的 `PUID:PGID` 读写；Linux 主机通常应设置为 `id -u`、`id -g` 的结果。
- 端口已被占用：修改 `.env` 中的 `FRAMEFOLIO_PORT`，然后重新执行 `docker compose up -d`。
- `gallery` 显示 `unhealthy`：先运行 `docker compose logs gallery`；健康检查会请求容器内的 `/favicon.ico`，因此不依赖照片索引是否已经生成。
- 页面没有新照片：确认同步命令以成功状态结束，再检查 `data/photos.json` 和 `data/generated/` 的修改时间。同步失败时命令会返回非零状态并列出具体文件。
- 更换 CPU 架构或部署主机：在目标主机重新执行 `docker compose build --pull`，让 Sharp 使用与目标平台匹配的运行时依赖。

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

Docker 部署固定将宿主机的 `./data` 挂载到容器 `/app/data`，无需修改该变量。

## 本地开发

```bash
pnpm dev
```

默认地址为 `http://localhost:3123`。桌面端可以切换 Editorial 与 Justified，移动端自动使用单列布局。右上角图标可切换浅色 / 深色主题。点击任意照片可打开 Viewer；使用左右方向键切换照片，按 `Escape` 关闭。

同步完成并启动开发服务器后，可以访问：

```text
http://localhost:3123/api/photos
http://localhost:3123/media/<生成图片文件名>
```

媒体路由只允许读取 `data/generated` 中符合指纹命名规则的 WebP，不会公开原图。

## 提交前检查

```bash
pnpm test
pnpm typecheck
pnpm build
```

## 文档

- [产品需求](./docs/DEV.md)
- [开发计划与技术决策](./docs/IMPLEMENTATION_PLAN.md)
