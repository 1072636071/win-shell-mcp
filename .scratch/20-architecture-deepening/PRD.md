# PRD / Spec — 架构深化：重复机器收敛与接缝闭合

Status: ready-for-agent
日期：2026-08-28
来源：架构审查（`jxx-improve-codebase-architecture` 报告，候选 1–7 已逐条核实代码证据）
优先级：P1（决策 1、2）/ P2（决策 3–7）
关联：ADR-0003（命令执行深模块）、ADR-0005（纯 Node 不依赖 PowerShell）、ADR-0007（兼容性红线：0.x 集中纠错）、ADR-0014（MCP 标准注解）、config/env.ts 单点读取约定

## 问题陈述

架构审查确认七处问题，均为"重复机器 + 接缝泄漏"类摩擦，已在代码层核实：

1. **run_command 绕过命令执行深模块**（真 bug + ~100 行重复）：`run_command` 自带 `spawnCommand` 完整重造命令执行深模块（`src/exec/run.ts`）的子进程机器（spawn、输出收集、超时、解码、stdin）。其超时处理只 `proc.kill("SIGKILL")` 杀进程自身，**不杀进程树**——正是命令执行深模块注释明确警告的 Windows bug（超时后子进程仍持有 stdio pipe 而挂起）。四条执行通道（shell_exec / pkg_run / git / run_command）三条已收敛，run_command 是唯一绕开的调用者。
2. **tasklist CSV 解析器双份**：`process_list` 与 `net_listen` 各维护一份几乎逐行相同的 CSV 解析器（引号/逗号字段切分 + 映像名/PID 提取），后者删掉了内存列形成派生副本，行为漂移风险。
3. **读文件链路三处实现**：`fs_read` 与 `cat` 各自自维护 "stat 判目录 → readFile → decodeBuffer" 链路；共享读文本模块的 `readTextAutoDetect` 抽取只服务 `text_grep` 族。行范围切片语义分叉：`fs_read` 用 `split("\n")`，`cat` 用 `splitLines`（掐结尾换行），对以换行结尾的文件输出不一致。
4. **net_download 绕过 net 域 HTTP 机器**：`net_get`/`net_post` 共享 net 域内 `fetchWithTimeout`（AbortController + 超时 + 错误码映射）；`net_download` 自建 AbortController + setTimeout + fetch，**超时错误码分叉**（`EXEC_TIMEOUT` vs `NET_TIMEOUT`），同一条件两种语义。
5. **tool_groups 直读 process.env**：配置模块与 deploy 深模块声明 env 原始读取单点于 stdio 入口；`tool_groups` 懒模式判定 `resolveLazy()` 直接读 `process.env[ENV_WIN_SHELL_LAZY]`，绕过该接缝（源码注释自认"过渡读取点"）。
6. **父目录预检查重复**：`net_download` 与 `fs_write` 各有一份逐行相同的 "stat 父目录 → ENOTDIR / mkdirParents 递归建 / ENOENT" 逻辑。
7. **git 域 11 个 handler 样板**：每个 handler 重复 `getCwd(args)` → `runGit([...], cwd)` → `if (exitCode!==0) fail(GIT_FAIL, gitError(...))` 三段组合，错误文案靠 11 处逐字一致维持。

## 解决方案

收敛到既有深模块与接缝：命令执行机器归命令执行深模块（吸收输出字节预算与 signal）、tasklist 解析/读文件链路/HTTP 机器各归一深模块或既有模块深化、父目录预检与 git 样板归入工具层助手、懒模式判定随装配期注入。全部改动保持既有接口行为零破坏（新增可选参数/字段，缺省走历史行为）；run_command 的超时行为在收敛中顺带修复为进程树杀。

## 用户故事

1. 作为 AI，我想要 `run_command` 超时后子进程（含其子孙）被彻底终止，以便长跑命令不会在超时后继续持有输出管道挂起。
2. 作为维护者，我想要四条执行通道（shell_exec / pkg_run / git / run_command）共享同一套子进程机器（spawn/收集/超时/树杀/解码），以便执行语义与 bug 修复只落一处。
3. 作为维护者，我想要 `run_command` 的输出字节预算（`maxOutputBytes` 防内存失控）在命令执行深模块接口内被表达，以便调用方无需自建收集逻辑。
4. 作为调用方，我想要同一份 tasklist CSV 输出（`process_list` 与 `net_listen` 的进程名映射）由同一解析器解释，以便两工具对同一数据的解析行为永不漂移。
5. 作为维护者，我想要 tasklist 解析（引号/逗号切分、内存列提取）集中一处并有单测，以便格式变化只改一处。
6. 作为 AI，我想要 `fs_read` 与 `cat` 对同一文件的行范围读取结果一致（含结尾换行文件），以便行号语义无歧义。
7. 作为维护者，我想要读文件链路（判目录/解码/字节与行范围切片）只在一处实现，以便 EISDIR/ENOENT 行为与编码语义统一。
8. 作为 AI，我想要 `net_download` 超时返回与 `net_get`/`net_post` 一致的 `NET_TIMEOUT` 错误码，以便同类失败走同一条重试决策。
9. 作为维护者，我想要 net 域的 HTTP 机器（fetch/超时/重定向/错误映射）集中一处，以便流式与非流式调用共享同一超时与错误语义。
10. 作为维护者，我想要懒模式判定随装配期注入 `tool_groups`，以便 env 读取仍然只有 stdio 入口一处（无需伪装 process.env 即可单测）。
11. 作为维护者，我想要父目录预检查（ENOTDIR/递归建/ENOENT）集中一处，以便 `fs_write` 与 `net_download` 对同一前置条件返回语义一致的错误码。
12. 作为维护者，我想要 git 域 handler 不再重复 getCwd + 执行 + 失败分支样板，以便错误文案与失败映射一处定义、11 个 handler 只留参数构造与输出映射。
13. 作为测试编写者，我想要每条收敛都有对应单测（机器级与行为级两层），以便重构不改变已对外承诺的工具行为。

