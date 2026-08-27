/**
 * net_download 工具：下载 URL 内容到本地文件。
 *
 * 基于 Node 18+ 内置 fetch，流式写入文件，支持自动跟随重定向。
 * 返回 { saved, bytes, path }。
 *
 * 复用共享 HTTP 机器（src/utils/http.ts）：validateUrl 校验 URL、fetchWithTimeout
 * 发起请求并统一超时/连接错误码（NET_TIMEOUT / NET_FAIL），消除与 net_get/net_post
 * 的错误码分叉（见 ADR-0003 / E-1）。流式写入（getReader + createWriteStream）
 * 为本工具特有，不与 net_get/net_post 共享。
 *
 * 错误码：
 * - 非法 URL → INVALID_URL
 * - 超时 → NET_TIMEOUT
 * - HTTP 非 2xx / 无 body → NET_FAIL
 * - 父目录不存在且未 mkdirParents → ENOENT
 * - path 非法 → EINVAL
 */

import { createWriteStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { ok, fail, type AnyToolResult } from "../contract/output.js";
import { ErrorCode } from "../contract/errors.js";
import { failFromError, toFail } from "../utils/errors.js";
import { fetchWithTimeout, validateUrl } from "../utils/http.js";
import type { Tool } from "../registry.js";

/** 默认请求超时（毫秒）。与 net_get/net_post 一致。 */
const DEFAULT_DOWNLOAD_TIMEOUT_MS = 30000;

/** net_download 输入 schema。 */
export const netDownloadInputSchema = z.object({
  url: z.string(),
  path: z.string(),
  mkdirParents: z.boolean().optional().describe("默认 true"),
  timeout: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("毫秒，超时返回 NET_TIMEOUT，默认 30000"),
});

/** net_download 输出。 */
interface NetDownloadResult {
  saved: boolean;
  bytes: number;
  path: string;
}

/**
 * net_download handler：下载文件。
 *
 * 错误：INVALID_URL（url 非法）/ EINVAL（path 非法）/ ENOENT（父目录不存在且未 mkdirParents）/ ENOTDIR / NET_TIMEOUT / NET_FAIL
 */
export async function netDownloadHandler(
  args: Record<string, unknown>,
): Promise<AnyToolResult> {
  const url = args["url"];
  const filePath = args["path"] as string | undefined;
  const mkdirParents = args["mkdirParents"] !== false; // 默认 true
  const timeout = args["timeout"] as number | undefined;

  // URL 校验：复用 validateUrl，统一返回 INVALID_URL
  const urlError = validateUrl(url);
  if (urlError !== null) return urlError;

  if (typeof filePath !== "string" || filePath.length === 0) {
    return fail(ErrorCode.EINVAL, "path 必须是非空字符串");
  }

  // 预检查/创建父目录
  const parent = path.dirname(filePath);
  try {
    const parentStat = await stat(parent);
    if (!parentStat.isDirectory()) {
      return fail(
        ErrorCode.ENOTDIR,
        `父路径不是目录: ${parent}`,
      ) as unknown as AnyToolResult;
    }
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      if (mkdirParents) {
        await mkdir(parent, { recursive: true });
      } else {
        return fail(
          ErrorCode.ENOENT,
          `父目录不存在: ${parent}`,
        ) as unknown as AnyToolResult;
      }
    } else {
      return failFromError(e);
    }
  }

  // 超时：复用 fetchWithTimeout，统一返回 NET_TIMEOUT / NET_FAIL
  const timeoutMs =
    typeof timeout === "number" && timeout > 0
      ? timeout
      : DEFAULT_DOWNLOAD_TIMEOUT_MS;

  let response: Response;
  try {
    response = await fetchWithTimeout(
      url as string,
      { redirect: "follow" },
      timeoutMs,
    );
  } catch (err) {
    return toFail(err, ErrorCode.NET_FAIL);
  }

  if (!response.ok) {
    return fail(
      ErrorCode.NET_FAIL,
      `HTTP ${response.status} ${response.statusText}: ${url}`,
    ) as unknown as AnyToolResult;
  }
  if (response.body === null) {
    return fail(
      ErrorCode.NET_FAIL,
      `响应无 body: ${url}`,
    ) as unknown as AnyToolResult;
  }

  // 流式写入：本工具特有逻辑，不与 net_get/net_post 共享
  const writeStream = createWriteStream(filePath);
  const reader = response.body.getReader();
  let bytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      writeStream.write(value);
      bytes += value.length;
    }
  } catch (err) {
    return toFail(err, ErrorCode.NET_FAIL);
  } finally {
    writeStream.end();
    await new Promise<void>((resolve) => writeStream.on("finish", resolve));
  }

  const result: NetDownloadResult = { saved: true, bytes, path: filePath };
  return ok(result) as unknown as AnyToolResult;
}

/**
 * net_download 输出 schema（描述 success data 结构，不含 ok 包装）。
 *
 * 成功返回 `{ saved, bytes, path }`。
 */
export const netDownloadOutputSchema = z.object({
  saved: z.boolean(),
  bytes: z.number().int().nonnegative(),
  path: z.string(),
});

/** net_download 工具定义。 */
export const netDownloadTool: Tool = {
  name: "net_download",
  domain: "net",
  description:
    "下载 URL 内容到本地文件（≈ curl -o / wget）。流式写入，支持重定向。返回 { saved, bytes, path }。",
  inputSchema: netDownloadInputSchema,
  outputSchema: netDownloadOutputSchema,
  // 写本地文件（覆盖既有目标），readOnlyHint: false；destructiveHint 省略（下载以创建为主，覆盖语义次要）
  annotations: { readOnlyHint: false },
  handler: netDownloadHandler,
  aliases: ["wget"],
};
