# 扩充 7 个高频 Unix 短别名 + 冲突护栏测试

**Status:** ready-for-agent

**Blocked by:** 01（fix-calltool-alias-resolution）——需先让 `callTool` 别名解析生效，新别名经 MCP 调用才能被验证

**构建内容：** AI 为高频变更/查询类工具调用时，可用更短的 Unix 惯用名发起 `tools/call` 与 `batch_run` 步骤：`rm`/`mv`/`cp`/`grep`/`wc`/`df`/`ps` 分别指向 `fs_rm`/`fs_mv`/`fs_cp`/`text_grep`/`text_wc`/`system_disk`/`process_list`，使高频操作的请求/响应体更短、token 更省。新增别名受到护栏约束，保证不与任何正名或其他别名冲突，且不使 `ListTools` 清单膨胀。

**验收标准：**

- [ ] 为 7 个工具声明新别名，映射准确：`rm`→`fs_rm`、`mv`→`fs_mv`、`cp`→`fs_cp`、`grep`→`text_grep`、`wc`→`text_wc`、`df`→`system_disk`、`ps`→`process_list`
- [ ] 既有别名全部保持不变：`ls`/`list_directory`→`fs_list`、`text_cat`→`cat`（正名是 `cat`）、`fs_find`/`search_file`/`find_files`→`find`、`net_ping`→`ping`、`jq`→`json_get`、`sha256sum`/`md5sum`→`hash_file`、`du`→`fs_du`、git 短名、`tar_*`/`zip_*`、`wget`、`listen_ports` 等 16 组全部保留
- [ ] 冲突护栏：别名全集 ∩ 正名全集 = ∅（无别名遮蔽正名），遍历断言，沿用 `tests/tools/guard-mutating.test.ts` 的全集遍历模式
- [ ] 冲突护栏：别名全集内部无重复（任一名字在别名域中唯一）
- [ ] `ListTools` 回归：别名不出现在任何条目中（`listTools` 仅按 `tool.name` 列出），名单长度仍为 59
- [ ] MCP 调用断言：`callTool("rm", …)`、`callTool("grep", …)`、`callTool("ps", …)` 等全部 7 个新别名均成功到达正名工具，且结果与正名调用一致（与 01 的 3 个既有代表别名用例合流，覆盖 7 新 + 3 既有）
- [ ] `batch_run` 回归：既有步骤内用别名用例保持绿；若无，补一条 `tool: "ls"`（或新别名）的步骤断言别名在 batch 步骤中可用
- [ ] 已核对：`rm`/`mv`/`cp`/`grep`/`wc`/`df`/`ps` 均不与现有 59 个正名或既有别名冲突
- [ ] `CHANGELOG.md` Unreleased 段 ⚠️ 变更条目记录新增别名

**测试 seam：** `callTool()` 最高层；护栏遍历 `builtinTools`（含别名全集）。先例：`tests/tools/guard-mutating.test.ts`（全集护栏）、`tests/server.test.ts`（callTool 层断言）。

**评论：**

- 只增别名声明与测试，不改任何工具输入/输出行为、不改 `findTool`/`callTool` 查找顺序本身。
- 宣传面（速查表别名列、description 提及、README 补齐行）由 03 号工单负责，本工单仅保证别名真实可解析。
- 本批 7 个之后不再扩张，后续新增需逐个论证频次（克制边界，见 map）。
