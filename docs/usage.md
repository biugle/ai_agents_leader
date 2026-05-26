# 使用文档

## AI Agents Leader — 用户指南

**一句话：看灯就知道 AI 是否还活着。**

---

## 产品是什么

AI Agents Leader 是一个本地运行的 AI 状态指示系统，用红绿灯的方式实时显示多个 AI Agent 的工作状态。

**它不是：** AI IDE、Dashboard、聊天客户端、Workflow 系统

**它是：** 一个像系统状态指示灯一样的 Overlay UI，默认以 Web Overlay 运行，也支持 Tauri 桌面浮窗

---

## 信号灯含义

每个 AI Agent 有 3 个灯，通过颜色和动画告诉你它的状态：

### 🟡🟣 黄紫交替 — 思考中

- **动画：** 黄紫三灯交替流动
- **含义：** AI 正在思考、分析、规划
- **你需要做：** 什么都不用做，等就行

### 🔵🟣🔵 蓝紫青 — 执行中

- **动画：** 蓝紫青三灯交替流动
- **含义：** AI 正在干活（编辑文件、执行命令、调用工具）
- **你需要做：** 什么都不用做，等就行

### 🟡 黄灯低闪 — 等待确认

- **动画：** 黄色低频闪烁
- **含义：** AI 想执行某个命令，需要你确认
- **你需要做：** 去 AI 工具里点确认

### 🟢 绿灯 — 已完成

- **动画：** 快速闪烁 3 次后常亮
- **含义：** 任务完成了
- **你需要做：** 去看看结果

### 🔴 红灯 — 出错了

- **动画：** 红色高频闪烁
- **含义：** 出错 / 中断
- **你需要做：** **立即关注**

### 🟡 黄灯快闪 — 可能卡住

- **动画：** 黄色高频闪烁
- **含义：** 长时间没有活动（>120s），可能卡住了
- **你需要做：** 检查一下 AI 工具

### ⚫ 灰灯 — 空闲

- **动画：** 微弱呼吸
- **含义：** Agent 空闲，没有任务
- **你需要做：** 无

---

## 界面说明

### Signal Pod

```text
╭────────────────────╮
│ ▾ Claude · admin   │   ← 点击展开/收起详情
│                    │
│   ● ● ●        ✦   │   ← 3 个信号灯 + Nudge 按钮
│                    │
╰────────────────────╯
```

- **点击标题区域：** 展开/收起详细信息
- **展开后显示：** Status、Dir（工作目录）、Time（运行时间 / 最后活动时间）
- **点击 ✦：** 发送 Nudge（唤醒/关注信号），有缩放+颜色闪烁反馈

### 窗口控制（桌面模式）

容器顶部有控制按钮：

- `–` 最小化
- `▲` 置顶 / `▼` 置底（切换，蓝色表示当前置顶）
- `✕` 关闭

整个容器区域可拖动移动窗口。

### 聚合模式

```text
╭────────────────────╮
│ – ▲ ✕              │   ← 窗口控制按钮
│ ▾ Claude · admin   │
│   ● ● ●        ✦   │
╰────────────────────╯
╭────────────────────╮
│ ▾ Cursor · web     │
│   ● ● ●        ✦   │
╰────────────────────╯
```

所有 Agent 在同一个窗口中垂直排列，自动滚动。

---

## 启动方式

### 一键启动（推荐）

```bash
pnpm dev
```

仓库内推荐直接使用根命令。发布场景下也可以使用 CLI 入口：

```bash
npx ai-agents-leader

# 或全局安装后
npm install -g ai-agents-leader
aal
```

发布安装场景只要求 Node.js。若使用 `aal start` 桌面模式，还需要安装 Rust / Cargo；不需要 pnpm，也不需要保留仓库源码。

发布态下，`aal check` 会检查本机是否具备桌面模式前提。首次执行 `aal start` 时，CLI 会把桌面模板复制到 `~/.ai-agents-leader/desktop/<version>/overlay`，在该目录执行本地 Tauri release 构建，并缓存生成的可执行文件；之后再次启动会直接复用缓存。

自动完成：

1. 清理残留进程
2. 启动 Runtime + WebSocket + HTTP API
3. 自动检测所有运行中的 AI Agent
4. 安装 Claude Code Hooks 插件
5. 启动 Overlay UI（Web 用 `pnpm dev` / `aal dev`，桌面 UI 用 `pnpm start` / `aal start`）
6. 定期扫描：自动发现新 Agent、自动注销已退出的 Agent

### 命令选项

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

