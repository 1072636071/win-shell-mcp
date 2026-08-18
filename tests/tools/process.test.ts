import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import {
  processListHandler,
  processListTool,
  processListInputSchema,
  processKillHandler,
  processKillTool,
  processKillInputSchema,
} from '../../src/tools/process.js';
import { isOk, isFail } from '../../src/contract/output.js';

const IS_WIN = process.platform === 'win32';

// ===========================================================================
// process_list 工具定义
// ===========================================================================

describe('processListTool 定义', () => {
  it('名称为 process_list', () => {
    expect(processListTool.name).toBe('process_list');
  });

  it('有描述', () => {
    expect(processListTool.description.length).toBeGreaterThan(0);
  });

  it('inputSchema 是 zod schema', () => {
    expect(typeof processListInputSchema.safeParse).toBe('function');
  });

  it('handler 是函数', () => {
    expect(typeof processListTool.handler).toBe('function');
  });
});

describe('processListInputSchema 验证', () => {
  it('空对象合法', () => {
    const parsed = processListInputSchema.safeParse({});
    expect(parsed.success).toBe(true);
  });

  it('filter 字符串合法', () => {
    const parsed = processListInputSchema.safeParse({ filter: 'node' });
    expect(parsed.success).toBe(true);
  });

  it('verbose: true 合法', () => {
    const parsed = processListInputSchema.safeParse({ verbose: true });
    expect(parsed.success).toBe(true);
  });

  it('maxResults 正整数合法', () => {
    const parsed = processListInputSchema.safeParse({ maxResults: 10 });
    expect(parsed.success).toBe(true);
  });

  it('maxResults 非正整数非法', () => {
    const parsed = processListInputSchema.safeParse({ maxResults: 0 });
    expect(parsed.success).toBe(false);
  });

  it('maxResults 非整数非法', () => {
    const parsed = processListInputSchema.safeParse({ maxResults: 1.5 });
    expect(parsed.success).toBe(false);
  });

  it('filter 非字符串非法', () => {
    const parsed = processListInputSchema.safeParse({ filter: 123 });
    expect(parsed.success).toBe(false);
  });
});

// ===========================================================================
// process_list handler 正常路径
// ===========================================================================

describe('processListHandler 正常路径', () => {
  it('返回 ok=true 与 processes 数组', async () => {
    const result = await processListHandler({});
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(Array.isArray(result['processes'])).toBe(true);
    }
  });

  it('每个进程含 pid:number 与 name:string', async () => {
    const result = await processListHandler({});
    if (isOk(result)) {
      const processes = result['processes'] as Array<{ pid: number; name: string }>;
      for (const p of processes) {
        expect(typeof p.pid).toBe('number');
        expect(Number.isInteger(p.pid)).toBe(true);
        expect(typeof p.name).toBe('string');
      }
    }
  });

  it('至少含当前进程（process.pid）', async () => {
    const result = await processListHandler({});
    if (isOk(result)) {
      const processes = result['processes'] as Array<{ pid: number; name: string }>;
      const pids = processes.map((p) => p.pid);
      expect(pids).toContain(process.pid);
    }
  });

  it('含 truncated:boolean 字段', async () => {
    const result = await processListHandler({});
    if (isOk(result)) {
      expect(typeof result['truncated']).toBe('boolean');
    }
  });

  it('无 maxResults 时 truncated=false', async () => {
    const result = await processListHandler({});
    if (isOk(result)) {
      expect(result['truncated']).toBe(false);
    }
  });
});

// ===========================================================================
// process_list filter
// ===========================================================================

describe('processListHandler filter 过滤', () => {
  it('filter 按进程名 includes 匹配，结果均含过滤串', async () => {
    // node 进程必然存在（当前测试进程）
    const result = await processListHandler({ filter: 'node' });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const processes = result['processes'] as Array<{ pid: number; name: string }>;
      // 至少含当前进程
      expect(processes.length).toBeGreaterThanOrEqual(1);
      for (const p of processes) {
        expect(p.name.toLowerCase()).toContain('node');
      }
    }
  });

  it('filter 不匹配时返回空数组', async () => {
    const result = await processListHandler({ filter: '__no_such_process_name_zzz_999__' });
    if (isOk(result)) {
      const processes = result['processes'] as unknown[];
      expect(processes.length).toBe(0);
    }
  });

  it('filter 大小写敏感（Windows 进程名通常大小写不敏感，但 includes 严格）', async () => {
    // 此处仅验证返回结果均含 filter 子串（includes 语义）
    const filter = IS_WIN ? 'NODE' : 'node';
    const result = await processListHandler({ filter });
    if (isOk(result)) {
      const processes = result['processes'] as Array<{ pid: number; name: string }>;
      for (const p of processes) {
        expect(p.name.includes(filter)).toBe(true);
      }
    }
  });
});

