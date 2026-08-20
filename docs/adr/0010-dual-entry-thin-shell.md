# ADR-0010: 双栖架构 = 核心库 + 薄壳双入口（取代 ADR-0001）

- 状态：已接受（2026-08-20）
- 关联：memorial 002 D1 / D3
- 取代：ADR-0001（交付形态仅 MCP Server）

## 背景

win-shell-mcp 已有 58 个确定性工具的完整实现，仅 `src/server.ts` 依赖 MCP SDK。用户诉求：同一套工具既服务 MCP，又直接作为 deepseek-harness（Cordis 插件框架）的插件。

dsh 原生自带 `@deepseek-ai/dsh-mcp-client`，可零代码把 MCP server 工具桥进 dsh——此路径是真实且被否决的替代方案。

## 决策

1. 抽取纯逻辑核心库（现有 src/ 目录即核心库，只改构建不改目录）。
2. MCP server 与 Cordis 插件均为薄壳：插件用 `defineTool()` 逐个注册 58 个工具，handler 原样调核心库。
3. 接入深度为薄壳：不接 `ctx.approval` / `ctx.jobs` / `ctx.sandboxPolicy` / 渲染卡片；输出保持 win-shell-mcp 统一 `{ok, data}` JSON 契约，仅做 `{content, isError}` 包装。

## 被否决的替代

- **dsh mcp-client 零代码接入**：进程隔离开销；工具 schema 经 MCP 翻译有损；无法享受 dsh 工具生态（渲染/作业语义）；双进程复杂度。否决理由：不符合"win-shell-mcp 是产品"的长期定位。
- **深度集成**（接 approval/jobs/sandboxPolicy/渲染）：工作量显著增加；用户明确选择薄壳优先。经查证能力全部可接（`ctx.approval` 等均为可注入服务），唯一硬限制是 OS 级 landlock 沙箱在 executor 层，且仅 Linux——故深度集成是可逆的后续演进路径，非本次范围。
- **渐进（先 mcp-client 验证）**：用户直接选定薄壳双入口。

## 后果

- 模型在 dsh 中看到统一 JSON 输出，与 dsh 原生工具（bash 纯文本）风格不同——需在 system prompt 层说明。
- 薄壳下危险工具（fs_write/process_kill 等）不经审批，安全性依赖 dsh 部署层的整体防护；后续可按需分批升级。