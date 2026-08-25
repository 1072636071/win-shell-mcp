# Memorial 006 — PTC（Code Mode）与当前 MCP 的关系与取舍

状态：已完成（2026-08-25）

## 诉求

> 用户原话：
>
> 「DSH 有这个能力，好像和当前MCP做的类似。」
>
> 附背景材料：用户提供了对 DSH「PTC 模式」（内部正式名 Code Mode，设计记录 `.agents/notes/implemented/feature/2026-06-15-code-mode.zh.md`）的完整梳理：是什么 / 为什么 / 怎么实现。

### 背景材料要点（用户提供，非本仓库结论）

- PTC = Programmatic Tool Calling；思想源自 Cloudflare Code Mode 博客。
- 三痛点：每步一次模型往返；中间结果污染上下文；无法组合控制流。
- 核心洞察：LLM 写代码强于发工具调用 → 模型针对生成的 SDK 写 TS 程序，沙箱跑完，仅 print/return 回上下文；五次往返序列变一次。
- 四层实现：① 预设层 `preset.yml` 命名 + agent-plane 挂载 tool-presentation `mode: code`；② 注册表层 dsh-tools（`native|code|both` 三态，code 下仅暴露 `run_code` + `jsonSchemaToTs()` 生成的 SDK .d.ts，直接调其他工具判 UNKNOWN_TOOL）；③ 分发桥（程序里 `await tools.xxx()` 带父 token 重入完整工具流水线，有界并发 maxParallelSubCalls 默认 10，按 isConcurrencySafe 区分可重叠/独占）；④ 执行基底 `ctx.codeRuntime`（worker thread，stripTypeScriptTypes，空 env，null-prototype 绑定，computeMs/maxWallMs/maxOutputBytes 三重预算）；信任姿态等同 bash 工具。
- 不强制全走 Code Mode：日常单次调用原生已最优，故三态可配。

### 关联历史 memorial

- **002-win-shell-mcp-dsh-plugin**（已完成，2026-08-20）：核心库双入口——win-shell-mcp 以薄壳 Cordis 插件 `tool-win-shell` 全量注册 58 工具进 dsh，dsh 侧 disable 内置 tool-bash/tool-fs，win-shell-mcp 成为统一命令来源。→ 本话题讨论的 Code Mode SDK 中将出现 win-shell-mcp 的全部工具，「类似」已是结构性事实而非假设。
- 003 / 004：AI 工具误解防护、破坏性误用防护——工具面设计的既有关切。

## 追问记录

**2026-08-25 09:28 Q1 目标界定（待回答）**

- 背景：「好像和当前MCP做的类似」中「类似」可指多层——R1 效果层：win-shell-mcp 的 shell_exec 等本就支持一次调用串多操作（管道/&&/脚本），只回传 stdout，天然具备 PTC 的部分收益（少往返、少污染、可组合）；R2 机制层：win-shell-mcp 作为工具集/注册表与 dsh-tools 呈现机制相似；R3 泛指：两者都「让 AI 执行命令」。
- 提问：这次 grill 要打磨的方案是什么？（① 定位与演进方案【推荐】 ② 仅对比分析 ③ 直奔改造设计 ④ 其他）
- 假设 H1（待确认）：若目标是演进，重点疑点可能是——Code Mode 场景下 win-shell-mcp 工具作为 SDK 成员的适配性（isConcurrencySafe 标注、审批粒度、输出体积），以及 shell_exec 与 run_code 两层组合能力的分工边界。

**2026-08-25 09:38 A1**：选 **① 定位与演进方案**（先对比分析、再决策改造）。「类似」的具体层级用户未说明，留待后续问题自然澄清。

**2026-08-25 09:38 事实调查（自查）— dsh 设计 note + 源码 + 本仓库现状**

来源：`E:\work\sp\deepseek-harness\.agents\notes\implemented\feature\2026-06-15-code-mode.zh.md`；`packages/core/tools/src/index.ts`、`schema.ts`、README.zh.md；本仓库 `package.json` 与 `src/` 清单。

