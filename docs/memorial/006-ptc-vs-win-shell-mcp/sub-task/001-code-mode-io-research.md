# 工单 001 — 调研 dsh Code Mode 的输入输出设计与 win-shell-mcp 的可吸收点

状态：已完成（2026-08-25 10:25）

## 任务描述

在 `E:\work\sp\deepseek-harness` 仓库中调研 Code Mode（PTC）的输入输出设计，与 `E:\work\sp\win-shell-mcp` 当前的工具输入输出契约对比，识别 win-shell-mcp 值得吸收的设计。

## 明确问题

1. **Code Mode 输入面**：
   - `run_code` 参数形态 `{code, description}` 中 `description` 的用途与先例；
   - 程序内子调用 `await tools.xxx(args)` 的参数传递机制（无损 JSON 快照？哪些值会被拒绝：undefined/BigInt/循环引用等）。
2. **Code Mode 输出面**：
   - `run_code` 返回结构 `{value, logs, error?}`——logs 与 value 如何分离，各自如何进入模型上下文与 UI 卡片；
   - 失败分类学 `CodeRunFailure` 六种 kind（exception/timeout/abort/worker-exit/invalid-output/output-limit）及各自设计动机；
   - 三重预算 `computeMs` / `maxWallMs` / `maxOutputBytes` 分别约束什么、中间绑定值是否受限。
3. **类型化工具返回值**（`.agents/notes/implemented/feature/2026-07-20-code-mode-typed-tool-returns.zh.md`）：
   - 「生成的输出映射」是什么？工具 output schema 如何变成 SDK 中的返回类型？
   - 「规范绑定值」（canonical value）对工具返回形态的要求；
   - `ToolCallError` 的暴露面（name/toolName/message）。
4. **dsh 工具定义的输出强制项**：defineTool 的 `output { schema, render, presentationMeta? }` 是否强制？工具主体返回值与 output schema 的关系（canonical value 约束）。
5. **对比 win-shell-mcp 现状**（重点 `src/contract/output.ts`、`src/registry.ts`、`src/server.ts`）：
   - `AnyToolResult {ok, data}` 与上述设计的差距（有无 logs/value 分离？有无失败分类学？有无每工具输出 schema？MCP outputSchema 是否声明？）；
   - 截断/溢出处理现状（如 search_content 的 maxResults、shell_exec 的截断行为）。
6. **可吸收点清单**：按三档归类——A 通用 MCP 面也受益 / B 仅 dsh 插件面受益 / C 不值得吸收；逐项给依据。

## 期望产出

- 本文件追加「调查结论」节：逐题给出结论 + 来源（`文件路径:行号` 或 note 文件名）；
- 「可吸收点清单」表格：吸收项 | 档位(A/B/C) | 依据 | 影响面；
- 结尾注明完成时间，并把顶部「状态」改为「已完成」。

## 硬性指令（给执行 agent）

读取本工单 → 只读调研（禁止修改两个仓库的任何代码与文档，本工单文件除外）→ 将结论 + 来源 + 完成时间追加写回**本工单文件**，状态改为「已完成」。唯一产出落点是本工单文件；禁止写到 docs/report/ 或其它位置。

---

## 调查结论（由 memorial captain 补充完成）

完成时间：2026-08-25 10:15

### 1. Code Mode 输入面

**来源**：`E:\work\sp\deepseek-harness\.agents\notes\implemented\feature\2026-06-15-code-mode.zh.md:40-53`；`packages\core\tools\src\ts-types.ts:250-258`

- `run_code` 参数为 `{ code: string; description: string }`，其中 `description` 沿用了 bash 工具的先例——用于 UI 标注该调用（presentCall 创建 generic 卡片，kind='execute'，程序文本作标题）。
- 子调用参数在分发前快照为**无损 JSON**（`packages\core\tools\src\ts-types.ts:52` 及 note §绑定值与失败）。**被拒绝的值**：undefined、BigInt、循环引用、稀疏数组、-0、函数、非普通对象（`packages\core\tools\src\ts-types.ts:52`）。

### 2. Code Mode 输出面

**来源**：`packages\code-runtime\code-runtime\src\types.ts:103-127`；`2026-06-15-code-mode.zh.md:59-65`

- `CodeRunResult = { value?: CodeJsonValue; logs: string[]; error?: CodeRunFailure }`。logs 与完成值分离；只有 program 的 `return` 和 `console.log` 输出进入模型上下文，中间绑定值不回上下文。
- **六种失败 kind**（正交、独立报告）：
  - `exception`：程序抛异常或解析失败
  - `timeout`：预算到期（computeMs 或 maxWallMs）
  - `abort`：外层 signal 触发
  - `worker-exit`：执行基底死亡（如 OOM）
  - `invalid-output`：完成值不是无损 JSON
  - `output-limit`：序列化后的 logs/value/diagnostic 超过 maxOutputBytes
- **三重预算**：`computeMs`（worker 忙碌时间，防热循环）、`maxWallMs`（总经过时间，防慢速 await 泄漏）、`maxOutputBytes`（只约束外层结果组合，**中间绑定值无字节上限**）。

### 3. 类型化工具返回值

**来源**：`2026-07-20-code-mode-typed-tool-returns.zh.md:21-46`；`packages\core\tools\src\ts-types.ts:273-293`

- 每个可见工具同时投影**参数 schema** 和**分离的规范输出 schema** 为 SDK 声明：
  ```ts
  interface ToolArgsMap { [toolName]: paramType }
  interface ToolOutputMap { [toolName]: outputType }
  declare const tools: { [K in ToolName]: (args: ToolArgsMap[K]) => Promise<ToolOutputMap[K]> }
  ```
