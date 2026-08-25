/**
 * hash 工具集：hash_file。
 *
 * 基于 node:crypto 计算文件摘要（sha256/md5 等）。
 * 设计原则：极简输出、流式读取（支持大文件）、统一错误码。
 */

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { z } from "zod";
import { ok, fail, type AnyToolResult } from "../contract/output.js";
import { ErrorCode } from "../contract/errors.js";
import { failFromError } from "../utils/errors.js";
import type { Tool } from "../registry.js";

/** 支持的哈希算法。 */
const ALGORITHMS = ["sha256", "sha1", "md5", "sha512"] as const;

/** hash_file 输入 schema。 */
export const hashFileInputSchema = z.object({
  path: z.string().describe("文件路径"),
  algorithm: z
    .enum(ALGORITHMS)
    .optional()
    .describe("哈希算法，默认 sha256；支持 sha256/sha1/md5/sha512"),
});

/** hash_file 输出。 */
interface HashFileResult {
  hash: string;
  algorithm: string;
  path: string;
}

/**
 * hash_file handler：计算文件摘要。
 *
 * 流式读取文件，避免大文件内存溢出。
 *
 * 错误：ENOENT（文件不存在）/ EACCES（无权限）
 */
export async function hashFileHandler(
  args: Record<string, unknown>,
): Promise<AnyToolResult> {
  const filePath = args["path"];
  const algorithm = (args["algorithm"] as string | undefined) ?? "sha256";

  if (typeof filePath !== "string" || filePath.length === 0) {
    return fail(ErrorCode.EINVAL, "path 必须是非空字符串");
  }

  try {
    // 预检查：存在且是文件
    const stats = await stat(filePath);
    if (!stats.isFile()) {
      return fail(
        ErrorCode.EISDIR,
        `不是文件: ${filePath}`,
      ) as unknown as AnyToolResult;
    }

    const hash = createHash(algorithm);
    await new Promise<void>((resolve, reject) => {
      const stream = createReadStream(filePath);
      stream.on("data", (chunk) => hash.update(chunk as Buffer));
      stream.on("error", reject);
      stream.on("end", () => resolve());
    });
    const result: HashFileResult = {
      hash: hash.digest("hex"),
      algorithm,
      path: filePath,
    };
    return ok(result) as unknown as AnyToolResult;
  } catch (err) {
    return failFromError(err);
  }
}

/** hash_file 输出 schema：文件摘要结果。 */
export const hashFileOutputSchema = z.object({
  hash: z.string(),
  algorithm: z.string(),
  path: z.string(),
});

/** hash_file 工具定义。 */
export const hashFileTool: Tool = {
  name: "hash_file",
  description:
    "计算文件摘要（≈ shasum/md5sum）。默认 sha256，支持 sha256/sha1/md5/sha512。流式读取支持大文件。返回 { hash, algorithm, path }。",
  inputSchema: hashFileInputSchema,
  outputSchema: hashFileOutputSchema,
  annotations: { readOnlyHint: true },
  handler: hashFileHandler,
  aliases: ["sha256sum", "md5sum"],
};
