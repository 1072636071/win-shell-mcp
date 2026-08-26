# structuredContent 回填：server 序列化层补齐 MCP 结构化输出腿

**Status:** claimed

**Blocked by:** 11 号 t7（组合语义）合入后开工，避免与 `src/server.ts` 并行编辑冲突

**构建内容：** 修复 11-06 门槛发现的产品级缺口——声明 outputSchema 的工具在 MCP `tools/call` 响应中缺少 `structuredContent`，导致规范客户端（SDK ≥1.x 先列后调路径）以 -32600 拒绝全部工具调用。回填后「一鱼三吃」的 MCP 腿补齐，11-06 门槛可重跑。

**验收标准：**

- [ ] `src/server.ts` MCP content 构造处：成功结果回填 `structuredContent`（取自统一输出契约，与 text content 的 JSON 深度相等，由测试钉死）；失败结果（isError=true）不含该字段
- [ ] 新增「先列后调」协议级回归用例（InMemoryTransport：Client 先 `listTools()` 再 `callTool()`），覆盖至少一个只读工具与一个带复杂 schema 的工具，断言无 -32600 且 structuredContent 形状正确
- [ ] 失败路径回归：错误调用无 structuredContent、text 仍为错误 JSON、isError=true
- [ ] 复核既有对 CallToolResult 精确形状断言的用例，同步补 structuredContent 期望（允许改断言、不允许删除覆盖）
- [ ] `src/plugin.ts` 不动；dsh 面行为零变化
- [ ] CHANGELOG Unreleased 追加条目：MCP 面 tools/call 成功响应新增 structuredContent 字段（加法、默认行为向后兼容）
- [ ] `pnpm typecheck && pnpm test` 全绿
- [ ] 完成后在评论区记录改动摘要，交由 captain 重跑 11-06 门槛

## 评论

（评论与对话历史追加于此，新内容置于最前。）

- **2026-08-26 实施完成（eng-beta）**：改动摘要——
  - `src/server.ts` `toMcpContent`：成功响应回填 `structuredContent = { ...result }`（统一输出契约整体，与 text content 的 JSON 深度相等，由测试钉死）；失败响应（isError=true）不含该字段。单一回填点，未动任何工具定义、未加服务端 schema 校验。
  - `tests/integration/server.test.ts` 新增「工单 18：先列后调 structuredContent 回填」3 用例（正是缺陷漏网形态——Client 先 listTools 缓存 schema 再 callTool）：只读工具 system_info 深度相等断言；复杂嵌套 schema 工具 batch_run 同样回填且 allOk 形状正确；失败路径回归（fs_stat ENOENT → isError=true、structuredContent undefined、text 仍为错误 JSON）。复核既有 CallToolResult 断言：全部为字段访问式（非整对象 toEqual），加法字段零破坏，无需改动、覆盖未删。
  - `CHANGELOG.md` Unreleased/Added 追加 structuredContent 条目（纯加法、向后兼容、dsh 面零变化）。
  - 验证：`pnpm typecheck` exit 0；`pnpm test` 全量 40 文件 / 1784 passed / 2 skipped 全绿。**门槛脚本预检通过**：重建 dist 后重跑 `.temp/scripts/lazy-client-validation.mjs` 全 5 步 PASS（③a list_domain_tools('git') 返回 11 条明细、③b 据此构造 git_log(limit=2) 成功）、`.temp/scripts/fullmode-probe.mjs` 全量模式 git_status 调用 PASS（修复前同路径 -32600）——11-06 门槛可重跑放行。
- 立单依据：11-06 门槛验证③的定界探针（全量模式 git_status 同样 -32600，影响面等同、与懒加载无关）；详见 `.scratch/11-lazy-domain-loading/issues/06-client-validation-gate.md` 评论区与 `.temp/scripts/` 探针脚本。
