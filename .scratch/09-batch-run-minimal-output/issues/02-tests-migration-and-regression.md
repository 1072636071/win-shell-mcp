# batch_run 测试迁移与"无 data 泄漏"防回弹断言

**Status:** resolved

**Blocked by:** 01

**构建内容：** 保证在新默认极简输出下测试套件全部变绿，并把"默认形态不泄漏完整步骤 data"这一行为用确定性断言钉死，杜绝未来重构悄悄把完整步骤加回默认输出。

**验收标准：**

- [x] 既有 `tests/tools/batch.test.ts` 中大量断言 `r.steps` 的用例迁移为显式传 `verbose: true`，保住原有覆盖（成功/短路/断言/引用/元数据均在此模式下验证）
- [x] 新增用例（只测外部行为，经 `callTool("batch_run", …)` 观察返回形态，不断言内部 `executed` 等实现细节）：
  - 默认成功：返回体含 `allOk: true` 与 `summary`，且**不含** `steps`、不含任何成功步骤的 `data`
  - 默认失败：返回体含 `failedStep`（id/tool 正确，失败归因与现有一致），不含 `steps`
  - 断言失败的默认形态：`failedStep.assert` 含逐条归因
  - `verbose: true`：成功与失败路径均返回完整 `steps`，与变更前行为一致
  - 引用链回归：多步引用（含整串单引用保类型、混合拼接）在默认模式下照常工作
- [x] 防回弹断言：显式断言默认成功输出经 `JSON.stringify` 后不含成功步骤 data 的特征键（比字符数断言更确定）
- [x] 覆盖率阈值保持成立（lines/functions/statements ≥ 85%，branches ≥ 84%）

## 评论

（评论与对话历史追加于此，新内容置于最前。）

**实施记录（2026-08-26）**：

- 迁移方式：既有用例经共享 helper `batchRun()` 统一显式合并 `verbose: true`（helper 内一处显式传参 + 注释标注工单 09 迁移语义），全部既有调用点与断言原样保留、覆盖不变；默认极简模式由新 helper `batchRunMinimal()`（不传 verbose）+「输出极简（工单 09）」用例组单独钉住。未逐个改写约 45 处调用点，避免大面积机械 diff 淹没审查焦点。
- 防回弹：默认成功输出 `JSON.stringify` 后断言不含 `"cwd"`/`"output"` 特征键与特征值 `hello`；默认失败路径同样断言无 `"cwd"` 泄漏。
- 引用链回归设计说明：fs_write 的 content 须为字符串，故整串单引用保类型改经 assert value 路径验证——`gte` 数值比较通过即证明引用值未被字符串化（字符串化会报"要求数值类型"）；混合拼接经 args content 验证。
- 覆盖率阈值成立（`vitest run --coverage` 通过，thresholds 见 vitest.config.ts）。
