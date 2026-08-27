# Framefolio MVP 产品需求

本文档记录 Framefolio 的产品目标和验收边界。具体技术决策、开发阶段和当前进度见 [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md)。

Framefolio 是一个**极简摄影作品展示网站 MVP**。

这是摄影 Portfolio / Gallery，不是相册管理系统。核心目标是：**照片展示本身优先，界面简约、克制、有高级感，同时支持 Docker 简单部署。**

## 技术栈

使用：

* Nuxt 4
* TypeScript
* Sharp：图片处理
* exifr：读取 EXIF
* Docker / Docker Compose

不要引入数据库、独立后端、Redis、后台管理、用户系统等额外复杂度。

---

## 1. 照片数据结构

程序与照片分离，使用运行时目录：

```text
data/
├── originals/        # 原始照片
├── generated/        # 自动生成的缩略图和预览图
└── photos.json       # 自动生成的照片索引
```

Docker 中：

```yaml
volumes:
  - ./data:/app/data
```

`originals` 是真正的数据源，`photos.json` 只是可重新生成的索引。

---

## 2. 实现 gallery:sync

提供：

```bash
pnpm gallery:sync
```

扫描 `data/originals`，自动完成：

1. 使用 exifr 读取 EXIF
2. 使用 Sharp 获取宽高
3. 生成缩略图 WebP
4. 生成大图预览 WebP
5. 更新 `photos.json`

当前 MVP 支持 JPEG、PNG、TIFF 和 WebP 输入。HEIC、HEIF 和相机 RAW 暂不纳入第一版。

生成文件使用带照片 ID 和修订版本的名称：

```text
generated/
├── <photo-id>-<revision>-thumbnail.webp
└── <photo-id>-<revision>-preview.webp
```

`photos.json` 至少保存：

```ts
{
  id: string
  filename: string

  thumbnail: string
  preview: string

  width: number
  height: number

  takenAt?: string

  cameraMake?: string
  cameraModel?: string
  lens?: string

  focalLength?: number
  focalLength35mm?: number
  aperture?: number
  shutterSpeed?: string
  iso?: number
}
```

EXIF 缺失时正常处理，不要报错。

第一版不读取或公开 GPS。

同步需要支持增量更新：

* 新照片 → 处理
* 修改过的照片 → 重新处理
* 未变化 → 跳过
* 原图删除 → 删除索引和 generated 文件

第一版使用规范化相对路径、文件大小、`mtimeMs` 和图片处理版本判断变化，不计算原图内容哈希。

---

## 3. Nuxt 数据读取

实现：

```text
GET /api/photos
```

Nitro API 只读取：

```text
/app/data/photos.json
```

前端通过：

```ts
useFetch('/api/photos')
```

获取照片。

请求过程中禁止：

* 扫描 originals
* 解析 EXIF
* 使用 Sharp 处理图片

所有重处理只由 `gallery:sync` 完成。

---

## 4. 桌面端 Gallery

桌面端提供两种布局模式：

```ts
'editorial' | 'justified'
```

默认：

```ts
editorial
```

页面右上角提供一个极简布局切换图标，不要使用明显的大按钮或复杂文字。图标表示点击后将切换到的目标布局。

可使用 Tooltip 提示布局名称。

桌面端 Header 在页面顶部始终显示；向下浏览照片时自动淡出并轻微上移，用户向上滚动或返回顶部时重新显示。隐藏状态不得继续响应鼠标或键盘操作，动画需尊重 `prefers-reduced-motion`。移动端不启用滚动显隐，也不显示布局切换图标。

### Editorial Layout

这是默认布局，也是主要视觉风格。

目标：

* 摄影杂志 / Portfolio 感
* 大量合理留白
* 横图、竖图形成节奏
* 照片按时间从左到右排列，图片大小和垂直错位可以变化
* 不追求填满所有空间
* 不做传统瀑布流

不要实现复杂的智能排版算法。

照片严格按时间顺序连续两两分组。每组中较新的照片位于左侧，较旧的照片位于右侧；照片方向只决定尺寸和错位幅度，不决定左右位置。

定义少量固定 Layout Pattern，根据照片横竖比例自动套用并循环，例如：

* 左侧横图 + 右侧竖图
* 左侧竖图 + 右侧横图
* 单张 Featured 大图
* 两张错位排列

重点是视觉稳定和留白，不要求每种照片组合都完全不同。

### Justified Gallery

切换后使用等高自适应 Gallery：

* 同一行照片高度一致
* 宽度根据照片原始宽高比计算
* 不裁剪照片
* 自动填满当前内容宽度
* 容器尺寸变化时重新计算

可以使用成熟的 Justified Layout 实现，不需要为了算法从零造复杂方案。

---

## 5. 移动端

移动端不提供布局切换。

统一采用：

> **单列照片流**

要求：

* 一行一张
* 保持原图比例
* 不裁剪
* 图片宽度占据主要内容区域
* 图片之间保留舒适的纵向间距
* 保持简单、安静的观看体验

不要在移动端强行复刻 Editorial 或 Justified。

---

## 6. 照片详情

首页尽量只展示照片，不直接堆叠：

* 标题
* 日期
* EXIF
* 点赞
* 浏览量
* 标签等信息

点击照片后进入 Lightbox / Viewer：

* 大图居中
* 支持关闭
* 支持上一张 / 下一张
* 支持键盘方向键
* 展示极简 EXIF

例如：

```text
Sony A7 IV · FE 35mm F1.4 GM

35mm · f/2.8 · 1/250s · ISO 100

2026.08.20
```

EXIF 字体和视觉层级弱于照片，不要抢主体。

---

## 7. 视觉方向

整体风格：

> 极简摄影作品集 / 摄影杂志，而不是图片社区或图库管理系统。

设计原则：

* 白色或非常浅的中性背景
* 大量留白
* 克制的字体层级
* 页面内容区不要完全贴满屏幕
* 不使用大量卡片、圆角、阴影、边框
* 图片本身不要做圆角
* 不要给每张照片增加信息卡
* hover 效果克制
* 动画尽量轻
* 不做花哨渐变
* 不做 Pinterest / 小红书风格

让照片本身成为页面最主要的视觉内容。

### 双主题

支持浅色与深色两套主题：

* 浅色为默认主题；深色使用近纯黑背景，让照片成为唯一亮部。
* 首次访问跟随系统 `prefers-color-scheme`，手动切换后记住选择。
* Header 提供极简切换图标，移动端同样显示；图标表示当前主题状态。
* 切换不得产生首屏闪烁；颜色统一走语义变量，不允许硬编码颜色。
* 布局切换图标仍仅桌面显示，主题切换不受此限制。

---

## 8. Docker

提供：

```text
Dockerfile
docker-compose.yml
.env.example
README.md
```

项目应支持：

```bash
docker compose up -d
```

直接启动。

添加照片后的标准流程：

```text
1. 将照片复制到：

./data/originals/

2. 执行：

docker compose run --rm sync

3. 刷新网页
```

新增、删除或修改照片：

**不需要重新执行 Nuxt build，也不需要重新构建 Docker 镜像。**

请先完成一个结构清晰、可实际运行的 MVP，优先保证：

> Docker 部署简单 + 照片同步可靠 + Editorial / Justified 桌面布局 + 移动端单列 + 极简 Viewer。

不要提前加入非必要功能。
