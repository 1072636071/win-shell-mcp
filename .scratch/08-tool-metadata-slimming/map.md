# Map — 08-tool-metadata-slimming

来源：PRD（`.scratch/08-tool-metadata-slimming/PRD.md`，来源 PRD-07 优化点 P0-1）。关联 10 号（batch_run 引导，合并实施）、13 号（AI 速查表承接删除细节）。

## 决策指针

- **裁决依据**：ADR-0016——本批次落实链第 4 项（输入 token 最少）；≤150 字符软上限不得伤害链第 1 项（轮速最少：过简致误选工具、多走一轮），工单 03 判别评审即此护栏。
- 目标：`JSON.stringify(listTools())` 总量较基线降 ≥30%；单条 description ≤150 字符软上限（例外清单显式声明）。
- 书写原则：description = 一句话用途（含 ≈ Unix 类比）+ 关键约束/默认值/陷阱；字段级 `.describe()` 只留字段名与类型表达不了的语义。
- `batch_run` 描述与 10 号引导合并为同一次编辑（并入工单 02），避免同一文本两轮变更。
- 删除清单交接 13 号速查表；本批次只做减法，不新建文档。
- 事实修正：58→59、`batch_run` 操作符 9→10。
- seam：`src/server.ts` 的 `listTools()`；护栏测试沿用 `guard-mutating.test.ts` 全集遍历先例。
- 风险对策：预算护栏防膨胀，判别评审（工单 03）兜底"过简导致误选"。

## 工单与阻塞

| # | 工单 | 状态 | 阻塞于 |
|---|------|------|--------|
| 01 | metadata-budget-guard-and-fact-fixes | ready-for-agent | 无 |
| 02 | slim-descriptions-and-field-describes | ready-for-agent | 01 |
| 03 | confusable-pairs-discrimination-review | ready-for-agent | 02 |

进度：待实现。
