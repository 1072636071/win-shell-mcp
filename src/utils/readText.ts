/**
 * 读文件深模块。
 *
 * 统一拥有读文件链路：`stat 判目录 → readFile → 字节范围切片 → 解码 → 行范围切片`。
 * fs_read、cat、text_grep 均消费此模块，不再各自复制链路（此前 fs_read 与 cat
 * 各有一份且已分叉——行范围对结尾换行文件的语义不同）。统一保证对编码、目录、
 * 字节/行范围的行为一致（见 ADR-0003 / Duplicated Code 消除）。
 */

import { stat, readFile } from 'node:fs/promises';
import { decodeBuffer } from '../encoding/detect.js';

/** 读文本文件选项。 */
export interface ReadTextFileOptions {
  /** 解码编码提示；缺省自动识别（GBK/UTF-8）。 */
  encoding?: string;
  /** 字节范围（0-based 含）：在解码前切片原始 buffer。 */
  byteRange?: { start?: number; end?: number };
  /** 行范围（1-based 含）：在解码后按逻辑行切片（splitLines 语义，掐结尾换行）。 */
  lineRange?: { start?: number; end?: number };
}

/**
 * 读取文本文件并自动解码（GBK/UTF-8 识别）。
 *
 * - 路径是目录 → 抛错 code=EISDIR
 * - 不存在 → 抛错 code=ENOENT
 * - 其余 errno 原样上抛（code 保留，供调用方 toErrorCode 翻译）
 *
 * 处理顺序：先按 byteRange 在原始 buffer 上切片，再解码，最后按 lineRange
 * 在逻辑行上切片（splitLines 语义，与 cat 的 startLine/endLine 一致）。
 *
 * @param path 文件路径
 * @param opts 选项（编码提示 / 字节范围 / 行范围）
 * @returns 解码后的文本字符串
 */
export async function readTextFile(
  path: string,
  opts: ReadTextFileOptions = {},
): Promise<string> {
  const stats = await stat(path);
  if (stats.isDirectory()) {
    throw Object.assign(new Error(`是目录而非文件: ${path}`), { code: 'EISDIR' });
  }
  let buf = await readFile(path);

  if (opts.byteRange !== undefined) {
    const begin = opts.byteRange.start ?? 0;
    const end = opts.byteRange.end !== undefined ? opts.byteRange.end + 1 : buf.length;
    const lo = Math.max(0, begin);
    const hi = Math.min(buf.length, end);
    buf = buf.subarray(lo, hi);
  }

  let content = decodeBuffer(buf, opts.encoding);

  if (opts.lineRange !== undefined) {
    const ls = splitLines(content);
    const startIdx =
      opts.lineRange.start !== undefined ? Math.max(1, opts.lineRange.start) - 1 : 0;
    const endIdx = opts.lineRange.end !== undefined ? opts.lineRange.end : ls.length;
    content = ls.slice(startIdx, endIdx).join('\n');
  }

  return content;
}

/**
 * 读取文本文件并自动解码（GBK/UTF-8 识别）。
 *
 * 委托给 readTextFile（全量读取，不做范围切片）。
 *
 * @param path 文件路径
 * @param hint 解码编码提示；缺省为自动识别
 * @returns 解码后的文本字符串
 */
export async function readTextAutoDetect(path: string, hint?: string): Promise<string> {
  return readTextFile(path, { encoding: hint });
}

/**
 * 将内容按逻辑行分割。
 *
 * 空文件返回 []；末尾换行不产生额外空行。供 text.ts / text_cat.ts 共用，
 * 保证行级处理工具对结尾换行的行为一致。
 *
 * @param content 文本内容
 * @returns 逻辑行数组
 */
export function splitLines(content: string): string[] {
  if (content === '') return [];
  const lines = content.split('\n');
  const last = lines[lines.length - 1];
  if (last === '') lines.pop();
  return lines;
}