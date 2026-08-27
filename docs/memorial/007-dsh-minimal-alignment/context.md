# Memorial 007 — 配合 DSH 极简模式：命令集对齐检查

状态：完成（决策已定，实施见 ADR-0018 + DSH 工单）

## 诉求

> 检查当前项目的命令集，我们现在的目标是配合DSH的极简模式去工作，对比 DSH的工具集，检查是否还有缺少。
> DSH：E:\work\sp\deepseek-harness

## 追问记录

**2026-08-27 事实调查（一）— win-shell-mcp 现状**（已查证，来源：registry.ts / ai-tool-cheatsheet.md）：
- 61 个工具 = 58 域工具 + 3 meta（batch_run / tool_groups / list_domain_tools），15 命令域：system / fs / text / search / process / shell_exec / env / net / pkg / git / core / run_command / archive / hash / json。
- 全量域工具清单：system(4) fs(10) text(7) search(4) process(2) shell_exec(1) env(3) net(7) pkg(2) git(11) core(2) run_command(1) archive(2) hash(1) json(1)。
- 已有 DSH 集成历史：双入口交付已决策未实施（memorial 002，ADR-0010/0011/0012，插件名 `tool-win-shell`）；JX 模式为已部署的 standard 全量 preset（`docs/dsh/`，部署于 `~/.dsh/.agent-presets/jx-mode/`，规则=工具优先 win-shell-mcp + 事实入知识库）；PTC/Code Mode 适配已决策（memorial 006，ADR-0014，annotations + outputSchema）。
- MCP 工具经 profile 补丁层 `~/.dsh/profiles/web/cordis.patch.yml` 共享给一切模式会话。

**2026-08-27 事实调查（二）— DSH 极简模式（minimal preset）**（已查证，来源：deepseek-harness `apps/cli/config/agent-presets/minimal/` + `apps/cli/reference/README.md:85`）：
- `preset.yml`：name=极简模式，description=「仅提供持久 bash 与 str_replace_editor 的双工具编码 Agent」，order=3。
- `agent.cordis.yml`：固定 persona（text=`You are a helpful software engineer assistant.`，complete:true，includeRuntimeContext:false）；只挂 2 组插件——持久 shell（win32 下为 `@deepseek-ai/dsh-terminal-pwsh` + `@deepseek-ai/dsh-tool-pwsh-persistent`，POSIX 下为 bash 对应）与 `@deepseek-ai/dsh-fs-local` + `@deepseek-ai/dsh-tool-str-replace-editor`。
- 特征：完整 system prompt（无全局身份/工具指引/其他提示段）、不注入运行时上下文快照、无上下文压缩（compaction absent）；除这两个工具外，其他模型可见工具插件全部 absent；宿主能力（浏览器/工作区/持久化/沙箱/审批）保留。

**2026-08-27 事实调查（三）— DSH 完整工具目录**（已查证，来源：deepseek-harness `docs/tool-catalog.md`）：
- 能力型工具（与 win-shell-mcp 域重叠，可比对）：bash / pwsh（one-shot 与 persistent 两套）、str_replace_editor、edit/read/read_image/write（fs）、glob/grep（fs-search）、terminal_*(6)、web_fetch / web_search、lsp。
- 框架/编排型工具（DSH 宿主自带，win-shell-mcp 不提供也不该提供）：ask_user_question、exit_plan_mode、run_code、cordis_*、goal_*(3)、schedule_*(3)、skill、session_*(5)、subagent/subagent_fork、interrupt_agent/list_agents/send_message、report、job_*(3)、agent-team_*(10)、todo_write、workflow、ralph。
- DSH 无 git / pkg / archive / hash / json / net(dns/tcp/ping/listen) 工具插件——这些域是空白（memorial 002 已确认）。

