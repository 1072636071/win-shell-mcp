# 两个 meta 工具：tool_groups 域概览 + list_domain_tools 域工具明细

**Status:** ready-for-agent

**Blocked by:** 01

**构建内容：** AI 有了按域导航工具集的入口。调用 `tool_groups` 得到 15 个命令域的概览（域名、一句话用途、工具数、代表工具），据此判断该加载哪个域；再调 `list_domain_tools(domain)` 取回该域全部工具的完整元数据（与 `listTools` 条目同形），以便正确构造调用。二者都是只读、输出带 schema，并满足防漂移护栏（outputSchema 与 `readOnlyHint` 必填）。

**验收标准：**

- [ ] 新增 `tool_groups` 工具：只读、无入参；输出 15 域概览数组 `{ domain, summary, toolCount, examples }`，域名与 01 工单的 15 域枚举一致，`summary` 文案以 CONTEXT.md 术语表为源、`toolCount` 为该域工具数、`examples` 为该域代表工具名
- [ ] 新增 `list_domain_tools` 工具：只读、入参 `domain`（15 域枚举之一，非法值返回 EINVAL）；输出该域全部工具与 `listTools()` 条目同形的数组（name/description/inputSchema/outputSchema/annotations 字段形状一致）
- [ ] 两工具均声明非空 `outputSchema` 与 `readOnlyHint: true`，通过 `guard-mutating.test.ts` 的防漂移护栏
- [ ] 两工具标记为 meta（不占 15 域任何一域的名额；`tool_groups` 与 `list_domain_tools` 的 `domain` 归属为 meta 而非任一命令域）
- [ ] `tool_groups` 在懒模式下额外标注当前可见性（哪些域的工具在当前模式下被列出）
- [ ] 全量模式下两工具亦可见、可调用，行为与懒模式下一致（模式切换无需调整提示词）
- [ ] 测试：`callTool("tool_groups", {})` 返回 15 个域且各区 `toolCount` 与 01 工单的域字段统计一致；`callTool("list_domain_tools", { domain: "git" })` 返回 11 个条目且形态与 `listTools()` 条目同形
- [ ] 基线更新：`tests/tools/guard-mutating.test.ts` 总数断言 59→61、两 meta 计入只读清单（READONLY_TOOLS 34→36）；`tests/integration/server.test.ts` 的 `EXPECTED_TOOL_COUNT = 59` 同步改 61（PRD 测试决策 4：58 域 + 3 meta = 61）

## 评论

（评论与对话历史追加于此，新内容置于最前。）

- **实施完成（eng-alpha，2026-08-26）**：①新增 `src/tools/tool_groups.ts` 与 `src/tools/list_domain_tools.ts`，均只读、非空 outputSchema、`readOnlyHint: true`、`domain: "meta"`，已在 registry 注册（追加于注册序列末尾，既有工具顺序不变）；②tool_groups 输出 15 域概览 `{ domain, summary, toolCount, examples }`，summary 以 CONTEXT.md 术语表为源（DOMAIN_BRIEFS 静态常量，类型层强制覆盖 15 域），toolCount 从 registry 按 domain 字段实时统计，examples 由 meta-tools.test.ts 校验确属该域（防文案漂移）；③list_domain_tools 入参 domain 为 15 域枚举（zod enum + handler 防御双保险，非法值 EINVAL；"meta" 刻意不可入参），输出与 listTools() 条目逐字段深度相等（测试直接以 server.listTools() 对同域子集的投影为期望值钉死同形性）；④可见性标注：懒模式（WIN_SHELL_LAZY=1 经配置模块 parseLazyMode 解析）下每域附 `visible: false`，全量模式整体省略该字段（optional 形态，同 batch_run verbose 约定）；⑤基线更新全部落地。
- **实施裁决一（循环求值）**：两个 meta 工具需在模块初始化期用 COMMAND_DOMAINS 构造 zod enum，若从 registry 导入会成 registry → 工具 → registry 循环、enum 拿到 undefined（首跑即复现）。落地为新建零依赖叶子模块 **`src/domains.ts`**（COMMAND_DOMAINS / CommandDomain / ToolDomain 的唯一声明处），registry 原样再导出保持 API 不变（guard 测试导入路径不受影响）；工具模块直连 domains.ts。01 号「COMMAND_DOMAINS 在 registry」的记载据此更新为「registry 再导出、domains.ts 持有」。
- **实施裁决二（不 import server.ts）**：list_domain_tools 与 listTools() 条目同形，但为避免 batch.ts 已裁决过的同类循环（registry→工具→server→registry），投影在本地按同一映射实现（toJsonSchemaCompat + outputSchema/annotations 条件透传），同形性由深度相等断言强制，漂移即测试失败。
- **实施裁决三（visible 过渡读取点）**：当前 handler 经配置模块纯函数解析 `process.env[ENV_WIN_SHELL_LAZY]`——解析语义单一来源不变，但原始 env 读取暂落在 tools 层（config 模块「唯一调用点」约定的阶段性例外）。04 号落地 listedTools 双表注入后应将该判定上收至 server 创建链路，已写入代码注释作为接入点提示；05 号白名单叠加时 visible/toolCount 语义再随过滤集合调整。
- **基线更新清单（59→61）**：tests/tools/guard-mutating.test.ts（总数 61、READONLY_TOOLS 34→36 并入两 meta、并集 61）；tests/integration/server.test.ts（EXPECTED_TOOL_COUNT=61、EXPECTED_TOOL_NAMES 补两名）；tests/tools/guard-domain.test.ts（EXPECTED_TOTAL_TOOLS=61、58+3 守恒注释更新、新增两 meta 归属断言）；tests/plugin-integration.test.ts（硬编码 59→61、排除用例 56→58）；另 tests/tools/guard-metadata-budget.test.ts 的 METADATA_BUDGET 因两新工具 schema 净增重取实测 50516→52607（沿用工单 09/10 重取基线先例，提请知悉）。
- **验证**：`pnpm typecheck && pnpm test` 全绿（40 文件 / 1748 通过 / 2 既有 skip）；验收第 7 条测试见 tests/tools/meta-tools.test.ts（19 断言：15 域概览、计数一致、git 域 11 条、同形深等、EINVAL 路径、visible 双模语义）。禁改面核查：未动 `src/plugin.ts`（其两处"59 个"注释已过时，留待后续可改 plugin 的工单顺带修正）、未改 CHANGELOG、未 commit。

- 复核（审视）：缺基线更新验收项。新增两工具将打破既有硬断言：`tests/tools/guard-mutating.test.ts` 的 `builtinTools.length === 59`、`READONLY_TOOLS.length === 34`、`MUTATING_TOOLS.length === 25`、`listed.size === 59`，及 `tests/integration/server.test.ts` 的 `EXPECTED_TOOL_COUNT = 59`。应补一条验收：两 meta 记入只读清单（34→36）、guard 总数断言与 `EXPECTED_TOOL_COUNT` 同步 59→61。
