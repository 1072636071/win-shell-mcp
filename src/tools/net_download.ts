/**
 * net_download 工具：下载 URL 内容到本地文件。
 *
 * 基于 Node 18+ 内置 fetch，流式写入文件，支持自动跟随重定向。
 * 返回 { saved, bytes, path }。
 */

import { createWriteStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { ok, fail, type AnyToolResult } from "../contract/output.js";
import { ErrorCode } from "../contract/errors.js";
import { failFromError } from "../utils/errors.js";
import type { Tool } from "../registry.js";

/** net_download 输入 schema。 */
export const netDownloadInputSchema = z.object({
  url: z.string().url().describe("要下载的 URL（http 或 https）"),
  path: z.string().describe("本地目标文件路径"),
  mkdirParents: z
    .boolean()
    .optional()
    .describe("true 时自动创建不存在的父目录，默认 true"),
  timeout: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("超时毫秒，超时返回 EXEC_TIMEOUT"),
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
 * 错误：EINVAL（参数非法）/ ENOENT（父目录不存在且未 mkdirParents）/ EXEC_TIMEOUT / 网络错误
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

  // 超时控制
  const controller = new AbortController();
  const timer: NodeJS.Timeout | null =
    typeof timeout === "number" && timeout > 0
      ? setTimeout(() => controller.abort(), timeout)
      : null;

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
    });
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
    if (controller.signal.aborted) {
      return fail(
        ErrorCode.EXEC_TIMEOUT,
        `下载超时: ${url}`,
      ) as unknown as AnyToolResult;
    }
    return failFromError(err);
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

/**
 * net_download 输出 schema（描述 success data 结构，不含 ok 包装）。
 *
 * 成功返回 `{ saved, bytes, path }`。
 */
export const netDownloadOutputSchema = z.object({
  saved: z.boolean().describe("是否保存成功"),
  bytes: z.number().int().nonnegative().describe("下载字节数"),
  path: z.string().describe("本地目标文件路径"),
});

/** net_download 工具定义。 */
export const netDownloadTool: Tool = {
  name: "net_download",
  description:
    "下载 URL 内容到本地文件（≈ curl -o / wget）。流式写入，支持重定向。返回 { saved, bytes, path }。",
  inputSchema: netDownloadInputSchema,
  outputSchema: netDownloadOutputSchema,
  // 写本地文件（覆盖既有目标），readOnlyHint: false；destructiveHint 省略（下载以创建为主，覆盖语义次要）
  annotations: { readOnlyHint: false },
  handler: netDownloadHandler,
  aliases: ["wget"],
};