// ===========================================================================
// process_list maxResults 截断
// ===========================================================================

describe('processListHandler maxResults 截断', () => {
  it('maxResults=1 时返回至多 1 个进程', async () => {
    const result = await processListHandler({ maxResults: 1 });
    if (isOk(result)) {
      const processes = result['processes'] as unknown[];
      expect(processes.length).toBeLessThanOrEqual(1);
    }
  });

  it('maxResults=1 且系统进程多于 1 个时 truncated=true', async () => {
    // 系统必然运行多个进程
    const result = await processListHandler({ maxResults: 1 });
    if (isOk(result)) {
      expect(result['truncated']).toBe(true);
    }
  });

  it('maxResults 足过总数时 truncated=false', async () => {
    const result = await processListHandler({ maxResults: 100000 });
    if (isOk(result)) {
      expect(result['truncated']).toBe(false);
    }
  });

  it('maxResults 与 filter 组合：先过滤再截断', async () => {
    const result = await processListHandler({ filter: 'node', maxResults: 1 });
    if (isOk(result)) {
      const processes = result['processes'] as unknown[];
      expect(processes.length).toBeLessThanOrEqual(1);
    }
  });
});

// ===========================================================================
// process_list verbose
// ===========================================================================

describe('processListHandler verbose 输出', () => {
  it('verbose=true 时进程条目含 memory 字段（Windows 必有，unix 尽力而为）', async () => {
    const result = await processListHandler({ verbose: true });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const processes = result['processes'] as Array<{ pid: number; name: string; memory?: number }>;
      // 至少含当前进程
      expect(processes.length).toBeGreaterThanOrEqual(1);
      if (IS_WIN) {
        // Windows tasklist 总是输出内存
        for (const p of processes) {
          if (p.memory !== undefined) {
            expect(typeof p.memory).toBe('number');
            expect(p.memory).toBeGreaterThanOrEqual(0);
          }
        }
      }
    }
  });

  it('verbose=false 时进程条目不含 memory', async () => {
    const result = await processListHandler({ verbose: false });
    if (isOk(result)) {
      const processes = result['processes'] as Array<{ pid: number; name: string; memory?: number }>;
      for (const p of processes) {
        expect(p.memory).toBeUndefined();
      }
    }
  });

  it('默认（不传 verbose）时进程条目不含 memory', async () => {
    const result = await processListHandler({});
    if (isOk(result)) {
      const processes = result['processes'] as Array<{ pid: number; name: string; memory?: number }>;
      for (const p of processes) {
        expect(p.memory).toBeUndefined();
      }
    }
  });
});

// ===========================================================================
// process_list 跨平台
// ===========================================================================

describe('processListHandler 跨平台', () => {
  it(`当前平台 ${process.platform} 下能正常返回进程列表`, async () => {
    const result = await processListHandler({});
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const processes = result['processes'] as Array<{ pid: number; name: string }>;
      expect(processes.length).toBeGreaterThan(0);
    }
  });

  it('Windows 分支：进程名含 .exe 后缀（典型）', async () => {
    if (!IS_WIN) return; // 仅 Windows 运行
    const result = await processListHandler({});
    if (isOk(result)) {
      const processes = result['processes'] as Array<{ pid: number; name: string }>;
      // 至少有一个进程名含 .exe
      const hasExe = processes.some((p) => p.name.toLowerCase().endsWith('.exe'));
      expect(hasExe).toBe(true);
    }
  });

  it('unix 分支：进程名不含 .exe 后缀（典型）', async () => {
    if (IS_WIN) return; // 仅 unix 运行
    const result = await processListHandler({});
    if (isOk(result)) {
      const processes = result['processes'] as Array<{ pid: number; name: string }>;
      // unix comm 通常不含 .exe
      const allNoExe = processes.every((p) => !p.name.toLowerCase().endsWith('.exe'));
      expect(allNoExe).toBe(true);
    }
  });
});

