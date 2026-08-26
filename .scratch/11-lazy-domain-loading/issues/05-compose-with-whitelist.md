# 与白名单（12 号）组合：白名单先过滤、域概览基于过滤后集合

**Status:** ready-for-agent

**Blocked by:** 04、12（12 号工单需先落地或并行协调，见评论）

**构建内容：** 当懒加载与工具白名单（`WIN_SHELL_TOOLS`）同时启用时，两种机制的叠加语义固定为可预测：**白名单先过滤工具集**，懒模式的域概览基于过滤后的集合统计——白名单裁掉的域在 `tool_groups` 中不出现，被裁工具经 `list_domain_tools` 也查不到。叠加后 `ListTools` 仍只返回 3 个 meta，但各 meta 工具反映的是白名单裁剪后的真实可见集合，避免 AI 基于过时概览构造调用。

**验收标准：**

- [ ] 白名单先过滤工具集，懒模式的域概览（`tool_groups` 的 `toolCount`、`list_domain_tools` 的输出）均基于过滤后集合统计
- [ ] 过滤后为空（该域全部工具被白名单裁掉）的域在 `tool_groups` 概览中不出现
- [ ] meta 三件套在懒模式下豁免白名单：组合模式中 `tool_groups`/`list_domain_tools`/`batch_run` 恒列入、恒可调用，无论是否被 `WIN_SHELL_TOOLS` 点名——懒模式导航与编排入口不可被部署裁剪意外砍掉；纯白名单模式（懒关闭）下 meta 作为普通工具照常受白名单约束
- [ ] `list_domain_tools` 只返回过滤后仍可见的工具；调用被裁工具的 `CallTool` 走 12 号工单的"未在当前部署暴露"文案，而非"未在懒列表"之类歧义
- [ ] 懒模式的 `ListTools` 仍只返回 3 个 meta（白名单与懒模式互不改变对方的核心机制）
- [ ] 不设白名单时本工单行为退化为纯懒模式（与 04 一致）；不设懒模式时退化为纯白名单（与 12 一致）——两种开关正交可组合
- [ ] 测试：白名单 + 懒模式叠加下，`tool_groups` 的域集合/`toolCount` 反映过滤后集合；空域不出现

## 评论

（评论与对话历史追加于此，新内容置于最前。）

- **实施完成（eng-alpha，2026-08-26）**：按裁决 (a) 落地——懒模式 meta 三件套豁免白名单。①装配层 `src/server.ts`：新增导出 `composeLazyDispatchTable(deployed)`（被裁三件套按注册序补回分发表）；`startStdioServer` 组合为「白名单先过滤 → 懒模式补集三件套 → 列出面 = 三件套 ∩ 分发表」；纯白名单路径不经过豁免函数（meta 照常受约束），纯懒/无白名单路径为恒等变换（零破坏）。②统计口径：`tool_groups` / `list_domain_tools` 新增 scoped 工厂（`createScopedToolGroupsTool` / `createScopedListDomainToolsTool`，沿用 batch_run 的 createScoped* 先例），server 装配子表时统一替换（scopeBatchRunToDeployment 泛化为 scopeMetaToolsToDeployment）；域概览基于过滤后集合——空域整体不出现、toolCount 为子表计数、精选示例先取可见者、全部被裁时回退域内现存前 2 个；list_domain_tools 只返回可见工具，整域被裁返回空数组（响错误而非报错）。③被裁工具调用文案不变走 12-02 的「未在当前部署暴露（WIN_SHELL_TOOLS）」，与懒模式无歧义耦合。④实现坑位记录：scoped 工厂的缺省 pool 必须在闭包内惰性解析，不能写参数默认值——本模块由 registry 转载入，初始化期读 builtinTools 会踩 ESM 循环 TDZ（ReferenceError，已修复并以全量回归钉住）。⑤规格外小项（captain 授权，t6 留的共用槽位）：README「环境变量」小节新增 `WIN_SHELL_LAZY` 条目（仅 "1" 启用/列出三件套/调用不设门禁/与白名单正交组合语义），CHANGELOG [Unreleased] Added 追加懒加载特性一条。⑥测试 +15 断言：meta-tools 单测 6 条（scoped 口径/示例回退/零破坏深度相等/EINVAL/投影无差别）+ integration 组合端到端 9 条（豁免装配注册序、列出恒 3 meta、概览反映过滤集合且空域不出现、明细可见性口径、被裁文案、batch_run 编排可用、单开退化 ×2）。验证 `pnpm typecheck && pnpm test` 全绿（40 文件 / 1781 通过 / 2 既有 skip）。禁改面核查：未动 `src/plugin.ts`、未 commit。

- 复核（审视）：meta 三件套是否受 `WIN_SHELL_TOOLS` 约束未定义。「白名单先过滤工具集」若按字面覆盖全部注册工具，则未被点名白名单的 `tool_groups`/`list_domain_tools`/`batch_run` 会被裁掉，与验收第 4 条「ListTools 恒返回 3 个 meta」冲突、懒模式空转。需显式裁决其一：(a) meta 工具豁免白名单（建议——懒模式导航入口不可裁）；(b) 白名单须显式包含 meta 名方可见。应在 12-02 实施前敲定，避免两工单实现分叉。

- 协调点：本工单依赖 12 号工单的白名单过滤与"未在当前部署暴露"文案落地。若 12 未先落地，本工单无法验收；建议 12 号工单先于本工单执行，或与本工单在同一批并行并在合入时合并。
- 若 12 号工单的配置模块由本批 02 工单创建（见 02 评论的协调规则），本工单消费同一配置模块的白名单解析结果与懒开关结果，二者无二义。
