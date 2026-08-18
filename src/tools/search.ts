/**
 * search 工具集：glob 文件查找、跨文件内容搜索、PATH 中定位可执行。
 *
 * 提供 3 个工具：
 * - search_glob：按 glob 模式匹配文件路径
 * - search_content：跨文件内容搜索（grep 风格）
 * - search_which：在 PATH 中定位可执行文件
 *
 * 设计原则：极简输出、自动跳过二进制、跨平台兼容、边界安全。
 */

import { promises as fs } from 'node:fs';
import type { Dirent, Stats } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { ok, fail, truncate, withVerbose, type AnyToolResult } from '../contract/output.js';
import { ErrorCode } from '../contract/errors.js';
import type { Tool } from '../registry.js';

// ============================================================================
// 内部工具函数
// ============================================================================

/** 转义正则元字符。 */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 将 glob pattern 转换为 RegExp。
 *
 * 支持的通配符：
 * - 双星斜杠：匹配任意层目录（含 0 层）
 * - 双星：匹配任意字符（含路径分隔符）
 * - 单星：匹配除路径分隔符外的任意字符
 * - 问号：匹配单个除路径分隔符外的字符
 * - 字符集 [abc] 或取反 [!abc]
 *
 * 路径分隔符统一用正斜杠（输入 pattern 中的反斜杠也会被当作正斜杠）。
 *
 * @param pattern glob pattern
 * @returns RegExp
 */
function globToRegExp(pattern: string): RegExp {
  let re = '';
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i]!;
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        if (pattern[i + 2] === '/' || pattern[i + 2] === '\\') {
          // **/ 匹配任意层目录（含 0 层）
          re += `(?:[^/]*/)*`;
          i += 3;
        } else {
          // ** 匹配任意字符（含分隔符）
          re += '.*';
          i += 2;
        }
      } else {
        // * 匹配除分隔符外的任意字符
        re += `[^/]*`;
        i += 1;
      }
    } else if (c === '?') {
      re += `[^/]`;
      i += 1;
    } else if (c === '[') {
      const end = pattern.indexOf(']', i);
      if (end === -1) {
        re += '\\[';
        i += 1;
      } else {
        let cls = pattern.slice(i + 1, end);
        if (cls.startsWith('!')) {
          cls = `^${cls.slice(1)}`;
        }
        re += `[${cls}]`;
        i = end + 1;
      }
    } else if (c === '/' || c === '\\') {
      re += '/';
      i += 1;
    } else {
      re += escapeRegex(c);
      i += 1;
    }
  }
  return new RegExp(`^${re}$`);
}

/** 判断 glob pattern 是否合法（非空且括号配对）。 */
function isValidGlob(pattern: string): boolean {
  if (pattern.length === 0) return false;
  let depthSquare = 0;
  let depthCurly = 0;
  for (const c of pattern) {
    if (c === '[') depthSquare++;
    else if (c === ']') depthSquare--;
    else if (c === '{') depthCurly++;
    else if (c === '}') depthCurly--;
    if (depthSquare < 0 || depthCurly < 0) return false;
  }
  return depthSquare === 0 && depthCurly === 0;
}

/** 递归列出目录下所有文件（相对 cwd 的相对路径，用 / 分隔）。跳过无权限子目录。 */
async function listFiles(dir: string, recursive: boolean): Promise<string[]> {
  const files: string[] = [];
  async function walk(d: string): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(d, { withFileTypes: true });
    } catch {
      // 跳过无权限或无法读取的目录
      return;
    }
    for (const entry of entries) {
      const full = path.join(d, entry.name);
      if (entry.isFile()) {
        files.push(path.relative(dir, full).split(path.sep).join('/'));
      } else if (entry.isDirectory() && recursive) {
        await walk(full);
      }
    }
  }
  await walk(dir);
  return files;
}

/** 判断文件内容是否为二进制（含 NUL 字节）。 */
function isBinary(buf: Buffer): boolean {
  return buf.includes(0);
}

