/**
 * batch_run 元工具（工单 01-02-03-04；输出极简见工单 09）。
 *
 * 一次调用串行执行多个工具步骤，支持断言校验与步骤间引用。
 *
 * 设计要点：
 * - 串行执行：按数组顺序逐个执行，任一步失败立即短路，后续步骤不执行。
 * - 引用解析：args 与 assert value 中支持 `{{stepId.output.path}}` 模板插值；
 *   整串单引用保原类型（bool/number/object），混合拼接转字符串。
 * - 断言引擎：10 种操作符（eq/neq/gt/gte/lt/lte/in/re/truthy/falsy），
 *   纯数据、无 eval，逐条失败归因。
 * - 输出极简（工单 09，ADR-0003 批量层延续）：默认只返回 `{ allOk, summary }`
 *   （失败附 `failedStep` 诊断），显式 `verbose: true` 才返回每步完整 `steps`；
 *   极简只作用于最终返回，内部 stepOutputs 缓存与引用链不受影响。
 * - 循环安全：batch.ts 不导入 server.ts（避免 registry→batch→server→registry 循环），
 *   直接通过 findTool 查找工具并手动校验参数。
 */

import { z } from "zod";
import { ok, fail, withVerbose, type AnyToolResult } from "../contract/output.js";
import { ErrorCode, toErrorCode, toErrorMessage } from "../contract/errors.js";
import { toFail, failFromError } from "../utils/errors.js";
import { findTool, type Tool } from "../registry.js";

// ─── 类型定义 ───────────────────────────────────────────────

/** 断言操作符全集（type / inputSchema / 断言引擎三处共享，避免重复维护枚举表）。 */
const ASSERT_OPS = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "re",
  "truthy",
  "falsy",
] as const;

/** 断言操作符。 */
type AssertOp = (typeof ASSERT_OPS)[number];

/** 单条断言定义。 */
interface BatchAssert {
  path: string;
  op: AssertOp;
  value?: unknown;
}

/** 单步定义。 */
interface BatchStep {
  id?: string;
  tool: string;
  args: Record<string, unknown>;
  assert?: BatchAssert[];
}

/** 单条断言执行结果。 */
interface AssertResult {
  path: string;
  op: string;
  passed: boolean;
  expected?: unknown;
  actual?: unknown;
  message: string;
}

/** 单步执行结果。 */
interface StepResult {
  id: string;
  tool: string;
  ok: boolean;
  data?: Record<string, unknown>;
  error?: { code: string; message: string };
  assert?: AssertResult[];
}

/** 引用解析统一结果：成功带 resolved 值，失败带 errorMessage。 */
type RefResult<T> =
  | { resolved: T; failed: false; errorMessage?: undefined }
  | { resolved: undefined; failed: true; errorMessage: string };

/** 值 → 可读字符串（错误信息与断言消息展示用）。 */
function stringifyValue(v: unknown): string {
  return v === null
    ? "null"
    : v === undefined
      ? "undefined"
      : typeof v === "object"
        ? JSON.stringify(v)
        : String(v);
}

// ─── 输入/输出 Schema ───────────────────────────────────────

/** 断言输入 schema。 */
const batchAssertInputSchema = z.object({
  path: z.string().describe("该步 data 的点路径"),
  op: z.enum(ASSERT_OPS),
  value: z.unknown().optional(),
});

/** 单步输入 schema。 */
const batchStepInputSchema = z.object({
  id: z.string().optional().describe("缺省 step<N>（1-indexed）"),
  tool: z.string(),
  args: z.record(z.string(), z.unknown()).optional().default({}),
  assert: z.array(batchAssertInputSchema).optional(),
});

/** batch_run 输入 schema。 */
export const batchRunInputSchema = z.object({
  steps: z.array(batchStepInputSchema).min(1),
  verbose: z
    .boolean()
    .optional()
    .describe("true 时返回每步完整结果 steps；默认仅返回聚合结论（失败附 failedStep）"),
});

/** 断言输出 schema。 */
const batchAssertOutputSchema = z.object({
  path: z.string(),
  op: z.string(),
  passed: z.boolean(),
  expected: z.unknown().optional(),
  actual: z.unknown().optional(),
  message: z.string(),
});

