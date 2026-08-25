# PRD / Spec — 按域分组的懒加载机制

Status: ready-for-agent
日期：2026-08-25
来源：PRD-07（`.scratch/07-token-optimization/PRD.md`）优化点 P1-1
优先级：P1
关联：ADR-0006（成域闸门，15 命令域）、ADR-0011（全量注册）、ADR-0007（兼容性红线）

## 问题陈述

一次 `ListTools` 全量返回 59 个工具的固定开销随工具数线性增长，而日常任务通常只用到 2-3 个命令域。即使 08 号工单把元数据精简 30-50%，全量暴露的结构本身仍是浪费：AI 为用不到的 50+ 个工具支付每次会话的上下文租金。

## 解决方案

MCP server 面提供可选的懒加载模式：`ListTools` 只返回三个 meta 工具（`tool_groups`、`list_domain_tools`、`batch_run`），AI 先看 15 个命令域的概览，按需调 `list_domain_tools(domain)` 取回该域工具的完整元数据，随后照常 `tools/call`——调用不设门槛，加载只是信息获取。默认关闭、环境变量显式开启，既有客户端零影响；dsh 插件面不受影响（ADR-0011 的全量注册是 dsh 面决策，本机制只在 MCP server 面）。

## 用户故事

1. 作为 AI，我想要懒加载模式下首次 `ListTools` 只看到 3 个 meta 工具，以便固定开销从 59 工具份降到一屏以内。
2. 作为 AI，我想要调用 `tool_groups` 得到 15 个命令域的概览（域名、一句话用途、工具数、代表工具），以便判断该加载哪个域。
3. 作为 AI，我想要调用 `list_domain_tools(domain: "git")` 得到该域全部工具与 `ListTools` 条目同形的完整元数据（name/description/inputSchema/outputSchema/annotations），以便正确构造调用。
4. 作为 AI，我想要 `batch_run` 在懒加载模式下始终可见，以便多步编排永远可用，不被加载流程挡住。
5. 作为 AI，我想要对任何已注册工具的 `tools/call` 都成功（哪怕我没先"加载"它），以便加载只是信息获取、不是调用门禁；跨域任务不必逐个域加载。
6. 作为 AI，我想要懒加载与全量模式下的工具行为完全一致，以便切换模式不需要任何提示词调整。
7. 作为部署者，我想要懒加载默认关闭、经环境变量显式开启，以便现有客户端在升级后行为不变。
8. 作为维护者，我想要 15 个命令域从注释共识升格为工具元数据（每个工具声明所属域），并有护栏测试防漂移，以便域的划分有一处事实源。
9. 作为维护者，我想要域清单与 CONTEXT.md 的现状基线（15 域）一致，域概览文案以 CONTEXT.md 术语表为准，以便领域词汇不分裂。
10. 作为维护者，我想要在实施时先验证目标 AI 客户端对"未在 ListTools 中列出的工具直接 tools/call"的行为，验证通过才发布该模式，以便不把假设当结论。
11. 作为维护者，我想要懒加载与工具白名单（12 号工单）的组合语义明确：白名单先过滤，域概览展示过滤后的集合，空域不显示，以便两个机制叠加时行为可预测。
12. 作为维护者，我想要 dsh 插件面保持全量注册不受本机制影响，以便 ADR-0010/0011 的双入口架构不被破坏。

## 实现决策

1. **开关**：环境变量 `WIN_SHELL_LAZY=1` 启用，缺省/其他值为全量模式。解析收敛在环境变量配置模块（12 号工单创建；若本工单先落地，则由本工单创建该模块，接口与 12 对齐：纯函数、可注入环境源测试）。
2. **域元数据**：`Tool` 接口新增必填 `domain` 字段，取值为 CONTEXT.md 的 15 命令域之一（system / fs / text / search / process / shell_exec / env / net / pkg / git / core / run_command / archive / hash / json）；`batch_run` 与两个新 meta 工具标记为 meta，不占域名额。全部 59 个工具按 CONTEXT.md 现状基线归域（如 `fs_list`/`fs_write` 等归 fs 域，`cat` 归 text 域，`find` 归 search 域），`registry` 中既有的注释分组退役或改写为与该字段一致。
3. **新增两个 meta 工具**：
   - `tool_groups`：只读，无参数；输出 15 域概览数组 `{ domain, summary, toolCount, examples }`，文案以 CONTEXT.md 术语表为源；懒模式下还标注当前可见性。
   - `list_domain_tools`：只读，入参 `domain`（15 域枚举）；输出该域工具与 `listTools()` 条目同形的数组。两工具均带 outputSchema 与 `readOnlyHint: true`（满足防漂移护栏）。
