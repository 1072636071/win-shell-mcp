/**
 * pkg 工具集：pkg_detect / pkg_run。
 *
 * pkg_detect：检测各包管理器（npm/yarn/pnpm/bun/pip/pip3/cargo/go/python/python3）可用性。
 * pkg_run：执行指定包管理器命令，返回 { exitCode, stdout, stderr }。
 *
 * 跨平台：Windows 上 npm/yarn/pnpm 等是 .cmd 文件，需要 shell:true 让系统查找。
 * 非零退出码是正常结果（不是工具失败）。
 *
 * 极简输出：{ exitCode, stdout, stderr }
 * verbose 输出：额外 { pid, duration }
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { z } from 'zod';
import {
  ok,
  fail,
  truncate,
  type AnyToolResult,
} from '../contract/output.js';
import { ErrorCode } from '../contract/errors.js';
import { decodeBuffer } from '../encoding/detect.js';
import type { Tool } from '../registry.js';

/** 默认检测的包管理器列表。 */
const DEFAULT_MANAGERS = [
  'npm',
  'yarn',
  'pnpm',
  'bun',
  'pip',
  'pip3',
  'cargo',
  'go',
  'python',
  'python3',
] as const;

/** Windows 平台判断（模块加载时固定，避免重复调用）。 */
const IS_WIN = process.platform === 'win32';

// ===================== pkg_detect =====================

/** pkg_detect 输入 schema。 */
export const pkgDetectInputSchema = z.object({
  managers: z
    .array(z.string().min(1))
    .optional()
    .describe(
      '要检测的包管理器列表，默认检测全部（npm/yarn/pnpm/bun/pip/pip3/cargo/go/python/python3）',
    ),
});

/** pkg_detect 输入类型。 */
export type PkgDetectInput = z.infer<typeof pkgDetectInputSchema>;

/** pkg_detect 输出。 */
interface PkgDetectResult {
  available: Record<string, boolean>;
  checked: string[];
}

/**
 * 检测单个包管理器是否可用。
 *
 * 用 spawn 执行 `<manager> --version`，exitCode=0 则视为可用。
 * spawn 失败（ENOENT）或非零退出码都算不可用。
 *
 * @param manager 包管理器名
 * @returns true 表示可用
 */
function detectManager(manager: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let child: ChildProcess;
    try {
      // shell:true 让系统在 PATH 中查找命令（Windows 上找到 .cmd/.bat 后缀）
      child = spawn(manager, ['--version'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
        windowsHide: true,
      });
    } catch {
      resolve(false);
      return;
    }

    let settled = false;
    const settle = (v: boolean): void => {
      if (settled) return;
      settled = true;
      resolve(v);
    };

    // spawn 本身失败（如命令不存在）→ 不可用
    child.on('error', () => settle(false));
    // 退出码 0 → 可用；其他 → 不可用
    child.on('close', (code) => settle(code === 0));
  });
}

/**
 * pkg_detect handler：检测可用的包管理器。
 *
 * 返回 `{ available: Record<string, boolean>, checked: string[] }`。
 * 检测失败的管理器返回 false，不是工具失败（handler 永远返回 ok）。
 *
 * @param args 已验证的参数
 * @returns 统一输出契约（始终为 ok）
 */
export async function pkgDetectHandler(args: Record<string, unknown>): Promise<AnyToolResult> {
  const rawManagers = args['managers'];
  const checked: string[] =
    Array.isArray(rawManagers) && rawManagers.every((m) => typeof m === 'string' && m.length > 0)
      ? (rawManagers as string[])
      : [...DEFAULT_MANAGERS];

  // 并行检测所有管理器
  const entries = await Promise.all(
    checked.map(async (m) => [m, await detectManager(m)] as const),
  );
  const available: Record<string, boolean> = {};
  for (const [m, v] of entries) {
    available[m] = v;
  }

  const result: PkgDetectResult = { available, checked };
  return ok(result) as unknown as AnyToolResult;
}

/** pkg_detect 工具定义。 */
export const pkgDetectTool: Tool = {
  name: 'pkg_detect',
  description:
    '检测各包管理器（npm/yarn/pnpm/bun/pip/pip3/cargo/go/python/python3）可用性。返回 { available: Record<string, boolean>, checked: string[] }。managers 可指定要检测的子集。',
  inputSchema: pkgDetectInputSchema,
  handler: pkgDetectHandler,
};

// ===================== pkg_run =====================

/** pkg_run 输入 schema。 */
export const pkgRunInputSchema = z.object({
  manager: z.string().min(1).describe('包管理器名（如 npm、pnpm、pip）'),
  args: z
    .array(z.string())
    .optional()
    .describe('传给包管理器的参数（如 ["install", "lodash"]）'),
  cwd: z.string().optional().describe('工作目录（绝对或相对路径）'),
  timeout: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('超时毫秒，超时杀子进程并返回 EXEC_TIMEOUT'),
  verbose: z
    .boolean()
    .optional()
    .describe('若为 true，返回 pid 与 duration'),
});

