/**
 * run_command（工单 03）：以参数数组直接执行命令，不经过 shell 解析。
 *
 * 与 shell_exec 的区别：shell_exec 将整个字符串交给 cmd.exe / sh 解析（支持管道、重定向、
 * 通配符），适合交互式 shell 片段；run_command 将 command + args 数组直接 spawn，
 * 不经过 shell，适合调用带空格路径或需精确参数的程序（如 ["C:\\Program Files\\app.exe", "a b"]）。
 */

import { z } from "zod";
import { ok, fail, type AnyToolResult } from "../contract/output.js";
import { ErrorCode } from "../contract/errors.js";
import { failFromError } from "../utils/errors.js";
import { runCommand } from "../exec/run.js";
import type { Tool } from "../registry.js";

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_OUTPUT_BYTES = 5 * 1024 * 1024;

export type RunCommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: string | null;
  truncated: boolean;
};

/**
 * run_command 输出 schema（描述 success data 结构，不含 ok 包装）。
 *
 * 成功返回 `{ stdout, stderr, exitCode, signal, truncated }`。
 */
const runCommandOutputSchema = z.object({
  stdout: z.string().describe("可能截断"),
  stderr: z.string().describe("可能截断"),
  exitCode: z.number().int().nullable().describe("null 表示被信号终止"),
  signal: z.string().nullable().describe("null 表示正常退出"),
  truncated: z.boolean(),
});

const runCommandTool: Tool = {
  name: "run_command",
  domain: "run_command",
  description:
    "结构化执行命令（args 数组，不经 shell 解析，无管道/通配/注入风险）。返回 {stdout, stderr, exitCode, signal, truncated}。适合带空格路径或精确参数。",
  inputSchema: z.object({
    command: z.string(),
    args: z.array(z.string()).default([]).describe("不经 shell 解析"),
    cwd: z.string().optional().describe("默认当前目录"),
    env: z.record(z.string(), z.string()).optional(),
    timeoutMs: z
      .number()
      .int()
      .positive()
      .max(600_000)
      .optional()
      .describe("超时（毫秒），默认 120000"),
    maxOutputBytes: z
      .number()
      .int()
      .positive()
      .max(50 * 1024 * 1024)
      .optional()
      .describe("截断阈值（字节），默认 5MiB"),
    encoding: z
      .enum(["utf8", "gbk"])
      .optional()
      .describe("缺省自动识别 GBK/UTF-8"),
    stdin: z.string().optional().describe("写完即关闭"),
  }),
  outputSchema: runCommandOutputSchema,
  // 黑盒执行任意命令，潜在破坏性（rm/format/git reset 等），destructiveHint: true
  annotations: { readOnlyHint: false, destructiveHint: true },
  async handler(raw) {
    const {
      command,
      args,
      cwd,
      env,
      timeoutMs,
      maxOutputBytes,
      encoding,
      stdin,
    } = raw as {
      command: string;
      args?: string[];
      cwd?: string;
      env?: Record<string, string>;
      timeoutMs?: number;
      maxOutputBytes?: number;
      encoding?: "utf8" | "gbk";
      stdin?: string;
    };
    if (!command) return fail(ErrorCode.EINVAL, "command is required");
    // 子进程机器委托给命令执行深模块（src/exec/run.ts）：spawn、输出字节预算、
    // 超时进程树杀、GBK 解码、signal 一次收敛。
    const outcome = await runCommand(command, args ?? [], {
      cwd: typeof cwd === "string" && cwd.length > 0 ? cwd : undefined,
      env: env !== undefined ? { ...process.env, ...env } : undefined,
      timeoutMs: timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxOutputBytes: maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES,
      encoding,
      stdin,
    });

    if (outcome.spawnError !== undefined) {
      // 复现 spawn 失败语义（ENOENT 等经错误映射转标准码）
      const err = new Error(outcome.spawnError.message) as NodeJS.ErrnoException;
      if (outcome.spawnError.code !== undefined) err.code = outcome.spawnError.code;
      return failFromError(err);
    }
    if (outcome.timedOut) {
      return fail(
        ErrorCode.EXEC_TIMEOUT,
        `命令执行超时（${timeoutMs ?? DEFAULT_TIMEOUT_MS}ms）`,
      );
    }

    return ok({
      stdout: outcome.stdout,
      stderr: outcome.stderr,
      exitCode: outcome.signal != null ? null : outcome.exitCode,
      signal: outcome.signal ?? null,
      truncated: outcome.stdoutTruncated || outcome.stderrTruncated,
    });
  },
};

export { runCommandTool };