/** 验证 cwd 是目录，返回错误结果或 null。 */
async function validateCwd(cwd: string): Promise<AnyToolResult | null> {
  let stat: Stats;
  try {
    stat = await fs.stat(cwd);
  } catch {
    return fail(ErrorCode.ENOENT, `目录不存在: ${cwd}`);
  }
  if (!stat.isDirectory()) {
    return fail(ErrorCode.ENOTDIR, `不是目录: ${cwd}`);
  }
  return null;
}

// ============================================================================
// search_glob
// ============================================================================

export const searchGlobInputSchema = z.object({
  pattern: z.string().min(1).describe('glob 模式，支持 *、**、?、[]'),
  cwd: z.string().optional().describe('工作目录，默认 process.cwd()'),
  recursive: z.boolean().optional().describe('是否递归搜索子目录，默认 true'),
  maxResults: z.number().int().positive().optional().describe('最大返回结果数'),
});

export type SearchGlobInput = z.infer<typeof searchGlobInputSchema>;

export async function searchGlobHandler(args: Record<string, unknown>): Promise<AnyToolResult> {
  const pattern = args['pattern'];
  if (typeof pattern !== 'string' || pattern.length === 0) {
    return fail(ErrorCode.EINVAL, 'pattern 不能为空');
  }
  const cwd = (args['cwd'] as string | undefined) ?? process.cwd();
  const recursive = (args['recursive'] as boolean | undefined) ?? true;
  const maxResults = args['maxResults'] as number | undefined;

  if (!isValidGlob(pattern)) {
    return fail(ErrorCode.EINVAL, `非法 glob pattern: ${pattern}`);
  }

  const cwdErr = await validateCwd(cwd);
  if (cwdErr !== null) return cwdErr;

  let files: string[];
  try {
    files = await listFiles(cwd, recursive);
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'EACCES') {
      return fail(ErrorCode.EACCES, `无权限访问目录: ${cwd}`);
    }
    return fail(ErrorCode.EUNKNOWN, `读取目录失败: ${e.message}`);
  }

  const re = globToRegExp(pattern);
  let matched = files.filter((f) => re.test(f));
  matched.sort();

  let truncated = false;
  if (maxResults !== undefined && matched.length > maxResults) {
    truncated = true;
    matched = matched.slice(0, maxResults);
  }

  return ok({ files: matched, count: matched.length, truncated }) as unknown as AnyToolResult;
}

export const searchGlobTool: Tool = {
  name: 'search_glob',
  description: '按 glob 模式匹配文件路径，返回相对路径列表。支持 *、**、?、[]。',
  inputSchema: searchGlobInputSchema,
  handler: searchGlobHandler,
};

// ============================================================================
// search_content
// ============================================================================

export const searchContentInputSchema = z.object({
  pattern: z.string().min(1).describe('搜索内容（字符串子串匹配）'),
  cwd: z.string().optional().describe('工作目录，默认 process.cwd()'),
  glob: z.string().optional().describe('文件名 glob 过滤，默认 **/*'),
  ignoreCase: z.boolean().optional().describe('忽略大小写，默认 false'),
  maxResults: z.number().int().positive().optional().describe('最大返回结果数'),
});

export type SearchContentInput = z.infer<typeof searchContentInputSchema>;

interface ContentMatch {
  file: string;
  line: number;
  text: string;
}