/** pkg_run 输入类型。 */
export type PkgRunInput = z.infer<typeof pkgRunInputSchema>;

/** 极简输出字段。 */
interface PkgRunMinimal {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** verbose 输出字段。 */
interface PkgRunFull extends PkgRunMinimal {
  pid: number;
  duration: number;
}

/**
 * pkg_run handler：执行包管理器命令。
 *
 * 用 spawn 执行 `<manager> <args...>`，shell:true 让系统查找命令。
 * 极简返回 `{ exitCode, stdout, stderr }`，verbose 额外返回 `{ pid, duration }`。
 *
 * 错误：
 * - manager 非法 → EINVAL
 * - manager 不存在（spawn ENOENT）→ EXEC_FAIL
 * - 超时 → EXEC_TIMEOUT
 * - 非零退出码是正常结果（不是工具失败）
 *
 * @param args 已验证的参数
 * @returns 统一输出契约
 */
export async function pkgRunHandler(args: Record<string, unknown>): Promise<AnyToolResult> {
  const manager = args['manager'];
  if (typeof manager !== 'string' || manager.length === 0) {
    return fail(ErrorCode.EINVAL, 'manager 必须是非空字符串');
  }

  const rawArgs = args['args'];
  const cmdArgs: string[] =
    Array.isArray(rawArgs) && rawArgs.every((a) => typeof a === 'string')
      ? (rawArgs as string[])
      : [];

  const cwd = args['cwd'];
  const timeout = args['timeout'];
  const verbose = args['verbose'] === true;

  const cwdOpt = typeof cwd === 'string' && cwd.length > 0 ? cwd : undefined;
  const timeoutMs = typeof timeout === 'number' && timeout > 0 ? timeout : undefined;

  return new Promise<AnyToolResult>((resolve) => {
    const start = Date.now();
    let child: ChildProcess;
    try {
      child = spawn(manager, cmdArgs, {
        cwd: cwdOpt,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
        windowsHide: true,
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

    let timer: NodeJS.Timeout | null = null;

    const cleanup = (): void => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const settle = (result: AnyToolResult): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    if (timeoutMs !== undefined) {
      timer = setTimeout(() => {
        timedOut = true;
        // Windows 上 shell:true 时 kill 只杀 shell（cmd.exe）进程，
        // 子进程（如 npm）可能仍在跑并持有 stdio pipe，导致 close 事件不触发。
        // 先尝试杀进程树，再立即 settle，不等 close。
        if (child.pid !== undefined) {
          if (IS_WIN) {
            // Windows: taskkill /T /F 杀整个进程树
            spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
              stdio: 'ignore',
              shell: true,
              windowsHide: true,
            }).on('error', () => {
              // 忽略 taskkill 错误，尽力而为
            });
          } else {
            try {
              child.kill('SIGKILL');
            } catch {
              // 忽略 kill 错误
            }
          }
        }
        settle(
          fail(
            ErrorCode.EXEC_TIMEOUT,
            `命令超时（${timeoutMs}ms）: ${manager} ${cmdArgs.join(' ')}`.trim(),
          ),
        );
      }, timeoutMs);
    }

    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutChunks.push(chunk);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });

    // spawn 本身失败（如 manager 不存在 ENOENT）
    child.on('error', (err) => {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        settle(fail(ErrorCode.EXEC_FAIL, `包管理器不存在: ${manager}`));
      } else {
        settle(fail(ErrorCode.EXEC_FAIL, `执行失败: ${err.message}`));
      }
    });

    child.on('close', (exitCode) => {
      if (timedOut) {
        settle(
          fail(
            ErrorCode.EXEC_TIMEOUT,
            `命令超时（${timeoutMs}ms）: ${manager} ${cmdArgs.join(' ')}`.trim(),
          ),
        );
        return;
      }

      const duration = Date.now() - start;
      const stdoutBuf = Buffer.concat(stdoutChunks);
      const stderrBuf = Buffer.concat(stderrChunks);
      const stdout = truncate(decodeBuffer(stdoutBuf));
      const stderr = truncate(decodeBuffer(stderrBuf));

      const minimal: PkgRunMinimal = {
        exitCode: exitCode ?? -1,
        stdout,
        stderr,
      };

      if (!verbose) {
        settle(ok(minimal) as unknown as AnyToolResult);
        return;
      }

      const full: PkgRunFull = {
        ...minimal,
        pid: child.pid ?? -1,
        duration,
      };
      settle(ok(full) as unknown as AnyToolResult);
    });
  });
}

/** pkg_run 工具定义。 */
export const pkgRunTool: Tool = {
  name: 'pkg_run',
  description:
    '执行包管理器命令，返回 { exitCode, stdout, stderr }。manager 如 npm/pnpm/pip，args 如 ["install", "lodash"]。支持 cwd、timeout、verbose。非零退出码是正常结果。',
  inputSchema: pkgRunInputSchema,
  handler: pkgRunHandler,
};