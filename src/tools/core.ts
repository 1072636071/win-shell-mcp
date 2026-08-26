/**
 * 核心命令域（工单 02）：pwd / echo。
 *
 * 这些工具是最基础的 shell 原语，作为后续命令注册表与别名机制的验证基线。
 */

import { z } from "zod";
import { ok, fail } from "../contract/output.js";
import { ErrorCode } from "../contract/errors.js";
import { toDisplay } from "../utils/path.js";
import type { Tool } from "../registry.js";

/** pwd 输出 schema：返回当前工作目录绝对路径。 */
const pwdOutputSchema = z.object({
  cwd: z.string(),
});

const pwdTool: Tool = {
  name: "pwd",
  domain: "core",
  description: "返回当前工作目录绝对路径（≈ pwd）。",
  inputSchema: z.object({}),
  outputSchema: pwdOutputSchema,
  annotations: { readOnlyHint: true },
  async handler() {
    return ok({ cwd: toDisplay(process.cwd()) });
  },
};

/**
 * echo 输出 schema。
 *
 * format=text 返回 `{ output: string }`；format=json 返回 `{ args: string[] }`。
 * 两种形状互斥，用 optional 字段表达最通用形状。
 */
const echoOutputSchema = z.object({
  output: z.string().optional(),
  args: z.array(z.string()).optional(),
});

const echoTool: Tool = {
  name: "echo",
  domain: "core",
  description:
    "回显参数（≈ echo）。format=text 返回空格拼接，format=json 返回原始数组。",
  inputSchema: z.object({
    args: z.array(z.string()),
    format: z.enum(["text", "json"]).optional().describe("默认 text"),
  }),
  outputSchema: echoOutputSchema,
  annotations: { readOnlyHint: true },
  async handler(raw) {
    const { args, format } = raw as {
      args: string[];
      format?: "text" | "json";
    };
    if (!Array.isArray(args)) {
      return fail(ErrorCode.EINVAL, "args 必须是字符串数组");
    }
    if (format === "json") {
      return ok({ args });
    }
    return ok({ output: args.join(" ") });
  },
};

export { pwdTool, echoTool };
