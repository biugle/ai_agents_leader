# 设计文档

## 设计理念

### 核心原则

**平时无感，有事提醒。**

用户无需打开窗口、查看日志、查看终端。只需要看灯。

### 视觉语言

参考：Tesla UI、Nothing、Teenage Engineering、Stream Deck、macOS 控制中心

关键词：半拟物、磨砂黑底、胶囊形态、玻璃灯珠、极简、高级硬件感

**禁止风格：** Web Dashboard、管理后台、IDE

---

## Signal 状态系统

### 状态定义

```
SignalStatus = idle | thinking | running | completed | error | waiting_input | stalled
StateGroup   = idle | thinking | running | success | alert | waiting | stalled
```

### 状态分组

| 视觉组   | 包含状态      | 颜色     | 语义      |
| -------- | ------------- | -------- | --------- |
| idle     | idle          | 灰       | 无事发生  |
| thinking | thinking      | 黄紫交替 | AI 在想   |
| running  | running       | 蓝紫青   | AI 在干   |
| success  | completed     | 绿       | 干完了    |
| alert    | error         | 红       | 出错/中断 |
| waiting  | waiting_input | 黄       | 等待确认  |
| stalled  | stalled       | 黄       | 可能卡住  |

### 状态机

```
                 ┌─────────────┐
                 │             │
    ┌───────────►│    idle     │◄────────────┐
    │            │             │             │
    │            └──────┬──────┘             │
    │                   │                    │
    │            thinking/running            │
    │                   │                    │
    │            ┌──────▼──────┐             │
    │            │             │             │
    │     ┌─────►│  thinking   │             │
    │     │      │             │             │
    │     │      └──────┬──────┘             │
    │     │             │                    │
    │     │      running/idle/error          │
    │     │             │                    │
    │     │      ┌──────▼──────┐             │
    │     │      │             │             │
    │     ├──────┤   running   ├─────────────┤
    │     │      │             │             │
    │     │      └──┬──┬──┬──┬─┘             │
    │     │         │  │  │  │               │
    │     │  completed error waiting stalled │
    │     │         │  │  │  │               │
    │     │  ┌──────▼──▼──▼──▼──┐            │
    │     │  │  completed/       │            │
    └─────┼──┤  error/           ├────────────┘
          │  │  waiting_input/   │
          │  │  stalled          │
          │  └───────────────────┘
          │         │
          │    reset to idle
          │         │
          └─────────┘
```

### 设计决策

1. **waiting_input 是黄色**：AI 停下来等用户确认，需要关注但不紧急。与 error（红色）区分，黄色表示"请看一眼"而非"出事了"。

2. **stalled 是黄色**：可能卡住，需要关注。与 waiting_input 同色但高频闪烁，表示更紧急。

3. **completed 不熄灭**：用户可能离开电脑，回来必须一眼看到任务完成。不是"亮一下就灭"。

4. **三灯固定**：人类天然理解红黄绿，学习成本最低。不扩展更多灯。

5. **没有 fake progress bar**：AI 没有真实进度，流动动画表示"在干活"，而不是"30% 完成"。

6. **双源仲裁**：Hooks 是最权威的状态源，JSONL 作为 fallback。Hooks 活跃时 JSONL 自动抑制，避免状态冲突。

---

## 动画系统

### 动画定义

| 状态     | 动画 | 参数                                 | 视觉效果           |
| -------- | ---- | ------------------------------------ | ------------------ |
| idle     | 呼吸 | 4s 周期, opacity 0.15→0.35           | 若隐若现           |
| thinking | 流动 | 1.2s 周期, 黄紫交替, 0.4s 灯间延迟   | 黄紫三灯交替流动   |
| running  | 流动 | 0.9s 周期, 蓝紫青交替, 0.3s 灯间延迟 | 蓝紫青三灯交替流动 |
| success  | 闪烁 | 0.6s 内闪 3 次→常亮                  | 完成确认           |
| alert    | 爆闪 | 0.25s 周期, times 数组               | 红色高频闪烁       |
| waiting  | 闪烁 | 1.5s 周期, 黄色低频                  | 等待确认           |
| stalled  | 爆闪 | 0.3s 周期, 黄色高频                  | 可能卡住           |

### LED 灯效实现

