# PRD-07：Token 消耗优化与 AI 易用性提升

Status: ready-for-agent
日期：2026-08-25
关联：ADR-0003（极简输出）、ADR-0015（batch_run）、ADR-0011（全量注册）

## 背景

win-shell-mcp 当前 59 个工具（58 + batch_run），以 MCP Server 形态供 AI 调用。已做 token 优化：极简输出、verbose 开关、长内容截断、batch_run 一轮解决多步、outputSchema 防漂移。

本文档记录在现有基础上进一步降低 token 消耗、提升 AI 易用性的优化点，按投入产出比排序。源自对当前项目的全面审查。

## 优化点清单

### P0-1：精简工具描述与 inputSchema describe

**问题**：59 个工具的 `name + description + inputSchema + outputSchema + annotations` 在每次 `ListTools` 时全量返回，是每次会话的固定开销（估算 4000-8000 token）。

**方案**：
- 压缩每个工具的 `description` 到"一句话 + 关键约束"，细节交给 `inputSchema` 的 `.describe()`
- 精简每个字段 `.describe()`，去掉字段名+类型已能表达的信息（如 `path: z.string().describe('目录路径（绝对或相对）')` → `describe('路径')`）
- 原则：description 是给 AI 选工具用的，不是说明书

**预估收益**：固定开销降 30-50%
**工作量**：半天
**风险**：描述过简导致 AI 误选工具——需逐工具校验精简后语义无损

### P0-2：batch_run 输出默认极简

**问题**：batch_run 当前返回所有步骤的完整 data，体量大，违背 ADR-0003 极简原则在批量层的延续。

**方案**：
- 默认只返回 `{ ok, summary, failedStep? }`（失败时附失败步骤详情）
- `verbose: true` 才返回每步完整 data
- summary 极简（如 `"3/3 步骤成功"` 或 `"步骤 2 失败: ENOENT"`）

**预估收益**：多步操作输出 token 降 70%+
**工作量**：2 小时
**风险**：AI 调试 batch 时需要 verbose 才能看详情——可接受，失败时 failedStep 已含诊断信息

### P0-3：batch_run description 主动引导使用

**问题**：batch_run 已实现但 AI 不一定主动用，token 节省落空。

**方案**：
- batch_run 的 description 明确写："多步操作请优先用 batch_run 一次完成，避免多轮往返"
- 附典型场景示例："如：读文件→grep→替换→写回，用 batch_run 一次完成"

**预估收益**：AI 多步操作回合数下降
**工作量**：30 分钟
**风险**：无

### P1-1：按域分组的懒加载机制

**问题**：一次列出全部 59 工具的固定开销随工具数线性增长。

**方案**：
- 加一个 `tool_groups` 元工具，AI 先看到 15 个域概览
- 按需 `list_tools(domain: "git")` 加载该域工具
- 日常任务通常只用 2-3 个域，固定开销从 59 工具降到 15 域 + 2-3 域工具

**预估收益**：固定开销降 60-80%（典型任务）
**工作量**：1-2 天
**风险**：
- 多一轮交互
- 需 AI 客户端支持动态工具发现（MCP 协议支持，但客户端实现未必）
- 与 ADR-0011（全量注册不裁剪）不冲突——那是 dsh 插件面决策，MCP server 面可更激进
**前提**：需先验证目标 AI 客户端支持动态 list_tools

### P1-2：工具子集白名单配置

**问题**：不同场景用不同工具子集，全量暴露是浪费。

**方案**：
- MCP server 面加 `WIN_SHELL_TOOLS` 环境变量白名单（逗号分隔工具名）
- 未列出的工具不注册，直接砍掉固定开销
- 与 dsh 插件的 `config.exclude` 对称

**预估收益**：按用户裁剪，极端场景可降 80%+
**工作量**：2 小时
**风险**：AI 请求未暴露的工具会报错——需清晰错误提示

### P1-3：AI 工具速查文档

**问题**：README 工具清单是给人看的表格，AI 读 README 也花 token。

**方案**：
- 新建 `docs/ai-tool-cheatsheet.md`：极简速查表，每工具一行 `name | 一句话用途 | 关键参数 | 别名`
- 在 AGENTS.md 指向它，agent 技能加载时优先读这个而非整个 README
- 把 59 个工具压到 59 行

**预估收益**：AI 获取工具概览的 token 降 70%+
**工作量**：2 小时
**风险**：需与 README 同步维护——可加 CI 检查防漂移

### P2-1：别名机制宣传与扩充

**问题**：有别名机制（ls→fs_list、cat→text_cat）但 AI 可能不知道，每次打全名。

**方案**：
- 在 README 和工具 description 明确列出别名
- 考虑增加高频短别名：`rm`/`mv`/`cp`/`grep`/`wc`/`df`(system_disk)/`ps`(process_list)
- 别名更短 = AI 生成更少 token

**预估收益**：每次工具调用省几个 token，累积可观
**工作量**：2 小时
**风险**：别名过多增加记忆负担——需克制，只加真正高频的

### P2-2：输出契约细节打磨

**方案**：
- 错误信息带 hint 但控长度（AI 自己知道用 fs_list，不用教）
- 截断阈值可配置：加 `WIN_SHELL_TRUNCATE` 环境变量（默认 2000，token 敏感场景调 500-1000）
- 空结果极简：`fs_list` 空目录返回 `{ ok: true, entries: [] }`，不加 count/message

