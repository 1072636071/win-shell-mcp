# ADR-0018 DSH 极简原生集成：native 全量呈现 + 三模式 + 双形态

日期：2026-08-27
状态：已接受
关联：ADR-0010/0011/0012（双入口）、ADR-0014（注解并发）、ADR-0016（输出交互优先级链）、memorial 007、DSH 工单 `.agents/notes/proposed/feature/2026-08-27-concise-tool-descriptions-for-minimal-native.md`

## 背景

DSH 极简模式（minimal preset）以「2 工具 + 单行 persona」取得更高评测（99 vs 91），根源是首请求工具目录干净。但极简模式能力不足；DSH 原生工具描述冗长（bash≈800、str_replace_editor≈650、run_code≈380、workflow≈1600 字符），标准全量模式提示词被描述撑爆。win-shell-mcp 工具描述精简（实测 30–80 字符/条），58 个工具全量 native 注入总成本 ~4K，比 DSH 标准模式（~6–8K）少一半以上、能力面更广。

对比结论：三个能力缺口（read_image / web_search / lsp）win-shell-mcp 无对应实现，但 DSH 原生已具备。

## 决策

1. **呈现策略 = native 全量**：win-shell-mcp 工具 + DSH 原生工具全部以 schema 注入提示词（非 PTC/两阶段）。persona 保持单行极简（`You are a helpful software engineer assistant.`）。
2. **三模式**（DSH preset，bundle 插件交付）：
   - **WShell 标准模式**：58 win-shell-mcp 域工具（registry 61 = 58 域 + 3 meta；标准模式经 preset 的 `config.exclude` 剔除 batch_run/tool_groups/list_domain_tools）+ DSH fs 组（read/write/edit/read_image）+ web 组（web_fetch/web_search）+ lsp = 65 工具（~4.5K 描述）。
   - **WShell 全量模式**：58 win-shell-mcp + DSH 全部原生（~121 工具）。
   - **WShell 批量模式**：基于标准模式 + persona 注入批量规则（多步操作优先用 `batch_run` 一次完成）。
3. **双形态**：MCP 通用形态（现有 server）+ DSH 插件定制形态（Cordis 插件 `tool-win-shell` + bundle 插件含三 preset，一键安装）。
4. **跨仓库协作**：DSH 侧精简全部模型可见工具描述（63 个，标准=最短可准确表达语义），由 DSH 仓库工单跟踪；与 jx-mode 并存。

## 被否决的替代方案

1. **PTC（`promotedPresentation: code`，目录仅 run_code + SDK）**：目录 token 最少，但每次调用（含看图/搜网/导航）需写程序，`run_code`/SDK 段描述本身也不短，丢失 native 单次调用路径。
2. **两阶段锚定（梁神模式式）**：阶段 1 极简 2 工具锚定→阶段 2 提升。复杂度高（tool-bootstrap 定制），且阶段 1 锚定工具的 bash/str_replace_editor 描述同样冗长，与"描述精简"目标冲突。
3. **三缺口由 win-shell-mcp 实现**：read_image/web_search/lsp 有可用 DSH 原生实现，重实现属能力重复。
4. **DSH 侧只精简 3 个进入目录的原生工具**：用户明确要求全部工具精简。
5. **取代或派生 jx-mode**：取代丢知识库闭环；派生使 persona 不再极简。三模式与 jx-mode 并存。

## 后果

- 工具描述 token 成本成为目录设计的第一度量；新增/修改工具描述时保持一行话风格。
- DSH 工具成组注册（tool-fs 4 个、tool-web 2 个一组），目录构成按组挂载，无法精确到单工具（除非自定义过滤，已否决复杂度）。
- DSH 侧描述精简波及 ~20 个包、影响内置 minimal preset 锚定表面，需 DSH 侧重新验证；DSH 侧改动由该仓库 Agent Note/PR 流程约束。
- 实施顺序建议：DSH 侧描述精简（全局受益）→ win-shell-mcp bundle 插件三 preset → 验证目录 token 与轨迹。

## 修订记录

### 2026-08-28 提示词工程改造（决策不变，四项口径修正）

1. **批量规则的归属地从 persona 改到 `batch_run` 工具描述。** 原决策 2 写的是
   「批量模式 = 标准模式 + persona 注入批量规则」。实施后发现该规则与
   `batch_run` 描述里的引导句逐字重复，且 win-shell-mcp 有 MCP 与 DSH 两种交付
   形态、MCP 形态没有 persona——只有工具描述能同时覆盖两侧。规则留在描述后，
   三模式 persona 逐字相同，批量模式的差异只在目录（放行 `batch_run`）。
2. **标准/批量目录数以代码为准：64 / 65，不含 lsp。** 正文写的「+ lsp = 65」是
   PRD 期口径；commit b8c76c2 已把 `tool-lsp` 行从这两个 preset 移除（lsp 是可选
   能力，非所有 DSH 部署安装）。需要 lsp 走全量模式。
3. **persona 由「单行身份」扩为「身份 + 相对路径基准」，全量模式另带两条
   guidance。** 两个动因：① 相对路径基准原先是模型的盲区（基准 = 宿主进程
   cwd，模型无从得知，只能多花一轮调 `pwd`），现由 preset 的 `cwd` 行与
   `{{cwd}}` 同源陈述；② `complete: true` 在 DSH 装配收尾会丢弃除 persona 以外的
   所有 section，本组合挂的 plan 政策与 subagent/workflow/ralph/jobs 原生
   guidance（约 2.2K 字符）都不渲染——不写进 persona，模型就拿到工具 schema 却
   拿不到行为边界。取舍边界：只补影响"能不能安全做完"的两条。
4. **目录 token 口径修正：必须含 input schema，且中英混排不能按英文折算。**
   正文的「~4.5K 描述」与彼时表格只数 description 字符、按 3.5 字符/token 折算，
   实测按 DSH 发给模型的 `{name, description, parameters}` 形状：58 域工具
   24,716 字符，其中 input schema 占 73%、描述只占 15%，且描述与参数说明里 CJK
   占约 34%。量级为 6.5–7.5K token 一档，旧值低估 4–5 倍。结论随之调整：目录
   降本的真杠杆在 schema（参数数量、可选参数、近义工具合并），不在描述措辞。

三模式生效提示词全文（英文）与中文阅读版、每条事实的归属地与把守门禁，见
[docs/提示词工程/](../提示词工程/README.md)。
