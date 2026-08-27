# PRD：DSH 极简原生集成（WShell 三模式 + 双形态 + 跨仓库描述精简）

Status: ready-for-agent

关联：ADR-0018、memorial 007、DSH 工单 `.agents/notes/proposed/feature/2026-08-27-concise-tool-descriptions-for-minimal-native.md`

## 问题陈述

DSH（deepseek-harness）极简模式以「2 工具 + 单行 persona」取得更高模型轨迹评测，根源是首请求工具目录干净；但极简模式能力不足，而 DSH 标准模式的原生工具描述冗长（bash≈800 字符、str_replace_editor≈650、run_code≈380、workflow≈1600、todo_write≈550），全量目录提示词被描述撑爆、稀释模型注意力。win-shell-mcp 拥有 58 个描述精简（30–80 字符/条）的确定性命令工具，全量 native 注入总成本 ~4K，比 DSH 标准模式少一半以上且能力面更广，但存在三个能力缺口（read_image / web_search / lsp）需要 DSH 原生工具补齐。用户需要一套"提示词精简 + 能力全量"的 DSH 工作模式，并以插件形式一键安装。

## 解决方案

win-shell-mcp 以双形态交付：**MCP 通用形态**（现有 server，不动）+ **DSH 插件定制形态**（Cordis 插件 `tool-win-shell` + bundle 插件，一键安装到 DSH）。DSH 插件定制形态提供三个 preset：

- **WShell 标准模式**：58 个 win-shell-mcp 工具 + DSH 原生 fs 组（read/write/edit/read_image）+ web 组（web_fetch/web_search）+ lsp，共 65 工具，persona 单行极简，native 全量注入。
- **WShell 全量模式**：58 个 win-shell-mcp 工具 + DSH 全部原生工具（~121 个），persona 单行极简，能力最大化。
- **WShell 批量模式**：基于 WShell 标准模式，persona 追加"多步操作优先用 batch_run 一次完成"规则。

三个模式与现有 jx-mode 并存于模式选择器。配套的跨仓库工作：DSH 侧精简全部 63 个模型可见工具描述（标准 = 尽可能少字符但准确表达语义、AI 能看懂），由 DSH 仓库工单推进，使全量模式的提示词成本同样可控。

## 用户故事

1. 作为 DSH 用户，我想要一个"WShell 标准模式"，以便在提示词精简（65 工具 + 单行 persona）的环境下获得 win-shell-mcp 的确定性命令能力，替代 DSH 冗长描述工具。
2. 作为 DSH 用户，我想要"WShell 标准模式"能直接看图（read_image）、搜索网页（web_search）、做代码导航（lsp），以便 win-shell-mcp 缺口的三个能力由 DSH 原生实现补齐且无需额外配置。
3. 作为 DSH 用户，我想要"WShell 全量模式"，以便在描述精简后使用 DSH 全部原生能力（subagent/workflow/goal/session 等编排型工具）+ win-shell-mcp 全部命令工具。
4. 作为 DSH 用户，我想要"WShell 批量模式"，以便多步操作（读→改→写、批量改多文件等）被引导用 `batch_run` 一次完成，减少多轮往返与 token 消耗。
5. 作为 DSH 用户，我想要三个模式与现有 jx-mode 并存于模式选择器，以便按任务类型选择（精确编码用标准/批量，知识沉淀用 jx-mode，编排任务用全量），互不干扰。
6. 作为 DSH 用户，我想要通过一条命令安装该插件（bundle 插件，仿梁神模式），以便一键获得三个 preset 与工具注册，无需手动拷贝配置。
7. 作为 DSH 用户，我想要插件升级后 preset 自动刷新（bundle sync 机制），以便始终使用最新工具集与描述。
8. 作为 win-shell-mcp 维护者，我想要 MCP 通用形态保持现状不被 DSH 耦合，以便通用 MCP 客户端（Claude/Cursor 等）继续使用同一套工具。
9. 作为 win-shell-mcp 维护者，我想要插件形态复用现有 `win-shell-mcp/plugin` 入口（61 工具全量注册 + 并发标注 + outputSchema），以便不重复实现工具注册逻辑。
10. 作为 DSH 维护者，我想要 DSH 全部 63 个模型可见工具描述被精简到"最短可准确表达语义"，以便所有模式的提示词成本下降、模型注意力提升。
11. 作为 DSH 维护者，我想要描述精简保留必要的行为/安全事实（sandbox 拒绝语义、持久 shell 状态、退出码约定、一次性 vs 持久），以便不因裁剪丢失模型正确使用工具所需的指引。
12. 作为 DSH 维护者，我想要 `docs/tool-catalog.md` 随描述改动重新生成且 `verify-tool-catalog` 通过，以便生成文件门禁保持一致。
13. 作为 DSH 用户，我想要内置极简模式（minimal preset）不受本次改动破坏（其 bash/str_replace_editor 描述被精简后锚定表面需重新验证），以便既有极简轨迹评测基线可复现。
14. 作为 DSH 用户，我想要 WShell 各模式 persona 保持单行极简（不注入工具映射表/使用规则堆砌），以便延续"提示词精简"的核心收益。
15. 作为 DSH 用户，我想要 WShell 各模式的工具目录描述总成本可度量（标准 ~4.5K、全量精简后可接受），以便为后续工具增删提供 token 预算依据。

