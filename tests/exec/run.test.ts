/**
 * 命令执行深模块机器级测试（工单 20-01）。
 *
 * 深模块接口：runCommand(file, args, opts) → RunOutcome，从不抛异常。
 * 机器级钉死：maxOutputBytes 逐流截断标记、signal 携带、超时进程树杀。
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCommand } from '../../src/exec/run.js';

/** 轮询等待进程退出。 */
async function waitForExit(pid: number, timeoutMs = 5000): Promise<boolean> {
  const start = Date.now();
  return new Promise<boolean>((resolve) => {
    const poll = (): void => {
      if (Date.now() - start > timeoutMs) return resolve(false);
      try {
        process.kill(pid, 0);
        setTimeout(poll, 50);
      } catch {
        resolve(true);
      }
    };
    poll();
  });
}

/** 轮询等待文件出现（读取首行数字）。 */
async function waitForPidFile(file: string, timeoutMs = 3000): Promise<number> {
  const start = Date.now();
  return new Promise<number>((resolve) => {
    const poll = (): void => {
      if (Date.now() - start > timeoutMs) return resolve(-1);
      if (existsSync(file)) {
        resolve(Number(readFileSync(file, 'utf8').trim()));
        return;
      }
      setTimeout(poll, 50);
    };
    poll();
  });
}

describe('runCommand 基本执行', () => {
  it('返回 stdout/exitCode，signal 为 null', async () => {
    const out = await runCommand('node', ['-e', 'process.stdout.write("hello")']);
    expect(out.spawnError).toBeUndefined();
    expect(out.exitCode).toBe(0);
    expect(out.stdout).toBe('hello');
    expect(out.signal).toBeNull();
    expect(out.stdoutTruncated).toBe(false);
    expect(out.stderrTruncated).toBe(false);
    expect(out.timedOut).toBe(false);
  });

  it('spawn 失败返回 spawnError 而不抛异常', async () => {
    const out = await runCommand('this_command_does_not_exist_xyz', []);
    expect(out.spawnError).toBeDefined();
    expect(out.exitCode).toBe(-1);
  });

  it('支持 stdin 写入', async () => {
    const out = await runCommand(
      'node',
      [
        '-e',
        'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>process.stdout.write(s.toUpperCase()))',
      ],
      { stdin: 'hi' },
    );
    expect(out.stdout).toBe('HI');
  });
});

describe('runCommand maxOutputBytes 字节预算', () => {
  it('超预算按前缀截断并标记 stdoutTruncated', async () => {
    const out = await runCommand('node', ['-e', 'process.stdout.write("x".repeat(10000))'], {
      maxOutputBytes: 100,
    });
    expect(out.exitCode).toBe(0);
    expect(out.stdoutTruncated).toBe(true);
    expect(out.stdout.length).toBeLessThanOrEqual(100);
  });

  it('预算内不标记截断', async () => {
    const out = await runCommand('node', ['-e', 'process.stdout.write("hi")'], {
      maxOutputBytes: 100,
    });
    expect(out.stdoutTruncated).toBe(false);
    expect(out.stdout).toBe('hi');
  });

  it('未设预算时收集全部且不标记', async () => {
    const out = await runCommand('node', ['-e', 'process.stdout.write("x".repeat(5000))']);
    expect(out.stdoutTruncated).toBe(false);
    expect(out.stdout.length).toBe(5000);
  });
});

describe('runCommand 超时进程树杀', () => {
  it('超时后整棵进程树被终止（含子进程），返回 timedOut=true', async () => {
    // runCommand 的子进程 spawn 一个孙进程并经临时文件上报其 pid，随后双方长睡。
    // 树杀只对 runCommand 的进程树生效，因此孙进程必须在该树内才能验证「杀整棵树」。
    const tmp = mkdtempSync(join(tmpdir(), 'ws-run-tree-'));
    const pidFile = join(tmp, 'grandchild.pid');
    const script =
      `const{spawn}=require('child_process');const fs=require('fs');` +
      `const c=spawn('node',['-e','setTimeout(()=>{},60000)'],{stdio:'ignore'});` +
      `fs.writeFileSync(${JSON.stringify(pidFile)},String(c.pid));` +
      `setTimeout(()=>{},60000)`;
    try {
      const out = await runCommand('node', ['-e', script], { timeoutMs: 300 });
      expect(out.timedOut).toBe(true);
      expect(out.exitCode).toBe(-1);

      // 进程树杀：孙进程必须一并退出（超时后无残留）
      const childPid = await waitForPidFile(pidFile);
      expect(childPid).toBeGreaterThan(0);
      const childExited = await waitForExit(childPid, 5000);
      expect(childExited).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
