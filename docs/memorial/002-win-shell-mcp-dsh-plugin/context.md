# Memorial 002 — win-shell-mcp 作为 deepseek-harness 插件

状态：已完成（2026-08-20 回写确认：CONTEXT.md 术语与交付形态已更新；ADR-0010/0011/0012 已同步全局 docs/adr/；ADR-0001 已标注被 0010 取代）

## 诉求

> 当前项目不仅要作为 MCP，还可以直接给 E:\work\sp\deepseek-harness 做插件，有什么好办法么？

## 追问记录

**2026-08-20 事实调查**（已查证）：
- dsh 为 Cordis 插件框架，工具插件经 `defineTool()`（`@deepseek-ai/dsh-tools`）注册到 `ctx.tools`。
- dsh 原生自带 `@deepseek-ai/dsh-mcp-client`：stdio（spawn 子进程）/ streamable-http 两传输，可零代码把 MCP server 工具注册进 `ctx.tools`。
- dsh 内置与 win-shell-mcp 重叠的工具插件：tool-bash / tool-bash-persistent / tool-pwsh / tool-fs / tool-fs-search / tool-web / tool-jobs 等。
- win-shell-mcp 58 个工具 handler 为纯 zod+node 逻辑，仅 `src/server.ts` 依赖 MCP SDK，逻辑层可独立复用。
- win-shell-mcp 工具注册经 `src/registry.ts`（zod schema + handler + aliases，统一 AnyToolResult 输出契约）。

**2026-08-20 Q1 接入形态**：
- 背景：dsh 原生 mcp-client 即可零代码接入，为何仍要"做插件"——动机需澄清。
- 提问：接入形态选哪种（零代码接入 / 原生 Cordis 插件 / 核心库抽取双入口 / 渐进混合）？动机是什么？
- **答复：选 3（核心库抽取 + 双入口）**，无补充动机说明。

**2026-08-20 事实调查（二）**：
- dsh loader 用 `createRequire` + Node 标准 `require(id)` 解析插件条目（`vendor/loader/src/internal.ts:108-109`），npm 子路径（如 `pkg/plugin`）可行，前提是包 exports 暴露对应条目。
- dsh 工具插件入口模式：`export const name / inject / Config / apply`（Cordis 插件约定），`defineTool()` 来自 `@deepseek-ai/dsh-tools`，schema 用 `@deepseek-ai/schemastery`。

**2026-08-20 Q2 仓库形态**：
- 提问：单包多入口 vs 仓库内 monorepo vs core 独立包。
- **答复：选 1（同包多入口）**：单 npm 包，tsup 多 entry，exports 暴露 `./core` / `./mcp` / `./plugin` 子路径；dsh 相关依赖以 peerDependencies 声明。cordis.yml `require: "win-shell-mcp/plugin"`。

**2026-08-20 事实调查（五）— 命名与契约**：
- dsh 内置工具名：bash / pwsh / read / write / edit / read_image（裸名）；win-shell-mcp 全部域前缀命名（fs_read / shell_exec / net_get / git_*…）——**无重名**，全量注册无需改名。
- dsh `ToolResult` 契约 = `{ content: ContentBlock[], isError }`；win-shell-mcp `AnyToolResult` = `{ok, data}` 统一 JSON——薄壳需一层输出适配：`AnyToolResult → {content:[{type:'text', text: JSON.stringify(result)}], isError: !ok}`。

**2026-08-20 Q5 输出形态**：
- 提问：整包 JSON / 拆包纯文本 / 双轨。
- **答复：选 1（整包 JSON）**：`{content:[{type:'text', text: JSON.stringify(AnyToolResult)}], isError: !ok}`，保持统一契约。

**2026-08-20 事实调查（六）— schema 兼容性**：
- dsh `ParameterSchemaSpec` = 每属性 `required?: true` 注解格式（`packages/core/tools/src/schema.ts:97-106`），与 MCP inputSchema 格式一致。
- win-shell-mcp 已用 `toJsonSchemaCompat`（server.ts:17）做 zod→该格式转换——**插件适配层可复用，零新依赖**。
- 风险点（实施期验证）：dsh ValueSchemaSpec 仅支持 string/number/integer/boolean/null/array/object/json/oneOf；zod 转换产物若含其他关键字需裁剪。

**2026-08-20 Q6 核心库抽取粒度**：
- 提问：只改构建（目录不动）/ 物理整理 src/core/ / 抽 src/lib/。
- **答复：选 1（只改构建）**，并授权"其他自行决策"——以下 D7-D11 由 grill 主导方拍板，供用户复核。

