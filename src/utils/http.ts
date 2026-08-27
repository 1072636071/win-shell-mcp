/**
 * HTTP 机器叶子模块：fetchWithTimeout / isAbortError / validateUrl。
 *
 * 零业务依赖（仅依赖 contract/errors + utils/errors + contract/output 基础契约），
 * 供 net_get / net_post / net_download 等多个工具复用，消除「HTTP 请求机器散落」
 * 与错误码分叉（见 ADR-0003 / E-1）。
 *
 * 统一错误码：
 * - 非法 URL → INVALID_URL
 * - 超时 → NET_TIMEOUT
 * - 连接失败 → NET_FAIL
 */

import { fail, type AnyToolResult } from "../contract/output.js";
import { ErrorCode, toErrorMessage } from "../contract/errors.js";
import { codedError } from "./errors.js";

/**
 * 判断错误是否为 AbortError（超时触发）。
 *
 * Node fetch 超时抛 AbortError（err.name === 'AbortError'）。
 *
 * @param err 错误值
 */
export function isAbortError(err: unknown): boolean {
  if (err instanceof Error) {
    if (err.name === "AbortError") return true;
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ABORT_ERR" || code === "ETIMEOUT") return true;
  }
  return false;
}

/**
 * 解析并验证 URL 字符串。
 *
 * @param url 待验证的 URL
 * @returns 成功返回 null；失败返回 fail 结果
 */
export function validateUrl(url: unknown): AnyToolResult | null {
  if (typeof url !== "string" || url.length === 0) {
    return fail(ErrorCode.INVALID_URL, "url 必须是非空字符串");
  }
  try {
    new URL(url);
    return null;
  } catch {
    return fail(ErrorCode.INVALID_URL, `非法 URL: ${url}`);
  }
}

/**
 * 发送 HTTP 请求并支持超时中断。
 *
 * @param url 目标 URL
 * @param init fetch init（method, headers, body, redirect 等）
 * @param timeoutMs 超时毫秒
 * @returns fetch Response
 * @throws 超时抛携带 NET_TIMEOUT 码的错误，连接失败抛携带 NET_FAIL 码的错误
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (isAbortError(err)) {
      throw codedError(ErrorCode.NET_TIMEOUT, `网络超时: ${url}`);
    }
    throw codedError(
      ErrorCode.NET_FAIL,
      `网络连接失败: ${toErrorMessage(err)}`,
    );
  } finally {
    clearTimeout(timer);
  }
}