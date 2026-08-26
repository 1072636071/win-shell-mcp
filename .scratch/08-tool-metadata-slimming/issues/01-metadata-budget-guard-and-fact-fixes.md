# 元数据护栏测试框架与事实修正

**Status:** completed

**Blocked by:** 无——可立即开始

**构建内容：** 仓库有了一条固定的元数据预算护栏测试（每个 description 非空且 ≤150 字符软上限、`JSON.stringify(listTools())` 总量 ≤ 预算常量、例外清单显式声明），先以实测现状基线为常量保持绿，作为后续精简工单不回弹的防漂移防线；同时 58→59 的过期计数与 `batch_run`"9 种操作符"→10 的事实错误全部修正，仓库口径一致。

**验收标准：**

- [x] 新增护栏测试 `tests/tools/guard-metadata-budget.test.ts`（沿用 `guard-mutating.test.ts` 的全集遍历护栏先例），断言：
  - [x] 每个工具的 description 非空且长度 ≤150 字符（软上限）；确需保留长陷阱语义的工具（如 `text_grep`）在显式例外清单中声明 —— **结果**：120 断言全绿
  - [x] `JSON.stringify(listTools())` 总量 ≤ 预算常量；预算常量先取实测现状基线（数值写入测试常量并注明测量日期），保持当前绿 —— **结果**：基线常量 56277
- [x] 基线数值实测：实现时运行 `JSON.stringify(listTools())` 记录精简前总字符数，并记录到本工单评论区，供 02 号收紧 —— **结果**：56277 字符（已记录评论区，02 号收紧目标 39393）
- [x] 事实修正：`server.ts`、`registry.ts`、`tests/integration/server.test.ts` 顶部标题中的"58 个工具"改为 59；`batch_run` description 中"9 种操作符"改为 10 种（op 枚举全列） —— **结果**：9 处文件 58→59，batch_run 注释 9→10 全部修正
- [x] 全量 `npm test` 保持绿（本工单不改行为，护栏自身满足预算即绿） —— **结果**：1533 passed | 2 skipped

## 评论

- **2026-08-26 基线实测**：精简前 `JSON.stringify(listTools())` = **56277** 字符（护栏测试运行中实测）。02 号收紧目标 = 56277 × 0.7 = **≤39393**。
- **2026-08-26 事实修正完成**：src/server.ts、src/registry.ts、src/plugin.ts、tests/server.test.ts、tests/plugin.test.ts、tests/plugin-integration.test.ts、tests/integration/server.test.ts、tests/tools/guard-mutating.test.ts、CONTEXT.md 中"58 个工具"全部改为 59；tests/tools/batch.test.ts 注释"9 种操作符"改为 10（batch.ts 代码本身已为 10 种）。
- **2026-08-26 护栏落地**：`tests/tools/guard-metadata-budget.test.ts`（120 断言）——description 非空 + ≤150 字符软上限 + 豁免清单（text_grep/batch_run/text_replace/search_content/process_kill/net_post/ping，7 个）+ 防死豁免断言 + 总量预算 56277。
- **2026-08-26 豁免清单决策**：text_grep/batch_run 为确有长陷阱语义的工具豁免；text_replace/search_content/process_kill/net_post/ping 为当前超限、待 02 号精简后移除。