**2026-08-20 自行决策（用户已授权，可推翻）**：
- **D7 插件 Config**：`{ exclude?: string[] }`（按工具名/域前缀排除，默认全量注册）。
- **D8 依赖声明**：`@deepseek-ai/dsh-tools` 为 peerDependencies + peerDependenciesMeta optional；`@deepseek-ai/cordis` 仅 devDep（type-only import）；MCP 用户安装不受影响。
- **D9 验证方式**：仓库内 vitest 单测（mock ctx 收集注册，验证 58 工具注册/执行/输出转换）+ deepseek-harness 本地 cordis.yml（file: 路径）冒烟验收。
- **D10 插件命名**：Cordis 插件 `name = 'tool-win-shell'`；dsh 无 aliases 概念，只注册正名（aliases 保留给 MCP 侧）。
- **D11 构建**：tsup entry 改为 `src/index.ts` + `src/plugin.ts` + `src/core.ts`；banner 移除，`#!/usr/bin/env node` 移入 index.ts 源码首行（esbuild 保留 shebang）；exports 增加 `./core` / `./plugin`。
- **实施期验证项**（非决策）：zod→dsh schema 的额外关键字裁剪；@deepseek-ai/dsh-tools 从 npm 安装可行性（其为 workspace 发布包）。

**2026-08-20 事实调查（三）— tool-bash 能力面**：
- tool-bash 是**单一 bash 工具**：参数 = command + description + timeoutMs + workdir + run_in_background + sandbox_permissions/justification（`packages/shell/tool-bash/src/index.ts:242-270`）。
- 基于 `ctx.shell` 能力缝（executor 可插拔：bash-local / pwsh-local）；能力：沙箱（landlock 文件限制 + mode 升级审批）、后台任务（ctx.jobs）、DSH_* 托管环境变量（shellEnv）、输出截断 + spill 文件、终端渲染卡片 + exit code pill。
- 每次调用全新 shell，无状态（模型必须传 workdir 而非 cd）；沙箱 denial 要求模型理解 mode 并走审批流程——模型侧认知负担高，是"错误率高"的结构性来源。
- **dsh 无 git / pkg / archive / hash / json / net(dns/tcp/ping/listen) 工具插件**——这些域是空白；shell 域只有 bash / pwsh / bash-persistent。
- win-shell-mcp `shell_exec`：跨平台（Windows cmd.exe / unix sh -c）、GBK/UTF-8 自动识别、超时杀进程、stdin 注入、verbose 输出——与 tool-bash 定位不同：确定性、结构化、Windows 优先。

**2026-08-20 Q3 插件定位**：
- 提问：插件包装什么——补空白域（git/pkg/archive/hash/json/net）？全量 58？只做 shell_exec 强化？
- **答复：选 2（全量 58 工具）**；dsh 侧 disable 内置 tool-bash/tool-fs，win-shell-mcp 成为统一命令来源。

**2026-08-20 事实调查（四）— 能力接入澄清**：
- 修正前说法："薄壳享受不到 dsh 原生能力"不准确。
- `ctx.approval`（审批）、`ctx.jobs`（后台）、`ctx.shellEnv`（DSH_* 环境）、`defineTool` 的 presentCall/presentResult（渲染）均为插件可主动接入的服务，与 tool-bash 同路径。
- 唯一硬限制：OS 级强制沙箱（landlock）在 executor 层实现，自 spawn 拿不到；且 landlock 仅 Linux，Windows 本无此沙箱。

**2026-08-20 Q4 接入深度**：
- 提问：薄壳原样注册 vs 深度集成（接 approval/jobs/sandboxPolicy/渲染）vs 渐进。
- **答复：选 1（薄壳）**——defineTool 注册，handler 原样调核心库，不接 dsh 服务。

## 决策汇总

- **D1（2026-08-20）接入形态 = 核心库抽取 + 双入口**：抽纯逻辑核心库，MCP server 与 Cordis 插件均为薄壳。单一逻辑源，两栖长期最干净，未来可扩展更多入口。
- **D2（2026-08-20）插件定位 = 全量 58 工具**：dsh 侧 disable 内置 tool-bash/tool-fs 等重叠工具，win-shell-mcp 成为统一命令来源。
- **D3（2026-08-20）接入深度 = 薄壳**：defineTool 注册，handler 原样调核心库，不接 ctx.approval/jobs/sandboxPolicy/渲染，保留统一 AnyToolResult 输出契约。
- **D4（2026-08-20）仓库形态 = 同包多入口**：单 npm 包 + tsup 多 entry，exports 暴露 `./core` / `./mcp` / `./plugin`；dsh 依赖（@deepseek-ai/dsh-tools 等）以 peerDependencies 声明；cordis.yml `require: "win-shell-mcp/plugin"`。
- **D5（2026-08-20）输出形态 = 整包 JSON**：适配层 `AnyToolResult → {content:[{type:'text', text: JSON.stringify(result)}], isError: !ok}`。
- **D6（2026-08-20）核心库抽取 = 只改构建**：目录不动，现有 src/ 即核心库；tsup 多 entry + exports 子路径切分边界。
- **D7（2026-08-20）插件 Config = `{ exclude?: string[] }`**：按工具名/域前缀排除，默认全量。
- **D8（2026-08-20）依赖策略**：dsh-tools 为 optional peerDependency；cordis 仅 devDep 类型导入。
- **D9（2026-08-20）验证 = 仓库内单测 + dsh 本地冒烟**。
- **D10（2026-08-20）插件名 = `tool-win-shell`**，仅注册正名。
- **D11（2026-08-20）构建 = 三入口 + shebang 移入源码**。

## 待澄清

（空）