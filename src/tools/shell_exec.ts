/**
 * shell_exec 工具：执行 shell 命令并返回 {exitCode, stdout, stderr}。
 *
 * 跨平台：Windows 用 cmd.exe /c，unix 用 sh -c。
 * 子进程输出自动识别 GBK/UTF-8（通过 decodeBuffer）。
 * 超时可中断：超时杀子进程并返回 EXEC_TIMEOUT。
 * 非零退出码是正常结果（不是工具失败）。
 *
 * 极简输出：{ exitCode, stdout, stderr }
 * verbose 输出：额外 { pid, duration, truncated }
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { z } from 'zod';
import {
  ok,
  fail,
  truncate,
  withVerbose,
  DEFAULT_TRUNCATE_LIMIT,
  type AnyToolResult,
} from '../contract/output.js';
import { ErrorCode } from '../contract/errors.js';
import { decodeBuffer } from '../encoding/detect.js';
import { IS_WIN } from '../utils/platform.js';
import type { Tool } from '../registry.js';

/** 输入 schema。 */
export const shellExecInputSchema = z.object({
  command: z.string().min(1).describe('要执行的命令（非空字符串）'),
  cwd: z.string().optional().describe('工作目录（绝对或相对路径）'),
  timeout: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('超时毫秒，超时杀子进程并返回 EXEC_TIMEOUT'),
  encoding: z
    .string()
    .optional()
    .describe('显式指定输出编码（如 gbk、utf-8），不指定则自动检测'),
  env: z
    .record(z.string(), z.string())
    .optional()
    .describe('额外环境变量，合并到子进程环境'),
  verbose: z
    .boolean()
    .optional()
    .describe('若为 true，返回 pid、duration、truncated'),
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
export async function shellExecHandler(args: Record<string, unknown>): Promise<AnyToolResult> {
  const command = args['command'];
  if (typeof command !== 'string' || command.length === 0) {
    return fail(ErrorCode.EINVAL, 'command 必须是非空字符串');
  }

  const cwd = args['cwd'];
  const timeout = args['timeout'];
  const encoding = args['encoding'];
  const envArg = args['env'];
  const verbose = args['verbose'] === true;

  // 选择 shell：Windows 用 cmd.exe /c，unix 用 sh -c
  const shell = IS_WIN ? 'cmd.exe' : 'sh';
  const shellArgs = IS_WIN ? ['/c', command] : ['-c', command];

  // 合并环境变量：以 process.env 为底，叠加显式 env
  const childEnv =
    envArg && typeof envArg === 'object'
      ? { ...process.env, ...(envArg as Record<string, string>) }
      : process.env;

  const encHint = typeof encoding === 'string' ? encoding : undefined;
  const cwdOpt = typeof cwd === 'string' && cwd.length > 0 ? cwd : undefined;
  const timeoutMs = typeof timeout === 'number' && timeout > 0 ? timeout : undefined;

  return new Promise<AnyToolResult>((resolve) => {
    const start = Date.now();
    let child: ChildProcess;
    try {
      child = spawn(shell, shellArgs, {
        cwd: cwdOpt,
        env: childEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      resolve(
        fail(
          ErrorCode.EXEC_FAIL,
          `spawn 启动失败: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
      return;
    }

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let timedOut = false;
    let settled = false;

    const timer: NodeJS.Timeout | null =
      timeoutMs !== undefined
        ? setTimeout(() => {
            timedOut = true;
            try {
              child.kill('SIGKILL');
            } catch {
              // 忽略 kill 错误
            }
          }, timeoutMs)
        : null;

    const cleanup = (): void => {
      if (timer !== null) clearTimeout(timer);
    };

    const settle = (result: AnyToolResult): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutChunks.push(chunk);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });

    // spawn 本身失败（如 shell 不存在 ENOENT）
    child.on('error', (err) => {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        settle(fail(ErrorCode.EXEC_FAIL, `shell 不存在: ${err.message}`));
      } else {
        settle(fail(ErrorCode.EXEC_FAIL, `命令执行失败: ${err.message}`));
      }
    });

    child.on('close', (exitCode) => {
      if (timedOut) {
        settle(fail(ErrorCode.EXEC_TIMEOUT, `命令执行超时（${timeoutMs}ms）: ${command}`));
        return;
      }

      const duration = Date.now() - start;
      const stdoutBuf = Buffer.concat(stdoutChunks);
      const stderrBuf = Buffer.concat(stderrChunks);
      const stdoutRaw = decodeBuffer(stdoutBuf, encHint);
      const stderrRaw = decodeBuffer(stderrBuf, encHint);

      const stdout = truncate(stdoutRaw);
      const stderr = truncate(stderrRaw);
      const truncated =
        stdoutRaw.length > DEFAULT_TRUNCATE_LIMIT || stderrRaw.length > DEFAULT_TRUNCATE_LIMIT;

      const minimal: ShellExecMinimal = {
        exitCode: exitCode ?? -1,
        stdout,
        stderr,
      };

      const full: ShellExecFull = {
        ...minimal,
        pid: child.pid ?? -1,
        duration,
        truncated,
      };
      const result = withVerbose(minimal, full, verbose);
      settle(ok(result) as unknown as AnyToolResult);
    });
  });
}

/** shell_exec 工具定义。 */
export const shellExecTool: Tool = {
  name: 'shell_exec',
  description:
    '执行 shell 命令，返回 {exitCode, stdout, stderr}。Windows 用 cmd.exe /c，unix 用 sh -c。支持 cwd、timeout、env、encoding、verbose。非零退出码是正常结果。',
  inputSchema: shellExecInputSchema,
  handler: shellExecHandler,
};