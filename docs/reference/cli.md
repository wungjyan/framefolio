# CLI 与本地命令

Framefolio 目前从仓库根目录运行。下面是支持的本地命令入口。

## 启动开发服务

```bash
pnpm start
```

`start` 会显示 `docs` 和 `site` 两个复选项。两者都选中时，Turbo 会并行启动 VitePress 和画廊。非交互方式同时启动两者：

```bash
pnpm start --docs --site
```

生产 Web 服务使用 `web`。当 `.output/server/index.mjs` 不存在时，它会自动构建，然后启动编译后的 Nitro 服务：

```bash
pnpm exec foo-cli web
```

可以显式配置绑定地址和端口：

```bash
pnpm exec foo-cli web --host 127.0.0.1 --port 3123
```

`web` 默认绑定主机 `127.0.0.1`，端口 `3123`。

## 构建与预览

```bash
pnpm build
pnpm start --preview
```

构建默认生成 Nuxt 服务端产物。选择静态选项会执行 `nuxt generate`，也可以使用非交互参数：

```bash
pnpm exec foo-cli build --prerender
pnpm exec foo-cli build --yes
```

`--yes` 使用默认的服务端构建。生产产物位于 `.output/`，可通过 Nitro 预览。

## 同步照片

当 `pnpm start` 选择 `site` 时，CLI 会询问是否在启动前执行图库同步。`foo-cli web` 会在提供生产服务前自动同步。

同步流程会扫描支持的原图，写入 WebP 衍生图并更新画廊索引。如果有文件处理失败，命令会以非零状态退出。

## 文档服务

```bash
pnpm exec turbo run docs:dev
pnpm exec turbo run docs:build
pnpm exec turbo run docs:preview
```
