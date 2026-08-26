# 全工具 description 与字段 describe 精简（含 batch_run 引导，合并 10 号）

**Status:** completed

**Blocked by:** 01

**构建内容：** 全部 59 个工具的 description 精简为"一句话用途（含 ≈ Unix 类比）+ 关键约束/默认值/陷阱"，字段级 `.describe()` 只保留字段名与类型表达不了的语义（单位、默认值、边界含开闭、陷阱）——`ListTools` 返回体量较基线降 ≥30%，每次会话的固定上下文开销显著下降；`batch_run` 的 description 这一次改写同时完成精简与 PRD-10 的引导语，不再二次变更；精简过程逐工具语义无损校验，被移出的使用细节整理成删除清单交接给 13 号速查表工单。

**验收标准：**

- [x] 59 个工具的 description 全部精简：一句话用途（含 ≈ Unix 类比，遵循 ADR-0001 既有风格）+ 关键约束；凡字段名 + 类型已能表达的 `.describe()` 删除或缩到一词；outputSchema 中可精简的 describe 一并处理 —— **结果**：57 个 ≤150 字符，2 个豁免（text_replace 237、batch_run 174）
- [x] 写一条可复述的 description 书写原则（"描述是给 AI 选工具用的，不是说明书"），落成规范供后续新工具遵循 —— **结果**：6 条书写原则已记录于评论区"收尾整合记录"
- [x] `batch_run` 描述一次改写，含 PRD-10 引导（"多步操作优先用 batch_run 一次完成"）+ 典型场景 + 引用/断言最小要点，仍在本工单预算内 —— **结果**：batch_run 252→174，四段式引导语完整，保留豁免
- [x] 总量：精简后 `JSON.stringify(listTools())` 较 01 号记录的基线下降 ≥30% —— **⚠️ 未达成**：实测降幅 **11.56%**（56277→49769），未达 ≥30%（目标 ≤39393）
  - **结果**：实测 49769 字符，降幅 11.56%
  - **原因**：① `inputSchema` 的 JSON Schema 结构（字段名/类型/required/enum 等）是 description 正文无关的固定骨架，占元数据体量大头且不可压缩；② 字段 `.describe()` 多数已是"字段名 + 类型表达不了的语义"最小集，可压缩空间有限；③ 继续压缩会伤害 ADR-0016 链第 1 项（轮速最少：描述过简致 AI 误选工具、多走一轮）
  - **处置**：经用户同意放宽基线，01 号护栏预算常量收紧为实测值 49769（而非基线 ×0.7），护栏保持绿
- [x] 逐工具四要素校验（用途/关键参数语义/陷阱与边界/与易混工具的判别点）确认语义无损，校验结论摘要追加到本工单评论区 —— **结果**：59 工具全部通过，无严重缺失
- [x] 删除清单（被移出的使用细节，如 `text_grep` 反斜杠语义、`text_replace` 双模约定）整理并记录于评论区，供 13 号工单承接 —— **结果**：9 类删除模式已记录
- [x] 全量 `npm test` 保持绿——本工单不改行为，任何行为测试变红都说明改错了 —— **结果**：1533 passed | 2 skipped（与基线一致）

## 评论

（逐工具校验结论、删除清单、与 10/13 号交接记录追加于此，新内容置于最前。）

---

## 收尾整合记录

### 实测结果

- 精简后 JSON.stringify(listTools()) = 49769 字符
- 基线 56277 → 精简后 49769，降幅 11.56%
- 目标 ≤39393（降 ≥30%）：**未达成**。6 个精简组（A-F）已覆盖 59 个工具的 description 与 .describe()，但整体降幅 11.56% 未达 30% 目标。主要原因：基线 56277 中 description 占比有限，inputSchema 的 JSON Schema 结构（字段名、类型、required 等）是不可压缩的骨架；许多 .describe() 已是字段名+类型表达不了的语义最小集，进一步压缩会触及 ADR-0016 链第 1 项（轮速最少：过简致误选工具）。用户已同意放宽基线至实测值 49769，后续工单可继续收紧。

### 护栏预算常量

- METADATA_BUDGET 设为 49769（实测值，用户已同意放宽基线）
- DESCRIPTION_EXCEPTIONS 最终清单：text_replace(237)、batch_run(174)
- 已移除豁免（精简后 ≤150）：text_grep(149)、search_content(150)
- 注：process_kill(132)、net_post(121)、ping(117) 在 02 号精简前已不在豁免清单中（前序工单已移除）

### description 书写原则（本次精简总结）

1. **一句话用途**：以动词开头，含 Unix 类比（如"≈ find"），不超过 80 字符
2. **关键约束/默认值**：只写字段名和类型表达不了的语义（如"默认递归"、"忽略 .gitignore"）
3. **陷阱与边界**：只写容易踩坑的（如"路径必须存在"、"超时秒数含连接建立"）
4. **判别点**：与易混工具的区别（如"非内容搜索"区别于 search_content），保链 1（轮速最少）
5. **字段 .describe()**：只保留字段名+类型表达不了的语义，能省则省
6. **不删判别语义**：四层优先级链（ADR-0016）第 1 项（轮速最少）优先于第 4 项（输入 token 最少）

### 删除清单

本次精简中删除的冗余描述内容模式：

1. **重复的参数说明**：参数名+类型已表达的语义（如"timeout: number"后不再写"timeout 是数字"）
2. **过长的示例**：batch_run 的示例从多个精简为关键操作符列表（eq/neq/gt/gte/lt/lte/in/re/truthy/falsy）
3. **冗余的注意事项**：已在 .describe() 中表达的默认值不再在 description 重复
4. **重复的返回值结构说明**：精简为关键字段（如 git_status 从完整结构精简为 { branch, changed, staged, untracked }）
5. **过度的判别点说明**：保留关键的（如"非内容搜索"、"区别text_grep：跨文件"），删除冗余的
6. **重复的"待 02 号精简"注释**：已完成的标记（text_grep、search_content、text_replace、batch_run 的豁免理由）
7. **冗余的陷阱说明**：保留易踩坑的（如"非零退出码是正常结果"、"不可达返回 ok"），删除罕见的
8. **过度的实现细节**：如"基于 LCS 行级"保留为判别点，但删除算法细节
9. **重复的编码说明**：cat 与 fs_read 的编码语义统一为"auto（GBK/UTF-8）"和"自动检测"

### 逐工具四要素校验结论

59 个工具全部校验通过，四要素（用途/关键参数语义/陷阱与边界/判别点）均无严重缺失：

- **用途**：全部以动词开头并含 ≈ Unix 类比
- **关键参数语义**：保留字段名+类型表达不了的语义
- **陷阱与边界**：保留易踩坑点（0-based vs 1-based、非零退出码、不可达返回 ok、替换数量永不静默等）
- **判别点**：易混工具均有判别——
  - find vs search_content/text_grep：find 标"非内容搜索"
  - search_content vs text_grep：search_content 标"区别text_grep：跨文件"
  - run_command vs shell_exec：run_command 标"不经 shell 解析"，shell_exec 标"管道/重定向/通配由 shell 解释"
  - fs_read vs cat：fs_read 标"与 cat 语义一致"
  - net_tcp vs ping：net_tcp 标"reachable 为 true/false，不是错误"

### 测试验证

- 护栏测试 `guard-metadata-budget.test.ts`：120 passed
- 全量 `npm test`：1533 passed | 2 skipped（与基线一致）
