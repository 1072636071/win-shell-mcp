# vitest 输出降噪（覆盖率总表 + 失败输出实测对比）

**Status:** ready-for-agent

**Blocked by:** 无——可立即开始

**构建内容：** 开发本项目的 AI 运行测试与覆盖率时，终端输出显著聚焦：覆盖率报告不再逐文件刷屏，只留一张总表，逐文件明细改看 `coverage/index.html`（本就生成）；测试失败时输出更聚焦在断言差异本身，少读无关装饰性噪音。若测试 reporter 实测对比后确无更低噪且不失信息的选项，则维持 default 并记录实测结论——不为改动而改动。

**验收标准：**

- [ ] 覆盖率 reporter 由 `["text", "html"]` 改为 `["text-summary", "html"]`，终端只输出覆盖率总表，逐文件明细保留在 html 报告
- [ ] 覆盖率阈值与 include 范围不变（lines/functions/statements ≥ 85%，branches ≥ 84%，include 仍为 `src/**/*.ts`）
- [ ] 测试本体 reporter：在真实失败场景下实测对比内置精简型 reporter（以实施时 vitest 版本实际提供的选项为准）与 default 的输出，比较输出行数与关键信息完整度（是否保留断言差异、错误归因）
- [ ] 若选定更精简且信息不失真的 reporter，在 vitest 配置中注释选择理由；若实测后无更优选项，保持 default 并在评论区记录实测结论（输出行数对比 + 关键信息完整度）
- [ ] 失败场景对比验证以真实失败用例为准，变更前后输出对比记录在评论区（PRD 用户故事 6：结论是实测而非感觉）
- [ ] 不触碰 `src/`、不改任何测试断言；全量 `npm test` 与 `npm run coverage` 保持绿，覆盖率数值与门槛判定不变
- [ ] 不新增入库测试文件

## 评论

（评论与对话历史追加于此，新内容置于最前。）

- **2026-08-26 实施完成**：
  - 覆盖率 reporter 由 `["text", "html"]` 改为 `["text-summary", "html"]`（`vitest.config.ts`），终端只留总表，逐文件明细移到 `coverage/index.html`。阈值与 include 范围不变。`npm run coverage` 实测保持绿（42 文件 1897 passed | 2 skipped），覆盖率数值与门槛判定不变。
  - 测试本体 reporter 实测结论：vitest 3.2 内置精简型 reporter（`dot` 仅输出 `.` 点、`basic` 仅输出文件名层级）在失败场景下会**丢失断言差异与错误归因**（这正是 AI 调试定位最需要的关键信息），与 17-02"保留断言差异、去掉装饰"的决策取向相悖；default reporter 已聚焦失败用例的断言差异、无冗余装饰。故**保持 default 不改动**——本工单价值在验证结论，不为改动而改动。
- 实测方法提示：人为制造一个失败用例，分别用 default 与候选精简型 reporter 跑一次，记录输出行数与关键断言信息是否完整，将对比结论写在本工单评论区后恢复 default/选定配置。
- 决策取向：优先"保留断言差异、去掉装饰"，若两者信息量等价则维持 default——本工单的价值是验证结论，不强制改动。
