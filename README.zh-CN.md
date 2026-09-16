# Framefolio

[English](./README.md) | **简体中文**

Framefolio 是一个自托管的极简摄影作品集。它将原始照片转换为适合网页浏览的图片，提取常用 EXIF 信息并生成索引，最终以响应式画廊对外展示。

日常管理可通过网页端完成，包括上传、删除和同步；命令行工具则适合批量导入、故障恢复与自动化场景。公开画廊只提供处理后的图片，不直接暴露原图。

## 主要功能

- 响应式照片画廊：桌面端提供 Justified 和 Editorial 两种布局，移动端使用单列布局。
- 全屏照片查看器：支持前后切换、键盘操作和加载状态提示。
- EXIF 展示：支持相机、镜头、35mm 等效焦距、光圈、快门、ISO 和拍摄日期等信息。
- 图片处理：自动生成 WebP 缩略图与大图预览，不通过网页公开原图。
- 增量同步：新增、修改或删除照片后，无需重新构建应用。
- 网页管理端：内置 `/admin`，支持上传、软删除、待同步状态和手动同步，并适配移动端。
- 对象存储：支持兼容 S3 的对象存储，可在本地与对象存储图片源之间切换。
- 浅色与深色主题。

支持的原图格式：JPEG、PNG、TIFF 和 WebP。暂不支持 HEIC、HEIF、AVIF、GIF 与相机 RAW。

默认访问地址：`http://localhost:3123`

## 快速开始

### 环境要求

- Docker Engine
- Docker Compose v2（使用 `docker compose` 命令）

### 1. 准备目录

```bash
mkdir framefolio
cd framefolio
curl -LO https://raw.githubusercontent.com/wungjyan/framefolio/main/compose.image.yml
mkdir -p data/originals
```

在 `compose.image.yml` 同目录创建 `.env`：

```env
FRAMEFOLIO_ADMIN_PASSWORD=replace-with-a-strong-password
```

这是启用网页管理端所需的唯一配置。本地存储模式下，其余选项均可使用默认值。

> 未设置 `FRAMEFOLIO_ADMIN_PASSWORD` 时，公开画廊仍可访问，但管理端接口会停用。

### 2. 启动服务

```bash
docker compose -f compose.image.yml up -d gallery
```

### 3. 添加照片

推荐使用管理端：

1. 打开 `http://<服务器地址>:3123/admin`。
2. 使用 `.env` 中配置的口令登录。
3. 选择或拖入照片。
4. 点击「立即同步」。

也可以将照片直接复制到 `data/originals/`，再进入 `/admin` 点击「立即同步」。同步完成后，照片会出现在公开画廊中。

> 上传或复制照片只会修改原图目录，不会自动更新公开画廊。同步会统一生成派生图片并更新照片索引。

## 照片管理与同步

### 网页管理端

管理端地址为 `/admin`。公开画廊不会显示管理端入口，需要直接访问该地址。

| 操作       | 说明                                        |
| ---------- | ------------------------------------------- |
| 上传照片   | 支持拖放、多选和移动端上传                  |
| 删除照片   | 将原图移入 `data/.trash/`，不会立即永久删除 |
| 立即同步   | 处理所有待发布变更并更新公开画廊            |
| 切换访问源 | 在本地与对象存储之间切换，立即生效          |

上传、删除和替换原图后，管理端会显示待同步数量。只有完成同步，相关变更才会反映到公开画廊。

### 命令行同步

命令行适合首次批量导入、网页服务不可用时重建索引，或接入自动化脚本。它与网页端同步共用同一把锁；已有同步任务运行时，后触发的任务会直接退出，避免同时写入索引。

使用 Docker Hub 镜像：

```bash
docker compose -f compose.image.yml run --rm sync
```

使用本地构建的镜像：

```bash
docker compose run --rm sync
```

从源码运行：

```bash
pnpm gallery:sync
```

命令行同步不需要管理端口令，但使用与网页端相同的同步管线和数据目录。

### 同步流程

```text
扫描 data/originals/
  → 生成缩略图和预览图，写入 data/generated/
  → 更新索引 data/photos.json
  → 清理不再被索引引用的派生图片
```

各类变更的发布时机如下：

