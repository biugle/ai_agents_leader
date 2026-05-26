# 目录说明

这份文档只解释目录职责，不解释具体实现细节。想看运行流程，去看 docs/development.md；想看对外使用方式，去看 docs/usage.md。

## 根目录

- AGENTS.md：项目协作约定，给 AI / 开发者快速建立上下文。
- README.md：对外说明，包含启动方式、核心概念、命令说明。
- CHANGELOG.md：版本变更记录。
- VERSION.md：当前发版版本号、tag 约定和 release note 草稿。
- bundle/：npm 发布态资源，包含预构建 runtime 和桌面 overlay 模板。
- package.json：仓库级脚本入口，优先看这里理解命令语义。
- pnpm-workspace.yaml：pnpm workspace 定义。
- tsconfig.base.json：全仓库 TypeScript 基础配置。

## apps

- apps/overlay：前端 UI 应用，既承担 Web 模式，也承担 Tauri 桌面模式。
- apps/overlay/src：React 前端代码，负责展示 Signal Pod、连接 runtime、维护前端状态。
- apps/overlay/src-tauri：Tauri Rust 代码，负责桌面窗口能力、单实例、runtime 自启动等。

## packages

- packages/core：Runtime 核心。负责启动、发现 agent、维护状态、提供 WebSocket / HTTP API。
- packages/adapters：各类 AI 工具适配器。把 Claude、Cursor、Codex、Cline 等外部状态转换成统一 SignalStatus。
- packages/shared：共享类型和协议定义。前后端都依赖这里。
- packages/ui：通用 React UI 组件，例如 SignalPod、SignalLight、FloatingGroup。
- packages/themes：主题定义与主题注册逻辑。
- packages/sdk：给第三方接入用的 SDK。
- packages/hooks-claude-code：Claude Code hooks 相关静态文件和脚本模板。

## docs

- docs/development.md：开发文档，讲启动方式、调试方法、构建方式。
- docs/usage.md：用户使用文档，讲状态含义、窗口行为、常用命令。
- docs/design.md：设计文档，讲视觉语言、状态机、协议和架构决策。
- docs/ai-dev.md：给下一个 AI / 自动化代理的交接文档。
- docs/dir.md：当前这份目录说明。

## scripts

- scripts/clean-node-modules.mjs：递归删除整个工作区里的 node_modules，供 pnpm clean:node 调用。
- scripts/build-release-assets.mjs：生成 npm 发布态 bundle，供 `prepack` 和发布验证使用。

## 当前推荐理解顺序

1. 先看 package.json，理解 dev / start / runtime / clean / check / fixit 这些入口。
2. 再看 packages/core/src/cli.ts，理解实际启动链路。
3. 再看 apps/overlay/src 和 packages/ui/src，理解 UI 如何消费 runtime 状态。
4. 最后看 docs/design.md，理解为什么要这样设计。
