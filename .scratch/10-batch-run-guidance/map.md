# 10-batch-run-guidance — map

> 工单拆解上下文指针与已做决策。对应 PRD：`.scratch/10-batch-run-guidance/PRD.md`（来源 07 源点 P0-3）。

## 目标

重写 `batch_run` 的 description 为四段式主动引导（引导 / 场景 / 机制要点 / 输出预期），使多步任务的 AI 在规划阶段就选对工具形态、减少多轮往返，从而兑现 batch_run 省 token 的前提。核心是**只改 description 文本**，不动 handler/schema/annotations。

## 关键决策

- **四段式描述结构**：引导（多步优先一次完成）→ 场景（读文件→grep→替换→写回）→ 机制要点（steps 串行短路、10 种断言操作符、引用语法）→ 输出预期（默认极简、详情 verbose）。压进 08 号工单的预算护栏（单条 ≤ 150 字符软上限，总量 ≤ 预算常量）。
- **与 08 号工单合并为同一次编辑**：`batch_run` 的 description 只改这一次，引导语与精简一次成型（08 PRD 决策 6 / 10 PRD 决策 2 双向约定）。实施顺序：本工单跟随 08。
- **事实核对清单**（改写时逐项对照实现）：断言操作符恰为 10 种；引用模式为 `{{stepId.output.path}}` 整串单引用保原类型；短路覆盖四类失败；默认输出形态以 09 号落地后为准。
- **字段命名注意**：PRD 字面写 `{ ok, summary }`，但契约层 `ok` 已被占用（ADR-0003），聚合判定用 `allOk`；描述应写 `{ allOk, summary }`（详见工单 01 评论）。
- **只改描述、不做预设本体**：16 号工单的 batch 预设文档只预留指针（`docs/batch-presets/`），不创建本体。

## 涉及文件

- `src/tools/batch.ts`：`batchRunTool.description`（改写文本；handler/schema/annotations 不动）
- `tests/tools/guard-metadata-budget.test.ts`：追加引导语义断言（工单 02，与 08 号元数据护栏同址）；08 号工单完成精简后 `batch_run` 从例外清单 `OVER_SOFT_CAP` 移除
- `CHANGELOG.md`：Unreleased 段 ⚠️ Changed 条目（如 08 号工单未覆盖）

## 实施顺序

01（重写 description，并入 08 同次编辑）→ 02（护栏断言，跟随 01 落地后运行）。01 阻塞 02；两者均以 08 号工单落地为前提（合并编辑 / 护栏同址）。

## 超出范围

- 不在其他工具描述里交叉推荐 `batch_run`（一处引导足够）
- 不做 batch 预设文档本体（16 号工单负责，本工单只预留指针）
- 不做运行时的使用统计/提示（server 不观察 AI 行为）
- 不改断言操作符、引用语法、短路语义、handler 行为（ADR-0015 机制面冻结）

## 评论

（对话历史与补充追加于此，新内容置于最前。）
