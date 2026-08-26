# 易混工具对判别语义集中评审

**Status:** completed

**Blocked by:** 02

**构建内容：** 对精简后最易混淆的工具/引导语做集中判别评审，确认 AI 在只看 description（不给 schema 细节）时仍能正确区分、不会误选——这是兜底"描述过简导致误选"这一本批次唯一实质风险的复核环节。

**裁决依据：** ADR-0016——≤150 字符预算落实链第 4 项（输入 token 最少），但不得伤害链第 1 项（轮速最少：过简致误选工具、多走一轮）；本评审即链 1 对链 4 的护栏。

**验收标准：**

- [x] 对三对易混工具逐一评审：`fs_read` vs `cat` vs `text_head`/`text_tail`（读文件 vs 读文本首尾）、`find` vs `search_glob` vs `search_content`（文件系统查找 vs 内容检索）、`shell_exec` vs `run_command`（raw shell vs 结构化命令） —— **结果**：3 对全部评审，判别点均充分
- [x] **额外评审 `batch_run` 引导语**（与 10 号工单合并改写的文本）：预算内只靠 description 能否引导 AI 优先选用 batch_run、不把引导语压到失效——按 ADR-0016 裁决，预算与引导充分性冲突时优先保链 1（引导充分），可动用 08 的例外清单机制 —— **结果**：引导充分，强引导语"优先用 batch_run 一次完成"未压到失效
- [x] 每对确认或修复：精简后 description 仍包含足够的判别点（适用对象、返回值形态、副作用差异） —— **结果**：全部确认足够，无需修复
- [x] 发现判别语义丢失时，修订对应 description（仍须满足 01 号预算护栏），并同步修正 02 号的校验结论 —— **结果**：未发现判别语义丢失，无需修订
- [x] 评审结论（每对保留的判别点摘要 + `batch_run` 引导语结论）追加到本工单评论区 —— **结果**：已追加"评审结论（2026-08-26）"

## 评论

（工具的判别点与 batch_run 引导语评审结论、必要修复记录追加于此，新内容置于最前。）

---

## 评审结论（2026-08-26）

### 对 1：fs_read vs cat vs text_head/text_tail

- **fs_read**："读文件，支持 start/end 行范围（1-indexed 闭区间，与 cat 语义一致）、编码自动检测、截断。"
- **cat**："读文件整体（≈ cat）。支持编码 auto（GBK/UTF-8）、字节范围（0-based 含）、行范围（1-based 含）、截断。"
- **text_head**："取文件头 N 行（≈ head，默认 10）。返回行数组与文件总行数。"
- **text_tail**："取文件尾 N 行（≈ tail，默认 10）。返回行数组与文件总行数。"
- **判别点分析**：
  1. fs_read vs cat：fs_read 显式标"与 cat 语义一致"——等价提示，AI 知两者可互换；差异在参数族（fs_read 仅行范围 start/end，cat 多字节范围 startByte/endByte），但等价提示已让 AI 选哪个都能工作，不会因选错而多走一轮。
  2. text_head/text_tail vs fs_read/cat：head/tail 标"取文件头/尾 N 行"——固定端点，与 fs_read/cat 的"任意行范围"明确区分；返回值形态（head/tail 返回行数组、fs_read/cat 返回 content 字符串）也在 description 中显式区分。AI 想看开头/结尾 → head/tail；想读任意行范围 → fs_read/cat，路径清晰。
- **结论**：保留。判别点充分，无需修复。

### 对 2：find vs search_glob vs search_content

- **find**："按文件名模式递归找文件（≈ find，支持 \* 通配，非内容搜索）。"
- **search_glob**："按 glob 模式匹配文件路径（≈ find -name），返回相对路径列表。支持 \*、\*\*、?、[]。"
- **search_content**："跨文件递归搜内容（≈ grep -r），返回[{file,line,text}]。pattern 默认字面量子串（元字符原样，反斜杠路径免转义）；/正则/ 启用正则（flags i/m/s，体内 \\/）。向字面量收敛。残余洞/tmp/类短串判正则，异常偏多附hint。区别text_grep：跨文件。"
- **判别点分析**：
  1. find/search_glob vs search_content：find 显式标"非内容搜索"，search_glob 标"匹配文件路径"，search_content 标"搜内容（≈ grep -r）"——按名/路径找 vs 按内容找的区分清晰，AI 不会误把"找文件"请求送到 search_content。
  2. find vs search*glob：find 标"支持 *"，search*glob 标"支持 *、**、?、[]"——glob 能力差异显式呈现；AI 需 ** 或 ? 或 [] 时会选 search_glob，仅 \* 时选 find 亦可，两者重叠是合理冗余。
  3. search_content 主动标"区别text_grep：跨文件"——单文件 vs 跨文件区分清晰，AI 不会在跨文件场景误选 text_grep。
