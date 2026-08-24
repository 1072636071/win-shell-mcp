/**
 * text 工具集：grep / head / tail / wc / diff / replace。
 *
 * 行级文本处理工具，所有行号 1-indexed。
 * 长内容通过 truncate 截断，错误返回统一 fail 契约。
 */

import { writeFile, readFile, stat } from 'node:fs/promises';
import { z } from 'zod';
import iconvLite from 'iconv-lite';

const iconvEncode = iconvLite.encode;
import { ok, fail, truncate, type AnyToolResult } from '../contract/output.js';
import { ErrorCode, toErrorCode, toErrorMessage } from '../contract/errors.js';
import { readTextAutoDetect, splitLines } from '../utils/readText.js';
import { isLikelyGBK, decodeBuffer } from '../encoding/detect.js';
import { parsePattern, REPLACE_PATTERN_FLAGS, SEARCH_PATTERN_FLAGS, type PatternParseResult } from '../utils/pattern.js';
import {
  buildSearchHint,
  hasRegexMetacharacters,
  looksLikeBackslashPath,
  looksLikeRegex,
  isAbnormalHitCount,
  suggestWrapped,
  DEFAULT_HINT_THRESHOLDS,
} from '../utils/hints.js';
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
  pattern: z
    .string()
    .min(1)
    .describe(
      '搜索模式：默认字面量子串匹配（元字符原样，如 C:\\Users 免转义）；/正则/ 形式启用正则，尾部可选 flags i/m/s',
    ),
  ignoreCase: z.boolean().optional().describe('忽略大小写'),
  context: z.number().int().nonnegative().optional().describe('上下文行数（匹配行前后各 N 行）'),
  maxResults: z.number().int().positive().optional().describe('最大匹配数，超出则截断'),
});

export type TextGrepInput = z.infer<typeof textGrepInputSchema>;

/**
 * 解析 grep pattern（pattern 双模约定，ADR-0013）：
 * 默认整串按字面量子串匹配（`.` `\` `*` 等一律原样，Windows 路径无需转义）；
 * `/…/` 包裹启用正则（严格判定：首尾未转义斜杠、体内斜杠必须 \/、体非空、
 * 尾部仅合法 flags i/m/s；结构似正则但 flags 非法 → EINVAL 列明合法标志；
 * 任何结构歧义整串归字面量）。ignoreCase 对两种模式均生效。
 */
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

  const parsed = parsePattern(pattern, ignoreCase, SEARCH_PATTERN_FLAGS);
  if (!parsed.ok) {
    return fail(ErrorCode.EINVAL, parsed.error);
  }
  const isRegex = parsed.mode === 'regex';
  const regex = isRegex ? parsed.regex : null;
  // 字面量匹配针：ignoreCase 时两侧统一小写比较（与 search_content 一致），元字符不参与任何转义
  const needle = isRegex ? '' : ignoreCase ? parsed.value.toLowerCase() : parsed.value;

  const lines = splitLines(content);

  // 找出所有匹配行（0-indexed）
  const matchingLineNumbers: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const matched = regex
      ? regex.test(line)
      : ignoreCase
        ? line.toLowerCase().includes(needle)
        : line.includes(needle);
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

  const payload: Record<string, unknown> = {
    matches,
    count: limitedMatches.length,
    truncated,
    // 模式标识：告知调用方 pattern 被按哪种模式解释（literal=字面量 / regex=正则）
    patternMode: parsed.mode,
  };
  // 双向 hint（工单02）：可疑误用时给针对性提示；无规则触发不占位。
  // matchCount 必须传截断前真实总数（t6/H1）：否则 maxResults 截断场景下
  // 「命中异常偏多」判据永远够不到阈值，残余洞兜底失效。
  const hint = buildSearchHint({
    patternMode: parsed.mode,
    pattern,
    matchCount: totalMatches,
    totalLines: lines.length,
  });
  if (hint !== undefined) payload['hint'] = hint;

  return ok(payload) as unknown as AnyToolResult;
}

