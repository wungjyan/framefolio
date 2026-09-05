# 架构

Framefolio 按照数据边界和交付边界拆分。Nuxt 服务负责只读的画廊交付，同步脚本负责图片处理，根 package 负责应用运行时，文档工作区负责文档工具链。

## 依赖与接口关系

```mermaid
graph TD
  root[根应用包]
  turbo[Turbo 任务图]
  nuxt[Nuxt 应用与服务]
  shared[共享契约<br/>常量、类型、路径]
  sync[图库同步脚本]
  data[(图库数据目录)]
  docs[VitePress 文档工作区]
  tests[Vitest 测试]

  root --> turbo
  turbo --> nuxt
  turbo --> sync
  turbo --> docs
  turbo --> tests
  nuxt --> shared
  sync --> shared
  nuxt --> data
  sync --> data
  tests --> shared
```

箭头表示重要接口：

- `shared` 定义服务与同步流程共享的路径和 JSON 契约。
- `scripts/gallery-sync.ts` 写入数据契约，服务负责读取。
- `docs` 记录契约和开发流程。
- Turbo 协调独立的构建、测试、类型检查和文档任务。

## 画廊请求路径

```mermaid
sequenceDiagram
  actor User as 用户
  participant Browser as 浏览器
  participant Nuxt as Nuxt 服务
  participant Index as photos.json
  participant Media as generated/

  User->>Browser: 打开画廊
  Browser->>Nuxt: GET /
  Nuxt-->>Browser: HTML 和客户端资源
  Browser->>Nuxt: GET /api/photos
  Nuxt->>Index: 读取并校验 JSON
  Index-->>Nuxt: 照片索引
  Nuxt-->>Browser: 公开照片元数据
  Browser->>Nuxt: GET /media/{generated-file}
  Nuxt->>Media: 解析安全的生成路径
  Media-->>Nuxt: WebP 字节
  Nuxt-->>Browser: 图片响应
```

## 同步流程

```mermaid
sequenceDiagram
  actor Operator as 操作者
  participant Sync as gallery-sync.ts
  participant Originals as originals/
  participant Sharp as sharp + exifr
  participant Output as generated/ + photos.json

  Operator->>Sync: 在 pnpm start 中允许同步，或运行 foo-cli web
  Sync->>Originals: 扫描支持的文件
  loop 每张发生变化的照片
    Sync->>Sharp: 读取元数据并转换
    Sharp-->>Sync: 尺寸、EXIF、WebP 变体
    Sync->>Output: 写入临时衍生图
  end
  Sync->>Output: 原子更新索引
  Output-->>Sync: 汇总信息和警告
```

## 安全规则

1. 从 `NUXT_GALLERY_DATA_DIR` 或默认的 `data/` 目录解析所有数据路径。
2. 将文件名和查询参数视为不可信输入。
3. 从磁盘读取前校验生成资源名称。
4. 先写入临时文件，再原子替换索引。
5. 保持原图位于公开服务输出目录之外。
