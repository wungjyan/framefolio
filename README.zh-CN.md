# Framefolio

[English](./README.md) | [简体中文](./README.zh-CN.md)

Framefolio 是一个自托管的极简摄影作品集。它把原始照片转换成适合网页浏览的图片，并生成照片索引，然后以一个干净的画廊呈现出来。

照片的管理方式有两种：**网页管理端**（推荐，手机也能用）和**命令行**（进阶，用于批量导入或应急）。日常使用只需要前一种。

## 功能

- 响应式照片画廊，桌面端支持 Justified 与 Editorial 两种布局，移动端单列显示。
- 全屏照片查看器，支持前后切换、键盘操作和加载提示。
- 展示相机、镜头、35mm 等效焦距、光圈、快门、ISO 和拍摄日期等 EXIF 信息。
- 自动生成 WebP 缩略图与大图预览，**原图永远不会通过网页公开**。
- 增量同步：新增、修改或删除照片后不需要重新构建应用。
- 内置 `/admin` 管理端：上传、删除、手动同步，清楚显示「待同步」状态，移动端可用。
- 可选对象存储（兼容 S3，例如 Cloudflare R2）加速，支持本地 / CDN 源切换。
- 浅色与深色主题。

支持的原图格式：JPEG、PNG、TIFF、WebP。暂不支持 HEIC、HEIF、AVIF、GIF 和相机 RAW。

默认访问地址：`http://localhost:3123`。

---

## 快速开始

先用最快的方式把它跑起来，之后再按需调整。**只有三步。**

### 第一步：准备目录与配置

```bash
mkdir framefolio
cd framefolio
curl -LO https://raw.githubusercontent.com/wungjyan/framefolio/main/compose.image.yml
mkdir -p data/originals
```

创建 `.env` 文件（**必须与 `compose.image.yml` 放在同一目录**）：

```env
# 管理端口令：自己设一个强口令
FRAMEFOLIO_ADMIN_PASSWORD=换成你自己的强口令
```

