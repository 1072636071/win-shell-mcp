/**
 * text 工具集：grep / head / tail / wc / diff / replace。
 *
 * 行级文本处理工具，所有行号 1-indexed。
 * 长内容通过 truncate 截断，错误返回统一 fail 契约。
 */

import { writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { ok, fail, truncate, type AnyToolResult } from '../contract/output.js';
import { ErrorCode, toErrorCode, toErrorMessage } from '../contract/errors.js';
import { readTextAutoDetect, splitLines } from '../utils/readText.js';
import type { Tool } from '../registry.js';

// ─── 辅助 ───────────────────────────────────────────────

/** 文件读取错误（携带标准错误码）。 */
class FileError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'FileError';
  }
}

/**
 * 读取文本文件并自动解码（GBK/UTF-8），将 Node errno 映射为标准错误码。
 *
 * 复用具生 `readTextAutoDetect` 完成 stat→readFile→decodeBuffer 链路，
 * 保证 GBK 编码文件在文本处理链路中被正确还原为 UTF-8 字符串。
 *
 * @throws {FileError} 文件不存在或为目录等
 */
async function readTextFile(path: string): Promise<string> {
  try {
    return await readTextAutoDetect(path);
  } catch (err) {
    const code = err instanceof Error ? (err as NodeJS.ErrnoException).code : undefined;
    if (code === 'ENOENT') throw new FileError(ErrorCode.ENOENT, `文件不存在: ${path}`);
    if (code === 'EISDIR') throw new FileError(ErrorCode.EISDIR, `是目录而非文件: ${path}`);
    throw new FileError(toErrorCode(err), toErrorMessage(err));
  }
}

/** 将捕获的错误转为失败结果。 */
function toFailResult(err: unknown): AnyToolResult {
  if (err instanceof FileError) {
    return fail(err.code, err.message) as unknown as AnyToolResult;
  }
  return fail(toErrorCode(err), toErrorMessage(err)) as unknown as AnyToolResult;
}

// ─── text_grep ──────────────────────────────────────────

export const textGrepInputSchema = z.object({
  path: z.string().min(1).describe('要搜索的文件路径'),
  pattern: z.string().min(1).describe('搜索模式：字符串字面量或 /正则/ 形式'),
  ignoreCase: z.boolean().optional().describe('忽略大小写'),
  context: z.number().int().nonnegative().optional().describe('上下文行数（匹配行前后各 N 行）'),
  maxResults: z.number().int().positive().optional().describe('最大匹配数，超出则截断'),
});

export type TextGrepInput = z.infer<typeof textGrepInputSchema>;

/** 转义正则特殊字符，用于将字面量安全转为正则。 */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 解析 grep pattern：若以 / 包裹则为正则，否则为字符串字面量。
 * 支持可选 flags，如 /foo/i。
 * ignoreCase 为 true 时，字面量也转为大小写不敏感正则。
 */
function parseGrepPattern(pattern: string, ignoreCase: boolean): RegExp | string {
  const m = /^\/(.*)\/([gimsuy]*)$/.exec(pattern);
  if (m) {
    const body = m[1] ?? '';
    let flags = m[2] ?? '';
    if (ignoreCase && !flags.includes('i')) flags += 'i';
    return new RegExp(body, flags);
  }
  if (ignoreCase) {
    return new RegExp(escapeRegex(pattern), 'i');
  }
  return pattern;
}

