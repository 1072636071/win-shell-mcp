import { describe, it, expect } from 'vitest';
import {
  ok,
  fail,
  truncate,
  withVerbose,
  isOk,
  isFail,
  DEFAULT_TRUNCATE_LIMIT,
  type AnyToolResult,
} from '../../src/contract/output.js';

describe('ok', () => {
  it('构造成功结果，data 展开到顶层', () => {
    const result = ok({ os: 'linux', arch: 'x64' });
    expect(result.ok).toBe(true);
    expect(result['os']).toBe('linux');
    expect(result['arch']).toBe('x64');
  });

  it('空对象成功结果', () => {
    const result = ok({});
    expect(result.ok).toBe(true);
  });

  it('嵌套对象数据', () => {
    const result = ok({ data: { inner: 1 } });
    expect(result.ok).toBe(true);
    expect(result['data']).toEqual({ inner: 1 });
  });
});

describe('fail', () => {
  it('构造失败结果', () => {
    const result = fail('ENOENT', 'file not found');
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('ENOENT');
    expect(result.error.message).toBe('file not found');
  });

  it('不同错误码', () => {
    const result = fail('EACCES', 'permission denied');
    expect(result.error.code).toBe('EACCES');
  });
});

describe('truncate', () => {
  it('短文本不截断', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('恰好等于 maxLen 不截断', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });

  it('超长文本截断并附标记', () => {
    const result = truncate('hello', 3);
    expect(result).toBe('hel...[truncated, 2 more chars]');
  });

  it('默认 maxLen 为 2000', () => {
    const short = 'a'.repeat(2000);
    expect(truncate(short)).toBe(short);
    const long = 'a'.repeat(2500);
    const truncated = truncate(long);
    expect(truncated.startsWith('a'.repeat(2000))).toBe(true);
    expect(truncated).toContain('...[truncated, 500 more chars]');
  });

  it('空字符串', () => {
    expect(truncate('', 10)).toBe('');
  });

  it('maxLen 为 0', () => {
    const result = truncate('abc', 0);
    expect(result).toBe('...[truncated, 3 more chars]');
  });
});

describe('withVerbose', () => {
  it('verbose=false 返回极简', () => {
    const minimal = { a: 1 };
    const full = { a: 1, b: 2 };
    expect(withVerbose(minimal, full, false)).toBe(minimal);
  });

  it('verbose=true 返回完整', () => {
    const minimal = { a: 1 };
    const full = { a: 1, b: 2 };
    expect(withVerbose(minimal, full, true)).toBe(full);
  });

  it('不同类型 minimal 与 full', () => {
    const minimal = 'short';
    const full = { detailed: true };
    expect(withVerbose(minimal, full, false)).toBe('short');
    expect(withVerbose(minimal, full, true)).toEqual({ detailed: true });
  });
});

describe('isOk / isFail', () => {
  it('isOk 识别成功', () => {
    const result: AnyToolResult = ok({ x: 1 });
    expect(isOk(result)).toBe(true);
    expect(isFail(result)).toBe(false);
  });

  it('isFail 识别失败', () => {
    const result: AnyToolResult = fail('EINVAL', 'bad');
    expect(isFail(result)).toBe(true);
    expect(isOk(result)).toBe(false);
  });

  it('isOk 收窄类型允许访问字段', () => {
    const result: AnyToolResult = ok({ count: 42 });
    if (isOk(result)) {
      expect(result['count']).toBe(42);
    }
  });
});

describe('DEFAULT_TRUNCATE_LIMIT', () => {
  it('默认截断限制为 2000', () => {
    expect(DEFAULT_TRUNCATE_LIMIT).toBe(2000);
  });
});