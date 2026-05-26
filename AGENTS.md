# AGENTS.md — AI Agent 协作指南

> 本文件是 AI Agent（Claude、Cursor 等）在本项目中协作时的行为准则和上下文参考。
> 任何对项目结构、架构、约定的变更，必须同步更新本文件。

---

## 项目概述

**AI Agents Leader** 是一个本地 AI Runtime Signal System。

核心理念：**让用户看灯就知道 AI 是否还在活着。**

- 不是 AI IDE、Dashboard、Chat Client 或 Workflow 系统
- 是一个极轻量的 Overlay UI，像红绿灯一样显示 AI Agent 的运行状态
- 本地运行，pnpm workspace monorepo，支持 Web Overlay 和 Tauri 桌面浮窗

---

## 技术栈

| 层         | 技术                               |
| ---------- | ---------------------------------- |
| Runtime    | Node.js + TypeScript               |
| Overlay UI | Tauri v2 + React 18 + Tailwind CSS |
| 动画       | Framer Motion                      |
| 状态管理   | Zustand                            |
| 通信       | WebSocket (ws) + HTTP API          |
| 包管理     | pnpm workspace monorepo            |
| 事件系统   | EventEmitter3                      |
| 日志       | Pino                               |

---

## 项目结构

```text
AI_Agents_Leader/
├── apps/
│   └── overlay/              # Tauri v2 桌面应用
│       ├── src-tauri/        # Rust 端 (Tauri 窗口管理、IPC)
│       │   ├── src/
│       │   │   ├── lib.rs            # 主入口 (单实例、自动启动 runtime)
│       │   │   ├── commands.rs       # IPC 命令 (ensure_runtime, create_pod_window)
│       │   │   └── window.rs         # 窗口工具函数
│       │   ├── capabilities/         # Tauri 权限配置
│       │   └── tauri.conf.json       # Tauri 配置
│       └── src/              # React 端 (UI、hooks、stores)
├── packages/
│   ├── core/                 # Runtime Daemon 核心
│   │   ├── src/
│   │   │   ├── EventBus.ts           # 全局事件总线 (单例)
│   │   │   ├── StateMachine.ts       # 状态转换验证器
│   │   │   ├── stateMachineInstance.ts # 单例实例
│   │   │   ├── RuntimeStore.ts       # 内存状态存储
│   │   │   ├── AdapterManager.ts     # 适配器生命周期
│   │   │   ├── WsServer.ts           # WebSocket 服务器
│   │   │   ├── NotificationEngine.ts # 通知引擎
│   │   │   ├── portUtils.ts          # 端口发现工具
│   │   │   ├── index.ts              # 主入口 (startRuntime)
│   │   │   ├── cli.ts                # 一键启动入口 (aal 命令)
│   │   │   ├── HttpApi.ts            # HTTP API 服务
│   │   │   └── demo.ts               # 内部状态演示入口
│   │   └── bin/
│   │       └── aal.mjs               # npm 全局命令入口
│   ├── adapters/             # 可插拔适配器
│   │   ├── src/
│   │   │   ├── types.ts              # AgentAdapter 接口
│   │   │   ├── BaseAdapter.ts        # 基类 (含卡住检测 + 时间追踪)
│   │   │   ├── claude/               # Claude Code 适配器 (hooks + JSONL)
│   │   │   ├── cursor/               # Cursor IDE 适配器
│   │   │   ├── codex/                # Codex (OpenAI CLI) 适配器
│   │   │   ├── opencode/             # OpenCode 适配器
│   │   │   ├── cline/                # Cline (VS Code) 适配器
│   │   │   ├── roo/                  # Roo Code (VS Code) 适配器
│   │   │   ├── http/                 # 通用 HTTP 适配器 (第三方扩展)
│   │   │   └── mock/                 # Mock 适配器 (开发用)
│   ├── shared/               # 共享类型和常量
│   │   ├── src/
│   │   │   ├── states.ts             # Signal 状态定义
│   │   │   ├── types.ts              # 共享类型
│   │   │   └── ws-protocol.ts        # WS 通信协议
│   ├── sdk/                  # 公共 SDK
│   ├── themes/               # 主题系统
│   │   ├── src/
│   │   │   ├── types.ts              # Theme 接口
│   │   │   ├── default.ts            # 默认主题
│   │   │   └── cyberpunk.ts          # 赛博朋克主题
│   └── ui/                   # React UI 组件
│       ├── src/
│       │   ├── SignalPod.tsx          # 信号荚组件
│       │   ├── SignalLight.tsx        # LED 灯组件
│       │   ├── FloatingGroup.tsx      # 浮动容器 (Tauri 拖拽区域)
│       │   ├── WindowControls.tsx     # 窗口控制按钮
│       │   ├── ThemeProvider.tsx      # 主题注入
│       │   └── animations.ts         # 动画定义
├── bundle/                   # npm 发布态资源
│   ├── runtime/              # 预构建 JS Runtime (shared/adapters/core)
│   ├── overlay-template/     # 发布态桌面模板 (dist + src-tauri)
│   └── manifest.json         # 发布资源版本信息
├── docs/                     # 文档目录
├── scripts/                  # 工作区维护脚本（清理 node_modules 等）
│   └── build-release-assets.mjs # 生成 npm 发布态 bundle
├── AGENTS.md                 # 本文件
├── CHANGELOG.md              # 版本日志
├── README.md                 # npm 发布文档
└── pnpm-workspace.yaml
```

