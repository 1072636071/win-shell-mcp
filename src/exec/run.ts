/**
 * 命令执行深模块。
 *
 * 统一拥有子进程执行的全部机器：spawn、stdout/stderr 缓冲收集、超时计时、
 * 超时时的进程树终止、GBK/UTF-8 解码。shell_exec、pkg_run、git 均调用此模块，
 * 不再各自复制这套机器（此前 shell_exec 与 pkg_run 各有一份且已分叉——
 * pkg 超时杀进程树，shell_exec 只杀 shell，导致 Windows 上兜底执行超时后
 * 子进程仍在运行）。
 *
 * 接口只有一个：`runCommand`。它从不抛异常，始终返回结构化 `RunOutcome`，
 * 由调用方把结果映射为输出契约。
 *
 * 另导出 `execFileAsync`（promisified execFile），供仅需简单缓冲执行的调用方
 * （如 process_list）使用。
 */

import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { decodeBuffer } from '../encoding/detect.js';
import { IS_WIN } from '../utils/platform.js';

/** promisified execFile（缓冲执行，非零退出码抛异常）。 */
export const execFileAsync = promisify(execFile);

/** runCommand 选项。 */
export interface RunOptions {
  /** 工作目录。 */
  cwd?: string;
  /** 子进程环境变量；省略时继承 process.env。 */
  env?: NodeJS.ProcessEnv;
  /** 超时毫秒；超时杀进程树并返回 timedOut=true。 */
  timeoutMs?: number;
  /** 输出编码提示（如 'gbk'）；省略时自动检测 GBK/UTF-8。 */
  encoding?: string;
  /** 为 true 时经平台 shell 执行（Windows cmd.exe，unix sh）。 */
  shell?: boolean;
  /** Windows 上隐藏子进程窗口，默认 true。 */
  windowsHide?: boolean;
  /** 写入子进程标准输入的文本（可选）。存在时 stdio 的 stdin 设为 pipe。 */
  stdin?: string;
  /** 每流输出字节预算（stdout/stderr 独立）。设置后超限按前缀截断并标记
   *  stdoutTruncated/stderrTruncated，防止无界收集撑爆内存；缺省不设 = 收集全部。 */
  maxOutputBytes?: number;
}

/** spawn 本身失败时携带的错误信息。 */
export interface SpawnError {
  /** Node errno code（如 'ENOENT'），可能不存在。 */
  code?: string;
  /** 原始错误消息。 */
  message: string;
}

/** runCommand 结构化结果（从不抛异常）。 */
export interface RunOutcome {
  /** 退出码；超时或 spawn 失败时为 -1。 */
  exitCode: number;
  /** 解码后的标准输出（超时或 spawn 失败时为空串）。 */
  stdout: string;
  /** 解码后的标准错误（超时或 spawn 失败时为空串）。 */
  stderr: string;
  /** 子进程 PID；spawn 失败时为 -1。 */
  pid: number;
  /** 从发起到结束的耗时毫秒。 */
  duration: number;
  /** 是否因超时被终止。 */
  timedOut: boolean;
  /** 信号终止时携带的信号名（如 'SIGTERM'）；正常退出为 null。 */
  signal: string | null;
  /** stdout 是否被 maxOutputBytes 预算截断（未设预算时为 false）。 */
  stdoutTruncated: boolean;
  /** stderr 是否被 maxOutputBytes 预算截断（未设预算时为 false）。 */
  stderrTruncated: boolean;
  /** spawn 本身失败（如命令不存在、cwd 无效）时存在。 */
  spawnError?: SpawnError;
}

/**
 * 终止 child 的整个进程树。
 *
 * Windows 上 `child.kill` 只杀 shell（cmd.exe）本身，子进程仍持有 stdio pipe；
 * 必须用 `taskkill /T /F` 杀整棵树。等待 taskkill 退出后再 resolve——超时语义
 * 要求「已杀完」而非「已发起」（对齐 process_kill 的 killWindowsProcess）。
 * unix 直接 SIGKILL（同步生效）。
 */
async function killProcessTree(child: ChildProcess): Promise<void> {
  if (child.pid === undefined) return;
  if (IS_WIN) {
    await new Promise<void>((resolve) => {
      // 兜底定时器：taskkill 极端情况下不退出时也不让 runCommand 永久挂起
      const fallback = setTimeout(resolve, 3000);
      const proc = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        shell: true,
        windowsHide: true,
      });
      proc.on('exit', () => {
        clearTimeout(fallback);
        resolve();
      });
      proc.on('error', () => {
        clearTimeout(fallback);
        resolve();
      });
    });
  } else {
    try {
      child.kill('SIGKILL');
    } catch {
      // 忽略 kill 错误
    }
  }
}