export async function textGrepHandler(args: Record<string, unknown>): Promise<AnyToolResult> {
  const path = args['path'] as string;
  const pattern = args['pattern'] as string;
  const ignoreCase = args['ignoreCase'] === true;
  const context = (args['context'] as number | undefined) ?? 0;
  const maxResults = args['maxResults'] as number | undefined;

  let content: string;
  try {
    content = await readTextFile(path);
  } catch (err) {
    return toFailResult(err);
  }

  const lines = splitLines(content);
  const matcher = parseGrepPattern(pattern, ignoreCase);
  const isRegex = matcher instanceof RegExp;

  // 找出所有匹配行（0-indexed）
  const matchingLineNumbers: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const matched = isRegex ? (matcher as RegExp).test(line) : line.includes(matcher as string);
    if (matched) matchingLineNumbers.push(i);
  }

  // maxResults 截断
  const totalMatches = matchingLineNumbers.length;
  let truncated = false;
  let limitedMatches = matchingLineNumbers;
  if (maxResults !== undefined && totalMatches > maxResults) {
    truncated = true;
    limitedMatches = matchingLineNumbers.slice(0, maxResults);
  }

  // 收集要显示的行号（匹配行 ± context），去重排序
  const lineNumbersToShow = new Set<number>();
  for (const ln of limitedMatches) {
    const start = Math.max(0, ln - context);
    const end = Math.min(lines.length - 1, ln + context);
    for (let i = start; i <= end; i++) lineNumbersToShow.add(i);
  }
  const sortedLineNumbers = [...lineNumbersToShow].sort((a, b) => a - b);

  // 构建 matches（行号 1-indexed）
  const matches = sortedLineNumbers.map((ln) => ({
    line: ln + 1,
    text: truncate(lines[ln]!),
  }));

  return ok({
    matches,
    count: limitedMatches.length,
    truncated,
  }) as unknown as AnyToolResult;
}

export const textGrepTool: Tool = {
  name: 'text_grep',
  description: '在文件中搜索匹配行。pattern 为字符串字面量或 /正则/ 形式。返回匹配行（含上下文）。',
  inputSchema: textGrepInputSchema,
  handler: textGrepHandler,
};

// ─── text_head ──────────────────────────────────────────

export const textHeadInputSchema = z.object({
  path: z.string().min(1).describe('文件路径'),
  lines: z.number().int().nonnegative().optional().describe('取头 N 行，默认 10'),
});

export type TextHeadInput = z.infer<typeof textHeadInputSchema>;

export async function textHeadHandler(args: Record<string, unknown>): Promise<AnyToolResult> {
  const path = args['path'] as string;
  const n = (args['lines'] as number | undefined) ?? 10;

  let content: string;
  try {
    content = await readTextFile(path);
  } catch (err) {
    return toFailResult(err);
  }

  const allLines = splitLines(content);
  const head = n > allLines.length ? allLines : allLines.slice(0, n);

  return ok({ lines: head, total: allLines.length }) as unknown as AnyToolResult;
}

export const textHeadTool: Tool = {
  name: 'text_head',
  description: '取文件头 N 行（默认 10）。返回行数组与文件总行数。',
  inputSchema: textHeadInputSchema,
  handler: textHeadHandler,
};

// ─── text_tail ──────────────────────────────────────────

export const textTailInputSchema = z.object({
  path: z.string().min(1).describe('文件路径'),
  lines: z.number().int().nonnegative().optional().describe('取尾 N 行，默认 10'),
});

export type TextTailInput = z.infer<typeof textTailInputSchema>;

export async function textTailHandler(args: Record<string, unknown>): Promise<AnyToolResult> {
  const path = args['path'] as string;
  const n = (args['lines'] as number | undefined) ?? 10;

  let content: string;
  try {
    content = await readTextFile(path);
  } catch (err) {
    return toFailResult(err);
  }

  const allLines = splitLines(content);
  const tail = n >= allLines.length ? allLines : allLines.slice(allLines.length - n);

  return ok({ lines: tail, total: allLines.length }) as unknown as AnyToolResult;
}

export const textTailTool: Tool = {
  name: 'text_tail',
  description: '取文件尾 N 行（默认 10）。返回行数组与文件总行数。',
  inputSchema: textTailInputSchema,
  handler: textTailHandler,
};

// ─── text_wc ────────────────────────────────────────────

export const textWcInputSchema = z.object({
  path: z.string().min(1).describe('文件路径'),
});

export type TextWcInput = z.infer<typeof textWcInputSchema>;

export async function textWcHandler(args: Record<string, unknown>): Promise<AnyToolResult> {
  const path = args['path'] as string;

  let content: string;
  try {
    content = await readTextFile(path);
  } catch (err) {
    return toFailResult(err);
  }

  const allLines = splitLines(content);
  const words = (content.match(/\S+/g) ?? []).length;
  const chars = content.length;
  const bytes = Buffer.byteLength(content, 'utf8');

  return ok({
    lines: allLines.length,
    words,
    chars,
    bytes,
  }) as unknown as AnyToolResult;
}

