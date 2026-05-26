# 开发文档

## 环境要求

| 工具            | 版本       | 用途                                  |
| --------------- | ---------- | ------------------------------------- |
| Node.js         | >= 18      | Runtime 运行时                        |
| pnpm            | >= 9       | 包管理                                |
| Rust            | latest     | Tauri 编译（仅 Overlay 桌面应用需要） |
| Xcode CLI Tools | macOS only | Tauri 编译                            |

---

## 快速开始

```bash
# 1. 克隆项目
git clone <repo-url>
cd AI_Agents_Leader

# 2. 安装依赖
pnpm install

# 3. Web 模式启动（推荐）
pnpm dev
```

自动完成：启动 Runtime → 检测 AI Agent → 安装 Hooks → 启动 Web Overlay

浏览器打开 `http://localhost:1666` 即可看到 Signal Pod UI。

说明：仓库内开发当前稳定入口是 `pnpm dev`（Web）和 `pnpm start`（桌面 UI）。`aal` 命令主要对应发布后的 CLI 入口。

### 开发模式

```bash
# Web 模式（真实本地 agent）
pnpm dev

# Web Mock 模式
pnpm dev:mock

# 桌面 UI 模式
pnpm start

# 桌面 Mock 模式
pnpm start:mock

# 仅启动 Runtime（给 Tauri / 排障使用）
pnpm runtime

# 仅启动 Mock Runtime
pnpm runtime:mock
```

### 桌面应用模式

```bash
# 需要 Rust 环境
pnpm start
```

首次编译约 2-3 分钟，之后秒开。

---

## 项目架构

### Monorepo 结构

```text
packages/shared    → 共享类型，零依赖
packages/core      → Runtime Daemon，依赖 shared
packages/adapters  → 适配器，依赖 shared
packages/sdk       → 公共 SDK，依赖 shared
packages/themes    → 主题定义，零运行时依赖
packages/ui        → React 组件，依赖 shared + themes + @tauri-apps/api

apps/overlay       → Tauri 应用，依赖 shared + ui + themes
```

依赖方向：`shared` ← `adapters` / `core` / `ui` / `themes` ← `overlay`

### 数据流

```text
Adapter → EventBus → StateMachine → RuntimeStore
                ↓
           WsServer → WebSocket → Overlay React App
                ↓
       NotificationEngine → 系统通知
```

### 状态更新路径（单一源）

```text
Hook → HttpApi → Adapter.reportHookState() → emit() → StateMachine
JSONL → Adapter.onSessionActivity() → emit() → StateMachine
```

---

## CLI 工具 (`aal` 命令)

入口文件：`packages/core/bin/aal.mjs`

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

实现要点：

- `bin/aal.mjs` 会判断当前是否处于仓库源码环境；源码环境走 `packages/core/src/cli.ts`，发布安装走 `bundle/runtime/core/cli.js`
- `cli.ts` 负责：端口清理、进程清理、Agent 发现、Hooks 安装、Overlay 启动，以及发布态桌面模板准备与缓存启动
- 源码态 Overlay 仍通过 `pnpm --dir apps/overlay ...` 启动；发布态 `aal start` 会把 `bundle/overlay-template` 复制到 `~/.ai-agents-leader/desktop/<version>/overlay`，再调用本机 `@tauri-apps/cli` 执行本地构建
- `pnpm runtime` / `aal runtime` 只启动 runtime，不拉起 UI，给 Tauri 自启动和排障使用
- `--mock` 仅在显式 mock 命令下启用；默认路径不再自动注入 demo 数据
- 发布包不依赖 pnpm；桌面模式依赖本机 Rust / Cargo 和 `@tauri-apps/cli`

### 发布态启动链路

```text
npm install -g ai-agents-leader
  ↓
aal start
  ↓
packages/core/bin/aal.mjs
  ↓
bundle/runtime/core/cli.js
  ↓
准备 ~/.ai-agents-leader/desktop/<version>/overlay
  ↓
首次执行 tauri build，后续复用 target/release 缓存
  ↓
启动桌面浮窗 + runtime
```

---

## 端口管理

| 服务       | 端口 |
| ---------- | ---- |
| WebSocket  | 9988 |
| HTTP API   | 9989 |
| Overlay UI | 1666 |

- 端口冲突时自动清理残留进程（`killPortOccupants`）
- Overlay 扫描 [9988, 9989, 9990, 9991, 9992] 自动发现 Runtime
- 端口写入 `~/.ai-agents-leader/port`

---

## 开发流程

### 新增适配器

1. 在 `packages/adapters/src/` 下创建新目录
2. 继承 `BaseAdapter`
3. 实现 `start()`、`stop()`、状态检测逻辑
4. 在 `packages/adapters/src/index.ts` 导出
5. 在 `packages/core/src/cli.ts` 的 `discoverAgents()` / `startPolling()` 中接入发现与生命周期逻辑

```typescript
// packages/adapters/src/ollama/index.ts
import { BaseAdapter } from '../BaseAdapter.js';

export class OllamaAdapter extends BaseAdapter {
  readonly id = 'ollama';
  readonly name = 'ollama';
  readonly displayName = 'Ollama';
  readonly icon = '🦙';

  async start(): Promise<void> {
    await super.start();
    // 实现检测逻辑
  }
}
```

