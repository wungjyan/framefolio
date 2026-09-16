# 发布流程

Framefolio 使用 Release Please 准备版本号和 GitHub Release，再由 GitHub Actions 构建并发布对应的多架构 Docker 镜像。

## 仓库首次配置

在 GitHub 打开 **Settings → Actions → General → Workflow permissions**，启用 **Allow GitHub Actions to create and approve pull requests**。Release Please 需要这个设置来创建和更新 Release PR。

在 Docker Hub 创建一个对 `wungjyan/framefolio` 具有读写权限的访问令牌，然后在 **Settings → Secrets and variables → Actions → Secrets** 添加：

```text
DOCKERHUB_TOKEN
```

工作流默认使用现有镜像仓库和 npm 官方源。需要覆盖时，可以添加以下 Actions Variables：

```text
DOCKERHUB_USERNAME=wungjyan
DOCKERHUB_REPOSITORY=wungjyan/framefolio
NPM_REGISTRY=https://registry.npmjs.org
```

不要把 Docker Hub 账户密码保存在 GitHub 中。请使用独立的访问令牌，以便在不修改账户密码的情况下撤销。

## 正常发布

1. 将符合 Conventional Commits 规范的提交合并或推送到 `main`。
2. 等待 **Release** 工作流完成检查，并创建或更新 Release Please PR。
3. 检查 PR 中建议的版本号和 `CHANGELOG.md`。
4. 准备发布时合并 Release PR。
5. 下一次 **Release** 工作流会创建 Git 标签和 GitHub Release，并推送 `wungjyan/framefolio:<version>` 与 `wungjyan/framefolio:latest`。

Release Please 通常按以下方式解释提交类型：

```text
fix:                 补丁版本，例如 1.0.0 → 1.0.1
feat:                次版本，例如 1.0.0 → 1.1.0
feat!: 或 BREAKING   主版本，例如 1.0.0 → 2.0.0
```

`dev` 和功能分支上的变更只有进入 `main` 后才会参与发布。后续符合条件的提交会更新现有 Release PR，而不是为每条提交创建一个 PR。

## 恢复失败的镜像发布

如果 GitHub Release 已创建，但 Docker 构建或推送失败，打开 **Actions → Publish Docker image → Run workflow**，输入已经存在的稳定版 Git 标签。工作流会检出该标签；如果源码与标签不一致，会拒绝发布。

除非这个恢复版本应该成为当前稳定版，否则不要启用 **Also update the latest image tag**。

## 本地备用方式

`scripts/docker-publish.sh` 继续作为紧急备用和本地测试工具。它构建的是当前工作区，因此不属于标准发布流程，也不能用于以不同源码覆盖已经存在的版本。

```bash
docker login
./scripts/docker-publish.sh 1.1.0
```

## 分支保护说明

Release Please 使用仓库内置的 `GITHUB_TOKEN`。该令牌创建的 PR 不会再次触发新的工作流，因此自动生成的 Release PR 上可能不会显示常规 PR CI 检查。Release PR 合并后仍会触发 **Release** 工作流，并且该工作流会在创建标签、GitHub Release 或 Docker 镜像之前执行完整检查。

如果以后为 `main` 配置“合并前必须通过 CI”，需要为 Release Please 换用细粒度令牌或 GitHub App 令牌，让它创建的 PR 可以触发必需检查。
