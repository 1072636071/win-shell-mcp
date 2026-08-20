# ADR-003: 同包多入口而非 monorepo

- 状态：已接受（2026-08-20）
- 关联：memorial 002 D4

## 背景

win-shell-mcp 为 0.1.0 早期单包项目（tsup + vitest + 单 exports）。双栖后需同时交付：MCP server 入口、Cordis 插件入口、可复用核心库导出。

dsh loader 经 `createRequire` + Node 标准 require 解析插件条目（`vendor/loader/src/internal.ts:108-109`），npm 子路径（`win-shell-mcp/plugin`）可行。

## 决策

保持单 npm 包：tsup 三入口（index.ts / plugin.ts / core.ts），exports 暴露 `./core` / `./plugin` 子路径；`@deepseek-ai/dsh-tools` 声明为 optional peerDependency（MCP 用户安装不受影响）；`@deepseek-ai/cordis` 仅 devDependency（type-only import）。

## 被否决的替代

- **仓库内 monorepo（packages/{core,mcp-server,plugin}）**：依赖/发布隔离更干净，但需拆包重构、CI 调整；当前依赖冲突风险低（dsh-tools 经 optional peer 隔离）。否决理由：成本高于当前收益；演进路径保留——依赖冲突实际出现时可随时拆。
- **core 独立仓库独立包**：多仓版本同步负担，收益（第三方复用 core）当前无需求方。

## 后果

- 单一 npm 包同时携带 MCP 与 dsh 两面依赖元数据；MCP 用户不装 dsh 依赖（optional peer）。
- 未来若 dsh-tools 与 MCP SDK 出现版本/构建冲突，需演进为 monorepo。