export const textGrepTool: Tool = {
  name: 'text_grep',
  description:
    '在文件中搜索匹配行。pattern 默认按字面量子串匹配——元字符一律原样，含反斜杠的路径免转义直接可搜，如 C:\\Users\\alice 反斜杠原样参与匹配；写 "a|b" 只匹配 a|b 这三个字符本身，不按「或」展开。需要正则时用首尾斜杠包裹并附尾部可选 flags i/m/s，如 "/a|b/" 匹配 a 或 b、"/\\d{3}/" 匹配三位数字，体内斜杠须写作 \\/。判定永远向字面量收敛：不符合 /…/ 规范的写法整体按字面量处理（如 /usr/bin、/api/v1/）。已知残余洞：形如 /tmp/ 的恰好首尾斜杠短字面量会被判为正则 tmp——命中异常偏多时结果会附 hint 提示核对。返回匹配行（含上下文）、count 与 patternMode（literal/regex）。',
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

/** LCS DP 表大小上限（n*m 超此则回退朴素逐行对比，避免内存爆炸）。 */
const LCS_MAX_CELLS = 5_000_000;

/** 朴素逐行对比（LCS 回退用，超大输入时避免 O(n*m) 内存）。 */
function naiveLineDiff(aLines: string[], bLines: string[]): DiffOp[] {
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

/**
 * 基于 LCS（最长公共子序列）的真行级 diff。
 *
 * 用动态规划计算两序列的 LCS，回溯生成 eq/del/add 操作序列，
 * 保证「插入一行仅产生 1 个 add 操作」，而非朴素逐行对比的「其后所有行 del+add」失真。
 *
 * 超大输入（n*m > LCS_MAX_CELLS）回退朴素对比，避免 O(n*m) 内存爆炸。
 *
 * @param aLines 文件 A 的行数组
 * @param bLines 文件 B 的行数组
 * @returns diff 操作序列
 */
function lineDiff(aLines: string[], bLines: string[]): DiffOp[] {
  const n = aLines.length;
  const m = bLines.length;
  if (n * m > LCS_MAX_CELLS) {
    return naiveLineDiff(aLines, bLines);
  }
  // LCS DP：dp[i][j] = LCS(aLines[0..i), bLines[0..j))
  const dp: Int32Array[] = new Array(n + 1);
  dp[0] = new Int32Array(m + 1);
  for (let i = 1; i <= n; i++) {
    const a = aLines[i - 1]!;
    const prev = dp[i - 1]!;
    const cur = new Int32Array(m + 1);
    for (let j = 1; j <= m; j++) {
      if (a === bLines[j - 1]) {
        cur[j] = prev[j - 1]! + 1;
      } else {
        const up = prev[j]!;
        const left = cur[j - 1]!;
        cur[j] = up >= left ? up : left;
      }
    }
    dp[i] = cur;
  }
  // 回溯生成操作序列
  const ops: DiffOp[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && aLines[i - 1] === bLines[j - 1]) {
      ops.push({ type: 'eq', line: aLines[i - 1]! });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i]![j - 1]! >= dp[i - 1]![j]!)) {
      ops.push({ type: 'add', line: bLines[j - 1]! });
      j--;
    } else {
      ops.push({ type: 'del', line: aLines[i - 1]! });
      i--;
    }
  }
  ops.reverse();
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
  description:
    '基于 LCS 的真行级 diff，生成 unified diff 文本。插入一行仅影响对应 hunk，不会其后行全被误报。same 表示是否完全相同。',
  inputSchema: textDiffInputSchema,
  handler: textDiffHandler,
};

// ─── text_replace ───────────────────────────────────────

export const textReplaceInputSchema = z.object({
  path: z.string().min(1).describe('文件路径'),
  pattern: z
    .string()
    .min(1)
    .describe(
      '查找模式：默认字面量子串匹配（元字符原样，如 C:\\Users\\alice 反斜杠免转义）；/正则/ 形式启用正则，尾部可选 flags i/m/s/g',
    ),
  replacement: z
    .string()
    .describe(
      '替换文本：字面量模式下按原样插入（$1/$&/$$ 记号不展开）；正则模式下支持 $1、$&、$$ 回引用',
    ),
  write: z.boolean().optional().describe('为 true 时原地写回文件，默认 false'),
  all: z
    .boolean()
    .optional()
    .describe(
      '显式全量替换开关：true 时替换全部命中；与 maxReplace 同时提供时本参数优先。正则模式尾部 g 标志等价本开关',
    ),
  maxReplace: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('最大替换次数（多命中时的限量表态）。all 为 true 或正则尾部带 g 时忽略'),
});

