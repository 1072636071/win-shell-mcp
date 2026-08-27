/**
 * run_command（工单 03）：以参数数组直接执行命令，不经过 shell 解析。
 *
 * 与 shell_exec 的区别：shell_exec 将整个字符串交给 cmd.exe / sh 解析（支持管道、重定向、
 * 通配符），适合交互式 shell 片段；run_command 将 command + args 数组直接 spawn，
 * 不经过 shell，适合调用带空格路径或需精确参数的程序（如 ["C:\\Program Files\\app.exe", "a b"]）。
 *
 * 子进程机器（spawn、stdout/stderr 收集、超时、进程树终止、GBK/UTF-8 解码）全部委托给
 * 命令执行深模块（src/exec/run.ts）。handler 仅做 RunOutcome → 输出契约映射与字符级截断，
 * 无 try/catch、无异常路径（深模块从不抛异常）。
 */

import { z } from "zod";
import {
  ok,
  fail,
  truncate,
  type AnyToolResult,
} from "../contract/output.js";
import { ErrorCode } from "../contract/errors.js";
import { runCommand } from "../exec/run.js";
import type { Tool } from "../registry.js";

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_OUTPUT_BYTES = 5 * 1024 * 1024;

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

    // 合并环境变量：以 process.env 为底，叠加显式 env（对齐 shell_exec）
    const childEnv = env ? { ...process.env, ...env } : undefined;
    const effectiveTimeout = timeoutMs ?? DEFAULT_TIMEOUT_MS;

    // 委托深模块：从不抛异常，返回结构化 RunOutcome
    const outcome = await runCommand(command, args ?? [], {
      cwd,
      env: childEnv,
      timeoutMs: effectiveTimeout,
      encoding,
      stdin,
    });

    // spawn 失败（命令不存在、cwd 无效等）→ EXEC_FAIL
    if (outcome.spawnError) {
      return fail(
        ErrorCode.EXEC_FAIL,
        `命令执行失败: ${outcome.spawnError.message}`,
      );
    }

    // 超时 → EXEC_TIMEOUT（深模块已杀进程树并立即 settle，无挂起风险）
    if (outcome.timedOut) {
      return fail(
        ErrorCode.EXEC_TIMEOUT,
        `命令执行超时（${effectiveTimeout}ms）`,
      );
    }

    // 字符级截断（对齐 shell_exec 语义：超长附 ...[truncated, N more chars] 标记）
    const limit = maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
    const stdout = truncate(outcome.stdout, limit);
    const stderr = truncate(outcome.stderr, limit);
    const truncated =
      outcome.stdout.length > limit || outcome.stderr.length > limit;

    return ok({
      stdout,
      stderr,
      exitCode: outcome.exitCode,
      signal: null,
      truncated,
    });
  },
};

export { runCommandTool };
