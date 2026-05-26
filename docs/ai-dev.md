# AI 开发交接文档

> 本文档供下一个 AI 阅读，快速了解项目全貌、开发要点、已踩的坑。

---

## 项目一句话

**AI Agents Leader** — 本地 AI 状态指示灯系统。像红绿灯一样，用 LED 信号灯实时显示多个 AI Agent 的工作状态。

核心理念：**看灯就知道 AI 是否还活着。**

---

## 技术栈

- **Runtime:** Node.js + TypeScript (pnpm monorepo)
- **Overlay UI:** Tauri v2 (Rust) + React 18 + Framer Motion
- **通信:** WebSocket (ws) + HTTP API
- **状态管理:** Zustand (前端) + EventEmitter3 (后端)
- **日志:** Pino

---

## 项目结构

```
AI_Agents_Leader/
├── apps/overlay/           # Tauri v2 桌面应用
│   ├── src-tauri/          # Rust 端
│   └── src/                # React 端
├── packages/
│   ├── core/               # Runtime Daemon (cli.ts, HttpApi, WsServer)
│   ├── adapters/           # 6 种 AI 适配器 + Mock + HTTP
│   ├── shared/             # 共享类型 (SignalStatus, AgentInfo, WsProtocol)
│   ├── ui/                 # React 组件 (SignalPod, FloatingGroup, WindowControls)
│   ├── themes/             # 主题系统 (default, cyberpunk)
│   └── sdk/                # 第三方接入 SDK
├── docs/                   # 文档
├── scripts/                # 工作区维护脚本（clean-node 等）
├── AGENTS.md               # AI 协作指南
├── CHANGELOG.md            # 版本日志
└── README.md               # npm 发布文档
```

---

## 核心概念

### 7 种信号状态

| 状态          | 视觉组   | 颜色     | 动画      | 含义     |
| ------------- | -------- | -------- | --------- | -------- |
| idle          | idle     | 灰       | 微弱呼吸  | 空闲     |
| thinking      | thinking | 黄紫交替 | 三灯流动  | AI 在想  |
| running       | running  | 蓝紫青   | 三灯流动  | AI 在干  |
| completed     | success  | 绿       | 闪3次常亮 | 干完了   |
| error         | alert    | 红       | 高频爆闪  | 出错了   |
| waiting_input | waiting  | 黄       | 低频闪烁  | 等确认   |
| stalled       | stalled  | 黄       | 高频闪烁  | 可能卡住 |

### Signal Pod 组件

每个 Agent 一个 Pod：展开箭头 + 名称 + 3 个 LED 灯 + Nudge 按钮。可展开查看 Status/Dir/Time。

### Adapter 系统

6 种内置适配器 + 通用 HTTP 扩展，可插拔设计：

- ClaudeAdapter: Hooks 插件 (实时) + JSONL (fallback)
- CursorAdapter / CodexAdapter / OpenCodeAdapter: 进程检测 + 文件监听
- ClineAdapter / RooCodeAdapter: VS Code 进程 + 扩展状态
- HttpAdapter: 第三方 HTTP API 推送

---

## 端口

| 服务       | 端口 |
| ---------- | ---- |
| WebSocket  | 9988 |
| HTTP API   | 9989 |
| Overlay UI | 1666 |

---

## CLI 命令 (`aal`)

入口：`packages/core/bin/aal.mjs` → spawn tsx → `packages/core/src/cli.ts`

```bash
aal          # 启动桌面 UI 模式
aal dev      # 启动 Web 模式
aal dev:mock # 启动 Web Mock 模式
aal start    # 启动桌面 UI 模式
aal start:mock # 启动桌面 Mock 模式
aal runtime  # 仅启动 Runtime
aal runtime:mock # 仅启动 Mock Runtime
aal clean    # 清理残留进程
aal check    # 检查系统状态
aal fixit    # 自动修复常见启动问题
```

---

## 已完成的功能

### 核心功能

- [x] 7 种信号状态 + 7 种视觉动画
- [x] Adapter 可插拔系统 (6 种内置 + HTTP 扩展)
- [x] WebSocket 实时推送 + HTTP API
- [x] 自动 Agent 发现 (进程检测 + 文件监听)
- [x] Claude Code Hooks 插件 (PreToolUse/PostToolUse/Stop/UserPromptSubmit)
- [x] 状态机验证 (非法转换拒绝)
- [x] 通知引擎 (completed/error/waiting_input/stalled)
- [x] 卡住检测 (60s/120s 超时)
- [x] 时间追踪 (activityStart/sessionStart/lastActive)
- [x] 自动清理残留进程和端口占用
- [x] 自动注销已退出的会话

### 状态检测

- [x] 统一单一状态源路径 (Adapter → StateMachine)
- [x] Hook 状态通过 Adapter.reportHookState() 更新
- [x] JSONL completed 检测修复 (检查前一条 assistant stop_reason)
- [x] 状态平滑 (500ms 最小间隔防抖动)
- [x] Hook 抑制 (8 秒内 Hook 活跃时 JSONL 自动抑制)
- [x] completed 保护 (15 秒防覆盖)
- [x] waiting_input 去抖动 (2 秒)
- [x] 客户端 HTTP 轮询备份 (10 秒)

### UI

- [x] SignalPod 组件 (展开/收起、信号灯、Nudge)
- [x] FloatingGroup 容器 (圆角 16px、padding 14px)
- [x] WindowControls (最小化/置顶-置底/关闭)
- [x] 整个标题区域可点击展开/收起
- [x] Nudge 按钮反馈动画 (缩放+颜色闪烁)
- [x] Time 显示 (实时计时 + 最后活动时间)
- [x] 主题系统 (CSS Variables 注入)
- [x] 客户端轮询备份 (WS 断线时降级)

