/**
 * run_command 测试（工单 03）。
 */

import { describe, it, expect } from 'vitest';
import { callTool } from '../../src/server.js';
import { isOk, isFail } from '../../src/contract/output.js';

describe('run_command', () => {
  it('执行命令返回 stdout 与退出码', async () => {
    const r = await callTool('run_command', {
      command: 'node',
      args: ['-e', 'console.log("hi-from-rc")'],
    });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r['exitCode']).toBe(0);
      expect(r['stdout']).toContain('hi-from-rc');
    }
  });

  it('非零退出码仍属成功返回', async () => {
    const r = await callTool('run_command', {
      command: 'node',
      args: ['-e', 'process.exit(3)'],
    });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r['exitCode']).toBe(3);
  });

  it('缺少 command 参数返回 EINVAL', async () => {
    const r = await callTool('run_command', {});
    expect(isFail(r)).toBe(true);
    if (isFail(r)) expect(r.error.code).toBe('EINVAL');
  });

  it('不存在的命令返回结构化错误', async () => {
    const r = await callTool('run_command', { command: 'this_command_does_not_exist_xyz' });
    expect(isFail(r)).toBe(true);
  });

  it('支持 gbk 编码输出', async () => {
    const r = await callTool('run_command', {
      command: 'node',
      args: ['-e', 'process.stdout.write(Buffer.from([0xd6,0xd0,0xce,0xc4]))'], // "中文" GBK
      encoding: 'gbk',
    });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r['stdout']).toBe('中文');
  });

  it('超时返回结构化 EXEC_TIMEOUT', async () => {
    const r = await callTool('run_command', {
      command: 'node',
      args: ['-e', 'setTimeout(()=>{},60000)'],
      timeoutMs: 300,
    });
    expect(isFail(r)).toBe(true);
    if (isFail(r)) expect(r.error.code).toBe('EXEC_TIMEOUT');
  });
});