/** 单步输出 schema。 */
const batchStepOutputSchema = z.object({
  id: z.string(),
  tool: z.string(),
  ok: z.boolean(),
  data: z.record(z.string(), z.unknown()).optional(),
  error: z.object({ code: z.string(), message: z.string() }).optional(),
  assert: z.array(batchAssertOutputSchema).optional(),
});

/**
 * batch_run 输出 schema（工单 09 超集形态）。
 *
 * 默认极简：`{ allOk, summary }`，失败附 `failedStep` 诊断；
 * `verbose: true` 时附每步完整 `steps`。`steps`/`failedStep` 均 optional，
 * 子结构复用 `batchStepOutputSchema`（含 `batchAssertOutputSchema`）。
 */
export const batchRunOutputSchema = z.object({
  allOk: z.boolean().describe("整批成功（含断言通过）"),
  summary: z.string(),
  steps: z
    .array(batchStepOutputSchema)
    .optional()
    .describe("每步完整结果；仅 verbose:true 时返回"),
  failedStep: batchStepOutputSchema
    .optional()
    .describe("失败步骤诊断（短路下即最后执行的一步）；仅默认模式失败时返回"),
});

// ─── 引用解析 ───────────────────────────────────────────────

/** 引用模式：{{stepId.output.path}} */
const REF_PATTERN = /\{\{([^.]+?)\.output\.(.+?)\}\}/g;

/** 单引用正则：整个字符串恰好等于一个引用 */
const SINGLE_REF_REGEX = /^\{\{([^.]+?)\.output\.(.+?)\}\}$/;

/**
 * 从对象中按点路径取值。
 *
 * @param obj 对象
 * @param path 点路径，如 "written" 或 "nested.field"
 * @returns { value, exists }
 */
function getPath(
  obj: Record<string, unknown>,
  path: string,
): { value: unknown; exists: boolean } {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur === null || cur === undefined || typeof cur !== "object") {
      return { value: undefined, exists: false };
    }
    const record = cur as Record<string, unknown>;
    if (!(part in record)) {
      return { value: undefined, exists: false };
    }
    cur = record[part];
  }
  return { value: cur, exists: true };
}

/**
 * 从已完成步骤的输出中按 stepId + 点路径解析引用值。
 *
 * @param stepId 步骤 id
 * @param path 点路径（相对该步 data）
 * @param stepOutputs 已完成步骤的输出映射（stepId → data）
 */
function lookupRef(
  stepId: string,
  path: string,
  stepOutputs: Map<string, Record<string, unknown>>,
): { value: unknown } | { failed: true; errorMessage: string } {
  const output = stepOutputs.get(stepId);
  if (!output) {
    return { failed: true, errorMessage: `引用了不存在的步骤: ${stepId}` };
  }
  const result = getPath(output, path);
  if (!result.exists) {
    return {
      failed: true,
      errorMessage: `引用了不存在的路径: ${stepId}.output.${path}`,
    };
  }
  return { value: result.value };
}

/**
 * 混合拼接字符串：把其中所有引用替换为字符串值。
 *
 * 用 exec + 切片重建而非 `replace`——`replace` 传字符串参数只替换第一处，
 * 同一引用出现多次时会残留字面量，此处逐处替换。
 *
 * @param value 含引用的字符串
 * @param stepOutputs 已完成步骤的输出映射
 * @param wherePrefix 错误前缀（如 "在 args.x 处: "），用于归因定位
 */
function resolveMixedString(
  value: string,
  stepOutputs: Map<string, Record<string, unknown>>,
  wherePrefix: string,
): RefResult<string> {
  const parts: string[] = [];
  let lastIndex = 0;
  REF_PATTERN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = REF_PATTERN.exec(value)) !== null) {
    parts.push(value.slice(lastIndex, m.index));
    const lookup = lookupRef(m[1]!, m[2]!, stepOutputs);
    if ("failed" in lookup) {
      return {
        resolved: undefined,
        failed: true,
        errorMessage: wherePrefix + lookup.errorMessage,
      };
    }
    parts.push(stringifyValue(lookup.value));
    lastIndex = m.index + m[0].length;
  }
  parts.push(value.slice(lastIndex));
  return { resolved: parts.join(""), failed: false };
}

