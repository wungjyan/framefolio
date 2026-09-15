# Framefolio

[English](./README.md) | [简体中文](./README.zh-CN.md)

Framefolio 是一个自托管的极简摄影作品集。将照片放入数据目录并执行同步，即可生成适合网页浏览的图片和照片索引。内置 `/admin` 管理端，可在浏览器里上传、删除、同步照片——手机也能用——日常更新照片不再需要进终端。

## 功能

- 响应式照片画廊，桌面端支持 Justified 与 Editorial 布局，移动端使用单列布局。
- 全屏照片查看器，支持前后切换、键盘操作和加载提示。
- 展示相机、镜头、35mm 等效焦距、光圈、快门、ISO 和拍摄日期等 EXIF 信息。
- 自动生成 WebP 缩略图和大图预览，原图不会通过网页公开。
- 增量同步照片，新增、修改或删除原图后无需重新构建应用。
- `/admin` 管理端：上传、删除、手动同步，并清楚显示「待同步」状态；移动端可用。
- 可选对象存储（兼容 S3，如 Cloudflare R2）加速，支持本地 / CDN 源切换；未上传的照片自动回退本地。
- 支持浅色和深色主题。

支持 JPEG、PNG、TIFF 和 WebP 原图。HEIC、HEIF、AVIF、GIF 和相机 RAW 暂不支持。

默认访问地址：`http://localhost:3123`。

## 先搞清楚：两个 compose 文件是什么

仓库里有**两个** compose 文件，用途不同，**平时只需要用其中一个**：

| 文件                 | 镜像来源                         | 什么时候用                                                |
| -------------------- | -------------------------------- | --------------------------------------------------------- |
| `compose.image.yml`  | 直接拉取 Docker Hub 上现成的镜像 | **推荐**。部署到 NAS 就用这个，不需要源码、不需要本机构建 |
| `docker-compose.yml` | 从本机源码构建镜像               | 只在你要**改代码**时用                                    |

**两者功能完全相同**（容器、挂载、环境变量、健康检查都一样），唯一区别就是「镜像从哪来」：

- 用 `compose.image.yml`：NAS 上不用装源码，也不用等几分钟构建
- 用 `docker-compose.yml`：会先执行 `docker compose build`，适合改完代码立刻验证

> 所以部署时**只用 `compose.image.yml`**，可以完全不理 `docker-compose.yml`。

## 部署方式

### 方式一：直接使用 Docker Hub 镜像（推荐，NAS 就用这个）

不需要源码，也不需要构建。镜像同时支持 `linux/amd64`（群晖/威联通常见的 Intel）和 `linux/arm64`（Apple Silicon、部分 ARM NAS）。

```bash
mkdir framefolio
cd framefolio
curl -LO https://raw.githubusercontent.com/wungjyan/framefolio/main/compose.image.yml
mkdir -p data/originals data/generated
```

创建 `.env`（**必须与 `compose.image.yml` 放在同一目录**）：

```env
FRAMEFOLIO_PORT=3123
PUID=1000
PGID=1000

# 使用管理端必须设置
FRAMEFOLIO_ADMIN_PASSWORD=换成你自己的强口令
```

然后拉取并启动：

```bash
docker compose -f compose.image.yml pull
docker compose -f compose.image.yml up -d gallery
```

打开 `http://你的地址:3123/admin`，输入口令登录，点「**立即同步**」，照片就会出现在首页。

`PUID` 和 `PGID` 决定写入文件时使用的用户身份。Linux / NAS 用户可通过 `id -u` 和 `id -g` 查询实际值；如果结果不是 `1000`，请相应修改，否则可能因权限不足导致同步失败。

> **以上三项就是本地模式所需的全部配置。** 不需要对象存储、不需要域名、不需要 CDN。

### 关于 S3 / 对象存储：暂时可以不配

**只用本地模式时，一个 `FRAMEFOLIO_S3_*` 变量都不需要设置。** 这是默认状态：

- 默认 `FRAMEFOLIO_STORAGE_SOURCE=local`，图片由本机 `/media/` 路由提供
- 没有配置对象存储时，同步只写本地文件，**不会尝试任何网络上传**
- 公开画廊、管理端、上传、删除、同步全部正常工作

