/**
 * run_command（工单 03）：以参数数组直接执行命令，不经过 shell 解析。
 *
 * 与 shell_exec 的区别：shell_exec 将整个字符串交给 cmd.exe / sh 解析（支持管道、重定向、
 * 通配符），适合交互式 shell 片段；run_command 将 command + args 数组直接 spawn，
 * 不经过 shell，适合调用带空格路径或需精确参数的程序（如 ["C:\\Program Files\\app.exe", "a b"]）。
 */

import { spawn } from "node:child_process";
import { z } from "zod";
import { ok, fail, type AnyToolResult } from "../contract/output.js";
import { ErrorCode } from "../contract/errors.js";
import { failFromError } from "../utils/errors.js";
import { decodeBuffer } from "../encoding/detect.js";
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

async function spawnCommand(opts: {
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs: number;
  maxOutputBytes: number;
  encoding?: "utf8" | "gbk";
  stdin?: string;
}): Promise<RunCommandResult> {
  const {
    command,
    args,
    cwd,
    env,
    timeoutMs,
    maxOutputBytes,
    encoding,
    stdin,
  } = opts;
  const hasStdin = typeof stdin === "string";
  const proc = spawn(command, args, {
    cwd: cwd ?? process.cwd(),
    env: { ...process.env, ...(env ?? {}) },
    windowsHide: true,
    stdio: hasStdin ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
  });

  // 写入 stdin 后关闭
  if (hasStdin && proc.stdin) {
    try {
      proc.stdin.write(stdin as string);
      proc.stdin.end();
    } catch {
      // 子进程已关闭 stdin，忽略 EPIPE
    }
  }

  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  let truncated = false;

  const onData = (
    buf: Buffer,
    sink: (b: Buffer) => void,
    acc: { total: number },
  ) => {
    const remaining = maxOutputBytes - acc.total;
    if (remaining <= 0) {
      // 已达预算上限，丢弃后续字节
      truncated = true;
      return;
    }
    // 保留预算内前缀；若本块局部越限则仅取前缀（尾截而不整块丢弃）
    const slice = buf.length > remaining ? buf.subarray(0, remaining) : buf;
    acc.total += slice.length;
    if (slice.length < buf.length) truncated = true;
    sink(slice);
  };

  const stdoutAcc = { total: 0 };
  const stderrAcc = { total: 0 };
  proc.stdout?.on("data", (b: Buffer) =>
    onData(b, (c) => stdoutChunks.push(c), stdoutAcc),
  );
  proc.stderr?.on("data", (b: Buffer) =>
    onData(b, (c) => stderrChunks.push(c), stderrAcc),
  );

  let spawnError: Error | null = null;
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    proc.kill("SIGKILL");
  }, timeoutMs);
  let signal: string | null = null;
  const exitCode = await new Promise<number | null>((resolve) => {
    proc.on("close", (c, sig) => {
      signal = sig ?? null;
      resolve(c);
    });
    proc.on("error", (e) => {
      spawnError = e as Error;
      resolve(null);
    });
  });
  clearTimeout(timeout);

  if (spawnError) throw spawnError;
  if (timedOut) {
    const err = new Error(
      `命令执行超时（${timeoutMs}ms）`,
    ) as NodeJS.ErrnoException;
    err.code = ErrorCode.EXEC_TIMEOUT;
    throw err;
  }

  // concat 后统一解码，避免 GBK 多字节序列在 chunk/截断边界被切断而乱码（对齐 shell_exec）
  const stdout = decodeBuffer(Buffer.concat(stdoutChunks), encoding);
  const stderr = decodeBuffer(Buffer.concat(stderrChunks), encoding);
  return { stdout, stderr, exitCode, signal, truncated };
}

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
    try {
      const res = await spawnCommand({
        command,
        args: args ?? [],
        cwd,
        env,
        timeoutMs: timeoutMs ?? DEFAULT_TIMEOUT_MS,
        maxOutputBytes: maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES,
        encoding,
        stdin,
      });
      return ok(res);
    } catch (e) {
      return failFromError(e);
    }
  },
};

export { runCommandTool };