### 仓库开发命令

```bash
pnpm dev           # Web 模式（真实本地 agent）
pnpm dev:mock      # Web Mock 模式
pnpm start         # 桌面 UI 模式（真实本地 agent）
pnpm start:mock    # 桌面 Mock 模式
pnpm runtime       # 仅启动 Runtime
pnpm runtime:mock  # 仅启动 Mock Runtime
pnpm clean         # 清理残留进程
pnpm check         # 检查启动环境
pnpm fixit         # 自动修复常见启动问题
pnpm clean:node    # 清理所有 node_modules
pnpm build         # 构建
pnpm lint          # Lint
```

### 桌面应用（需要 Rust 环境）

```bash
pnpm start
```

会启动一个透明、无边框、始终置顶的桌面浮窗。仓库内 `pnpm start` 直接使用源码工程；发布安装后的 `aal start` 会走用户目录缓存构建。首次编译约 2-3 分钟。

如果未安装 Rust，`aal check` 会给出安装指引：

- macOS/Linux: `curl --proto='=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- Windows: 下载安装 <https://rustup.rs/>

---

## 窗口行为

- **始终置顶：** 窗口不会被其他应用遮挡（可切换）
- **透明背景：** 只看到信号荚，没有窗口背景
- **无边框：** 没有标题栏
- **可拖动：** 点击容器空白区域拖到屏幕任意位置
- **单实例：** 重复启动会自动关闭旧窗口

---

## 支持的 AI Agent

| Agent           | 检测方式                | 多会话 |
| --------------- | ----------------------- | ------ |
| ClaudeCode      | Hooks 插件 + JSONL 文件 | ✅      |
| Cursor          | 进程检测 + 文件监听     | ❌      |
| CodeX           | 进程检测 + 会话文件     | ❌      |
| OpenCode        | 进程检测 + 配置文件     | ❌      |
| Cline           | VS Code 进程 + 扩展状态 | ❌      |
| RooCode         | VS Code 进程 + 扩展状态 | ❌      |
| 自定义 / 第三方 | HTTP API 推送           | ✅      |

### Claude Code Hooks 插件

首次启动时自动安装到 `~/.claude/plugins/ai-agents-leader/`。

插件会在以下时机推送状态：

- 用户提交 prompt → 黄紫交替（thinking）
- Claude 请求执行命令 → 黄灯闪烁（waiting_input）
- 命令执行中 → 蓝紫青流动（running）
- Claude 完成回复 → 绿灯常亮（completed）

**需要重启 Claude Code 才能激活插件。**

### 第三方 Agent 接入

任何支持 HTTP 的 agent 都能接入，只需发送 POST 请求：

```bash
curl -X POST http://127.0.0.1:9989/api/state \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "my-agent",
    "agentName": "My Agent",
    "status": "running"
  }'
```

可用状态：`idle`、`thinking`、`running`、`completed`、`error`、`waiting_input`、`stalled`

---

## 通知规则

只在以下情况弹通知（不会频繁打扰你）：

1. ✅ 任务完成
2. ❌ 出错
3. ⏳ 等你确认
4. ⚠️ 可能卡住

**不会通知的情况：** 思考中、执行中（这些是正常工作状态）

---

## 主题

支持多种视觉主题：

| 主题      | 风格                    |
| --------- | ----------------------- |
| Default   | 磨砂黑底，经典 LED 灯效 |
| Cyberpunk | 赛博朋克霓虹风格        |

主题切换方式：通过 API 或配置文件（UI 切换待实现）

---

## 端口

| 服务       | 端口 |
| ---------- | ---- |
| WebSocket  | 9988 |
| HTTP API   | 9989 |
| Overlay UI | 1666 |

端口冲突时自动清理残留进程。

---

## FAQ

**Q: 灯一直灰色是什么意思？**
A: 没有检测到运行中的 AI Agent。确认你的 AI 工具正在运行。运行 `aal check` 检查状态。

**Q: 红灯一直在闪怎么办？**
A: 立即查看你的 AI 工具，可能是出错了或在等你确认操作。

**Q: 如何添加自己的 AI Agent？**
A: 使用 HTTP API 推送状态（见上方"第三方 Agent 接入"）。

**Q: 窗口被其他窗口挡住了？**
A: 点击 `▲` 按钮重新置顶。窗口默认始终置顶。

**Q: 如何清理残留进程？**
A: 运行 `aal clean`。

**Q: Tauri 桌面模式打不开？**
A: 需要安装 Rust 环境。运行 `aal check` 查看状态和安装指引。