什么时候才需要配：

| 你的情况                     | 要不要配 S3                          |
| ---------------------------- | ------------------------------------ |
| 只有自己看，访问速度可以接受 | **不用**，保持默认即可               |
| 外网访问慢，想用 CDN 加速    | 要配，见下方「对象存储（CDN 加速）」 |
| 已经买好了 R2 / OSS          | 要配                                 |

想以后再补也完全可以：**加配置 → 重启 → 在管理端切换**，不需要重新部署，也不需要重新处理已有图片。

> **从没有管理端的旧版本升级？** 索引格式已改变，公开画廊在你同步一次之前会显示错误状态。打开 `/admin` 点一次「立即同步」即可恢复。**首次同步会重新生成全部缩略图**（旧索引无法复用），之后都是增量同步。

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

**要使用管理端，启动时必须带上管理端口令**，否则 `/admin` 会显示「管理端未启用」：

```bash
FRAMEFOLIO_ADMIN_PASSWORD=你的口令 pnpm dev
```

> 命令行同步（`pnpm gallery:sync`）**不需要**管理端口令，它与管理端是独立的。

如需以生产模式运行：

```bash
FRAMEFOLIO_ADMIN_PASSWORD=你的口令 pnpm build
FRAMEFOLIO_ADMIN_PASSWORD=你的口令 NITRO_HOST=0.0.0.0 NITRO_PORT=3123 node .output/server/index.mjs
```

（构建本身不需要口令，运行时才需要。也可以把变量写进 `.env`，Nuxt 会自动读取。）

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

### 用管理端（推荐）

打开 `/admin`，登录后上传或删除照片，再点「**立即同步**」。

**上传和删除都不会立即生效。** 它们只是改动 `data/originals/` 里的文件；
网站上的内容由同步更新——同步是一个操作，内部依次完成「生成图片」和
「写索引」。管理端会一直显示还有多少改动待同步；删除后照片在你同步之前
**仍会显示在网站上**。

删除是把原图移入 `data/.trash/`，而不是直接抹掉，所以删错了可以恢复：
把文件移回原处再同步一次即可。`.trash/` 里的内容不会自动清理。

### 用命令行

命令行同步仍然保留，适合首次批量导入、Web 服务起不来时修复、以及脚本化。
它与网页触发**共用同一把锁**，两者不会同时运行。

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

### 同步会影响什么

同步会更新 `data/photos.json` 和 `data/generated/`。站点运行期间也可以执行同步，
完成后刷新页面即可，无需重启容器。

### 备份

至少备份 `data/originals/`——它是唯一不可再生的数据；
`data/photos.json` 可以通过同步从原图重建。

建议一并备份：`data/photos.json`、`data/.state/`（保存的设置）。

可以不备份：`data/generated/`（可重新生成）、`data/.trash/`（待彻底删除的软删除区）。

## 管理端

管理端位于 `/admin`，公开画廊**没有**指向它的入口，需要手动输入地址。
未设置 `FRAMEFOLIO_ADMIN_PASSWORD` 时管理端整体禁用（返回 404）。

由于 `/admin` 可被公网访问，**建议在反向代理层再加一层认证**（Cloudflare Access
或 HTTP Basic Auth）。`robots.txt` 与 `noindex` 响应头只是防止被搜索引擎收录，
**都不是访问控制**。

## 对象存储（CDN 加速）

图片可以改由任意兼容 S3 的对象存储提供（目标是 Cloudflare R2），同时本地磁盘
始终保留为回退方案。

1. 建好存储桶，并创建一个具有对象读写权限的 API Token。
2. 给桶绑定自定义域名。建议用自定义域名而不是 `r2.dev`——后者有速率限制且不走缓存。
3. 把 `FRAMEFOLIO_S3_*` 变量写入 `.env`（参见 `.env.example`）。
4. 重启后，在 `/admin` 里把访问源切到「对象存储」。

只要配置了对象存储，每次同步都会上传派生图，**与当前使用哪个源无关**。因此
**切换源不需要重新同步**，上传失败的照片也会在下次同步时自动补传。尚未上传的
照片会**逐张回退到本地**，所以部分上传不会产生白图。

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
