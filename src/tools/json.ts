/**
 * json 工具集：json_get。
 *
 * jq-lite 子集：按路径表达式从 JSON 文件或字符串取值。
 * 支持点路径（.foo.bar）与数组索引（[0]），不支持 jq 的高级功能（管道、过滤、函数）。
 */

import { readFile } from "node:fs/promises";
import { z } from "zod";
import { ok, fail, type AnyToolResult } from "../contract/output.js";
import { ErrorCode } from "../contract/errors.js";
import { failFromError } from "../utils/errors.js";
import type { Tool } from "../registry.js";

/** json_get 输入 schema。 */
export const jsonGetInputSchema = z.object({
  path: z.string().optional().describe("与 data 二选一"),
  data: z.string().optional().describe("与 path 二选一"),
  expr: z.string().describe("路径表达式，如 .foo.bar[0]；. 表示根"),
});

/**
 * 按路径表达式从 JSON 数据取值。
 *
 * 支持：
 * - .key → 对象属性
 * - [n] → 数组索引
 * - . → 根
 *
 * @param data JSON 数据
 * @param expr 路径表达式
 * @returns 取到的值
 * @throws Error 路径不合法或类型不匹配
 */
function getByPath(data: unknown, expr: string): unknown {
  if (expr === "." || expr.length === 0) return data;
  let current = data;
  let i = 0;
  while (i < expr.length) {
    if (expr[i] === ".") {
      i++;
      let key = "";
      while (i < expr.length && expr[i] !== "." && expr[i] !== "[") {
        key += expr[i];
        i++;
      }
      if (key.length > 0) {
        if (
          current === null ||
          typeof current !== "object" ||
          Array.isArray(current)
        ) {
          throw new Error(`无法在非对象上取属性 .${key}`);
        }
        current = (current as Record<string, unknown>)[key];
      }
    } else if (expr[i] === "[") {
      i++;
      let idxStr = "";
      while (i < expr.length && expr[i] !== "]") {
        idxStr += expr[i];
        i++;
      }
      i++; // 跳过 ]
      const idx = Number(idxStr);
      if (!Number.isInteger(idx)) {
        throw new Error(`非法数组索引 [${idxStr}]`);
      }
      if (!Array.isArray(current)) {
        throw new Error(`无法在非数组上取索引 [${idx}]`);
      }
      current = current[idx];
    } else {
      i++;
    }
  }
  return current;
}

/**
 * json_get handler：按路径表达式从 JSON 取值。
 *
 * 错误：EINVAL（参数非法/路径不匹配）/ ENOENT（文件不存在）
 */
export async function jsonGetHandler(
  args: Record<string, unknown>,
): Promise<AnyToolResult> {
  const filePath = args["path"] as string | undefined;
  const dataStr = args["data"] as string | undefined;
  const expr = args["expr"] as string | undefined;

  if (typeof expr !== "string" || expr.length === 0) {
    return fail(ErrorCode.EINVAL, "expr 必须是非空字符串");
  }
  if (typeof filePath !== "string" && typeof dataStr !== "string") {
    return fail(ErrorCode.EINVAL, "必须提供 path 或 data");
  }

  try {
    let raw: string;
    if (typeof filePath === "string" && filePath.length > 0) {
      raw = await readFile(filePath, "utf8");
    } else {
      raw = dataStr as string;
    }

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch (e) {
      return fail(
        ErrorCode.EINVAL,
        `JSON 解析失败: ${e instanceof Error ? e.message : String(e)}`,
      ) as unknown as AnyToolResult;
    }

    let value: unknown;
    try {
      value = getByPath(json, expr);
    } catch (e) {
      return fail(
        ErrorCode.EINVAL,
        `路径取值失败: ${e instanceof Error ? e.message : String(e)}`,
      ) as unknown as AnyToolResult;
    }

    return ok({ value }) as unknown as AnyToolResult;
  } catch (err) {
    return failFromError(err);
  }
}

/**
 * json_get 输出 schema（描述 success data 结构，不含 ok 包装）。
 *
 * 返回 `{ value }`，value 为按路径表达式取到的任意 JSON 值（用 unknown 表达）。
 */
export const jsonGetOutputSchema = z.object({
  value: z.unknown(),
});

/** json_get 工具定义。 */
export const jsonGetTool: Tool = {
  name: "json_get",
  description:
    "按路径表达式从 JSON 取值（≈ jq get，仅 .foo.bar 与 [0]）。返回 {value}。",
  inputSchema: jsonGetInputSchema,
  outputSchema: jsonGetOutputSchema,
  annotations: { readOnlyHint: true },
  handler: jsonGetHandler,
  aliases: ["jq"],
};