| 操作     | 同步前                                     | 同步后           |
| -------- | ------------------------------------------ | ---------------- |
| 上传     | 公开画廊不变，管理端标记为待新增           | 照片出现在画廊中 |
| 删除     | 公开画廊仍显示照片，管理端标记为待删除     | 照片从画廊中移除 |
| 替换原图 | 公开画廊继续显示旧版本，管理端标记为待更新 | 画廊显示新版本   |

删除操作会将原图移入 `data/.trash/`。如需恢复，将文件移回 `data/originals/` 后重新同步即可；回收站不会自动清理。

## 配置

Docker Compose 会读取与 compose 文件同目录的 `.env`。完整配置示例见 [`.env.example`](./.env.example)。

### 管理端

| 变量                           | 默认值      | 说明                                                               |
| ------------------------------ | ----------- | ------------------------------------------------------------------ |
| `FRAMEFOLIO_ADMIN_PASSWORD`    | 空          | 管理端登录口令；为空时管理端 API 返回 404，`/admin` 显示未启用提示 |
| `FRAMEFOLIO_SESSION_TTL`       | `604800`    | 登录状态有效期，单位为秒，默认 7 天                                |
| `FRAMEFOLIO_SESSION_SECRET`    | 管理端口令  | 登录 Cookie 签名密钥；单独修改可在不更换口令的情况下使已有会话失效 |
| `FRAMEFOLIO_MAX_UPLOAD_BYTES`  | `104857600` | 单个上传文件的大小上限，默认 100 MB                                |
| `FRAMEFOLIO_MAX_UPLOAD_PIXELS` | `120000000` | 单张图片的总像素上限，默认 1.2 亿像素，用于控制解码时的内存占用    |

公开画廊不需要登录。启用管理端并不改变公开画廊的访问权限。

### 端口与镜像

| 变量               | 默认值                       | 说明                                             |
| ------------------ | ---------------------------- | ------------------------------------------------ |
| `FRAMEFOLIO_PORT`  | `3123`                       | 映射到宿主机的访问端口                           |
| `FRAMEFOLIO_IMAGE` | `wungjyan/framefolio:latest` | 使用的容器镜像；生产部署建议固定到明确的版本标签 |

### Linux 与 NAS 文件权限

容器默认以 `1000:1000` 运行。该身份必须能够写入宿主机的 `data/` 目录，否则上传、删除和同步会因权限不足而失败。

在 Linux 或 NAS 上，先查看 `data/` 的属主：

```bash
ls -ldn data
```

如果输出中的 UID 和 GID 不是 `1000 1000`，将实际值写入 `.env`。例如：

```env
PUID=1026
PGID=100
```

如果 `data/` 由当前账号创建，也可以使用以下命令查询：

```bash
id -u
id -g
```

写权限可通过以下命令验证：

```bash
docker compose -f compose.image.yml run --rm --entrypoint sh gallery \
  -c 'id && touch /app/data/.write-test && echo "可写 ✓" && rm /app/data/.write-test'
```

- 输出 `可写 ✓`：权限配置正常。
- 输出 `Permission denied`：检查 `PUID`、`PGID` 与 `data/` 目录属主是否一致。

macOS 和 Windows 的 Docker Desktop 通常不强制挂载目录使用相同 UID/GID，因此一般无需修改这两个变量。上述写权限测试在 Linux 和 NAS 上最有参考价值。

> `PUID` 和 `PGID` 同时作用于 `gallery` 与 `sync` 服务，因为两个服务都会写入 `data/`。

## 对象存储与 CDN

Framefolio 支持兼容 S3 的对象存储，例如 Cloudflare R2、AWS S3、阿里云 OSS 和 MinIO。未配置对象存储时，所有图片均由本地服务提供。

### 工作方式

对象存储配置完整后，每次同步都会同时保留本地派生图，并将缩略图和预览图上传到对象存储。`FRAMEFOLIO_STORAGE_SOURCE` 只决定公开画廊当前使用哪一类图片 URL，不控制是否上传：

| `FRAMEFOLIO_STORAGE_SOURCE` | 公开画廊使用的图片源                                        | 同步时上传对象存储   |
| --------------------------- | ----------------------------------------------------------- | -------------------- |
| `local`                     | 本地 `/media/...` 地址                                      | 是，只要 S3 配置完整 |
| `r2`                        | `FRAMEFOLIO_S3_PUBLIC_BASE_URL`；未上传成功的照片回退到本地 | 是                   |

