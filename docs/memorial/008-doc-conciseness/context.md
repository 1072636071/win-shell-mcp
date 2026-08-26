# 008-doc-conciseness

> 状态：已完成

## 诉求

> 保留用户原话：

极简的原则，要求极简也要能表达意思。毕竟能快速对齐，就可能减少很多重复对话的成本。修改相关文档和 AGENTS.md、CODEBUDDY.md。然后检查代码，会不会有这个问题。

## 追问记录

- 2026-08-26：Q1 极简原则的定位——选 **A**：在现有「四层优先级链」基础上补「极简 ≠ 丢信息」的约束，不新立独立概念、不动 ADR 结构。
- 2026-08-26：Q2 「丢信息」的判定标准——选 **1**：丢信息 = 迫使 AI 再发一轮才能得到答案。极简的底线是「信息足够一轮内完成决策」，绑定「快速对齐减少重复对话」动机。
- 2026-08-26：Q3 落文档范围——选 **1**：AGENTS.md + CODEBUDDY.md + CONTEXT.md 三处，不动 ADR。
- 2026-08-26：Q4 「检查代码有没有问题」的指向——选 **1**：检查代码实现里是否存在「极简过度、丢信息」的实际问题（因截断/省字段/默认 summary 等迫使 AI 再发一轮）。
- 2026-08-26：Q5 发现问题的处理边界——选 **B**：检查 + 顺带修复。发现明确违反新原则的「丢信息」点即修，注意不误伤既定决策（如 ADR-0003 有意截断）。

## 决策汇总

- D1：极简原则以「补约束」方式融入四层优先级链，不新增独立原则。极简是手段、表达完整意思是底线。
- D2：「丢信息」判定标准 = 迫使 AI 再发一轮才能得到答案；极简的底线是信息足够一轮内完成决策（呼应链第 1 项「交互轮速最少」）。
- D3：改动范围 = AGENTS.md + CODEBUDDY.md（两文件内容一致，同步改）+ CONTEXT.md 术语表。不改 ADR。
- D4：代码检查目标 = 现有实现是否存在「极简过度、丢信息」问题（截断/省字段/默认 summary 迫使 AI 补一轮）。
- D5：处理边界 = 检查 + 顺带修复；修复不误伤既定决策（ADR-0003 有意截断等），只改明确丢信息的点。
- D6：检查结论与修复 —— 发现一类「截断却缺 truncated 标记」的哑信息，命中 4 个工具：`shell_exec`、`pkg_run`、`net_get`、`net_post`。它们默认截断 stdout/stderr/body 到 2000 字符，但 `truncated` 标记仅 verbose 才返回（pkg_run 甚至完全无该字段），AI 拿不到「还有更多」信号，被迫再补一轮。修复：把 `truncated` 提升到默认输出（保留截断本身，不误伤 ADR-0003），同步更新 outputSchema 与测试。健康参照（默认即含 truncated）：`fs_read`/`text_cat`/`git_diff`/`search_content`/`search_glob`/`text_grep`/`process_list`/`run_command`。
- D7：并行复审裁决与追加修复 —— 复审发现同类遗漏 3 处，确认后直接修复：
  - `text_diff`、`text_replace`：truncate 截断但默认/schema 无 truncated → 已补（text_diff 加独立 truncated 字段；text_replace 在 payload 加 truncated）。
  - `env_get`（maxLen 分支）：opt-in 截断触发时无标记 → 裁决纳入修复，`vars` 输出加 truncated。
  - 不纳入：`text_grep`/`search_content` 的行内截断——其 truncated 标记的是「匹配行数截断」而非单行内容截断，属既有语义，非丢信息。
  文档审查（AGENTS/CODEBUDDY/CONTEXT）四项全 OK，无冲突。

## 待澄清

（空）
