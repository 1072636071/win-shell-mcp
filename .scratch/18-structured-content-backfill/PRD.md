# PRD / Spec — CallTool 响应回填 structuredContent

Status: ready-for-agent
日期：2026-08-26
来源：11-06 发布门槛验证发现（`.scratch/11-lazy-domain-loading/issues/06-client-validation-gate.md` 评论区的定界探针）
优先级：P0（阻塞 11-06 放行；影响全量与懒两种模式的所有工具）
关联：CONTEXT.md「outputSchema 一鱼三吃」（MCP structuredContent 腿）、ADR-0014、ADR-0007（0.x 加法兼容）

## 问题陈述

全部工具均声明非空 `outputSchema`（防漂移护栏强制），但 server 的 MCP 序列化层从不回填 `structuredContent`。规范客户端（@modelcontextprotocol/sdk Client ≥1.x）在先 `listTools` 缓存 outputSchema 后调用 `tools/call` 时，按规范校验「声明了 outputSchema 的响应必须含 structuredContent」，校验失败即整包拒绝（-32600）。后果：真实部署路径上所有 61 个工具的调用被拒——既有集成测试未捕获，因为它们直接调 `callTool()` 或未先 listTools，客户端侧无 schema 可校验。

## 解决方案

server 层单一回填点：CallTool 成功结果的统一输出契约 `data` 直接作为 `structuredContent` 返回（与 text content 的 JSON 字符串同源同形）；失败结果（isError=true）不含 structuredContent（符合规范）。不改任何工具定义、不加服务端 schema 校验。

## 实现决策

1. 回填位置收敛在 `src/server.ts` 的 MCP content 构造处（现 `toMcpContent`），成功时 `structuredContent = result`（契约 data，即去掉 ok 包装前的整体或按现行序列化同源提取——以测试钉死与 text 内容 JSON 深度相等为准）。
2. 失败结果维持现状（仅 text + isError），不构造 structuredContent。
3. dsh 插件面（`src/plugin.ts`）不受影响——其走 defineTool 直连，不经 MCP 序列化。
4. 兼容性：纯加法字段（ADR-0007 0.x 窗口）；忽略 structuredContent 的旧客户端不受影响，text content 照常承载完整 JSON。
5. 文档：CHANGELOG Unreleased 追加条目（注明 MCP 面响应新增 structuredContent 字段的行为变化）；README 无需新小节。

## 测试决策

1. 新增「先列后调」协议级回归：Client 经 InMemoryTransport 先 `listTools()`（缓存 outputSchema）再 `callTool()` 任一声明 schema 的工具，断言不再 -32600、`structuredContent` 与 text JSON 深度相等——该用例正是本缺陷的漏网形态。
2. 失败路径回归：调用失败（isError=true）时无 structuredContent、text 仍为错误 JSON。
3. 全量模式既有断言逐条复核：凡对 CallToolResult 做精确形状断言的用例同步补 structuredContent 期望（加法变更，允许改断言不允许删覆盖）。
4. 不测服务端 schema 校验（明确不做）。

## 超出范围

- 不做服务端 outputSchema 自校验（客户端已校验）。
- 不动 dsh 插件面与 Code Mode SDK 类型推导（各自机制独立）。
- 不改任何工具的 outputSchema 定义。

## 补充说明

- 本工单落地后，由 captain 触发 11-06 门槛重跑（复用其 `.temp/scripts/` 下验证脚本）再作发布推荐裁决。
- 预估工作量：1-2 小时。
