/**
 * 错误处理共享工具。
 *
 * 提供 `failFromError`：从任意错误值构造 fail 结果，
 * 供所有工具 handler 的 catch 块统一使用，消除跨文件重复。
 */

import { fail, type AnyToolResult } from '../contract/output.js';
import { toErrorCode, toErrorMessage } from '../contract/errors.js';

/**
 * 从任意错误值构造 fail 结果。
 *
 * 等价于 `fail(toErrorCode(err), toErrorMessage(err))`，
 * 供所有工具 handler 的 catch 块统一使用。
 */
export function failFromError(err: unknown): AnyToolResult {
  return fail(toErrorCode(err), toErrorMessage(err));
}