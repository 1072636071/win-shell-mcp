# batch_run 骨架

**Status:** ready-for-agent

**Blocked by:** 无——可立即开始

**构建内容：** LLM 可通过一次 `batch_run` 调用串行执行多个现有工具。入参 `steps: [{ id?, tool, args, assert? }]`；`id` 缺省为 `step<N>`（1-indexed）。本工单不含断言与引用，`assert` 字段可接收但暂按"只要求成功"处理。

**验收标准：**

- [ ] `batch_run` 在 registry 注册（工具数 58 → 59），可被 `callTool("batch_run", ...)` 调用
- [ ] 步骤按数组顺序串行执行；未知工具名该步返回失败但不抛异常
- [ ] 返回 `{ ok, steps: [{ id, tool, ok, data?, error? }], summary }`；`ok` 仅当所有步骤成功
- [ ] 一次调用跑通两个独立只读工具（如 `pwd` + `fs_list`）返回两者结果

## 评论
