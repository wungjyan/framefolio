# 发布指南

Framefolio 从 `packages/foo-cli` 发布 `foo-cli`。GitHub Release 和 npm 发布由版本标签自动触发。

## 发布前验证

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm exec turbo run docs:build
```

## 发布版本

1. 更新 `packages/foo-cli/package.json` 中的版本号。
2. 提交版本变更。
3. 创建并推送匹配的标签：

```bash
git tag v0.1.0
git push origin v0.1.0
```

发布工作流会依次：

- 构建 `foo-cli` 发布产物。
- 将 `foo-cli` 发布到 npm，并启用 provenance。
- 使用 `changelogithub` 生成 GitHub Release 日志。

仓库需要配置具有 `foo-cli` 发布权限的 `NPM_TOKEN` Secret。标签版本必须与 package 版本完全一致。

## 变更检查清单

- 更新 `docs/specs/` 中相关的规范。
- 接口发生变化时更新 `docs/guide/architecture.md`。
- 确认部署环境中的 `NUXT_GALLERY_DATA_DIR` 行为。
- 确认生成资源没有被提交到应用构建包中。
- 修改输出或环境变量时检查 Turbo 任务摘要。
