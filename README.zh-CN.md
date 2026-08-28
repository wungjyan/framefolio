# Framefolio

[English](./README.md) | [简体中文](./README.zh-CN.md)

Framefolio 是一个自托管的极简摄影作品集。将照片放入数据目录并执行同步命令，即可生成适合网页浏览的图片和照片索引。

## 功能

- 响应式照片画廊，桌面端支持 Justified 与 Editorial 布局，移动端使用单列布局。
- 全屏照片查看器，支持前后切换、键盘操作和加载提示。
- 展示相机、镜头、35mm 等效焦距、光圈、快门、ISO 和拍摄日期等 EXIF 信息。
- 自动生成 WebP 缩略图和大图预览，原图不会通过网页公开。
- 增量同步照片，新增、修改或删除原图后无需重新构建应用。
- 支持浅色和深色主题。

支持 JPEG、PNG、TIFF 和 WebP 原图。HEIC、HEIF、AVIF、GIF 和相机 RAW 暂不支持。

默认访问地址：`http://localhost:3123`。

## 部署方式

### 方式一：直接使用 Docker Hub 镜像（推荐）

这种方式不需要克隆源码，也不需要在本机执行构建。镜像同时支持 `linux/amd64` 和 `linux/arm64`。

```bash
mkdir framefolio
cd framefolio
curl -LO https://raw.githubusercontent.com/wungjyan/framefolio/main/compose.image.yml
mkdir -p data/originals data/generated
```

将照片放入 `data/originals/`，然后拉取镜像、同步照片并启动：

```bash
docker compose -f compose.image.yml pull
docker compose -f compose.image.yml run --rm sync
docker compose -f compose.image.yml up -d gallery
```

默认使用 `wungjyan/framefolio:latest`。如需固定版本或修改端口，可在同一目录创建 `.env`：

```env
FRAMEFOLIO_IMAGE=wungjyan/framefolio:1.0.0
FRAMEFOLIO_PORT=3123
PUID=1000
PGID=1000
```

`PUID` 和 `PGID` 决定同步任务在宿主机写入文件时使用的用户身份。Linux 用户可通过 `id -u` 和 `id -g` 查询实际值；如果结果不是 `1000`，请相应修改。

### 方式二：从源码直接运行

适合本地使用和开发，需要 Node.js `^22.19.0`、`^24.11.0` 或 `>=26.0.0`，以及 pnpm 11。

```bash
git clone https://github.com/wungjyan/framefolio.git
cd framefolio
corepack enable
pnpm install
```

将照片放入 `data/originals/`，然后同步并启动：

```bash
pnpm gallery:sync
pnpm dev
```

如需以生产模式运行：

```bash
pnpm build
NITRO_HOST=0.0.0.0 NITRO_PORT=3123 node .output/server/index.mjs
```

### 方式三：从源码构建 Docker 镜像

适合需要自行修改代码或控制构建过程的用户，需要 Docker Engine 和 Docker Compose v2。

```bash
git clone https://github.com/wungjyan/framefolio.git
cd framefolio
cp .env.example .env
docker compose build
```

将照片放入 `data/originals/`，然后执行同步并启动站点：

```bash
docker compose run --rm sync
docker compose up -d gallery
```

## 更新照片

原图统一存放在：

```text
data/originals/
```

从源码直接运行时执行：

```bash
pnpm gallery:sync
```

使用本地构建镜像时执行：

```bash
docker compose run --rm sync
```

使用 Docker Hub 镜像时执行：

```bash
docker compose -f compose.image.yml run --rm sync
```

同步会更新 `data/photos.json` 和 `data/generated/`。站点运行期间也可以执行同步，完成后刷新页面即可，无需重启容器。

至少需要备份 `data/originals/`；如需避免恢复时重新生成图片，可以备份整个 `data/` 目录。

## 常用 Docker 命令

```bash
# 查看状态
docker compose ps

# 查看站点日志
docker compose logs -f gallery

# 停止服务
docker compose down
```

使用 Docker Hub 镜像时，在上述命令中加入 `-f compose.image.yml`。

## 发布 Docker Hub 镜像

维护者登录 Docker Hub 后，可以通过发布脚本构建并推送多架构镜像：

```bash
docker login
./scripts/docker-publish.sh 1.0.0
```

脚本默认推送以下镜像：

```text
wungjyan/framefolio:1.0.0
wungjyan/framefolio:latest
```

如需使用其他仓库、平台或 npm 镜像源，可通过环境变量覆盖：

```bash
IMAGE_REPOSITORY=example/framefolio \
PLATFORMS=linux/amd64,linux/arm64 \
NPM_REGISTRY=https://registry.npmjs.org \
./scripts/docker-publish.sh 1.0.0
```

设置 `PUBLISH_LATEST=false` 可只推送指定版本标签。
