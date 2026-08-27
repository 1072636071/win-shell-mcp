# DSH 工具描述精简：编排/协作族

**Status:** ready-for-agent

**Blocked by:** 无——可立即开始

**构建内容：** 在 deepseek-harness 仓库，将 DSH 的编排/协作类工具描述精简为"最短可准确表达语义、AI 能看懂"的形式。实施后这些工具的描述大幅缩短（含最长的工作流/待办/subagent 等），语义与行为事实保留。

**验收标准：**

- [ ] 编排/协作族工具（ask-user/plan-mode/run_code/todo/workflow/subagent/jobs/goal/schedule/session/ralph/skill/agent-team/cordis/web/lsp 等）描述精简到目标：多数 ≤200 字符，行为事实需要时可放宽
- [ ] 每个精简后的描述仍准确表达语义，模型在缺少被删文本时能正确选择和使用该工具
- [ ] 行为、schema、参数、执行路径完全不变——只改描述文本
- [ ] 该族相关测试与文档（含断言描述文本的测试）同步更新，CI 绿

## 评论
