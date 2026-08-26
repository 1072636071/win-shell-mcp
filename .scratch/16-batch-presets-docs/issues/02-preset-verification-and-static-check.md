# 预设实测验收与静态核对

**Status:** ready-for-agent

**Blocked by:** 01

**构建内容：** 保证第一批预设不是纸上谈兵：其中两个不涉及写入外部状态的预设（读改写回、批量文件采集）在临时目录经 `callTool("batch_run", …)` 实际跑通、断言全部通过，证明文档里的入参 JSON 可照抄即用；另两个涉及外部状态的预设（git 提交推送、环境自检）逐项静态核对语法、操作符、字段名，与当前实现对照。实测结论记录在评论区，作为"示例与实现一致"的一次性验证（文档本体不入测试套件）。

**验收标准：**

- [x] 在临时目录对"读改写回"预设经 `callTool("batch_run", …)` 实际执行，`args` 直接采用 01 号工单写出的入参 JSON，所有步骤成功、断言全部通过，无短路
- [x] 在临时目录对"批量文件采集"预设经 `callTool("batch_run", …)` 实际执行，引用链（`fs_list` 结果经引用喂给后续读取）照常工作，整串单引用保类型语义正确，断言通过
- [x] 实测中发现预设与实现不一致之处，回填修正 01 号工单对应的预设文件（改文档而非改代码），并在评论区记录差异与修正
- [x] 对"git 提交推送"预设做静态核对：每步工具名、参数字段名、断言操作符逐项对照实现，标注无执行（涉及外部 git 状态）
- [x] 对"环境自检"预设做静态核对：`system_disk`/`env_get`/`system_info` 的工具名、字段名、`gt` 阈值断言逐项对照实现，标注无执行（涉及外部系统状态）
- [x] 实测结论全部记录于本工单评论区（每预设：跑通/未跑通、断言结果、临时目录路径、差异修正记录）

## 评论

（评论与对话历史追加于此，新内容置于最前。）

### 实测与静态核对结论（2026-08-26，coding-engineer）

**实测：读改写回 + 批量文件采集——均跑通。**

- 临时目录：`.temp/output/preset-test/`（rmw-default/、rmw-verbose/、collect-default/、collect-verbose/）。
- 实测脚本：`.temp/scripts/preset-verify.mjs`；详细结果：`.temp/logs/preset-verify-result.json`。
- 方法：`callTool("batch_run", args)`，`args` 直接采用 01 号工单写出的入参 JSON（默认形态，不带 `verbose`）；另在独立副本上跑 `verbose: true` 取每步详细结果供记录，不影响默认形态的文件。
- **读改写回**：默认形态 `allOk: true`，summary "全部 4 步成功"。verbose 步骤：`read`(cat)→`locate`(text_grep, count=1, 断言 eq 通过)→`replace`(text_replace, replaced=1/written=true, 断言 eq 通过)→`verify`(text_grep, count=1, 断言 eq 通过)。文件由 `"old-name"` 正确改为 `"new-name"`。无短路。
- **批量文件采集**：默认形态 `allOk: true`，summary "全部 4 步成功"。verbose 步骤：`list`(fs_list, entries=["a.json","b.json"], 断言 truthy 通过)→`read0`(fs_read, path=`{{list.output.entries.0}}`="a.json", lines=4, 断言 gte 通过)→`read1`(fs_read, path=`{{list.output.entries.1}}`="b.json", lines=4, 断言 gte 通过)→`checkCount`(fs_list, 断言 truthy 通过)。引用链工作，整串单引用保 string 类型。无短路。
- 实测中发现预设与实现不一致之处：无。无需回填修正 01 号工单。

**静态核对：git 提交推送 + 环境自检——逐项一致，标注无执行。**

- **git 提交推送**（不实测，涉及外部 git 状态）：
  - `git_status`：工具名 ✓（`src/tools/git.ts` gitStatusTool.name）；参数 `cwd` ✓（gitStatusInputSchema.cwd optional）；断言字段 `changed`/`staged`/`untracked` ✓（GitStatusMinimal）；操作符 `lte`/`eq` ✓（10 种枚举内）。
  - `git_add`：工具名 ✓；参数 `cwd`/`paths` ✓（gitAddInputSchema.paths array min 1）；断言字段 `added` ✓（GitAddResult.added string[]）；操作符 `truthy` ✓。
  - `git_commit`：工具名 ✓；参数 `cwd`/`message` ✓（gitCommitInputSchema.message min 1）；断言字段 `committed` ✓（GitCommitResult.committed boolean）；操作符 `eq` ✓。
  - `git_push`：工具名 ✓；参数 `cwd` ✓（gitPushInputSchema.cwd/remote/branch optional）；断言字段 `pushed` ✓（GitPushOutputSchema.pushed boolean）；操作符 `eq` ✓。
- **环境自检**（不实测，涉及外部系统状态）：
  - `system_disk`：工具名 ✓（`src/tools/system.ts` systemDiskTool.name）；参数 `path` ✓（systemDiskInputSchema.path optional）；断言字段 `free` ✓（SystemDiskResult.free number）；操作符 `gt` ✓（数值比较，actual/expected 均 number）。
  - `env_get`：工具名 ✓（`src/tools/env.ts` envGetTool.name）；参数 `name` ✓（envGetInputSchema.name optional）；断言字段 `value` ✓（EnvGetOneResult.value string|null）；操作符 `truthy` ✓。
  - `system_info`：工具名 ✓（systemInfoTool.name）；参数无 ✓（systemInfoInputSchema 仅 verbose optional，预设 `args:{}`）；断言字段 `node` ✓（SystemInfoMinimal.node string）；操作符 `re` ✓（value 为正则源串）。

**语法基线核对**：断言操作符严格 10 种（eq/neq/gt/gte/lt/lte/in/re/truthy/falsy），预设中出现的 eq/gte/lte/truthy/re/gt 均在枚举内；引用仅 `{{stepId.output.path}}` 形式；步骤 id 全部显式命名；默认极简输出形态（不带 verbose）。与当前实现逐项一致。

---

实测仅针对两个不写外部状态的预设；git 与环境自检只做静态核对，不实测。文档侧漂移由 01 号工单的维护状态行与 6 号维护约定兜底。
