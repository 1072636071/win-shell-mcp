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

### 实施记录（2026-08-26）

- 新建 `tests/tools/guard-cheatsheet.test.ts`，沿用 guard-mutating.test.ts 全集遍历模式。
- **解析**：`readFileSync` 读 `docs/ai-tool-cheatsheet.md`，逐行解析 `## <title>` 节标题与 `| ... |` 表格行；仅解析 15 域 + meta 节下表格，跳过环境变量节（列语义不同）；跳过表头行（`正名`）与分隔行（`---`）；别名列 `—` 解析为空数组，否则按逗号分割去反引号。
- **断言**（6 个结构 + 61 个别名对账 = 67 个测试，全绿）：
  - 域节标题集合 == 15 命令域 + meta（`new Set(sections) === DOMAIN_SECTIONS`，DOMAIN_SECTIONS 从 registry 导出的 COMMAND_DOMAINS 派生）
  - 域节标题无重复（恰好 16 个）
  - 表格行数 == builtinTools.length（61）
  - 正名集合 == registry 正名集合（双向包含）
  - 速查表内正名无重复
  - 每行别名列 == 该工具 registry aliases（逐行 sort 后 deep equal，61 个测试）
- **不锁措辞**：不断言一句话用途/关键参数列内容，放行人工措辞演化（01 号决策的测试侧落地）。
- **typecheck** 通过（`noUncheckedIndexedAccess: true` 下用非空断言处理 cells 索引）；全量 `npx vitest run` 42 文件 1879 passed | 2 skipped，既有测试不受影响。
- **对账基准**：registry builtinTools 快照（frozen），与本工单无耦合；14 号落地新别名后本护栏自动校验速查表别名列是否同步；11 号若扩充 meta 集合需同步更新 DOMAIN_SECTIONS 与 01 号 meta 节。

（护栏断言细节迭代、与 01/11/14 的对账口径确认追加于此，新内容置于最前。）