## 实现决策

### 决策 1：命令执行深模块接口扩展，run_command 收敛（P1）

- 修改模块：命令执行深模块（`src/exec/run.ts`）。
- 接口变更：`RunOptions` 新增可选 `maxOutputBytes`（每流输出字节预算，缺省不设 = 现行为零破坏）；`RunOutcome` 新增可选 `signal`（子进程信号终止时携带）与截断标记（stdout/stderr 是否被预算截断）。
- 行为：设置字节预算后，收集期按流独立截断前缀并标记截断（尾截不整块丢弃，对齐 run_command 现状）；未设置预算时收集逻辑与现状逐字节一致。
- run_command 改为消费 `runCommand` 一个接口，删除 `spawnCommand`；超时路径经深模块的进程树杀返回 timedOut，run_command 映射为 `EXEC_TIMEOUT`（现状错误码不变）；`exitCode: null`（信号终止）语义经新增 `signal` 字段表达，输出契约字段不变。
- 兼容性：对既有调用者（shell_exec / pkg_run / git）接口新增字段均为可选，无行为变化。

### 决策 2：tasklist 解析深模块（P1）

- 新建模块：tasklist 解析深模块（单一接口 `parseTasklistCsv(line)` → `{ pid, name, memory? }`）。
- 行为：以 `process_list` 现行为语义基准（含内存列提取、千分位逗号剥离、KBytes→字节换算）；`net_listen` 的进程名映射改用同一接口，删除本地派生副本。
- 兼容性：两调用方输出字段不变；解析器对畸形行返回 null 的行为与现状一致。

### 决策 3：读文件深模块（P2）

- 深化模块：共享读文本模块（`src/utils/readText.ts`）。
- 接口变更：新增 `readTextFile(path, { encoding?, byteRange?, lineRange? })`，吸收 "stat 判目录 → readFile → 字节切片 → 解码 → 行切片" 整条链路；byteRange 在解码前切片原始 buffer，lineRange 在解码后按统一逻辑行切片。
- 语义统一：行范围统一采用 `splitLines` 语义（掐结尾换行）。`fs_read` 与 `cat` 收敛到该接口，`fs_read` 删除本地 split 链路。
- 行为变化与兼容性：以换行结尾文件的行范围输出可能与 `fs_read` 现状有细微差异（split vs splitLines），属 0.x 窗口内可接受的行为统一，需在 CHANGELOG 记录；`cat` 输出不变。

### 决策 4：net HTTP 深模块（P2）

- 新建模块：net HTTP 深模块（`src/net/http.ts`，统一拥有 fetch + 超时 + 重定向 + 错误码映射），提供非流式（读 text）与流式（供下载写文件）两个消费形态，共享同一超时语义。
- 行为：超时统一映射 `NET_TIMEOUT`，连接失败统一映射 `NET_FAIL`；`net_download` 改用该模块，`EXEC_TIMEOUT` 分叉消除。
- 兼容性：`net_get`/`net_post` 输出不变；`net_download` 超时错误码由 `EXEC_TIMEOUT` 变更为 `NET_TIMEOUT`（0.x 窗口内修正，CHANGELOG 记录）。
- 合并说明：本分支此前把 HTTP 机器临时抽到 `src/utils/http.ts`，与本决策的 `src/net/http.ts` 为同一抽取的两个版本，合并后统一以 `src/net/http.ts` 为单一 seam，删除 `src/utils/http.ts`。

### 决策 5：懒模式装配注入（P2）

- 修改模块：装配链路（deploy 深模块 + server 壳）。
- 接口变更：工具表装配输出附带懒模式上下文，`tool_groups` 的 handler 工厂接收显式 lazy 入参（与其 pool 注入走同一通道）；删除 handler 内 process.env 直读。
- 行为：懒/全量/白名单各组合下 `tool_groups` 输出与现状一致（懒模式附 `visible: false`，全量省略）。
- 兼容性：对外工具行为零变化。

### 决策 6：父目录预检助手（P2）

- 深化模块：路径工具模块。
- 接口变更：新增 `prepareParentDir(filePath, mkdirParents)`：父路径存在且为目录 → 通过；存在但非目录 → `ENOTDIR`；不存在且 mkdirParents → 递归建；不存在且不建 → `ENOENT`。
- `fs_write` 与 `net_download` 收敛到该助手，错误码与文案语义对齐现状。

