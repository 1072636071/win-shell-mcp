/**
 * Cordis（DSH）插件入口（`./plugin` 子路径）。
 *
 * 把 `builtinTools` 投影到 DSH 的 `defineTool`，复用同一套 handler。
 * `execute` 负责把 `AnyToolResult` 解包为规范值（ok→return data）或抛
 * `ToolCallError`（fail→throw），确立后续工单复用的解包适配器模式。
 *
 * `@deepseek-ai/dsh-tools` 与 `@deepseek-ai/cordis` 为 optional peer dep：
 * 本模块仅声明最小宿主契约类型，运行时由 Cordis 注入 ctx，不硬依赖。
 * 若未安装，本模块仍可被 import（类型层面），仅在实际调用 apply 时需要
 * 宿主提供 ctx。
 */

import { builtinTools, type Tool, type ToolAnnotations } from "./registry.js";
import { callTool } from "./server.js";
import { isOk } from "./contract/output.js";
import { toJsonSchemaCompat } from "@modelcontextprotocol/sdk/server/zod-json-schema-compat.js";

/** 插件名。 */
export const name = "tool-win-shell";

/** 插件配置。 */
export interface Config {
  /** 按工具名排除（不注册）。 */
  exclude?: string[];
}

/**
 * DSH `defineTool` 的最小契约（仅声明插件所需子集）。
 *
 * 完整类型由 `@deepseek-ai/dsh-tools` 提供；此处仅声明本插件使用的字段，
 * 避免硬依赖。 Cordis 注入的 ctx.tools.defineTool 接受该形状。
 */
export interface DshToolDefinition {
  name: string;
  description: string;
  input: { schema: Record<string, unknown> };
  output: { schema: Record<string, unknown> };
  isConcurrencySafe?: (args: Record<string, unknown>) => boolean;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

/** Cordis 插件上下文最小契约。 */
export interface CordisPluginContext {
  tools: {
    defineTool(def: DshToolDefinition): void;
  };
}

/**
 * 工具调用错误（解包失败时抛出）。
 *
 * 形状对齐 DSH 的 `ToolCallError`：携带 toolName 与底层 error 的 code/message。
 * 当 `@deepseek-ai/dsh-tools` 可用时，宿主可按 instanceof ToolCallError 识别；
 * 不可用时本类仍可作为常规 Error 被捕获。
 */
export class ToolCallError extends Error {
  readonly toolName: string;
  readonly code: string;
  constructor(toolName: string, error: { code: string; message: string }) {
    super(`${toolName}: ${error.message}`);
    this.name = "ToolCallError";
    this.toolName = toolName;
    this.code = error.code;
  }
}

/** zod schema → JSON schema（复用 MCP 侧的 compat 转换器）。 */
function zodToJsonSchema(schema: unknown): Record<string, unknown> {
  return toJsonSchemaCompat(schema as never) as Record<string, unknown>;
}

/**
 * 参数级并发例外覆盖表（ADR-0014「参数级例外走插件层小覆盖表，逐例注释论证」）。
 *
 * 命中覆盖表的工具：isConcurrencySafe 由本表按调用参数判定；readOnlyHint===false
 * 且未命中者省略（dsh fail-closed 归独占）。逐例论证：
 * - git_stash：`action:'list'` 只读（不修改仓库，见 concurrency-mutating.test.ts
 *   逃生舱测试连续两次 list 结果一致）；其余 action（push/pop/apply…）变更仓库。
 *   其 base annotations.readOnlyHint===false，故默认仍独占，仅 `action:'list'` 放行并发。
 */
const PARAM_LEVEL_CONCURRENT: Record<
  string,
  (args: Record<string, unknown>) => boolean
> = {
  git_stash: (args) => args.action === "list",
};

/**
 * 派生 dsh 的 isConcurrencySafe。
 *
 * - readOnlyHint===true → `()=>true`（恒并发）
 * - readOnlyHint===false 且命中 PARAM_LEVEL_CONCURRENT 覆盖表 → 按参数逐例判定
 * - 其余 → `undefined`（省略，dsh fail-closed 归独占）
 */
function projectConcurrencySafe(
  tool: Tool,
): ((args: Record<string, unknown>) => boolean) | undefined {
  if (tool.annotations?.readOnlyHint === true) return () => true;
  return PARAM_LEVEL_CONCURRENT[tool.name];
}

/**
 * 把单个 Tool 投影为 DshToolDefinition。
 *
 * - input/output schema 经 zodToJsonSchema 转为 JSON schema
 * - isConcurrencySafe：由 projectConcurrencySafe 派生——
 *   readOnlyHint===true 返回 `()=>true`，命中参数级覆盖表按参数判定，否则省略（fail-closed）
 * - execute：调用 callTool，ok→剥离 ok 标志返回纯 data，fail→throw ToolCallError
 *
 * outputSchema 由 guard-mutating.test.ts 强制非空（全部 58 工具），此处
 * 用非空断言直接转换，不再回退到 `{ type: 'object' }` 默认值。
 */
function projectTool(tool: Tool): DshToolDefinition {
  return {
    name: tool.name,
    description: tool.description,
    input: { schema: zodToJsonSchema(tool.inputSchema) },
    output: {
      schema: zodToJsonSchema(tool.outputSchema!),
    },
    isConcurrencySafe: projectConcurrencySafe(tool),
    execute: async (args) => {
      const result = await callTool(tool.name, args);
      if (isOk(result)) {
        // 剥离 ok 标志，返回纯 data（规范值）
        const { ok: _ok, ...data } = result;
        return data;
      }
      throw new ToolCallError(tool.name, result.error);
    },
  };
}

/**
 * 插件 apply：遍历 builtinTools，全量注册到 ctx.tools。
 *
 * 工单 05 移除试点白名单后，默认注册全部 58 个工具。
 * `config.exclude` 按工具名排除，调用方可按需裁剪注册集合。
 *
 * @param ctx Cordis 插件上下文（由宿主注入）
 * @param config 插件配置
 */
export function apply(ctx: CordisPluginContext, config: Config = {}): void {
  const exclude = new Set(config.exclude ?? []);
  for (const tool of builtinTools) {
    if (exclude.has(tool.name)) continue;
    ctx.tools.defineTool(projectTool(tool));
  }
}

/** Cordis 插件对象（默认导出）。 */
export default { name, apply };

// 重新导出 ToolAnnotations 便于消费者引用类型
export type { ToolAnnotations };
