# batch_run 骨架

**Status:** resolved

> 2026-08-25：已实现（注册 59 工具、串行执行、未知工具归因、短路），并经双向审查闭环。

**Blocked by:** 无——可立即开始

**构建内容：** LLM 可通过一次 `batch_run` 调用串行执行多个现有工具。入参 `steps: [{ id?, tool, args, assert? }]`；`id` 缺省为 `step<N>`（1-indexed）。本工单不含断言与引用，`assert` 字段可接收但暂按"只要求成功"处理。

**验收标准：**

- [ ] `batch_run` 在 registry 注册（工具数 58 → 59），可被 `callTool("batch_run", ...)` 调用
- [ ] 步骤按数组顺序串行执行；未知工具名该步返回失败但不抛异常
- [ ] 返回 `{ allOk, steps: [{ id, tool, ok, data?, error? }], summary }`；`allOk` 仅当所有步骤成功（字段名由草案 `ok` 调整为 `allOk`，因契约层 ADR-0003 占用 `ok`，见 PRD 修订说明）
- [ ] 一次调用跑通两个独立只读工具（如 `pwd` + `fs_list`）返回两者结果

## 评论
