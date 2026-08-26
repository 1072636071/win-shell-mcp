# 白名单生效 + 错误区分（listTools/callTool/batch_run 外部可观察）

**Status:** ready-for-agent

**Blocked by:** 01

**构建内容：** 部署者用 `WIN_SHELL_TOOLS` 启动 stdio server 时，内置工具表经白名单过滤后才注入 server，未列出的工具在 `listTools()` 中不再出现、其固定开销被砍掉。此后分两类调用错误：调用"存在于内置表但被白名单裁掉"的工具，返回明确文案"未在当前部署暴露（WIN_SHELL_TOOLS）"；调用"内置表中不存在"的工具，维持现有 `Unknown tool` 语义。`batch_run` 的步骤解析同样受白名单约束：引用被裁工具时该步失败、归因文案同上、短路语义不变，白名单成为真实边界。

**验收标准：**

- [ ] stdio 入口创建 server 时，先用配置模块解析白名单，再用解析结果过滤内置工具表后注入 `createServer(过滤后工具表)`；不设 `WIN_SHELL_TOOLS` 时过滤为空集合、等价于全量注入，默认零破坏
- [ ] 白名单生效后 `listTools()` 结果集只含白名单内正名的工具；别名本就不在 `listTools()` 列名中，断言"被裁工具别名同样不在列"的既有行为不变
- [ ] `callTool` 对"存在于内置表但被过滤裁掉"的工具：返回失败，错误消息明确含"未在当前部署暴露（WIN_SHELL_TOOLS）"（错误码沿用 EINVAL 或既有失败契约，不新增代码分支语义）
- [ ] `callTool` 对"内置表中不存在"的工具：维持现有 `Unknown tool: X` 语义（在 server 层与白名单裁剪区分开）
- [ ] `callTool` 对白名单内工具（含经别名的调用，若 14 号工单已落地）：正常执行，返回结果与未过滤时一致
- [ ] `batch_run` 步骤解析受白名单约束：引用被裁工具 → 该步失败、错误归因文案含"未在当前部署暴露（WIN_SHELL_TOOLS）"、短路语义不变；引用不存在工具 → 维持"未知工具"归因
- [ ] server 行为只测外部可观察面（`listTools()` 结果集、`callTool()` 错误文案、`batch_run` 返回），经 `createServer(过滤表)` / `callTool(name, args, 过滤表)` 参数注入断言，不测进程级启动路径
- [ ] 别名随正名共进退：写 `fs_list` 则 `ls`/`list_directory` 一起进退（断言裁剪语义）
- [ ] dsh 插件面不接入本变量（既有 `config.exclude` 不变，两机制各管各面）
- [ ] 前瞻对齐（11 号 05 工单裁决）：纯白名单模式下 meta 工具按普通工具参与过滤；仅当懒模式叠加时，meta 三件套（`tool_groups`/`list_domain_tools`/`batch_run`）才豁免过滤（恒列入恒可调），该豁免由 05 号工单实现。本工单不实现豁免，但过滤结构不得写死为"无条件裁掉一切未点名条目"以致后续无法叠加

## 评论

（评论与对话历史追加于此，新内容置于最前。）