export type TextReplaceInput = z.infer<typeof textReplaceInputSchema>;

/** 替换回引用：$1-$9（捕获组）、$&（整体匹配）、$$（字面 $）。仅正则模式使用。 */
function substituteBackrefs(replacement: string, match: RegExpExecArray): string {
  return replacement.replace(/\$(&|\$|\d)/g, (m, p1) => {
    if (p1 === '$') return '$';
    if (p1 === '&') return match[0];
    const idx = parseInt(p1, 10);
    return match[idx] !== undefined ? match[idx]! : '';
  });
}

/** 一次命中的位置与内容跨度。 */
interface MatchSpan {
  /** 命中起始偏移（原文）。 */
  index: number;
  /** 命中长度（零长度匹配为 0）。 */
  length: number;
  /** 正则模式的原始匹配对象（供回引用展开）；字面量模式为 null。 */
  match: RegExpExecArray | null;
}

type ParsedPattern = Extract<PatternParseResult, { ok: true }>;

/**
 * 全量扫描命中位置（三分支判定的依据，与 write 取值无关）。
 *
 * 字面量：indexOf 循环；正则：以带 g 标志的副本 exec 循环，
 * 零长度匹配手动前进一步防死循环。
 */
function findAllMatches(content: string, parsed: ParsedPattern): MatchSpan[] {
  if (parsed.mode === 'literal') {
    const spans: MatchSpan[] = [];
    let from = 0;
    for (;;) {
      const idx = content.indexOf(parsed.value, from);
      if (idx === -1) break;
      spans.push({ index: idx, length: parsed.value.length, match: null });
      from = idx + Math.max(parsed.value.length, 1);
    }
    return spans;
  }
  const flags = parsed.regex.flags.includes('g') ? parsed.regex.flags : `${parsed.regex.flags}g`;
  const scanner = new RegExp(parsed.regex.source, flags);
  const spans: MatchSpan[] = [];
  let m: RegExpExecArray | null;
  while ((m = scanner.exec(content)) !== null) {
    spans.push({ index: m.index, length: m[0].length, match: m });
    // 零长度匹配防死循环
    if (m[0].length === 0) scanner.lastIndex += 1;
  }
  return spans;
}

/**
 * 按预扫描的命中跨度执行替换。
 *
 * - 字面量模式：replacement 纯字面插入（回引用记号原样保留、不触发组替换）；
 * - 正则模式：substituteBackrefs 展开 $1/$&/$$。
 * - limit 为最大替换次数（Number.POSITIVE_INFINITY 表示全量），超出限量的命中原样保留。
 */
function applyReplacement(
  content: string,
  matches: readonly MatchSpan[],
  replacement: string,
  limit: number,
): { content: string; replaced: number; first: { index: number; text: string } | null } {
  let result = '';
  let lastIndex = 0;
  let replaced = 0;
  let first: { index: number; text: string } | null = null;
  for (const span of matches) {
    if (replaced >= limit) break;
    result += content.slice(lastIndex, span.index);
    const inserted =
      span.match !== null ? substituteBackrefs(replacement, span.match) : replacement;
    result += inserted;
    if (first === null) first = { index: span.index, text: inserted };
    replaced++;
    lastIndex = span.index + span.length;
  }
  result += content.slice(lastIndex);
  return { content: result, replaced, first };
}

/** 把原文偏移换算为 1-based 行号与列号。 */
function lineColOf(content: string, index: number): { line: number; col: number } {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < index; i++) {
    if (content[i] === '\n') {
      line += 1;
      lineStart = i + 1;
    }
  }
  return { line, col: index - lineStart + 1 };
}

