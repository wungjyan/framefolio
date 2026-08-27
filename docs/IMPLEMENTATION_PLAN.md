# Framefolio MVP 开发计划

## 1. 文档目的

本文档将 [`DEV.md`](./DEV.md) 中的产品需求拆分为可依次实施、验证和交付的开发阶段。

MVP 的核心交付链路为：

```text
data/originals
  → gallery:sync
  → data/generated + data/photos.json
  → Nitro 只读 API
  → Editorial / Justified / Mobile Gallery
  → Photo Viewer
```

开发中优先保证数据同步可靠、运行时边界清晰和图片展示稳定，再完善排版与交互细节。

当前已完成阶段 0–5，即工程基线、照片同步管线、运行时 API、媒体路由、应用视觉基线、Gallery 布局和 Photo Viewer；下一阶段为 Docker 部署与运维流程。MVP 范围外追加了浅色 / 深色双主题支持（见阶段 8），已实现。

## 2. MVP 边界

### 2.1 本期包含

- 从运行时目录扫描原始照片。
- 增量提取 EXIF 并生成 WebP 图片。
- 安全读取照片索引和生成图片。
- 桌面端 Editorial 与 Justified 两种布局。
- 移动端单列照片流。
- 支持键盘导航和简要 EXIF 的 Viewer。
- Docker 与 Docker Compose 部署。
- 必要的单元测试、构建检查和手工验收。

### 2.2 本期不包含

- 数据库、独立后端、Redis 或消息队列。
- 用户、登录、权限、后台管理和在线上传。
- 标签、搜索、收藏、点赞、浏览量和评论。
- 照片编辑、原图下载和 GPS 信息。
- 复杂的智能排版、实时目录监听和 CDN 集成。
- 移动端复制桌面布局或引入复杂手势系统。

## 3. 已确定的技术方案

### 3.1 生成图片访问

由 Nitro 提供专用媒体路由：

```text
GET /media/:filename
```

路由只能读取 `data/generated` 中符合命名规则的 `.webp` 文件，不得公开 `data/originals`。响应使用正确的 `Content-Type` 并对指纹文件名开启长期不可变缓存。

生成文件命名格式：

```text
<photo-id>-<revision>-thumbnail.webp
<photo-id>-<revision>-preview.webp
```

- `photo-id` 是规范化相对路径的稳定短哈希。
- `revision` 由相对路径、文件大小、`mtimeMs` 和图片处理版本生成。
- 原图内容或处理参数变化后，URL 同步变化，避免缓存污染。

### 3.2 图片生成规格

| 类型 | 最长边 | WebP 质量 | 主要用途 |
| --- | ---: | ---: | --- |
| Thumbnail | 960 px | 82 | 移动单列、Editorial 和 Justified |
| Preview | 2560 px | 88 | Viewer |

统一处理规则：

- 先根据 EXIF Orientation 自动旋转，再记录宽高。
- 使用 `fit: 'inside'` 保留原始比例，不裁剪。
- 使用 `withoutEnlargement: true` 避免放大小图。
- 输出统一为 sRGB WebP。
- 生成图不携带原始 EXIF 和 GPS 元数据。
- 单张处理失败不影响其他照片，但同步命令需返回非零状态。

### 3.3 索引结构与原子更新

`photos.json` 使用带版本的顶层结构：

```ts
interface GalleryIndex {
  schemaVersion: 1
  pipelineVersion: 2
  generatedAt: string
  photos: PhotoIndexItem[]
}
```

单张照片除公开展示字段外，保存以下内部字段：

```ts
interface PhotoSourceState {
  size: number
  mtimeMs: number
  revision: string
}
```

`GET /api/photos` 只返回前端展示必需的照片字段，不暴露 `source`、`schemaVersion`、`pipelineVersion` 和 `generatedAt`。

索引发布顺序为：

1. 读取旧索引并扫描原图。
2. 计算新增、修改、未变化和删除项。
3. 将新图片写入临时文件。
4. 图片生成完成后重命名为正式指纹文件。
5. 将新索引写入 `photos.json.tmp`。
6. 原子替换为 `photos.json`。
7. 删除不再被新索引引用的生成图片。

