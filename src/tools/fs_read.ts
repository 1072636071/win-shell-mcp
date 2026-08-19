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
import { failFromError } from '../utils/errors.js';
import { decodeBuffer } from '../encoding/detect.js';
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
    .describe('若为 true，返回每个条目的类型与大小'),
  recursive: z.boolean().optional().describe('若为 true，递归列出子目录'),
});

/** verbose 条目结构。 */
interface VerboseEntry {
  name: string;
  type: EntryType;
  size: number;
}

/**
 * 递归列出目录（极简模式）。
 *
 * @param root 根目录（用于计算相对路径）
 * @param dir 当前目录
 * @returns 相对路径列表
 */
async function listSimpleRecursive(root: string, dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const result: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    const relPath = relative(root, fullPath);
    result.push(relPath);
    if (entry.isDirectory()) {
      const subEntries = await listSimpleRecursive(root, fullPath);
      result.push(...subEntries);
    }
  }
  return result;
}

/**
 * 递归列出目录（verbose 模式）。
 *
 * @param root 根目录（用于计算相对路径）
 * @param dir 当前目录
 * @returns verbose 条目列表
 */
async function listVerboseRecursive(root: string, dir: string): Promise<VerboseEntry[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const result: VerboseEntry[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    const relPath = relative(root, fullPath);
    // 用 lstat 以正确识别 symlink
    const stats = await lstat(fullPath);
    result.push({ name: relPath, type: toEntryType(stats), size: stats.size });
    if (entry.isDirectory()) {
      const subEntries = await listVerboseRecursive(root, fullPath);
      result.push(...subEntries);
    }
  }
  return result;
}

/**
 * fs_list handler：列目录。
 *
 * 极简返回 `{ entries: string[] }`（相对路径）。
 * verbose 返回 `{ entries: [{ name, type, size }] }`。
 * recursive 时递归列出子目录。
 *
 * 错误：ENOENT（不存在）/ ENOTDIR（不是目录）/ EACCES（无权限）
 */
export async function fsListHandler(args: Record<string, unknown>): Promise<AnyToolResult> {
  const path = args['path'];
  const verbose = args['verbose'] === true;
  const recursive = args['recursive'] === true;

  if (typeof path !== 'string') {
    return fail(ErrorCode.EINVAL, 'path 必须是字符串');
  }

  try {
    // 先检查路径是否存在且为目录
    const stats = await stat(path);
    if (!stats.isDirectory()) {
      return fail(ErrorCode.ENOTDIR, `不是目录: ${path}`);
    }

    if (recursive) {
      // withVerbose 不适用：minimal 与 full 计算路径不同（避免不必要的 lstat IO）
      if (verbose) {
        const entries = await listVerboseRecursive(path, path);
        return ok({ entries }) as unknown as AnyToolResult;
      }
      const entries = await listSimpleRecursive(path, path);
      return ok({ entries }) as unknown as AnyToolResult;
    }

    // 非递归
    const entries = await readdir(path, { withFileTypes: true });
    // withVerbose 不适用：minimal 与 full 计算路径不同（避免不必要的 lstat IO）
    if (verbose) {
      const verboseEntries: VerboseEntry[] = [];
      for (const entry of entries) {
        const fullPath = join(path, entry.name);
        const entryStats = await lstat(fullPath);
        verboseEntries.push({
          name: entry.name,
          type: toEntryType(entryStats),
          size: entryStats.size,
        });
      }
      return ok({ entries: verboseEntries }) as unknown as AnyToolResult;
    }

    const simpleEntries: string[] = entries.map((e) => e.name);
    return ok({ entries: simpleEntries }) as unknown as AnyToolResult;
  } catch (err) {
    return failFromError(err);
  }
}

/** fs_list 工具定义。 */
export const fsListTool: Tool = {
  name: 'fs_list',
  description:
    '列目录（Unix ls 短名）。极简返回相对路径列表；verbose 时含类型与大小；recursive 时递归列出子目录。',
  inputSchema: fsListInputSchema,
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
  end: z.number().int().positive().optional().describe('结束行号（1-indexed，不含）'),
  maxLen: z.number().int().positive().optional().describe('最大字符数，默认 2000'),
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

    // 行范围处理（1-indexed，含 start 不含 end）
    const startLine = typeof start === 'number' && start > 0 ? Math.floor(start) : 1;
    const endLine = typeof end === 'number' && end > 0 ? Math.floor(end) : undefined;

    if (startLine > 1 || endLine !== undefined) {
      const lines = content.split('\n');
      const sliceStart = startLine - 1; // 转 0-indexed
      const sliceEnd = endLine !== undefined ? endLine - 1 : lines.length;
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
    }) as unknown as AnyToolResult;
  } catch (err) {
    return failFromError(err);
  }
}

/** fs_read 工具定义。 */
export const fsReadTool: Tool = {
  name: 'fs_read',
  description:
    '读文件。支持行范围（start/end，1-indexed，含 start 不含 end）、编码自动检测（GBK/UTF-8）、截断。',
  inputSchema: fsReadInputSchema,
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
    return ok(result) as unknown as AnyToolResult;
  } catch (err) {
    return failFromError(err);
  }
}

/** fs_stat 工具定义。 */
export const fsStatTool: Tool = {
  name: 'fs_stat',
  description:
    '获取文件/目录信息。返回 type（file/dir/symlink）、size、mtime、birthtime。',
  inputSchema: fsStatInputSchema,
  handler: fsStatHandler,
};