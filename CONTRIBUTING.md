# 贡献指南

感谢你关注 AI Agents Leader。

在提交 Issue 或 Pull Request 之前，请先快速阅读本文件。这样可以减少来回沟通，提高问题定位和合并效率。

## 提交 Issue

适合提交 Issue 的情况：

- 功能存在明确 bug
- 文档与实际行为不一致
- 某个平台或某个 agent 的适配失效
- 命令、启动流程、窗口行为出现回归
- 对现有设计有明确、可执行的改进建议

提交前请尽量先确认：

- 使用的是最新主干代码
- 问题可以稳定复现，或至少能描述出现条件
- 没有重复的已有 Issue

建议在 Issue 中包含这些信息：

- 使用环境：macOS / Windows / Linux
- Node.js、pnpm、Rust 版本
- 启动命令
- 实际表现
- 预期表现
- 复现步骤
- 终端报错、日志、截图或录屏
- 相关 agent 类型，例如 Claude Code、Cursor、Codex

Issue 标题建议直接描述问题，不要只写“有 bug”“跑不起来”。

示例：

- macOS 下桌面浮窗折叠后高度无法回缩
- Claude Code hooks 已安装，但 waiting_input 状态未触发
- pnpm start 在端口被占用时未正确清理残留进程

## 提交 Pull Request

欢迎提交 PR，但请保持范围清晰、可验证、可回滚。

提交前请遵循这些原则：

- 一次 PR 只解决一个主要问题
- 优先修根因，不做表面补丁
- 不顺手重构与当前问题无关的模块
- 改行为时同步补文档
- 改结构时同步更新 AGENTS.md

## PR 准备清单

提交 PR 前，请尽量完成以下检查：

- 本地代码可运行
- 改动范围相关的类型检查通过
- 改动范围相关的构建或校验通过
- 变更说明写清楚了“为什么改”和“改了什么”
- 必要时附上截图、录屏或日志

如果改动涉及运行逻辑，至少说明：

- 旧行为是什么
- 新行为是什么
- 如何验证
- 是否影响桌面端、Web 端、runtime 或 adapter

## 推荐提交流程

1. 先开 Issue 讨论较大的设计改动。
2. 从最新主干拉分支。
3. 完成最小必要改动。
4. 运行相关验证命令。
5. 更新 README、docs 或 AGENTS.md（如果需要）。
6. 提交 PR，并在描述里关联 Issue。

## 建议使用的验证命令

```bash
pnpm --filter @aal/overlay --filter @aal/ui --filter @aal/shared exec tsc --noEmit
pnpm build
pnpm check
cargo check --manifest-path apps/overlay/src-tauri/Cargo.toml
```

如果你的改动只涉及文档，请说明未运行代码验证即可。

## 文档同步要求

以下变更通常需要同步文档：

- 命令变更
- 项目结构变更
- 状态定义变更
- 端口与启动逻辑变更
- 新增适配器、主题或集成方式

优先检查这些文件：

- README.md
- AGENTS.md
- docs/development.md
- docs/usage.md
- docs/design.md

## 不建议的 PR 形态

以下类型的 PR 通常会被要求先拆分或先讨论：

- 同时混入 bugfix、重构、样式和文档的大杂烩改动
- 没有复现步骤或验证说明的行为修改
- 大量格式化无关文件
- 擅自改变产品方向或核心状态语义

## 沟通方式

如果你不确定某个改动是否适合直接提 PR，先提 Issue 说明：

- 想解决什么问题
- 计划如何实现
- 是否会影响现有命令、状态或 UI 语义

这样更容易提前对齐方向，避免返工。
