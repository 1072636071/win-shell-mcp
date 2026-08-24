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
import { parsePattern, SEARCH_PATTERN_FLAGS } from '../utils/pattern.js';
import { buildSearchHint } from '../utils/hints.js';
import { splitLines } from '../utils/readText.js';
import { globToRegExp, isValidGlob } from '../utils/glob.js';
import type { Tool } from '../registry.js';

// ============================================================================
// 内部工具函数
// ============================================================================


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

/**
 * 解析并校验 exclude 列表，返回编译后的正则数组或错误结果。
 *
 * 供 search_glob 与 search_content 共用，消除重复校验逻辑。
 *
 * @param rawExclude 用户传入的 exclude 值（可能为 undefined）
 * @returns 成功返回 RegExp[]；失败返回 fail 结果（通过 `isFail` 判别）
 */
function parseExclude(rawExclude: unknown): AnyToolResult | RegExp[] {
  if (rawExclude === undefined) return [];
  if (!Array.isArray(rawExclude)) {
    return fail(ErrorCode.EINVAL, 'exclude 必须是字符串数组');
  }
  const patterns = rawExclude as string[];
  const res: string[] = [];
  for (const g of patterns) {
    if (typeof g !== 'string' || !isValidGlob(g)) {
      return fail(ErrorCode.EINVAL, `非法 exclude glob: ${String(g)}`);
    }
    res.push(g);
  }
  return res.map((g) => globToRegExp(g));
}

// ============================================================================
// search_glob
// ============================================================================

export const searchGlobInputSchema = z.object({
  pattern: z.string().min(1).describe('glob 模式，支持 *、**、?、[]'),
  cwd: z.string().optional().describe('工作目录，默认 process.cwd()'),
  recursive: z.boolean().optional().describe('是否递归搜索子目录，默认 true'),
  maxResults: z.number().int().positive().optional().describe('最大返回结果数'),
  exclude: z
    .array(z.string())
    .optional()
    .describe('排除的 glob 模式数组，相对路径匹配任一 exclude 的文件会被移除'),
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

  // 解析并校验 exclude 列表
  const excludeRes = parseExclude(args['exclude']);
  if (!Array.isArray(excludeRes)) return excludeRes;

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
  let matched = files.filter(
    (f) => re.test(f) && !excludeRes.some((er) => er.test(f)),
  );
  matched.sort();

  let truncated = false;
  if (maxResults !== undefined && matched.length > maxResults) {
    truncated = true;
    matched = matched.slice(0, maxResults);
  }

  return ok({ files: matched, count: matched.length, truncated });
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
  pattern: z
    .string()
    .min(1)
    .describe(
      '搜索模式：默认字面量子串匹配（元字符原样，如 C:\\Users 免转义）；/正则/ 形式启用正则，尾部可选 flags i/m/s',
    ),
  cwd: z.string().optional().describe('工作目录，默认 process.cwd()'),
  glob: z.string().optional().describe('文件名 glob 过滤，默认 **/*'),
  exclude: z
    .array(z.string())
    .optional()
    .describe('排除的 glob 模式数组，相对路径匹配任一 exclude 的文件会被跳过'),
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

  // 解析并校验 exclude 列表
  const excludeRes = parseExclude(args['exclude']);
  if (!Array.isArray(excludeRes)) return excludeRes;

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
  const candidateFiles = files.filter(
    (f) => globRe.test(f) && !excludeRes.some((er) => er.test(f)),
  );

  // 双模解析（工单03）：与 text_grep 共用同一严格判定解析器（src/utils/pattern.ts），
  // 同一 pattern 的解释结果与错误逐字一致；结构似正则但 flags 非法 → EINVAL 列明合法标志
  const parsed = parsePattern(pattern, ignoreCase, SEARCH_PATTERN_FLAGS);
  if (!parsed.ok) {
    return fail(ErrorCode.EINVAL, parsed.error);
  }
  const isRegex = parsed.mode === 'regex';
  const regex = isRegex ? parsed.regex : null;
  // 字面量匹配针：ignoreCase 时两侧统一小写比较（与 text_grep 一致），元字符不参与任何转义
  const needle = isRegex ? '' : ignoreCase ? parsed.value.toLowerCase() : parsed.value;

  const allMatches: ContentMatch[] = [];
  let totalLines = 0;

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
    // 与 text_grep 共用 splitLines：末尾换行不产生幻影空行，行号与总行数口径一致
    const lines = splitLines(content);
    totalLines += lines.length;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line === undefined) continue;
      const matched = regex
        ? regex.test(line)
        : ignoreCase
          ? line.toLowerCase().includes(needle)
          : line.includes(needle);
      if (matched) {
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

  const payload: Record<string, unknown> = {
    matches,
    count: matches.length,
    truncated,
    // 模式标识：告知调用方 pattern 被按哪种模式解释（literal=字面量 / regex=正则）
    patternMode: parsed.mode,
  };
  // 双向 hint（工单02 引擎共享，与 text_grep 提示行为逐行一致）；无规则触发不占位。
  // matchCount 必须传截断前真实总数（t6/H1）：否则 maxResults 截断场景下
  // 「命中异常偏多」判据永远够不到阈值，残余洞兜底失效。
  const hint = buildSearchHint({
    patternMode: parsed.mode,
    pattern,
    matchCount: allMatches.length,
    totalLines,
  });
  if (hint !== undefined) payload['hint'] = hint;

  return ok(payload) as unknown as AnyToolResult;
}

export const searchContentTool: Tool = {
  name: 'search_content',
  description:
    '跨文件内容搜索（≈ grep），返回 [{file, line, text}]，自动跳过二进制文件。pattern 默认按字面量子串匹配——元字符一律原样，含反斜杠的路径免转义直接可搜，如 C:\\Users\\alice 反斜杠原样参与匹配；写 "a|b" 只匹配 a|b 本身。需要正则时用首尾斜杠包裹并附尾部可选 flags i/m/s，如 "/a|b/" 匹配 a 或 b、"/\\d{3}/im" 忽略大小写匹配三位数字，体内斜杠须写作 \\/。判定永远向字面量收敛：/usr/bin、/api/v1/ 等不符合规范的写法整体按字面量处理。已知残余洞：形如 /tmp/ 的首尾斜杠短字面量会被判为正则 tmp——命中异常偏多时结果附 hint 兜底。与 text_grep 对同一 pattern 的解释完全一致，返回 count 与 patternMode（literal/regex）。',
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
    return ok({ found: false });
  }

  const minimal = { found: true, path: uniqueAll[0]! };
  const full = { found: true, path: uniqueAll[0]!, all: uniqueAll };
  return ok(withVerbose(minimal, full, verbose));
}

export const searchWhichTool: Tool = {
  name: 'search_which',
  description: '在 PATH 中定位可执行文件。Windows 自动尝试 .exe/.cmd/.bat/.ps1 后缀。',
  inputSchema: searchWhichInputSchema,
  handler: searchWhichHandler,
};