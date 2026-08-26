/**
 * env 工具集：env_get / env_set / env_unset。
 *
 * 读取与设置进程环境变量。env_set/env_unset 直接操作 process.env，
 * 对后续同进程内的调用（含 shell_exec 子进程继承）生效。
 *
 * 极简输出，无 verbose 模式。
 */

import { z } from "zod";
import { ok, fail, truncate, type AnyToolResult } from "../contract/output.js";
import { ErrorCode } from "../contract/errors.js";
import type { Tool } from "../registry.js";

// ---------------------------------------------------------------------------
// env_get：读取环境变量
// ---------------------------------------------------------------------------

/** env_get 输入 schema：name 可选，省略时返回全部。 */
export const envGetInputSchema = z.object({
  name: z.string().optional().describe("省略则返回全部"),
  filter: z
    .string()
    .optional()
    .describe("按变量名过滤（includes 匹配，大小写不敏感），仅 name 省略时生效"),
  maxLen: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("值截断到 N 字符，仅 name 省略时生效"),
});

/** env_get 输入类型。 */
export type EnvGetInput = z.infer<typeof envGetInputSchema>;

/** 单变量返回结构。 */
interface EnvGetOneResult {
  name: string;
  value: string | null;
}

/** 全部变量返回结构。 */
interface EnvGetAllResult {
  vars: Record<string, string>;
  count: number;
}

/**
 * env_get handler：读取环境变量。
 *
 * - name 指定：返回 `{ name, value }`，value 为 null 表示未设置
 * - name 省略：返回 `{ vars, count }`，vars 为所有环境变量
 *   - filter：按变量名 includes 匹配（大小写不敏感）过滤
 *   - maxLen：每个变量值截断到 N 字符（控制全量返回 token 成本）
 *
 * @param args 已验证的参数
 * @returns 统一输出契约
 */
export async function envGetHandler(
  args: Record<string, unknown>,
): Promise<AnyToolResult> {
  const name = args["name"];

  if (typeof name === "string" && name.length > 0) {
    const value = process.env[name] ?? null;
    const result: EnvGetOneResult = { name, value };
    return ok(result);
  }

  // 返回全部环境变量（可选 filter 与 maxLen）
  const filter = args["filter"];
  const maxLen = args["maxLen"];
  const filterStr =
    typeof filter === "string" && filter.length > 0
      ? filter.toLowerCase()
      : null;
  const limit =
    typeof maxLen === "number" && maxLen > 0 ? Math.floor(maxLen) : null;

  const vars: Record<string, string> = {};
  for (const [key, val] of Object.entries(process.env)) {
    if (typeof val !== "string") continue;
    if (filterStr !== null && !key.toLowerCase().includes(filterStr)) continue;
    vars[key] = limit !== null ? truncate(val, limit) : val;
  }
  const result: EnvGetAllResult = { vars, count: Object.keys(vars).length };
  return ok(result);
}

/**
 * env_get 输出 schema（描述 success data 结构，不含 ok 包装）。
 *
 * name 指定时返回 `{ name, value }`（value 为 string 或 null）；
 * name 省略时返回 `{ vars, count }`。两种形状互斥，用 optional 字段表达最通用形状。
 */
export const envGetOutputSchema = z.object({
  name: z.string().optional(),
  value: z.union([z.string(), z.null()]).optional(),
  vars: z.record(z.string(), z.string()).optional(),
  count: z.number().int().nonnegative().optional(),
});

/** env_get 工具定义。 */
export const envGetTool: Tool = {
  name: "env_get",
  description:
    "读取环境变量（≈ env/printenv）。name 指定返回 {name,value}；省略返回全部 {vars,count}。",
  inputSchema: envGetInputSchema,
  outputSchema: envGetOutputSchema,
  annotations: { readOnlyHint: true },
  handler: envGetHandler,
};

// ---------------------------------------------------------------------------
// env_set：设置环境变量
// ---------------------------------------------------------------------------

/** env_set 输入 schema。 */
export const envSetInputSchema = z.object({
  name: z.string().min(1),
  value: z.string(),
});

/** env_set 输入类型。 */
export type EnvSetInput = z.infer<typeof envSetInputSchema>;

/** env_set 返回结构。 */
interface EnvSetResult {
  set: boolean;
  name: string;
}

/**
 * env_set handler：设置环境变量。
 *
 * 直接写入 process.env，对后续同进程内的调用生效。
 *
 * @param args 已验证的参数
 * @returns 统一输出契约；name 为空返回 EINVAL
 */
export async function envSetHandler(
  args: Record<string, unknown>,
): Promise<AnyToolResult> {
  const name = args["name"];
  const value = args["value"];

  if (typeof name !== "string" || name.length === 0) {
    return fail(ErrorCode.EINVAL, "name 必须是非空字符串");
  }
  if (typeof value !== "string") {
    return fail(ErrorCode.EINVAL, "value 必须是字符串");
  }

  process.env[name] = value;
  const result: EnvSetResult = { set: true, name };
  return ok(result);
}

/**
 * env_set 输出 schema（描述 success data 结构，不含 ok 包装）。
 *
 * 成功返回 `{ set, name }`。
 */
export const envSetOutputSchema = z.object({
  set: z.boolean(),
  name: z.string(),
});

/** env_set 工具定义。 */
export const envSetTool: Tool = {
  name: "env_set",
  description:
    "设置环境变量（≈ export），写入 process.env 对后续会话生效。",
  inputSchema: envSetInputSchema,
  outputSchema: envSetOutputSchema,
  // 修改进程环境变量，destructiveHint: true（覆盖既有值）
  annotations: { readOnlyHint: false, destructiveHint: true },
  handler: envSetHandler,
};

// ---------------------------------------------------------------------------
// env_unset：删除环境变量
// ---------------------------------------------------------------------------

/** env_unset 输入 schema。 */
export const envUnsetInputSchema = z.object({
  name: z.string().min(1),
});

/** env_unset 输入类型。 */
export type EnvUnsetInput = z.infer<typeof envUnsetInputSchema>;

/** env_unset 返回结构。 */
interface EnvUnsetResult {
  unset: boolean;
  name: string;
}

/**
 * env_unset handler：删除环境变量。
 *
 * 从 process.env 删除指定变量。
 *
 * @param args 已验证的参数
 * @returns 统一输出契约；name 为空返回 EINVAL
 */
export async function envUnsetHandler(
  args: Record<string, unknown>,
): Promise<AnyToolResult> {
  const name = args["name"];

  if (typeof name !== "string" || name.length === 0) {
    return fail(ErrorCode.EINVAL, "name 必须是非空字符串");
  }

  delete process.env[name];
  const result: EnvUnsetResult = { unset: true, name };
  return ok(result);
}

/**
 * env_unset 输出 schema（描述 success data 结构，不含 ok 包装）。
 *
 * 成功返回 `{ unset, name }`。
 */
export const envUnsetOutputSchema = z.object({
  unset: z.boolean(),
  name: z.string(),
});

/** env_unset 工具定义。 */
export const envUnsetTool: Tool = {
  name: "env_unset",
  description: "删除环境变量（≈ unset），从 process.env 移除。",
  inputSchema: envUnsetInputSchema,
  outputSchema: envUnsetOutputSchema,
  // 删除环境变量不可逆，destructiveHint: true
  annotations: { readOnlyHint: false, destructiveHint: true },
  handler: envUnsetHandler,
};
