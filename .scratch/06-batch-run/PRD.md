# PRD — batch_run 批量编排与工具输出主动充分返回

来源：memorial 007（`docs/memorial/archived/007-tool-output-proactive-returns/`）与 ADR-0015（`docs/adr/0015-batch-run-with-assert-and-refs.md`）。

## 背景

LLM 输入 token 便宜、输出 token 贵。多次为确认结果回跑工具是浪费。目标：一次 MCP 调用内完成一串工具调用，把确定性校验（断言）前置到 server 侧，理想情况一轮解决问题。

## 范围

1. 新增 meta 工具 `batch_run`：串行执行步骤 + 断言 + 步骤间引用（58 → 59）。
2. 按"主动充分返回"原则补齐现有工具的语义完整字段（兼容性红线 ADR-0007：只加不改）。

## 决策摘要（见 memorial 007 / ADR-0015）

- 断言：`assert: [{ path, op, value? }]`，`op ∈ eq|neq|gt|gte|lt|lte|in|re|truthy|falsy`；省略 = 只要求该步成功。
- 引用：`{{stepId.output.path}}` 模板串；整串单引用保原类型，否则转字符串；仅允许引用已完成步骤。
- 短路：任一步失败或断言不满足立即中止，返回仅含已执行步骤。
- 结果：`{ ok, steps: [{ id, tool, ok, data?, error?, assert? }], summary }`，`ok` 仅当所有执行步骤均成功且断言通过。

## 验收标准

- [ ] `batch_run` 可一次调用完成多步骤串行执行并返回统一结果。
- [ ] 断言可确定性判定成功/失败并逐条归因。
- [ ] 步骤间可引用前序输出且类型正确。
- [ ] `batch_run` 通过护栏测试（显式 outputSchema 与 annotations）。
- [ ] 工具输出主动充分返回原则盘点并落地（不改既有字段）。
