/**
 * fs_du 工具：递归累计目录大小。
 *
 * ≈ Unix du。遍历目录树，累计所有文件字节数。
 * 设计原则：极简输出（仅总大小）、verbose 含文件/目录数。
 */

import { promises as fs } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { ok, fail, type AnyToolResult } from "../contract/output.js";
import { ErrorCode } from "../contract/errors.js";
import { failFromError } from "../utils/errors.js";
import type { Tool } from "../registry.js";

/** fs_du 输入 schema。 */
export const fsDuInputSchema = z.object({
  path: z.string().describe("目录"),
  verbose: z.boolean().optional().describe("返回 files/dirs 计数"),
});

/** 极简输出。 */
interface FsDuMinimal {
  size: number;
  path: string;
}

/** verbose 输出。 */
interface FsDuFull extends FsDuMinimal {
  files: number;
  dirs: number;
}

/**
 * 递归累计目录大小。
 *
 * @param dir 目录路径
 * @returns { size, files, dirs }
 */
async function computeDirSize(
  dir: string,
): Promise<{ size: number; files: number; dirs: number }> {
  let size = 0;
  let files = 0;
  let dirs = 0;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      dirs++;
      const sub = await computeDirSize(fullPath);
      size += sub.size;
      files += sub.files;
      dirs += sub.dirs;
    } else if (entry.isFile()) {
      const stat = await fs.stat(fullPath);
      size += stat.size;
      files++;
    }
    // symlink 等其他类型跳过，避免循环
  }
  return { size, files, dirs };
}

/**
 * fs_du handler：递归累计目录大小。
 *
 * 错误：ENOENT（不存在）/ ENOTDIR（不是目录）/ EACCES（无权限）
 */
export async function fsDuHandler(
  args: Record<string, unknown>,
): Promise<AnyToolResult> {
  const dirPath = args["path"];
  const verbose = args["verbose"] === true;

  if (typeof dirPath !== "string" || dirPath.length === 0) {
    return fail(ErrorCode.EINVAL, "path 必须是非空字符串");
  }

  try {
    const stats = await fs.stat(dirPath);
    if (!stats.isDirectory()) {
      return fail(
        ErrorCode.ENOTDIR,
        `不是目录: ${dirPath}`,
      ) as unknown as AnyToolResult;
    }

    const { size, files, dirs } = await computeDirSize(dirPath);

    const minimal: FsDuMinimal = { size, path: dirPath };
    if (verbose) {
      const full: FsDuFull = { ...minimal, files, dirs };
      return ok(full) as unknown as AnyToolResult;
    }
    return ok(minimal) as unknown as AnyToolResult;
  } catch (err) {
    return failFromError(err);
  }
}

/**
 * fs_du 输出 schema（描述 success data 结构，不含 ok 包装）。
 *
 * 极简返回 `{ size, path }`；verbose 额外返回 `{ files, dirs }`。
 * 用通用形状（files/dirs 可选）描述两种模式。
 */
export const fsDuOutputSchema = z.object({
  size: z.number().int().nonnegative().describe("累计字节数"),
  path: z.string().describe("目录路径"),
  files: z.number().int().nonnegative().optional().describe("文件数（verbose）"),
  dirs: z.number().int().nonnegative().optional().describe("子目录数（verbose）"),
});

/** fs_du 工具定义。 */
export const fsDuTool: Tool = {
  name: "fs_du",
  domain: "fs",
  description:
    "递归累计目录大小（≈ du），返回 size/path，verbose 加 files/dirs。",
  inputSchema: fsDuInputSchema,
  outputSchema: fsDuOutputSchema,
  annotations: { readOnlyHint: true },
  handler: fsDuHandler,
  aliases: ["du"],
};
