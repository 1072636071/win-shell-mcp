/**
 * net_download 工具：下载 URL 内容到本地文件。
 *
 * 基于 Node 18+ 内置 fetch，流式写入文件，支持自动跟随重定向。
 * 返回 { saved, bytes, path }。
 */

import { createWriteStream } from "node:fs";
import { z } from "zod";
import { ok, fail, type AnyToolResult } from "../contract/output.js";
import { ErrorCode } from "../contract/errors.js";
import { failFromError } from "../utils/errors.js";
import { prepareParentDir } from "../utils/fs.js";
import {
  createTimeoutAbort,
  isAbortError,
  mapFetchError,
} from "../net/http.js";
import type { Tool } from "../registry.js";

/** net_download 输入 schema。 */
export const netDownloadInputSchema = z.object({
  url: z.string().url(),
  path: z.string(),
  mkdirParents: z.boolean().optional().describe("默认 true"),
  timeout: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("毫秒，超时返回 NET_TIMEOUT"),
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
 * 错误：EINVAL（参数非法）/ ENOENT（父目录不存在且未 mkdirParents）
 *       / NET_TIMEOUT（超时）/ NET_FAIL（连接失败）
 */
export async function netDownloadHandler(
  args: Record<string, unknown>,
): Promise<AnyToolResult> {
  const url = args["url"] as string | undefined;
  const filePath = args["path"] as string | undefined;
  const mkdirParents = args["mkdirParents"] !== false; // 默认 true
  const timeout = args["timeout"] as number | undefined;

  if (typeof url !== "string" || url.length === 0) {
    return fail(ErrorCode.EINVAL, "url 必须是非空字符串");
  }
  if (typeof filePath !== "string" || filePath.length === 0) {
    return fail(ErrorCode.EINVAL, "path 必须是非空字符串");
  }

  // 预检查/创建父目录（父目录预检助手，与 fs_write 共享同一语义）
  const parentErr = await prepareParentDir(filePath, mkdirParents);
  if (parentErr) return parentErr;

  // 下载超时失败结果（fetch 阶段与流式阶段共用同一映射，避免重复分支）
  const timeoutFail = (): AnyToolResult =>
    fail(ErrorCode.NET_TIMEOUT, `下载超时: ${url}`);

  // 超时控制（委托 net HTTP 深模块：覆盖请求与流式写入全程，错误语义共享）
  const { signal, clear } = createTimeoutAbort(
    typeof timeout === "number" && timeout > 0 ? timeout : undefined,
  );

  try {
    let response: Response;
    try {
      response = await fetch(url, { signal, redirect: "follow" });
    } catch (err) {
      if (isAbortError(err)) return timeoutFail();
      // 连接失败 → NET_FAIL（与 net_get/net_post 一致）
      return failFromError(mapFetchError(err, url)) as unknown as AnyToolResult;
    }
    if (!response.ok) {
      return fail(
        ErrorCode.EXEC_FAIL,
        `HTTP ${response.status} ${response.statusText}: ${url}`,
      ) as unknown as AnyToolResult;
    }
    if (response.body === null) {
      return fail(
        ErrorCode.EXEC_FAIL,
        `响应无 body: ${url}`,
      ) as unknown as AnyToolResult;
    }

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
    } finally {
      writeStream.end();
      await new Promise<void>((resolve) => writeStream.on("finish", resolve));
    }

    const result: NetDownloadResult = { saved: true, bytes, path: filePath };
    return ok(result) as unknown as AnyToolResult;
  } catch (err) {
    if (isAbortError(err)) return timeoutFail();
    return failFromError(err);
  } finally {
    clear();
  }
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
