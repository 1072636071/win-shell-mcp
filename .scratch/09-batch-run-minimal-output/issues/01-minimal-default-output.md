# batch_run 默认输出极简 + failedStep + verbose

**Status:** resolved

**Blocked by:** 无——可立即开始

**构建内容：** 批量编排的 AI 调用 `batch_run` 时，默认只收到聚合结论——成功时 `{ allOk: true, summary: "全部 N 步成功" }`，失败时附上失败步骤的诊断 `failedStep`（含失败归因），不再把每一步完整 `data` 全数送回上下文，使多步操作的输出 token 与单步同量级。需要逐步排查时显式传 `verbose: true` 才拿回现有的完整 `steps` 数组。

**验收标准：**

- [x] `batchRunInputSchema` 增加可选字段 `verbose: z.boolean().optional()`，语义"若为 true，返回每步完整结果"；`steps` 输入语义不变
- [x] 默认输出（`verbose` 非 true）不再含 `steps` 字段：全部成功仅 `{ allOk: true, summary: "全部 N 步成功" }`
- [x] 默认失败输出为 `{ allOk: false, summary: "第 N 步失败: CODE: message" | "第 N 步断言失败: …", failedStep }`；`failedStep` 即现有 `executed` 数组中失败那条（短路下即最后一条），结构与现有 `steps` 条目同形 `{ id, tool, ok: false, data?, error?, assert? }`；断言失败保留 `assert` 逐条归因
- [x] `verbose: true` 时输出维持现形态 `{ allOk, steps: [...], summary }` 完全不变（含成功步骤完整 `data`）
- [x] 外层 `allOk` 语义不变：仅当所有执行步骤成功且断言通过为 true；字段名保留 `allOk`（契约层 ADR-0003 占用 `ok`，沿用 06 号 PRD 修订基线，避免 isOk/isFail 误判）
- [x] 步骤输出缓存与引用解析逻辑不动：默认极简只影响最终返回，`{{stepId.output.path}}` 引用链在默认模式下照常工作
- [x] `batchRunOutputSchema` 更新为超集 `{ allOk, summary, steps?, failedStep? }`，`steps`/`failedStep` 均 optional，子结构复用现有 `batchStepOutputSchema`/`batchAssertOutputSchema`；护栏（outputSchema 必填）继续成立

## 评论

（评论与对话历史追加于此，新内容置于最前。）

**实施记录（2026-08-26）**：

- `batchRunInputSchema` 增 `verbose: z.boolean().optional()`（含 describe）；handler 以 `raw.verbose === true` 判定——仅显式 true 走完整模式，省略/false 均为极简默认。
- 输出构造复用契约层既有 `withVerbose(minimal, full, verbose)`：成功 `{ allOk, summary }`；失败附 `failedStep = executed[最后一条]`（与 steps 条目同形，断言失败时保留逐条归因）。
- `stepOutputs` 缓存、`resolveValue` 引用解析零改动——极简只作用于最终返回。
- 验收测试：`tests/tools/batch.test.ts`「batch_run 输出极简（工单 09）」7 例，红→绿流程（先钉默认形态失败，再实现转绿）。
