# AI 工具速查表本体 `docs/ai-tool-cheatsheet.md`

**Status:** ready-for-agent

**Blocked by:** 无——可立即开始（跨目录交接项见下方"跨目录依赖"）

**构建内容：** AI 读取一份约 59 行的极简速查表就能建立全部工具的概览：按 CONTEXT.md 的 15 命令域分节，每域一张四列表格（正名｜一句话用途｜关键参数｜别名），meta 工具（`batch_run`）单列一节，末尾环境变量小节。建立工具全景的 token 成本较读整个 README 下降 70%+；被 08 号工单从描述中移出的使用细节（如 `text_grep` 反斜杠语义、`text_replace` 双模约定）在此有稳定承接处，精简描述不造成知识丢失。

**验收标准：**

- [ ] 新建 `docs/ai-tool-cheatsheet.md`；顶部一段定位说明（面向 AI 的极简速查；人类向完整说明见 README，注明与 README 的分工）
- [ ] 主体按 CONTEXT.md 的 15 命令域分节（system / fs / text / search / process / shell_exec / env / net / pkg / git / core / run_command / archive / hash / json），不沿用 README 的 17 分组（README 把 fs 拆只读/变更、find 单列；15 域里 fs 合一、find 归 search、cat 归 text）——域词汇与 11 号工单的 domain 元数据对齐
- [ ] 每行固定四列：正名｜一句话用途｜关键参数｜别名；域内顺序与 registry 注册顺序一致
- [ ] 全部 58 个非 meta 工具各占一行；meta 工具（`batch_run`）单列一节，与 11 号落地后的 `tool_groups`/`list_domain_tools` 同节
- [ ] 一句话用途为人工措辞：以精简后的 description 为底稿但允许更短更直白，不与 description 逐字绑定（此弹性由 02 号护栏测试明确放行）
- [ ] 关键参数列只列高频/有坑字段（含默认值与边界，如 `endByte` 0-based 含、`encoding` 默认 auto），不是全量 schema 复述
- [ ] 别名列收录全集：含 14 号工单新增的 7 个短别名（`rm`/`mv`/`cp`/`grep`/`wc`/`df`/`ps`）与既有 16 组别名；与 14 号谁后落地谁补齐
- [ ] 承接 08 号工单从 description 移出的使用细节：按工具归入对应行的关键参数/备注（以 08 评论区删除清单交接，如 `text_grep` 模式判定与反斜杠语义、`text_replace` 双模约定）——08 尚未落地删除清单时，先从当前 description 提取可承接的使用细节
- [ ] 末尾环境变量小节：初版先列 `WIN_SHELL_TOOLS`（12 号）；`WIN_SHELL_LAZY`（11 号）、`WIN_SHELL_TRUNCATE`（15 号）随对应工单落地逐个补齐，各变量标注所属工单
- [ ] 不含使用教程/示例编排（那是 16 号工单 batch 预设的领地）

**跨目录依赖：**

- 承接 08：`text_grep`/`text_replace` 等被移出描述的使用细节，以 08 评论区删除清单为准；一句话用途以 08 精简后的 description 为底稿 → 若 08 未落地，本工单先按现状 description 起草并标注"待 08 精简后回校"
- 收录 14：7 个新增短别名到别名列，别名全集以 14 落地后的 `aliases` 为准（14 未落地则先列既有 16 组）
- 登记 12/15/11：环境变量小节随对应工单逐个补齐
- 对齐 11：15 域节与 11 的 `domain` 元数据及 `tool_groups` 域概览文案保持一致（域名、一句话用途措辞均以 CONTEXT.md 术语表为源）

## 评论

### 实施记录（2026-08-26）

- 新建 `docs/ai-tool-cheatsheet.md`，已落地全部验收标准。
- **结构**：顶部定位说明（面向 AI 极简速查；人类向见 README）；主体按 CONTEXT.md 15 命令域分节（system/fs/text/search/process/shell_exec/env/net/pkg/git/core/run_command/archive/hash/json），不沿用 README 17 分组；每节四列表格（正名｜一句话用途｜关键参数｜别名）；域内顺序与 `src/registry.ts` builtinTools 注册顺序一致。
- **覆盖**：58 个域工具各占一行 + meta 节 3 行（batch_run/tool_groups/list_domain_tools）= 61 行表格。
- **一句话用途**：以精简后 description 为底稿、人工措辞更短直白，不与 description 逐字绑定（02 号护栏放行）。
- **关键参数**：只列高频/有坑字段含默认值与边界——如 `fs_read` start/end 1-indexed 闭区间、`cat` 字节范围 0-based 含、`fs_write` mkdirParents 默认 true、`net_tcp` timeout 默认 3000ms、`text_grep` pattern 双模语义（字面量子串默认、`/正则/` 启用、反斜杠免转义）、`text_replace` 0 命中报错/多命中须 all|maxReplace 表态。
- **别名列**：收录全集——7 新短别名（rm/mv/cp/grep/wc/df/ps）+ 既有 16 组（ls/list_directory、text_cat、fs_find/search_file/find_files、net_ping、jq、sha256sum/md5sum、du、checkout/push/pull/clone/stash、tar_create/zip_create、tar_extract/zip_extract、wget、listen_ports）；无别名标记 `—`。以 registry aliases 字段为单一事实源，02 号护栏逐行对账通过。
- **承接 08**：08 删除清单未落地，已从当前 description 提取可承接使用细节（text_grep/search_content 的 pattern 双模与残余洞、text_replace 的替换数量永不静默约定、cat 的编码 auto 与字节/行范围边界）归入对应行关键参数列；待 08 精简后回校。
- **环境变量小节**：列 WIN_SHELL_TOOLS（12 号已落地）、WIN_SHELL_LAZY（11 号已落地）、WIN_SHELL_TRUNCATE（15 号标注"未落地"）；各变量标注所属工单。
- **不含**使用教程/示例编排（留给 16 号 batch 预设）。

（速查表草稿迭代、与 08/14/11/12/15 的交接确认追加于此，新内容置于最前。）