- **F1 层级关系**：win-shell-mcp 是工具提供方（被调用面），Code Mode 是注册表之上的呈现+编排层（调用方）——组合关系而非同类竞争。002 落地后 58 工具即成为 Code Mode SDK 成员（`await tools.shell_exec(...)`）。
- **F2 并发分类现状**：dsh 对未声明 `isConcurrencySafe` 的工具一律按独占处理（fail-closed，`index.ts:1278`）；该分类器同时服务**原生并行分发**（rolling pool）与 **code-mode 子调用重叠池**（maxParallelSubCalls 默认 10）。dsh 自家只读工具（tool-fs read/read_image、tool-web search/fetch、subagent、session-query）均显式标注 `() => true`；仓库内未见 mcp-client 为代理工具补标注 → 当前经 MCP 接入的 58 工具全部独占串行。
- **F3 替代路径**：code-mode worker 可访问 Node API（信任姿态=bash）：纯 JS 可复刻的工具面（json_get/text_head/hash/glob 匹配等）存在「程序内直做」路径；但绕过工具流水线即绕过审批/审计门禁。
- **F4 子调用契约**：绑定参数无损 JSON 快照分发；成功返回规范 JSON 值进程序变量，失败变 `ToolCallError(toolName, message)`——中间结果不回模型上下文。对整包 JSON 的 AnyToolResult 契约友好（大输出不再必然污染上下文）。
- **F5 提示词成本**：`both` 模式下原生 schema 与 SDK .d.ts 双份共存；58 工具全量注册会显著撑大 SDK 段（002 的 `Config.exclude` 可作裁剪手段）。
- **F6 实施状态**：win-shell-mcp 单入口 MCP server（exports 仅 `"."`，无 `./core`/`./plugin`）——**002 双入口决策尚未实施**。

**2026-08-25 09:47 A2（Q2 回应）**：用户未直接三选一，提出期望——「想有 DSH 的专用模式，还有通用 MCP 的模式，可以做到么？」即**双模并存意向**（≈ 方案 1 的强化版 + 明确保留通用 MCP 面）。

**2026-08-25 09:47 可行性判断（自查，回应「可以做到么」）**

来源：002 memorial 决策记录；`packages/core/tools/src/schema.ts:506,562,611`；`tests/execution-mode.spec.ts:124-135`。

- **可行，且架构已有决策背书**：002 D1/D4/D6/D11 = 核心库抽取 + 同包多入口（`./core`/`./mcp`/`./plugin`），58 个 handler 为纯 zod+node 逻辑、仅 server.ts 依赖 MCP SDK——正是为「一份逻辑、两种宿主」设计。
- defineTool 原生支持 `isConcurrencySafe(args)` 选项（schema.ts 直接接线到 ToolDefinition）；且该标注**只存在于宿主侧，永不进入模型可见 schema**（有测试锁定）→ MCP 宿主完全无感，双模互不污染。
- mcp-client 代理路径无法补此标注（仓库内无相关代码）→ **原生插件入口是拿到并发收益的唯一通道**，「专用模式」有不可替代性。
- 当前距离：F6 未实施 + F2 无标注。若插件落地但不加标注，dsh 侧依旧全量独占串行，「专用」名不副实。

**2026-08-25 09:59 A3（Q3 答复）**：选 **① 适配壳 = 002 薄壳 + 能力元数据**。approval/jobs/渲染不进首版，留作 v2 增量候选。

**2026-08-25 09:59 F7 MCP 标准注解可用性（自查）**

来源：`node_modules/@modelcontextprotocol/sdk/dist/cjs/types.d.ts`（pwsh Select-String 验证）。

- 安装的 `@modelcontextprotocol/sdk@1.30.0` 自带 **ToolAnnotations**（含 `readOnlyHint` 等 hint 字段）——MCP 协议标准注解可在核心注册表声明、经 server.ts 原样透传，通用宿主直接受益。
- 工具坑：grep/glob 类工具按 ignore 规则跳过 node_modules，查依赖源码需用 shell 直查。

**2026-08-25 10:06 A4（Q4 答复）**：选 **① MCP 标准 annotations 作单一事实源 + 插件派生**。同时用户授权「其他决策你也自己决策」——D5–D8 由 grill 主导方拍板，供用户复核（002 先例）。

**2026-08-25 10:14 Q5（用户提出，调研已完成）**：「还有当前的工作模式能吸收一下 code-mode 么？我感觉 code mode 的输入输出也很有特色。你可以调研一下。」——评估 **win-shell-mcp 自身工具契约能否吸收 Code Mode 的 I/O 设计**。已开闭环调查工单 `sub-task/001`，后由 captain 亲自接手完成。

**2026-08-25 10:15 调查结果回验（三验通过）**

来源：工单 `sub-task/001-code-mode-io-research.md`（captain 自查完成）。

- 状态「已完成」✓、结论逐题有来源（文件路径/行号/note 名）✓、内容非空非占位 ✓。
- **F8 核心发现**：Code Mode 的 I/O 设计中，**outputSchema 是「一鱼三吃」的最强吸收点**——MCP 面支持 structuredContent、dsh defineTool 强制要求、Code Mode SDK 用它生成 typed returns。win-shell-mcp 当前 `Tool` 接口无 `outputSchema`，差距大。
- **F9 适配方式**：`AnyToolResult {ok, data}` 与 dsh「规范 JSON 值」不冲突——插件层 `execute` 可从包装解包，`output.schema` 描述 `data` 结构。
- **F10 不值得吸收**：失败分类学 6-kind（runtime 级概念）、logs/value 分离（工具级无意义）、外层预算（宿主职责）。
- **可吸收点档位**：A 档（通用 MCP 也受益）= 每工具 outputSchema + MCP annotations；B→A 档 = 输出 schema 从 zod 推导；C 档 = 其余。

