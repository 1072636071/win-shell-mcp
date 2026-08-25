/**
 * fs 只读工具集：fs_list / fs_read / fs_stat。
 *
 * 设计原则（见 CONTEXT.md / ADR-0003）：
 * - 极简输出：默认只含 AI 决策所需最小字段
 * - verbose：需要完整数据时开启
 * - 统一错误码：ENOENT/EISDIR/ENOTDIR/EACCES
 *
 * 用 Node fs/promises API，lstat 检测 symlink，stat 跟随链接。
 */

import { readdir, readFile, lstat, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { z } from 'zod';
import { ok, fail, truncate, withVerbose, type AnyToolResult } from '../contract/output.js';
import { ErrorCode } from '../contract/errors.js';
import { toFail } from '../utils/errors.js';
import { decodeBuffer } from '../encoding/detect.js';
import { globToRegExp, isValidGlob } from '../utils/glob.js';
import type { Tool } from '../registry.js';

/** 条目类型。 */
type EntryType = 'file' | 'dir' | 'symlink';

/** 类型判断器结构（Stats 与 Dirent 均满足）。 */
interface FileTypeChecker {
  isSymbolicLink(): boolean;
  isDirectory(): boolean;
  isFile(): boolean;
}

/**
 * 将 stat/lstat/Dirent 结果映射为 EntryType。
 *
 * 优先级：symlink > dir > file
 */
function toEntryType(stats: FileTypeChecker): EntryType {
  if (stats.isSymbolicLink()) return 'symlink';
  if (stats.isDirectory()) return 'dir';
  return 'file';
}

// ===================== fs_list =====================

/** fs_list 输入 schema。 */
export const fsListInputSchema = z.object({
  path: z.string().describe('目录路径（绝对或相对）'),
  verbose: z
    .boolean()
    .optional()
    .describe('若为 true，返回每个条目的类型、大小与修改时间'),
  recursive: z.boolean().optional().describe('若为 true，递归列出子目录'),
  sort: z.enum(['name', 'size', 'mtime']).optional().describe('排序字段，默认 name'),
  sortOrder: z.enum(['asc', 'desc']).optional().describe('排序方向，默认 asc'),
  type: z
    .enum(['file', 'dir', 'symlink'])
    .optional()
    .describe('只返回该类型条目'),
  glob: z.string().optional().describe('按 glob 模式过滤条目名称（支持 *、?、[]）'),
});

/** verbose 条目结构。 */
interface VerboseEntry {
  name: string;
  type: EntryType;
  size: number;
  mtime: string;
}

/** 内部完整条目（用于过滤与排序）。 */
interface FullEntry {
  name: string;
  type: EntryType;
  size: number;
  mtimeMs: number;
}

/**
 * 递归收集目录条目（含 type/size/mtime）。
 *
 * @param root 根目录（用于计算相对路径）
 * @param dir 当前目录
 * @param recursive 是否递归
 * @returns 完整条目列表
 */
async function collectEntries(
  root: string,
  dir: string,
  recursive: boolean,
): Promise<FullEntry[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const result: FullEntry[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    const relPath = relative(root, fullPath);
    const stats = await lstat(fullPath);
    result.push({
      name: relPath,
      type: toEntryType(stats),
      size: stats.size,
      mtimeMs: stats.mtimeMs,
    });
    if (recursive && entry.isDirectory()) {
      const sub = await collectEntries(root, fullPath, recursive);
      result.push(...sub);
    }
  }
  return result;
}

/**
 * fs_list handler：列目录。
 *
 * 极简返回 `{ entries: string[] }`（相对路径）。
 * verbose 返回 `{ entries: [{ name, type, size, mtime }] }`。
 * recursive 时递归列出子目录。
 * sort/sortOrder 控制排序；type/glob 控制过滤。
 *
 * 错误：ENOENT（不存在）/ ENOTDIR（不是目录）/ EACCES（无权限）
 */
export async function fsListHandler(args: Record<string, unknown>): Promise<AnyToolResult> {
  const path = args['path'];
  const verbose = args['verbose'] === true;
  const recursive = args['recursive'] === true;
  const sort = (args['sort'] as string | undefined) ?? 'name';
  const sortOrder = (args['sortOrder'] as string | undefined) ?? 'asc';
  const typeFilter = args['type'] as string | undefined;
  const glob = args['glob'] as string | undefined;

  if (typeof path !== 'string') {
    return fail(ErrorCode.EINVAL, 'path 必须是字符串');
  }
  if (glob !== undefined && !isValidGlob(glob)) {
    return fail(ErrorCode.EINVAL, `非法 glob: ${glob}`);
  }

  try {
    const stats = await stat(path);
    if (!stats.isDirectory()) {
      return fail(ErrorCode.ENOTDIR, `不是目录: ${path}`);
    }

    let entries = await collectEntries(path, path, recursive);

    // type 过滤
    if (typeFilter !== undefined) {
      entries = entries.filter((e) => e.type === typeFilter);
    }

    // glob 过滤（匹配相对路径名）
    if (glob !== undefined) {
      const re = globToRegExp(glob);
      entries = entries.filter((e) => re.test(e.name));
    }

    // 排序
    const dirMul = sortOrder === 'desc' ? -1 : 1;
    entries.sort((a, b) => {
      let cmp = 0;
      if (sort === 'size') {
        cmp = a.size - b.size;
      } else if (sort === 'mtime') {
        cmp = a.mtimeMs - b.mtimeMs;
      } else {
        cmp = a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
      }
      return cmp * dirMul;
    });

    // 输出
    if (verbose) {
      const verboseEntries: VerboseEntry[] = entries.map((e) => ({
        name: e.name,
        type: e.type,
        size: e.size,
        mtime: new Date(e.mtimeMs).toISOString(),
      }));
      return ok({ entries: verboseEntries }) as unknown as AnyToolResult;
    }

    const simpleEntries: string[] = entries.map((e) => e.name);
    return ok({ entries: simpleEntries });
  } catch (err) {
    return toFail(err);
  }
}

/**
 * fs_list 输出 schema（描述 success data 结构，不含 ok 包装）。
 *
 * 极简返回 `{ entries: string[] }`（相对路径）；verbose 返回
 * `{ entries: [{ name, type, size, mtime }] }`。顶层用 z.object（MCP 协议要求
 * outputSchema 顶层为 object），entries 元素用 union 表达极简/verbose 两种条目形状。
 */
export const fsListOutputSchema = z.object({
  entries: z
    .array(
      z.union([
        z.string().describe('相对路径名（极简模式）'),
        z
          .object({
            name: z.string().describe('相对路径名'),
            type: z.enum(['file', 'dir', 'symlink']).describe('条目类型'),
            size: z.number().int().nonnegative().describe('字节数'),
            mtime: z.string().describe('修改时间（ISO 8601）'),
          })
          .describe('verbose 条目'),
      ]),
    )
    .describe('条目列表：极简模式为相对路径字符串，verbose 模式为含 type/size/mtime 的对象'),
});

/** fs_list 工具定义。 */
export const fsListTool: Tool = {
  name: 'fs_list',
  description:
    '列目录（≈ Unix ls）。极简返回相对路径列表；verbose 含类型、大小与修改时间；recursive 递归；sort/sortOrder 排序；type/glob 过滤。',
  inputSchema: fsListInputSchema,
  outputSchema: fsListOutputSchema,
  annotations: { readOnlyHint: true },
  handler: fsListHandler,
  aliases: ['ls', 'list_directory'],
};

// ===================== fs_read =====================

/** fs_read 输入 schema。 */
export const fsReadInputSchema = z.object({
  path: z.string().describe('文件路径'),
  encoding: z
    .string()
    .optional()
    .describe('显式指定编码（如 gbk、utf-8），不指定则自动检测'),
  start: z.number().int().positive().optional().describe('起始行号（1-indexed，含）'),
  end: z.number().int().positive().optional().describe('结束行号（1-indexed，含；与 cat 的 startLine/endLine 语义一致）'),
  maxLen: z.number().int().positive().optional().describe('最大字符数，默认 2000'),
});

/**
 * fs_read 输出 schema（描述 success data 结构，不含 ok 包装）。
 *
 * 成功返回 `{ content, truncated, lines }`：
 * - content：文件内容（可能截断）
 * - truncated：是否触发了截断
 * - lines：内容行数
 */
export const fsReadOutputSchema = z.object({
  content: z.string().describe('文件内容（可能截断）'),
  truncated: z.boolean().describe('是否触发截断'),
  lines: z.number().int().nonnegative().describe('内容行数'),
});

/**
 * fs_read handler：读文件。
 *
 * - encoding 显式指定（如 'gbk'），不指定则用 decodeBuffer 自动检测
 * - start/end 行范围（1-indexed，含 start 不含 end）
 * - 返回 `{ content, truncated, lines }`，content 用 truncate 截断
 *
 * 错误：ENOENT（不存在）/ EISDIR（是目录）/ EACCES（无权限）
 */
export async function fsReadHandler(args: Record<string, unknown>): Promise<AnyToolResult> {
  const path = args['path'];
  const encoding = args['encoding'];
  const start = args['start'];
  const end = args['end'];
  const maxLen = args['maxLen'];

  if (typeof path !== 'string') {
    return fail(ErrorCode.EINVAL, 'path 必须是字符串');
  }

  try {
    // 先检查路径是否为文件（非目录）
    const stats = await stat(path);
    if (stats.isDirectory()) {
      return fail(ErrorCode.EISDIR, `是目录: ${path}`);
    }

    const buf = await readFile(path);
    let content = decodeBuffer(buf, typeof encoding === 'string' ? encoding : undefined);

    // 行范围处理（1-indexed，闭区间：含 start 含 end，与 cat 的 startLine/endLine 语义一致）
    const startLine = typeof start === 'number' && start > 0 ? Math.floor(start) : 1;
    const endLine = typeof end === 'number' && end > 0 ? Math.floor(end) : undefined;

    if (startLine > 1 || endLine !== undefined) {
      const lines = content.split('\n');
      const sliceStart = startLine - 1; // 转 0-indexed
      const sliceEnd = endLine !== undefined ? endLine : lines.length; // 闭区间：含 end 行 → slice 上界 exclusive 取 endLine
      content = lines.slice(sliceStart, sliceEnd).join('\n');
    }

    const totalLines = content.split('\n').length;
    const limit = typeof maxLen === 'number' && maxLen > 0 ? Math.floor(maxLen) : 2000;
    const truncated = content.length > limit;
    const truncatedContent = truncate(content, limit);

    return ok({
      content: truncatedContent,
      truncated,
      lines: totalLines,
    });
  } catch (err) {
    return toFail(err);
  }
}

/** fs_read 工具定义。 */
export const fsReadTool: Tool = {
  name: 'fs_read',
  description:
    '读文件。支持行范围（start/end，1-indexed 闭区间含端点，与 cat 的 startLine/endLine 语义一致）、编码自动检测（GBK/UTF-8）、截断。',
  inputSchema: fsReadInputSchema,
  outputSchema: fsReadOutputSchema,
  annotations: { readOnlyHint: true },
  handler: fsReadHandler,
};

// ===================== fs_stat =====================

/** fs_stat 输入 schema。 */
export const fsStatInputSchema = z.object({
  path: z.string().describe('文件/目录路径'),
});

/** fs_stat 返回结构。 */
interface StatResult {
  type: EntryType;
  size: number;
  mtime: number;
  birthtime?: number;
}

/**
 * fs_stat handler：获取文件/目录信息。
 *
 * 用 lstat 检测 symlink（不跟随链接）。
 * 返回 `{ type, size, mtime, birthtime }`。
 *
 * 错误：ENOENT（不存在）/ EACCES（无权限）
 */
export async function fsStatHandler(args: Record<string, unknown>): Promise<AnyToolResult> {
  const path = args['path'];

  if (typeof path !== 'string') {
    return fail(ErrorCode.EINVAL, 'path 必须是字符串');
  }

  try {
    const stats = await lstat(path);
    const result: StatResult = {
      type: toEntryType(stats),
      size: stats.size,
      mtime: stats.mtimeMs,
      birthtime: stats.birthtimeMs,
    };
    return ok(result);
  } catch (err) {
    return toFail(err);
  }
}

/**
 * fs_stat 输出 schema（描述 success data 结构，不含 ok 包装）。
 *
 * 成功返回 `{ type, size, mtime, birthtime }`：
 * - type：条目类型（file/dir/symlink，lstat 不跟随链接）
 * - size：字节数
 * - mtime：修改时间（毫秒时间戳）
 * - birthtime：创建时间（毫秒时间戳，接口标 optional 以兼容平台差异）
 */
export const fsStatOutputSchema = z.object({
  type: z.enum(['file', 'dir', 'symlink']).describe('条目类型'),
  size: z.number().int().nonnegative().describe('字节数'),
  mtime: z.number().describe('修改时间（毫秒时间戳）'),
  birthtime: z.number().optional().describe('创建时间（毫秒时间戳）'),
});

/** fs_stat 工具定义。 */
export const fsStatTool: Tool = {
  name: 'fs_stat',
  description:
    '获取文件/目录信息。返回 type（file/dir/symlink）、size、mtime、birthtime。',
  inputSchema: fsStatInputSchema,
  outputSchema: fsStatOutputSchema,
  annotations: { readOnlyHint: true },
  handler: fsStatHandler,
};