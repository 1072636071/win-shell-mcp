# CONTEXT.md

> 单一上下文。架构决策见 `docs/adr/`，决策过程见 `docs/memorial/`。ADR 编号保持历史重号（两组 0001/0002 并存），新 ADR 从 0013 起编（memorial 001 D4）。

## 项目

win-shell-mcp —— AI 原生的跨平台命令抽象层。用 Node.js 实现一组确定性命令，统一 JSON 输出，自动抹平 Windows 路径/编码/引号差异，以 MCP Server 形态供 AI Agent 调用，替代 AI 直接编写 Windows shell 命令。定位为可发布开源产品（npm 包）。

## 现状基线（2026-08-25）

- **已实现**：MCP stdio 单入口；15 个命令域、58 个工具；统一输出契约；JX 模式（dsh preset，权威模板见 `docs/dsh/`）。
- **已决策未实施**：dsh 插件双入口交付（ADR-0010/0011/0012）；破坏性操作保护（ADR-0008/0009，PRD ready-for-agent）；**PTC/Code Mode 适配（ADR-0014，memorial 006）——适配壳定位、MCP 标准注解作并发分类单一事实源、outputSchema 纳入首版**；**batch_run 批量编排（ADR-0015，memorial 007）——单 meta 工具内串行执行 + 断言 + 步骤间引用，一轮解决问题**。

## 术语表

