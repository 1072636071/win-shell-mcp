/**
 * 输出契约：所有工具返回的统一格式。
 *
 * 设计原则（见 CONTEXT.md / ADR-0003）：
 * - 成功：`{ ok: true, ...data }`，data 字段展开到顶层
 * - 失败：`{ ok: false, error: { code, message } }`
 * - 极简：默认只含 AI 决策所需最小字段，长内容截断
 * - verbose：需要完整数据时开启
 */

/** verbose 开关类型。 */
export type Verbose = boolean;

/** 工具错误结构。 */
export interface ToolError {
  code: string;
  message: string;
}

/** 成功结果：ok 为 true，data 字段展开到顶层。 */
export type OkResult<T> = { ok: true } & T;

/** 失败结果。 */
export interface FailResult {
  ok: false;
  error: ToolError;
}

/** 工具返回的联合结果。 */
export type ToolResult<T> = OkResult<T> | FailResult;

/** 任意工具结果（handler 返回的宽松类型，数据为 Record）。 */
export type AnyToolResult = ToolResult<Record<string, unknown>>;

/** 默认截断长度（字符数）。 */
export const DEFAULT_TRUNCATE_LIMIT = 2000;

/**
 * 构造成功结果。data 字段展开到顶层。
 *
 * @example
 * ok({ os: 'linux' }) // { ok: true, os: 'linux' }
 */
export function ok<T extends object>(data: T): OkResult<T> {
  return { ok: true, ...data };
}

/**
 * 构造失败结果。
 *
 * @param code 标准错误码（见 errors.ts）
 * @param message 人类可读的错误信息
 */
export function fail(code: string, message: string): FailResult {
  return { ok: false, error: { code, message } };
}

/**
 * 截断长文本。超长时截断并附 `...[truncated, N more chars]` 标记。
 *
 * @param text 原始文本
 * @param maxLen 最大长度（字符数），默认 2000
 * @returns 截断后的文本；若未超长则原样返回
 *
 * @example
 * truncate('hello', 3) // 'hel...[truncated, 2 more chars]'
 * truncate('hi', 10)   // 'hi'
 */
export function truncate(text: string, maxLen: number = DEFAULT_TRUNCATE_LIMIT): string {
  if (text.length <= maxLen) return text;
  const remaining = text.length - maxLen;
  return `${text.slice(0, maxLen)}...[truncated, ${remaining} more chars]`;
}

/**
 * 根据 verbose 开关选择返回极简或完整数据。
 *
 * @param minimal 极简输出（默认）
 * @param full 完整输出（verbose 时）
 * @param verbose 开关
 * @returns verbose 为 true 时返回 full，否则返回 minimal
 *
 * @example
 * withVerbose({ a: 1 }, { a: 1, b: 2 }, false) // { a: 1 }
 * withVerbose({ a: 1 }, { a: 1, b: 2 }, true)  // { a: 1, b: 2 }
 */
export function withVerbose<T, U>(minimal: T, full: U, verbose: Verbose): T | U {
  return verbose ? full : minimal;
}

/**
 * 类型守卫：判断结果是否成功。
 */
export function isOk<T extends object>(result: ToolResult<T>): result is OkResult<T> {
  return result.ok === true;
}

/**
 * 类型守卫：判断结果是否失败。
 */
export function isFail<T extends object>(result: ToolResult<T>): result is FailResult {
  return result.ok === false;
}