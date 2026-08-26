/**
 * 输出契约：所有工具返回的统一格式。
 *
 * 设计原则（见 CONTEXT.md / ADR-0003）：
 * - 成功：`{ ok: true, ...data }`，data 字段展开到顶层
 * - 失败：`{ ok: false, error: { code, message } }`
 * - 极简：默认只含 AI 决策所需最小字段，长内容截断
 * - verbose：需要完整数据时开启
 */

import { getTruncateLimit } from "../config/truncate.js";

// 截断阈值等运行期配置状态不在此持有，归 config 锥体（../config/truncate.js）；
// 本模块为保持公共面仍 re-export 其访问器与常量，纯构造 ok/fail/withVerbose
// 无任何隐藏可变状态，truncate 仅在调用期经 getTruncateLimit 读取策略。

/** verbose 开关类型。 */
export type Verbose = boolean;

/** 工具错误结构。 */
export interface ToolError {
  code: string;
  message: string;
  /** 可选可操作提示（工单 15-01）：仅当存在当前错误专属的下一步动作时出现。 */
  hint?: string;
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

/** hint 字段最大长度（字符数，工单 15-01）。超长在构造层截断。 */
export const HINT_MAX_LENGTH = 50;

// 截断阈值常量与运行期状态归 config 锥体（../config/truncate.js），此处
// re-export 保持公共面零破坏；纯构造 ok/fail/withVerbose 不引用它们。

export {
  DEFAULT_TRUNCATE_LIMIT,
  getTruncateLimit,
  setTruncateLimit,
  resetTruncateLimit,
} from "../config/truncate.js";

/**
 * 构造成功结果。data 字段展开到顶层。
 *
 * 返回 `OkResult<T> & AnyToolResult`：既保留 T 的具体字段（调用者可索引访问），
 * 又直接满足 `AnyToolResult`（handler 返回类型）。具体接口类型（无索引签名）
 * 无法直接赋给 `AnyToolResult` 的 ok 分支（含索引签名），该类型收窄在此集中
 * 处理一次，调用点无需再写 `as unknown as AnyToolResult`。
 *
 * @example
 * ok({ os: 'linux' }) // { ok: true, os: 'linux' }
 */
export function ok<T extends object>(data: T): OkResult<T> & AnyToolResult {
  return { ok: true, ...data } as OkResult<T> & AnyToolResult;
}

/**
 * 构造失败结果。
 *
 * @param code 标准错误码（见 errors.ts）
 * @param message 人类可读的错误信息
 * @param hint 可选可操作提示（工单 15-01）：仅当存在当前错误专属的下一步动作时传入。
 *   生成标准：(a) 仅当有可操作信息；(b) 不重复 message；(c) 不教通用常识；
 *   (d) 长度 ≤ {@link HINT_MAX_LENGTH} 字符（超长在构造层截断）；(e) 无规则触发则不传。
 *   不传或传空串时 error 对象不含 hint 字段，与不带 hint 的既有调用逐字节一致。
 */
export function fail(code: string, message: string, hint?: string): FailResult {
  if (hint === undefined || hint === "") {
    return { ok: false, error: { code, message } };
  }
  const safeHint =
    hint.length > HINT_MAX_LENGTH ? hint.slice(0, HINT_MAX_LENGTH) : hint;
  return { ok: false, error: { code, message, hint: safeHint } };
}

/**
 * 截断长文本。超长时截断并附 `...[truncated, N more chars]` 标记。
 *
 * 默认 maxLen 从运行期配置读取（工单 15-02：WIN_SHELL_TRUNCATE），
 * 未设置环境变量时为 {@link DEFAULT_TRUNCATE_LIMIT}（2000），行为与历史一致。
 *
 * @param text 原始文本
 * @param maxLen 最大长度（字符数），缺省读 {@link getTruncateLimit}
 * @returns 截断后的文本；若未超长则原样返回
 *
 * @example
 * truncate('hello', 3) // 'hel...[truncated, 2 more chars]'
 * truncate('hi', 10)   // 'hi'
 */
export function truncate(
  text: string,
  maxLen: number = getTruncateLimit(),
): string {
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
export function withVerbose<T, U>(
  minimal: T,
  full: U,
  verbose: Verbose,
): T | U {
  return verbose ? full : minimal;
}

/**
 * 类型守卫：判断结果是否成功。
 */
export function isOk<T extends object>(
  result: ToolResult<T>,
): result is OkResult<T> {
  return result.ok === true;
}

/**
 * 类型守卫：判断结果是否失败。
 */
export function isFail<T extends object>(
  result: ToolResult<T>,
): result is FailResult {
  return result.ok === false;
}
