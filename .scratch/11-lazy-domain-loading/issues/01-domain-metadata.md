# 域元数据升级：Tool.domain 字段 + 59 工具归域 + 护栏

**Status:** ready-for-agent

**Blocked by:** 无——可立即开始

**构建内容：** 每个工具现在都声明自己所属的命令域（15 域之一）。域从注释里的"共识"升格为工具元数据里的强制字段，成为域的单一事实源。维护者在 registry 里新增或移动工具时必须显式给出所属域，违背归属或遗漏即测试失败。`tool_groups`（03 号工单）与懒加载的域概览（04 号工单）都直接消费这个字段，因此本工单是整批懒加载机制的地基。

**验收标准：**

- [ ] `Tool` 接口新增必填 `domain` 字段，取值为 CONTEXT.md 的 15 命令域枚举之一：`system` / `fs` / `text` / `search` / `process` / `shell_exec` / `env` / `net` / `pkg` / `git` / `core` / `run_command` / `archive` / `hash` / `json`
- [ ] 全部 59 个内置工具均显式声明 `domain`，按 CONTEXT.md 现状基线归域（如 `fs_list`/`fs_write` 等归 `fs`，`cat`/`text_*` 归 `text`，`find` 归 `search`，`batch_run` 标记 meta 不占域名额）
- [ ] `registry.ts` 中既有的注释分组退役或改写为该字段一致：现状注释把 fs 拆成 `fs_read`/`fs_write` 两个分组、且 `fs_du`/`find`/`cat`/`ping`/`hash_file`/`json_get`/`net_listen`/`net_download`/`archive_*` 散落各处——全部收敛到 15 域字段值；如保留注释仅作可读性分组，注释域名必须与 `domain` 字段值一致，不得出现注释域名不在 15 域枚举内
- [ ] 新增护栏测试（沿用 `guard-mutating.test.ts` 的全量遍历模式），至少断言：每个工具 `domain` 非空且在 15 域枚举内；15 个域每个至少一个工具；域计数总和 + 3 个 meta（`tool_groups`/`list_domain_tools`/`batch_run`）= 59；CONTEXT.md 基线数（15 域）作为常量写入护栏并注释来源，基线更新时须同步改
- [ ] 全量模式行为回归：默认（不设任何环境变量）`listTools()` 输出与现状一致，本工单不改任何工具暴露面
- [ ] 既有测试（`guard-mutating.test.ts` 的 outputSchema/readOnlyHint 断言、`tests/integration/server.test.ts` 的 `EXPECTED_TOOL_COUNT = 59`）不受影响、继续通过

## 评论

（评论与对话历史追加于此，新内容置于最前。）

- 基线矛盾记录：CONTEXT.md 现状基线写"58 个工具"，而 registry 注释、`guard-mutating.test.ts`、`tests/integration/server.test.ts` 实测均为 59。本工单护栏以 registry 实测 59 为锚；实施时应顺带核对并更新 CONTEXT.md 基线（58→59），或在 map 中说明该差异已过时。
