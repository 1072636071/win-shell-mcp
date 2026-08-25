# PRD：DSH 插件适配壳（双入口 PTC/Code Mode 适配）

标签：`ready-for-agent`

关联：memorial 006、ADR-0010/0011/0012/0014

---

## 问题陈述

win-shell-mcp 当前仅为 MCP stdio 单入口。随着 DSH Code Mode（PTC）能力的成熟，以及 002 号 memorial 已决策的双入口架构，项目面临以下问题：

1. **核心逻辑与 MCP SDK 耦合**：现有 `src/server.ts` 直接依赖 `@modelcontextprotocol/sdk`，同一套 handler 无法被 DSH 原生消费。
2. **DSH 侧「名不副实」**：若不经适配直接以 MCP 代理接入 DSH，58 个工具全部默认独占串行（`isConcurrencySafe` 未标注），Code Mode 的并发编排收益归零。
3. **缺少结构化输出声明**：`Tool` 接口仅有 `inputSchema`，无 `outputSchema`；DSH 的 `defineTool` 强制要求 `output.schema`，导致插件入口无法真正注册工具。
4. **MCP 客户端体验未充分**：通用宿主（Claude/Cursor 等）看不到工具的 `readOnlyHint` 和返回结构提示，无法做只读检测或结构化输出渲染。

## 解决方案

实施「适配壳」模式：

- **核心库抽取**：现有 `src/` 即核心库；handler 为纯 zod+node 逻辑，与宿主无关。
- **同包三入口**：`./mcp`（MCP server 薄壳）、`./plugin`（DSH Cordis 插件薄壳）、`./core`（纯逻辑导出）。
- **注册表元数据扩展**：每工具统一声明 `inputSchema`、`outputSchema`（zod）、`annotations`（MCP 标准 ToolAnnotations）。
- **双宿主投影**：
  - MCP 面透传 `outputSchema` + `annotations`；
  - DSH 插件面映射 `outputSchema → defineTool output.schema`，`readOnlyHint===true → isConcurrencySafe(()=>true)`。
- **防漂移护栏**：单测强制每工具显式声明 `outputSchema` 与 `annotations`，缺失即失败。

## 用户故事

1. 作为 dsh 用户，我希望 win-shell-mcp 以原生插件 `tool-win-shell` 注册到 dsh，以便在 Code Mode 下通过 `await tools.fs_read(...)` 获得类型提示和并发执行收益。
2. 作为 MCP 用户（Claude/Cursor 等），我希望工具列表包含 `outputSchema` 和 `readOnlyHint` 注解，以便客户端能更好地展示工具行为和结构化输出。
3. 作为工具作者，我希望在 registry 中只声明一次 schema 和注解，就能同时服务两个宿主，以便减少维护负担。
4. 作为 dsh 部署者，我希望 read-only 工具（如 `fs_read`、`git_status`）在 Code Mode 程序内能并发执行，以便减少挂钟时间。
5. 作为 dsh 部署者，我希望 mutating 工具（如 `fs_write`、`shell_exec`）在 Code Mode 内按提交顺序独占运行，以便避免竞态。
6. 作为测试维护者，我希望有护栏测试强制每个新工具声明 `outputSchema` 和 `annotations`，以便防止静默回归。
7. 作为核心库消费者，我希望通过 `win-shell-mcp/core` 导入纯逻辑函数，以便在自定义宿主中复用命令抽象。
8. 作为 dsh 配置者，我希望通过插件 Config 的 `exclude` 字段按需排除部分工具，以便控制 SDK 段大小。
9. 作为 CI 维护者，我希望 dsh 冒烟测试覆盖 native 并行分发与 code-mode 子调用重叠，以便在回归时立即发现并发分类错误。
10. 作为版本管理员，我希望本次交付为 minor 版本（0.1.0 → 0.2.0），以便语义化表达「新增入口、非破坏」。

## 实现决策

- **核心库边界**：现有 `src/` 目录即核心库；`src/index.ts` 保留 MCP server 入口并前移 shebang；新增 `src/plugin.ts` 为 DSH 插件入口；新增 `src/core.ts` 为纯逻辑导出入口（导出 registry、contract、exec 等）。
- **构建改造**：tsup 配置改为多 entry（`src/index.ts`、`src/plugin.ts`、`src/core.ts`）；`package.json` exports 增加 `"./core"`、`"./plugin"` 子路径；dsh 相关依赖（`@deepseek-ai/dsh-tools`、`@deepseek-ai/cordis`）以 `peerDependencies` + `peerDependenciesMeta.optional` 声明，不影响 MCP 用户安装。
- **`Tool` 接口扩展**：增加 `outputSchema: z.ZodType`（描述 success data 结构，不含 `ok` 包装）和 `annotations: ToolAnnotations`（`readOnlyHint` 为必填裁决，`destructiveHint`/`idempotentHint` 适用处补充）。
- **每工具补全 output zod schema**：全部 58 个工具 handler 文件需补充 success 返回数据的 zod 描述（如 `ShellExecMinimal`/`ShellExecFull` 的 zod 等价物）。
- **MCP 面透传**：`server.ts` 的 `listTools()` 将 `outputSchema` 和 `annotations` 传入 MCP `Tool` 定义；`toJsonSchemaCompat` 复用于 input 与 output 两侧。
- **DSH 插件面映射**：`plugin.ts` 在 `apply()` 中遍历 `builtinTools`，对每项调用 `defineTool()`：
  - `output.schema` ← 工具的 `outputSchema`
  - `isConcurrencySafe` ← `readOnlyHint === true ? () => true : undefined`（fail-closed）
  - 参数级逃生舱（如 `git_stash action:'list'`）以插件层小覆盖表实现，逐例注释论证