---

## 核心概念

### Signal 状态

所有 Agent 的状态统一为以下 7 种：

| 状态            | 视觉组   | 颜色     | 动画            |
| --------------- | -------- | -------- | --------------- |
| `idle`          | idle     | 灰色     | 微弱呼吸        |
| `thinking`      | thinking | 黄紫交替 | 三灯交替流动    |
| `running`       | running  | 蓝紫青   | 三灯交替流动    |
| `completed`     | success  | 绿色     | 闪烁 3 次后常亮 |
| `error`         | alert    | 红色     | 高频闪烁        |
| `waiting_input` | waiting  | 黄色     | 低频闪烁        |
| `stalled`       | stalled  | 黄色     | 高频闪烁        |

**关键规则：**

- `waiting_input` 是黄色低频闪烁（等待用户确认，需注意但不紧急）
- `error` 是红色高频闪烁（异常/中断，强提醒）
- `stalled` 是黄色高频闪烁（可能卡住，需关注）
- `completed` 不允许熄灭（用户回来必须一眼看到任务完成）
- 只有 `completed`、`error`、`waiting_input`、`stalled` 触发通知

### Signal Pod

一个 AI Agent = 一个 Signal Pod：

```text
╭────────────────────╮
│ ▾ Claude · admin   │   ← 点击展开详情
│                    │
│   ● ● ●        ✦   │   ← 3 个信号灯 + Nudge 按钮
│                    │
╰────────────────────╯
```

- Header: 展开箭头 + AI 名称（超长省略，hover 显示完整名称）
- 整个标题区域可点击展开/收起详情
- 3 个信号灯（固定，不扩展）
- ✦ 尾部按钮 (nudge/wake) — 点击有缩放+颜色闪烁反馈
- 支持展开查看详情（Status、Dir、Time）
- 展开时箭头向上 `▴`，收起时向下 `▾`（20px，白色）

### 窗口控制

Tauri 桌面模式下，容器顶部有窗口控制按钮：

- `–` 最小化
- `▲` 置顶 / `▼` 置底（切换）
- `✕` 关闭

整个容器区域（除按钮外）可拖动移动窗口。

### Adapter 系统

适配器是可插拔的，不硬编码任何 AI。支持 6 种内置 agent + 通用 HTTP 扩展：

| Agent           | Adapter         | 检测方式                                      |
| --------------- | --------------- | --------------------------------------------- |
| ClaudeCode      | ClaudeAdapter   | Hooks 插件 (实时) + JSONL 文件解析 (fallback) |
| Cursor          | CursorAdapter   | 进程检测 + Cursor workspaceStorage 状态库变化 |
| CodeX           | CodexAdapter    | 进程检测 + 会话 JSONL 显式事件解析            |
| OpenCode        | OpenCodeAdapter | 进程检测 + 配置文件监听                       |
| Cline           | ClineAdapter    | VS Code 进程 + 扩展状态/任务文件解析          |
| RooCode         | RooCodeAdapter  | VS Code 进程 + 扩展状态/任务文件解析          |
| 第三方 / 自定义 | HttpAdapter     | HTTP API 推送状态                             |

```typescript
interface AgentAdapter {
  readonly id: string;
  readonly name: string;
  readonly displayName: string;
  readonly icon: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  getStatus(): SignalStatus;
  onStateChange(callback): () => void;
  reportHookState?(status, meta?): void; // 可选，Hook 状态更新
}
```

**状态检测方式：**

- **Hooks 推送** (Claude Code) — 最实时，PreToolUse/PostToolUse/Stop/UserPromptSubmit
- **HTTP API 推送** — 通用协议，任何 agent 都能用
- **文件监听** — 监控 agent 的会话/状态文件变化
- **进程检测** — 定时检查 agent 进程是否在运行

**Claude Code 双源仲裁：**

- Hooks 是最权威的状态源（实时推送）
- JSONL 文件解析作为 fallback（兼容旧版本）
- 当 Hooks 活跃时（8 秒内），JSONL 解析自动抑制
- `completed` 状态受 15 秒保护，防止 JSONL 覆盖
- `waiting_input` 增加 2 秒去抖动，避免工具快速执行时误判
- 状态平滑机制：500ms 最小间隔防止快速抖动（completed/error 始终放行）

**Claude Code Hooks 插件：**

- 自动安装到 `~/.claude/plugins/ai-agents-leader/`
- 通过 `PreToolUse` → `waiting_input` (等待确认)
- 通过 `PostToolUse` → `running` (工具执行中)
- 通过 `UserPromptSubmit` → `thinking` (思考中)
- 通过 `Stop` → `completed` (完成)

