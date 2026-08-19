/**
 * core 域测试（工单 02）：pwd / echo。
 */

import { describe, it, expect } from 'vitest';
import { callTool } from '../../src/server.js';
import { isOk, isFail } from '../../src/contract/output.js';

describe('pwd', () => {
  it('返回 cwd 绝对路径', async () => {
    const r = await callTool('pwd', {});
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(typeof r['cwd']).toBe('string');
      expect(r['cwd']).toBeDefined();
    }
  });
});

describe('echo', () => {
  it('text 格式空格拼接', async () => {
    const r = await callTool('echo', { args: ['hello', 'world'] });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r['output']).toBe('hello world');
  });

  it('json 格式返回原始数组', async () => {
    const r = await callTool('echo', { args: ['a', 'b'], format: 'json' });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r['args']).toEqual(['a', 'b']);
  });

  it('args 非数组返回结构化错误', async () => {
    const r = await callTool('echo', { args: 'notarray' });
    expect(isFail(r)).toBe(true);
    if (isFail(r)) expect(r.error.code).toBe('EINVAL');
  });

  it('缺省 args 报错', async () => {
    const r = await callTool('echo', {});
    expect(isFail(r)).toBe(true);
  });
});