/** 截取替换点所在行片段（跨行匹配覆盖首尾行，单行超长截断），供单命中结果核验回显。 */
function snippetAround(content: string, index: number, length: number): string {
  const lineStart = index > 0 ? content.lastIndexOf('\n', index - 1) + 1 : 0;
  const endIdx = Math.min(index + length, content.length);
  const nlAfter = content.indexOf('\n', endIdx);
  const lineEnd = nlAfter === -1 ? content.length : nlAfter;
  return truncate(content.slice(lineStart, lineEnd), 200);
}

/** 多命中清单最多列出的位置数（超出附截断说明），控制错误消息体积。 */
const MAX_LISTED_POSITIONS = 20;

/**
 * 构建命中位置清单（行:列）。
 * 复用 lineColOf 逐展示位换算（t6/S2 去重：与单命中回显共用同一套行号推进逻辑）；
 * 展示上限 MAX_LISTED_POSITIONS=20 有界，逐位换算的性能成本可接受。
 */
function buildPositionList(content: string, matches: readonly MatchSpan[]): string {
  const shown = Math.min(matches.length, MAX_LISTED_POSITIONS);
  const parts: string[] = [];
  for (let k = 0; k < shown; k++) {
    const { line, col } = lineColOf(content, matches[k]!.index);
    parts.push(`${line}:${col}`);
  }
  const suffix =
    matches.length > MAX_LISTED_POSITIONS ? `（仅列前 ${MAX_LISTED_POSITIONS} 处）` : '';
  return parts.length > 0 ? `命中位置${suffix}：${parts.join(', ')}` : '';
}

/**
 * replace 场景 0 命中 hint：复用工单02 引擎导出的判据谓词，
 * 四行双向提示表方向不变、文案动词适配替换语境。
 *
 * 取舍说明（t6/S2）：①②④ 的文案措辞与搜索侧存在语境差异（「搜索」vs「替换」动词、
 * 指向动作不同），属有意保留的适配而非重复——判定逻辑（元字符清单、路径样谓词）
 * 已通过 hints.ts 共享谓词复用，仅文案分工具表述。
 */
function buildZeroMatchHint(pattern: string, mode: 'literal' | 'regex'): string {
  if (mode === 'literal') {
    // ① 更具体：含正则元字符时给出 /…/ 包裹写法（包裹建议复用 hints.ts 共享实现，t6/S2）
    if (hasRegexMetacharacters(pattern)) {
      const wrapped = suggestWrapped(pattern, REPLACE_PATTERN_FLAGS.join(''));
      return (
        `pattern 含正则元字符，本次已按【字面量】原样查找。若想使用正则，请写作 ${wrapped} 形式` +
        `（尾部可选 flags ${REPLACE_PATTERN_FLAGS.join('')}）。`
      );
    }
    // ② 通用兜底：拼写/大小写方向
    return '本次已按【字面量】原样查找。请检查拼写与大小写，或确认目标文本确实存在于该文件。';
  }
  // ④ 正则侧：反斜杠路径样 pattern 的转义吞没提示
  if (looksLikeBackslashPath(pattern)) {
    return (
      'pattern 呈反斜杠路径样式且被按【正则】解释——路径中的 \\U 等片段会被当作转义序列而丢失反斜杠。' +
      '若想替换路径文本，请去掉首尾斜杠按【字面量】重试（默认即字面量，反斜杠无需转义）。'
    );
  }
  return '请核对该正则是否确能与目标文本匹配（可先用 text_grep 验证命中情况）。';
}

/**
 * 双向表③判定（replace 侧）：正则模式 + 形似正则 + 命中数异常偏多（与搜索侧共享判据）。
 *
 * totalLines 由调用方一次计算传入（t9/③：避免本谓词内部重复 splitLines 全文）。
 *
 * looksLikeRegex 在此分支为恒真条件——按现行解析器构造，regex 模式的 pattern
 * 必然呈 /体/flags 包裹形状、必然满足该形似判定；保留它作纵深防御：
 * 若未来解析器放宽包裹形状约束，此处仍能拦住「非形似 pattern 被判正则」的场景。
 */