export async function searchContentHandler(args: Record<string, unknown>): Promise<AnyToolResult> {
  const pattern = args['pattern'];
  if (typeof pattern !== 'string' || pattern.length === 0) {
    return fail(ErrorCode.EINVAL, 'pattern 不能为空');
  }
  const cwd = (args['cwd'] as string | undefined) ?? process.cwd();
  const globPattern = (args['glob'] as string | undefined) ?? '**/*';
  const ignoreCase = (args['ignoreCase'] as boolean | undefined) ?? false;
  const maxResults = args['maxResults'] as number | undefined;

  if (!isValidGlob(globPattern)) {
    return fail(ErrorCode.EINVAL, `非法 glob: ${globPattern}`);
  }

  const cwdErr = await validateCwd(cwd);
  if (cwdErr !== null) return cwdErr;

  let files: string[];
  try {
    files = await listFiles(cwd, true);
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'EACCES') {
      return fail(ErrorCode.EACCES, `无权限访问目录: ${cwd}`);
    }
    return fail(ErrorCode.EUNKNOWN, `读取目录失败: ${e.message}`);
  }

  const globRe = globToRegExp(globPattern);
  const candidateFiles = files.filter((f) => globRe.test(f));

  const allMatches: ContentMatch[] = [];
  const needle = ignoreCase ? pattern.toLowerCase() : pattern;

  for (const file of candidateFiles) {
    const full = path.join(cwd, file);
    let buf: Buffer;
    try {
      buf = await fs.readFile(full);
    } catch {
      // 跳过无法读取的文件
      continue;
    }
    if (isBinary(buf)) continue;

    const content = buf.toString('utf8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line === undefined) continue;
      const hay = ignoreCase ? line.toLowerCase() : line;
      if (hay.includes(needle)) {
        allMatches.push({ file, line: i + 1, text: truncate(line) });
      }
    }
  }

  // 排序保证输出稳定（按 file 字典序，再按 line 行号）
  allMatches.sort((a, b) => {
    if (a.file !== b.file) return a.file < b.file ? -1 : 1;
    return a.line - b.line;
  });

  let truncated = false;
  let matches = allMatches;
  if (maxResults !== undefined && allMatches.length > maxResults) {
    truncated = true;
    matches = allMatches.slice(0, maxResults);
  }

  return ok({ matches, count: matches.length, truncated }) as unknown as AnyToolResult;
}

export const searchContentTool: Tool = {
  name: 'search_content',
  description: '跨文件内容搜索，返回 [{file, line, text}]。自动跳过二进制文件。',
  inputSchema: searchContentInputSchema,
  handler: searchContentHandler,
};

// ============================================================================
// search_which
// ============================================================================

export const searchWhichInputSchema = z.object({
  command: z.string().min(1).describe('要查找的命令名'),
  verbose: z.boolean().optional().describe('若为 true，返回所有匹配路径 all 字段'),
});

export type SearchWhichInput = z.infer<typeof searchWhichInputSchema>;

/** Windows 可执行文件后缀。 */
const WINDOWS_EXTS = ['.exe', '.cmd', '.bat', '.ps1'];

export async function searchWhichHandler(args: Record<string, unknown>): Promise<AnyToolResult> {
  const command = args['command'];
  if (typeof command !== 'string' || command.length === 0) {
    return fail(ErrorCode.EINVAL, 'command 不能为空');
  }
  const verbose = args['verbose'] === true;

  const isWindows = process.platform === 'win32';
  // Windows: Path 或 PATH；unix: PATH
  const pathEnv = process.env['PATH'] ?? process.env['Path'] ?? '';
  const sep = isWindows ? ';' : ':';
  const dirs = pathEnv.split(sep).filter((d) => d.length > 0);

  const all: string[] = [];

  for (const dir of dirs) {
    const candidates: string[] = [];
    if (isWindows) {
      // 如果 command 已有可执行后缀，直接尝试；否则附加后缀
      const ext = path.extname(command).toLowerCase();
      if (ext && WINDOWS_EXTS.includes(ext)) {
        candidates.push(command);
      } else {
        for (const e of WINDOWS_EXTS) {
          candidates.push(command + e);
        }
        // 也尝试无后缀（如 .sh、无后缀可执行）
        candidates.push(command);
      }
    } else {
      candidates.push(command);
    }

    for (const candidate of candidates) {
      const full = path.join(dir, candidate);
      try {
        const stat = await fs.stat(full);
        if (stat.isFile()) {
          all.push(full);
        }
      } catch {
        // 不存在或无法访问，继续
      }
    }
  }

  // 去重（PATH 中可能有重复目录）
  const uniqueAll = [...new Set(all)];

  if (uniqueAll.length === 0) {
    return ok({ found: false }) as unknown as AnyToolResult;
  }

  const minimal = { found: true, path: uniqueAll[0]! };
  const full = { found: true, path: uniqueAll[0]!, all: uniqueAll };
  return ok(withVerbose(minimal, full, verbose)) as unknown as AnyToolResult;
}

export const searchWhichTool: Tool = {
  name: 'search_which',
  description: '在 PATH 中定位可执行文件。Windows 自动尝试 .exe/.cmd/.bat/.ps1 后缀。',
  inputSchema: searchWhichInputSchema,
  handler: searchWhichHandler,
};