4. **懒模式的 ListTools**：返回 `tool_groups`、`list_domain_tools`、`batch_run` 三个条目；全量模式返回集不变。实现位置为 server 创建时的工具列表裁剪（工具注入点已参数化，无全局态）。
5. **调用不设门禁**：`CallTool` 分发仍针对**全部**注册工具（含懒模式下未列出的），不做任何前置检查——这是本设计的兼容性基石。
6. **不发 `listChanged` 通知**：运行期注册集不变，不依赖客户端的动态工具发现支持。动态重注册方案列为未来演化，不在本工单。
7. **与白名单组合**：白名单（12 号工单）先过滤工具集，懒模式的域概览基于过滤后集合统计，过滤后为空的域不出现。
8. **发布门槛**：实施时在至少一个真实目标客户端（以实施环境实际可用的 MCP 客户端为准）验证三点——懒模式连接可用、未列出工具可直接调用、`list_domain_tools` 结果能被 AI 正常消费——结论记录于本工单评论区；若客户端禁止调用未列出工具，则本模式不默认推荐，转为文档说明的受限特性，并在评论区记录降级路径（listChanged 动态重注册，另立工单）。

## 测试决策

1. **好测试的标准**：只测外部行为——两种模式下 `listTools()`/`createServer()` 的可观察输出与调用结果；不测内部裁剪的实现方式。
2. **seam**：`src/server.ts` 的 `listTools()`/`callTool()`/`createServer()`（参数注入，可直接传裁剪后的工具表）；协议级端到端复用 `tests/integration/server.test.ts` 的 InMemoryTransport harness（SDK Client ↔ in-process Server）。
3. **新增用例**：
   - 懒模式：`listTools()` 恰返回 3 个 meta 工具；`callTool("tool_groups", {})` 返回 15 域且各区计数与域字段一致；`callTool("list_domain_tools", { domain: "git" })` 返回 11 个条目且形态与 `listTools()` 条目同形。
   - 门禁缺位：懒模式下 `callTool("git_status", …)` 等未列出工具照常成功。
   - 全量模式回归：默认（不设环境变量）行为与现状逐字节一致。
   - 环境变量解析走配置模块的纯函数测试（注入伪造环境源），不依赖真实 `process.env`。
4. **护栏测试**（沿用 `guard-mutating.test.ts` 模式）：每个工具 `domain` 非空；15 个域每个至少一个工具；域计数总和 + 3 个 meta = 59；CONTEXT.md 基线数（15 域/59 工具）作为常量写入护栏并注释来源，基线更新时须同步改。
5. **先例**：集成测试的 `EXPECTED_TOOL_NAMES` 名单核对、`guard-mutating.test.ts` 的全工具集遍历。

## 超出范围

- dsh 插件面不做懒加载（ADR-0011 全量注册维持）。
- 不做运行时 `listChanged` 动态重注册（列为未来演化）。
- 不做比域更细的按需粒度（单工具级加载）——域是 CONTEXT.md 的既有词汇，够用且实现简单。
- 不做 `ListTools` 的 cursor/分页（MCP 客户端生态支持度更差，收益重复）。
- 不新建域概览的独立文档承载（概览即 `tool_groups` 的输出）。

## 补充说明

- 收益估算：典型任务（2-3 域）的固定开销从 59 工具份降到 3 meta + 2-3 域工具份，约降 60-80%。
- 成本：多一轮 `tool_groups`→`list_domain_tools` 的信息获取往返；换来的是每次会话固定开销的结构性下降，往返只在任务开环时发生一次。
- 与 ADR-0011 的关系：不冲突。0011 的"全量注册不裁剪"针对 dsh 插件面（dsh 无懒加载语义，且其固定开销由宿主框架承担）；MCP server 面的暴露策略独立决策。
- 依据 ADR-0007 的 0.x 窗口，本机制以可选模式引入，默认行为不变，实际上连破坏性都不构成。
- 预估工作量：1-2 天（含客户端验证）。

## 评论

（待后续讨论补充）