/**
 * 输出字节预算收集器。
 *
 * 设置 maxOutputBytes 时按流独立保留前缀、丢弃超限后续字节并标记截断
 * （尾截不整块丢弃，避免块边界丢失全部数据）；未设预算时原样收集全部。
 */
interface StreamAcc {
  chunks: Buffer[];
  total: number;
  truncated: boolean;
}

function makeStreamHandler(
  acc: StreamAcc,
  maxOutputBytes: number | undefined,
): (chunk: Buffer) => void {
  return (chunk: Buffer): void => {
    if (maxOutputBytes === undefined) {
      acc.chunks.push(chunk);
      return;
    }
    const remaining = maxOutputBytes - acc.total;
    if (remaining <= 0) {
      acc.truncated = true;
      return;
    }
    const slice = chunk.length > remaining ? chunk.subarray(0, remaining) : chunk;
    acc.total += slice.length;
    if (slice.length < chunk.length) acc.truncated = true;
    acc.chunks.push(slice);
  };
}

/**
 * 执行一条命令，返回结构化结果；从不抛异常。
 *
 * 机器：spawn → 收集 stdout/stderr → （可选）超时杀进程树 → settle 一次。
 * 超时立即结算（不等待 close 事件），避免 Windows 上子进程持有 pipe 导致
 * close 永不触发的挂起。
 *
 * @param file 可执行文件或命令名
 * @param args 参数数组
 * @param opts 执行选项
 * @returns 结构化执行结果
 */
export function runCommand(
  file: string,
  args: string[],
  opts: RunOptions = {},
): Promise<RunOutcome> {
  const { cwd, env, timeoutMs, encoding, shell = false, windowsHide = true, stdin, maxOutputBytes } = opts;
  const start = Date.now();

  return new Promise<RunOutcome>((resolve) => {
    let child: ChildProcess;
    try {
      child = spawn(file, args, {
        cwd,
        env,
        shell,
        windowsHide,
        stdio: stdin !== undefined ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      resolve({
        exitCode: -1,
        stdout: '',
        stderr: '',
        pid: -1,
        duration: 0,
        timedOut: false,
        signal: null,
        stdoutTruncated: false,
        stderrTruncated: false,
        spawnError: { message: err instanceof Error ? err.message : String(err) },
      });
      return;
    }

    if (stdin !== undefined && child.stdin) {
      child.stdin.on('error', () => {
        // 忽略 stdin 写入错误（子进程可能已退出）
      });
      child.stdin.write(stdin);
      child.stdin.end();
    }

    const stdoutAcc: StreamAcc = { chunks: [], total: 0, truncated: false };
    const stderrAcc: StreamAcc = { chunks: [], total: 0, truncated: false };
    let settled = false;
    let timedOut = false;
    let timer: NodeJS.Timeout | null = null;

    const settle = (outcome: RunOutcome): void => {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      resolve(outcome);
    };

    if (timeoutMs !== undefined) {
      timer = setTimeout(() => {
        timedOut = true;
        // 先杀完整棵进程树再结算：超时返回语义是「已终止」，不是「已发起终止」
        void killProcessTree(child).then(() => {
          settle({
            exitCode: -1,
            stdout: '',
            stderr: '',
            pid: child.pid ?? -1,
            duration: Date.now() - start,
            timedOut: true,
            signal: null,
            stdoutTruncated: false,
            stderrTruncated: false,
          });
        });
      }, timeoutMs);
    }

    child.stdout?.on('data', makeStreamHandler(stdoutAcc, maxOutputBytes));
    child.stderr?.on('data', makeStreamHandler(stderrAcc, maxOutputBytes));

    // spawn 本身失败（如命令不存在、cwd 无效）
    child.on('error', (err) => {
      const e = err as NodeJS.ErrnoException;
      settle({
        exitCode: -1,
        stdout: '',
        stderr: '',
        pid: child.pid ?? -1,
        duration: Date.now() - start,
        timedOut: false,
        signal: null,
        stdoutTruncated: false,
        stderrTruncated: false,
        spawnError: { code: e.code, message: err.message },
      });
    });

    child.on('close', (code, signal) => {
      const stdout = decodeBuffer(Buffer.concat(stdoutAcc.chunks), encoding);
      const stderr = decodeBuffer(Buffer.concat(stderrAcc.chunks), encoding);
      settle({
        // 超时语义优先：树杀引发的 close（Windows 强杀 code 可为 1）不得覆盖 -1
        exitCode: timedOut ? -1 : code ?? -1,
        stdout,
        stderr,
        pid: child.pid ?? -1,
        duration: Date.now() - start,
        timedOut,
        signal: signal ?? null,
        stdoutTruncated: stdoutAcc.truncated,
        stderrTruncated: stderrAcc.truncated,
      });
    });
  });
}