export const textWcTool: Tool = {
  name: 'text_wc',
  description: '统计文件的行数、词数、字符数、字节数。',
  inputSchema: textWcInputSchema,
  handler: textWcHandler,
};

// ─── text_diff ──────────────────────────────────────────

export const textDiffInputSchema = z.object({
  a: z.string().min(1).describe('文件 A 路径'),
  b: z.string().min(1).describe('文件 B 路径'),
  context: z.number().int().nonnegative().optional().describe('上下文行数，默认 3'),
});

export type TextDiffInput = z.infer<typeof textDiffInputSchema>;

/** diff 操作类型。 */
interface DiffOp {
  type: 'eq' | 'del' | 'add';
  line: string;
}

/** 逐行比较生成 diff 操作序列。 */
function lineDiff(aLines: string[], bLines: string[]): DiffOp[] {
  const ops: DiffOp[] = [];
  const maxLen = Math.max(aLines.length, bLines.length);
  for (let i = 0; i < maxLen; i++) {
    const a = i < aLines.length ? aLines[i] : undefined;
    const b = i < bLines.length ? bLines[i] : undefined;
    if (a !== undefined && b !== undefined && a === b) {
      ops.push({ type: 'eq', line: a });
    } else {
      if (a !== undefined) ops.push({ type: 'del', line: a });
      if (b !== undefined) ops.push({ type: 'add', line: b });
    }
  }
  return ops;
}

/** 生成 unified diff 文本。 */
function formatUnifiedDiff(
  aPath: string,
  bPath: string,
  aLines: string[],
  bLines: string[],
  context: number,
): string {
  const ops = lineDiff(aLines, bLines);

  // 完全相同
  if (ops.every((op) => op.type === 'eq')) {
    return '';
  }

  // 预计算每个 op 的 aLine / bLine（1-indexed）
  let aLine = 1;
  let bLine = 1;
  const annotated = ops.map((op) => {
    const info = { ...op, aLine, bLine };
    if (op.type === 'eq') {
      aLine++;
      bLine++;
    } else if (op.type === 'del') {
      aLine++;
    } else {
      bLine++;
    }
    return info;
  });

  // 找出变更索引
  const changeIndices: number[] = [];
  for (let i = 0; i < annotated.length; i++) {
    if (annotated[i]!.type !== 'eq') changeIndices.push(i);
  }

  // 按 context 分组为 hunk（合并相邻/重叠区间）
  const hunks: Array<{ start: number; end: number }> = [];
  for (const ci of changeIndices) {
    const start = Math.max(0, ci - context);
    const end = Math.min(annotated.length - 1, ci + context);
    const last = hunks[hunks.length - 1];
    if (last && start <= last.end + 1) {
      last.end = Math.max(last.end, end);
    } else {
      hunks.push({ start, end });
    }
  }

  // 格式化输出
  const out: string[] = [`--- ${aPath}`, `+++ ${bPath}`];
  for (const hunk of hunks) {
    let aStart = 0;
    let bStart = 0;
    let aLen = 0;
    let bLen = 0;
    const hunkLines: string[] = [];
    for (let i = hunk.start; i <= hunk.end; i++) {
      const op = annotated[i]!;
      if (hunkLines.length === 0) {
        aStart = op.aLine;
        bStart = op.bLine;
      }
      if (op.type === 'eq') {
        aLen++;
        bLen++;
        hunkLines.push(` ${op.line}`);
      } else if (op.type === 'del') {
        aLen++;
        hunkLines.push(`-${op.line}`);
      } else {
        bLen++;
        hunkLines.push(`+${op.line}`);
      }
    }
    out.push(`@@ -${aStart},${aLen} +${bStart},${bLen} @@`);
    out.push(...hunkLines);
  }

  return out.join('\n');
}

