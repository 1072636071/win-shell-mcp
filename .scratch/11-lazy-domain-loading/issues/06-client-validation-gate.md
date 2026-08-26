# 发布门槛：真实 MCP 客户端验证 + 降级路径

**Status:** ready-for-agent

**Blocked by:** 04（并依赖 03 的 meta 工具可被消费）

**构建内容：** 懒加载模式发布前的最终验证闸门。在至少一个真实目标 MCP 客户端（以实施环境实际可用的客户端为准）验证三点——懒模式连接可用、未列出工具可直接调用、`list_domain_tools` 结果能被 AI 正常消费——验证通过才把该模式对外推荐。若验证发现客户端禁止调用未列出的工具，则本模式不默认推荐，转为文档说明的受限特性并记录降级路径（另立 listChanged 动态重注册工单）。本工单不产生产品代码，产出为验证结论与发布判断。

**验收标准：**

- [ ] 在至少一个真实 MCP 客户端完成三项验证：① 懒模式（`WIN_SHELL_LAZY=1`）下连接可用、`ListTools` 只返回 3 个 meta；② 未在 `ListTools` 列出的工具（如 `git_status`）可直接 `tools/call` 并成功；③ `list_domain_tools(domain)` 的结果能被该客户端/AI 正常消费（展示、构造后续调用）
- [ ] 验证结论记录于本工单评论区，含使用的客户端、版本、验证步骤与结果
- [ ] 若客户端禁止调用未列出工具：结论明确降级——本模式不默认推荐、转为文档说明的受限特性，并在评论区记录降级路径（listChanged 动态重注册，另立工单）；若客户端允许：本模式可作为默认可推荐特性
- [ ] 验证结果不改变全量模式的默认行为（懒模式始终为可选项、默认关闭）
- [ ] 验证过程中发现的任何问题（若存在）作为后续工单或本工单评论区的待办记录，不在此处修产品代码

## 评论

（评论与对话历史追加于此，新内容置于最前。）

- **2026-08-26 重跑结论（eng-beta，attempt 2）：三点验证全部通过，门槛放行——懒模式可作为默认可推荐特性。**
  - 前置：工单 18 structuredContent 回填已落地（t10），重建 dist 后以同一组脚本实跑（`.temp/scripts/lazy-client-validation.mjs` 主验证 + `.temp/scripts/fullmode-probe.mjs` 对照探针）。
  - 客户端：官方 `@modelcontextprotocol/sdk` Client **v1.30.0**（Node v22.22.2）；transport：**stdio 子进程**连接构建产物 `dist/index.js`（`WIN_SHELL_LAZY=1`）。
  - ① ✅ 懒模式连接可用，ListTools 恰返回 3 个 meta `[batch_run, list_domain_tools, tool_groups]`。
  - ② ✅ 未列出工具 `git_status` 直接 `tools/call` 成功（ok=true）——「客户端禁止调用未列出工具」否决情形确认不存在。
  - ③ ✅ `list_domain_tools('git')` 可正常消费：返回 11 条与 ListTools 同形的完整明细（name/description/inputSchema…），并据此成功构造后续调用 `git_log(limit=2)`（ok=true）。修复前同路径 -32600，回填后通过。
  - 全量对照探针亦 PASS（61 工具列出后直接调用 git_status 成功），证明修复覆盖两种模式、无回归。
  - **发布判断**：懒模式三项验证全过、全量模式零破坏，本模式可作为默认可推荐特性；无遗留降级路径需求。
- **2026-08-26 验证结论（eng-beta）：三项验证 2/3 通过，门槛判定为「暂不通过——待产品缺陷修复后重跑」，非懒加载机制否决。**
  - 客户端：官方 `@modelcontextprotocol/sdk` Client **v1.30.0**（Node v22.22.2）；transport：**stdio 子进程**连接构建产物 `dist/index.js`（比 InMemoryTransport 更接近真实部署）。脚本：`.temp/scripts/lazy-client-validation.mjs`（主验证）、`.temp/scripts/fullmode-probe.mjs`（定界探针）。
  - ① ✅ 懒模式连接可用：`WIN_SHELL_LAZY=1` 下 ListTools 恰返回 3 个 meta `[batch_run, list_domain_tools, tool_groups]`。
  - ② ✅ 未列出工具直接调用成功：`git_status` 未经 ListTools 列出即 `tools/call` 返回 `ok:true`。**发布门槛核心问题「客户端是否禁止调用未列出工具」答案为否**——SDK Client 允许调用未列出工具，无需走「受限特性/listChanged 降级」路径。
  - ③ ❌ `list_domain_tools('git')` 被客户端拒绝：`MCP error -32600: Tool list_domain_tools has an output schema but did not return structured content`。
  - **缺陷定界（fullmode 探针）**：全量模式（61 工具）下直接调用普通工具 `git_status` 同样 `-32600`。根因是产品级缺口而非本批引入：server 层 `toMcpContent` 只回 text content，从不为声明了 `outputSchema` 的工具回填 MCP `structuredContent`；而 SDK ≥1.18 的 Client 在 `listTools()` 缓存到工具的 outputSchema 后强制校验响应必须携带 structuredContent。既有集成测试未拦截，是因为用例先 `callTool` 后（或从不）`listTools`，schema 缓存为空则校验不触发——真实客户端「先列后调」的标准流程必命中。
  - **建议（供 captain 裁决）**：另立工单「server 为声明 outputSchema 的工具回填 structuredContent（zod schema 校验通过后透传 data）」，修复后重跑本门槛三点验证；修复落地前懒模式与全量模式在严格 SDK 客户端下均不可对外推荐（影响面等同全量，非懒加载特有）。同时可补一条「先 listTools 再 callTool」的集成回归用例防再次漏网。


- 本工单是发布门槛：04 号工单的机制正确性以本工单的客户端验证为最终裁决。若验证否决（客户端禁止调未列出工具），需回看 04 号工单的评论按降级路径处理。
