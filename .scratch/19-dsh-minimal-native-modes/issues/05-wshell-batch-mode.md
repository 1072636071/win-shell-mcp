# WShell 批量模式

**Status:** resolved

**Blocked by:** 04

**构建内容：** 在 DSH 模式选择器新增「WShell 批量模式」：目录与 WShell 标准模式一致（65 工具），persona 追加"多步操作优先用 batch_run 一次完成"规则，引导模型将读→改→写、批量改多文件等序列合并为单次 batch_run 调用，减少多轮往返。

**验收标准：**

- [ ] 模式选择器出现「WShell 批量模式」
- [ ] 目录构成与标准模式一致（65 工具）
- [ ] persona 包含批量规则（多步优先 batch_run、单步直接调用工具）
- [ ] 验证场景：多步文件操作会话中模型实际使用 batch_run 合并步骤
- [ ] 测试绿：preset 解析/目录构成/persona 规则断言

## 评论

**口径裁定（2026-08-27，批开工前）：** 验收「目录与标准模式一致（65 工具）」与 PRD D10（persona 注入 batch_run 规则）冲突——若 batch_run 不在目录，规则无法生效。按 D10/PRD US4 的功能意图：批量模式**放行 batch_run**，即 tool-win-shell 的 `config.exclude` 只剔除 tool_groups/list_domain_tools（保留 batch_run），win-shell 贡献 59（58 域 + batch_run），目录共 66（59 + fs 4 + web 2 + lsp 1），刻意见"65 一致"略出 1。此偏差随实现记录。

## 答案

交付 WShell 批量模式 preset（commit 随本批落地）：

- **`presets/wshell-batch/`**（agent.cordis.yml + preset.yml「WShell 批量模式」order 7 + tool-win-shell.mjs 包装器）：目录 = persona + tool-win-shell + fs/web/lsp 三组。tool-win-shell 的 `config.exclude: [tool_groups, list_domain_tools]`（放行 batch_run），按口径 win-shell 贡献 59、目录 66。
- **persona**：单行极简身份 + 一条批量规则「多步操作（读→改→写、批量改多文件等）优先用 batch_run 一次完成，避免多轮往返；单步操作直接调用工具。」（逐字对齐 PRD D10 建议措辞），并补齐官方 minimal 的 `complete: true` / `includeRuntimeContext: false`；不注入工具映射表。
- **测试**：`tests/dsh-bundle/presets.test.ts` 重构为 `describe.each(MODES)` 参数化覆盖 standard + batch。win-shell 贡献数由 registry（`builtinTools.length`）推导（单一来源），断言目录构成、exclude 清单、注册数（standard 58 / batch 59）、persona 规则；`tests/dsh-bundle/index.test.ts` 断言 `wshell-batch` 随 bundle apply 被 sync 进 `.agent-presets`。
- **审查整改**：persona 断言两分支保留（批量规则 vs 极简长度）；displayName 改纯字符串；describe 用 `.each`；4 个文件补尾换行；清理一处注释措辞。
- **验收对照**：模式选择器出现「WShell 批量模式」、目录构成/persona 规则/测试绿已由断言闭合；验收 #4「多步会话中模型实际使用 batch_run 合并步骤」为主观 DSH 运行时 E2E 场景，不在本仓库代码内，留工单 07（e2e 验证 + 文档）。
