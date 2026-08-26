# 09-batch-run-minimal-output — map

> 工单拆解上下文指针与已做决策。对应 PRD：`.scratch/09-batch-run-minimal-output/PRD.md`（来源 07 源点 P0-2）。

## 目标

`batch_run` 输出默认极简：默认只返回 `{ allOk, summary }`，失败附加 `failedStep`；`verbose: true` 才返回完整 `steps` 数组。

## 关键决策

- **裁决依据**：ADR-0016——默认极简落实链第 3 项（输出 token 最少）；失败附加 `failedStep` 保链第 1 项（失败一轮可自纠），极简不丢判别字段。
- **聚合字段命名保留 `allOk`**：PRD 草案字面写 `ok`，但契约层 ADR-0003 已占用 `ok`（表示"batch_run 调用本身成功"）；06 号 PRD 修订已明确聚合判定用 `allOk`，07 源点确认"外层 ok 即 allOk"。沿用 `allOk`，避免 isOk/isFail 误判。默认输出 `{ allOk, summary }`，失败附加 `failedStep`。
- **字段结构**：`failedStep` 与现有 `steps` 条目同形 `{ id, tool, ok, data?, error?, assert? }`，复用同一套解析逻辑；短路下即 `executed` 最后一条。
- **outputSchema 超集**：`{ allOk, summary, steps?, failedStep? }`，子结构复用 `batchStepOutputSchema`/`batchAssertOutputSchema`。
- **内部引用不受影响**：`stepOutputs` 缓存与 `resolveValue` 逻辑不动，默认极简只影响最终返回。

## 涉及文件

- `src/tools/batch.ts`：`batchRunInputSchema`（加 `verbose`）、`batchRunOutputSchema`（改超集）、`batchRunHandler`（构造默认/verbose 两形态输出）、`batchRunTool.description`（本批次不改，08/10 号工单负责）
- `tests/tools/batch.test.ts`：迁移既有 `steps` 断言用例到 `verbose: true` + 新增默认极简/失败诊断/防回弹用例
- `CHANGELOG.md`：Unreleased 段 ⚠️ Changed 条目

## 实施顺序

01（核心行为）→ 02（测试迁移与回归）→ 03（CHANGELOG）。01 阻塞 02、03；02、03 相互独立、均阻塞于 01。

## 超出范围

- 不改断言操作符、引用语法、短路语义（ADR-0015 机制面冻结）
- 不做步骤级 `verbose`（粒度决策留待真实需求）
- 不改 `batch_run` description（08/10 号工单负责）
- 不做 batch 预设文档（16 号工单负责）

## 评论

（对话历史与补充追加于此，新内容置于最前。）

- **后续跟进（2026-08-26，提交后）**：审查相邻项经用户裁决就地修复——① handler 增非空 steps 守卫（与 inputSchema .min(1) 对齐的纵深防御，绕过 schema 直接调 handler 也返回 EINVAL）+ 直接调用守卫测试；② CODEBUDDY.md 与 AGENTS.md 字节同步（此前仅行尾符差异）。"下游需 verbose:true 的破坏性变更"核查确认在库无遗漏调用方（CHANGELOG 旧列/ADR 历史/memorial 归档中的旧形态引用均属刻意保留），无需修复。
- **已解决（2026-08-26）**：01/02/03 全部 resolved，随单 commit 落地。核心：`batchRunInputSchema` 增 `verbose`；handler 以 `withVerbose` 构造默认 `{ allOk, summary }` / 失败附 `failedStep`；outputSchema 超集 `{ allOk, summary, steps?, failedStep? }`；测试经 helper 统一迁移 verbose 模式 + 新增默认形态 7 例；CHANGELOG ⚠️ Changed 条目对齐 text_replace 体例。
- **偏差**：既有用例迁移采用共享 helper 内显式合并 `verbose: true`（非逐调用点改写），断言原样保留——见工单 02 实施记录。
- **联动**：元数据总量因 outputSchema 超集增长，护栏基线 49769→50516（与 10 号批次同批落地；基线放宽至实测值已经用户确认授权，对齐 08 号先例）。
