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

## 评论

（评论与对话历史追加于此，新内容置于最前。）
