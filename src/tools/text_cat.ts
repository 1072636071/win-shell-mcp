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

import { z } from "zod";
import {
  ok,
  fail,
  truncate,
  getTruncateLimit,
  type AnyToolResult,
} from "../contract/output.js";
import { ErrorCode } from "../contract/errors.js";
import { failFromError } from "../utils/errors.js";
import { readTextFile, splitLines } from "../utils/readText.js";
import type { Tool } from "../registry.js";

/** text_cat 输入 schema。 */
export const textCatInputSchema = z.object({
  path: z.string(),
  encoding: z
    .enum(["utf8", "gbk", "auto"])
    .optional()
    .describe("默认 auto（自动识别 GBK/UTF-8）"),
  startLine: z.number().int().optional().describe("1-based 含"),
  endLine: z.number().int().optional().describe("1-based 含"),
  startByte: z.number().int().optional().describe("0-based 含"),
  endByte: z.number().int().optional().describe("0-based 含"),
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
    // 读文件链路（判目录/字节范围/解码/行范围切片）委托给读文件深模块
    const content = await readTextFile(path, {
      encoding:
        encoding === "utf8" || encoding === "gbk"
          ? (encoding as string)
          : undefined,
      ...(sByte !== undefined || eByte !== undefined
        ? { byteRange: { start: sByte, end: eByte } }
        : {}),
      ...(sLine !== undefined || eLine !== undefined
        ? { lineRange: { start: sLine, end: eLine } }
        : {}),
    });

    // 行数以返回内容中的逻辑行为准（结尾换行不计，空内容为 0）
    const totalLines = content === "" ? 0 : splitLines(content).length;
    const limit = getTruncateLimit();
    const truncated = content.length > limit;

    return ok({
      content: truncate(content, limit),
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
  content: z.string().describe("可能截断"),
  lines: z.number().int().nonnegative(),
  truncated: z.boolean().describe("触发截断"),
});

/** text_cat 工具定义。 */
export const textCatTool: Tool = {
  name: "cat",
  domain: "text",
  description:
    "读文件整体（≈ cat）。支持编码 auto（GBK/UTF-8）、字节范围（0-based 含）、行范围（1-based 含）、截断。",
  inputSchema: textCatInputSchema,
  outputSchema: textCatOutputSchema,
  annotations: { readOnlyHint: true },
  handler: textCatHandler,
  aliases: ["text_cat"],
};
