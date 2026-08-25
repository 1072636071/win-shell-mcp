# 速查表与 registry 结构对账护栏测试

**Status:** ready-for-agent

**Blocked by:** 01（需速查表文件存在才能解析）

**构建内容：** 维护者或新增/改名工具时，跑一次测试就能知道速查表是否与 registry 脱节——护栏测试解析 `docs/ai-tool-cheatsheet.md` 的全部表格行，断言正名集合、别名集合、域节标题、行数四组事实与 registry 逐一对账，任何一边漂移立即变红。仓库无 CI，漂移防线放在测试里；本工单把"速查表会过期"从隐性风险变成显式红灯。

**验收标准：**

- [ ] 新增护栏测试（沿用 `tests/tools/guard-mutating.test.ts` 的全集遍历模式）：读取并解析 `docs/ai-tool-cheatsheet.md` 的表格行
- [ ] 正名集合对账：速查表所有行的正名集合 == registry `builtinTools` 的正名集合（含 meta 工具）
- [ ] 别名对账：每行的别名列 == 该工具在 registry 中的 `aliases`；无别名的工具别名列为空标记（如 `—`），断言其值为空标记而非遗漏
- [ ] 域节标题对账：速查表域节标题集合 == 15 命令域（system/fs/text/search/process/shell_exec/env/net/pkg/git/core/run_command/archive/hash/json）+ meta 节
- [ ] 行数对账：表格总行数 == 非 meta 工具数 + meta 工具数
- [ ] 只断言结构一致性这类确定事实（集合、行数），**不**锁一句话用途的措辞（人会演化措辞）——这正是 01 号工单"人工措辞、不与 description 逐字绑定"决策的测试侧落地
- [ ] 全量 `npm test` 保持绿（其余既有测试不受影响）

**跨目录依赖：**
- 对账基准是 registry 的 `builtinTools` 快照（frozen），与本工单无耦合，独立可测
- 14 号落地新别名后，本护栏自动校验速查表别名列是否同步；若 14 后落地，别名全集断言自然收进新别名
- 11 号新增 `tool_groups`/`list_domain_tools` 后，本护栏的 meta 集合断言需相应扩充（01 号工单的 meta 节也已列上）——11 落地时同步更新本测试

## 评论

（护栏断言细节迭代、与 01/11/14 的对账口径确认追加于此，新内容置于最前。）
