# ADR-0015 batch_run：单 meta 工具内串行执行 + 断言 + 步骤间引用

日期：2026-08-25
状态：已接受（已同步全局 `docs/adr/`）
关联：ADR-0003（极简输出）、memorial 007

## 背景

LLM 的输入 token 便宜、输出 token 贵。多次为确认结果而回跑工具是浪费。诉求：一次 MCP 调用内完成一串工具调用，把确定性校验（断言）前置到 server 侧，理想情况一轮解决问题。

## 决策

新增单 meta 工具 `batch_run`：

- **承载**：一次 `CallToolRequest` 调用 `batch_run`，入参 `steps: [{ tool, args, assert? }]`，server 内**按数组顺序串行**执行。
- **断言**：每步可附 `assert: [{ path, op, value? }]`，`op ∈ eq|neq|gt|gte|lt|lte|in|re|truthy|falsy`。省略 assert = 只要求该步成功。断言为纯数据、无 eval，可逐条失败归因。
- **步骤间引用**：args 与 assert 值里用模板串 `{{stepId.output.path}}` 插值；**整个值恰好等于一个引用时保持原类型**（bool/number），否则转字符串。stepId 由 LLM 在步内 `id` 指定，缺省默认 `step<N>`（1-indexed）。
- **短路**：任一步失败或 assert 不满足立即中止，不执行后续；返回仅含已执行步骤。
- **结果**：`{ allOk, steps: [{ id, tool, ok, data?, error?, assert? }], summary }`，`allOk` 仅当所有执行步骤均成功且断言通过；`summary` 极简。

  > 修订（2026-08-25 审查闭环）：聚合判定字段由草案 `ok` 调整为 `allOk`——契约层 ADR-0003 已用 `ok` 表示"工具调用本身成功"（batch_run 恒 `ok:true`），同名会覆盖契约 ok 致 `isOk/isFail` 误判。

  > 修订（2026-08-26，工单 09 输出极简）：「结果」形态改为超集 `{ allOk, summary, steps?, failedStep? }`——默认只回聚合结论 `{ allOk, summary }`，失败附 `failedStep`（即原 `steps` 中失败那条，结构同形）；新增可选入参 `verbose: true` 时才返回每步完整 `steps`（与原形态一致）。依据 ADR-0003 极简输出在批量层的延续与 ADR-0016 链第 3 项；步骤间引用在 server 内部照常流转不受影响。破坏性变更处于 ADR-0007 的 0.x 纠错窗口。

## 被否决的替代方案

1. **宿主层并发/串行多调用**：不省输出轮次，与诉求冲突。
2. **recipe 文件执行器**：多一层 IO 与文件管理，步骤要先落盘，不如直接入参。
3. **表达式 DSL 断言**：需自写 parser + 防注入，违背极简；出错难归因。
4. **`$ref` 引用对象**：类型稳妥但形态怪异；采用模板插值并以"单引用保类型"约定换取更直观书写。

## 后果

- 新增 `src/tools/batch.ts`（或并入 core），registry 注册 1 个新工具（58 → 59）。
- 既有单工具不变；batch 仅复用各 tool 的 handler 与 outputSchema。
- 保持"无 eval、确定性、极简"三约束；ADR-0003 的极简输出原则在批量编排层延续。