> **就这一项。** 其余全部有合理默认值，本地存储模式下不需要任何其他配置。
> [配置说明](#配置说明)会解释什么时候才需要加别的。

### 第二步：启动

```bash
docker compose -f compose.image.yml up -d gallery
```

### 第三步：把照片放进站点

有两种方式，任选其一：

**方式 A：用管理端上传（推荐）**

1. 浏览器打开 `http://你的地址:3123/admin`
2. 输入刚才设的口令登录
3. 选择照片上传
4. 点「**立即同步**」

**方式 B：直接拷文件**

把照片放进 `data/originals/`（拖拽即可），然后在 `/admin` 里点「**立即同步**」。

> **注意**：上传或拷入照片后，网站**不会自动更新**。你需要点一次「立即同步」——
> 这一步同时完成「生成缩略图」和「更新索引」。详见[同步到底做了什么](#同步到底做了什么)。

完成。打开首页就能看到照片了。

---

## 日常使用

### 方式一：管理端（推荐）

打开 `/admin`（公开画廊**没有**指向它的入口，需要手动输入地址）。

你能在这里做的事：

| 操作       | 说明                              |
| ---------- | --------------------------------- |
| 上传照片   | 支持拖拽、多选，手机也能用        |
| 删除照片   | 移入回收站，**可以恢复**          |
| 立即同步   | 让改动生效的唯一入口              |
| 切换访问源 | 本地 / 对象存储之间切换，即时生效 |

**记住一条规则就够：上传和删除都不会立刻生效，点「立即同步」之后才会。**

管理端会一直显示还有多少改动待同步，所以你不用自己记。

### 方式二：命令行（进阶，可选）

命令行同步适合这些场景：

- **首次导入几百张照片**：在终端能看到实时输出，比在网页上等更可靠
- **网页服务起不来时修复**：能用命令行重建索引
- **脚本化 / 自动化**：需要一个可直接调用的命令

它与网页触发**共用同一把锁**，所以两者不会同时运行（同时触发时后来者会直接退出并提示）。

```bash
# 使用 Docker Hub 镜像（与快速开始同一目录）
docker compose -f compose.image.yml run --rm sync
```

```bash
# 从源码直接运行
pnpm gallery:sync
```

```bash
# 使用本地构建的镜像
docker compose run --rm sync
```

> **命令行不需要管理端口令。** 它与管理端是独立的两条路径，只是共用同一个同步管线。

### 同步到底做了什么

这是整套设计里最需要理解的一点：**同步是一个操作，不是两个。**

```text
扫描 data/originals/
  → 生成缩略图和预览图（写入 data/generated/）
  → 写入索引 data/photos.json
  → 清理不再被引用的旧图
```

生成图片和更新索引是同一个操作的先后两步。所以「同步」既产出图片、也让网站更新。

由此得到三条一致的行为：

| 你的操作 | 点「立即同步」之前                 | 之后         |
| -------- | ---------------------------------- | ------------ |
| 上传     | 网站**不变**，管理端标记「待新增」 | 出现在网站上 |
| 删除     | 网站上**仍然显示**，标记「待删除」 | 从网站消失   |
| 替换原图 | 网站**仍是旧图**，标记「待更新」   | 更新为新图   |

> **最容易忘的是删除**：原图已经进回收站了，但网站上还看得见——直到你同步。

### 备份

```text
必备份：   data/originals/        ← 唯一的不可再生数据
建议备份： data/photos.json、data/.state/
可以不备： data/generated/        ← 可重新生成
          data/.trash/            ← 回收站
```

`photos.json` 可以从 `originals/` 重建（同步一次即可），但它记录了每张照片的
EXIF 与状态，一起备份能省去重建时间。`.state/` 保存你的设置（比如选择的访问源）。

---

## 配置说明

所有配置都写在**与 compose 文件同目录**的 `.env` 里。下面按「是否必需」分组。

### 必需项

只有一项：

```env
FRAMEFOLIO_ADMIN_PASSWORD=你的强口令
```

| 变量                        | 说明                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------- |
| `FRAMEFOLIO_ADMIN_PASSWORD` | 管理端口令。**不设置时管理端接口全部返回 404**，`/admin` 页面会提示「管理端未启用」。 |

> 公开画廊**不需要**任何口令，任何人访问首页都能浏览照片。这是设计如此。

### Linux / NAS 用户必看：`PUID` 与 `PGID`

**在 Linux 和 NAS 上部署，这一项必须设置。** macOS / Windows 不用管。

容器以 `user: PUID:PGID` 运行，默认是 `1000:1000`。这个身份要能**写入 `data/` 目录**，
否则同步会失败。`data/` 的属主是创建它的那个用户，所以：

**第一步：查出正确的值**

```bash
id -u    # 输出你的 UID，例如 1026
id -g    # 输出你的 GID，例如 100
```

> 如果 `data/` 不是你本人创建的（例如由其他账号或安装脚本建立），请查目录属主而不是当前用户：
>
> ```bash
> ls -ldn data
> # drwxr-xr-x 2 1026 100 ...   ← 这两个数字就是 PUID 和 PGID
> ```

**第二步：写进 `.env`**

```env
PUID=1026
PGID=100
```

**第三步：确认配对成功**

不用真的跑同步，直接验证能否写入：

```bash
docker compose -f compose.image.yml run --rm --entrypoint sh gallery \
  -c 'id && touch /app/data/.write-test && echo "可写 ✓" && rm /app/data/.write-test'
```

- 看到 `可写 ✓` → 配置正确
- 看到 `Permission denied` → `PUID` / `PGID` 填错了，回到第一步

> 这条命令只在 **Linux / NAS 上能反映真实情况**。macOS 和 Windows 的 Docker Desktop
> 不强制 UID，即使 `PUID` 填错也会显示「可写」——所以桌面系统上它不能用来判断配置对错
> （但桌面系统本来也不需要设置，见下表）。

**配错时的症状**：容器能正常启动，`/admin` 也能打开，但**一按「立即同步」就报权限错误**
（`EACCES` / `Permission denied`）。命令行同步同样失败。这是最容易误判成「程序坏了」的情况——
其实只是身份不匹配。

| 平台                                       | 需要设置吗                                     |
| ------------------------------------------ | ---------------------------------------------- |
| **Linux / NAS（群晖、威联通、Unraid 等）** | **需要**。默认的 `1000` 几乎肯定不是你的用户   |
| macOS / Windows 上的 Docker Desktop        | **不用**。桌面版的挂载不强制 UID，设不设都能写 |

> **为什么两个容器都需要它**：管理端容器（上传、删除、同步）和命令行容器都会写入
> `data/`，所以 `PUID` / `PGID` 对两者都生效。它不是命令行专属配置。
>
> **只需要写权限**：镜像内的程序代码对所有用户可读，所以只有 `data/` 需要身份匹配。
> 你不需要为「读代码」做任何额外配置。

### 常用可选项

```env
FRAMEFOLIO_PORT=3123
FRAMEFOLIO_IMAGE=wungjyan/framefolio:1.0.0
```

| 变量                           | 默认                         | 说明                                                                        |
| ------------------------------ | ---------------------------- | --------------------------------------------------------------------------- |
| `FRAMEFOLIO_PORT`              | `3123`                       | 对外访问端口                                                                |
| `FRAMEFOLIO_IMAGE`             | `wungjyan/framefolio:latest` | 镜像版本。建议固定版本号，避免 `latest` 意外升级                            |
| `FRAMEFOLIO_SESSION_TTL`       | `604800`（7 天）             | 登录状态有效期（秒）                                                        |
| `FRAMEFOLIO_SESSION_SECRET`    | 同管理端口令                 | 用于签名登录 Cookie。一般不用设；单独设置可在不改口令的情况下让所有登录失效 |
| `FRAMEFOLIO_MAX_UPLOAD_BYTES`  | `104857600`（100 MB）        | 单个上传文件大小上限                                                        |
| `FRAMEFOLIO_MAX_UPLOAD_PIXELS` | `120000000`                  | 单张像素上限，防止超大图耗尽内存                                            |

### 进阶：对象存储 / CDN

**只使用本地存储时，一个都不需要配置。** 这是默认状态，也是绝大多数自用场景的推荐配置。

需要它的典型情况：外网访问图片慢，想用 CDN 加速；或你有大量照片、想让 NAS 少承担出网带宽。

配置方式见下方[对象存储（CDN 加速）](#对象存储cdn-加速)。

---

## 对象存储（CDN 加速）

图片可以改由任意兼容 S3 的对象存储提供（目标是 Cloudflare R2，也支持阿里云 OSS、
AWS S3、自建 MinIO 等）。**本地磁盘始终保留，作为逐张回退方案。**

### 配置步骤

1. 建好存储桶，创建一个具有**对象读写权限**的 API Token。
2. 给存储桶绑定自定义域名。
   > 建议用自定义域名，而不是 `r2.dev`——后者有速率限制且不走 CDN 缓存。
3. 把以下变量写入 `.env`：

```env
FRAMEFOLIO_STORAGE_SOURCE=local

FRAMEFOLIO_S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
FRAMEFOLIO_S3_REGION=auto
FRAMEFOLIO_S3_BUCKET=你的桶名
FRAMEFOLIO_S3_ACCESS_KEY_ID=你的AccessKey
FRAMEFOLIO_S3_SECRET_ACCESS_KEY=你的SecretKey

# 公开访问地址：填你的自定义域名
FRAMEFOLIO_S3_PUBLIC_BASE_URL=https://img.example.com
```

4. 重启容器，然后在 `/admin` 里把访问源切到「**对象存储**」。

### 它如何工作

只要配置了对象存储，**每次同步都会上传派生图**，与你当前使用哪个源无关。这带来三个好处：

- **切换源不需要重新同步**——只是换个 URL 前缀，文件名完全相同
- **上传失败会自愈**——下次同步自动补传，不会一直失败下去
- **未上传的照片逐张回退本地**——部分上传不会出现白图

`FRAMEFOLIO_S3_PUBLIC_BASE_URL` 只是一个字符串前缀。填自定义域名、`r2.dev`
或 MinIO 地址，代码行为完全相同，没有任何分支。

<details>
<summary>其他可选变量</summary>

| 变量                             | 说明                                    |
| -------------------------------- | --------------------------------------- |
| `FRAMEFOLIO_S3_PREFIX`           | 对象键前缀，便于多个站点共用一个桶      |
| `FRAMEFOLIO_S3_FORCE_PATH_STYLE` | 自建服务（如 MinIO）通常需要设为 `true` |

</details>

---

## 从源码运行（开发用）

需要 Node.js `^22.19.0`、`^24.11.0` 或 `>=26.0.0`，以及 pnpm 11。

```bash
git clone https://github.com/wungjyan/framefolio.git
cd framefolio
corepack enable
pnpm install
```

**开发模式**（带热重载）：

```bash
pnpm dev
```

开发模式会自动读取 `.env` 和 `.env.local`，所以你可以把口令写进文件而不是每次敲命令：

```env
# .env.local（个人配置，已被 .gitignore 忽略）
FRAMEFOLIO_ADMIN_PASSWORD=你的口令
```

**生产模式**：

```bash
pnpm build
FRAMEFOLIO_ADMIN_PASSWORD=你的口令 NITRO_HOST=0.0.0.0 NITRO_PORT=3123 \
  node .output/server/index.mjs
```

> 构建本身不需要口令，**运行时才需要**。

### 配置文件怎么生效

三种运行方式读取配置的来源不同，这一点容易踩坑：

| 运行方式                   | `.env` | `.env.local`   | 真实环境变量 |
| -------------------------- | ------ | -------------- | ------------ |
| `pnpm dev`（开发）         | ✅     | ✅（**优先**） | ✅（最高）   |
| `node .output/...`（生产） | ✅     | ❌ **不读**    | ✅（最高）   |
| Docker Compose             | ✅     | ❌ 不进镜像    | ✅           |

规则：

1. **真实环境变量优先级最高**，永远不会被文件覆盖——所以容器里的配置不会被误改。
2. **开发模式**读 `.env` 和 `.env.local`，后者覆盖前者（符合「本地个人配置」的惯例）。
3. **生产模式只读 `.env`**，不读 `.env.local`——避免开发者的个人配置意外影响线上。
4. `.env.local` 已被 `.gitignore` 和 `.dockerignore` 排除，**不会提交、也不会进镜像**。

> 服务器启动时会在日志里打印从哪个文件加载了哪些配置项（**只打键名，不打印值**），
> 方便确认配置是否生效。例如：
>
> ```text
> [framefolio] Loaded 1 setting(s) from .env, .env.local: FRAMEFOLIO_ADMIN_PASSWORD
> ```

> 命令行同步（`pnpm gallery:sync`）是独立进程，同样会读取这些文件。

### 从源码构建 Docker 镜像

只在你要修改代码时用。需要 Docker Engine 与 Docker Compose v2。

```bash
git clone https://github.com/wungjyan/framefolio.git
cd framefolio
cp .env.example .env      # 然后编辑 .env，设置管理端口令
docker compose build
docker compose up -d gallery
```

### 两个 compose 文件的区别

仓库里有**两个** compose 文件，用途不同，**平时只需要用其中一个**：

| 文件                 | 镜像来源                       | 什么时候用                                           |
| -------------------- | ------------------------------ | ---------------------------------------------------- |
| `compose.image.yml`  | 拉取 Docker Hub 上已发布的镜像 | **推荐**。部署时就用这个，不需要源码、不需要本机构建 |
| `docker-compose.yml` | 从本机源码构建镜像             | 只在你要**改代码**时用                               |

**两者功能完全相同**——容器、挂载、环境变量、健康检查都一样，唯一区别是镜像从哪来。

> 所以部署时请**只用 `compose.image.yml`**，可以完全不理 `docker-compose.yml`。

### 开发命令

```bash
pnpm dev          # 开发服务器（热重载）
pnpm build        # 生产构建
pnpm test         # 单元测试
pnpm typecheck    # 类型检查
pnpm lint         # 代码检查
pnpm format       # 代码格式化
```

---

## 常见问题

### `/admin` 显示「管理端未启用」

没有设置 `FRAMEFOLIO_ADMIN_PASSWORD`。设置后重启容器即可。

注意：**公开画廊不受影响**，始终可以正常访问。

### 同步报权限错误

`PUID` / `PGID` 与 `data/` 目录的属主不一致，多见于 Linux / NAS。

```bash
id -u    # 得到 PUID
id -g    # 得到 PGID
```

写进 `.env` 后重启即可。完整步骤与验证命令见
[Linux / NAS 用户必看](#linux-nas-用户必看puid-与-pgid)。

### 从旧版本升级

索引格式已改变，**公开画廊在你同步一次之前会显示错误状态**。

打开 `/admin` 点一次「**立即同步**」即可恢复。管理端在同步前依然可用，并会提示
「索引需要重建」。

> **首次同步会重新生成全部缩略图**（旧索引无法复用），之后都是增量同步。
> 照片数量多时请耐心等待几分钟。

### 想改用 CDN 加速

见[对象存储（CDN 加速）](#对象存储cdn-加速)。可以随时启用，也可以随时切回本地，
不需要重新部署，也不需要重新处理已有图片。

### 照片删了但网站上还在

这是设计如此——删除只是把原图移入 `data/.trash/`，需要点「立即同步」才会从网站移除。
确认不再需要时，手动删掉 `.trash/` 里的文件即可（不会自动清理）。

---

## 运维

```bash
# 查看状态
docker compose -f compose.image.yml ps

# 查看日志
docker compose -f compose.image.yml logs -f gallery

# 停止
docker compose -f compose.image.yml down

# 更新到新版本
docker compose -f compose.image.yml pull
docker compose -f compose.image.yml up -d gallery
```

### 安全建议

`/admin` 可以暴露在公网，因此建议**在反向代理层再追加一层认证**
（Cloudflare Access、HTTP Basic Auth 等）。

`robots.txt` 与 `noindex` 响应头只用于**防止被搜索引擎收录**，**不是访问控制**——
任何人都能直接打开 `/admin` 并看到登录页。真正的防线是管理端口令。

---

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