这种设计允许对象存储在本地访问模式下持续保持最新，之后可直接切换，无需重新处理照片。上传失败不会中断本地发布；失败的照片会继续使用本地地址，并在后续同步中重试。

> 管理端选择的图片源会保存到 `data/.state/storage.json`，并优先于 `FRAMEFOLIO_STORAGE_SOURCE`。因此，该环境变量是首次运行时的初始值，而不是每次启动时强制覆盖管理端选择。

### Cloudflare R2 配置示例

以下内容仅以 Cloudflare R2 演示完整配置流程，并不表示 Framefolio 只支持 R2。其他兼容 S3 的服务同样可以使用，只需根据服务商文档替换 Endpoint、Region、访问凭据和寻址方式等配置。

1. 创建一个 R2 存储桶。
2. 创建 R2 API 令牌，权限选择「**对象读和写**」，并尽量限制到 Framefolio 使用的特定存储桶。Framefolio 需要上传、列举和删除对象，不需要「管理员读和写」权限。具体步骤可参考 [Cloudflare R2 API 令牌文档](https://developers.cloudflare.com/r2/api/tokens/)。
3. 为存储桶配置公开访问地址。生产环境建议绑定自定义域名；`r2.dev` 更适合测试。
4. 将配置写入 `.env`：

```env
# 初始访问源：local 或 r2
FRAMEFOLIO_STORAGE_SOURCE=local

# R2 S3 API 地址，不要在末尾添加存储桶名称
FRAMEFOLIO_S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
FRAMEFOLIO_S3_REGION=auto
FRAMEFOLIO_S3_BUCKET=example-bucket
FRAMEFOLIO_S3_ACCESS_KEY_ID=example-access-key
FRAMEFOLIO_S3_SECRET_ACCESS_KEY=example-secret-key

# 存储桶的公开访问地址，例如绑定的自定义域名
FRAMEFOLIO_S3_PUBLIC_BASE_URL=https://img.example.com

# 可选：专用存储桶通常留空
FRAMEFOLIO_S3_PREFIX=
FRAMEFOLIO_S3_FORCE_PATH_STYLE=false
```

`FRAMEFOLIO_S3_ENDPOINT` 是 S3 API 服务地址，存储桶名称应单独填写在 `FRAMEFOLIO_S3_BUCKET` 中。例如，不要写成 `https://<account-id>.r2.cloudflarestorage.com/example-bucket`。

创建令牌后，Cloudflare 会提供 Access Key ID 和 Secret Access Key，分别对应 `FRAMEFOLIO_S3_ACCESS_KEY_ID` 与 `FRAMEFOLIO_S3_SECRET_ACCESS_KEY`。Secret Access Key 通常只显示一次，应妥善保存且不要提交到代码仓库。

### 变量说明

| 变量                              | 默认值  | 说明                               |
| --------------------------------- | ------- | ---------------------------------- |
| `FRAMEFOLIO_STORAGE_SOURCE`       | `local` | 初始图片源，可设为 `local` 或 `r2` |
| `FRAMEFOLIO_S3_ENDPOINT`          | 空      | S3 API 服务地址，不包含存储桶名称  |
| `FRAMEFOLIO_S3_REGION`            | `auto`  | S3 区域；Cloudflare R2 使用 `auto` |
| `FRAMEFOLIO_S3_BUCKET`            | 空      | 存储桶名称                         |
| `FRAMEFOLIO_S3_ACCESS_KEY_ID`     | 空      | S3 Access Key ID                   |
| `FRAMEFOLIO_S3_SECRET_ACCESS_KEY` | 空      | S3 Secret Access Key               |
| `FRAMEFOLIO_S3_PUBLIC_BASE_URL`   | 空      | 浏览器访问图片时使用的公开基础地址 |
| `FRAMEFOLIO_S3_PREFIX`            | 空      | 添加到所有对象键前的可选目录前缀   |
| `FRAMEFOLIO_S3_FORCE_PATH_STYLE`  | `false` | 是否使用路径形式访问 S3 API        |

#### `FRAMEFOLIO_S3_PREFIX`

该变量用于在存储桶中为 Framefolio 对象添加统一前缀，适合多个站点或应用共用一个存储桶。例如：

```env
FRAMEFOLIO_S3_PREFIX=framefolio
```

对象会保存为：

```text
framefolio/<派生图标识>-thumbnail.webp
framefolio/<派生图标识>-preview.webp
```

如果存储桶只供一个 Framefolio 实例使用，建议留空。

> 已经完成对象存储同步后，不建议直接修改前缀。当前索引会记录照片是否已上传，但仅修改前缀不会让未变化的照片自动重新上传。确需调整时，应先保持本地图片源，将旧前缀下的对象迁移到新前缀，再通过管理端确认远端对象完整后切换访问源。

#### `FRAMEFOLIO_S3_FORCE_PATH_STYLE`

该变量控制 S3 API 请求中的存储桶寻址方式：

- `false`：虚拟主机形式，例如 `https://<bucket>.<endpoint>/<object>`。
- `true`：路径形式，例如 `https://<endpoint>/<bucket>/<object>`。

Cloudflare R2、AWS S3 和多数云对象存储通常保持 `false`；MinIO 等自托管 S3 服务通常需要设为 `true`。该变量只影响 Framefolio 调用 S3 API 的方式，不影响 `FRAMEFOLIO_S3_PUBLIC_BASE_URL`。

### 启用与检查

修改 `.env` 后重新创建 `gallery` 服务：

```bash
docker compose -f compose.image.yml up -d gallery
```

进入 `/admin` 检查对象存储连接状态，然后执行一次同步。已有照片只有在同步后才会上传到新配置的对象存储。确认远端对象完整后，可在管理端将访问源切换为「对象存储」。

`FRAMEFOLIO_S3_PUBLIC_BASE_URL` 仅用于拼接公开图片 URL，可以填写 R2 自定义域名、`r2.dev` 或其他 S3 服务的公开地址。未提供公开地址时，即使对象已经上传，公开画廊也会继续使用本地图片地址。

## 数据与备份

| 路径               | 内容                 | 备份建议                         |
| ------------------ | -------------------- | -------------------------------- |
| `data/originals/`  | 原始照片             | 必须备份，这是主要的不可再生数据 |
| `data/photos.json` | 照片索引与 EXIF 信息 | 建议备份，可减少重建时间         |
| `data/.state/`     | 存储源等运行状态     | 建议备份                         |
| `data/generated/`  | WebP 缩略图与预览图  | 可选，可通过同步重新生成         |
| `data/.trash/`     | 已删除的原图         | 按恢复需求决定；不会自动清理     |

`data/photos.json` 和 `data/generated/` 都可以根据 `data/originals/` 重新生成。备份恢复后运行一次同步，即可重建公开画廊。

## 更新与运维

查看服务状态：

```bash
docker compose -f compose.image.yml ps
```

查看日志：

```bash
docker compose -f compose.image.yml logs -f gallery
```

停止服务：

```bash
docker compose -f compose.image.yml down
```

更新镜像并重新创建服务：

```bash
docker compose -f compose.image.yml pull
docker compose -f compose.image.yml up -d gallery
```

生产环境建议通过 `FRAMEFOLIO_IMAGE` 固定版本标签，并在更新前备份 `data/originals/`。

### 从旧版本升级

如果旧版 `data/photos.json` 与当前索引格式不兼容，公开画廊会提示索引需要重建。此时进入 `/admin` 执行一次「立即同步」，或运行命令行同步。

首次重建可能需要重新生成所有派生图片；后续同步会恢复为增量处理。照片数量较多时，可使用命令行同步查看实时进度。

## 安全建议

- 为 `FRAMEFOLIO_ADMIN_PASSWORD` 设置随机且足够长的口令。
- 管理端暴露到公网时，建议在反向代理层增加 Cloudflare Access、HTTP Basic Auth 等额外认证。
- 仅通过 HTTPS 访问公网部署，避免登录凭据和会话 Cookie 经明文传输。
- 定期备份 `data/originals/`，并根据需要备份 `data/.trash/`。

`robots.txt` 和 `noindex` 响应头只用于降低管理端被搜索引擎收录的可能性，不属于访问控制措施。未登录访问者仍能打开 `/admin` 登录页，真正的访问保护来自管理端口令及反向代理认证。

## 从源码运行

### 环境要求

- Node.js `^22.19.0`、`^24.11.0` 或 `>=26.0.0`
- pnpm 11

```bash
git clone https://github.com/wungjyan/framefolio.git
cd framefolio
corepack enable
pnpm install
```

开发模式：

```bash
pnpm dev
```

开发模式会依次读取 `.env` 和 `.env.local`。适合本机使用的配置可写入已被 Git 忽略的 `.env.local`：

```env
FRAMEFOLIO_ADMIN_PASSWORD=replace-with-a-local-password
```

生产模式：

```bash
pnpm build
FRAMEFOLIO_ADMIN_PASSWORD=replace-with-a-strong-password \
  NITRO_HOST=0.0.0.0 \
  NITRO_PORT=3123 \
  node .output/server/index.mjs
```

构建阶段不需要管理端口令，运行阶段才会读取相关配置。

### 配置加载规则

| 运行方式                        | `.env` | `.env.local`     | 进程环境变量 |
| ------------------------------- | ------ | ---------------- | ------------ |
| `pnpm dev`                      | 读取   | 读取，优先级更高 | 最高优先级   |
| `pnpm gallery:sync`             | 读取   | 读取，优先级更高 | 最高优先级   |
| `node .output/server/index.mjs` | 读取   | 不读取           | 最高优先级   |
| Docker Compose                  | 读取   | 不传入容器       | 最高优先级   |

服务启动时会记录实际加载的配置键名，但不会输出配置值。

### 从源码构建容器镜像

仓库包含两个 Compose 文件：

| 文件                 | 镜像来源                     | 适用场景             |
| -------------------- | ---------------------------- | -------------------- |
| `compose.image.yml`  | 拉取已发布的 Docker Hub 镜像 | 常规部署，推荐       |
| `docker-compose.yml` | 根据本地源码构建镜像         | 开发、调试或定制代码 |

从源码构建并启动：

```bash
git clone https://github.com/wungjyan/framefolio.git
cd framefolio
cp .env.example .env
# 编辑 .env，至少设置管理端口令
docker compose build
docker compose up -d gallery
```

两个 Compose 文件提供相同的服务、挂载、环境变量和健康检查，区别仅在于镜像来源。

### 开发命令

```bash
pnpm dev          # 启动开发服务器
pnpm build        # 构建生产版本
pnpm test         # 运行单元测试
pnpm typecheck    # 运行类型检查
pnpm lint         # 运行代码检查
pnpm format       # 格式化代码与文档
```

## 常见问题

### `/admin` 显示“管理端未启用”

`FRAMEFOLIO_ADMIN_PASSWORD` 未设置或为空。补充配置后重新创建 `gallery` 服务：

```bash
docker compose -f compose.image.yml up -d gallery
```

公开画廊不受影响，仍可正常访问。

### 同步时出现 `EACCES` 或 `Permission denied`

容器运行身份与 `data/` 目录权限不匹配。Linux 和 NAS 用户可参考 [Linux 与 NAS 文件权限](#linux-与-nas-文件权限) 检查 `PUID` 与 `PGID`。

### 已上传照片，但公开画廊没有变化

上传和复制文件不会自动发布。进入 `/admin` 点击「立即同步」，或运行：

```bash
docker compose -f compose.image.yml run --rm sync
```

### 已删除照片，但公开画廊仍在显示

删除操作只会将原图移入 `data/.trash/`。完成下一次同步后，照片才会从公开画廊中移除。

### 对象存储已配置，但管理端无法切换

检查所有必需的 `FRAMEFOLIO_S3_*` 变量是否已传入容器，并在修改 `.env` 后重新创建 `gallery` 服务。可通过以下命令检查日志：

```bash
docker compose -f compose.image.yml logs gallery
```

## 维护者：发布 Docker 镜像

<details>
<summary>展开发布说明</summary>

登录 Docker Hub 后，可通过发布脚本构建并推送多架构镜像：

```bash
docker login
./scripts/docker-publish.sh 1.0.0
```

默认推送：

```text
wungjyan/framefolio:1.0.0
wungjyan/framefolio:latest
```

仓库、构建平台和 npm 镜像源可以通过环境变量覆盖：

```bash
IMAGE_REPOSITORY=example/framefolio \
PLATFORMS=linux/amd64,linux/arm64 \
NPM_REGISTRY=https://registry.npmjs.org \
./scripts/docker-publish.sh 1.0.0
```

设置 `PUBLISH_LATEST=false` 可只推送指定版本标签。

</details>

## 许可证

本项目基于 [MIT License](./LICENSE) 开源。
