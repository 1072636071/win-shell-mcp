/**
 * net 工具集：net_get / net_post / net_dns / net_tcp。
 *
 * 设计原则（见 CONTEXT.md / ADR-0003）：
 * - 极简输出：默认只含 AI 决策所需最小字段
 * - verbose：需要完整数据时开启
 * - 统一错误码：INVALID_URL / NET_TIMEOUT / NET_FAIL
 *
 * spec 对齐（Phase 2A）：
 * - 拆分 net_http → net_get + net_post（移除 PUT/DELETE 范围蔓延）
 * - 错误码专用化：EINVAL/ETIMEOUT/EEXEC → INVALID_URL/NET_TIMEOUT/NET_FAIL
 * - 使用 withVerbose 替代内联 if (!verbose) 分支
 */

import * as dns from 'node:dns/promises';
import { createConnection, type Socket } from 'node:net';
import { z } from 'zod';
import {
  ok,
  fail,
  truncate,
  withVerbose,
  type AnyToolResult,
} from '../contract/output.js';
import { ErrorCode, toErrorMessage } from '../contract/errors.js';
import { codedError, toFail } from '../utils/errors.js';
import type { Tool } from '../registry.js';

// ===================== net_get / net_post 共享 =====================

/** 默认请求超时（毫秒）。 */
const DEFAULT_HTTP_TIMEOUT_MS = 30000;

/** HTTP 极简输出。 */
interface HttpMinimal {
  status: number;
  body: string;
}

/** HTTP verbose 输出。 */
interface HttpFull extends HttpMinimal {
  headers: Record<string, string>;
  ok: boolean;
  statusText: string;
  duration: number;
  truncated: boolean;
}

/**
 * 判断错误是否为 AbortError（超时触发）。
 *
 * Node fetch 超时抛 AbortError（err.name === 'AbortError'）。
 *
 * @param err 错误值
 */
function isAbortError(err: unknown): boolean {
  if (err instanceof Error) {
    if (err.name === 'AbortError') return true;
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ABORT_ERR' || code === 'ETIMEOUT') return true;
  }
  return false;
}

/**
 * 将 Response.headers 转为普通对象。
 *
 * @param headers fetch Response headers
 * @returns 键值对（小写键）
 */
