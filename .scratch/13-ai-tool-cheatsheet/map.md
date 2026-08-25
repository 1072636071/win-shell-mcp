# 13-ai-tool-cheatsheet — map

> 工单拆解上下文指针与已做决策。对应 PRD：`.scratch/13-ai-tool-cheatsheet/PRD.md`（来源 PRD-07 优化点 P1-3，优先级 P1）。

## 目标

新建 `docs/ai-tool-cheatsheet.md`：一张约 59 行的极简速查表（正名｜一句话用途｜关键参数｜别名），按 CONTEXT.md 的 15 命令域分节，meta 工具单列一节，末尾环境变量小节；AGENTS.md 与 CODEBUDDY.md（逐字一致）指向速查表；护栏测试把速查表结构与 registry 对账防漂移；README 补 `batch_run` 行（58→59）并链接速查表。

## 关键决策

- **分节用 15 命令域，非 README 17 分组**：README 把 fs 拆只读/变更、find 单列；CONTEXT.md 的 15 域（system/fs/text/search/process/shell_exec/env/net/pkg/git/core/run_command/archive/hash/json）里 fs 合一、find 归 search、cat 归 text。速查表与 11 号工单的 `domain` 元数据及 `tool_groups` 域概览共用这一套词汇。
- **四列表格**：正名｜一句话用途｜关键参数｜别名。一句话用途**人工措辞**，以精简后 description 为底稿但不逐字绑定；关键参数只列高频/有坑字段（含默认与边界），非全量 schema 复述。
- **meta 单列一节**：`batch_run`（现有）；11 号落地后 `tool_groups`/`list_domain_tools` 同节。
- **环境变量小节**：初版 `WIN_SHELL_TOOLS`（12 号）；`WIN_SHELL_LAZY`（11 号）、`WIN_SHELL_TRUNCATE`（15 号）随落地逐个补齐，各标注所属工单。
- **护栏只锁结构**：正名集合、别名集合、域节标题、行数四组事实与 registry 对账；不锁措辞（人会演化措辞）。
- **不做生成器**：速查表人工维护，一句话用途需要人写，全量生成带来措辞噪音（PRD 实现决策 6）。

## 涉及文件

- `docs/ai-tool-cheatsheet.md`（新建）：速查表本体
- `tests/tools/guard-cheatsheet.test.ts`（新建）：解析速查表并对账 registry，沿用 `guard-mutating.test.ts` 全集遍历模式
- `AGENTS.md` / `CODEBUDDY.md`：逐字一致追加指向速查表的引用
- `README.md`：工具清单补 `batch_run` 行（58→59）、清单节开头加链接
- 只读基准：`src/registry.ts` 的 `builtinTools`（frozen 快照）、`CONTEXT.md` 术语表（15 域）

## 实施顺序

01（速查表本体）→ 02（护栏对账）→ 03（引用接入 + README）。02、03 均阻塞于 01（需速查表文件存在）；02、03 相互独立。跨目录时序：08（删除清单）、14（别名）未落地时，01 先按现状起草并在工单标注待回校点。

## 超出范围

- 不重构 README（只补 `batch_run` 行与一条链接，其余不动）
- 不做英文版速查表（另立工单）
- 不做速查表自动生成脚本（已否决，见 PRD 实现决策 6）
- 不在速查表写使用教程/示例编排（16 号工单 batch 预设的领地）
- 不追加 AGENTS/CODEBUDDY 一致性护栏测试（PRD 测试决策 4 默认不加，避免测试面扩散）

## 评论

（对话历史与补充追加于此，新内容置于最前。）