**预估收益**：每次错误/空结果省 20-50 token
**工作量**：3 小时
**风险**：无

### P2-3：常见 batch 预设文档

**方案**：
- 在 `docs/batch-presets/` 下维护常见 batch 模板：git 提交推送、读改写回、搜索替换等
- AI 先查预设套用，不用每次从零编排
- 比"recipe 文件执行器"（ADR-0015 已否决）更轻——只是文档示例，不是代码

**预估收益**：AI 编排 batch 的 token 降
**工作量**：2 小时
**风险**：预设过时误导——需标注适用场景与维护状态

### P3-1：开发体验优化

**方案**：
- `.temp/scripts/` 积累常用脚本（分析工具描述长度、统计覆盖率等），AI 复用而非重写
- vitest reporter 配置让失败输出更精简，AI debug 少读噪音
- CHANGELOG 生成只读 git log commit message，不读整个 diff

**预估收益**：开发会话 token 降
**工作量**：半天
**风险**：无

## 优先级总结

| 优先级 | 动作 | 预估收益 | 工作量 |
|--------|------|----------|--------|
| P0 | 精简 59 工具 description + inputSchema describe | 固定开销降 30-50% | 半天 |
| P0 | batch_run 输出默认极简 | 多步输出 token 降 70%+ | 2 小时 |
| P0 | batch_run description 推销 | AI 多步回合数下降 | 30 分钟 |
| P1 | 按域懒加载机制 | 固定开销降 60-80% | 1-2 天 |
| P1 | 工具子集白名单配置 | 按用户裁剪 | 2 小时 |
| P1 | AI 工具速查文档 | 概览 token 降 70%+ | 2 小时 |
| P2 | 别名宣传与扩充 | 累积省 token | 2 小时 |
| P2 | 输出契约细节打磨 | 每次省 20-50 token | 3 小时 |
| P2 | 常见 batch 预设文档 | 编排 token 降 | 2 小时 |
| P3 | 开发体验优化 | 开发会话 token 降 | 半天 |

## 工单拆解

本清单的每个优化点已经调查核实并展开为完整需求（问题陈述/解决方案/用户故事/实现决策/测试决策/超出范围），各自独立成单、均为 `ready-for-agent`：

| 优化点 | 工单 |
|--------|------|
| P0-1 精简工具描述与 inputSchema describe | `.scratch/08-tool-metadata-slimming/PRD.md` |
| P0-2 batch_run 输出默认极简 | `.scratch/09-batch-run-minimal-output/PRD.md` |
| P0-3 batch_run description 主动引导使用 | `.scratch/10-batch-run-guidance/PRD.md` |
| P1-1 按域分组的懒加载机制 | `.scratch/11-lazy-domain-loading/PRD.md` |
| P1-2 工具子集白名单配置 | `.scratch/12-tool-whitelist-env/PRD.md` |
| P1-3 AI 工具速查文档 | `.scratch/13-ai-tool-cheatsheet/PRD.md` |
| P2-1 别名机制宣传与扩充 | `.scratch/14-alias-promotion/PRD.md` |
| P2-2 输出契约细节打磨 | `.scratch/15-output-contract-polish/PRD.md` |
| P2-3 常见 batch 预设文档 | `.scratch/16-batch-presets-docs/PRD.md` |
| P3-1 开发体验优化 | `.scratch/17-dev-experience-tokens/PRD.md` |

本 PRD 保留为索引与背景综述；具体实施以各子工单为准。

## 约束

- 所有优化不得违反 ADR-0007（兼容性红线）：0.x 阶段允许破坏性修改，但需集中纠错
- 保持"无 eval、确定性、极简"三约束
- 不引入原生依赖（ADR-0005 纯 Node 原则）

## 评论

### 2026-08-25 拆解记录（jxx-to-spec）

十个优化点已逐一对照代码库调查核实，展开为 08-17 号独立工单（见"工单拆解"）。调查中确认的与现状不符之处，均已写入对应工单：

1. **别名在 MCP tools/call 不生效**：`callTool` 按正名精确匹配，别名仅 `batch_run` 内部解析；注释声称可用、实现不符——14 号工单先修复再扩充。
2. **本清单"cat→text_cat"方向写反**：正名是 `cat`，`text_cat` 是别名；"别名→正名"读法以 `ls`→`fs_list` 为准——14 号工单已纠正口径。
3. **`batch_run` 描述称"9 种断言操作符"，实为 10 种**；集成测试仍断言 58 工具（实际 59）——归入 08 号工单顺手修正。
4. **仓库尚无任何环境变量读取**：`WIN_SHELL_*` 均只见于文档；12 号工单负责建立唯一的纯函数配置模块，11/15 共用。
5. **`batch_run` 输出现状**：成功步骤 `data` 为完整工具输出且不截断；外层 `ok` 即 `allOk`——09 号工单以此为改造基线。
6. 建议实施顺序：08+10（同一次描述改写）→ 09 → 12（配置模块地基）→ 15 → 14 → 13 → 11 → 16 → 17。测试 seam 已与用户确认：复用 `listTools()/callTool()/createServer()` 既有高层 seam + 契约层，唯一新增代码 seam 为环境变量配置模块，护栏沿用 `guard-mutating.test.ts` 模式。