function isReplaceHint3(
  pattern: string,
  mode: 'literal' | 'regex',
  totalLines: number,
  count: number,
): boolean {
  return (
    mode === 'regex' &&
    looksLikeRegex(pattern) &&
    isAbnormalHitCount(count, totalLines, DEFAULT_HINT_THRESHOLDS)
  );
}

/** 双向表③文案（替换语境动词）：命中异常偏多且形似正则时的「疑似被当正则」提示主体。 */
function buildAbnormalRegexHint(count: number): string {
  return (
    `命中 ${count} 处：命中数异常偏多且 pattern 形似正则，疑似被当作【正则】解释。` +
    '若本意是替换字面文本（如以斜杠包裹的路径），请去掉首尾斜杠按【字面量】重试。'
  );
}

/** 多命中未表态的拒绝消息：表态要求 + 命中总数 + 位置清单 + 残余洞兜底提示。 */
function buildMultiHitMessage(
  pattern: string,
  mode: 'literal' | 'regex',
  content: string,
  matches: readonly MatchSpan[],
  totalLines: number,
): string {
  let msg =
    `发现 ${matches.length} 处命中，未显式表态替换范围，已拒绝执行。` +
    '请提供 all:true（全量替换）或 maxReplace:N（限量替换）。';
  msg += buildPositionList(content, matches);
  // ③ 异常偏多 + 形似正则 → 疑似误入正则模式（兜住 /tmp/ 类残余洞）。
  // 判据与搜索侧共用 isAbnormalHitCount（绝对阈值 + 比例阈值，t6/C3 对齐）；
  // totalLines 由 handler 一次计算传入，本函数不再全量重扫。
  if (isReplaceHint3(pattern, mode, totalLines, matches.length)) {
    msg += ` 另：${buildAbnormalRegexHint(matches.length)}`;
  }
  return msg;
}

/** 源文件编码检测结果。 */
interface SourceEncoding {
  content: string;
  encoding: 'gbk' | 'utf-8';
  bom: boolean;
}

/**
 * 读取文本文件并保留源编码信息（供 text_replace 写回时沿用原编码）。
 *
 * - 路径是目录 → 抛错 code=EISDIR
 * - 不存在 → 抛错 code=ENOENT
 * - 其余 errno 原样上抛
 *
 * @param path 文件路径
 * @returns 解码后内容与源编码标识（gbk / utf-8，含 BOM 标记）
 */
async function readTextWithEncoding(path: string): Promise<SourceEncoding> {
  const stats = await stat(path);
  if (stats.isDirectory()) {
    throw Object.assign(new Error(`是目录而非文件: ${path}`), { code: 'EISDIR' });
  }
  const buf = await readFile(path);
  const bom = buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  const isGbk = isLikelyGBK(buf);
  const content = decodeBuffer(buf);
  return { content, encoding: isGbk ? 'gbk' : 'utf-8', bom };
}

/**
 * 按指定编码把字符串编码为 Buffer，保留 UTF-8 BOM（若源有）。
 *
 * @param content 文本内容
 * @param encoding 源编码（gbk / utf-8）
 * @param bom 是否保留 UTF-8 BOM
 * @returns 编码后的 Buffer
 */
function encodeWithEncoding(content: string, encoding: 'gbk' | 'utf-8', bom: boolean): Buffer {
  const body = encoding === 'gbk' ? iconvEncode(content, 'gbk') : Buffer.from(content, 'utf8');
  if (bom && encoding === 'utf-8') {
    return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), body]);
  }
  return body;
}