/**
 * 解析单个值中的引用。
 *
 * - 非字符串值：不参与引用解析，原样返回。
 * - 整串单引用：保原类型（bool/number/object）。
 * - 混合拼接：所有引用替换为字符串。
 *
 * @param value 原始值
 * @param stepOutputs 已完成步骤的输出映射
 * @param where 当前值所在路径（错误归因用），如 "args.x"
 */
function resolveRef(
  value: unknown,
  stepOutputs: Map<string, Record<string, unknown>>,
  where: string = "",
): RefResult<unknown> {
  // 非字符串值：直接返回
  if (typeof value !== "string") {
    return { resolved: value, failed: false };
  }

  const wherePrefix = where ? `在 ${where} 处: ` : "";

  // 整串单引用：保原类型
  const singleMatch = value.match(SINGLE_REF_REGEX);
  if (singleMatch) {
    const lookup = lookupRef(singleMatch[1]!, singleMatch[2]!, stepOutputs);
    if ("failed" in lookup) {
      return {
        resolved: undefined,
        failed: true,
        errorMessage: wherePrefix + lookup.errorMessage,
      };
    }
    return { resolved: lookup.value, failed: false };
  }

  // 混合拼接：替换所有引用为字符串
  return resolveMixedString(value, stepOutputs, wherePrefix);
}

/**
 * 递归解析任意值中的引用（字符串 / 对象 / 数组 / 原始值）。
 *
 * 统一服务 args 与 assert value 两处调用，避免各自维护一份递归与数组遍历。
 *
 * @param value 原始值
 * @param stepOutputs 已完成步骤的输出映射
 * @param where 当前值所在路径（错误归因用）
 */
function resolveValue(
  value: unknown,
  stepOutputs: Map<string, Record<string, unknown>>,
  where: string = "",
): RefResult<unknown> {
  if (typeof value === "string") {
    return resolveRef(value, stepOutputs, where);
  }
  if (value === null || value === undefined) {
    return { resolved: value, failed: false };
  }
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (let i = 0; i < value.length; i++) {
      const elemWhere = where ? `${where}[${i}]` : `[${i}]`;
      const itemResult = resolveValue(value[i], stepOutputs, elemWhere);
      if (itemResult.failed) {
        return itemResult;
      }
      out.push(itemResult.resolved);
    }
    return { resolved: out, failed: false };
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      const keyWhere = where ? `${where}.${key}` : key;
      const valResult = resolveValue(val, stepOutputs, keyWhere);
      if (valResult.failed) {
        return valResult;
      }
      out[key] = valResult.resolved;
    }
    return { resolved: out, failed: false };
  }
  return { resolved: value, failed: false };
}

// ─── 断言引擎 ───────────────────────────────────────────────

/** 数值比较操作符的展示信息（符号 + 通过描述），供 compareNumeric 派生，消除调用处重复三件套。 */
const NUMERIC_OP_DISPLAY: Record<
  "gt" | "gte" | "lt" | "lte",
  { symbol: string; passMsg: string }
> = {
  gt: { symbol: ">", passMsg: "大于" },
  gte: { symbol: ">=", passMsg: "大于等于" },
  lt: { symbol: "<", passMsg: "小于" },
  lte: { symbol: "<=", passMsg: "小于等于" },
};

/**
 * 数值比较断言（gt/gte/lt/lte 共用，四分支仅操作符与消息展示不同）。
 *
 * @param actual 实际值
 * @param expected 期望值
 * @param op 操作符
 * @returns { passed, message }
 */
function compareNumeric(
  actual: unknown,
  expected: unknown,
  op: "gt" | "gte" | "lt" | "lte",
): { passed: boolean; message: string } {
  if (typeof actual !== "number" || typeof expected !== "number") {
    return {
      passed: false,
      message: `${op} 操作符要求数值类型，实际 ${typeof actual}，期望 ${typeof expected}`,
    };
  }
  const passed =
    op === "gt"
      ? actual > expected
      : op === "gte"
        ? actual >= expected
        : op === "lt"
          ? actual < expected
          : actual <= expected;
  const display = NUMERIC_OP_DISPLAY[op];
  return {
    passed,
    message: passed
      ? display.passMsg
      : `期望 ${display.symbol} ${stringifyValue(expected)}，实际 ${stringifyValue(actual)}`,
  };
}