**2026-08-27 事实调查（四）— DSH 完整目录 × win-shell-mcp 逐工具对比矩阵**（已查证，来源：tool-catalog.md × cheatsheet/registry）：
- 能力型工具（11 项，与 win-shell-mcp 可比对）：
  | DSH 工具 | win-shell-mcp 对应 | 状态 |
  | --- | --- | --- |
  | bash / pwsh（one-shot） | shell_exec / run_command | ✅ 覆盖 |
  | bash / pwsh（persistent） | 无 | ⚠️ 极简模式自带，win-shell-mcp 全 one-shot |
  | str_replace_editor | text_replace | ⚠️ 部分：text_replace 无 view/create/insert 多命令态、无持久编辑会话 |
  | edit | text_replace | ✅ 覆盖（语义有差异） |
  | read | fs_read / cat | ✅ 覆盖 |
  | write | fs_write | ✅ 覆盖 |
  | read_image | 无 | ❌ 缺口 |
  | glob | search_glob / find | ✅ 覆盖 |
  | grep | search_content | ✅ 覆盖 |
  | web_fetch | net_get / net_download | ✅ 覆盖 |
  | web_search | 无 | ❌ 缺口 |
  | lsp | 无 | ❌ 缺口 |
  | terminal_*(6) | 无 | ⚠️ 极简模式用持久 shell 替代，DSH 本体亦非极简模式所有 |
- 框架/编排型（DSH 宿主自带，win-shell-mcp 不提供）：ask_user_question、exit_plan_mode、run_code、cordis_*、goal_*(3)、schedule_*(3)、skill、session_*(5)、subagent/subagent_fork、interrupt_agent/list_agents/send_message、report、job_*(3)、agent-team_*(10)、todo_write、workflow、ralph。

