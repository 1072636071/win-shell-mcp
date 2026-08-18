# CONTEXT.md

## 项目

win-shell-mcp —— 「AI 原生的跨平台命令抽象层」。用 Node.js 实现一组确定性命令（`ls/cat/grep/curl/ps/find` 等的抽象），统一 JSON 输出、自动处理 Windows 路径/编码/引号差异，以 MCP Server 形态供 AI Agent 调用，替代 AI 直接编写 Windows shell 命令。

## 术语表

| 术语 | 定义 |
| --- | --- |
| 命令抽象层 | 项目核心概念：一组跨平台的确定性命令，抹平 Win/Linux/macOS 差异，AI 调用它们而非直接写 shell 命令 |
| 命令（command） | 抽象层提供的命令动词，如 `fs_read`、`text_grep`。名称稳定、参数简单、AI 友好 |
| 工具（tool） | MCP 语境下的原子调用单元，AI 通过它执行一个命令 |
| 输出契约（output contract） | 命令的标准化返回格式（JSON），含成功/失败、结果数据、错误信息 |
| 极简输出 | 设计原则：返回内容尽可能简短、只含 AI 决策所需的最小信息，降低 token 消耗 |
| 兜底执行（exec fallback） | 当抽象命令无法覆盖某个操作时，保留的原生命令执行通道（全权限，见 ADR-0002） |

## 已确定的决策

- **定位**：可发布开源产品（npm 包 + MCP Server），面向所有 AI 客户端。
- **交付形态**：仅 MCP Server，命令以 MCP tool 暴露，无独立 CLI、不拆分核心库（见 `docs/adr/0001-mcp-server-only-delivery.md`）。
- **技术栈**：TypeScript + 官方 `@modelcontextprotocol/sdk`，Node ≥ 18，tsup 打包。
- **传输层**：stdio（本地 AI 客户端标准方式）；streamable HTTP 作为未来可选项，不在 MVP。
- **命令域范围**：全命令域一版上齐——`fs`（读写）+ `text` + `search` + `net` + `process` + `system` + `pkg` + `git`，对应"尽量覆盖全部场景"的要求。
- **安全模型**：无沙箱全权限，与裸 shell 等价（见 `docs/adr/0002-no-sandbox-full-permissions.md`）。
- **输出契约**：极简 + `verbose` 开关——默认只返回 AI 决策所需的最小字段，长内容截断；需要完整数据时开启 verbose。
- **测试原则**：严格测试、尽量覆盖全部场景。
- 覆盖率阈值：lines/functions/statements ≥ 85%，branches ≥ 84%（跨平台工具含平台专属分支，单平台无法全覆盖）
- **输出原则**：极简、token 高效。