如果某张照片处理失败：

- 原图修改后处理失败：保留该照片的旧索引和旧生成图，下次同步继续重试。
- 新照片处理失败：暂不写入索引。
- 其他成功处理的照片仍可随新索引一次性发布。
- 命令最终输出错误汇总并返回非零状态。

## 4. 预期项目结构

```text
app/
├── assets/css/main.css
├── components/
│   ├── gallery/GalleryHeader.vue
│   ├── gallery/GalleryEditorial.vue
│   ├── gallery/GalleryJustified.vue
│   ├── gallery/GalleryMobile.vue
│   ├── gallery/GalleryImage.vue
│   └── viewer/PhotoViewer.vue
├── composables/useGalleryLayout.ts
├── pages/index.vue
├── utils/
│   ├── gallery-layout.ts
│   ├── header-scroll.ts
│   └── photo-viewer.ts
└── app.vue
server/
├── api/photos.get.ts
├── routes/media/[filename].get.ts
└── utils/
    ├── gallery-index.ts
    └── gallery-media.ts
shared/
├── constants/gallery.ts
├── node/gallery-paths.ts
└── types/photo.ts
scripts/
├── gallery-sync.ts
└── lib/gallery-sync.ts
data/
├── originals/.gitkeep
└── generated/.gitkeep
tests/
├── fixtures/
└── unit/
    ├── gallery-baseline.test.ts
    ├── gallery-layout.test.ts
    ├── gallery-runtime.test.ts
    ├── gallery-sync.test.ts
    ├── header-scroll.test.ts
    └── photo-viewer.test.ts
Dockerfile
docker-compose.yml
.env.example
```

## 5. 分阶段开发计划

### 阶段 0：工程基线与数据契约

**目标**

先确定所有后续阶段共用的类型、路径和运行参数，避免同步脚本、API 和前端分别定义数据。

**任务**

- [x] 安装 `sharp`、`exifr` 及必要的开发依赖。
- [x] 在 `shared/types/photo.ts` 定义内部索引和公开 API 类型。
- [x] 定义 `schemaVersion`、`pipelineVersion` 和图片处理常量。
- [x] 定义数据目录配置，默认为项目根目录下的 `data`。
- [x] 建立 `originals` 和 `generated` 目录占位，忽略实际照片和生成物。
- [x] 增加 `gallery:sync`、`typecheck` 和 `test` 脚本入口。

**验收标准**

- 公开照片类型与 `DEV.md` 字段一致。
- 应用、Nitro 和同步脚本能引用同一份类型。
- 新环境中不需手工创建子目录即可运行同步命令。

### 阶段 1：`gallery:sync` 同步管线

**目标**

完成最重要的离线照片处理能力，并在进入 UI 开发前独立验证其可靠性。

**任务**

- [x] 递归扫描 `data/originals` 中的受支持图片。
- [x] 规范化相对路径，生成稳定 `id` 和修订 `revision`。
- [x] 读取旧索引并计算新增、修改、跳过和删除集合。
- [x] 使用 exifr 选择性读取所需 EXIF 字段，不读取 GPS。
- [x] 将相机、镜头、焦距、光圈、快门、ISO 和拍摄时间规范化为公开数据结构。
- [x] 使用 Sharp 完成方向校正、sRGB 转换和双规格 WebP 输出。
- [x] 实现临时文件、原子索引替换和安全的失效生成物清理。
- [x] 输出可读的同步摘要：新增、更新、跳过、删除、失败数量。
- [x] 对空目录、EXIF 缺失、损坏图片和旧索引损坏提供明确行为。

**测试场景**

- [x] 首次同步能生成两种图片和索引。
- [x] 第二次同步能跳过全部未变化照片。
- [x] 修改原图后只重新处理对应照片。
- [x] 删除原图后索引项和失效生成图均被清理。
- [x] EXIF 缺失时仍能正常生成图片。
- [x] 带 Orientation 的竖图展示尺寸正确。
- [x] 修改 `pipelineVersion` 后触发全部重新生成。
- [x] 单张图片失败后，已发布索引仍然可用。

