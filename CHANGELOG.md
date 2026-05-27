# Changelog

All notable changes to this project will be documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/)

---

## [Unreleased]

### 0.1.0 Added

- 开源准备文档：`OPEN_SOURCE.md`、`CONTRIBUTING.md`、`CODE_OF_CONDUCT.md`、`SECURITY.md`
- 隐私与数据边界说明文档：`PRIVACY.md`
- GitHub 协作模板：Bug Issue、Feature Issue、Pull Request 模板
- 仓库根目录 `LICENSE`（MIT）

### Changed

- 精简仓库级启动命令：`pnpm dev`、`pnpm dev:mock`、`pnpm start`、`pnpm start:mock`、`pnpm runtime`、`pnpm runtime:mock`
- 精简排障与维护命令：`pnpm clean`、`pnpm check`、`pnpm fixit`、`pnpm clean:node`、`pnpm build`、`pnpm lint`
- `aal` CLI 改为同时支持源码态与发布态：仓库内走源码 `cli.ts`，npm 安装后走 `bundle/runtime/core/cli.js`
- 新增发布产物打包流程：预打包时生成 `bundle/runtime/*` 与 `bundle/overlay-template/*`，供 npm 安装后的 `aal start` 使用
- `aal start` 发布态改为首次在 `~/.ai-agents-leader/desktop/<version>/overlay` 本地构建 Tauri 桌面端，后续复用缓存二进制启动
- 根包 `publishConfig.registry` 固定为 `https://registry.npmjs.org/`，避免误发到本地或内网镜像 registry
- 根包 `bin.aal` 路径按 npm 规范归一化，消除 `npm publish --dry-run` 的自动修正 warning
- Codex 状态检测改为优先解析 `~/.codex/sessions/**/*.jsonl` 的显式事件与最近写入，补强 `thinking` / `running` / `completed` 判定，并为未来 `waiting_input` 结构化字段预留兼容分支
- Cursor 状态检测改为基于 `workspaceStorage/*/state.vscdb` 的最近活动，不再监听整个家目录，减少误报
- Cline / Roo 状态检测改为基于扩展状态目录与任务文件内容解析；无扩展活动时回落到 `idle`，不再因为 VS Code 进程存在就误判 `thinking`
- 新增 VS Code 专用 `GitHub Copilot Chat` 与 `OpenAI ChatGPT` 适配器，基于全局 Chat 状态库、OpenAI 扩展状态和 workspaceStorage 活动做状态同步
- `aal check` / `aal fixit` 增加跨平台桌面构建前置检查与可执行安装提示：Windows 检测 Visual Studio C++ Build Tools，Linux 检测 GTK / WebKitGTK / libsoup，macOS 检测 Xcode Command Line Tools
- 发布态 Windows 桌面构建失败时补充明确提示：VS Code 不是 Visual Studio Build Tools，不能替代 MSVC 构建环境
- Runtime CLI 改为通过 package-scoped `pnpm --dir apps/overlay ...` 启动 Vite / Tauri，移除跨包 `require.resolve()` 依赖
- `aal` 入口版本号改为优先读取对外根包版本，避免 `aal -v` 错报内部 `@aal/core` 版本
- Tauri `ensure_runtime` 只拉起 Runtime，不再误启动 Web Overlay
- Tauri `ensure_runtime` 改为请求 `/api/health` 探活，避免把任意端口占用误判为 runtime 已就绪
- 统一 Runtime 选端口与 Overlay 发现端口范围，避免 Runtime 成功启动但 Web / Tauri UI 无法发现
- WebSocket 端口扫描失败路径补全 `resolve(false)`，避免前端在首个失败端口处卡死
- CLI 残留进程清理改为仅清理项目端口与已知 overlay 进程，避免误杀其他仓库的 `tsx` 进程
- 默认路径不再自动注入 MockAdapter，只有显式 mock 命令才启用 mock 数据
- 删除已废弃的 `packages/core/src/dev.ts` 入口，适配器接入文档改为指向当前 `cli.ts` 发现链路
- README、使用文档、开发文档、AI 交接文档与当前启动链路、桌面模式说明重新对齐，并补充发布态首次构建与缓存说明
- README 补充开源、隐私与贡献入口，根包补充开源发布元数据（`license`、`homepage`、`keywords`）

## [0.1.0] - 2026-05-23

### 项目初始化

### Added

- Monorepo 架构：pnpm workspace 配置、TypeScript 基础配置（`tsconfig.base.json`）、6 个 packages（core、adapters、shared、sdk、themes、ui）和 1 个 app（overlay，Tauri v2）
- Runtime Core（`@aal/core`）：`RuntimeBus`、`StateMachine`、`RuntimeStore`、`AdapterManager`、`WsServer`、`NotificationEngine`、`startRuntime()`
- 适配器系统（`@aal/adapters`）：`AgentAdapter` 接口、`BaseAdapter`、`MockAdapter`、`ClaudeAdapter`、`CursorAdapter`
- 共享类型（`@aal/shared`）：`SignalStatus`、`StateGroup`、`AgentInfo`、`WsMessage`
- UI 组件（`@aal/ui`）：`SignalPod`、`SignalLight`、`FloatingGroup`、`WindowControls`、`ThemeProvider`、`useTheme`
- 主题系统（`@aal/themes`）：`Theme` 接口、`default` 默认主题、`cyberpunk` 主题
- Overlay 应用（`@aal/overlay`）：Tauri v2 配置、React + Vite + Tailwind、`useWebSocket`、`agentStore`、Rust IPC 命令
- SDK（`@aal/sdk`）：`RuntimeClient`
- 文档：`AGENTS.md`、`docs/development.md`、`docs/usage.md`、`docs/design.md`、`CHANGELOG.md`

