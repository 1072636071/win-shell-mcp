# DSH 工具描述精简：编排/协作族

**Status:** resolved

**Blocked by:** 无——可立即开始

**构建内容：** 在 deepseek-harness 仓库，将 DSH 的编排/协作类工具描述精简为"最短可准确表达语义、AI 能看懂"的形式。实施后这些工具的描述大幅缩短（含最长的工作流/待办/subagent 等），语义与行为事实保留。

**验收标准：**

- [x] 编排/协作族工具（ask-user/plan-mode/run_code/todo/workflow/subagent/jobs/goal/schedule/session/ralph/skill/agent-team/cordis/web/lsp 等）描述精简到目标：多数 ≤200 字符，行为事实需要时可放宽
- [x] 每个精简后的描述仍准确表达语义，模型在缺少被删文本时能正确选择和使用该工具
- [x] 行为、schema、参数、执行路径完全不变——只改描述文本
- [x] 该族相关测试与文档（含断言描述文本的测试）同步更新，CI 绿

## 答案

已在 deepseek-harness 仓库（branch `jiangxiao`）实现并提交：

- **源码精简（15 个包）**：`ask_user_question`、`run_code`、`exit_plan_mode`、`todo_write`、`workflow`、`ralph`、`subagent`（独立/继承双分支 + 后台调度后缀）、`subagent-control`（`interrupt_agent`/`list_agents`/`send_message`）、`subagent-report`（`report`）、`tool-jobs`（`job_output`）、`tool-goal`（`create_goal`/`get_goal`/`update_goal`）、`schedule`（`schedule_create`/`delete`/`list`）、`tool-agent-team`（`wait_agent`）、以及 `tool-cordis`（全部七工具）。多数压入 ≤200 字符；含不可约行为事实的工具（`workflow`、`list_agents`、`cordis_*` 等）按 spec 放宽。`session`/`skill`/`web`/`lsp` 本就 ≤200 未动。只改 description 文本，schema/参数/行为/执行路径零改动。
- **生成/快照同步**：`docs/tool-catalog.md`(+`.zh.md`) 重生成并重录 i18n 对；acp-agent 20 个 pin sidecar（tool-schemas/system-prompt）经 keyless `test:snapshot:refresh` 刷新（session.jsonl 的环境性 WSL/SQLite 噪音已回滚，仅保留纯 description 差异）。
- **测试**：受影响的 15 包 tsc 无错、oxlint 0 警告、vitest 全绿（1590 通过）；断言的描述子串（`does not see this conversation`、`worker reports completion`、`BODY of an`、`Keep AT MOST ONE todo` 等）全部保留，无测试改动。verify-tool-catalog、verify-agent-note-format、translation-pairing（tool-catalog + 新 note）通过。
- **Agent Note**：`.agents/notes/implemented/simplification/2026-08-27-concise-orchestration-collab-descriptions.md`(+`.zh.md`+`.i18n.yaml`)。
- **审查**：`/jxx-code-review` 双轴审查通过（无硬性违规、无 scope creep）；修复两处酌情发现——workflow `agent` 钩子补回"provider/model 可单独提供其一"事实、`cordis_stop` 双空格排版。修复后重跑全绿。

注意：本机（Windows）`verify-translation-pairing` 全库扫描报 `docs/自定义插件/README.md` 缺中文对——该文件本次未改、非本工单范围，为仓库既有偏差。acp-agent replay 的 5 个失败仍为环境性（WSL `/bin/bash` 缺失、SQLite Node warning），非描述相关。win-shell-mcp 侧另见 `docs/memorial/007-dsh-minimal-alignment/` 与 PRD。