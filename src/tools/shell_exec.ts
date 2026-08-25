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
  DEFAULT_TRUNCATE_LIMIT,
  type AnyToolResult,
} from "../contract/output.js";
import { ErrorCode } from "../contract/errors.js";
import { runCommand } from "../exec/run.js";
import { IS_WIN } from "../utils/platform.js";
import type { Tool } from "../registry.js";

/** 输入 schema。 */
export const shellExecInputSchema = z.object({
  command: z.string().min(1).describe("要执行的命令（非空字符串）"),
  cwd: z.string().optional().describe("工作目录（绝对或相对路径）"),
  timeout: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("超时毫秒，超时杀子进程并返回 EXEC_TIMEOUT"),
  encoding: z
    .string()
    .optional()
    .describe("显式指定输出编码（如 gbk、utf-8），不指定则自动检测"),
  env: z
    .record(z.string(), z.string())
    .optional()
    .describe("额外环境变量，合并到子进程环境"),
  verbose: z
    .boolean()
    .optional()
    .describe("若为 true，返回 pid、duration、truncated"),
  shell: z
    .enum(["auto", "cmd"])
    .optional()
    .describe(
      "shell 选择：auto（默认，Windows cmd.exe / unix sh）、cmd（Windows cmd.exe）",
    ),
  stdin: z
    .string()
    .optional()
    .describe("写入子进程标准输入的字符串，写完即关闭"),
});

/** shell_exec 输入类型。 */
export type ShellExecInput = z.infer<typeof shellExecInputSchema>;

/** 极简输出字段。 */
interface ShellExecMinimal {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** verbose 输出字段。 */
interface ShellExecFull extends ShellExecMinimal {
  pid: number;
  duration: number;
  truncated: boolean;
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

  const stdout = truncate(outcome.stdout);
  const stderr = truncate(outcome.stderr);
  const truncated =
    outcome.stdout.length > DEFAULT_TRUNCATE_LIMIT ||
    outcome.stderr.length > DEFAULT_TRUNCATE_LIMIT;

  const minimal: ShellExecMinimal = {
    exitCode: outcome.exitCode,
    stdout,
    stderr,
  };

  const full: ShellExecFull = {
    ...minimal,
    pid: outcome.pid,
    duration: outcome.duration,
    truncated,
  };
  const result = withVerbose(minimal, full, verbose);
  return ok(result);
}

/**
 * shell_exec 输出 schema（描述 success data 结构，不含 ok 包装）。
 *
 * 极简返回 `{ exitCode, stdout, stderr }`；verbose 额外返回 `{ pid, duration, truncated }`。
 * 与 ShellExecMinimal/ShellExecFull 接口等价的 zod schema。
 */
export const shellExecOutputSchema = z.object({
  exitCode: z.number().int().describe("退出码（非零是正常结果，不是工具失败）"),
  stdout: z.string().describe("标准输出（可能截断）"),
  stderr: z.string().describe("标准错误（可能截断）"),
  pid: z.number().int().optional().describe("子进程 pid（verbose 时返回）"),
  duration: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("耗时毫秒（verbose 时返回）"),
  truncated: z.boolean().optional().describe("输出是否截断（verbose 时返回）"),
});

/** shell_exec 工具定义。 */
export const shellExecTool: Tool = {
  name: "shell_exec",
  description:
    "执行 shell 命令，返回 {exitCode, stdout, stderr}。shell 可选 auto/cmd；支持 stdin、cwd、timeout、env、encoding、verbose。非零退出码是正常结果。",
  inputSchema: shellExecInputSchema,
  outputSchema: shellExecOutputSchema,
  // 黑盒执行任意 shell 命令，潜在破坏性（rm/format/git reset 等），destructiveHint: true
  annotations: { readOnlyHint: false, destructiveHint: true },
  handler: shellExecHandler,
};