**验收标准**

```bash
pnpm gallery:sync
pnpm test
```

两个命令均能在本地环境独立运行，测试覆盖增、改、跳过和删除的核心路径。

### 阶段 2：运行时 API 与媒体路由

**目标**

让 Nuxt 仅消费已生成的索引和图片，不在请求链路中执行任何照片处理。

**任务**

- [x] 实现 `GET /api/photos`，读取并校验 `photos.json`。
- [x] 将内部索引映射为公开照片数组。
- [x] 当索引不存在时返回空数组，当索引损坏时返回明确的服务端错误。
- [x] 实现 `GET /media/:filename`。
- [x] 校验文件名、扩展名和最终解析路径，阻止路径穿越。
- [x] 添加 WebP MIME 和长期不可变缓存头。
- [x] 验证 API 请求过程不引入 Sharp、exifr 或原图扫描。

**验收标准**

- `/api/photos` 的响应不包含任何内部同步字段。
- 索引中所有 `thumbnail` 和 `preview` URL 都能正常加载。
- 伪造的路径穿越请求不能读取 `generated` 之外的文件。

### 阶段 3：应用外壳与基础视觉

**目标**

建立克制的响应式页面基线，为三种 Gallery 布局提供统一容器、间距和图片交互。

**任务**

- [x] 建立全局中性色、字体、间距、容器宽度和响应式断点变量。
- [x] 完成首页数据获取、加载、空数据和错误状态。
- [x] 实现共用 `GalleryImage`，统一处理宽高、懒加载和图片选择，并通过 `select` 事件预留 Viewer 接口。
- [x] 为首屏重点照片设置更高加载优先级，其余照片延迟加载。
- [x] 预留桌面布局切换区域，移动端隐藏该区域。

**视觉约束**

- 背景使用白色或极浅中性色，不使用蓝紫夜间配色。
- 不使用米白底、暖橙强调色和复古 serif 标题的组合。
- 不添加描述性页面文案，让照片成为主要内容。
- 照片保持直角，不包裹为卡片。
- 不使用无目的嵌套边框、大圆角容器和明显阴影。
- hover 和过渡只提供必要的状态反馈。

**验收标准**

- 首页能从 `/api/photos` 渲染一组保留原始比例的图片。
- 图片加载前已预留正确比例，不产生明显布局跳动。
- 页面不包含照片信息卡、营销文案或非必要装饰元素。

### 阶段 4：Gallery 布局

**目标**

完成 Editorial、Justified 和 Mobile 三种展示逻辑，共用同一份照片数据和打开 Viewer 的交互。

#### 4.1 Editorial

- [x] 将照片按宽高比分为横向、竖向和近方形。
- [x] 按时间顺序将照片分入响应式行组，从左到右、从上到下排列。
- [x] 根据内容宽度明确按每行 2 或 3 张分组，最多 3 张。
- [x] 根据照片方向选择行内宽度，同一行按垂直中心对齐并在必要时收缩。
- [x] 将不足一行的末尾照片靠左排列，不做 Masonry 或密集回填。
- [x] 在各种照片数量、容器宽度和横竖比组合下提供安全降级布局。

#### 4.2 Justified

- [x] 根据照片宽高比累加组行。
- [x] 为每行计算共享高度，使非末行填满容器。
- [x] 末行保持目标高度和自然宽度，不强行拉伸填满。
- [x] 使用 `ResizeObserver` 在容器尺寸变化后重新计算。
- [x] 保证所有照片完整显示且不裁剪。

#### 4.3 Mobile

- [x] 在移动断点下始终使用单列照片流。
- [x] 隐藏布局切换控件。
- [x] 保留主要内容边距和舒适的纵向间距。
- [x] 图片占据主要可视宽度，保持原始比例。

#### 4.4 Header 与布局切换

