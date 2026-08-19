/**
 * 读文本文件共享工具。
 *
 * 抽取自 text.ts / text_cat.ts 以消除重复的 `stat 判目录 → readFile → decodeBuffer`
 * 链路（GBK/UTF-8 自动识别）。统一保证文本读取链路对编码与目录的错误行为一致
 * （见 ADR-0003 / Duplicated Code 消除）。
 */

import { stat, readFile } from 'node:fs/promises';
import { decodeBuffer } from '../encoding/detect.js';

/**
 * 读取文本文件并自动解码（GBK/UTF-8 识别）。
 *
 * - 路径是目录 → 抛错 code=EISDIR
 * - 不存在 → 抛错 code=ENOENT
 * - 其余 errno 原样上抛（code 保留，供调用方 toErrorCode 翻译）
 *
 * @param path 文件路径
 * @param hint 解码编码提示；缺省为自动识别
 * @returns 解码后的文本字符串
 */
export async function readTextAutoDetect(path: string, hint?: string): Promise<string> {
  const stats = await stat(path);
  if (stats.isDirectory()) {
    throw Object.assign(new Error(`是目录而非文件: ${path}`), { code: 'EISDIR' });
  }
  const buf = await readFile(path);
  return decodeBuffer(buf, hint);
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