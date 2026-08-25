# 懒模式 ListTools：只返回 3 个 meta 工具 + 调用不设门禁

**Status:** ready-for-agent

**Blocked by:** 01、02、03

**构建内容：** 懒加载模式的运行机制。开启 `WIN_SHELL_LAZY=1` 后，AI 首次 `ListTools` 只看到 `tool_groups`、`list_domain_tools`、`batch_run` 三个 meta 工具，固定开销从 59 工具份降到一屏以内；随后按需用 03 工单的工具取回目标域明细，并照常 `tools/call` 任意已注册工具——**调用不设门禁**，未在 `ListTools` 列出的工具也能直接调，因为加载只是信息获取、不是授权。全量模式下 `ListTools` 返回集不变。

**验收标准：**

- [ ] 懒模式（`WIN_SHELL_LAZY=1`，经 02 工单配置模块解析）下 `ListTools` 恰返回 3 个条目：`tool_groups`、`list_domain_tools`、`batch_run`（`batch_run` 懒模式下始终可见，保证多步编排不被加载流程挡住）
- [ ] 全量模式（不设环境变量或非 1 值）下 `ListTools` 返回集与现状一致，行为逐字节不变
- [ ] `CallTool` 分发针对全部已注册工具（含懒模式下未列出的），不做任何前置门禁：懒模式下 `callTool("git_status", …)` 等未列出工具照常成功——这是本设计的兼容性基石
- [ ] 运行期不发出 `listChanged` 通知（注册集不变，不依赖客户端的动态工具发现支持）；`listChanged` 通知在懒模式下不触发
- [ ] 实现位置为 server 创建时的工具列表裁剪（`createServer` 的工具表参数注入已支持，无全局态）；dsh 插件面（`src/plugin.ts`）不受影响、维持全量注册（ADR-0011）
- [ ] 懒模式与全量模式下对同一工具 `CallTool` 的返回一致（模式切换无需调整提示词）
- [ ] 测试（复用 `tests/integration/server.test.ts` 的 InMemoryTransport harness）：懒模式下 `client.listTools()` 返回 3 个 meta；`client.callTool({ name: "git_status", … })` 在懒模式下照常成功；全量模式回归
- [ ] 懒模式下的好测试只测外部可观察行为（`listTools()`/`callTool()` 输出与结果），不测内部裁剪实现方式

## 评论

（评论与对话历史追加于此，新内容置于最前。）

- 本工单的结果依赖 06 工单的客户端验证结论：若验证发现目标客户端禁止调用未列出的工具，则本模式需按 06 的降级路径处理（文档说明受限特性 + 另立 listChanged 动态重注册工单）。