```css
.light {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, var(--light-color), var(--light-dark));
  box-shadow:
    0 0 8px var(--glow-color),
    inset 0 0 4px rgba(255,255,255,0.3);
}
```

使用 Framer Motion 驱动动画，CSS 变量控制颜色。

---

## 通信架构

### 数据流

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Adapter    │────►│  EventBus   │────►│  StateMachine│
│  (Claude/    │     │  (events)   │     │  (validate)  │
│   Cursor)    │     └──────┬──────┘     └──────┬───────┘
└─────────────┘            │                    │
                     ┌─────▼─────┐        ┌─────▼─────┐
                     │  WsServer │        │  Runtime   │
                     │  (bridge) │        │   Store    │
                     └─────┬─────┘        └───────────┘
                           │
                    WebSocket (JSON)
                           │
                     ┌─────▼─────┐
                     │  Overlay   │
                     │  (React)   │
                     └───────────┘
```

### 状态更新路径

所有状态更新统一走 Adapter → StateMachine 单一路径：

```
Hook → HttpApi → Adapter.reportHookState() → adapter.emit() → StateMachine
JSONL → Adapter.onSessionActivity() → adapter.emit() → StateMachine
```

### WebSocket 协议

所有消息 JSON 格式，`type` 字段区分：

**客户端 → 服务器：**

- `request:state` — 请求当前所有 Agent 状态
- `nudge` — 发送唤醒信号

**服务器 → 客户端：**

- `agent:list` — 当前所有 Agent 的完整快照（初始同步 / 周期同步）
- `agent:added` — 新 Agent 注册
- `agent:removed` — Agent 注销
- `state:update` — 状态变更
- `notification` — 通知事件
- `theme:change` — 主题切换

说明：`subscribe` / `unsubscribe` 在共享协议类型中已预留，但当前 Overlay 实际使用的是连接后立即发送 `request:state`。

### 端口管理

| 服务       | 端口 |
| ---------- | ---- |
| WebSocket  | 9988 |
| HTTP API   | 9989 |
| Overlay UI | 1666 |

- 端口写入 `~/.ai-agents-leader/port`
- Overlay 扫描 [9988, 9989, 9990, 9991, 9992] 自动发现
- 客户端每 10 秒 HTTP 轮询作为 WS 推送备份

---

## Adapter 设计

### 接口

```typescript
interface AgentAdapter {
  readonly id: string;        // 唯一标识
  readonly name: string;      // 适配器名
  readonly displayName: string; // 显示名
  readonly icon: string;      // 图标 emoji

