# Map — 06-batch-run

来源：memorial 007（`docs/memorial/archived/007-tool-output-proactive-returns/`）+ ADR-0015（`docs/adr/0015-batch-run-with-assert-and-refs.md`）。

## 决策指针

- 批量形态：单 meta 工具 `batch_run`，串行步骤，一次 MCP 调用。
- 断言：`[{ path, op, value? }]`，op ∈ eq|neq|gt|gte|lt|lte|in|re|truthy/falsy；省略 = 只要求成功；不满足即短路。
- 引用：`{{stepId.output.path}}`；整串单引用保原类型，否则转字符串；仅允许引用已完成步骤。
- 结果：`{ allOk, steps: [{ id, tool, ok, data?, error?, assert? }], summary }`（`allOk` 全步成功才 true；字段名由 spec 草案 `ok` 调整为 `allOk`，因契约层 ADR-0003 已占用 `ok`，见 PRD 修订说明）。
- 兼容性红线：05 工单只加不改（ADR-0007）。

## 工单与阻塞

| # | 工单 | 状态 | 阻塞于 |
|---|------|------|--------|
| 01 | batch-run-skeleton | 已解决 | 无 |
| 02 | batch-run-assert | 已解决 | 01 |
| 03 | batch-run-refs | 已解决 | 01 |
| 04 | batch-run-guard-tests | 已解决 | 01, 02, 03 |
| 05 | tool-output-richness | 已解决 | 无 |

进度：全部实现并经双向审查闭环（2026-08-25）。剩余 PRD-07 P0-2/P0-3 已拆为 07-token-optimization 独立批次。
