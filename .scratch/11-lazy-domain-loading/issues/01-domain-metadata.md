# 域元数据升级：Tool.domain 字段 + 59 工具归域 + 护栏

**Status:** ready-for-agent

**Blocked by:** 无——可立即开始

**构建内容：** 每个工具现在都声明自己所属的命令域（15 域之一）。域从注释里的"共识"升格为工具元数据里的强制字段，成为域的单一事实源。维护者在 registry 里新增或移动工具时必须显式给出所属域，违背归属或遗漏即测试失败。`tool_groups`（03 号工单）与懒加载的域概览（04 号工单）都直接消费这个字段，因此本工单是整批懒加载机制的地基。

**验收标准：**

- [ ] `Tool` 接口新增必填 `domain` 字段，类型为「15 命令域 | `"meta"`」联合（meta 名额供编排/导航类工具使用，不占域名额）；命令工具取值为 CONTEXT.md 的 15 命令域枚举之一：`system` / `fs` / `text` / `search` / `process` / `shell_exec` / `env` / `net` / `pkg` / `git` / `core` / `run_command` / `archive` / `hash` / `json`
- [ ] 全部 59 个内置工具均显式声明 `domain`，按 CONTEXT.md 现状基线归域（如 `fs_list`/`fs_write` 等归 `fs`，`cat`/`text_*` 归 `text`，`find` 归 `search`，`batch_run` 标记 meta 不占域名额）
- [ ] `registry.ts` 中既有的注释分组退役或改写为该字段一致：现状注释把 fs 拆成 `fs_read`/`fs_write` 两个分组、且 `fs_du`/`find`/`cat`/`ping`/`hash_file`/`json_get`/`net_listen`/`net_download`/`archive_*` 散落各处——全部收敛到 15 域字段值；如保留注释仅作可读性分组，注释域名必须与 `domain` 字段值一致，不得出现注释域名不在 15 域枚举内
- [ ] 新增护栏测试（沿用 `guard-mutating.test.ts` 的全量遍历模式），至少断言：每个工具 `domain` 非空且在 15 域枚举内；15 个域每个至少一个工具；域计数总和 + 现存 meta 工具数 = 内置工具总数（本工单时点 58 域 + `batch_run` 1 meta = 59；03 号落地时抬到 58 + 3 = 61，算术依据 PRD 测试决策 4）；CONTEXT.md 基线数（15 域）作为常量写入护栏并注释来源，基线更新时须同步改
- [ ] 全量模式行为回归：默认（不设任何环境变量）`listTools()` 输出与现状一致，本工单不改任何工具暴露面
- [ ] 既有测试（`guard-mutating.test.ts` 的 outputSchema/readOnlyHint 断言、`tests/integration/server.test.ts` 的 `EXPECTED_TOOL_COUNT = 59`）不受影响、继续通过

## 评论

（评论与对话历史追加于此，新内容置于最前。）

- **实施完成（eng-alpha，2026-08-26）**：①`src/registry.ts` 新增导出常量 `COMMAND_DOMAINS`（15 域枚举值清单，代码侧单一事实源）与 `ToolDomain` 类型（15 域 | `"meta"` 联合），`Tool` 接口新增必填 `domain` 字段；②全部 59 个内置工具显式声明 `domain`；③registry 注册区注释改写为与字段一致（fs_read/fs_write 两级注释退役为 fs 域、散落工具逐一标注归属），**注册顺序未动**——server 层 `listTools()` 输出顺序保持现状基线，验收第 5 条成立；④新增 `tests/tools/guard-domain.test.ts`（124 断言：每工具 domain 非空且在「15 域 | meta」枚举内、15 域每域 ≥1 工具、"meta" 不占域名额、域计数总和 58 + 现存 meta 1 = 总数 59 守恒、batch_run=meta；锚点常量 `EXPECTED_DOMAIN_COUNT=15`/`EXPECTED_TOTAL_TOOLS=59` 均注明来源与抬升时机）；⑤测试 stub 补域值（tests/registry.test.ts、tests/server.test.ts ×4）。验证：`pnpm typecheck && pnpm test` 全绿（38 文件 / 1695 通过 / 2 跳过，跳过为 fs_write 既有 skip）；guard-mutating（241）、integration/server（EXPECTED_TOOL_COUNT=59）均不受影响。禁改面核查：未动 `src/plugin.ts` 与 CHANGELOG，未执行 git commit。
- **归域裁决：`find` → `search`（确认）**：理由——①语义上 find 是"按文件名模式递归发现文件"，输出是搜索结果集；fs 域工具（read/write/list/stat/du/mkdir/rm/cp/mv/touch）都是对调用方已给定路径的单点操作，而 find 遍历未知目录树做模式发现，与 search_glob（非递归文件名匹配）/search_content 同质；②PRD 示例明确裁决 search；③源码模块名 `fs_find.ts` 及别名 `fs_find` 属历史命名遗留（正名恒为 `find`，见 CONTEXT.md 正名/别名条目），命名不构成归属依据。护栏以最终声明 `domain: "search"` 为准。
- **基线核对结论**：CONTEXT.md 现行文本已是「15 个命令域、59 个工具」（现状基线节 + 术语表「命令域」条），与本工单护栏锚点一致，无需修改 CONTEXT.md；下方「基线矛盾记录」所述 58 已由其上方复核评论更正为 ADR-0011 标题的历史遗留，本工单未据此改动任何文档。

- 归域裁决提示：`find` 按本 PRD 示例归 `search` 域——但其源码模块名为 `fs_find.ts` 且与 `search_glob` 存在语义重叠；实施时确认该归属并在评论区记录理由，护栏测试以最终声明为准。
- 复核（审视）：护栏算术错误——验收第 4 条「域计数总和 + 3 个 meta = 59」不成立。本工单先于 03 落地，彼时 meta 仅 `batch_run` 一个，正确式为 58 域工具 + 1 meta = 59；03 落地后才是 58 + 3 = 61（PRD 测试决策 4 的算术无误）。照现文执行会强令域和 = 56、护栏必然失败。建议改为：锚定总数常量（现阶段 59），断言「域计数总和 + 现存 meta 数 = 总数」，03 落地时抬到 61。
- 复核（审视）：`domain` 字段类型须为「15 域 | `"meta"`」联合而非仅 15 域——`batch_run` 本属 59 内置之一且须标 meta，与验收第 1 条「取值为 15 域之一」自相矛盾，措辞需放宽。
- 复核（审视）：下方「基线矛盾记录」已过时——CONTEXT.md 现行文本已是「15 个命令域、59 个工具」，无需修正；写 58 的是 ADR-0011 标题（成文早于工具数增长）。实施时勿据此去"修"不存在的 CONTEXT.md 差异。
- 基线矛盾记录：CONTEXT.md 现状基线写"58 个工具"，而 registry 注释、`guard-mutating.test.ts`、`tests/integration/server.test.ts` 实测均为 59。本工单护栏以 registry 实测 59 为锚；实施时应顺带核对并更新 CONTEXT.md 基线（58→59），或在 map 中说明该差异已过时。