/**
 * 执行单条断言。
 *
 * @param actual 实际值（从步骤输出中按 path 取值）
 * @param op 操作符
 * @param expected 期望值
 * @returns { passed, message }
 */
function runAssertion(
  actual: unknown,
  op: AssertOp,
  expected: unknown,
): { passed: boolean; message: string } {
  const str = stringifyValue;

  switch (op) {
    case "eq":
      return {
        passed: actual === expected,
        message:
          actual === expected
            ? "相等"
            : `期望 ${str(expected)}，实际 ${str(actual)}`,
      };
    case "neq":
      return {
        passed: actual !== expected,
        message: actual !== expected ? "不等" : `期望不等于 ${str(expected)}`,
      };
    case "gt":
      return compareNumeric(actual, expected, "gt");
    case "gte":
      return compareNumeric(actual, expected, "gte");
    case "lt":
      return compareNumeric(actual, expected, "lt");
    case "lte":
      return compareNumeric(actual, expected, "lte");
    case "in":
      if (!Array.isArray(expected)) {
        return {
          passed: false,
          message: `in 操作符期望数组，实际 ${typeof expected}`,
        };
      }
      return {
        passed: expected.includes(actual),
        message: expected.includes(actual)
          ? "在集合中"
          : `实际值 ${str(actual)} 不在期望集合中`,
      };
    case "re": {
      if (typeof expected !== "string") {
        return {
          passed: false,
          message: `re 操作符期望字符串模式，实际 ${typeof expected}`,
        };
      }
      if (typeof actual !== "string") {
        return {
          passed: false,
          message: `re 操作符要求实际值为字符串，实际 ${typeof actual}`,
        };
      }
      try {
        const regex = new RegExp(expected);
        const matched = regex.test(actual);
        return {
          passed: matched,
          message: matched
            ? "正则匹配"
            : `实际值 ${str(actual)} 不匹配模式 ${str(expected)}`,
        };
      } catch (e) {
        return {
          passed: false,
          message: `正则模式非法: ${toErrorMessage(e)}`,
        };
      }
    }
    case "truthy":
      return {
        passed: Boolean(actual) === true,
        message:
          Boolean(actual) === true ? "为真" : `期望真值，实际 ${str(actual)}`,
      };
    case "falsy":
      return {
        passed: Boolean(actual) === false,
        message:
          Boolean(actual) === false ? "为假" : `期望假值，实际 ${str(actual)}`,
      };
    default:
      return { passed: false, message: `未知操作符: ${op}` };
  }
}

/**
 * 执行单步的所有断言。
 *
 * @param data 步骤成功时的输出数据
 * @param asserts 断言列表
 * @param stepOutputs 已完成步骤的输出映射（用于解析断言 value 中的引用）
 * @returns { results, allPassed } —— allPassed 即整组断言是否全通过
 */
function runAsserts(
  data: Record<string, unknown>,
  asserts: BatchAssert[],
  stepOutputs: Map<string, Record<string, unknown>>,
): {
  results: AssertResult[];
  allPassed: boolean;
} {
  const results: AssertResult[] = [];
  let allPassed = true;

  for (const a of asserts) {
    // 解析断言 value 中的引用
    const valueResult = resolveValue(a.value, stepOutputs);
    if (valueResult.failed) {
      const result: AssertResult = {
        path: a.path,
        op: a.op,
        passed: false,
        expected: a.value,
        actual: undefined,
        message: `断言值引用解析失败: ${valueResult.errorMessage}`,
      };
      results.push(result);
      allPassed = false;
      continue;
    }

    // 从步骤输出中按 path 取值
    const pathResult = getPath(data, a.path);
    if (!pathResult.exists) {
      const result: AssertResult = {
        path: a.path,
        op: a.op,
        passed: false,
        expected: valueResult.resolved,
        actual: undefined,
        message: `路径不存在: ${a.path}`,
      };
      results.push(result);
      allPassed = false;
      continue;
    }

    // 执行断言
    const assertResult = runAssertion(
      pathResult.value,
      a.op,
      valueResult.resolved,
    );
    const result: AssertResult = {
      path: a.path,
      op: a.op,
      passed: assertResult.passed,
      expected: valueResult.resolved,
      actual: pathResult.value,
      message: assertResult.message,
    };
    results.push(result);
    if (!assertResult.passed) {
      allPassed = false;
    }
  }

  return { results, allPassed };
}

