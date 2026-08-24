/**
 * env 工具集：env_get / env_set / env_unset。
 *
 * 读取与设置进程环境变量。env_set/env_unset 直接操作 process.env，
 * 对后续同进程内的调用（含 shell_exec 子进程继承）生效。
 *
 * 极简输出，无 verbose 模式。
 */

import { z } from 'zod';
import { ok, fail, type AnyToolResult } from '../contract/output.js';
import { ErrorCode } from '../contract/errors.js';
import type { Tool } from '../registry.js';

// ---------------------------------------------------------------------------
// env_get：读取环境变量
// ---------------------------------------------------------------------------

/** env_get 输入 schema：name 可选，省略时返回全部。 */
export const envGetInputSchema = z.object({
  name: z
    .string()
    .optional()
    .describe('变量名，省略则返回全部环境变量'),
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
 *
 * @param args 已验证的参数
 * @returns 统一输出契约
 */
export async function envGetHandler(args: Record<string, unknown>): Promise<AnyToolResult> {
  const name = args['name'];

  if (typeof name === 'string' && name.length > 0) {
    const value = process.env[name] ?? null;
    const result: EnvGetOneResult = { name, value };
    return ok(result);
  }

  // 返回全部环境变量
  const vars: Record<string, string> = {};
  for (const [key, val] of Object.entries(process.env)) {
    if (typeof val === 'string') {
      vars[key] = val;
    }
  }
  const result: EnvGetAllResult = { vars, count: Object.keys(vars).length };
  return ok(result);
}

/** env_get 工具定义。 */
export const envGetTool: Tool = {
  name: 'env_get',
  description:
    '读取环境变量。name 指定时返回 {name, value}（value 为 null 表示未设置）；省略时返回全部 {vars, count}。',
  inputSchema: envGetInputSchema,
  handler: envGetHandler,
};

// ---------------------------------------------------------------------------
// env_set：设置环境变量
// ---------------------------------------------------------------------------

/** env_set 输入 schema。 */
export const envSetInputSchema = z.object({
  name: z.string().min(1).describe('变量名（非空字符串）'),
  value: z.string().describe('变量值'),
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
export async function envSetHandler(args: Record<string, unknown>): Promise<AnyToolResult> {
  const name = args['name'];
  const value = args['value'];

  if (typeof name !== 'string' || name.length === 0) {
    return fail(ErrorCode.EINVAL, 'name 必须是非空字符串');
  }
  if (typeof value !== 'string') {
    return fail(ErrorCode.EINVAL, 'value 必须是字符串');
  }

  process.env[name] = value;
  const result: EnvSetResult = { set: true, name };
  return ok(result);
}

/** env_set 工具定义。 */
export const envSetTool: Tool = {
  name: 'env_set',
  description: '设置环境变量，写入 process.env，对后续会话生效。返回 {set, name}。',
  inputSchema: envSetInputSchema,
  handler: envSetHandler,
};

// ---------------------------------------------------------------------------
// env_unset：删除环境变量
// ---------------------------------------------------------------------------

/** env_unset 输入 schema。 */
export const envUnsetInputSchema = z.object({
  name: z.string().min(1).describe('变量名（非空字符串）'),
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
export async function envUnsetHandler(args: Record<string, unknown>): Promise<AnyToolResult> {
  const name = args['name'];

  if (typeof name !== 'string' || name.length === 0) {
    return fail(ErrorCode.EINVAL, 'name 必须是非空字符串');
  }

  delete process.env[name];
  const result: EnvUnsetResult = { unset: true, name };
  return ok(result);
}

/** env_unset 工具定义。 */
export const envUnsetTool: Tool = {
  name: 'env_unset',
  description: '删除环境变量，从 process.env 移除。返回 {unset, name}。',
  inputSchema: envUnsetInputSchema,
  handler: envUnsetHandler,
};