- [x] 默认使用 `editorial`。
- [x] 仅在桌面端显示一个目标布局图标，点击后在两种布局之间切换。
- [x] 控件具有可识别的焦点态、动态可访问名称和简短 Tooltip。
- [x] Header 在顶部保持显示，持续向下滚动后隐藏，向上滚动时恢复。
- [x] 使用方向累计阈值避免轻微滚动抖动，隐藏后禁用鼠标和键盘交互。
- [x] 布局切换和 Viewer 开关不会造成 Header 显隐状态错乱。
- [x] 在本地保存用户最后一次选择；储存不可用时回退到 Editorial。

**验收标准**

- Editorial 不呈现传统瀑布流效果，刷新后排版保持一致，每行最多显示 3 张并按时间顺序排列。
- Justified 的同行图片等高、无裁剪，容器缩放后能重新排列。
- 移动端始终为单列，且不显示布局切换。
- 桌面端 Header 的滚动显隐稳定，隐藏时不会留下不可见的交互区域。
- Gallery 使用 thumbnail，Viewer 请求 preview。

### 阶段 5：Photo Viewer

**目标**

提供以照片为绝对主体的查看器，完成基本导航、可访问性和 EXIF 展示。

**任务**

- [x] 使用语义化 dialog 实现全屏 Viewer。
- [x] 支持点击照片打开、关闭控件和 `Escape` 关闭。
- [x] 支持上一张、下一张控件及左右方向键。
- [x] 打开时锁定背景滚动，关闭后恢复原状。
- [x] 实现焦点约束，关闭后将焦点返回触发照片。
- [x] 预加载相邻 preview 图片。
- [x] 按实际存在的字段组合相机、镜头、参数和日期。
- [x] 信息层级弱于照片，不使用独立卡片或装饰容器。

**验收标准**

- 可以仅使用键盘打开、浏览和关闭 Viewer。
- 连续切换照片时不会将页面滚动到背景内容。
- EXIF 缺少时不显示空分隔符、`undefined` 或无意义占位。
- 首张和末张暂不循环，对应方向的导航控件禁用。

### 阶段 6：Docker 部署与运维流程

**目标**

使应用能通过单一镜像和 Docker Compose 运行，同时保持展示服务与同步操作的职责边界。

**任务**

- [ ] 使用多阶段 `Dockerfile` 构建 Nuxt Node 产物。
- [ ] 确保运行镜像同时具备执行 `gallery:sync` 所需的 Sharp 运行能力。
- [ ] Compose 中的 `gallery` 服务启动 Nuxt，以只读方式挂载 `data`。
- [ ] Compose 中的 `sync` 服务复用同一镜像，以可读写方式挂载 `data`。
- [ ] 使 `docker compose up -d` 只启动展示服务。
- [ ] 使 `docker compose run --rm sync` 执行一次同步。
- [ ] 通过 UID/GID 或明确的目录权限避免宿主机与容器生成物的权限冲突。
- [ ] 增加 `.dockerignore`、`.env.example` 和容器健康检查。
- [ ] 完善 README，补充 Docker 启动、容器内同步和部署故障排查。

**标准运维流程**

```bash
# 启动站点
docker compose up -d

# 新增、修改或删除原图后执行
docker compose run --rm sync
```

同步后不需重新构建镜像，也不需重启 Nuxt 服务。

**验收标准**

- 从空 `data` 目录开始能完成首次同步并启动站点。
- 容器重建或更新不会删除原图、生成图和索引。
- 网站请求不会触发图片扫描或重处理。
- 不重建镜像即可展示新同步的照片。

### 阶段 7：端到端验收与收尾

**目标**

在真实尺寸的横图、竖图、无 EXIF 照片和异常文件上验证完整 MVP。

**自动检查**

```bash
pnpm test
pnpm typecheck
pnpm build
```

**手工验收**

- [ ] 分别使用宽屏、普通桌面、平板宽度和手机宽度检查布局。
- [ ] 检查 Editorial 的留白、横竖图节奏和响应式分行稳定性。
- [ ] 拖动窗口宽度，检查 Justified 是否重新计算且无裁剪。
- [ ] 检查移动端只显示单列照片流。
- [ ] 仅使用键盘完成 Gallery 聚焦、Viewer 打开、切换和关闭。
- [ ] 检查照片加载前后的布局稳定性。
- [ ] 检查断网、空索引、损坏索引和媒体 404 时的页面行为。
- [ ] 确认 API、HTML 和生成 WebP 中都不包含 GPS 信息。
- [ ] 在 Docker 环境重复首次同步、增量同步、删除照片和容器重建流程。