**2026-08-27 事实调查（五）— DSH 梁神模式插件（@linxin666/dsh-liangshen）**（已查证，来源：本地 `e:\work\sp\dsh-web-ui\packages\dsh-liangshen\` + DSH `docs/自定义插件/README.md`）：
- 形态：bundle 插件（package.json `dsh.bundle.patch` → cordis.patch.yml `insert` 一行 `name: '@linxin666/dsh-liangshen'`），启动时把 `presets/liangshen/` sync 到 `~/.dsh/.agent-presets/liangshen`，新会话模式选择器出现「梁神模式」。
- 机制（两阶段，核心是 `presets/liangshen/tool-bootstrap.mjs` + `agent.cordis.yml`）：
  - **阶段 1（锚定）**：模型第一请求只见极简模式精确两工具（持久 `bash` + `str_replace_editor`）+ 单行 persona，无运行时上下文、无注入指令、只放行 user/goal 消息源；`bootstrapMaxTokens: 1024` 限阶段 1 输出预算。动机：DeepSeek V4 Pro 对首请求工具目录强条件，极简轨迹评测更高（99/96 vs 91/92）。
  - **阶段 2（提升）**：首个 tool/call 后等第一个推理块 minimal-like（含 `we` 无 `let me`），`anchorGate` + `maxBootstrapSteps: 4` 兜底 + `promoteAfterFirstResponse`；`promotedPresentation: code` → 线路切到 **PTC Mode**（目录只见单个 `run_code` + SDK 类型声明），全量 prompt 段/工作区指令/技能目录/运行时上下文恢复，`deferredSources` 延后一步注入。
- Windows 注：DSH PTY 后端 linux/darwin-only，win32 下 persistent-shell 组禁用，改 `custom-bash.mjs`（经跨平台 subprocess seam 调 Git Bash，同名 `bash`、Minimal 兼容 schema、跨调用无状态、无 OS 沙箱）。
- 三选一安装：全家桶 `dsh-web-all` / 独立 `dsh-liangshen` / git 直装；冲突：聚合包行 id 带 `web-ui-` 前缀 vs 独立装原 id。

**2026-08-27 Q2 答复（用户）— 三缺口处置 = 不补，用 DSH 原生；整体做插件**：
> 「我们做一个插件，read_image 和 web_search，和 lsp使用 原生的，其他的工具能力不要注入到提示词中，你可以看看 DSH的梁神模式插件」
- 解读（待确认）：read_image / web_search / lsp 三个缺口**不由 win-shell-mcp 实现**，直接用 DSH 原生工具（tool-fs / tool-web / tool-lsp 包，阶段 2 恢复全量后可用）；win-shell-mcp 其余工具能力**不 native 注入提示词目录**，参照梁神模式 `promotedPresentation: code` 走 PTC（`run_code` + SDK）暴露。
- 关联现状：win-shell-mcp `src/plugin.ts`（`tool-win-shell`）已实现全量 61 工具注册（58 域 + 3 meta batch_run/tool_groups/list_domain_tools）+ readOnlyHint 派生 isConcurrencySafe + outputSchema（memorial 006 已闭环）；即插件工具已经是 ctx.tools 成员，PTC SDK 天然包含它们。

**2026-08-27 Q3 答复（用户）— 核心痛点 = DSH 工具描述冗长**：
> 「现在的问题就是，DSH的工具描述太长了，不够精简」
- 解读：极简模式高分的根源不止「工具少」，还在于提示词干净；DSH 原生工具 description 冗长（bash≈800 字符、str_replace_editor≈650、run_code≈380、workflow≈1600、todo_write≈550），撑大提示词、稀释注意力。win-shell-mcp 工具描述精简（实测 30–80 字符/条），是「精简描述工具集」的天然替代来源。
- 对方案的影响：需重新评估呈现策略——若工具描述精简，native 注入的 token 成本大幅下降；「不注入提示词」（PTC）的理由需重新审视。

**2026-08-27 Q4 答复（用户）— 呈现策略 = 方案 1（native 全量）+ 改 DSH 原生工具描述 + 跨仓库推进**：
> 「1.我还想改一下 DSH 原生的工具描述词」
> 「这个工单也诉求，放在 E:\work\sp\deepseek-harness 目录，两个项目一起推进」
- 选定：**native 全量**（win-shell-mcp 58 + DSH 原生 read_image/web_search/lsp），描述总成本 ~4K；persona 保持极简。
- 新增诉求：**精简 DSH 原生工具描述词**（至少 read_image/web_search/lsp，范围待定）——DSH 侧改动，工单落在 DSH 仓库。
- 交付方式：**双仓库协同**——win-shell-mcp 侧（现有 58 精简工具 native 呈现 + 插件）+ deepseek-harness 侧（精简原生工具描述）。DSH 侧工单：`.agents/notes/proposed/feature/2026-08-27-concise-tool-descriptions-for-minimal-native.md`（proposed Agent Note）。
- DSH 仓库背景：pre-release stance（foundation over blast radius，无外部消费者，可自由重构）；Agent Notes 格式有 gate 强制（`verify-agent-note-format`），proposed note 需 Problem/Proposal/Alternatives considered/Acceptance criteria/Risks 五段 + `.zh.md` 双语对。

**2026-08-27 事实调查（六）— DSH 工具注册粒度**（已查证，来源：tool-fs/src/index.ts + 全局 toolFilter 搜索）：
- DSH 工具包**成组注册**：`dsh-tool-fs.apply` 一次注册 `read`/`write`/`edit`/`read_image` 全部 4 个（Config 只有 readLimit/readMaxLineLength/readMaxBytes/readStreamMinSize，无 per-tool 开关）；`dsh-tool-web` 注册 `web_fetch`/`web_search` 2 个；`dsh-tool-lsp` 单工具。
- `toolFilter` 是 subagent/子代理维度机制（subagent 包定义），**非 preset 层目录裁剪**——"精确只暴露 read_image 而隐藏 read/write/edit"无法原生实现。
- 结论：极简原生目录若挂 fs/web/lsp 三包，实际得到 **58（win-shell-mcp）+ 4（fs 组）+ 2（web 组）+ 1（lsp）= 65 工具**（~4.5K 描述），而非精确 61。

## 决策汇总

- **D1（2026-08-27）对比基准 = DSH 完整工具目录（20 包）**：以 tool-catalog.md 全量能力为对照检查 win-shell-mcp 缺口；区分「能力型 vs 框架型」，框架型（todo/subagent/job/goal/schedule/workflow/agent-team/cordis/skill/ask-user/plan-mode 等）不纳入 win-shell-mcp 应补范围。
- **D2（2026-08-27）三真缺口不补**：read_image / web_search / lsp 不使用 win-shell-mcp 实现，交付中改用 DSH 原生工具（tool-fs / tool-web / tool-lsp）；win-shell-mcp 命令集保持现状不加工具。
- **D3（2026-08-27）呈现策略 = native 全量**：win-shell-mcp 58 工具 + DSH 原生 3 工具（read_image/web_search/lsp）native 注入提示词（描述总成本 ~4K）；persona 保持单行极简。被否决：PTC（run_code 心智负担 + SDK 段成本）、两阶段（复杂度高 + 阶段 1 锚定工具描述同样冗长）。
- **D4（2026-08-27）DSH 侧精简原生工具描述**：至少 read_image/web_search/lsp（进入 native 目录的 3 个原生工具），描述对齐 win-shell-mcp 一行话风格；范围是否扩展待定。
- **D5（2026-08-27）双仓库协同交付**：win-shell-mcp 侧 + deepseek-harness 侧同步推进；DSH 侧工单 = proposed Agent Note。
- **D6（2026-08-27）DSH 全部模型可见工具描述精简**（Q5 用户答复）：范围扩展到 tool-catalog.md 全部 63 个模型可见工具；精简标准 =「尽可能少字符但准确表达语义、AI 能看懂」；保留必要的行为/安全注意（sandbox 拒绝语义等），砍冗余说教与示例堆砌。D4 被 D6 吸收。
- **D7（2026-08-27）插件交付形态 = bundle 插件（仿梁神模式）**（Q6 用户答复）：win-shell-mcp 仓库新增 bundle 包，`package.json` 声明 `dsh.bundle.patch` → `cordis.patch.yml` insert 工具插件行 + 启动 sync 极简原生 preset 到 `~/.dsh/.agent-presets/`；一键安装、升级自动刷新。被否决：纯 preset 文档化（手动拷贝）、先 preset 后 bundle（两轮交付）。
- **D8（2026-08-27）与 jx-mode 并存**（Q7 用户答复）：新 preset 独立命名、与 jx-mode 并列在模式选择器；新 preset 保持单行 persona、不带 jx-mode 两条规则。被否决：取代 jx-mode（丢知识库闭环）、派生（persona 不再极简）。
- **D9（2026-08-27）目录构成 = 标准 + 全量双模式**（Q8 用户答复"1+2 都做"）：**WShell 标准模式** = 65 工具（58 win-shell-mcp + fs 组 4 + web 组 2 + lsp 1）；**WShell 全量模式** = 58 win-shell-mcp + DSH 全量（~121 工具）。
- **D10（2026-08-27）新增 WShell 批量模式**（用户答复）：基于 WShell 标准模式（65 工具）+ 要求使用 win-shell-mcp 批量任务（`batch_run`：多步串行 + 断言 + `{{stepId.output.path}}` 引用 + 极简输出）——persona 注入"多步操作优先用 batch_run 一次完成"规则。
- **D11（2026-08-27）项目双形态**（用户答复）：**MCP 通用形态**（现有 MCP server，通用客户端）+ **DSH 插件定制形态**（Cordis 插件 `tool-win-shell` + bundle 插件含三 preset）。

## 收尾 checklist

- **C1 诉求已回应**：命令集对照 DSH 工具集 → 3 真缺口（read_image/web_search/lsp）用 DSH 原生（D2）；配合极简模式 → WShell 三模式 bundle 插件（D3/D9/D10）；DSH 工具描述冗长 → 全量精简（D6，DSH 侧工单）。
- **C2 决策完备**：D1–D11 全部确定（对比基准/缺口处置/呈现/精简范围/交付形态/目录构成/与 jx-mode 关系/双形态）。
- **C3 待澄清清零**：剩余为实施细节（命名拼写 WSShell、批量规则措辞、bundle 行 id、DSH 实施方式默认 (a)）——实施期自决，不影响方案。
- **C4 调查闭环**：DSH 工单（proposed Agent Note 双语对）已创建于 `deepseek-harness/.agents/notes/proposed/feature/`。
- **C5 ADR 齐全**：ADR-0018 `docs/adr/0018-dsh-minimal-native-integration.md` 记录核心决策簇（native 全量/三模式/双形态/跨仓库）。
- **C6 后续实施**：DSH 侧描述精简 → win-shell-mcp bundle 插件三 preset → 验证目录 token 与轨迹。

## 待实施（非阻塞）

- 命名拼写确认：用户写「WSShell 全量模式」——疑为笔误，建议统一「WShell 全量模式」。
- WShell 批量模式批量规则建议措辞：persona 追加一句「多步操作（读→改→写、批量改多文件等）优先用 batch_run 一次完成，避免多轮往返；单步操作直接调用工具。」
- bundle 插件：cordis.patch.yml 行 id/包名、三 preset 的 agent.cordis.yml 组合（persona + `tool-win-shell` 插件行 + `@deepseek-ai/dsh-fs-local` + `@deepseek-ai/dsh-tool-str-replace-editor`? + fs/web/lsp 三包行，按模式取舍）。
- DSH 侧实施方式：默认方案 (a) 直接改包源码 description 常量 + 重新生成 tool-catalog.md。