function headersToObject(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

/**
 * 将用户传入的 headers 合并到基础 headers 对象。
 *
 * 仅合并键值均为字符串的条目，跳过非法值。用户 headers 覆盖基础 headers。
 *
 * @param base 基础请求头
 * @param userHeaders 用户传入的请求头（unknown 类型，经 schema 验证后为 Record<string,string>）
 * @returns 合并后的请求头
 */
function mergeHeaders(
  base: Record<string, string>,
  userHeaders: unknown,
): Record<string, string> {
  const result = { ...base };
  if (userHeaders && typeof userHeaders === 'object') {
    for (const [k, v] of Object.entries(userHeaders as Record<string, unknown>)) {
      if (typeof k === 'string' && typeof v === 'string') result[k] = v;
    }
  }
  return result;
}

/**
 * 解析并验证 URL 字符串。
 *
 * @param url 待验证的 URL
 * @returns 成功返回 null；失败返回 fail 结果
 */
function validateUrl(url: unknown): AnyToolResult | null {
  if (typeof url !== 'string' || url.length === 0) {
    return fail(ErrorCode.INVALID_URL, 'url 必须是非空字符串');
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
 * @param init fetch init（method, headers, body 等）
 * @param timeoutMs 超时毫秒
 * @returns fetch Response
 * @throws 超时抛携带 NET_TIMEOUT 码的错误，连接失败抛携带 NET_FAIL 码的错误
 */
async function fetchWithTimeout(
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
    throw codedError(ErrorCode.NET_FAIL, `网络连接失败: ${toErrorMessage(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 从 fetch Response 构造工具返回结果。
 *
 * @param response fetch Response
 * @param duration 请求耗时毫秒
 * @param verbose 是否返回 verbose 信息
 * @returns ok 结果
 */
async function buildHttpResult(
  response: Response,
  duration: number,
  verbose: boolean,
): Promise<AnyToolResult> {
  const rawBody = await response.text();
  const truncatedBody = truncate(rawBody);
  const truncated = truncatedBody !== rawBody;

  const minimal: HttpMinimal = { status: response.status, body: truncatedBody };
  const full: HttpFull = {
    status: response.status,
    body: truncatedBody,
    headers: headersToObject(response.headers),
    ok: response.ok,
    statusText: response.statusText,
    duration,
    truncated,
  };
  return ok(withVerbose(minimal, full, verbose));
}

// ===================== net_get =====================

/** net_get 输入 schema。 */
export const netGetInputSchema = z.object({
  url: z.string().describe('请求 URL'),
  headers: z
    .record(z.string(), z.string())
    .optional()
    .describe('自定义请求头（如 Authorization、API key）'),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('超时（毫秒），默认 30000'),
  verbose: z
    .boolean()
    .optional()
    .describe('若为 true，返回响应头、ok、statusText、duration、truncated'),
});

/** net_get 输入类型。 */
export type NetGetInput = z.infer<typeof netGetInputSchema>;

/**
 * net_get handler：发起 HTTP GET 请求。
 *
 * 极简返回 `{ status, body }`，body 截断至 2000 字符。
 * verbose 额外返回 `{ headers, ok, statusText, duration, truncated }`。
 * timeoutMs 用 AbortController + setTimeout。
 *
 * 错误：
 * - 非法 URL → INVALID_URL
 * - 超时 → NET_TIMEOUT
 * - 连接失败 → NET_FAIL
 *
 * @param args 已验证的参数
 * @returns 统一输出契约
 */
export async function netGetHandler(args: Record<string, unknown>): Promise<AnyToolResult> {
  const url = args['url'];
  const timeoutMs = args['timeoutMs'];
  const verbose = args['verbose'] === true;
  const userHeaders = args['headers'];

  const urlError = validateUrl(url);
  if (urlError !== null) return urlError;

  const reqHeaders = mergeHeaders({}, userHeaders);
  const timeout =
    typeof timeoutMs === 'number' && timeoutMs > 0 ? timeoutMs : DEFAULT_HTTP_TIMEOUT_MS;
  const start = Date.now();

  try {
    const response = await fetchWithTimeout(
      url as string,
      { method: 'GET', headers: reqHeaders },
      timeout,
    );
    const duration = Date.now() - start;
    return await buildHttpResult(response, duration, verbose);
  } catch (err) {
    return toFail(err, ErrorCode.NET_FAIL);
  }
}

/** net_get 工具定义。 */
export const netGetTool: Tool = {
  name: 'net_get',
  description:
    '发起 HTTP GET 请求。返回 { status, body }，body 截断至 2000 字符。headers 自定义请求头。timeoutMs 默认 30000。verbose 含 headers/ok/statusText/duration/truncated。',
  inputSchema: netGetInputSchema,
  handler: netGetHandler,
};

// ===================== net_post =====================

/** net_post 输入 schema。 */
export const netPostInputSchema = z.object({
  url: z.string().describe('请求 URL'),
  body: z.string().optional().describe('请求体（文本）'),
  json: z
    .boolean()
    .optional()
    .describe('若为 true，设置 Content-Type: application/json'),
  headers: z
    .record(z.string(), z.string())
    .optional()
    .describe('自定义请求头（如 Authorization、API key；覆盖 json 的 Content-Type）'),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('超时（毫秒），默认 30000'),
  verbose: z
    .boolean()
    .optional()
    .describe('若为 true，返回响应头、ok、statusText、duration、truncated'),
});

/** net_post 输入类型。 */
export type NetPostInput = z.infer<typeof netPostInputSchema>;

/**
 * net_post handler：发起 HTTP POST 请求。
 *
 * 极简返回 `{ status, body }`，body 截断至 2000 字符。
 * `json=true` 时设置 Content-Type: application/json。
 * verbose 额外返回 `{ headers, ok, statusText, duration, truncated }`。
 * timeoutMs 用 AbortController + setTimeout。
 *
 * 错误：
 * - 非法 URL → INVALID_URL
 * - 超时 → NET_TIMEOUT
 * - 连接失败 → NET_FAIL
 *
 * @param args 已验证的参数
 * @returns 统一输出契约
 */
export async function netPostHandler(args: Record<string, unknown>): Promise<AnyToolResult> {
  const url = args['url'];
  const body = args['body'];
  const json = args['json'] === true;
  const timeoutMs = args['timeoutMs'];
  const verbose = args['verbose'] === true;
  const userHeaders = args['headers'];

  const urlError = validateUrl(url);
  if (urlError !== null) return urlError;

  // 构造请求头：json 自动加 Content-Type，用户 headers 覆盖之
  const baseHeaders: Record<string, string> = {};
  if (json) {
    baseHeaders['Content-Type'] = 'application/json';
  }
  const reqHeaders = mergeHeaders(baseHeaders, userHeaders);

  // 构造请求体
  const reqBody: string | undefined =
    typeof body === 'string' ? body : undefined;

  const timeout =
    typeof timeoutMs === 'number' && timeoutMs > 0 ? timeoutMs : DEFAULT_HTTP_TIMEOUT_MS;
  const start = Date.now();

  try {
    const response = await fetchWithTimeout(
      url as string,
      { method: 'POST', headers: reqHeaders, body: reqBody },
      timeout,
    );
    const duration = Date.now() - start;
    return await buildHttpResult(response, duration, verbose);
  } catch (err) {
    return toFail(err, ErrorCode.NET_FAIL);
  }
}

/** net_post 工具定义。 */
export const netPostTool: Tool = {
  name: 'net_post',
  description:
    '发起 HTTP POST 请求。返回 { status, body }，body 截断至 2000 字符。json=true 时设 Content-Type: application/json。headers 自定义请求头（覆盖 json 的 Content-Type）。timeoutMs 默认 30000。verbose 含 headers/ok/statusText/duration/truncated。',
  inputSchema: netPostInputSchema,
  handler: netPostHandler,
};

// ===================== net_dns =====================

/** DNS 记录类型枚举。 */
const DNS_RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT'] as const;
type DnsRecordType = (typeof DNS_RECORD_TYPES)[number];

/** net_dns 输入 schema。 */
export const netDnsInputSchema = z.object({
  hostname: z.string().describe('主机名'),
  recordType: z
    .enum(DNS_RECORD_TYPES)
    .optional()
    .describe('记录类型（A/AAAA/CNAME/MX/TXT），默认 A'),
});

/** net_dns 输入类型。 */
export type NetDnsInput = z.infer<typeof netDnsInputSchema>;

/** net_dns 输出。 */
interface NetDnsResult {
  addresses: string[];
  recordType: string;
}

/**
 * 判断 hostname 是否合法。
 *
 * 简单规则：非空字符串、不含空格、长度合理（≤253）。
 *
 * @param hostname 主机名
 */
function isValidHostname(hostname: string): boolean {
  if (typeof hostname !== 'string' || hostname.length === 0) return false;
  if (hostname.length > 253) return false;
  if (/\s/.test(hostname)) return false;
  return true;
}

/**
 * 解析指定地址族记录（A=4 / AAAA=6）。
 *
 * 优先尝试 dns.resolve4/resolve6（走 DNS 查询）；若抛错或返回空数组，
 * 回退到 dns.lookup（会咨询 hosts 文件），确保 `localhost` 可靠返回，
 * 且在无对应地址族环境下（如无 IPv6 时 AAAA 回退 ::1）更稳妥。
 *
 * @param hostname 主机名
 * @param family 地址族（4 或 6）
 * @returns 地址数组
 */
async function resolveAddress(hostname: string, family: 4 | 6): Promise<string[]> {
  const resolver = family === 4 ? dns.resolve4 : dns.resolve6;
  try {
    const addrs = await resolver(hostname);
    if (addrs.length > 0) return addrs;
  } catch {
    // 走 lookup 回退
  }
  const { address } = await dns.lookup(hostname, { family });
  return [address];
}

/**
 * net_dns handler：DNS 解析。
 *
 * 返回 `{ addresses, recordType }`。
 * 用 node:dns/promises。
 * MX 记录返回 `exchange` 地址；TXT 记录将片段拼接为字符串。
 * A/AAAA 先 `resolve4/resolve6`，失败或为空时回退 `dns.lookup`（咨询 hosts 文件）。
 *
 * 错误：
 * - 非法 hostname → EINVAL
 * - 解析失败 → NET_FAIL
 *
 * @param args 已验证的参数
 * @returns 统一输出契约
 */
export async function netDnsHandler(args: Record<string, unknown>): Promise<AnyToolResult> {
  const hostname = args['hostname'];
  const rawRecordType = args['recordType'];
  const recordType = (typeof rawRecordType === 'string' ? rawRecordType : 'A') as DnsRecordType;

  if (typeof hostname !== 'string' || !isValidHostname(hostname)) {
    return fail(ErrorCode.EINVAL, 'hostname 非法');
  }

  try {
    let addresses: string[];
    switch (recordType) {
      case 'A':
        addresses = await resolveAddress(hostname, 4);
        break;
      case 'AAAA':
        addresses = await resolveAddress(hostname, 6);
        break;
      case 'CNAME':
        addresses = await dns.resolveCname(hostname);
        break;
      case 'MX':
        addresses = (await dns.resolveMx(hostname)).map((r) => r.exchange);
        break;
      case 'TXT':
        addresses = (await dns.resolveTxt(hostname)).map((arr) => arr.join(''));
        break;
      default:
        return fail(ErrorCode.EINVAL, `不支持的记录类型: ${recordType}`);
    }
    const result: NetDnsResult = { addresses, recordType };
    return ok(result);
  } catch (err) {
    return fail(ErrorCode.NET_FAIL, `DNS 解析失败: ${toErrorMessage(err)}`);
  }
}

/** net_dns 工具定义。 */
export const netDnsTool: Tool = {
  name: 'net_dns',
  description:
    'DNS 解析。返回 { addresses, recordType }。recordType 默认 A，支持 A/AAAA/CNAME/MX/TXT。',
  inputSchema: netDnsInputSchema,
  handler: netDnsHandler,
};

// ===================== net_tcp =====================

/** net_tcp 输入 schema。 */
export const netTcpInputSchema = z.object({
  host: z.string().describe('主机'),
  port: z.number().int().min(0).max(65535).describe('端口（0-65535）'),
  timeout: z.number().int().positive().optional().describe('超时（毫秒），默认 3000'),
});

/** net_tcp 输入类型。 */
export type NetTcpInput = z.infer<typeof netTcpInputSchema>;

/** net_tcp 输出。 */
interface NetTcpResult {
  reachable: boolean;
  host: string;
  port: number;
  duration: number;
}

/** net_tcp 默认超时（毫秒）。 */
const DEFAULT_TCP_TIMEOUT = 3000;

/**
 * net_tcp handler：TCP 可达性探测。
 *
 * 用 node:net 的 createConnection + setTimeout。
 * 返回 `{ reachable, host, port, duration }`。
 * reachable 为 true/false（连接成功/失败），不是错误。
 *
 * 错误：
 * - 非法 host/port → EINVAL
 *
 * @param args 已验证的参数
 * @returns 统一输出契约
 */
export async function netTcpHandler(args: Record<string, unknown>): Promise<AnyToolResult> {
  const host = args['host'];
  const port = args['port'];
  const timeout =
    typeof args['timeout'] === 'number' && args['timeout'] > 0 ? args['timeout'] : DEFAULT_TCP_TIMEOUT;

  if (typeof host !== 'string' || host.length === 0) {
    return fail(ErrorCode.EINVAL, 'host 必须是非空字符串');
  }
  if (typeof port !== 'number' || !Number.isInteger(port) || port < 0 || port > 65535) {
    return fail(ErrorCode.EINVAL, 'port 必须是 0-65535 的整数');
  }

  const start = Date.now();
  return new Promise<AnyToolResult>((resolve) => {
    let settled = false;
    let socket: Socket | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = (): void => {
      if (timer !== undefined) clearTimeout(timer);
      if (socket !== undefined) {
        socket.removeAllListeners();
        socket.destroy();
      }
    };

    const done = (reachable: boolean): void => {
      if (settled) return;
      settled = true;
      cleanup();
      const duration = Date.now() - start;
      const result: NetTcpResult = { reachable, host, port, duration };
      resolve(ok(result));
    };

    timer = setTimeout(() => {
      done(false);
    }, timeout);

    try {
      socket = createConnection({ host, port }, () => {
        done(true);
      });
      socket.on('error', () => {
        done(false);
      });
    } catch (err) {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      // createConnection 同步抛错一般因参数非法
      resolve(fail(ErrorCode.EINVAL, `连接参数非法: ${toErrorMessage(err)}`));
    }
  });
}

/** net_tcp 工具定义。 */
export const netTcpTool: Tool = {
  name: 'net_tcp',
  description:
    'TCP 可达性探测。返回 { reachable, host, port, duration }。reachable 为 true/false，不是错误。timeout 默认 3000ms。',
  inputSchema: netTcpInputSchema,
  handler: netTcpHandler,
};