**2026-08-25 10:XX A6（Q6 答复）**：选 **① 纳入首版**——outputSchema + annotations 作为 D8 第一阶段的一部分同步实施。outputSchema 是 dsh 插件化的硬性门槛（defineTool 强制要求 output.schema），不做等于第一阶段只验证构建、不验证插件功能。

## 决策汇总

## 决策汇总

- **D1（2026-08-25）本次 grill 目标 = win-shell-mcp 在 PTC/Code Mode 时代的定位与演进方案**：含前半程异同对比分析，产出可落地的演进决策。
- **D2（2026-08-25）定位 = 双模并存（领域积木库）**：同时保持通用 MCP 面与 dsh 原生专用面；载体 = 002 已定的核心库双入口架构（`./mcp` + `./plugin` 共享同一逻辑核心）。
- **D3（2026-08-25）「DSH 专用模式」深度 = 适配壳**：defineTool 注册 + 每工具能力元数据（isConcurrencySafe 分类器、schema 保真）；不接 ctx.approval/jobs/presentCall/presentResult——治理集成留作 v2 增量，首版不修订 002 D3 薄壳边界。
- **D4（2026-08-25，Q4 用户选定）标注体系 = MCP 标准 ToolAnnotations 单一事实源**：核心注册表每工具声明 `readOnlyHint`（适用处加 destructive/idempotent）；MCP 面原样透传；插件派生 `readOnlyHint===true ⇒ isConcurrencySafe(()=>true)`，参数级细分走插件层覆盖表逃生舱。被否决：自定义 concurrency 字段（单宿主词汇、MCP 面零收益）、纯插件层映射表（平行清单漂移）。→ ADR-0014（memorial 内草稿）。
- **D5（2026-08-25，自决）分类规则与边界裁决**：规则1 只读⇒可并发的论证=不共享可变状态+并发 spawn 短命只读子进程竞态无害（写入代码注释）；规则2 必独占族=任意命令执行（shell_exec/run_command）、一切写删移（fs_write/rm/mv/mkdir/touch/cp、text_replace、archive_*、net_download）、共享进程状态（env_set/unset）、系统副作用（process_kill）、pkg_run、git 变更类（add/checkout/clone/commit/pull/push/stash 非 list）；规则3 逃生舱仅限参数级只读细分且逐例注释（已知一例：git_stash `action:'list'`）；规则4 防漂移护栏=单测强制每工具显式声明 annotations，缺声明即失败。附带裁决：net_post 因服务端副作用语义保守标 false；echo/pwd/json_get/env_get/system_*/hash_file/search_*/text 读族/fs 读族/git 只读子命令/net 探测族/pkg_detect/process_list 标 true。
- **D6（2026-08-25，自决）工具面广度 = 维持全量注册，不做 code-mode 专项裁剪**；部署级裁剪走 002 D7 Config.exclude。理由：双模一致性 > SDK 段成本（前缀稳定 + provider 缓存摊销）；F3「程序内直做」不构成裁剪依据——保留工具即保留门禁与跨宿主契约。002 D2 在新证据下重验通过。
- **D7（2026-08-25，自决）验收扩展（叠加于 002 D9）**：①D5 规则 4 护栏测试；②dsh 双模式冒烟——native 并行分发验证、code-mode 程序内 Promise.all 重叠验证（观察 tool/code-dispatch 计时）、exclusive 排他顺序验证；③SDK .d.ts 全量审计无意外 unknown 降级（002 实施期验证项转正为验收项）。
- **D8（2026-08-25，自决）交付形态 = 同分支两阶段**：①构建多入口 + plugin 壳 + annotations 透传管道；②全量标注盘点 + 护栏测试 + dsh 冒烟。版本 0.1.0 → 0.2.0（minor：新增入口非破坏）。
- **D9（2026-08-25，Q6 用户选定）outputSchema 吸收时机 = 纳入首版**：与 D8 第一阶段合并实施。每工具补充 output zod schema（描述 success data 结构），经 server.ts 透传 MCP `outputSchema`、经 plugin.ts 映射为 dsh `output.schema`。被否决：延后到第二阶段（插件壳第一阶段无法真正注册工具，里程碑假绿）、硬编码宽松 schema（类型化收益归零）。

## 待澄清

（空）
