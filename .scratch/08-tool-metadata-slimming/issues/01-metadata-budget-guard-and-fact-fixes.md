# 元数据护栏测试框架与事实修正

**Status:** ready-for-agent

**Blocked by:** 无——可立即开始

**构建内容：** 仓库有了一条固定的元数据预算护栏测试（每个 description 非空且 ≤150 字符软上限、`JSON.stringify(listTools())` 总量 ≤ 预算常量、例外清单显式声明），先以实测现状基线为常量保持绿，作为后续精简工单不回弹的防漂移防线；同时 58→59 的过期计数与 `batch_run`"9 种操作符"→10 的事实错误全部修正，仓库口径一致。

**验收标准：**

- [ ] 新增护栏测试 `tests/tools/guard-metadata-budget.test.ts`（沿用 `guard-mutating.test.ts` 的全集遍历护栏先例），断言：
  - [ ] 每个工具的 description 非空且长度 ≤150 字符（软上限）；确需保留长陷阱语义的工具（如 `text_grep`）在显式例外清单中声明
  - [ ] `JSON.stringify(listTools())` 总量 ≤ 预算常量；预算常量先取实测现状基线（数值写入测试常量并注明测量日期），保持当前绿
- [ ] 基线数值实测：实现时运行 `JSON.stringify(listTools())` 记录精简前总字符数，并记录到本工单评论区，供 02 号收紧
- [ ] 事实修正：`server.ts`、`registry.ts`、`tests/integration/server.test.ts` 顶部标题中的"58 个工具"改为 59；`batch_run` description 中"9 种操作符"改为 10 种（op 枚举全列）
- [ ] 全量 `npm test` 保持绿（本工单不改行为，护栏自身满足预算即绿）

## 评论

（基线数值、例外清单决策、后续收紧记录追加于此，新内容置于最前。）
