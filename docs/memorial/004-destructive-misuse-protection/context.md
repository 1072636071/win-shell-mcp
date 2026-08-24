# Memorial 004 — AI 写删侧误用防护（write 误覆盖 / 递归删除灾难）

状态：进行中
创建：2026-08-24
来源：memorial 003-ai-tool-misunderstanding R6 分流（决策 D5）；关联 archived/002-destructive-op-log-recovery、docs/adr/0008-trash-based-protection

## 诉求

> dsh原生工具还有这个问题：
> 1. 编号 009 无冲突（005 文件存在、只是没登记进表格）。执行回写：
> WriteCONTEXT.md失败EditError: old_string was not found in "E:\work\sp\JxKnowledgeBase\CONTEXT.md"ThinkThe write to CONTEXT.md succeeded (it replaced the whole file — wait, I used the `write` tool with file_path=CONTEXT.md but content was the ADR content! Let me re-check what I did.
> 第二个编辑报错很可疑——我需要立即检查 CONTEXT.md 的实际状态，刚才第一个调用可能用错了工具：
> ReadCONTEXT.mdThinkConfirmed my mistake: the first call was a `write` tool invocation (malformed — I passed new_string/old_string instead of content), and it overwrote CONTEXT.md entirely with the ADR-009 content. The original CONTEXT.md content is destroyed in the file.
> 确认了：我上一步误用了 write 工具（传了 edit 的参数），把全局 CONTEXT.md 整个覆盖成了 ADR 内容。所幸本会话开头我完整读过原文——现在一次性修复：恢复 CONTEXT.md 全文 + 正确写入两处回写 + 把 ADR 落到 docs/adr/009。
>
> 2. 上次断了个根目录符把我user目录给递归删除了
>
> 能不能有办法解决？

## 追问记录

### R1 · 2026-08-24 · 开题取证（自 003 R6 移入，事实已核）

**关键取证**：

- **ADR-0008（回收站型破坏保护）状态 Accepted 但代码零实现**：src 下 grep `recycle|回收站|trash|fs_restore|fs_trash_list|operations\.jsonl|backup` 全部零命中，无对应工具文件。设计的 backup/<操作ID>/ 备份、fs_restore、fs_trash_list、备份失败即中止破坏——均未落地。「user 目录被递归删除」发生在决策已接受、代码未写的空窗期。
- win-shell-mcp 现有 fs_rm 为硬删除（递归），无危险目标守卫。

**失败类别归因**：

- 事故 1 = 「错误参数仍成功执行」：write 收到 edit 的指纹参数（old_string/new_string）不被拒绝，schema 宽容 + 覆盖语义照常生效。防护方向：① 参数指纹纠错（dispatch 层通用：携带本工具 schema 外的知名参数 → EINVAL 并提示正确工具名）；② 先读后写强制；③ 覆盖前备份。
- 事故 2 = 「路径解析错位放大破坏半径」：防护方向：① 危险目标守卫（盘根/家目录/浅深度的递归删除须显式 confirm）；② realpath 校验；③ 回收站兜底（=ADR-0008 落地）。

**分层现实**：

- win-shell-mcp 层：完全可控，可立即治理。
- DSH 原生层（事故 1 的 write/edit）：代码在 deepseek-harness（本地 checkout E:\work\sp\deepseek-harness），可改但属另一项目，宜出独立工单。
- 用户侧最普适恢复网：受 AI 管理的仓库全部 git 化 + 勤 commit。

**候选议题池（优先级待 grill）**：

A. ADR-0008 落地（回收站/备份/fs_restore/fs_trash_list/审计流）
B. fs_rm 危险目标守卫（根/家目录/浅深度 confirm 门 + realpath 校验）
C. 参数指纹纠错（dispatch 层通用检查）
D. fs_write 先读后写强制
E. DSH 原生层工单（deepseek-harness）
F. 用户侧 git 化建议（文档/规范层面）

**启动顺序**：待 memorial 003 收口后开始本 memorial 正式 grill（第一问：优先级与第一批范围）。

### R2 · 2026-08-24 · 第一问：第一批治理的范围与顺序

**分层地图（谁能治什么）**：

- **win-shell-mcp 层**（本仓库，完全可控）：fs_write / fs_rm / fs_mv / run_command 等自有工具——A/B/C/D 四类防护都能落地。
- **DSH 原生层**（deepseek-harness，本地 checkout，另一项目）：事故 1 的 write/edit 与事故 2 的删除命令的直接肇事方——只能出工单（议题 E），改动影响面是整个 dsh 用户群。
- **用户侧**（规范层）：git 化 + 勤 commit 是最普适的事后恢复网（议题 F）。

**关键事实回顾**：A（ADR-0008/0009 回收站保护）已双 ADR Accepted + PRD ready-for-agent，仅缺实现；B（危险目标守卫）/C（参数指纹纠错）/D（先读后写）尚无任何 ADR，属新机制需设计。

**提问**：治理从哪批开始？

1. **兜底优先【推荐】** — 第一批 = A 落地（回收站 + fs_restore + fs_trash_list + 审计流），D（先读后写）作为 fs_write 改造的同批低成本附加；第二批 = B+C（拦截型）；E 出工单、F 写规范平行推进。优点: 最快获得「任何误用皆可恢复」的安全网，对**未知误用模式**也有效——安全工程先建网后装栏；A 零新决策成本、design-ready，见效最快；事故 2 级灾难从此可自助还原。缺点: 不降低误用发生率，只保证后果可控；大目标备份有性能开销（ADR-0009 低价值名单已缓解）。
2. **拦截优先** — 第一批 = B+C，先把已知误用模式挡在执行前。优点: 直接降事故率，实现小、上线快。缺点: 守卫靠危险路径黑名单与参数名启发式，永远有漏网；没有回收站兜底时漏网即灾难——等于继续裸奔只加了栏杆；且 B/C 无既有设计，还需先 grill 规则，起步反而更慢。
3. **全量一批（A+B+C+D）** — 优点: 一次交付完整防御纵深。缺点: 实施批次过大、评审测试周期长；B/C 的具体规则（危险目标清单、指纹参数表、confirm 交互形态）尚未 grill，混入会把 design-ready 的 A 拖住。

你倾向哪个？



### R3 · 2026-08-24 · 取证推翻「A 即安全网」：两个设计洞

**取证（docs/adr/0009 全文核对）**：

1. **大小阈值后门**：`WIN_SHELL_BACKUP_MAX_BYTES` 默认 1GB，超限「跳过备份直接真删，仅记审计」。user 目录几乎必然 >1GB → **事故 2 重演时，回收站恰好不接住**：保护机制全程旁观，只留一行日志。「大」本是成本语义，却被处理成可直接真删——而「大」恰是灾难性误删最典型的形态特征。
2. **黑盒通道零防护**：保护只挂结构化工具（fs_rm/fs_write/fs_mv）；`run_command(["Remove-Item","-Recurse",<拼断的路径>])` 或 shell_exec 的 rd/del 命令完全绕过。ADR-0009 替代方案段承认「每调用参数无法约束黑盒工具」，但正文从未规定黑盒通道怎么办。若事故 2 经由 shell 删除（「断了根目录符」更像字符串拼接命令），则结构化工具防护根本不在事故路径上。

**推论**：B（危险目标守卫）不是第二批的可选增强，而是 **A 正确工作的前提**——危险目标（家目录/盘根等）无论大小都应触发拦截确认，其优先级必须高于两类例外。

### R5 · 2026-08-24 · 用户改向：「先不讨论删除，先搞定用错」

**用户裁定（D3）**：R4/Bmin 及删除议题挂起；焦点切换为事故 1 类「用错」（错误工具/混型参数）。C（参数指纹纠错）与 E（DSH 原生层工单）、D（先读后写）提前为当前议题。

**取证（本轮自查）**：

- `src/server.ts:65` 为单点 dispatch：`tool.inputSchema.safeParse(args)` —— 参数校验唯一收口，指纹纠错在此一处实现、58 工具全部受益。
- zod 默认非 strict：未知参数被**静默剥离**（tests/tools/system.test.ts:59 佐证存在 `{extra:1}` 用例），混型调用只要必选参数齐就照常执行——事故 1 的直接放大器（content 合法 + old_string/new_string 杂质并存 → 成功覆盖 CONTEXT.md）。
- 事故 1 形态恰为「未知参数命中其他工具 schema」的高置信特征：old_string/new_string 不属于 write，属于 edit。
- DSH 原生层的 write/edit 是 harness 的工具，win-shell-mcp 无权治理 → 由工单 E 承接（建议内容：write/edit schema strict 化或同款指纹纠错 + 覆盖前先读后写强制）。

**提问（两子项）**：

1. **拦截策略【推荐双档制】** — ① 未知参数命中任一其他已注册工具的 schema 参数名 → EINVAL，报错信息指路正确工具（如「old_string 属于 edit 工具——你可能想调用的是 edit」）；② 其余未知参数 → 响应附 warnings 字段放行（兼容 MCP 客户端杂质字段）。优点: 高置信误用被拦且自解释，低置信噪声不打扰；落点单一。缺点: 参数重名（如 path 遍布多工具）时指路可能多义，需按「缺失的本工具必选参数」加权判断。备选：全 strict 一律拒（最简单但无指路、误伤难排查）；只警告不拦（零防护）。
2. **先读后写（D）【推荐仅约束覆盖】** — server 进程内维护已读路径集合（fs_read/cat/text_head/text_tail 读过即计入）；fs_write 目标**已存在**且不在集合 → EINVAL「先用 fs_read 读取再写入」；新建文件与 append:true 不受限。优点: 直接堵死「没看过内容就整体覆盖」的事故形态，成本极低。缺点: 进程重启集合清空（保护降级但不失效）；AI 多一轮 read 调用的 token 开销。

你倾向哪个？（两子项可分别表态）

### R4（挂起）· 2026-08-24 · Bmin 的门控：要不要被 WIN_SHELL_PROTECT 关掉？

> 状态：因 D3 议题改向挂起，删除议题重启时继续。

背景张力：ADR-0009 定了「保护机制默认关闭（WIN_SHELL_PROTECT=1 才开）、未开启时零行为变化」——本意是控制备份成本（磁盘/性能）。但 Bmin 与回收站不同：它不做备份、没有资源成本，只是一次 realpath 对照 + 极少数目标要求显式 confirm。若 Bmin 跟随 PROTECT 默认关闭，则**多数用户在默认配置下事故 2 依旧裸奔**——「默认安全」与「默认关闭」在这里正面冲突。另有一层定位张力：ADR-0002「无沙箱全权限、与裸 shell 等价」——confirm 门不是拒绝能力，是要求显式表态（类比 sudo 要密码 vs NOPASSWD），但需文档说明以免违背「确定性命令」预期。

**提问**：Bmin 受不受 PROTECT 门控？

1. **常开【推荐】** — 结构化工具与黑盒通道的危险目标守卫一律生效，不随 PROTECT；`WIN_SHELL_GUARD_LIST` 仅允许追加自定义危险路径；confirm 放行后按当时配置走（PROTECT 开→回收站流程，关→直接执行）。优点: 默认配置下事故 2 也被拦——守卫的价值恰恰在于用户没配置任何东西的时候；零备份成本，常开无负担。缺点: 打破 ADR-0009「默认关闭」的机制一致性（需在 ADR-0014 里写明分野：回收站=成本型可关，守卫=语义型常开）；黑盒启发式常开有误报打扰风险（字面量检测误报率应极低，但要给绕过出口——confirm 本身就是出口）。
2. **跟随 PROTECT** — 与回收站同一开关。优点: 机制单一、完全符合既有 ADR。缺点: 默认配置下保护形同虚设，多数用户永远不开开关——兜底优先的整个立项理由被架空。
3. **折中：结构化常开、黑盒随开关** — 优点: 黑盒误报风险被开关隔离。缺点: 两套门控逻辑更难解释；而最需要拦的事故 2 恰恰发生在黑盒通道，等于把最关键的闸门留给用户主动打开。

### R6 · 2026-08-24 · 用错防护定案（R5 裁决 + 代理决策）

- 子项 1：用户拍板「1」——双档制拦截（→ D4）。
- 其余事项用户授权代理决策，裁定如下：
  - **多义指路加权规则**（D4 细节）：候选建议工具排序 = ①本调用缺失的必选参数恰好属于该工具 schema 的程度；②命中未知参数个数；③参数唯一性（仅属于单一工具者优先）。并列时全部列出。
  - 先读后写按推荐收口（→ D5）。
  - E 工单文本产出至 `sub-task/002-dsh-native-tool-ticket.md`；F 不单独立项（→ D6）。
  - R4（Bmin 门控）维持挂起，不因本次授权复活。

## 决策汇总

- **D1（2026-08-24）· 批次顺序 = 兜底优先**：第一批 = ADR-0008/0009 回收站保护落地 + D（先读后写）作为 fs_write 改造同批附加；第二批 = B+C 拦截型；E 出工单、F 写规范平行推进。（后续 R3 对第一批构成有修正，见 D2）
- **D2（2026-08-24）· 第一批构成修正 = A + Bmin + D**：A（回收站落地）与 Bmin（危险目标守卫最小核心：目标 realpath 命中危险特征 → 拒绝执行并要求显式 `confirm`，**优先级高于低价值名单与大小阈值两类例外**；黑盒通道对「删除原语 + 危险目标字面量」做同款 confirm 门检测，诚实定位为启发式减震器而非保证）同批实施；D（先读后写）维持同批附加；C（参数指纹纠错）移第二批；E/F 平行推进。Bmin 的开关门控待 R4 裁定。
- **D3（2026-08-24）· 议题改向 = 先治用错**：R4/Bmin 与删除守卫细节挂起；C（参数指纹纠错）、D（先读后写）、E（DSH 原生层工单）提前为当前焦点。用户拍板。（注：D2 中 Bmin 的设计结论保留在案，实施顺序以后续裁定为准）
- **D4（2026-08-24）· 拦截策略 = 双档制**：dispatch 单点（server.ts:65 safeParse 收口）——①未知参数命中其他已注册工具 schema 参数名 → EINVAL 并指路正确工具（多义时按缺失必选参数加权，见 R6）；②其余未知参数 → 响应附 warnings 放行。替代方案（全 strict 一律拒 / 只警告不拦）否决。用户拍板。
- **D5（2026-08-24）· 先读后写 = 仅约束覆盖**：fs_write 目标已存在且不在进程内已读集合（fs_read/cat/text_head/text_tail 计入）→ EINVAL 提示先读；新建与 append 不受限；集合随进程重启清空为已知边界。代理决策（用户授权）。
- **D6（2026-08-24）· E/F 处置**：E = 工单文本落 `sub-task/002-dsh-native-tool-ticket.md`（write/edit strict 化 + 指纹纠错 + 覆盖前先读，提交 deepseek-harness）；F = 并入实施文档一句话规范，不单独立项。代理决策（用户授权）。

## 待澄清

- **R4（Bmin 门控）**：挂起中——删除议题重启时裁定「守卫是否常开 vs 随 WIN_SHELL_PROTECT」。
- **A（ADR-0008/0009 回收站落地）实施排期**：方向已定并入 0.x 发布前批次，与 memorial 001 D8 清单同批；具体开工时间未定。
- **指纹加权与 warnings 字段的实现期调参**：原则已定（D4），阈值/格式归实施。