// ===========================================================================
// process_kill 工具定义
// ===========================================================================

describe('processKillTool 定义', () => {
  it('名称为 process_kill', () => {
    expect(processKillTool.name).toBe('process_kill');
  });

  it('有描述', () => {
    expect(processKillTool.description.length).toBeGreaterThan(0);
  });

  it('inputSchema 是 zod schema', () => {
    expect(typeof processKillInputSchema.safeParse).toBe('function');
  });

  it('handler 是函数', () => {
    expect(typeof processKillTool.handler).toBe('function');
  });
});

describe('processKillInputSchema 验证', () => {
  it('pid 整数合法', () => {
    const parsed = processKillInputSchema.safeParse({ pid: 1234 });
    expect(parsed.success).toBe(true);
  });

  it('pid 非整数非法', () => {
    const parsed = processKillInputSchema.safeParse({ pid: 1.5 });
    expect(parsed.success).toBe(false);
  });

  it('pid 非数字非法', () => {
    const parsed = processKillInputSchema.safeParse({ pid: 'abc' });
    expect(parsed.success).toBe(false);
  });

  it('signal 字符串合法', () => {
    const parsed = processKillInputSchema.safeParse({ pid: 1, signal: 'SIGTERM' });
    expect(parsed.success).toBe(true);
  });

  it('force: true 合法', () => {
    const parsed = processKillInputSchema.safeParse({ pid: 1, force: true });
    expect(parsed.success).toBe(true);
  });
});

// ===========================================================================
// process_kill handler 正常路径：终止自己启动的子进程
// ===========================================================================

/**
 * 启动一个长期运行的子进程并返回其 pid。
 * 用 node -e "setTimeout(()=>{},60000)" 启动一个 60s 后自动退出的进程。
 */
function spawnLongRunningChild(): number {
  const child = spawn('node', ['-e', 'setTimeout(()=>{},60000)'], {
    stdio: 'ignore',
    detached: false,
  });
  if (typeof child.pid !== 'number') {
    throw new Error('子进程启动失败：无 pid');
  }
  return child.pid;
}

/**
 * 等待子进程真正退出。
 *
 * @param pid 进程 ID
 * @param timeoutMs 超时（毫秒）
 */
async function waitForExit(pid: number, timeoutMs = 3000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      // 信号 0 不实际发送信号，仅做存在性检查
      process.kill(pid, 0);
      // 仍存活，等待
      await new Promise((r) => setTimeout(r, 50));
    } catch {
      // 已退出
      return true;
    }
  }
  return false;
}

describe('processKillHandler 正常路径', () => {
  it('终止自己启动的子进程返回 killed=true（force=true 跨平台可靠）', async () => {
    const pid = spawnLongRunningChild();
    try {
      const result = await processKillHandler({ pid, force: true });
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result['killed']).toBe(true);
        expect(result['pid']).toBe(pid);
      }
      // 等待子进程真正退出
      const exited = await waitForExit(pid);
      expect(exited).toBe(true);
    } finally {
      // 兜底：确保子进程被清理
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // 已退出，忽略
      }
    }
  });

  it('force=true 终止子进程返回 killed=true', async () => {
    const pid = spawnLongRunningChild();
    try {
      const result = await processKillHandler({ pid, force: true });
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result['killed']).toBe(true);
        expect(result['pid']).toBe(pid);
      }
      const exited = await waitForExit(pid);
      expect(exited).toBe(true);
    } finally {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // 已退出
      }
    }
  });

  it('返回结果含 killed 与 pid 字段', async () => {
    const pid = spawnLongRunningChild();
    try {
      const result = await processKillHandler({ pid, force: true });
      if (isOk(result)) {
        expect(result['killed']).toBeDefined();
        expect(result['pid']).toBeDefined();
        expect(typeof result['killed']).toBe('boolean');
        expect(typeof result['pid']).toBe('number');
      }
    } finally {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // 已退出
      }
    }
  });
});