### 0.1.0 Verified

- Runtime 启动后 WebSocket 自动选端口
- 3 个 Mock Agent 注册成功
- 状态流转 `idle -> thinking -> running -> completed` 正常
- Overlay UI 正常渲染
- WebSocket 通信正常

---

## [0.2.0] - 2026-05-25

### 0.2.0 Added

- Adapter 系统扩展：`CodexAdapter`、`OpenCodeAdapter`、`ClineAdapter`、`RooCodeAdapter`、`HttpAdapter`
- Claude Code Hooks 插件：自动安装到 `~/.claude/plugins/ai-agents-leader/`，并支持 `PreToolUse -> waiting_input`、`PostToolUse -> running`、`UserPromptSubmit -> thinking`、`Stop -> completed`，Hooks 优先、JSONL fallback
- HTTP API：`HttpApi` 服务（`http://127.0.0.1:9989/api/state`）、`POST /api/state`、`GET /api/agents`、`GET /api/health`，并支持自动注册未知 agent

### 0.2.0 Changed

- 状态系统升级：`thinking` 改为黄紫交替流动，`running` 改为蓝紫青三灯交替流动，`waiting_input` 改为黄色低频闪烁，`stalled` 改为黄色高频闪烁，`error` 保持红色高频闪烁
- 一键启动：`pnpm start` 自动检测所有 6 种 AI Agent，自动安装 Claude Code Hooks 插件，并每 10 秒重新检测新启动的 agent，同时写入端口文件 `~/.ai-agents-leader/port` 供 hooks 发现

---

## [0.2.1] - 2026-05-25

### 0.2.1 Changed

- 状态检测优化：Claude Adapter 双源仲裁改为 Hooks 优先，JSONL 在 Hooks 活跃时（8 秒）自动抑制；`completed` 增加 15 秒保护；`waiting_input` 增加 2 秒去抖动；JSONL 读取缓冲区从 64KB 提升到 128KB；BaseAdapter `emit()` 自动注入时间追踪字段；RuntimeStore `updateAgent()` 改为 meta 合并
- UI 改进：Signal Pod 标题箭头移到左侧（20px，白色），Token 显示替换为 Time，详情区补充原生 tooltip，Dir 行 `cursor: text`，Nudge 按钮增大到 20px 且支持反馈动画，标题支持超长省略，整个标题区域可点击展开/收起详情
- 自动化：`killStaleProcesses()` 跳过当前进程和父进程，Session 清理改为每 10 秒定期扫描，Codex 检测排除 VS Code 扩展的 `codex app-server` 进程，WsServer 每 5 秒广播全量状态

### 0.2.1 Fixed

- Framer Motion `steps(1)` 白屏崩溃，改为 `times` 数组
- `slugToPath()` 下划线目录名还原，改为 `generateUnderscoreCombinations()`
- Hook meta 覆盖 adapter meta 导致 Dir 显示 `-`，改为合并策略

---

## [0.3.0] - 2026-05-25

### CLI 工具 (`aal` 命令)

注：以下条目描述的是 v0.3.0 当时引入的命令面。当前版本的对外命令已在 `Unreleased` 中重新精简，不应直接按这里的旧命令使用。

### 0.3.0 Added

- CLI 工具（`aal` 命令）：`aal start`、`aal open`、`aal clean`、`aal check`、`aal update`、`aal -v`、`aal help`、`bin/aal.mjs`、作为 runtime 依赖的 `tsx`，以及 npm 发布文档 `README.md`
- Tauri 桌面应用：透明背景窗口、`data-tauri-drag-region="deep"`、`WindowControls`、单实例限制、自动启动 runtime、`ensure_runtime` Rust 命令、Tauri capabilities 配置、`tauri-plugin-shell`
- 客户端轮询：`useWebSocket` 增加 HTTP API 轮询备份（每 10 秒），WS 断线时自动降级为轮询

### 0.3.0 Changed

- 端口变更：WebSocket `9527 -> 9988`，HTTP API `9528 -> 9989`（WS + 1），Overlay UI `1420 -> 1666`，Overlay 扫描范围调整为 `[9988, 9989, 9990, 9991, 9992]`
- Tauri 桌面应用调整：`macosPrivateApi` 更正为 `macOSPrivateApi`，移除 CSS `-webkit-app-region`，按钮统一加 `data-tauri-drag-region="false"`
- 状态检测重构：统一为单一路径 `Hook -> HttpApi -> Adapter.reportHookState() -> emit() -> StateMachine`，`AgentAdapter` 新增 `reportHookState?()`，`ClaudeAdapter` 实现 `reportHookState()`，修复 `parseLastEntry()`，并引入 500ms 最小间隔的状态平滑机制，`HttpApi` Hook 更新改走 adapter
- UI 改进：移除顶部标题 `● AI Agents Leader (N)`，FloatingGroup 圆角 16px + padding 14px，卡片圆角 16px，窗口控制按钮统一样式，Nudge 按钮点击动画改为缩放与颜色反馈

---

## Roadmap

### 计划中

- [ ] 主题切换 UI
- [ ] 系统托盘集成
- [ ] 数据持久化 (SQLite)
- [ ] Timeline / Runtime History
- [ ] Plugin Marketplace 基础
- [ ] Community Themes 支持
