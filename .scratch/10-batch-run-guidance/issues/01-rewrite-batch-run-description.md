# 重写 batch_run description 为四段式主动引导（并入 08 号工单同一次编辑）

**Status:** resolved

**Blocked by:** 无——可立即开始（与 08 号工单合并为同一次编辑实施，本工单跟随 08 落地）

**构建内容：** 当 AI 在 `ListTools` 里读到 `batch_run` 的描述时，第一句就被告知"多步操作请优先用 batch_run 一次完成，避免多轮往返"，并附带一个典型场景示例（读文件→grep 定位→替换→写回，一次完成）、最简机制要点（steps 串行短路、断言 10 种操作符、步骤间引用语法的最小样例），以及输出形态预期（默认极简、详情传 verbose）。这让多步任务的 AI 在规划阶段就选对工具形态，而不是跑完三轮才意识到有 batch，token 节省才能真正兑现。机制细节（引用类型保持、断言逐条归因、短路语义）外移给速查表与预设文档，描述保持精短。

**验收标准：**

- [x] description 采用四段式结构：引导（"多步操作请优先用 batch_run 一次完成，避免多轮往返"）→ 场景（如"读文件→grep 定位→替换→写回"）→ 机制要点 → 输出预期
- [x] 事实核对清单逐项对照实现并成立：断言操作符恰为 10 种（eq/neq/gt/gte/lt/lte/in/re/truthy/falsy）；引用模式为 `{{stepId.output.path}}`（整串单引用保原类型）；短路覆盖四类失败（未知工具、参数非法、handler 失败、断言不满足）
- [x] 输出预期指向默认极简形态（成功 `{ allOk, summary }`、失败附 `failedStep`、详情传 `verbose: true`），且该形态以 09 号工单落地后的为准
- [x] 机制细节外移：描述中只给最简语法样例，引用类型保持规则/断言逐条归因/短路语义指向速查表与预设文档，不为细节膨胀描述
- [x] 为 batch 预设文档预留指针（`docs/batch-presets/`，16 号工单落地后生效），但不创建该文档本体
- [x] 与 08 号工单对 `batch_run` description 的修改合并为**一次编辑**，同一文本不发生两轮变更
- [x] 改写后的 description 保持在 08 号工单的预算护栏内（单条 ≤ 150 字符软上限，或经 08 号工单移除例外清单后回到 ≤150；总量不超 08 预算常量）
- [x] 只改 description 文本：handler、inputSchema/outputSchema、annotations 均不动
- [x] 全量测试保持绿（本工单仅改文本，任何行为测试变红即说明改错）

## 评论

（评论与对话历史追加于此，新内容置于最前。）

**实施记录（2026-08-26）**：

- 最终描述（恰 150 字符，达 08 号软上限，`batch_run` 已从 `DESCRIPTION_EXCEPTIONS` 移除）：
  「多步操作优先用本工具一次完成，避免多轮往返。如读文件→替换→写回。steps串行短路；assert 10种操作符；引用{{stepId.output.path}}；模板docs/batch-presets/。默认{allOk,summary}，失败附failedStep，详情verbose:true」
- **有意取舍一**：以「本工具」自指而非字面 `batch_run`——换取完整引导句 + 全部事实要素压进 150 软上限；ListTools 中工具名与描述相邻呈现，归属无歧义。
- **有意取舍二**：场景示例省略「grep 定位」环节，保留 读文件→替换→写回 最小流程（PRD 场景为示例性"如"；护栏按最小关键词断言，grep 非必需项）。
- 事实核对逐项成立：`ASSERT_OPS` 恰 10 种；引用 `{{stepId.output.path}}` 整串单引用保原类型（有专项测试）；短路覆盖 参数引用解析失败/未知工具/参数非法/handler 失败/断言不满足；默认输出与 09 号落地形态逐字段一致。
- 08 号精简已先行落地（b771e4f/f47407c），本次为该文本的最终形态一次成型；handler/schema/annotations 未动（schema 变更属 09 号工单范围）。
- METADATA_BUDGET 因 09 号 outputSchema 超集净增长重取基线 50516（增量构成记录于护栏常量注释）；16 号预设文档本体未创建，仅留 `docs/batch-presets/` 指针。

注意：PRD 实现决策 1 的输出预期字面写 `{ ok, summary }`，但契约层 `ok` 已被占用（ADR-0003），聚合判定用 `allOk`（见 08/09 号工单决策）。描述文本应写 `{ allOk, summary }`，并以 09 号落地后形态为准。