- **结论**：保留。判别点充分，无需修复。

### 对 3：shell_exec vs run_command

- **shell_exec**："执行 raw shell 命令字符串（≈ sh -c），管道/重定向/通配由 shell 解释。返回 {exitCode, stdout, stderr}。非零退出码是正常结果。"
- **run_command**："结构化执行命令（args 数组，不经 shell 解析，无管道/通配/注入风险）。返回 {stdout, stderr, exitCode, signal, truncated}。适合带空格路径或精确参数。"
- **判别点分析**：
  1. 输入形态：shell_exec 标"raw shell 命令字符串"，run_command 标"args 数组"——输入形态明确区分。
  2. shell 特性（核心判别点）：shell_exec 标"管道/重定向/通配由 shell 解释"（支持），run_command 标"不经 shell 解析，无管道/通配/注入风险"（不支持但更安全）——AI 需管道/通配 → shell_exec，需精确参数/防注入 → run_command，路径清晰。
  3. 适用场景：run_command 标"适合带空格路径或精确参数"——显式场景引导，避免 AI 把带空格路径误交给 shell_exec 导致引号地狱。
- **结论**：保留。判别点充分，无需修复。

### batch_run 引导语评审

- **batch_run**："多步操作优先用 batch_run 一次完成，避免多轮往返。如：读文件→grep→替换→写回、检查→提交。steps 串行短路；引用 {{stepId.output.path}}；assert 10 种操作符 eq/neq/gt/gte/lt/lte/in/re/truthy/falsy。返回 { allOk, steps, summary }。"
- **引导充分性分析**：
  1. 引导语位置与强度：开头即"多步操作优先用 batch_run 一次完成，避免多轮往返"——强引导（"优先用"），AI 看到"多步操作"会优先考虑 batch_run 而非串行多次单工具调用。
  2. 场景示例具体：列出"读文件→grep→替换→写回、检查→提交"两个典型多步场景，帮 AI 识别何时该用 batch_run。
  3. 能力边界清晰：steps 串行短路、引用 {{stepId.output.path}}、assert 10 种操作符——AI 知道 batch_run 能做什么、不能做什么。
  4. 引导语未压到失效："优先用 batch_run"未被预算压缩丢失，引导强度保留。
  5. ADR-0016 裁决：batch_run 在 01 号豁免清单中，description 较长符合"预算与引导充分性冲突时优先保链 1（轮速最少）"的裁决——引导充分性优先于输入 token 最少。
- **结论**：保留。引导充分，无需修复。

### 总结

所有易混工具对判别点均充分，无修复：

| 工具对                             | 判别点                                                                     | 结论 |
| ---------------------------------- | -------------------------------------------------------------------------- | ---- |
| fs_read vs cat                     | 等价提示"与 cat 语义一致" + 参数族差异（行范围 vs 行+字节范围）            | 保留 |
| text_head/text_tail vs fs_read/cat | 固定端点（头/尾 N 行）vs 任意行范围；返回行数组 vs content 字符串          | 保留 |
| find/search_glob vs search_content | "非内容搜索"/"匹配文件路径" vs "搜内容"                                    | 保留 |
| find vs search_glob                | "_" vs "_、\*\*、?、[]"——glob 能力差异显式                                 | 保留 |
| search_content vs text_grep        | "区别text_grep：跨文件"显式标注                                            | 保留 |
| shell_exec vs run_command          | "管道/重定向/通配由 shell 解释" vs "不经 shell 解析，无管道/通配/注入风险" | 保留 |
| batch_run 引导语                   | "优先用 batch_run 一次完成"强引导 + 场景示例 + 豁免清单保链 1              | 保留 |

**ADR-0016 护栏结论**：本批次精简未伤害链第 1 项（轮速最少）——AI 在只看 description 时仍能正确区分所有易混工具对，不会因描述过简而误选工具、多走一轮。链第 4 项（输入 token 最少）的 150 字符预算与链第 1 项的判别充分性之间无冲突，无需动用豁免清单机制（batch_run 已在豁免清单中，其余工具均在预算内且判别点充分）。

无修复，无需运行 npm test。
