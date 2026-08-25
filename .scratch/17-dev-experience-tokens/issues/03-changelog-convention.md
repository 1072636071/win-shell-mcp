# CHANGELOG 维护流程约定（从 git log 提炼，不读全量 diff）

**Status:** ready-for-agent

**Blocked by:** 无——可立即开始

**构建内容：** 发版维护者在 README 开发章节获得一条明文流程约定：写 CHANGELOG 条目时从 `git log`（自上个版本起）的 commit message 汇总提炼、按 Added/Changed/Fixed 分类、补 ADR/工单交叉引用，不再回顾全量 diff。配套要求是 commit message 自带完整主题与引用（本仓库现有 commit 风格已满足，约定只是固化现状），使提炼有据可依。该约定降低每次发版的回顾成本与 token 消耗。

**验收标准：**

- [ ] README 开发章节新增一段 CHANGELOG 维护流程约定，明确：条目从 `git log`（自上个版本标签起）的 commit message 汇总提炼
- [ ] 约定写明按 Added/Changed/Fixed 分类，并为相关条目补 ADR / 工单交叉引用
- [ ] 约定明确不要求回顾全量 diff
- [ ] 约定包含配套要求：commit message 须自带完整主题与引用（ADR/工单号），确保提炼有据可依
- [ ] 该约定与现有 commit 风格一致（本仓库 commit 已自带主题与引用），作为固化不引入新负担
- [ ] 不触碰 `src/`、不改任何测试断言、不新增入库测试文件；全量 `npm test` 保持绿
- [ ] 不做 CHANGELOG 自动生成脚本（超出范围）；约定先于工具，真出现重复劳动再另立工单

## 评论

（评论与对话历史追加于此，新内容置于最前。）

- 范围边界：本工单只写"流程约定"到 README 开发章节，不实现自动生成脚本、不引入 CI。
- 现状提示：仓库当前尚无 git 版本标签；"自上个版本起"的锚点以实际可用的 commit 基线（如最近一次版本提交）为准，实施时按仓库现状灵活界定。