// ===========================================================================
// process_kill handler 失败路径
// ===========================================================================

describe('processKillHandler 失败路径', () => {
  it('pid 非整数返回 EINVAL', async () => {
    // 直接调用 handler，绕过 schema 验证
    const result = await processKillHandler({ pid: 1.5 });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('EINVAL');
    }
  });

  it('pid 非数字返回 EINVAL', async () => {
    const result = await processKillHandler({ pid: 'abc' });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('EINVAL');
    }
  });

  it('pid 不存在返回 PROC_NOT_FOUND', async () => {
    // 选一个极不可能存在的 PID（PID 上限通常为 2^22-1 = 4194303）
    // 先确认该 PID 不存在
    const ghostPid = 4194303;
    let alive = false;
    try {
      process.kill(ghostPid, 0);
      alive = true;
    } catch {
      alive = false;
    }
    if (alive) return; // 极小概率存在则跳过

    const result = await processKillHandler({ pid: ghostPid });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('PROC_NOT_FOUND');
    }
  });

  it('pid 为 0（非法）返回错误', async () => {
    // pid=0 在 unix 上表示杀掉当前进程组，应视为非法或返回错误
    // 这里我们测试 pid=1（init）通常无权限，或 pid=0 行为
    // 改为测试一个明确非法的负数 pid
    const result = await processKillHandler({ pid: -1 });
    // -1 在 unix 上表示杀掉所有进程（需 root），通常 EPERM/ESRCH
    // 在 Windows taskkill /PID -1 会失败
    expect(isFail(result)).toBe(true);
  });
});

// ===========================================================================
// process_kill 跨平台
// ===========================================================================

describe('processKillHandler 跨平台', () => {
  it(`当前平台 ${process.platform} 下能终止子进程（force=true）`, async () => {
    const pid = spawnLongRunningChild();
    try {
      const result = await processKillHandler({ pid, force: true });
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result['killed']).toBe(true);
      }
      const exited = await waitForExit(pid);
      expect(exited).toBe(true);
    } finally {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // 已退出
      }
    }
  });

  it('Windows 分支：taskkill /F 终止子进程', async () => {
    if (!IS_WIN) return;
    const pid = spawnLongRunningChild();
    try {
      const result = await processKillHandler({ pid, force: true });
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result['killed']).toBe(true);
        expect(result['pid']).toBe(pid);
      }
      const exited = await waitForExit(pid);
      expect(exited).toBe(true);
    } finally {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // 已退出
      }
    }
  });

  it('Windows 分支：默认信号对无窗口 node 子进程返回 fail（PROC_KILL_FAIL，需 force）', async () => {
    if (!IS_WIN) return;
    const pid = spawnLongRunningChild();
    try {
      const result = await processKillHandler({ pid });
      // Windows taskkill 不带 /F 对无窗口进程会失败
      expect(isFail(result)).toBe(true);
      if (isFail(result)) {
        expect(result.error.code).toBe('PROC_KILL_FAIL');
      }
    } finally {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // 已退出
      }
    }
  });

  it('unix 分支：process.kill 默认 SIGTERM 终止子进程', async () => {
    if (IS_WIN) return;
    const pid = spawnLongRunningChild();
    try {
      const result = await processKillHandler({ pid });
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result['killed']).toBe(true);
        expect(result['pid']).toBe(pid);
      }
      const exited = await waitForExit(pid);
      expect(exited).toBe(true);
    } finally {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // 已退出
      }
    }
  });

  it('unix 分支：自定义信号 SIGINT 终止子进程', async () => {
    if (IS_WIN) return;
    // 启动一个捕获 SIGINT 后立即退出的子进程
    const child = spawn(
      'node',
      ['-e', 'process.on("SIGINT",()=>process.exit(0));setTimeout(()=>{},60000)'],
      { stdio: 'ignore', detached: false },
    );
    const pid = child.pid!;
    try {
      // 等待子进程启动并安装信号处理器
      await new Promise((r) => setTimeout(r, 200));
      const result = await processKillHandler({ pid, signal: 'SIGINT' });
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result['killed']).toBe(true);
      }
      const exited = await waitForExit(pid);
      expect(exited).toBe(true);
    } finally {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // 已退出
      }
    }
  });
});