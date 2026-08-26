# 空结果形态审计与收敛（只删装饰、不动判别字段）

**Status:** ready-for-agent

**Blocked by:** 无——可立即开始

**构建内容：** 对所有返回列表型结果的工具逐一核对空输入时的返回形态，让"没有命中"这个结论以最便宜的代价获得。保留帮 AI 判断"空的性质"的判别字段（真没有 / 被截断 / 模式误解），删除不改变 AI 决策的装饰字段。已达标的不动（`fs_list` 空返回 `{ ok: true, entries: [] }`、`text_grep` 空返回保留 `count`/`truncated`/`patternMode`）。

**验收标准：**

- [ ] 建立并应用判定标准：字段是否帮助 AI 判断"空"的性质（真没有 / 被截断 / 模式误解）——帮助则留（判别字段），不帮助则删（装饰字段）
- [ ] **删除清单前置**：审计前先列出拟删除字段清单，逐项标注「判别/装饰」归类理由，确认后再落地——避免为省 token 误删判别字段后 AI 需再走一轮确认（伤链第 1 项）才发现
- [ ] 对全部输出列表型结果的工具逐一核对空输入形态；已知基线 `fs_list`（空返回 `{ ok: true, entries: [] }`）与 `text_grep`（空返回保留 `count`/`truncated`/`patternMode`）判定达标、不做改动
- [ ] 审计逐项结论（每个工具：删了什么 / 留了什么 / 为什么）写入本工单评论区，可追溯
- [ ] 凡涉及删除既有输出字段的，按 ADR-0007 的 0.x 窗口集中处理并在 CHANGELOG 记录（破坏性变更）
- [ ] memorial 007 的"主动充分返回判别信息"原则在空结果场景显式保留：删的是装饰，不是判别信息；冲突点以"字段是否改变 AI 决策"裁决
- [ ] 审计中被改动形态的工具各补一条空输入断言；未改动的（`fs_list`/`text_grep`）已有断言保持绿即为回归

## 评论

### 审计结论（2026-08-26）

**判定标准**：字段是否帮助 AI 判断"空"的性质（真没有 / 被截断 / 模式误解）——帮助则留（判别字段），不帮助则删（装饰字段）。

**删除清单**：经逐一审计，**无字段需删除**。所有列表型工具的空结果形态均已达标，现有字段均为判别字段。以下为逐项结论：

| 工具                    | 空结果形态                                                 | 判定                                              |
| ----------------------- | ---------------------------------------------------------- | ------------------------------------------------- |
| `fs_list`               | `{ entries: [] }`                                          | ✅ 达标（基线，不改）                             |
| `fs_find`               | `{ entries: [] }`                                          | ✅ 达标                                           |
| `search_glob`           | `{ files: [], count: 0, truncated: false }`                | ✅ count/truncated 判别                           |
| `search_content`        | `{ matches: [], count: 0, truncated: false, patternMode }` | ✅ 基线，count/truncated/patternMode 判别         |
| `text_grep`             | `{ matches: [], count: 0, truncated: false, patternMode }` | ✅ 基线（不改），count/truncated/patternMode 判别 |
| `search_which`          | `{ found: false }`                                         | ✅ found 判别                                     |
| `text_head`/`text_tail` | `{ lines: [], total: 0 }`                                  | ✅ total 判别（原文件行数）                       |
| `git_log`               | `{ commits: [], count: 0 }`                                | ✅ count 判别                                     |
| `git_branch`            | `{ branches: [], current: "" }`                            | ✅ current 判别                                   |
| `git_status`            | `{ branch, changed: 0, staged: 0, untracked: 0 }`          | ✅ 全判别                                         |
| `git_diff`              | `{ diff: "", truncated: false, files: [] }`                | ✅ truncated/files 判别                           |
| `git_stash list`        | `{ action: "list", stashes: [] }`                          | ✅ action 判别                                    |
| `process_list`          | `{ processes: [], truncated: false }`                      | ✅ truncated 判别                                 |
| `system_path`           | `{ entries: [] }`                                          | ✅ 达标                                           |
| `system_disk all`       | `{ disks: [] }`                                            | ✅ 达标                                           |
| `env_get all`           | `{ vars: {}, count: 0 }`                                   | ✅ count 判别                                     |
| `pkg_detect`            | `{ available: {}, checked: [] }`                           | ✅ checked 判别                                   |
| `list_domain_tools`     | `{ domain, tools: [] }`                                    | ✅ domain 判别                                    |
| `tool_groups`           | `{ groups: [] }`                                           | ✅ 达标                                           |
| `net_dns`               | `{ addresses: [], recordType }`                            | ✅ recordType 判别                                |
| `net_listen`            | `{ ports: [] }`                                            | ✅ 达标                                           |

**结论**：无需代码改动，无破坏性变更，CHANGELOG 不记。所有工具的空结果形态已符合 memorial 007"主动充分返回判别信息"原则——字段帮助 AI 区分"真没有 / 被截断 / 模式误解"，无装饰字段需删除。既有空输入断言保持绿即为回归。

（评论与对话历史追加于此，新内容置于最前。）
