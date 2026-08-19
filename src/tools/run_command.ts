/**
 * run_command（工单 03）：以参数数组直接执行命令，不经过 shell 解析。
 *
 * 与 shell_exec 的区别：shell_exec 将整个字符串交给 cmd.exe / sh 解析（支持管道、重定向、
 * 通配符），适合交互式 shell 片段；run_command 将 command + args 数组直接 spawn，
 * 不经过 shell，适合调用带空格路径或需精确参数的程序（如 ["C:\\Program Files\\app.exe", "a b"]）。
 */

import { spawn } from 'node:child_process';
import { z } from 'zod';
import { ok, fail, type AnyToolResult } from '../contract/output.js';
import { ErrorCode } from '../contract/errors.js';
import { failFromError } from '../utils/errors.js';
import { decodeBuffer } from '../encoding/detect.js';
import type { Tool } from '../registry.js';

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
  encoding?: 'utf8' | 'gbk';
}): Promise<RunCommandResult> {
  const { command, args, cwd, env, timeoutMs, maxOutputBytes, encoding } = opts;
  const proc = spawn(command, args, {
    cwd: cwd ?? process.cwd(),
    env: { ...process.env, ...(env ?? {}) },
    windowsHide: true,
  });

  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  let truncated = false;

  const onData = (buf: Buffer, sink: (b: Buffer) => void, acc: { total: number }) => {
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
  proc.stdout?.on('data', (b: Buffer) => onData(b, (c) => stdoutChunks.push(c), stdoutAcc));
  proc.stderr?.on('data', (b: Buffer) => onData(b, (c) => stderrChunks.push(c), stderrAcc));

  let spawnError: Error | null = null;
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    proc.kill('SIGKILL');
  }, timeoutMs);
  let signal: string | null = null;
  const exitCode = await new Promise<number | null>((resolve) => {
    proc.on('close', (c, sig) => {
      signal = sig ?? null;
      resolve(c);
    });
    proc.on('error', (e) => {
      spawnError = e as Error;
      resolve(null);
    });
  });
  clearTimeout(timeout);

  if (spawnError) throw spawnError;
  if (timedOut) {
    const err = new Error(`命令执行超时（${timeoutMs}ms）`) as NodeJS.ErrnoException;
    err.code = ErrorCode.EXEC_TIMEOUT;
    throw err;
  }

  // concat 后统一解码，避免 GBK 多字节序列在 chunk/截断边界被切断而乱码（对齐 shell_exec）
  const stdout = decodeBuffer(Buffer.concat(stdoutChunks), encoding);
  const stderr = decodeBuffer(Buffer.concat(stderrChunks), encoding);
  return { stdout, stderr, exitCode, signal, truncated };
}

const runCommandTool: Tool = {
  name: 'run_command',
  description:
    '以参数数组直接执行命令（不经过 shell 解析），返回 stdout/stderr/退出码/是否截断。适合调用带空格路径或需精确参数的程序。',
  inputSchema: z.object({
    command: z.string().describe('可执行文件或命令名'),
    args: z.array(z.string()).default([]).describe('参数数组（不经由 shell 解析）'),
    cwd: z.string().optional().describe('工作目录，默认当前目录'),
    env: z.record(z.string(), z.string()).optional().describe('追加/覆盖的环境变量'),
    timeoutMs: z.number().int().positive().max(600_000).optional().describe('超时（毫秒），默认 120000'),
    maxOutputBytes: z
      .number()
      .int()
      .positive()
      .max(50 * 1024 * 1024)
      .optional()
      .describe('输出截断阈值（字节），默认 5MiB'),
    encoding: z.enum(['utf8', 'gbk']).optional().describe('输出解码编码；缺省自动识别 GBK/UTF-8'),
  }),
  async handler(raw) {
    const { command, args, cwd, env, timeoutMs, maxOutputBytes, encoding } = raw as {
      command: string;
      args?: string[];
      cwd?: string;
      env?: Record<string, string>;
      timeoutMs?: number;
      maxOutputBytes?: number;
      encoding?: 'utf8' | 'gbk';
    };
    if (!command) return fail(ErrorCode.EINVAL, 'command is required');
    try {
      const res = await spawnCommand({
        command,
        args: args ?? [],
        cwd,
        env,
        timeoutMs: timeoutMs ?? DEFAULT_TIMEOUT_MS,
        maxOutputBytes: maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES,
        encoding,
      });
      return ok(res);
    } catch (e) {
      return failFromError(e);
    }
  },
};

export { runCommandTool };