### 决策 7：git 命令模块助手（P2）

- 修改模块：git 工具集内部。
- 接口变更：新增内部助手吸收 `getCwd + runGit + exitCode 检查 + gitError 失败映射`，11 个 handler 改为只构造 gitArgs 与后处理。
- 行为：失败文案与现状逐字一致；spawn ENOENT 的专属提示（"git 命令未找到"）保留。

## 测试决策

1. **好测试的标准**：只测对外行为与接口语义，不测实现细节。每条决策都钉两条线——机器级（深模块接口自身）与行为级（工具输出契约不变）。
2. **seam（拟确认）**：
   - 决策 1：命令执行深模块 `runCommand` 接口（既有 seam，不新建）；行为面经 run_command 工具。注意：目前命令执行深模块无直接单测，新增机器级用例补齐。
   - 决策 2：tasklist 解析深模块接口 + process/net_listen 行为。
   - 决策 3：读文件深模块接口 + fs_read/cat 行为（含结尾换行文件的行范围断言）。
   - 决策 4：net HTTP 深模块接口（注入伪 fetch 的超时用例）+ net_get/net_post/net_download 行为。
   - 决策 5：装配纯函数（注入伪 lazy 值）+ tool_groups 输出形态。
   - 决策 6：路径助手接口 + fs_write/net_download 前置条件行为。
   - 决策 7：git 工具行为（已有 git.test.ts 回归）。
3. **新增用例要点**：run_command 超时进程树终止（Windows 语义，taskkill /T /F 路径）、maxOutputBytes 逐流截断标记、tasklist 解析表驱动、读文件行/字节范围组合、net_download 超时错误码、tool_groups 各模式 `visible` 字段形态、父目录三态错误码。
4. **先例**：`tests/tools/process.test.ts`（parseTasklistLine 表驱动）、`tests/tools/run_command.test.ts`（超时/截断行为）、`tests/tools/shell_exec.test.ts`、`tests/contract/output.test.ts`（契约形态）、`tests/tools/meta-tools.test.ts`（tool_groups 输出）。

## 超出范围

- **outputSchema 与 handler 返回结构双维护**（审查候选 8）：真实风险但解决方向未定（schema 推导类型 vs 类型推导 schema），依赖 zod→JSON Schema 管线（MCP/dsh 双消费）耦合评估，留待单独工单。
- 不重排 15 命令域结构、不新增命令。
- 不动 `run_command`/`shell_exec` 的兜底通道定位与破坏性标注（ADR-0014 语义不变）。
- 不做执行机器重构到事件驱动/流式响应（超出当前输出契约范围）。

## 补充说明

- **接缝确认**：决策 1/3/4/5 均复用或收敛到既有模块接口，不新建跨层接缝；决策 2/6/7 为工具层内部深化（无外部接缝）。若实施时发现既有 seam 形态与预期不符（如决策 1 的 signal 表达），以"不改调用方既有字段、只加可选字段"为约束裁决。
- **优先级次序**：先 P1（决策 1、2）——决策 1 顺手修真 bug、杠杆最大（四条通道一个测试面）；决策 2 纯重复消除、零风险。P2 各决策相互独立，可按序实施。
- **兼容性红线**：所有接口变更只加可选参数/字段；唯一行为变化点（fs_read 行范围、net_download 超时错误码）属 0.x 窗口内修正，需 CHANGELOG 记录（ADR-0007）。
- **预估工作量**：决策 1：2.5h；决策 2：1h；决策 3：2h；决策 4：1.5h；决策 5：1h；决策 6：0.5h；决策 7：1h。合计约 9.5h。

---

## 附：21 候选审查全景（本分支工单来源）

Status: in-progress
日期：2026-08-27
来源：jxx-improve-codebase-architecture 技能，7 子 agent 并行审查 59 工具

上述决策 1–7 是从本分支 21 个候选深化机会中核实代码证据后落地实施的部分。21 候选按强度分布为：强烈 3 / 值得探索 9 / 试探性 9；本工单目录 `issues/` 保留完整候选清单（`01-c-1` … `21-g-3`），其中 `01-run-command-converge` … `07-git-boilerplate` 对应已实施的决策 1–7。

### 执行批次

1. **批次 1（强烈 3）**：D-1, E-1, C-1 — 接缝泄漏/局部性违反，纯重构
2. **批次 2（值得探索·重构/测试 5）**：A-1, C-2, E-2, F-2, F-4
3. **批次 3（值得探索·大重构 2）**：B-1, G-2
4. **批次 4（值得探索·设计变更 3）**：B-2, D-2, F-1
5. **批次 5（试探性 9）**：B-3, B-4, C-3, D-3, F-3, F-5, G-1, G-3

### 验收

- 全部 issue 修复或显式拒绝（附理由）
- vitest 全绿，覆盖率 ≥ 阈值（lines/functions/statements ≥85%, branches ≥84%）
- tsup build 成功
- CHANGELOG Unreleased 追加条目