### 发布态 CLI

- 仓库源码环境下：`packages/core/bin/aal.mjs` 直接转到 `packages/core/src/cli.ts`
- npm 安装环境下：`packages/core/bin/aal.mjs` 转到 `bundle/runtime/core/cli.js`
- `aal start` 发布态首次运行会把 `bundle/overlay-template` 复制到 `~/.ai-agents-leader/desktop/<version>/overlay`
- 发布态桌面端通过本机 `@tauri-apps/cli` + Rust/Cargo 在用户目录本地构建
- 首次构建完成后复用 `target/release` 缓存，不再重复完整编译

---

## CLI 命令

```bash
aal           # 启动桌面 UI 模式
aal dev       # 启动 Web 模式
aal dev:mock  # 启动 Web Mock 模式
aal start     # 启动桌面 UI 模式
aal start:mock # 启动桌面 Mock 模式
aal runtime   # 仅启动 Runtime
aal runtime:mock # 仅启动 Mock Runtime
aal clean     # 清理残留进程
aal check     # 检查系统状态
aal fixit     # 自动修复常见启动问题
```

---

## 端口管理

| 服务       | 端口 |
| ---------- | ---- |
| WebSocket  | 9988 |
| HTTP API   | 9989 |
| Overlay UI | 1666 |

- 端口冲突时自动清理残留进程
- Overlay 扫描 [9988, 9989, 9990, 9991, 9992] 自动发现 Runtime
- 客户端每 10 秒 HTTP 轮询作为 WS 推送的备份

---

## 开发约定

### 命名规范

- 包名：`@aal/<name>`（如 `@aal/core`、`@aal/shared`）
- 组件：PascalCase（如 `SignalPod`、`SignalLight`）
- Hook：`use` 前缀（如 `useWebSocket`、`useTheme`）
- CSS 变量：`--aal-` 前缀（如 `--aal-bg`、`--aal-light-thinking`）
- 状态：snake_case（如 `waiting_input`）

### 文件组织

- 每个包的入口是 `src/index.ts`，统一导出
- 类型定义放在 `types.ts` 或内联在使用处
- 单例模式：单独文件 + 导出实例（如 `stateMachineInstance.ts`）

### 状态机规则

- 所有状态转换必须经过 `StateMachine.validate()`
- 非法转换会被拒绝并打印警告
- 任何状态都可以 `reset` 到 `idle`

### WebSocket 协议

消息格式：`{ type: string, payload?: any }`

客户端 → 服务器：`request:state`、`nudge`（`subscribe` / `unsubscribe` 预留）
服务器 → 客户端：`agent:list`、`agent:added`、`agent:removed`、`state:update`、`notification`、`theme:change`

### 主题系统

- 所有视觉属性通过 CSS 变量注入
- 主题对象定义在 `packages/themes/src/`
- 新增主题：实现 `Theme` 接口 → `registerTheme()` → 即可使用

---

## 常用命令

```bash
# 安装依赖
pnpm install

# Web 模式（真实本地 agent）
pnpm dev

# Web Mock 模式
pnpm dev:mock

# 桌面 UI 模式（真实本地 agent）
pnpm start

# 桌面 Mock 模式
pnpm start:mock

# 仅启动 Runtime
pnpm runtime

# 仅启动 Mock Runtime
pnpm runtime:mock

# 清理 / 检查 / 自动修复
pnpm clean
pnpm check
pnpm fixit

# 清理所有 node_modules
pnpm clean:node

# Lint / Build
pnpm lint
pnpm build

# TypeScript 类型检查
pnpm -r --filter "@aal/shared" --filter "@aal/ui" --filter "@aal/adapters" --filter "@aal/core" exec tsc --noEmit

# 生成 npm 发布态资源
node ./scripts/build-release-assets.mjs

# 清理残留进程 + 重启
pnpm restart
```

---

## 文档维护规则

**每次变更必须同步更新：**

1. **本文件 (AGENTS.md)** — 如果涉及：
   - 项目结构变化
   - 新增/删除包
   - 核心概念变更
   - 开发约定变更
   - 命令变更

2. **CHANGELOG.md** — 每次版本发布或重要变更

3. **docs/** 目录下的文档 — 对应内容变更

---

## 已知限制

- Tauri 透明窗口在某些 Linux 桌面环境下需要合成器支持
- Claude Adapter 的 JSONL 解析依赖会话文件格式，可能随版本变化（Hooks 为主要检测源）
- Mock Adapter 的状态循环是固定的，不代表真实 AI 行为
- 当前没有数据持久化，状态仅存在于内存中

---

## 未来扩展点

- Timeline / Runtime History（SQLite 持久化）
- Plugin Marketplace（社区适配器和主题）
- SDK 生态（第三方 AI Runtime 接入）
- Agent Runtime Protocol（标准化通信协议）
