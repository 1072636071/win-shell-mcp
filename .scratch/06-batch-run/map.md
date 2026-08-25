# Map — 06-batch-run

来源：memorial 007（`docs/memorial/archived/007-tool-output-proactive-returns/`）+ ADR-0015（`docs/adr/0015-batch-run-with-assert-and-refs.md`）。

## 决策指针

- 批量形态：单 meta 工具 `batch_run`，串行步骤，一次 MCP 调用。
- 断言：`[{ path, op, value? }]`，op ∈ eq|neq|gt|gte|lt|lte|in|re|truthy/falsy；省略 = 只要求成功；不满足即短路。
- 引用：`{{stepId.output.path}}`；整串单引用保原类型，否则转字符串；仅允许引用已完成步骤。
- 结果：`{ ok, steps: [{ id, tool, ok, data?, error?, assert? }], summary }`。
- 兼容性红线：05 工单只加不改（ADR-0007）。

## 工单与阻塞

| # | 工单 | 阻塞于 |
|---|------|--------|
| 01 | batch-run-skeleton | 无 |
| 02 | batch-run-assert | 01 |
| 03 | batch-run-refs | 01 |
| 04 | batch-run-guard-tests | 01, 02, 03 |
| 05 | tool-output-richness | 无 |

前沿：01、05 可立即开始；02/03 待 01；04 收尾。