export async function textDiffHandler(args: Record<string, unknown>): Promise<AnyToolResult> {
  const aPath = args['a'] as string;
  const bPath = args['b'] as string;
  const context = (args['context'] as number | undefined) ?? 3;

  let aContent: string;
  let bContent: string;
  try {
    aContent = await readTextFile(aPath);
    bContent = await readTextFile(bPath);
  } catch (err) {
    return toFailResult(err);
  }

  const aLines = splitLines(aContent);
  const bLines = splitLines(bContent);
  const diff = formatUnifiedDiff(aPath, bPath, aLines, bLines, context);
  const same = diff === '';

  return ok({ diff: truncate(diff), same }) as unknown as AnyToolResult;
}

export const textDiffTool: Tool = {
  name: 'text_diff',
  description: '逐行比较两文件，生成 unified diff 文本。same 表示是否完全相同。',
  inputSchema: textDiffInputSchema,
  handler: textDiffHandler,
};

// ─── text_replace ───────────────────────────────────────

export const textReplaceInputSchema = z.object({
  path: z.string().min(1).describe('文件路径'),
  pattern: z.string().min(1).describe('正则字符串（如 \\d+）'),
  replacement: z.string().describe('替换文本，支持 $1 等回引用'),
  write: z.boolean().optional().describe('为 true 时原地写回文件，默认 false'),
  maxReplace: z.number().int().positive().optional().describe('最大替换次数'),
});

export type TextReplaceInput = z.infer<typeof textReplaceInputSchema>;

/**
 * 替换回引用：$1-$9（捕获组）、$&（整体匹配）、$$（字面 $）。
 */
function substituteBackrefs(replacement: string, match: RegExpExecArray): string {
  return replacement.replace(/\$(&|\$|\d)/g, (m, p1) => {
    if (p1 === '$') return '$';
    if (p1 === '&') return match[0];
    const idx = parseInt(p1, 10);
    return match[idx] !== undefined ? match[idx]! : '';
  });
}

/**
 * 执行受限替换。返回新内容与实际替换次数。
 */
function applyReplace(
  content: string,
  pattern: string,
  replacement: string,
  maxReplace?: number,
): { content: string; replaced: number } {
  const regex = new RegExp(pattern, 'g');
  let result = '';
  let lastIndex = 0;
  let replaced = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    result += content.slice(lastIndex, match.index);
    if (maxReplace === undefined || replaced < maxReplace) {
      result += substituteBackrefs(replacement, match);
      replaced++;
    } else {
      result += match[0];
    }
    lastIndex = match.index + match[0].length;
    // 零长度匹配防死循环
    if (match[0] === '') {
      const next = content[lastIndex];
      if (next !== undefined) result += next;
      lastIndex++;
      regex.lastIndex = lastIndex;
    }
  }
  result += content.slice(lastIndex);
  return { content: result, replaced };
}

export async function textReplaceHandler(args: Record<string, unknown>): Promise<AnyToolResult> {
  const path = args['path'] as string;
  const pattern = args['pattern'] as string;
  const replacement = args['replacement'] as string;
  const write = args['write'] === true;
  const maxReplace = args['maxReplace'] as number | undefined;

  let content: string;
  try {
    content = await readTextFile(path);
  } catch (err) {
    return toFailResult(err);
  }

  const { content: newContent, replaced } = applyReplace(content, pattern, replacement, maxReplace);

  let written = false;
  if (write && replaced > 0) {
    try {
      await writeFile(path, newContent, 'utf-8');
      written = true;
    } catch (err) {
      return toFailResult(err);
    }
  }

  return ok({
    replaced,
    content: truncate(newContent),
    written,
  }) as unknown as AnyToolResult;
}

export const textReplaceTool: Tool = {
  name: 'text_replace',
  description: '按正则替换文件内容。write 为 true 时原地写回，否则只返回结果。支持 $1 回引用。',
  inputSchema: textReplaceInputSchema,
  handler: textReplaceHandler,
};

// ─── 导出全部工具 ───────────────────────────────────────

/** text 工具集全部工具定义。 */
export const textTools: Tool[] = [
  textGrepTool,
  textHeadTool,
  textTailTool,
  textWcTool,
  textDiffTool,
  textReplaceTool,
];