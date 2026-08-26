/**
 * shell_exec 工具：执行 shell 命令并返回 {exitCode, stdout, stderr}。
 *
 * 跨平台：Windows 用 cmd.exe /c，unix 用 sh -c。
 * 子进程机器（收集、超时、进程树终止、GBK/UTF-8 解码）全部委托给
 * 命令执行深模块（src/exec/run.ts）。
 * 非零退出码是正常结果（不是工具失败）。
 *
 * 极简输出：{ exitCode, stdout, stderr }
 * verbose 输出：额外 { pid, duration, truncated }
 */

import { z } from "zod";
import {
  ok,
  fail,
  truncate,
  withVerbose,
  getTruncateLimit,
  type AnyToolResult,
} from "../contract/output.js";
import { ErrorCode } from "../contract/errors.js";
import { runCommand } from "../exec/run.js";
import { IS_WIN } from "../utils/platform.js";
import type { Tool } from "../registry.js";

/** 输入 schema。 */
export const shellExecInputSchema = z.object({
  command: z.string().min(1),
  cwd: z.string().optional(),
  timeout: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("毫秒，超时返回 EXEC_TIMEOUT"),
  encoding: z.string().optional().describe("不指定则自动检测"),
  env: z.record(z.string(), z.string()).optional(),
  verbose: z.boolean().optional(),
  shell: z.enum(["auto", "cmd"]).optional().describe("默认 auto"),
  stdin: z.string().optional().describe("写完即关闭"),
});

/** shell_exec 输入类型。 */
export type ShellExecInput = z.infer<typeof shellExecInputSchema>;

/** 极简输出字段。truncated 纳入默认输出：截断是「哑信息」，缺标记会迫使 AI 再补一轮。 */
interface ShellExecMinimal {
  exitCode: number;
  stdout: string;
  stderr: string;
  truncated: boolean;
}

/** verbose 输出字段。 */
interface ShellExecFull extends ShellExecMinimal {
  pid: number;
  duration: number;
}

/**
 * shell_exec handler：执行 shell 命令。
 *
 * @param args 已验证的参数
 * @returns 统一输出契约；spawn 失败返回 EXEC_FAIL，超时返回 EXEC_TIMEOUT
 */
export async function shellExecHandler(
  args: Record<string, unknown>,
): Promise<AnyToolResult> {
  const command = args["command"];
  if (typeof command !== "string" || command.length === 0) {
    return fail(ErrorCode.EINVAL, "command 必须是非空字符串");
  }

  const cwd = args["cwd"];
  const timeout = args["timeout"];
  const encoding = args["encoding"];
  const envArg = args["env"];
  const verbose = args["verbose"] === true;
  const shellOpt = (args["shell"] as string | undefined) ?? "auto";
  const stdinInput = args["stdin"];
  const hasStdin = typeof stdinInput === "string";

  // 选择 shell
  let shell: string;
  let shellArgs: string[];
  switch (shellOpt) {
    case "cmd":
      shell = "cmd.exe";
      shellArgs = ["/c", command];
      break;
    case "auto":
    default:
      shell = IS_WIN ? "cmd.exe" : "sh";
      shellArgs = IS_WIN ? ["/c", command] : ["-c", command];
      break;
  }

  // 合并环境变量：以 process.env 为底，叠加显式 env
  const childEnv =
    envArg && typeof envArg === "object"
      ? { ...process.env, ...(envArg as Record<string, string>) }
      : process.env;

  const encHint = typeof encoding === "string" ? encoding : undefined;
  const cwdOpt = typeof cwd === "string" && cwd.length > 0 ? cwd : undefined;
  const timeoutMs =
    typeof timeout === "number" && timeout > 0 ? timeout : undefined;

  const outcome = await runCommand(shell, shellArgs, {
    cwd: cwdOpt,
    env: childEnv,
    timeoutMs,
    encoding: encHint,
    stdin: hasStdin ? (stdinInput as string) : undefined,
  });

  if (outcome.spawnError !== undefined) {
    const code = outcome.spawnError.code;
    if (code === "ENOENT") {
      return fail(
        ErrorCode.EXEC_FAIL,
        `shell 不存在: ${outcome.spawnError.message}`,
      );
    }
    return fail(
      ErrorCode.EXEC_FAIL,
      `命令执行失败: ${outcome.spawnError.message}`,
    );
  }

  if (outcome.timedOut) {
    return fail(
      ErrorCode.EXEC_TIMEOUT,
      `命令执行超时（${timeoutMs}ms）: ${command}`,
    );
  }

  const limit = getTruncateLimit();
  const stdout = truncate(outcome.stdout, limit);
  const stderr = truncate(outcome.stderr, limit);
  const truncated =
    outcome.stdout.length > limit || outcome.stderr.length > limit;

  const minimal: ShellExecMinimal = {
    exitCode: outcome.exitCode,
    stdout,
    stderr,
    truncated,
  };

  const full: ShellExecFull = {
    ...minimal,
    pid: outcome.pid,
    duration: outcome.duration,
  };
  const result = withVerbose(minimal, full, verbose);
  return ok(result);
}

/**
 * shell_exec 输出 schema（描述 success data 结构，不含 ok 包装）。
 *
 * 极简返回 `{ exitCode, stdout, stderr, truncated }`；verbose 额外返回 `{ pid, duration }`。
 * truncated 纳入默认输出：截断是「哑信息」，缺标记会迫使 AI 再补一轮（极简 ≠ 丢信息）。
 * 与 ShellExecMinimal/ShellExecFull 接口等价的 zod schema。
 */
export const shellExecOutputSchema = z.object({
  exitCode: z.number().int().describe("非零是正常结果"),
  stdout: z.string().describe("可能截断"),
  stderr: z.string().describe("可能截断"),
  truncated: z.boolean().describe("stdout 或 stderr 是否被截断"),
  pid: z.number().int().optional(),
  duration: z.number().int().nonnegative().optional(),
});

/** shell_exec 工具定义。 */
export const shellExecTool: Tool = {
  name: "shell_exec",
  domain: "shell_exec",
  description:
    "执行 raw shell 命令字符串（≈ sh -c），管道/重定向/通配由 shell 解释。返回 {exitCode, stdout, stderr}。非零退出码是正常结果。",
  inputSchema: shellExecInputSchema,
  outputSchema: shellExecOutputSchema,
  // 黑盒执行任意 shell 命令，潜在破坏性（rm/format/git reset 等），destructiveHint: true
  annotations: { readOnlyHint: false, destructiveHint: true },
  handler: shellExecHandler,
};