- `jsonSchemaToTs()` 覆盖统一 schema 的 object/array/string/number/integer/boolean/null/JSON/enum/const/oneOf；不支持则降级为 `unknown`（`ts-types.ts:240-246`）。
- **规范绑定值**：工具主体必须返回 output schema 声明的规范 JSON 值；Native content 与元数据不传入程序（`2026-07-20-code-mode-typed-tool-returns.zh.md:52`）。
- `ToolCallError` 只暴露 `toolName` + `message`，**不暴露错误代码联合**——用于控制流而非程序分类（`2026-07-20-code-mode-typed-tool-returns.zh.md:54`）。

### 4. dsh 工具定义的输出强制项

**来源**：`packages\core\tools\src\schema.ts`（通过 `README.zh.md:43` 间接引用）；`2026-07-20-code-mode-typed-tool-returns.zh.md:13`

- `defineTool` 的 `ToolDefinition` 包含**必填**的 `output: { schema, render, presentationMeta? }`。
- 工具主体只能返回 output schema 声明的规范 JSON 值；`finalizeContent` 替换展示内容但不替换值。
- 这意味着：**dsh 插件入口要求每个工具必须声明输出 schema**——win-shell-mcp 当前无此字段，插件化时必须补上。

### 5. win-shell-mcp 现状差距

**来源**：`E:\work\sp\win-shell-mcp\src\contract\output.ts`（全文）；`src\registry.ts:74-85`；`src\server.ts:36-48`

| 维度 | win-shell-mcp 现状 | Code Mode / dsh 要求 | 差距 |
|------|-------------------|---------------------|------|
| 每工具输出 schema | ❌ `Tool` 接口只有 `inputSchema`，无 `outputSchema` | ✅ 必填（dsh defineTool）/ 可选但支持（MCP spec `outputSchema`） | **大** |
| 输出结构 | `{ok, data}` 泛型包装，data 为 `Record<string,unknown>` | 规范 JSON 值，由 output schema 声明类型 | **大** |
| MCP 注册 | listTools 只传 `name/description/inputSchema` | 可传 `outputSchema` + `annotations`（readOnlyHint 等） | **中** |
| 失败分类 | 二元：ok / fail(code, message) | 六种正交 kind + 程序级 ToolCallError | 中（但方向不同） |
| logs/value 分离 | ❌ 无，全部塞进 data | ✅ 外层结果分离 logs 与 value | 小（工具级不需要） |
| 截断策略 | 文本截断 2000 字符（`truncate()`） | 外层结果硬上限 64MiB（output-limit 失败） | 小（层级不同） |
| 注解 | ❌ 无 | MCP `ToolAnnotations`（readOnlyHint 等） | **中**（已决策吸收） |

### 6. 可吸收点清单

| 吸收项 | 档位 | 依据 | 影响面 |
|--------|------|------|--------|
| **每工具声明 outputSchema** | **A** | MCP spec 1.30.0 原生支持（`spec.types.d.ts:1195-1208`）；dsh defineTool 强制要求；SDK 生成 typed returns 依赖它 | 通用 MCP + dsh 插件 + Code Mode 三受益 |
| **每工具声明 MCP annotations**（readOnlyHint/destructiveHint/idempotentHint） | **A** | 标准协议字段，通用客户端可直接用于 UI/只读检测；已决策作为并发分类单一事实源（D4） | 通用 MCP + dsh 插件双受益 |
| **输出 schema 从 zod 推导** | **B→A** | zod→JSON Schema 已有基础设施（`toJsonSchemaCompat`），扩展到 output 侧成本低；若 output 也用 zod 声明，则 MCP 与 dsh 面自动同步 | 主要受益 dsh 插件，但 MCP 面也获得 structuredContent |
| **失败分类学（6-kind）** | **C** | win-shell-mcp 是原子命令层，非程序运行时；二元 ok/fail 足够，6-kind 是 runtime 级概念，工具层引入过度复杂 | 不建议吸收 |
| **logs/value 分离** | **C** | 工具是单次调用，不是程序；分离在工具层无意义，且会破坏现有 `AnyToolResult` 统一契约 | 不建议吸收 |
| **description 参数模式** | **C** | shell_exec/run_command 已有 description；不是所有工具都需要（read 类工具语义自明） | 保持现状 |
| **外层结果预算（maxOutputBytes）** | **C** | 属于宿主/runtime 层职责，不应由单个工具库实现 | 不建议吸收 |

---

## 关键洞察（供 memorial 决策引用）

1. **outputSchema 是「一鱼三吃」的最强吸收点**：
   - MCP 面：`outputSchema` 让客户端知道工具返回什么结构，支持 `structuredContent` 字段；
   - dsh 插件面：`defineTool` 的 `output.schema` 是必填项，缺失则无法注册；
   - Code Mode 面：`jsonSchemaToTs()` 用 output schema 生成 `ToolOutputMap`，模型在程序里获得 `Promise<TypedReturn>` 而非 `Promise<unknown>`。

2. **win-shell-mcp 的 `AnyToolResult {ok, data}` 与 dsh 的「规范 JSON 值」不完全冲突**：
   - dsh 要求的是「主体返回的规范值」；`AnyToolResult` 是 handler 返回的**包装**。
   - 适配方式：插件层的 `execute` 函数从 `AnyToolResult` 解包——`ok ? data : throw ToolCallError`——将规范值（data）作为绑定返回值，错误转为 rejection。`output.schema` 描述的是 `data` 的结构（不含 `ok` 包装）。

3. **当前 server.ts 的 `toMcpContent` 把整包 JSON 当 text 返回**：
   - 这是 002 D5 的决策（整包 JSON）。若未来 MCP 客户端支持 `structuredContent`，可改为返回 `content: [{type:'json', json: data}]` 并引用 `outputSchema`——但那是后话，不在本次演进范围。

