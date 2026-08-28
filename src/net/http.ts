/**
 * net HTTP 深模块。
 *
 * 统一拥有 HTTP 请求机器：fetch + 超时中断 + 错误码映射（NET_TIMEOUT / NET_FAIL）。
 * net_get / net_post 经 fetchWithTimeout 消费；net_download 经 createTimeoutAbort
 * 保留流式阶段的超时覆盖，与其余工具共享同一超时/错误语义，不再自建机器。
 */

import { codedError } from "../utils/errors.js";
import { ErrorCode, toErrorMessage } from "../contract/errors.js";

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

/** 超时中止句柄：signal 供 fetch 使用，clear 供调用方在结束时清理定时器。 */
export interface TimeoutAbort {
  signal: AbortSignal;
  clear: () => void;
}

/**
 * 创建超时中止控制。
 *
 * @param timeoutMs 超时毫秒；undefined 表示不设超时（无中止定时器）
 */
export function createTimeoutAbort(
  timeoutMs: number | undefined,
): TimeoutAbort {
  if (timeoutMs === undefined) {
    return { signal: new AbortController().signal, clear: () => {} };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

/**
 * 将 fetch 错误映射为携带标准码的错误（超时 → NET_TIMEOUT，其余 → NET_FAIL）。
 *
 * @param err fetch 抛出的错误
 * @param url 请求 URL（用于消息）
 */
export function mapFetchError(err: unknown, url: string): Error {
  if (isAbortError(err)) {
    return codedError(ErrorCode.NET_TIMEOUT, `网络超时: ${url}`);
  }
  return codedError(ErrorCode.NET_FAIL, `网络连接失败: ${toErrorMessage(err)}`);
}

/**
 * 发送 HTTP 请求并支持超时中断。
 *
 * @param url 目标 URL
 * @param init fetch init（method, headers, body 等）
 * @param timeoutMs 超时毫秒；undefined 表示不设超时
 * @returns fetch Response
 * @throws 超时抛携带 NET_TIMEOUT 码的错误，连接失败抛携带 NET_FAIL 码的错误
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number | undefined,
): Promise<Response> {
  const { signal, clear } = createTimeoutAbort(timeoutMs);
  try {
    return await fetch(url, { ...init, signal });
  } catch (err) {
    throw mapFetchError(err, url);
  } finally {
    clear();
  }
}
