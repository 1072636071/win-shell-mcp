# 懒模式 ListTools：只返回 3 个 meta 工具 + 调用不设门禁

**Status:** ready-for-agent

**Blocked by:** 01、02、03

**构建内容：** 懒加载模式的运行机制。开启 `WIN_SHELL_LAZY=1` 后，AI 首次 `ListTools` 只看到 `tool_groups`、`list_domain_tools`、`batch_run` 三个 meta 工具，固定开销从 59 工具份降到一屏以内；随后按需用 03 工单的工具取回目标域明细，并照常 `tools/call` 任意已注册工具——**调用不设门禁**，未在 `ListTools` 列出的工具也能直接调，因为加载只是信息获取、不是授权。全量模式下 `ListTools` 返回集不变。

**验收标准：**

- [ ] 懒模式（`WIN_SHELL_LAZY=1`，经 02 工单配置模块解析）下 `ListTools` 恰返回 3 个条目：`tool_groups`、`list_domain_tools`、`batch_run`（`batch_run` 懒模式下始终可见，保证多步编排不被加载流程挡住）
- [ ] 全量模式（不设环境变量或非 1 值）下 `ListTools` 返回集与现状一致，行为逐字节不变
- [ ] `CallTool` 分发针对全部已注册工具（含懒模式下未列出的），不做任何前置门禁：懒模式下 `callTool("git_status", …)` 等未列出工具照常成功——这是本设计的兼容性基石
- [ ] 运行期不发出 `listChanged` 通知（注册集不变，不依赖客户端的动态工具发现支持）；`listChanged` 通知在懒模式下不触发
- [ ] 列出面与分发面分离是本工单显式交付物：扩展 server 创建 API 以分别接受分发工具表与列出工具表（如 `createServer({ tools, listedTools })` 或等价双参注入/列出侧过滤钩子）——现状单表参数同时服务 ListTools 与 CallTool，直接注入裁剪表会令未列出工具报 `Unknown tool`、破坏「调用不设门禁」；懒模式下列出表恰为 3 个 meta、分发表为全部已注册工具，无全局态；dsh 插件面（`src/plugin.ts`）不受影响、维持全量注册（ADR-0011）
- [ ] 懒模式与全量模式下对同一工具 `CallTool` 的返回一致（模式切换无需调整提示词）
- [ ] 测试（复用 `tests/integration/server.test.ts` 的 InMemoryTransport harness）：懒模式下 `client.listTools()` 返回 3 个 meta；`client.callTool({ name: "git_status", … })` 在懒模式下照常成功；全量模式回归
- [ ] 懒模式下的好测试只测外部可观察行为（`listTools()`/`callTool()` 输出与结果），不测内部裁剪实现方式

## 评论

（评论与对话历史追加于此，新内容置于最前。）

- **实施完成（eng-alpha，2026-08-26）**：①`src/server.ts` 扩展 `createServer` 双表 API——兼容形态 `createServer(tools)`/`createServer()` 行为逐字节不变；双表形态 `createServer({ tools, listedTools })`：ListTools 用列出表、CallTool 恒用分发表（未列出工具照常执行，不会 Unknown tool）。分发面沿用 12-02 语义（非全量子表的 batch_run 自动替换受限副本），列出面缺省 = 分发表。②新增纯函数 `resolveListedTools(lazy, tools)` 与常量 `LAZY_LISTED_TOOL_NAMES`（三件套；与分发表求交、保持注册顺序——白名单先裁 meta 时自然不出现在列出面，为 05 号组合预留）。③`startStdioServer` 组合：env 原始读取仍收敛在 stdio 入口链路（WIN_SHELL_LAZY 经配置模块 parseLazyMode 解析），分发表恒为全部部署工具、列出表按模式解析；运行期注册集不变、不发 listChanged（capabilities 未声明 listChanged，亦无通知代码路径）。④测试只测外部可观察行为：tests/integration/server.test.ts 新增 10 断言（懒模式列出恰 3 条、未列出工具 fs_stat 照常 ok、meta 自身可调、未知工具仍 Unknown tool、listChanged 通知捕获为空、resolveListedTools 双模语义 + 子表求交、对象形态与数组形态一致性、listedTools 子集只收窄列出面）。
- **实施裁决一（12-02 共存）**：server.ts 在本工单实施前已被 12-02 白名单改造（单表 deployed 注入 + batch_run 受限副本 + notExposedMessage 归因）。双表 API 以「列出表缺省 = 分发表」保持其行为零变化；懒模式注入时分发表走同一 scopeBatchRunToDeployment 路径。白名单 × 懒叠加的完整语义（05 号）已由求交语义自然承接一半（被裁 meta 不出现于列出面），其余归因文案裁决仍在 05。
- **实施裁决二（tool_groups 的 visible 过渡读取点仍未上收）**：tool_groups handler 内经 parseLazyMode 读 env 的过渡实现（03 号评论所记）在本工单保留未动——handler 无上下文注入通道，彻底上收需把 listedTools 决策传入 handler 或改为 05 号随过滤集合计算，留作 05/后续重构接口点。当前两处判定同源于 WIN_SHELL_LAZY=1，语义一致。
- **验证**：`pnpm typecheck && pnpm test` 全绿（40 文件 / 1766 通过 / 2 既有 skip）；全量模式回归（既有 61 工具断言、guard 三件套）不受影响。禁改面核查：未动 `src/plugin.ts`、未改 CHANGELOG、未 commit。

- 复核（审视）：验收第 6 条「`createServer` 的工具表参数注入已支持」不成立，且与本工单自身的基石条款冲突。现状 `createServer(tools)` 以**同一张表**同时服务 ListTools 与 CallTool（`src/server.ts:138-148`）；若照字面把裁剪后的表注入，未列出工具的 `callTool` 会得到 `Unknown tool`，直接违反「调用不设门禁」。白名单场景（12-02）单表注入可行是因为列出面与分发面同缩；懒模式是「列出集 ⊂ 分发集」，必须扩展 API（如 `createServer({ tools, listedTools })` 双表参数或等价的列出侧过滤钩子）。建议把该 API 扩展列为本工单显式交付物，工作量估算亦应含此项。

- 本工单的结果依赖 06 工单的客户端验证结论：若验证发现目标客户端禁止调用未列出的工具，则本模式需按 06 的降级路径处理（文档说明受限特性 + 另立 listChanged 动态重注册工单）。