## 实现决策

- **呈现策略 = native 全量**（非 PTC/两阶段）：工具以 schema 注入提示词，persona 保持 `You are a helpful software engineer assistant.` 单行。被否决：PTC（run_code 心智负担 + SDK 段成本）、两阶段锚定（复杂度 + 阶段 1 锚定工具描述同样冗长）。
- **三模式目录构成**：标准 = 58 win-shell-mcp + fs 组（read/write/edit/read_image）+ web 组（web_fetch/web_search）+ lsp = 65；全量 = 58 + DSH 全量（~121）；批量 = 标准 + batch_run 优先规则。DSH 工具成组注册（tool-fs 4 个、tool-web 2 个一组），目录按组挂载、不精确到单工具。
- **双形态**：MCP 通用形态 = 现有 server 保持不动；DSH 插件定制形态 = 现有 Cordis 插件入口（61 工具全量注册）+ 新增 bundle 插件（package.json `dsh.bundle.patch` → cordis.patch.yml insert 工具插件行 + 启动 sync 三 preset 到 `~/.dsh/.agent-presets/`，仿 `@linxin666/dsh-liangshen` 机制）。
- **批量规则措辞**（persona 注入点，建议）：「多步操作（读→改→写、批量改多文件等）优先用 batch_run 一次完成，避免多轮往返；单步操作直接调用工具。」
- **与 jx-mode 并存**：三模式独立命名、不带 jx-mode 两条规则（工具优先 + 知识库），模式选择器并列。
- **跨仓库协作（DSH 侧）**：全部模型可见工具描述精简（63 个），标准 = 最短可准确表达语义、保留行为/安全事实；实施方式默认直接改各所属包 description 常量 + 重新生成 tool-catalog.md；受影响 ~20 个包（tool-fs/tool-web/tool-bash/tool-str-replace-editor/tool-workflow/todo/subagent/jobs/goal/schedule/session 等）。由 DSH 仓库 proposed Agent Note 跟踪。
- **命名**：三模式建议统一「WShell 标准模式 / WShell 全量模式 / WShell 批量模式」（原话「WSShell 全量模式」疑为笔误）。

## 测试决策

- **测试哲学**：只测外部行为与契约，不测实现细节。描述精简以"模型可见描述文本 + 长度上界"为断言对象；preset 以"解析后目录构成 + persona 极简约束"为断言对象，不跑 DSH runtime 之外的宿主逻辑。
- **最高层 seam（DSH 侧）**：`docs/tool-catalog.md` 生成 + `verify-tool-catalog`（已有）。新增断言：每个模型可见工具描述 ≤ 200 字符（shell 族/workflow 类可在行为事实需要时放宽）——校验失败即门禁拒绝。
- **最高层 seam（win-shell-mcp 侧）**：现有插件测试套件（`tests/plugin.test.ts` / `tests/plugin-integration.test.ts`，mock ctx 验证全量注册 + DSH 本地冒烟）。扩展为：bundle 的每个 preset 文件（agent.cordis.yml/preset.yml）可解析、引用的插件行存在、目录构成符合该模式约定、persona 满足极简约束（单行、无工具映射表注入）。
- **测试先例**：win-shell-mcp 侧 `tests/plugin-integration.test.ts`（全量注册 61、exclude、DSH 冒烟）与 `tests/tools/concurrency-*` 系列；DSH 侧各工具包 spec（description 文本断言）与 `verify-tool-catalog` 门禁。
- **快照/断言更新**：DSH 侧任何断言描述文本的测试随改动同批更新，避免单一 PR 内红。

## 超出范围

- win-shell-mcp 不实现 read_image / web_search / lsp（由 DSH 原生承担，D2）。
- 不改动 DSH 内置 minimal preset 的行为（只精简其工具的 description 文本并重新验证锚定表面）。
- 不改造 jx-mode 的规则与部署（并存）。
- 不做 PTC（run_code）呈现、不做两阶段 bootstrap 定制。
- 不新增 win-shell-mcp 工具（命令集保持 58 域 + 3 meta 现状）。
- 不在本 spec 内解决 DSH 全量模式在"描述精简后 ~121 工具"下的轨迹评测（另立验证任务）。

## 补充说明

- 实施顺序建议：DSH 侧描述精简（全局受益，独立可交付）→ win-shell-mcp bundle 插件三 preset → 验证目录 token 与轨迹。
- 描述 token 成本是目录设计的第一度量（ADR-0016 优先级链：少 token / 少请求 / 少输出）；新增或修改工具描述时保持一行话风格。
- 安装冲突风险：若与其他 DSH bundle 聚合包（如 dsh-web-all）共装，行 id 可能冲突（聚合包带 `web-ui-` 前缀 vs 独立装原 id），安装文档需说明。
- Windows 注：DSH PTY 后端 win32 不可用，涉及持久 shell 的 preset 需按梁神模式先例处理（Git Bash 无状态方案），但 WShell 三模式目录以 win-shell-mcp 工具为主，不受影响。
