# Version Plan

## 当前发布目标

- 包名：`ai-agents-leader`
- 当前版本：`0.3.0`
- 建议 npm tag：`latest`
- 建议 git tag：`v0.3.0`
- 发布 registry：`https://registry.npmjs.org/`

## 发包前检查

按下面顺序执行：

```bash
# 1. 检查当前版本
cat package.json | grep '"version"'

# 2. 构建发布产物
node ./scripts/build-release-assets.mjs

# 3. 验证 npm 包内容
npm publish --dry-run --registry=https://registry.npmjs.org/

# 4. 登录 npm
npm login --registry=https://registry.npmjs.org/

# 5. 正式发布
npm publish --registry=https://registry.npmjs.org/
```

说明：

- `prepack` 已经会自动执行 `node ./scripts/build-release-assets.mjs`
- 当前 dry-run 已通过，说明 tarball、CLI 入口和发布态 bundle 都已就绪
- `aal start` 发布态会在用户目录 `~/.ai-agents-leader/desktop/<version>/overlay` 首次本地构建并缓存桌面端

## 推荐打 tag

```bash
git tag v0.3.0
git push origin v0.3.0
```

如果发布后再补 tag，会造成 npm 版本与仓库标签不同步，建议在确认 `npm publish` 成功后立即推送 tag。

## Release Note 草稿

标题：`v0.3.0`

正文：

```md
## AI Agents Leader v0.3.0

这次版本把项目从“仓库里能跑”推进到“npm 安装后可直接使用”。

### Added

- 新增发布态 CLI 结构：源码环境走 `packages/core/src/cli.ts`，npm 安装环境走 `bundle/runtime/core/cli.js`
- 新增发布产物构建流程：预打包生成 `bundle/runtime/*` 与 `bundle/overlay-template/*`
- 新增发布态桌面端启动链路：`aal start` 首次在用户目录本地执行 Tauri 构建，后续复用缓存产物

### Changed

- 默认非 mock 路径统一连接本地真实 agent，只有显式 mock 命令才启用 mock 数据
- README、使用文档、开发文档、AI 交接文档已和当前启动链路、桌面模式、发布态行为对齐
- npm 发布目标固定到 `https://registry.npmjs.org/`，并清理了包元数据 warning

### Verify

- `npm publish --dry-run --registry=https://registry.npmjs.org/` 已通过
- 隔离安装环境下 `aal check` 已通过
- 隔离安装环境下 `aal start` 已通过，并成功启动 runtime 与桌面浮窗
```

## 版本调整规则

- 只改功能文档，不改代码：可保持当前版本，合并到下一次发版
- 修复发布阻塞但不改对外能力：升补丁版本，如 `0.3.0 -> 0.3.1`
- 新增命令、启动模式、适配器能力：升次版本，如 `0.3.0 -> 0.4.0`
- 破坏命令语义、配置格式、协议兼容：升主版本，如 `0.x -> 1.0.0`

## 当前结论

当前仓库已经满足代码层面的 npm 发布条件。剩余动作只包括：

- 使用真实 npm 账号执行 `npm login`
- 执行正式 `npm publish`
- 推送 `v0.3.0` tag
