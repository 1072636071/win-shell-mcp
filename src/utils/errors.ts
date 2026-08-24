/**
 * 错误→输出契约的统一适配器。
 *
 * 全库唯一的错误→fail 接缝：域逻辑抛出携带业务错误码的错误（用 `codedError`
 * 构造），在 handler 边界统一经 `toFail` 转为 fail 结果。默认走 errno 映射，
 * 未知错误可用 `fallbackCode` 兜底（如 net 域兜底 NET_FAIL）。
 */

import { fail, type AnyToolResult } from '../contract/output.js';
import {
  ErrorCode,
  toErrorCode,
  toErrorMessage,
  type ErrorCodeValue,
} from '../contract/errors.js';

/**
 * 构造携带业务错误码的错误。
 *
 * 域逻辑（如文件读取、HTTP 请求）在失败时抛此错误，`toFail` 会识别其 code
 * 并映射为对应错误码的 fail 结果。
 *
 * @param code 标准错误码
 * @param message 人类可读的错误信息
 */
export function codedError(code: ErrorCodeValue, message: string): Error {
  const err = new Error(message) as NodeJS.ErrnoException;
  err.code = code;
  return err;
}

/**
 * 从任意错误值构造 fail 结果（错误→输出契约的唯一适配器）。
 *
 * 错误码经 `toErrorCode` 映射（携带业务码的错误直接命中）；映射结果为
 * EUNKNOWN 且提供了 `fallbackCode` 时，用兜底码（如 net 域的 NET_FAIL）。
 *
 * @param err 任意错误值
 * @param fallbackCode 未知错误的兜底错误码（可选）
 */
export function toFail(err: unknown, fallbackCode?: ErrorCodeValue): AnyToolResult {
  const code = toErrorCode(err);
  if (code === ErrorCode.EUNKNOWN && fallbackCode !== undefined) {
    return fail(fallbackCode, toErrorMessage(err));
  }
  return fail(code, toErrorMessage(err));
}

/**
 * 从任意错误值构造 fail 结果。
 *
 * 等价于 `fail(toErrorCode(err), toErrorMessage(err))`，
 * 供所有工具 handler 的 catch 块统一使用（master 既有约定）。
 */
export function failFromError(err: unknown): AnyToolResult {
  return fail(toErrorCode(err), toErrorMessage(err));
}
