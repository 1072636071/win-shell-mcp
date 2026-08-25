# batch_run 默认输出极简 + failedStep + verbose

**Status:** ready-for-agent

**Blocked by:** 无——可立即开始

**构建内容：** 批量编排的 AI 调用 `batch_run` 时，默认只收到聚合结论——成功时 `{ allOk: true, summary: "全部 N 步成功" }`，失败时附上失败步骤的诊断 `failedStep`（含失败归因），不再把每一步完整 `data` 全数送回上下文，使多步操作的输出 token 与单步同量级。需要逐步排查时显式传 `verbose: true` 才拿回现有的完整 `steps` 数组。

**验收标准：**

- [ ] `batchRunInputSchema` 增加可选字段 `verbose: z.boolean().optional()`，语义"若为 true，返回每步完整结果"；`steps` 输入语义不变
- [ ] 默认输出（`verbose` 非 true）不再含 `steps` 字段：全部成功仅 `{ allOk: true, summary: "全部 N 步成功" }`
- [ ] 默认失败输出为 `{ allOk: false, summary: "第 N 步失败: CODE: message" | "第 N 步断言失败: …", failedStep }`；`failedStep` 即现有 `executed` 数组中失败那条（短路下即最后一条），结构与现有 `steps` 条目同形 `{ id, tool, ok: false, data?, error?, assert? }`；断言失败保留 `assert` 逐条归因
- [ ] `verbose: true` 时输出维持现形态 `{ allOk, steps: [...], summary }` 完全不变（含成功步骤完整 `data`）
- [ ] 外层 `allOk` 语义不变：仅当所有执行步骤成功且断言通过为 true；字段名保留 `allOk`（契约层 ADR-0003 占用 `ok`，沿用 06 号 PRD 修订基线，避免 isOk/isFail 误判）
- [ ] 步骤输出缓存与引用解析逻辑不动：默认极简只影响最终返回，`{{stepId.output.path}}` 引用链在默认模式下照常工作
- [ ] `batchRunOutputSchema` 更新为超集 `{ allOk, summary, steps?, failedStep? }`，`steps`/`failedStep` 均 optional，子结构复用现有 `batchStepOutputSchema`/`batchAssertOutputSchema`；护栏（outputSchema 必填）继续成立

## 评论

（评论与对话历史追加于此，新内容置于最前。）
