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
| archive 域 | 归档命令域：tar/zip 打包与解包（archive_create / archive_extract），见 ADR-0006 |
| hash 域 | 文件哈希命令域：sha256/md5 等摘要计算（hash_file），见 ADR-0006 |
| json 域 | JSON 处理命令域：按路径取结构化数据中的值（json_get，jq-lite），见 ADR-0006 |
| 破坏性操作保护 | 回收站型保护机制：破坏操作（删/覆盖/移动等）前先备份原数据到 `backup/<操作ID>/`，可经 `fs_restore` 还原，默认关闭（`WIN_SHELL_PROTECT=1` 开启），见 ADR-0008 |
| 低价值名单 | 内置 + 环境变量追加的路径名单（node_modules/.git/dist/build/.cache 等），命中名单的破坏操作直接真删不备份，见 ADR-0009 |
| 审计日志流 | `logs/operations.jsonl`：每个破坏性操作一行的结构化审计记录（时间/工具/参数/操作 ID/备份路径/结果），与批次 meta.json 互补 |
| deepseek-harness（dsh） | DeepSeek 的 Cordis 插件框架式 agent harness；win-shell-mcp 的第二交付入口（见 ADR-0010） |
| Cordis 插件 | dsh 的插件形态：`export name/inject/Config/apply`，经 ctx 服务（如 `ctx.tools`）协作 |
| ctx.tools / defineTool | dsh 工具注册服务与注册 API（`@deepseek-ai/dsh-tools`），工具以 Cordis 插件注册 |
| 薄壳双入口 | 架构：核心库（现有 src/ 纯逻辑）+ MCP server 薄壳 + dsh 插件薄壳，只改构建不改目录（见 ADR-0010） |
| 同包多入口 | 单 npm 包经 tsup 多 entry + exports 子路径（`./core` / `./plugin`）切分边界（见 ADR-0012） |
| tool-win-shell | win-shell-mcp 的 Cordis 插件名，dsh 侧 `require: "win-shell-mcp/plugin"` 加载 |
| dsh mcp-client | dsh 原生 MCP 客户端桥（stdio/streamable-http），零代码接入替代方案，被否决（见 ADR-0010） |

## 已确定的决策

- **定位**：可发布开源产品（npm 包 + MCP Server），面向所有 AI 客户端。
- **交付形态**：MCP Server + dsh 插件双入口（2026-08-20 取代 ADR-0001，见 `docs/adr/0010-dual-entry-thin-shell.md`）：核心库 + 薄壳双入口，命令以 MCP tool 暴露，同时以 Cordis 插件（`tool-win-shell`）注册 58 工具到 dsh `ctx.tools`。同包多入口（`./core` / `./mcp` / `./plugin`，见 `docs/adr/0012-single-package-multi-entry.md`），插件薄壳不接 dsh 审批/沙箱/后台，输出保持统一 `{ok, data}` JSON 契约（见 `docs/adr/0011-full-tool-registration.md`）。
- **技术栈**：TypeScript + 官方 `@modelcontextprotocol/sdk`，Node ≥ 18，tsup 打包。
- **传输层**：stdio（本地 AI 客户端标准方式）；streamable HTTP 作为未来可选项，不在 MVP。
- **命令域范围**：全命令域一版上齐——`fs`（读写）+ `text` + `search` + `net` + `process` + `system` + `pkg` + `git`，对应"尽量覆盖全部场景"的要求。
- **安全模型**：无沙箱全权限，与裸 shell 等价（见 `docs/adr/0002-no-sandbox-full-permissions.md`）。
- **输出契约**：极简 + `verbose` 开关——默认只返回 AI 决策所需的最小字段，长内容截断；需要完整数据时开启 verbose。
- **测试原则**：严格测试、尽量覆盖全部场景。
- 覆盖率阈值：lines/functions/statements ≥ 85%，branches ≥ 84%（跨平台工具含平台专属分支，单平台无法全覆盖）
- **输出原则**：极简、token 高效。
- **命令域扩展（2026-08-19，memorial 001）**：新增 archive / hash / json 三个命令域；新域闸门为「语义独立即可成域、逐域论证」，不设规模门槛（见 `docs/adr/0006-new-domains-archive-hash-json.md`）。本批新增 12 个命令（net_download、archive_create/extract、git_checkout/push/pull/clone/stash、hash_file、fs_du、net_listen、json_get）与 13 项现有命令拓展（含 text_replace 编码保持、text_diff 真 diff 两项正确性修复），完整清单见 `docs/memorial/001-command-coverage-extension/context.md` D8。
- **兼容性红线（见 `docs/adr/0007-compatibility-redline.md`）**：发布前（0.x）允许破坏性修改，借此窗口集中修正不合理设计；正式发布后只加不改——仅新增可选参数与输出字段，默认行为与既有字段永不变。
- **破坏性操作保护（2026-08-20，memorial 002）**：回收站型保护——默认关闭，`WIN_SHELL_PROTECT=1` 开启；破坏前备份原数据到 `<日志根>/backup/<操作ID>/`，`fs_restore`/`fs_trash_list` 自助还原；`logs/operations.jsonl` 审计流只记破坏性操作；两类例外直接真删不备份——低价值名单（`WIN_SHELL_LOWVALUE_LIST` 追加）与大小阈值（`WIN_SHELL_BACKUP_MAX_BYTES` 默认 1GB）；备份失败即中止，返回 AI 可理解的语义化错误（见 `docs/adr/0008-trash-based-protection.md`、`docs/adr/0009-exceptions-and-config.md`）。