- **插件 Config**：`{ exclude?: string[] }`，按工具名/域前缀排除，默认全量注册。
- **输出契约保持**：`AnyToolResult {ok, data}` 不变；插件层 `execute` 负责解包——`ok === true` 时返回 `data` 作为规范值，`ok === false` 时 `throw ToolCallError(toolName, message)`。
- **并发分类规则**（已决策，见 ADR-0014）：
  - 只读族标 `readOnlyHint: true`（fs 读族、text 读族、search 族、git 只读子命令、net 探测、hash、json_get、env_get、system_*、echo、pwd、pkg_detect、process_list）
  - 必独占族标 `readOnlyHint: false`（shell_exec、run_command、fs_write/rm/mv/mkdir/touch/cp、text_replace、archive_*、net_download、env_set/unset、process_kill、pkg_run、git 变更类）
  - `net_post` 因服务端副作用语义保守标 `false`
- **版本策略**：`0.1.0 → 0.2.0`（minor：新增入口，非破坏变更）。

## 测试决策

**测试 seam：「注册表元数据 → 双宿主投影」统一契约验证**

一个高层测试 harness 覆盖完整元数据流：给定携带 `inputSchema`/`outputSchema`/`annotations` 的工具定义，经过 `createServer()`（MCP 面）和 `createPlugin()`（DSH 面）后，两个投影都正确携带这些元数据，且 handler 执行产生等价的规范值。

具体测试：

1. **护栏测试（必过）**：遍历 `builtinTools`，断言每个工具都有：
   - 非空的 `outputSchema`
   - 显式布尔值的 `annotations.readOnlyHint`
   - 缺失任一即测试失败（防漂移）
2. **双宿主投影测试**：选取代表性工具（`fs_read`——只读、`shell_exec`——独占、`git_stash`——逃生舱），验证：
   - MCP `listTools()` 输出包含正确的 `outputSchema` 和 `annotations`
   - DSH plugin 的 `defineTool` 调用携带正确的 `output.schema` 和 `isConcurrencySafe` 分类器
3. **并发分类测试**：验证 read-only 工具被分类为 parallel，mutating 工具为 exclusive；`git_stash` 的 `action:'list'` 为 parallel，其他 action 为 exclusive。
4. **规范值解包测试**：验证插件层 `execute` 对 `AnyToolResult` 的正确解包——成功时返回 data，失败时 throw `ToolCallError`。
5. **dsh 冒烟测试**：在 DSH 本地环境通过 `cordis.yml` 加载 plugin，执行：
   - Native 模式：一步内并行调用两个 read-only 工具，验证 rolling pool 重叠
   - Code Mode：程序内 `Promise.all([tools.fs_read(...), tools.git_status(...)])`，验证 `tool/code-dispatch` 事件计时显示并发
   - 独占验证：程序内顺序提交 `tools.fs_write(...)` 与 `tools.fs_read(...)`，验证 exclusive 调用排空池、阻挡后续
6. **构建测试**：验证 tsup 多 entry 产出 `dist/index.js`、`dist/plugin.js`、`dist/core.js`，且 `package.json` exports 正确解析。

**测试先例**：参考现有 `src/tools/*.spec.ts` 的 vitest 风格；使用 mock 验证注册行为（如 mock `defineTool` 收集调用参数）。

## 超出范围

- DSH 深度集成（`ctx.approval`、`ctx.jobs`、`presentCall`/`presentResult`）——留作 v2 增量，首版保持 002 D3 薄壳边界。
- Code Mode 失败分类学 6-kind（`exception`/`timeout`/`abort`/`worker-exit`/`invalid-output`/`output-limit`）的引入——属于 runtime 级概念，工具层不吸收。
- `run_code` 的 `logs/value` 分离模式——工具是原子调用，非程序运行时。
- 外层预算（`computeMs`/`maxWallMs`/`maxOutputBytes`）——属于 DSH 宿主职责。
- 工具面裁剪：默认全量 58 工具注册，部署级裁剪走 `Config.exclude`（002 D7 已决策）。
- MCP `structuredContent` 字段的实际消费：当前 `toMcpContent` 仍返回整包 JSON text（002 D5），`outputSchema` 先声明到位，待未来 MCP 客户端支持后再切换渲染方式。

## 补充说明

- `outputSchema` 的引入是 DSH `defineTool` 的硬性门槛；不做则插件无法注册工具，里程碑为「假绿」。
- `AnyToolResult {ok, data}` 与 DSH「规范 JSON 值」不冲突：插件层 `execute` 负责从包装解包，`output.schema` 描述的是 `data` 的结构。
- 002 号 memorial 已决策双入口架构（ADR-0010/0011/0012），本 PRD 在其基础上增加 PTC/Code Mode 适配层（ADR-0014）。
- 新增工具时，作者只需在定义处顺手声明 `outputSchema` 与 `annotations`，护栏测试兜底。