### Tauri 桌面应用

- [x] 透明背景 + 无边框 + 始终置顶
- [x] macOSPrivateApi 启用
- [x] data-tauri-drag-region="deep" 容器拖拽
- [x] 单实例限制 (tauri-plugin-single-instance)
- [x] 自动启动 runtime-only (ensure_runtime 命令)
- [x] Tauri capabilities 权限配置

### CLI & npm

- [x] aal 命令 (dev/dev:mock/start/start:mock/runtime/runtime:mock/clean/check/fixit)
- [x] bin/aal.mjs 全局入口
- [x] 源码态 / 发布态双入口切换
- [x] 发布态 bundle/runtime 与 overlay-template 产物
- [x] `aal start` 首次本地构建并缓存桌面端
- [x] README.md npm 发布文档
- [x] 平台特定 Rust 安装指引

---

## 已踩的坑 (重要!)

### 1. Tauri macOSPrivateApi 大小写

```json
// ❌ 错误 (小写 s)
"macosPrivateApi": true

// ✅ 正确 (大写 S)
"macOSPrivateApi": true
```

Tauri v2 schema 严格匹配大小写。在 `app` 块内。

### 2. Tauri data-tauri-drag-region

- `data-tauri-drag-region` (bare) — 只有直接点击该元素才触发拖拽
- `data-tauri-drag-region="deep"` — 整个子树都触发拖拽
- `data-tauri-drag-region="false"` — 排除拖拽 (用于按钮)
- **不要用 CSS `-webkit-app-region`** — 与 Tauri 的 drag region 冲突

### 3. Tauri 窗口权限

Tauri v2 需要在 `capabilities/default.json` 显式声明窗口操作权限：

```json
{
  "permissions": [
    "core:window:allow-close",
    "core:window:allow-minimize",
    "core:window:allow-set-always-on-top",
    "core:window:allow-start-dragging"
  ]
}
```

不声明则 API 调用静默失败。

### 4. Framer Motion 不支持 CSS steps()

```typescript
// ❌ 白屏崩溃
transition: { duration: 0.6, easing: 'steps(1)' }

// ✅ 用 times 数组
animate={{ opacity: [1, 1, 0, 0] }}
transition={{ duration: 0.6, times: [0, 0.49, 0.5, 1] }}
```

### 5. 状态双路径冲突

之前 Hook 直接调 StateMachine + JSONL 通过 Adapter，两条路径互相覆盖。

**解决方案：** 统一为单一路径：

```
Hook → HttpApi → Adapter.reportHookState() → emit() → StateMachine
JSONL → Adapter.onSessionActivity() → emit() → StateMachine
```

### 6. JSONL completed 误判

Claude 完成后 JSONL 文件末尾是 `assistant(end_turn)` + `user(system)`。看到 `type === 'user'` 就返回 `thinking` 是错误的。

**修复：** 检查前一条 assistant 的 stop_reason，如果是 end_turn/stop/max_tokens 则返回 completed。

### 7. Hook meta 覆盖 adapter meta

Hook 推送的 meta 不含 directory 等字段，直接覆盖导致 Dir 显示 `-`。

**修复：** RuntimeStore 和 agentStore 都用 spread 合并 meta。

### 8. tsx 必须是 runtime 依赖

npm 全局安装后需要执行 TypeScript，`tsx` 不能只放 devDependencies。

---

## 开发命令速查

```bash
# 安装
pnpm install

# Web 模式
pnpm dev

# Web Mock 模式
pnpm dev:mock

# 桌面 UI 模式
pnpm start

# 桌面 Mock 模式
pnpm start:mock

# 仅启动 Runtime
pnpm runtime

# 仅启动 Mock Runtime
pnpm runtime:mock

# 诊断 / 自动修复 / 清 node_modules
pnpm check
pnpm fixit
pnpm clean:node

# 停止并清理进程
pnpm clean

# 代码检查 / 构建
pnpm lint
pnpm build

# 如需单独启动 overlay 开发服务器
pnpm --filter @aal/overlay run dev

# 类型检查
pnpm -r --filter "@aal/shared" --filter "@aal/ui" --filter "@aal/adapters" --filter "@aal/core" exec tsc --noEmit

# Rust 编译检查
cd apps/overlay/src-tauri && cargo check

# 清理端口
aal clean
```

---

## 当前状态 (v0.3.0)

**已完成：** 核心功能全部可用。CLI 工具、Tauri 桌面应用、状态检测、UI 组件，以及精简后的启动 / 排障链路均已实现并验证。

**待开发：**

- 主题切换 UI
- 系统托盘集成
- 数据持久化 (SQLite)
- Timeline / Runtime History
- Plugin Marketplace

---

## 给下一个 AI 的建议

1. **先读 AGENTS.md** — 项目结构和约定都在那里
2. **端口记牢** — WS 9988, HTTP 9989, Overlay 1666
3. **Tauri 配置注意大小写** — macOSPrivateApi (大写 S)
4. **状态更新走 Adapter** — 不要直接调 stateMachine.transition()
5. **CSS 不要用 -webkit-app-region** — 用 data-tauri-drag-region
6. **测试前先 aal clean** — 避免端口冲突
7. **Rust 编译慢是正常的** — 首次 2-3 分钟，之后增量很快