export async function textReplaceHandler(args: Record<string, unknown>): Promise<AnyToolResult> {
  const path = args['path'] as string;
  const pattern = args['pattern'] as string;
  const replacement = args['replacement'] as string;
  const write = args['write'] === true;
  const all = args['all'] === true;
  const maxReplace = args['maxReplace'] as number | undefined;

  let source: SourceEncoding;
  try {
    source = await readTextWithEncoding(path);
  } catch (err) {
    return toFailResult(err);
  }

  // 双模解析（严格判定共享解析器；replace 白名单含 g）
  const parsed = parsePattern(pattern, false, REPLACE_PATTERN_FLAGS);
  if (!parsed.ok) {
    return fail(ErrorCode.EINVAL, parsed.error);
  }

  // 全量预扫描命中 —— 三分支判定依据，与 write 取值无关
  const matches = findAllMatches(source.content, parsed);
  const total = matches.length;
  // 全文行数一次计算（t9/③）：拒绝路径与放行成功路径的 ③ 判据共用，避免各自全量重扫；
  // 与搜索侧 SearchHintContext.totalLines 的传参风格对齐
  const totalLines = splitLines(source.content).length;

  // 分支一：0 命中 → EINVAL 报错并附 hint（不再静默成功）
  if (total === 0) {
    return fail(
      ErrorCode.EINVAL,
      `0 命中：未执行任何替换。${buildZeroMatchHint(pattern, parsed.mode)}`,
    );
  }

  // 表态优先级：all:true > 正则尾部 g > maxReplace
  const gStatement = parsed.mode === 'regex' && parsed.regex.flags.includes('g');
  // 分支三：多于 1 命中且未显式表态 → 拒绝执行并列出命中清单
  if (total > 1 && !all && !gStatement && maxReplace === undefined) {
    return fail(
      ErrorCode.EINVAL,
      buildMultiHitMessage(pattern, parsed.mode, source.content, matches, totalLines),
    );
  }

  // 分支二/执行：恰 1 命中自动替换；有表态时按语义限量替换
  const limit =
    all || gStatement || maxReplace === undefined ? Number.POSITIVE_INFINITY : maxReplace;
  const res = applyReplacement(source.content, matches, replacement, limit);

  let written = false;
  if (write && res.replaced > 0) {
    try {
      const buf = encodeWithEncoding(res.content, source.encoding, source.bom);
      await writeFile(path, buf);
      written = true;
    } catch (err) {
      return toFailResult(err);
    }
  }

  const payload: Record<string, unknown> = {
    replaced: res.replaced,
    totalMatches: total,
    content: truncate(res.content),
    written,
    patternMode: parsed.mode,
  };
  // 恰 1 命中：附命中位置（原文 行:列）与替换后上下文片段供核验
  if (total === 1 && res.first !== null) {
    payload['position'] = lineColOf(source.content, matches[0]!.index);
    payload['context'] = snippetAround(res.content, res.first.index, res.first.text.length);
  }
  // 双向表③兜底（t8）：显式表态放行的成功路径与拒绝路径同样提示「疑似被当正则」，
  // 防止哑错误在成功侧复活；判据不满足时不占位。恰 1 命中不可能满足异常判据，
  // 故实际仅在多命中放行场景出现。
  const hint3 = isReplaceHint3(pattern, parsed.mode, totalLines, total)
    ? buildAbnormalRegexHint(total)
    : undefined;
  if (hint3 !== undefined) payload['hint'] = hint3;

  return ok(payload) as unknown as AnyToolResult;
}

export const textReplaceTool: Tool = {
  name: 'text_replace',
  description:
    '在文件中查找并替换文本。pattern 默认按字面量子串匹配——元字符一律原样，含反斜杠的路径免转义直接可换，如把 C:\\Users\\alice 替换为 C:\\Users\\bob 时反斜杠原样参与匹配；写 "a|b" 只查找 a|b 字面量本身。此时 replacement 为纯字面插入，$1/$&/$$ 等回引用记号原样保留、不展开；正则 pattern（"/(\\w+)\\.ts/" 式）的 replacement 支持 JS 风格回引用 $1/$&/$$，尾部可选 flags i/m/s/g 中 g 表示全量替换。替换数量永不静默决定：0 命中报错；恰 1 命中自动替换并回显上下文供核验；多于 1 命中须提供 all:true 或 maxReplace:N 显式表态（正则尾部 g 等价全量表态），否则拒绝并列出命中位置清单。write 为 true 时原地写回（沿用源文件编码，GBK 不被静默改写为 UTF-8），否则只返回结果。残余洞同搜索工具：形如 /tmp/ 的首尾斜杠短字面量会被判为正则，命中异常偏多时的提示兜底提醒核对。返回 patternMode（literal/regex）。',
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