// ─── Handler ────────────────────────────────────────────────

/**
 * batch_run handler。
 *
 * 串行执行步骤，任一步失败立即短路。
 */
export async function batchRunHandler(
  args: Record<string, unknown>,
): Promise<AnyToolResult> {
  const raw = args as { steps?: unknown; verbose?: unknown };
  // 非空校验与 inputSchema 的 .min(1) 对齐（纵深防御）：MCP 路径恒经 schema 拒绝
  // 空数组，此守卫兜住绕过 schema 直接调用 handler 的场景。
  if (!Array.isArray(raw.steps) || raw.steps.length === 0) {
    return fail(ErrorCode.EINVAL, "batch_run 需要非空 steps 数组");
  }
  // 工单 09：仅显式 true 时返回每步完整结果；默认（含省略/false）走极简输出。
  const verbose = raw.verbose === true;

  const stepsRaw = raw.steps as unknown[];
  const steps: BatchStep[] = [];

  // 校验并解析每个步骤
  for (let i = 0; i < stepsRaw.length; i++) {
    const stepRaw = stepsRaw[i]!;
    if (!stepRaw || typeof stepRaw !== "object") {
      return fail(ErrorCode.EINVAL, `步骤 ${i + 1} 必须是对象`);
    }
    const parsed = batchStepInputSchema.safeParse(stepRaw);
    if (!parsed.success) {
      return fail(
        ErrorCode.EINVAL,
        `步骤 ${i + 1} 参数非法: ${toErrorMessage(parsed.error)}`,
      );
    }
    const data = parsed.data;
    steps.push({
      id: data.id,
      tool: data.tool,
      args: data.args,
      assert: data.assert,
    });
  }

  // 生成缺省 id
  const stepIds = new Set<string>();
  for (let i = 0; i < steps.length; i++) {
    if (!steps[i]!.id) {
      steps[i]!.id = `step${i + 1}`;
    }
    // 检查 id 唯一性
    if (stepIds.has(steps[i]!.id!)) {
      return fail(ErrorCode.EINVAL, `步骤 id 重复: ${steps[i]!.id}`);
    }
    stepIds.add(steps[i]!.id!);
  }

  const executed: StepResult[] = [];
  const stepOutputs = new Map<string, Record<string, unknown>>();

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    const stepId = step.id!;

    // ── 1. 解析 args 中的引用 ──
    const argsRefResult = resolveValue(step.args, stepOutputs);
    if (argsRefResult.failed) {
      executed.push({
        id: stepId,
        tool: step.tool,
        ok: false,
        error: {
          code: ErrorCode.EINVAL,
          message: `参数引用解析失败: ${argsRefResult.errorMessage}`,
        },
      });
      // 短路：参数解析失败，中止
      break;
    }
    const resolvedArgs = argsRefResult.resolved;

    // ── 2. 查找工具 ──
    const tool = findTool(step.tool);
    if (!tool) {
      executed.push({
        id: stepId,
        tool: step.tool,
        ok: false,
        error: {
          code: ErrorCode.EINVAL,
          message: `未知工具: ${step.tool}`,
        },
      });
      // 短路：工具不存在，中止
      break;
    }

    // ── 3. 校验参数 ──
    const parsed = tool.inputSchema.safeParse(resolvedArgs);
    if (!parsed.success) {
      executed.push({
        id: stepId,
        tool: step.tool,
        ok: false,
        error: {
          code: ErrorCode.EINVAL,
          message: `参数非法: ${toErrorMessage(parsed.error)}`,
        },
      });
      // 短路：参数非法，中止
      break;
    }

    // ── 4. 调用 handler ──
    let toolResult: AnyToolResult;
    try {
      toolResult = await tool.handler(parsed.data as Record<string, unknown>);
    } catch (err) {
      toolResult = failFromError(err);
    }

    // ── 5. 处理结果 ──
    if (toolResult.ok === false) {
      executed.push({
        id: stepId,
        tool: step.tool,
        ok: false,
        error: {
          code: toolResult.error.code,
          message: toolResult.error.message,
        },
      });
      // 短路：工具执行失败，中止
      break;
    }

    // 成功：提取 data（去掉 ok 字段）
    const data: Record<string, unknown> = { ...toolResult };
    delete data.ok;

    // 缓存输出供后续步骤引用
    stepOutputs.set(stepId, data);

    // ── 6. 执行断言 ──
    let assertResults: AssertResult[] | undefined;
    let assertAllPassed = true;
    if (step.assert && step.assert.length > 0) {
      const assertRun = runAsserts(data, step.assert, stepOutputs);
      assertResults = assertRun.results;
      assertAllPassed = assertRun.allPassed;
      if (!assertAllPassed) {
        executed.push({
          id: stepId,
          tool: step.tool,
          ok: false,
          data,
          assert: assertResults,
        });
        // 短路：断言失败，中止
        break;
      }
    }

    executed.push({
      id: stepId,
      tool: step.tool,
      ok: true,
      data,
      assert: assertResults,
    });
  }

  // ── 构造输出 ──
  // data 内 `allOk` 为 batch 聚合判定：仅当所有执行步骤成功且断言通过才为 true。
  // 注意：契约层 `ok`（ADR-0003，成功即 ok:true）已被占用且表示"batch_run 调用本身成功"，
  // 故聚合语义用 `allOk` 承载，避免同名覆盖契约 ok 导致 isOk/isFail 误判。
  // （spec 草案称该字段为 `ok`，实现时因与契约层 ok 冲突调整为 allOk，见 PRD 修订说明。）
  const allOk = executed.every((s) => s.ok);
  // 失败步不变量：任一步失败即短路 break，故 executed 末条恒为失败那条；
  // summary 与默认极简输出的 failedStep 共用同一来源，避免两处重复求值与非空断言。
  // （steps 已校验非空且逐个执行，at(-1) 恒有值；成功路径下该值不被引用。）
  const lastExecuted = executed.at(-1)!;
  let summary: string;
  if (allOk) {
    summary = `全部 ${executed.length} 步成功`;
  } else {
    if (lastExecuted.error) {
      summary = `第 ${executed.length} 步失败: ${lastExecuted.error.code}: ${lastExecuted.error.message}`;
    } else {
      const firstFailed = (lastExecuted.assert ?? []).find((a) => !a.passed);
      summary = `第 ${executed.length} 步断言失败${firstFailed ? `: ${firstFailed.message}` : ""}`;
    }
  }

  // 工单 09 输出极简：默认只回聚合结论（失败附 failedStep 诊断），显式 verbose:true
  // 才带每步完整 steps。stepOutputs 缓存与引用解析不受影响——极简只作用于最终返回，
  // 步骤间 `{{stepId.output.path}}` 引用链在默认模式下照常工作（ADR-0003 极简输出在批量层的延续）。
  // failedStep 与 steps 条目同形，仅在失败时存在。
  const full = { allOk, steps: executed, summary };
  const minimal = allOk
    ? { allOk, summary }
    : { allOk, summary, failedStep: lastExecuted };
  return ok(withVerbose(minimal, full, verbose));
}

// ─── 工具定义 ───────────────────────────────────────────────

export const batchRunTool: Tool = {
  name: "batch_run",
  // 四段式引导（工单 10，与 08 号精简同一次成型、压进 150 软上限）：
  // 引导 → 场景 → 机制要点（steps/assert/引用语法）→ 输出预期（默认极简 + verbose，
  // 与工单 09 落地形态一致）+ 预设文档指针（docs/batch-presets/，16 号工单落地后生效）。
  description:
    "多步操作优先用本工具一次完成，避免多轮往返。如读文件→替换→写回。steps串行短路；assert 10种操作符；引用{{stepId.output.path}}；模板docs/batch-presets/。默认{allOk,summary}，失败附failedStep，详情verbose:true",
  inputSchema: batchRunInputSchema,
  outputSchema: batchRunOutputSchema,
  annotations: { readOnlyHint: false, destructiveHint: true },
  handler: batchRunHandler,
};