| 术语 | 定义 |
| --- | --- |
| 命令抽象层 | 项目核心概念：一组跨平台的确定性命令，抹平 Win/Linux/macOS 差异，AI 调用它们而非直接写 shell 命令 |
| 命令域（domain） | 按语义独立划分的命令分组；成域闸门 = 语义独立、逐域论证，不设规模门槛、拒绝 util 杂项域（ADR-0006）。共 15 域：system / fs / text / search / process / shell_exec / env / net / pkg / git / core / run_command / archive / hash / json |
| 工具（tool） | 命令的注册单元，MCP 语境下的原子调用单元。项目文档中「命令」与「工具」同义 |
| 正名 / 别名（aliases） | 工具的唯一名与短名/同义名；别名调用与正名返回一致结果（如 `ls`→fs_list）。惯例为域前缀正名；既有例外 `find`/`cat`/`ping` 以裸名为正名、域前缀名为别名 |
| 工具注册表（registry） | 所有工具的唯一注册点，声明式注册正名/别名/schema/handler，server 启动时装载，不硬编码工具清单 |
| 输出契约（output contract） | 统一返回格式：成功 `{ok:true, ...data}`（data 展开到顶层），失败 `{ok:false, error:{code,message}}`；标准错误码见 contract/errors |
| 极简输出 | 设计原则：默认只返回 AI 决策所需最小字段，长内容截断（默认 2000 字符）；`verbose` 参数获取完整数据（ADR-0003） |
| 兜底通道（escape hatch） | 抽象命令未覆盖时的原生命令执行通道，共两条：`shell_exec`（经 shell 解释器执行命令字符串）与 `run_command`（argv 数组直执行、不经 shell 解析）；保护机制语境下二者合称黑盒工具 |
| 破坏性操作保护【未实施】 | 回收站型保护：删/覆盖类操作前先备份原数据、可自助还原；默认关闭，`WIN_SHELL_PROTECT=1` 开启；备份失败即中止并返回语义化错误（ADR-0008/0009） |
| 回收站批次【未实施】 | `<日志根>/backup/<操作ID>/`：被破坏目标的完整拷贝 + meta.json（原路径/工具/参数/时间/操作 ID）；还原通道为 `fs_restore`（按操作 ID 整批还原）与 `fs_trash_list`（列批次） |
| 低价值名单【未实施】 | 内置 + `WIN_SHELL_LOWVALUE_LIST` 追加的路径名单（node_modules/.git/dist/build/.cache 等，任意层级匹配），命中则直接真删不备份；与大小阈值 `WIN_SHELL_BACKUP_MAX_BYTES`（成本语义）正交，命中任一即跳过备份（ADR-0009） |
| 审计日志流【未实施】 | `<日志根>/logs/operations.jsonl`：每个破坏性操作一行的结构化审计记录（时间/工具/参数/操作 ID/备份路径/结果），与批次 meta.json 互补；只记破坏性信号 |
| deepseek-harness（dsh） | DeepSeek 的 Cordis 插件框架式 agent harness；win-shell-mcp 的第二交付入口（ADR-0010） |
| Cordis 插件 | dsh 的插件形态（name/inject/Config/apply 约定）；win-shell-mcp 经 `defineTool()` 把全部工具注册进 dsh 的 `ctx.tools` 服务 |
| 双入口交付【未实施】 | 核心库 + MCP server 薄壳 + dsh 插件薄壳的架构：同包多入口 exports（`./core` / `./mcp` / `./plugin`）、插件名 `tool-win-shell`、全量注册不裁剪、不接 dsh 审批/沙箱/后台、输出保持统一契约（ADR-0010/0011/0012） |
| 适配壳【未实施】 | dsh 专用模式深度 = 薄壳 + 能力元数据（isConcurrencySafe/outputSchema/annotations），不接 approval/jobs/渲染；首版即含 outputSchema 与并发标注（memorial 006 / ADR-0014） |
| 单一事实源 | 标注体系设计模式：MCP 标准 ToolAnnotations（readOnlyHint/destructiveHint/idempotentHint）同时服务 MCP 面与 dsh 插件面，插件派生 `readOnlyHint===true ⇒ isConcurrencySafe`（memorial 006 / ADR-0014） |
| 防漂移护栏 | 单测强制每工具显式声明 annotations 与 outputSchema，缺失即测试失败，杜绝静默默认（memorial 006） |
| 规范 JSON 值 | dsh 概念：工具主体返回的、匹配 output schema 的精确结构化值（canonical value），区别于 Native 渲染内容；win-shell-mcp 的 `AnyToolResult.data` 即规范值载体（memorial 006） |
| outputSchema | 每工具声明的成功返回数据结构（zod→JSON Schema），一鱼三吃：MCP structuredContent + dsh defineTool 强制项 + Code Mode SDK 类型推导（memorial 006 / ADR-0014） |
| JX 模式 | dsh 用户级 agent preset（会话工作模式）：标准能力 + 两条规则——工具优先 win-shell-mcp、过程事实沉淀进知识库 MCP（imagetutu/jxk）；权威模板在本仓库 `docs/dsh/`，部署于 `~/.dsh/.agent-presets/jx-mode/` |
| pattern 双模约定 | pattern 类参数统一语义：默认按字面量子串匹配（`.` `\` `*` 等原样），`/…/` 包裹启用正则（flags：i/m/s，replace 另收 g）；判定规则严格、任何歧义一律向字面量收敛；结构似正则但 flags 非法则 EINVAL 报错（ADR-0013） |
| 响错误 / 哑错误 | 误用后果分类：哑错误 = 调用方误用后仍得到看似正常的结果（如正则语义下 `foo.ts` 错配 `foopts`），坏数据带着流程继续跑；响错误 = 失败显式可见（0 命中 / 报错 + hint），调用方一轮内自纠。工具设计目标：把哑错误变响错误（ADR-0013 可观测层的立项原则） |
| 命令执行模块 | 深模块（`src/exec/run.ts`）：统一拥有子进程执行机器（spawn、输出收集、超时、进程树终止、GBK 解码），接口只有 `runCommand`；shell_exec、pkg_run、git 均调用它（见 ADR-0003） |
| batch_run【未实施】 | 批量编排 meta 工具：一次 CallToolRequest 内串行执行一串步骤，每步可附 `assert`（路径+操作符，eq/neq/gt/gte/lt/lte/in/re/truthy/falsy），步骤间以 `{{stepId.output.path}}` 模板引用前序输出（整串单引用保原类型）；任一步失败或断言不满足即短路（ADR-0015 / memorial 007） |

## 已确定的决策

- **安全模型**：无沙箱全权限，与裸 shell 等价（ADR-0002-no-sandbox、ADR-0004-trust-model）。
- **实现原则**：纯 Node 运行时，内部不依赖 cmd/PowerShell 作为执行后端；Windows 特有域后置（ADR-0005）。
- **范围**：全命令域一版上齐、持续扩展、单入口覆盖（ADR-0002-scope-full-coverage）；新域闸门 = 语义独立即可成域、逐域论证（ADR-0006）。
- **输出**：极简、token 最小化，长输出截断 + verbose 开关取全量（ADR-0003）；工具输出倾向主动充分返回判别信息，避免为确认结果再走一轮（memorial 007 原则）。
- **兼容性红线**：0.x 发布前允许破坏性修改并集中纠错；正式发布后只加不改——仅新增可选参数与输出字段，默认行为与既有字段永不变（ADR-0007）。
- **pattern 语义**：全线双模——默认字面量子串匹配、`/…/` 启用正则；严格判定、永远向字面量收敛；结果携带 `patternMode` 与双向 hint；text_replace 永不静默决定替换数量（ADR-0013；2026-08-24 实施批次落地）。
- **交付形态**：现状为 MCP stdio 单入口（streamable HTTP 为未来可选项）；已决策扩展为核心库 + MCP + dsh 插件双入口、同包多入口（ADR-0010 取代 ADR-0001-delivery，ADR-0011 全量注册，ADR-0012 同包多入口；未实施）。
- **破坏性操作保护**：回收站型而非完整 undo 链；默认关闭、全部配置走环境变量（`WIN_SHELL_LOG_DIR` 默认 `D:\log`）；低价值名单与大小阈值两类例外直接真删仅记审计（ADR-0008/0009；未实施）。
- **技术栈**：TypeScript + 官方 `@modelcontextprotocol/sdk` + iconv-lite（编码检测），Node ≥ 18，tsup 打包，vitest 测试。
- **测试原则**：严格测试、尽量覆盖全部场景；覆盖率阈值 lines/functions/statements ≥ 85%，branches ≥ 84%。
