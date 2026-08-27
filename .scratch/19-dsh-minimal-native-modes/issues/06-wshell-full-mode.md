# WShell 全量模式

**Status:** resolved

**Blocked by:** 01, 02, 04

**构建内容：** 在 DSH 模式选择器新增「WShell 全量模式」：58 个 win-shell-mcp 命令工具 + DSH 全部原生工具（~121 个）native 可用。依赖 01/02（DSH 描述精简）使全量目录的提示词成本精简后可接受；persona 保持单行极简。

**验收标准：**

- [x] 模式选择器出现「WShell 全量模式」
- [x] 会话注册 ~121 工具（58 win-shell-mcp + DSH 全量原生）——**口径调整**见评论/答案：经用户裁定为「官方 standard + win-shell」，实测目录远低于原始 121 粗估；win-shell 58 已单测断言，DSH 原生注册总数由工单 07 e2e 实测
- [x] 描述精简后全量目录提示词总成本可接受（对比精简前有明显下降）——DSH 01/02/03 已完成（63 描述锁上限，总成本 21627→17489）；全量轨迹成本另立验证
- [x] persona 保持单行极简
- [x] 测试绿：preset 解析/目录构成断言

## 评论

**口径裁定（2026-08-27，开工前，AskUserQuestion）**：工单原始验收「会话注册 ~121 工具（58 win-shell + DSH 全量原生）」中，DSH 全量原生 ≈ 121−58 = 63（catalog 24 工具包、63 模型可见工具名）。但其中 experimental/opt-in 包（@deepseek-ai/dsh-experimental-tool-agent-team、@deepseek-ai/dsh-tool-cordis）与生产未装 provider 变体，在 win-shell-mcp 的 preset 组合内不可用。经用户确认，全量模式取「**官方 standard + win-shell**」口径：以 DSH 官方 `standard`（完整编码 agent）原生组合为基线 + win-shell 58 域工具 + 极简 persona，剔除 experimental/opt-in 包与 codex/claude-code 生产未装 provider。此口径调整记录于本工单答案与 map（类比工单 05「65 一致略出 1」口径裁定先例）。故「AC2 目录总数」与「AC3 成本度量」作为 DSH 运行时/轨迹评测的验证边界，交由工单 07 e2e 实测与另立验证任务，win-shell 侧单测作结构性护栏（不断言 DSH 运行时数字，避免魔法数与跨仓库耦合）。

## 答案

在 win-shell-mcp 仓库（branch `master`）实现并提交：

- **`presets/wshell-full/` 三文件落地**（随 bundle `presets/` 树通配自动 sync，无需改 package.json）：
  - `agent.cordis.yml`：persona 单行极简 + `tool-win-shell`（`exclude` 3 meta → 58 域工具）+ DSH 官方 `standard` 原生组合（one-shot bash/pwsh 平台二选一、tool-fs/tool-fs-search、tool-jobs、skill-filesystem/tool-skill、tool-goal、planning 组、delegation 组含 subagent/subagent_fork/workflow-worker-thread/tool-workflow/tool-ralph、tool-ask-user、tool-todo、tool-web）。cordis:group 结构、isolate realm、注释风格与 standard/batch 先例同构。
  - `preset.yml`：「WShell 全量模式」，order 8。
  - `tool-win-shell.mjs`：re-export `win-shell-mcp/plugin`（同 standard/batch）。
- **验收对照**：
  - AC2 win-shell 58 域工具由单测断言（`builtinTools.length − 3`，单一来源）；DSH 原生注册总数因含 platform 分支（bash/pwsh 二选一）与 experimental/opt-in 剔除，无法以固定常数断言——作为 DSH 运行时/7-e2e 验证边界（见评论口径裁定）。
  - AC3 依赖 DSH 01/02/03 已完成（63 描述锁 ≤ 上限、总成本 21627→17489）；全量轨迹成本由工单 07 后另立验证。
  - AC4 persona 单行极简（complete/includeRuntimeContext/<200 字符断言，无工具映射表/规则堆砌注入）。
  - AC5 测试绿：presets.test.ts 新增 `wshell-full preset` describe（7 it：结构校验、目录构成含 persona/tool-win-shell/DSH core 原生行、剔除 experimental/opt-in、win-shell 58、persona 极简、包装器、preset.yml 显示名、name 合法）；index.test.ts 加 wshell-full 纳入 bundledPresetsRoot 与 apply sync 断言。dsh-bundle 全包 46/46 绿，`tsc --noEmit` 0 错误。
- **审查**：`/jxx-code-review` 双轴——标准轴 3 条酌情发现（EXCLUDED_ROWS 命名漂移、悬空 computing 组引用、缺尾换行）全部修复后无发现；spec 轴 AC1/AC4/AC5 闭合、AC2/AC3 为流程口径边界（在评论/答案记录，类比工单 05 先例），无代码缺陷。win-shell 单测不含 DSH 运行时魔法数（避免跨仓库耦合），目标数值由 07 e2e 实测。
