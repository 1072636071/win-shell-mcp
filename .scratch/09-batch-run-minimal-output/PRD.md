# PRD / Spec — batch_run 输出默认极简

Status: ready-for-agent
日期：2026-08-25
来源：PRD-07（`.scratch/07-token-optimization/PRD.md`）优化点 P0-2
优先级：P0
关联：ADR-0003（极简输出）、ADR-0015（batch_run 与断言引用）、memorial 007（主动充分返回）

## 问题陈述

`batch_run` 当前无论成败都返回全部步骤的完整输出：`{ ok, steps: [{ id, tool, ok, data?, error?, assert? }], summary }`，其中每个成功步骤的 `data` 是该工具完整输出、不做截断。批量操作的本意是省 token（一次调用替代多轮往返），但输出侧把每一步的完整数据又全数送回上下文——多步场景下输出体量甚至比逐次调用更大（还多了包装层），违背 ADR-0003 极简输出原则在批量层的延续。多数场景下，AI 只需要"成功与否 + 一句话结论"，失败时才需要失败那一步的诊断。

## 解决方案

`batch_run` 默认只返回 `{ ok, summary }`，失败时附 `failedStep`（失败步骤的诊断详情）；新增可选输入参数 `verbose: true`，显式要求时才返回现有的每步完整 `steps` 数组。`summary` 维持现有中文文案与语义。

## 用户故事

1. 作为批量编排的 AI，我想要成功时只收到 `{ ok: true, summary: "全部 3 步成功" }`，以便多步操作的输出 token 与单步操作同量级。
2. 作为 AI，我想要失败时收到失败步骤的诊断（步骤 id、工具名、错误码与消息，或断言失败的 path/op/expected/actual），以便直接决定补救动作，而不是重跑整个 batch 去猜哪步挂了。
3. 作为 AI，我想要失败诊断里不再有成功步骤的完整 data，以便失败路径的上下文开销也保持极简。
4. 作为调试复杂编排的 AI，我想要传 `verbose: true` 拿回每步完整 `steps` 数组（与现形态一致），以便逐步排查引用与断言问题。
5. 作为 AI，我想要后续步骤经 `{{stepId.output.path}}` 引用的数据在 server 内部照常流转、不受默认极简影响，以便引用链不需要任何额外参数。
6. 作为 AI，我想要 `summary` 文案与现状一致（成功："全部 N 步成功"；失败："第 N 步失败: CODE: message" / "第 N 步断言失败: …"），以便既有提示词与解析习惯不失效。
7. 作为 AI，我想要 `failedStep` 的字段结构与现有 `steps` 条目同形（`{ id, tool, ok, data?, error?, assert? }`），以便复用同一套解析逻辑。
8. 作为维护者，我想要这次输出形态变更走 ADR-0007 的 0.x 集中纠错窗口，并在 CHANGELOG 以 ⚠️ Changed（破坏性）条目记录新旧形态对照，以便下游升级有据可查。
9. 作为维护者，我想要 outputSchema 同步更新为覆盖两种模式的超集形态，以便防漂移护栏（outputSchema 必填）继续成立。
10. 作为维护者，我想要默认形态的"无 data 泄漏"被测试钉死，以便未来重构不会悄悄把完整步骤加回默认输出。

## 实现决策

1. **输入**：`batchRunInputSchema` 增加可选字段 `verbose: z.boolean().optional()`，语义"若为 true，返回每步完整结果"。`steps` 语义不变。
2. **默认输出（`verbose` 非 true）**：
   - 全部成功：`{ ok: true, summary: "全部 N 步成功" }`。
   - 任一失败：`{ ok: false, summary: "第 N 步失败: …" | "第 N 步断言失败: …", failedStep: { id, tool, ok: false, error? | assert? } }`。`failedStep` 即现有 `executed` 数组中失败的那一条（短路语义下就是最后一条），断言失败时保留 `assert` 明细与既有逐条归因。
   - 默认形态不再输出 `steps` 字段。
3. **`verbose: true` 输出**：维持现形态 `{ ok, steps: [...], summary }` 完全不变（含成功步骤的完整 `data`）。
4. **外层 `ok` 语义不变**：仅当所有步骤成功为 true（现状即 `allOk`）。
5. **内部引用不受影响**：步骤输出缓存（`stepOutputs`）逻辑不动，引用解析照旧；默认极简只影响最终返回，不影响执行。
6. **outputSchema**：改为超集——`{ ok, summary, steps?, failedStep? }`，`steps`/`failedStep` 均 optional，子结构与现有 `batchStepOutputSchema`/`batchAssertOutputSchema` 复用。
7. **CHANGELOG**：Unreleased 段新增 ⚠️ Changed（破坏性）条目，给出新旧输出对照与迁移方式（需要每步详情时加 `verbose: true`），体例对齐 `text_replace` 双模变更的既有写法。
8. **描述协同**：`batch_run` 的 description 由 08/10 号工单统一改写，本工单不改描述，只在其落地时确认其中提到"默认极简、详情用 verbose"。

## 测试决策

1. **好测试的标准**：只测外部行为——经 `callTool("batch_run", …)` 观察返回形态；不断言内部 `executed` 数组等实现细节。
2. **seam**：`src/server.ts` 的 `callTool()`（既有最高层 seam）。
3. **新增用例**（扩展既有 `tests/tools/batch.test.ts`）：
   - 默认成功：返回体含 `ok: true` 与 `summary`，且**不含** `steps`、不含任何成功步骤的 `data`。
   - 默认失败：返回体含 `failedStep`（id/tool 正确，失败归因与现有一致），不含 `steps`。
   - 断言失败的默认形态：`failedStep.assert` 含逐条归因。
   - `verbose: true`：成功与失败路径均返回完整 `steps`，与变更前行为一致（既有用例大量落在此模式，迁移为显式传 `verbose: true` 即可保住覆盖）。
   - 引用链回归：多步引用（含整串单引用保类型、混合拼接）在默认模式下照常工作。
4. **防回弹断言**：显式断言默认成功输出 `JSON.stringify` 后不包含成功步骤 data 的特征键（比字符数断言更确定）。
5. **先例**：`tests/tools/batch.test.ts`（780 行、覆盖成功/短路/断言/引用/元数据）是本工单的直接先例；`tests/contract/output.test.ts` 为形态断言先例。

## 超出范围

- 不改断言操作符、引用语法、短路语义（ADR-0015 机制面冻结）。
- 不做步骤级 `verbose`（粒度决策留待真实需求出现）。
- 不改 `batch_run` 的 description（08/10 号工单负责）。
- 不做 batch 预设文档（16 号工单负责）。

## 补充说明

- 收益估算：多步操作输出 token 降 70%+（三个只读步骤的 batch，从三份完整 data 缩到一行 summary）。
- 风险：AI 调试 batch 时默认看不到中间数据——可接受，`failedStep` 已含失败诊断，深究可用 `verbose: true`；memorial 007"主动充分返回"原则在此让位于批量层的输出成本，失败路径的诊断充分性仍由 `failedStep` 保障。
- 兼容性：破坏性变更，处于 ADR-0007 的 0.x 允许窗口；`batch_run` 于 0.2.0 首发、生态尚浅，当下是改默认值成本最低的时机。
- 预估工作量：2 小时。

## 评论

（待后续讨论补充）