### 新增主题

1. 在 `packages/themes/src/` 创建新文件
2. 实现 `Theme` 接口
3. 在 `packages/themes/src/index.ts` 注册

### 新增 UI 组件

1. 在 `packages/ui/src/` 创建组件
2. 使用 CSS 变量（`--aal-*`）确保主题兼容
3. 使用 Framer Motion 实现动画
4. 在 `packages/ui/src/index.ts` 导出

---

## Tauri 开发要点

### 配置文件

- `apps/overlay/src-tauri/tauri.conf.json` — 窗口配置
- `apps/overlay/src-tauri/capabilities/default.json` — 权限配置
- `apps/overlay/src-tauri/Cargo.toml` — Rust 依赖

### 关键配置

```json
{
  "app": {
    "windows": [{
      "transparent": true,
      "decorations": false,
      "alwaysOnTop": true,
      "skipTaskbar": true
    }],
    "macOSPrivateApi": true
  }
}
```

注意：`macOSPrivateApi` 大小写敏感（大写 S）。

### 拖拽实现

- FloatingGroup: `data-tauri-drag-region="deep"`（整个子树可拖）
- 按钮: `data-tauri-drag-region="false"`（排除拖拽）
- 不使用 CSS `-webkit-app-region`（与 Tauri 冲突）

### 单实例

使用 `tauri-plugin-single-instance`，新实例启动时旧实例自动退出。

### 自动启动 Runtime

`ensure_runtime` Rust 命令在 Tauri setup 阶段执行：

1. 检查端口 9989 是否被占用
2. 未占用则启动 runtime-only 模式
3. 通知前端 runtime 就绪

---

## 调试技巧

### Runtime 调试

```bash
# 查看 runtime 日志
pnpm dev:runtime 2>&1 | pino-pretty

# 手动测试 WS 连接
node -e "
const ws = new (require('ws'))('ws://localhost:9988');
ws.on('open', () => ws.send(JSON.stringify({ type: 'request:state' })));
ws.on('message', (d) => console.log(JSON.parse(d.toString())));
setTimeout(() => process.exit(0), 2000);
"
```

### Overlay 调试

- 浏览器 DevTools 查看 WebSocket 消息
- React DevTools 查看组件状态
- Zustand DevTools 查看 store 状态
- Tauri DevTools: 右键 → Inspect Element

---

## 测试

### 手动测试清单

- [ ] Runtime 启动，WS 端口自动发现
- [ ] Mock Adapter 状态循环正常
- [ ] Overlay 显示 Signal Pod
- [ ] 信号灯动画正确（黄紫流动、蓝紫青流动、绿闪、红爆闪、黄闪）
- [ ] 展开/收起 Pod 详情（点击标题区域）
- [ ] 详情区显示 Status、Dir、Time
- [ ] Time 实时计时（运行中每秒更新）
- [ ] Nudge 按钮点击有反馈动画
- [ ] 窗口控制按钮（最小化、置顶/置底、关闭）
- [ ] 容器区域可拖动
- [ ] 主题切换
- [ ] 断线自动重连
- [ ] 残留进程自动清理
- [ ] 已关闭会话自动注销
- [ ] 单实例限制（启动新实例关闭旧实例）
- [ ] Tauri 自动启动 runtime

---

## 构建与发布

```bash
# 构建所有包
pnpm -r run build

# 构建源码态 Tauri 桌面应用
pnpm --dir apps/overlay exec tauri build

# 生成 npm 发布态 bundle
node ./scripts/build-release-assets.mjs

# 发布 npm 包
pnpm -r publish
```

说明：源码态桌面构建直接使用 `apps/overlay`。发布态不直接提交预编译桌面二进制，而是在 npm 包安装后，由 `aal start` 把 `bundle/overlay-template` 复制到 `~/.ai-agents-leader/desktop/<version>/overlay` 再执行本地构建。

---

## 常见问题

**Q: 端口被占用怎么办？**
A: 运行 `pnpm clean` 或 `aal clean` 自动清理。

**Q: 想彻底删掉所有 node_modules 再装一次？**
A: 运行 `pnpm clean:node`，然后手动执行 `pnpm install`。

**Q: 如何只开发 UI 不启动 Runtime？**
A: 直接 `pnpm --filter @aal/overlay run dev`，UI 会显示 "No agents detected" 和断线状态。

**Q: 如何测试真实 Claude Adapter？**
A: 运行 `pnpm dev` 或 `pnpm start`，会自动检测 Claude Code 会话。Hooks 插件首次启动时自动安装，重启 Claude Code 后生效。

**Q: Tauri 编译很慢？**
A: 首次编译约 2-3 分钟（下载 + 编译依赖），之后增量编译很快。

**Q: 没有 Rust 环境怎么办？**
A: 运行 `pnpm check` 或 `aal check` 会检测并给出安装指引。或者只用 Web 模式：`pnpm dev` / `aal dev`。
