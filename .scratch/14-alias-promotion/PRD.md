# PRD / Spec — 别名机制修复、扩充与宣传

Status: ready-for-agent
日期：2026-08-25
来源：PRD-07（`.scratch/07-token-optimization/PRD.md`）优化点 P2-1
优先级：P2
关联：ADR-0001（命名策略：Unix 短名 + 语义化别名）、ADR-0011（别名保留给 MCP 侧）

## 问题陈述

别名机制有三层问题，调查确认：

1. **名不副实**：registry 注释声称"tools/call 可通过别名调用"，但 MCP 的 `CallTool` 分发按正名精确匹配，别名只在 `batch_run` 内部步骤解析（`findTool`）中生效。AI 若看到别名后在 MCP 调用里用 `ls`，会收到 `Unknown tool: ls`。宣传别名之前必须先修复，否则是把坏特性写进文档。
2. **覆盖不全**：高频变更类工具仍是长正名——`fs_rm`/`fs_cp`/`fs_mv`/`text_grep`/`text_wc`/`system_disk`/`process_list` 没有 Unix 短别名，AI 每次调用为全名多付输出 token（工具名出现在每次调用的请求体与响应体中）。
3. **不可见**：README 只在个别行内联提到别名（`find`/`cat`/`ping`），描述与速查表没有系统性的别名列；AI 不知道别名存在，自然每次打全名。

## 解决方案

先修后扩再宣传：把 `callTool` 的工具查找统一到既有的 `findTool`（正名优先、别名回退），消除双实现；为 7 个高频工具补充 Unix 短别名；让别名在描述、速查表、README 中系统性可见。

## 用户故事

1. 作为 AI，我想要在 MCP `tools/call` 里直接使用别名（如 `ls`、`grep`）并能成功执行，以便短名真实可用，而不只是 `batch_run` 步骤里的特例。
2. 作为 AI，我想要 `rm`/`cp`/`mv`/`grep`/`wc`/`df`/`ps` 这些 Unix 短名分别指向 `fs_rm`/`fs_cp`/`fs_mv`/`text_grep`/`text_wc`/`system_disk`/`process_list`，以便高频操作的请求体更短。
3. 作为 AI，我想要速查表每行有完整的别名列、相关工具描述中提及存在别名，以便我知道哪些短名可用，不用试错。
4. 作为 AI，我想要 `batch_run` 步骤里的别名行为保持不变，以便既有编排不受影响。
5. 作为维护者，我想要别名解析收敛到 `findTool` 一处，`callTool` 与 `batch_run` 共用，以便语义只有一份、注释与实现一致。
6. 作为维护者，我想要护栏测试断言别名全集与正名全集互不冲突（别名不得与任何正名或其他别名重名），以便新增别名不可能悄悄遮蔽正名。
7. 作为维护者，我想要别名仍不作为独立工具出现在 `ListTools` 中，以便工具清单长度不因别名膨胀（别名是调用入口，不是工具）。
8. 作为维护者，我想要 PRD-07 中"cat→text_cat"的口径错误被纠正：正名是 `cat`，`text_cat` 是别名（`ls`→`fs_list` 方向才是"别名→正名"的正确读法），以便后续文档引用不再出错。
9. 作为维护者，我想要新别名的取舍克制在真正高频的 Unix 惯用名内，以便别名表不成为第二套需要记忆的词汇表。

## 实现决策

1. **修复**：`callTool` 的工具查找从正名精确匹配改为复用 `findTool`（正名精确优先，回退别名）；同步修正 registry 中"别名可用于 tools/call"的注释，使其从虚假声明变为事实陈述。`batch_run` 的解析路径不变（本就用 `findTool`），行为对齐后两条路径语义一致。
2. **新增别名（7 个）**：`rm`→`fs_rm`、`mv`→`fs_mv`、`cp`→`fs_cp`、`grep`→`text_grep`、`wc`→`text_wc`、`df`→`system_disk`、`ps`→`process_list`。已核对：这些短名均不与现有 59 个正名或 16 组既有别名冲突。
3. **既有别名保持不变**：`ls`/`list_directory`→`fs_list`，`text_cat`→`cat`（注意正名是 `cat`），`fs_find`/`search_file`/`find_files`→`find`，`net_ping`→`ping`，`jq`→`json_get`，`sha256sum`/`md5sum`→`hash_file`，`du`→`fs_du`，`checkout`/`push`/`pull`/`clone`/`stash`→对应 git 工具，`tar_*`/`zip_*`→archive 工具，`wget`→`net_download`，`listen_ports`→`net_listen`。
4. **宣传面**：
   - 速查表（13 号工单）的别名列收录全集——以 13 的护栏对账为准；
   - 有别名工具的 description 在 08 号工单精简改写时，对高频别名以"别名：xx"一笔带过（受预算约束，不全量罗列）；
   - README 保持既有内联标注风格，补齐新别名所在行。
5. **克制的边界**：本批 7 个之后不再扩张；后续新增别名需逐个论证频次，拒绝"顺手加"。
6. **dsh 插件面**：不变——dsh 无别名概念，仅注册正名（ADR-0011）。

## 测试决策

1. **好测试的标准**：别名解析是外部行为（调用入口），只测"经某名字调用到达某工具"这一可观察事实；不测 `findTool` 的内部查找顺序。
2. **seam**：`callTool()`（既有最高层 seam）。
3. **新增用例**：
   - 修复验证：`callTool("ls", {path})`、`callTool("grep", …)`、`callTool("ps", …)` 等全部 7 个新别名与 3 个既有代表别名（`ls`/`text_cat`/`jq`）均成功到达正名工具，且结果与正名调用一致。
   - 冲突护栏：遍历断言别名全集 ∩ 正名全集 = ∅，别名全集内部无重复（沿用 `guard-mutating.test.ts` 的全集遍历模式）。
   - `ListTools` 回归：别名不出现在条目中（名单长度仍为 59）。
   - `batch_run` 回归：步骤内用别名（既有用例若有则保持绿；无用例则补一条 `tool: "ls"` 的步骤）。
4. **先例**：`tests/server.test.ts`（callTool 层断言）、`tests/tools/guard-mutating.test.ts`（全集护栏）。

## 超出范围

- 不让别名出现在 `ListTools` 条目中（保持清单长度，决策见用户故事 7）。
- 不做用户自定义别名（部署面词汇不开放，避免不可预测）。
- 不做别名的模糊纠错（如把 `dir` 猜成 `ls`）——别名是确定性映射。
- 不改任何工具的输入/输出行为。

## 补充说明

- 收益估算：每次调用在请求与响应两侧各省若干 token（工具名两处出现），高频工具累积可观；修复本身则消除了一次"文档承诺了坏行为"的信誉风险。
- 与 ADR-0001 的关系：本工单是该决策（"两者都要：短名 + 语义化别名"）的自然延续，把当时只完成一半的"别名可用"补齐。
- 风险：`callTool` 改为别名解析后，与正名同形的别名理论上可遮蔽正名——冲突护栏测试把该风险钉死为零。
- 预估工作量：2 小时。

## 评论

（待后续讨论补充）
