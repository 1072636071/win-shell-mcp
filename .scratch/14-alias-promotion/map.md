# 14-alias-promotion — map

> 工单拆解上下文指针与已做决策。对应 PRD：`.scratch/14-alias-promotion/PRD.md`（来源 PRD-07 优化点 P2-1）。

## 目标

别名机制三层问题的收尾：先修后扩再宣传。
1. **修复** `callTool` 别名解析——从正名精确匹配改为复用 `findTool`（正名优先、别名回退），消除双实现，让 MCP `tools/call` 真实可用别名。
2. **扩充** 7 个高频 Unix 短别名（`rm`/`mv`/`cp`/`grep`/`wc`/`df`/`ps`），受冲突护栏约束。
3. **宣传** 速查表别名列、description"别名：xx"、README 补齐。

## 关键决策

- **`callTool` 收敛到 `findTool`**：`callTool` 不再 `tools.find(t => t.name === name)` 正名精确匹配，改为复用 `findTool`（正名精确优先、失败回退别名）。`batch_run` 本就用 `findTool`，两条路径语义统一，消除双实现。这是行为修复，优先级最高。
- **新增别名 7 个（克制边界）**：`rm`→`fs_rm`、`mv`→`fs_mv`、`cp`→`fs_cp`、`grep`→`text_grep`、`wc`→`text_wc`、`df`→`system_disk`、`ps`→`process_list`。已核对不与 59 正名或既有别名冲突。本批之后不再扩张；后续新增需逐个论证频次。
- **既有别名保持不变**：16 组（`ls`/`list_directory`→`fs_list`、`text_cat`→`cat`（正名是 `cat`）、`fs_find`/`search_file`/`find_files`→`find`、`net_ping`→`ping`、`jq`→`json_get`、`sha256sum`/`md5sum`→`hash_file`、`du`→`fs_du`、git 短名、`tar_*`/`zip_*`、`wget`→`net_download`、`listen_ports`→`net_listen` 等）。
- **PRD-07 口径纠错**：`cat` 是正名、`text_cat` 是别名（"`ls`→`fs_list`"才是别名→正名的正确读法）。任何后续产出不得再出现"cat→text_cat"的误导读法。
- **护栏**：别名全集 ∩ 正名全集 = ∅、别名全集内部无重复、别名不出现在 `ListTools`（名单长度仍 59）。风险"别名遮蔽正名"由此钉死为零。
- **宣传口径**：速查表别名列以 13 的护栏对账为准；description 在 08 精简改写时"别名：xx"一笔带过；README 保持既有内联风格补新行。
- **测试 seam**：`callTool()` 最高层；护栏遍历 `builtinTools`（含别名全集）。只测"经某名字调用到达某工具"，不测 `findTool` 内部查找顺序。

## 涉及文件

- `src/server.ts`：`callTool` 工具查找改为复用 `findTool`
- `src/registry.ts`：修正"别名可用于 tools/call"注释从虚假声明变事实陈述；新增 7 个工具的 `aliases` 声明（对应 `fs_write.ts`/`text.ts`/`system.ts`/`process.ts` 的工具定义）
- `tests/tools/guard-mutating.test.ts`（或新增 guard 文件）：别名全集冲突护栏 + `ListTools` 回归（名单长度仍 59）
- `tests/server.test.ts`：`callTool` 层别名调用断言（7 新 + 3 既有代表）
- `src/tools/batch.ts`：解析路径不动；补/保留 batch 步骤别名回归用例（`tests/tools/batch.test.ts`）
- 宣传面（03）：速查表（13 号工单产物）、description（08 号工单精简产物）、`README.md`
- `CHANGELOG.md`：各批次 Unreleased ⚠️ 条目

## 实施顺序

01（修复行为）→ 02（新增别名 + 护栏）→ 03（宣传）。01 阻塞 02、03；02 阻塞 03。02 需先有 01 才能经 MCP 验证新别名；03 需 02 定别名全集才能一次性对齐。

**跨目录依赖**：03 对 13（速查表）与 08（description 精简）存在跨目录依赖——别名列数据源、`别名：xx` 文案口径需与 13/08 协调，避免重复定义与口径冲突。

## 超出范围

- 不让别名出现在 `ListTools` 条目中（别名是调用入口，不是工具；清单长度保持 59）
- 不做用户自定义别名（部署面词汇不开放）
- 不做别名的模糊纠错（如把 `dir` 猜成 `ls`）——别名是确定性映射
- 不改任何工具的输入/输出行为
- dsh 插件面不变（dsh 无别名概念，仅注册正名，ADR-0011）

## 评论

（对话历史与补充追加于此，新内容置于最前。）
