/**
 * text_cat（工单 05）：读取文件内容（支持编码自动识别与范围）。
 *
 * 与 fs_read 同族的读文件工具，但更贴近 Unix `cat`：
 * - 支持字节范围（startByte/endByte，0-based 含）与行范围（startLine/endLine，1-based 含）
 * - 编码：encoding 显式指定（utf8/gbk），默认为 auto 自动识别（GBK/UTF-8）
 * - 顺序：先按字节范围切片 buffer，再对解码后的文本按行范围切行
 * - 返回 `{ content, lines, truncated }`，content 用 truncate 截断
 *
 * 错误：EINVAL（参数非法）/ ENOENT（不存在）/ EISDIR（是目录）/ EACCES（无权限）
 */

import { stat, readFile } from "node:fs/promises";
import { z } from "zod";
import {
  ok,
  fail,
  truncate,
  DEFAULT_TRUNCATE_LIMIT,
  type AnyToolResult,
} from "../contract/output.js";
import { ErrorCode } from "../contract/errors.js";
import { failFromError } from "../utils/errors.js";
import { decodeBuffer } from "../encoding/detect.js";
import { splitLines } from "../utils/readText.js";
import type { Tool } from "../registry.js";

/** text_cat 输入 schema。 */
export const textCatInputSchema = z.object({
  path: z.string().describe("文件路径"),
  encoding: z
    .enum(["utf8", "gbk", "auto"])
    .optional()
    .describe("解码编码，默认 auto（自动识别 GBK/UTF-8）"),
  startLine: z.number().int().optional().describe("起始行（1-based，含）"),
  endLine: z.number().int().optional().describe("结束行（1-based，含）"),
  startByte: z.number().int().optional().describe("起始字节（0-based，含）"),
  endByte: z.number().int().optional().describe("结束字节（0-based，含）"),
});

export type TextCatInput = z.infer<typeof textCatInputSchema>;

/**
 * text_cat handler：读文件。
 *
 * 顺序处理：
 * 1. 先按字节范围（startByte/endByte）在原始 buffer 上切片
 * 2. 再解码（encoding 显式指定则用之，auto/缺省时 auto 检测）
 * 3. 最后按行范围（startLine/endLine）切行
 *
 * 返回 `{ content, lines, truncated }`，content 用 truncate 截断。
 *
 * 错误：EINVAL（参数非法，含非字符串 path 与非法范围）/ ENOENT（不存在）/ EISDIR（是目录）
 */
export async function textCatHandler(
  args: Record<string, unknown>,
): Promise<AnyToolResult> {
  const path = args["path"];
  const encoding = args["encoding"];
  const startLine = args["startLine"];
  const endLine = args["endLine"];
  const startByte = args["startByte"];
  const endByte = args["endByte"];

  if (typeof path !== "string") {
    return fail(ErrorCode.EINVAL, "path 必须是字符串");
  }

  // 范围参数必须是非负整数（schema 以 int 约束，直接调用时兜底校验）
  for (const key of ["startLine", "endLine", "startByte", "endByte"] as const) {
    const v = args[key];
    if (
      v !== undefined &&
      (typeof v !== "number" || !Number.isInteger(v) || v < 0)
    ) {
      return fail(ErrorCode.EINVAL, `${key} 必须是非负整数`);
    }
  }

  // 经校验后，存在即为非负整数（收窄类型供后续使用）
  const sLine = typeof startLine === "number" ? startLine : undefined;
  const eLine = typeof endLine === "number" ? endLine : undefined;
  const sByte = typeof startByte === "number" ? startByte : undefined;
  const eByte = typeof endByte === "number" ? endByte : undefined;

  try {
    // 先检查路径是否为文件（非目录）
    const stats = await stat(path);
    if (stats.isDirectory()) {
      return fail(ErrorCode.EISDIR, `是目录: ${path}`);
    }

    const buf = await readFile(path);

    // ① 字节范围（0-based 含）：先切片原始 buffer
    let rangedBuf = buf;
    if (sByte !== undefined || eByte !== undefined) {
      const begin = sByte !== undefined ? sByte : 0;
      const end = eByte !== undefined ? eByte + 1 : buf.length;
      const lo = Math.max(0, begin);
      const hi = Math.min(buf.length, end);
      rangedBuf = buf.subarray(lo, hi);
    }

    // ② 解码：encoding 指定则显式用之；'auto'/缺省时自动识别
    const hint =
      encoding === "utf8" || encoding === "gbk"
        ? (encoding as string)
        : undefined;
    let content = decodeBuffer(rangedBuf, hint);

    // ③ 行范围（1-based 含）：在逻辑行上切片并重新 join，避免结尾残留空段
    if (sLine !== undefined || eLine !== undefined) {
      const ls = splitLines(content);
      const startIdx = sLine !== undefined ? Math.max(1, sLine) - 1 : 0;
      const endIdx = eLine !== undefined ? eLine : ls.length;
      content = ls.slice(startIdx, endIdx).join("\n");
    }

    // 行数以返回内容中的逻辑行为准（结尾换行不计，空内容为 0）
    const totalLines = content === "" ? 0 : splitLines(content).length;
    const truncated = content.length > DEFAULT_TRUNCATE_LIMIT;

    return ok({
      content: truncate(content),
      lines: totalLines,
      truncated,
    }) as unknown as AnyToolResult;
  } catch (err) {
    return failFromError(err);
  }
}

/**
 * text_cat 输出 schema（描述 success data 结构，不含 ok 包装）。
 *
 * 成功返回 `{ content, lines, truncated }`：
 * - content：文件内容（可能截断）
 * - lines：内容行数
 * - truncated：是否触发了截断
 */
export const textCatOutputSchema = z.object({
  content: z.string().describe("文件内容（可能截断）"),
  lines: z.number().int().nonnegative().describe("内容行数"),
  truncated: z.boolean().describe("是否触发截断"),
});

/** text_cat 工具定义。 */
export const textCatTool: Tool = {
  name: "cat",
  description:
    "读文件（Unix cat）。支持编码 auto 识别（GBK/UTF-8）、字节范围（startByte/endByte，0-based 含）、行范围（startLine/endLine，1-based 含）、长内容截断。",
  inputSchema: textCatInputSchema,
  outputSchema: textCatOutputSchema,
  annotations: { readOnlyHint: true },
  handler: textCatHandler,
  aliases: ["text_cat"],
};
