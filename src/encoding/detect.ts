/**
 * 编码检测与解码。
 *
 * Windows 环境下文件/进程输出可能是 GBK 或 UTF-8，需要自动识别。
 * 用 iconv-lite 做 GBK 解码，用 TextDecoder fatal 模式做 UTF-8 合法性检查。
 */

import { decode as iconvDecode } from 'iconv-lite';

/**
 * 检测 buffer 是否可能是 GBK 编码。
 *
 * 启发式：含高位字节（>= 0x80）且不是合法 UTF-8 时，推测为 GBK。
 * 纯 ASCII（无高位字节）既是 UTF-8 也兼容 GBK，按 UTF-8 处理，返回 false。
 *
 * @param buf 输入缓冲区
 * @returns true 表示推测为 GBK
 */
export function isLikelyGBK(buf: Buffer): boolean {
  if (buf.length === 0) return false;

  // 检查是否含高位字节
  let hasHighByte = false;
  for (let i = 0; i < buf.length; i++) {
    const byte = buf[i] ?? 0;
    if (byte >= 0x80) {
      hasHighByte = true;
      break;
    }
  }
  if (!hasHighByte) return false;

  // 含高位字节时，检查是否为合法 UTF-8
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buf);
    return false; // 合法 UTF-8
  } catch {
    return true; // 非合法 UTF-8，推测为 GBK
  }
}

/**
 * 解码缓冲区为字符串。自动识别 GBK/UTF-8。
 *
 * 优先级：显式 hint > UTF-8 BOM > 启发式检测
 *
 * @param buf 输入缓冲区
 * @param hint 显式编码提示（如 'utf-8'、'gbk'、'gb2312'）
 * @returns 解码后的字符串
 *
 * @example
 * decodeBuffer(Buffer.from('hello'))           // 'hello'
 * decodeBuffer(iconv.encode('你好', 'gbk'))    // '你好'
 */
export function decodeBuffer(buf: Buffer, hint?: string): string {
  // 1. 显式 hint 优先
  if (hint) {
    const lower = hint.toLowerCase();
    if (lower === 'utf-8' || lower === 'utf8') {
      return stripBom(buf.toString('utf8'));
    }
    return iconvDecode(buf, hint);
  }

  // 2. UTF-8 BOM 检测
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.subarray(3).toString('utf8');
  }

  // 3. 启发式：GBK vs UTF-8
  if (isLikelyGBK(buf)) {
    return iconvDecode(buf, 'gbk');
  }

  return buf.toString('utf8');
}

/** 去除 UTF-8 BOM 字符（U+FEFF）若存在于字符串开头。 */
function stripBom(s: string): string {
  if (s.charCodeAt(0) === 0xfeff) return s.slice(1);
  return s;
}