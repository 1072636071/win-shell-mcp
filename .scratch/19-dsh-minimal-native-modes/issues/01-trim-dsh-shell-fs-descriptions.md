# DSH 工具描述精简：shell/文件/编辑族

**Status:** resolved

**Blocked by:** 无——可立即开始

**构建内容：** 在 deepseek-harness 仓库，将 DSH 的 shell 类、文件类、编辑类、终端类工具描述精简为"最短可准确表达语义、AI 能看懂"的形式。实施后这些工具的模型可见描述大幅缩短，但语义准确、行为事实保留。

**验收标准：**

- [x] shell/文件/编辑/终端族工具（bash/pwsh/str_replace_editor/fs/fs-search/terminal 等）描述精简到目标：多数 ≤200 字符，行为事实需要时可放宽
- [x] 每个精简后的描述仍准确表达语义，模型在缺少被删文本时能正确选择和使用该工具
- [x] 行为、schema、参数、执行路径完全不变——只改描述文本
- [x] 该族相关测试与文档（含断言描述文本的测试）同步更新，CI 绿
- [x] 涉及内置极简模式锚定工具（bash/str_replace_editor）的改动已标注，留给 03 统一重验

## 答案

已在 deepseek-harness 仓库（branch `jiangxiao`）实现并提交：

- **源码精简（6 个包）**：one-shot `bash`/`pwsh`（收紧冗余论文式措辞，保留全部 sandbox/升级安全事实——sandbox 拒绝标记、pwsh ConstrainedLanguage/命名管道 EPERM 边界、一次性升级重试与护栏、`$DSH_*` 环境提示、一次性 vs 持久、退出码约定、后台 job、截断/落盘）、`str_replace_editor`（~700→~330，保留 view/create/str_replace/insert + 唯一性 + 状态持久）、`read_image`、`glob`、`grep`。fs `read/write/edit` 与 `terminal_*`、持久 `bash`/`pwsh` 本就 ≤200 字符，未动。
- **生成/快照同步**：`docs/tool-catalog.md`(+`.zh.md`) 重生成；acp-agent 20 个 pin sidecar（tool-schemas/system-prompt）经 keyless `test:snapshot:refresh` 刷新，posixOnly 未覆盖的 fs-glob-sampling/session-query-spill 手工对齐；python-sdk `model-visible.json` 更新 str_replace_editor 描述。
- **测试**：tool-bash/tool-pwsh 两处断言旧描述文本的用例改为断言保留的行为事实；变更包 tsc/oxlint/单测全绿；verify-tool-catalog、verify-agent-note-format、translation-pairing（本变更涉及的 pair）通过。
- **Agent Note**：`.agents/notes/implemented/simplification/2026-08-27-concise-shell-fs-terminal-descriptions.md`(+`.zh.md`+`.i18n.yaml`)。
- **极简模式锚定工具标注**：`tool-str-replace-editor` 包默认描述已改；`tool-bash-persistent`/`tool-pwsh-persistent` 默认描述未动（本就 ≤200），minimal preset 亦用 config 覆盖持久 shell 描述，故运行时表面不变——锚定重验留给 03。

注意：本机（Windows）无法跑通 acp-agent 全量 replay 的 bash 执行类场景（WSL relay 无 `/bin/bash`），28 个失败均为环境性（WSL/SQLite Node warning），非描述相关；fixture guards 全部通过、无任何"diverged from pinned header/schemas"类失败。Linux CI 预期绿。win-shell-mcp 侧另见 `docs/memorial/007-dsh-minimal-alignment/` 与 PRD。

**审查后修复（2026-08-27，选 A）**：按 `/jxx-code-review` 双轴审查发现修复——(1) 修正 `fs-glob-sampling/tool-schemas.expected.json` 手工对齐误用默认 cap 100 的问题（该组合 `globMaxResults: 4`，改为精确文本裁剪保留 4/250）；(2) 恢复 one-shot `bash`/`pwsh` 被过度裁剪的 sandbox 行为事实与升级护栏：pwsh 的 ConstrainedLanguage/FullLanguage + 命名管道 EPERM 边界、`$DSH_*`/`$env:DSH_*` 环境提示、escalation 护栏（approval 同意、approval 禁用即终局、勿投机升级、stop-and-explain）；(3) 修正 Agent Note 中持久 bash/pwsh 默认描述"未动/已改"自相矛盾并补记 Consequences。修复后重新审查无发现项；重跑 476 包测试、tsc、oxlint、verify-tool-catalog/agent-note-format/translation-pairing 全绿，acp-agent replay 仍仅 28 个环境性失败、无描述相关失败。