  start(): Promise<void>;
  stop(): Promise<void>;
  getStatus(): SignalStatus;
  onStateChange(callback: (status, meta?) => void): () => void;
  reportHookState?(status, meta?): void; // 可选，Hook 状态更新
}
```

### 检测策略

不依赖官方 API，通过系统层面推断状态：

| 方式       | Claude       | Cursor   | Codex      | OpenCode   | Cline      | RooCode    |
| ---------- | ------------ | -------- | ---------- | ---------- | ---------- | ---------- |
| Hooks      | ✓ 实时推送   | —        | —          | —          | —          | —          |
| JSONL 解析 | ✓ fallback   | —        | —          | —          | —          | —          |
| 进程检测   | —            | ✓        | ✓          | ✓          | ✓          | ✓          |
| 文件监听   | ✓ ~/.claude/ | ✓ 工作区 | ✓ 会话文件 | ✓ 配置文件 | ✓ 扩展状态 | ✓ 扩展状态 |

### 卡住检测

`BaseAdapter` 内置 stalled 检测：

- 状态为 `thinking` 或 `running` 时启动定时器（默认 60s，Claude Adapter 120s）
- 任何状态变化重置定时器
- 超时自动转为 `stalled`（黄色警告）

### 时间追踪

`BaseAdapter` 自动追踪以下时间字段，注入到每次状态变更的 meta 中：

- `activityStart` — 当前活动（thinking/running/waiting_input）开始时间
- `sessionStart` — 会话首次激活时间
- `lastActive` — 最后一次活动时间

### 状态平滑

ClaudeAdapter 内置状态平滑机制：

- 最小状态切换间隔 500ms，防止快速抖动
- `completed` 和 `error` 始终放行（确定性信号）
- Hook 抑制：8 秒内 Hook 更新时 JSONL 解析自动抑制
- `completed` 保护：15 秒内防止 JSONL 覆盖

---

## 主题系统

### 结构

```typescript
interface Theme {
  id: string;
  name: string;
  colors: { background, surface, surfaceHover, text, textMuted, border };
  lights: { thinking, running, success, alert, idle }; // 每个有 color + glow
  pod: { borderRadius, backdropBlur, shadow };
  animation: { pulseSpeed, flowSpeed, strobeSpeed, breathSpeed };
}
```

### 注入方式

Theme 对象 → CSS Variables → 组件消费

```typescript
// ThemeProvider.tsx
root.style.setProperty('--aal-bg', theme.colors.background);
root.style.setProperty('--aal-light-thinking', theme.lights.thinking.color);
// ...
```

### 扩展

```typescript
const myTheme: Theme = { ... };
registerTheme(myTheme);
// 之后可通过 getTheme('my-theme') 使用
```

---

## Tauri 桌面应用

### 窗口配置

- 透明背景：`transparent: true`
- 无边框：`decorations: false`
- 始终置顶：`alwaysOnTop: true`
- macOS 私有 API：`macOSPrivateApi: true`（透明窗口需要）
- 任务栏隐藏：`skipTaskbar: true`

### 拖拽机制

使用 `data-tauri-drag-region="deep"` 实现容器区域拖拽：

- FloatingGroup 整体设为 `data-tauri-drag-region="deep"`
- 所有按钮加 `data-tauri-drag-region="false"` 排除拖拽
- CSS `-webkit-app-region` 不使用（与 Tauri 冲突）

### 单实例

使用 `tauri-plugin-single-instance`：

- 新实例启动时，旧实例收到回调
- 旧实例关闭所有窗口并退出
- 保证每次打开都是最新独立页面

### 自动启动 Runtime

Tauri 启动时通过 `ensure_runtime` 命令：

1. 检查端口 9989 是否被占用
2. 未占用则查找 `aal runtime` 命令或最近的工作区 `pnpm runtime`
3. 等待 3 秒后通知前端 runtime 就绪

---

## 通知系统

### 规则

| 状态          | 通知 | 原因               |
| ------------- | ---- | ------------------ |
| thinking      | ❌    | 正常工作，无需打扰 |
| running       | ❌    | 正常工作，无需打扰 |
| completed     | ✅    | 任务完成，需要查看 |
| error         | ✅    | 出错，需要处理     |
| waiting_input | ✅    | 等待确认，需要响应 |
| stalled       | ✅    | 可能卡住，需要检查 |

### 防骚扰

- 每个 Agent 5 秒冷却期
- 队列化，不丢失
- 未来：支持用户自定义规则

---

## 跨平台兼容

| 特性     | macOS          | Windows              | Linux      |
| -------- | -------------- | -------------------- | ---------- |
| 透明窗口 | ✓ 原生         | ✓ 原生               | 需要合成器 |
| 始终置顶 | NSWindow level | SetWindowPos         | EWMH       |
| 进程检测 | ps             | tasklist             | ps         |
| 文件监听 | fsevents       | ReadDirectoryChanges | inotify    |
| 通知     | Tauri 原生     | Tauri 原生           | libnotify  |

---

## 技术决策记录

### 为什么不用 Electron？

太重。Tauri 二进制 ~5MB，Electron ~150MB+。这是一个"看灯"的应用，不需要浏览器引擎。

### 为什么用 WebSocket 而不是 Tauri IPC？

Runtime 是独立的 Node.js 进程，Overlay 是 Tauri 应用。两者是不同进程，WebSocket 是最自然的跨进程通信方式。

### 为什么 3 个灯不扩展？

人类天然理解红绿灯。3 个灯的学习成本为零。更多灯反而增加认知负担。

### 为什么 completed 不熄灭？

用户可能离开电脑。回来时必须一眼看到"任务完成了"。如果熄灭了，用户不知道该不该去看结果。

### 为什么统一为单一状态源？

之前双路径（Hook 直接调 StateMachine + JSONL 通过 Adapter）导致状态互相覆盖。统一为 Adapter → StateMachine 后，所有状态变更都有统一的入口，便于实现平滑、保护等机制。
