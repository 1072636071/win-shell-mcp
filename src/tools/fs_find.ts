/**
 * fs_find（工单 04）：按文件名模式递归搜索文件。
 *
 * 支持：
 * - pattern：文件名匹配模式，支持 * 通配（多段匹配，可出现在任意位置）
 * - path：起始目录，默认当前目录；经 pathNormalize 处理（/ 与 \、相对路径、盘符）
 * - maxDepth：限制递归深度（1 表示仅起始目录本身）
 * - verbose：返回含 type/size 的条目
 *
 * 返回相对起始目录的路径列表（统一正斜杠显示形式）。
 * 错误：EINVAL（pattern 非法）/ ENOENT（起始路径不存在）/ ENOTDIR（不是目录）/ EACCES（无权限）
 */

import { readdir, lstat } from "node:fs/promises";
import { join, relative } from "node:path";
import { z } from "zod";
import { ok, fail, type AnyToolResult } from "../contract/output.js";
import { ErrorCode } from "../contract/errors.js";
import { failFromError } from "../utils/errors.js";
import { pathNormalize, toDisplay } from "../utils/path.js";
import type { Tool } from "../registry.js";

/** 条目类型。 */
type EntryType = "file" | "dir" | "symlink";

/** 文件名匹配模式 schema。 */
export const fsFindInputSchema = z.object({
  pattern: z.string().min(1).describe("文件名模式（支持 *）"),
  path: z.string().optional().describe("起始目录（默认 .）"),
  maxDepth: z.number().int().positive().optional().describe("最大深度（1=仅起始目录）"),
  verbose: z.boolean().optional().describe("返回 type/size"),
});

/** verbose 条目结构。 */
interface FindEntry {
  name: string;
  type: EntryType;
  size: number;
}

/** 类型判断器结构（Stats 与 Dirent 均满足）。 */
interface FileTypeChecker {
  isSymbolicLink(): boolean;
  isDirectory(): boolean;
  isFile(): boolean;
}

/**
 * 将 stat/lstat 结果映射为 EntryType。
 *
 * 优先级：symlink > dir > file
 */
function toEntryType(stats: FileTypeChecker): EntryType {
  if (stats.isSymbolicLink()) return "symlink";
  if (stats.isDirectory()) return "dir";
  return "file";
}

/**
 * 将文件名通配模式转换为大小写不敏感的正则。
 *
 * - `*` 匹配任意数量（含 0）的任意字符（不含路径分隔符）
 * - 其它字符按字面量转义
 *
 * @param pattern 用户提供的模式（如 `*.txt`、`file*`、`*foo*bar`）
 * @returns RegExp（已带 ^...$ 锚定，大小写不敏感）
 */
export function patternToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .split("*")
    .map((seg) => seg.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${escaped}$`, "i");
}

/**
 * 递归搜索匹配条目。
 *
 * 将匹配结果写入 `matches`；`depth` 从 1 开始计数，受 maxDepth 限制。
 * verbose 时收集 `FindEntry[]`（含类型与大小），否则收集 `string[]`（仅相对路径）。
 *
 * @param root 起始目录（用于计算相对路径）
 * @param current 当前遍历目录（绝对路径）
 * @param depth 当前深度（起始目录为 1）
 * @param regex 编译后的匹配正则
 * @param maxDepth 最大深度（undefined 表示无限）
 * @param verbose 是否收集类型与大小
 * @param matches 输出收集器（FindEntry[] 或 string[]）
 */
async function walkFind(
  root: string,
  current: string,
  depth: number,
  regex: RegExp,
  maxDepth: number | undefined,
  verbose: boolean,
  matches: FindEntry[] | string[],
): Promise<void> {
  const entries = await readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(current, entry.name);
    const relPath = toDisplay(relative(root, fullPath));

    if (regex.test(entry.name)) {
      if (verbose) {
        const stats = await lstat(fullPath);
        (matches as FindEntry[]).push({
          name: relPath,
          type: toEntryType(stats),
          size: stats.size,
        });
      } else {
        (matches as string[]).push(relPath);
      }
    }

    if (entry.isDirectory() && (maxDepth === undefined || depth < maxDepth)) {
      await walkFind(
        root,
        fullPath,
        depth + 1,
        regex,
        maxDepth,
        verbose,
        matches,
      );
    }
  }
}

/**
 * fs_find handler：按文件名模式递归搜索。
 *
 * - pattern 非法（空串，zod 已挡）不进入
 * - 起始路径不存在 → ENOENT
 * - 起始路径非目录 → ENOTDIR
 * - 无权限 → EACCES（由 failFromError 兜底）
 *
 * 返回 `{ entries: string[] }`（极简）或 `{ entries: [{ name, type, size }] }`（verbose）。
 */
export async function fsFindHandler(
  args: Record<string, unknown>,
): Promise<AnyToolResult> {
  const pattern = args["pattern"];
  const pathArg = args["path"];
  const maxDepth = args["maxDepth"];
  const verbose = args["verbose"] === true;

  if (typeof pattern !== "string" || pattern.length === 0) {
    return fail(ErrorCode.EINVAL, "pattern 必须是非空字符串");
  }
  if (pathArg !== undefined && typeof pathArg !== "string") {
    return fail(ErrorCode.EINVAL, "path 必须是字符串");
  }
  if (
    maxDepth !== undefined &&
    (typeof maxDepth !== "number" || maxDepth < 1)
  ) {
    return fail(ErrorCode.EINVAL, "maxDepth 必须是正整数");
  }

  const base = pathNormalize(typeof pathArg === "string" ? pathArg : ".");

  try {
    const regex = patternToRegExp(pattern);
    const matches: FindEntry[] | string[] = [];
    await walkFind(base, base, 1, regex, maxDepth, verbose, matches);

    return ok({ entries: matches }) as unknown as AnyToolResult;
  } catch (err) {
    return failFromError(err);
  }
}

/**
 * fs_find 输出 schema（描述 success data 结构，不含 ok 包装）。
 *
 * 极简返回 `{ entries: string[] }`（匹配的相对路径）；
 * verbose 返回 `{ entries: [{ name, type, size }] }`。
 * 用 union 表达两种条目形状（zod 顶层仍是 z.object，符合 MCP 协议要求）。
 */
export const fsFindOutputSchema = z.object({
  entries: z
    .array(
      z.union([
        z.string().describe("匹配的相对路径"),
        z.object({
          name: z.string().describe("匹配的相对路径"),
          type: z.enum(["file", "dir", "symlink"]),
          size: z.number().int().nonnegative().describe("字节数"),
        }),
      ]),
    )
    .describe("匹配条目列表"),
});

/** find 工具定义（Unix 短名为主，fs_find 等为语义别名）。 */
export const fsFindTool: Tool = {
  name: "find",
  domain: "search",
  description:
    "按文件名模式递归找文件（≈ find，支持 * 通配，非内容搜索）。",
  inputSchema: fsFindInputSchema,
  outputSchema: fsFindOutputSchema,
  // 仅递归读取目录树，不改变文件系统，readOnlyHint: true
  annotations: { readOnlyHint: true },
  handler: fsFindHandler,
  aliases: ["fs_find", "search_file", "find_files"],
};