**性能与可访问性检查**

- [ ] 首屏外图片默认懒加载。
- [ ] 图片具有明确宽高或 `aspect-ratio`。
- [ ] 交互控件具有键盘焦点态和可访问名称。
- [ ] 支持 `prefers-reduced-motion`，不强制播放过渡。
- [ ] 图片不会因 CSS 背景或 `object-fit: cover` 而被裁剪。

### 阶段 8：浅色 / 深色双主题（MVP 后追加）

**目标**

在既有语义颜色变量体系上提供双主题切换，保持"一组变量、两份取值"，不引入新依赖。

**任务**

- [x] 在 `main.css` 为 5 个语义颜色变量定义近纯黑暗色取值，通过 `html[data-theme='dark']` 切换，并声明 `color-scheme`。
- [x] 新增 `app/utils/theme.ts` 纯函数与 `useTheme` composable：存储值优先，其次跟随系统，手动切换后停止跟随并持久化。
- [x] 通过 `nuxt.config.ts` 阻塞式内联脚本在首帧前应用主题，避免刷新闪屏。
- [x] Header 增加主题切换按钮：图标表示当前主题，全尺寸可见；布局切换仍仅桌面显示。
- [x] 单元测试覆盖主题解析与存储读写，含存储不可用降级。

**验收标准**

- 首次访问跟随系统主题，无手动选择时随系统实时变化。
- 手动切换后记住选择并覆盖系统偏好，刷新无闪屏。
- 页面、Viewer、骨架屏和控件在两种主题下全部联动，无硬编码颜色。
- 移动端可见主题按钮、不见布局按钮；键盘可聚焦操作。

## 6. 实施顺序与交付节点

阶段按以下顺序推进：

```text
阶段 0 数据契约
  → 阶段 1 同步管线
  → 阶段 2 API 与媒体路由
  → 阶段 3 应用外壳
  → 阶段 4 Gallery 布局
  → 阶段 5 Viewer
  → 阶段 6 Docker 与 README
  → 阶段 7 整体验收
```

建议按以下节点交付：

1. **M1：照片管线可独立运行**

   完成阶段 0–1，可反复执行增量同步并通过核心测试。
2. **M2：浏览器可读取完整画廊数据**

   完成阶段 2–3，真实图片可通过 API 和媒体路由稳定展示。
3. **M3：完成核心浏览体验**

   完成阶段 4–5，三种响应式布局和 Viewer 可用。
4. **M4：完成可部署 MVP**

   完成阶段 6–7，Docker 流程、README 和验收清单全部通过。

每个节点完成时，应保持以下状态：

- 已完成的命令和页面能够实际运行。
- 对应的验收项已逐项检查。
- 不用后续未完成功能掩盖当前阶段的错误。
- README 中不记录尚未实现的命令为已可用功能。

## 7. MVP 完成定义

当以下条件全部满足时，MVP 视为完成：

- [x] `pnpm gallery:sync` 支持首次、增量、更新和删除同步。
- [x] 同步失败不会损坏上一份可用索引。
- [x] 网站运行时只读取 `photos.json` 和 `generated`。
- [x] 原图和 GPS 元数据没有公开访问路径。
- [x] 桌面端可在 Editorial 和 Justified 之间切换。
- [x] 移动端只使用单列照片流。
- [x] Viewer 支持关闭、前后导航、键盘操作和缺失字段友好的 EXIF 展示。
- [x] 图片在 Gallery 和 Viewer 中均不被裁剪。
- [x] `pnpm test`、`pnpm typecheck` 和 `pnpm build` 通过。
- [ ] `docker compose up -d` 可启动站点，`docker compose run --rm sync` 可更新照片。
- [ ] 更新照片时无需重建镜像或重启应用。
- [ ] README 能让新使用者从空数据目录完成部署和首次导入。
