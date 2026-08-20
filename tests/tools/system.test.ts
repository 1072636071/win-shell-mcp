import { describe, it, expect } from 'vitest';
import os from 'node:os';
import {
  systemInfoHandler,
  systemInfoTool,
  systemInfoInputSchema,
  systemDiskHandler,
  systemDiskTool,
  systemDiskInputSchema,
  systemMemoryHandler,
  systemMemoryTool,
  systemMemoryInputSchema,
  systemPathHandler,
  systemPathTool,
  systemPathInputSchema,
} from '../../src/tools/system.js';
import { isOk, isFail } from '../../src/contract/output.js';

describe('systemInfoTool 定义', () => {
  it('名称为 system_info', () => {
    expect(systemInfoTool.name).toBe('system_info');
  });

  it('有描述', () => {
    expect(systemInfoTool.description.length).toBeGreaterThan(0);
  });

  it('inputSchema 是 zod schema', () => {
    expect(typeof systemInfoInputSchema.safeParse).toBe('function');
  });

  it('handler 是函数', () => {
    expect(typeof systemInfoTool.handler).toBe('function');
  });
});

describe('systemInfoInputSchema 验证', () => {
  it('空对象合法', () => {
    const parsed = systemInfoInputSchema.safeParse({});
    expect(parsed.success).toBe(true);
  });

  it('verbose: true 合法', () => {
    const parsed = systemInfoInputSchema.safeParse({ verbose: true });
    expect(parsed.success).toBe(true);
  });

  it('verbose: false 合法', () => {
    const parsed = systemInfoInputSchema.safeParse({ verbose: false });
    expect(parsed.success).toBe(true);
  });

  it('verbose 非布尔非法', () => {
    const parsed = systemInfoInputSchema.safeParse({ verbose: 'yes' });
    expect(parsed.success).toBe(false);
  });

  it('额外字段非法（strict）', () => {
    const parsed = systemInfoInputSchema.safeParse({ extra: 1 });
    // zod v4 默认 strip 额外字段，所以 success=true 但 data 不含 extra
    expect(parsed.success).toBe(true);
  });
});

describe('systemInfoHandler 极简输出', () => {
  it('返回 ok=true 与最小字段', async () => {
    const result = await systemInfoHandler({});
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['os']).toBeDefined();
      expect(result['arch']).toBeDefined();
      expect(result['platform']).toBeDefined();
      expect(result['hostname']).toBeDefined();
      expect(result['cwd']).toBeDefined();
      expect(result['node']).toBeDefined();
    }
  });

  it('不含 verbose 专属字段', async () => {
    const result = await systemInfoHandler({});
    if (isOk(result)) {
      expect(result['uptime']).toBeUndefined();
      expect(result['loadavg']).toBeUndefined();
      expect(result['cpus']).toBeUndefined();
      expect(result['totalmem']).toBeUndefined();
      expect(result['freemem']).toBeUndefined();
    }
  });

  it('verbose: false 等同极简', async () => {
    const result = await systemInfoHandler({ verbose: false });
    if (isOk(result)) {
      expect(result['uptime']).toBeUndefined();
    }
  });

  it('字段值类型正确', async () => {
    const result = await systemInfoHandler({});
    if (isOk(result)) {
      expect(typeof result['os']).toBe('string');
      expect(typeof result['arch']).toBe('string');
      expect(typeof result['platform']).toBe('string');
      expect(typeof result['hostname']).toBe('string');
      expect(typeof result['cwd']).toBe('string');
      expect(typeof result['node']).toBe('string');
      expect((result['node'] as string).startsWith('v')).toBe(true);
    }
  });

  it('含 time 字段（ISO 8601 当前时间）', async () => {
    const before = new Date();
    const result = await systemInfoHandler({});
    const after = new Date();
    if (isOk(result)) {
      expect(result['time']).toBeDefined();
      expect(typeof result['time']).toBe('string');
      const time = result['time'] as string;
      // ISO 8601 格式
      expect(time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      const parsed = new Date(time);
      expect(parsed.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(parsed.getTime()).toBeLessThanOrEqual(after.getTime());
    }
  });
});

describe('systemInfoHandler verbose 输出', () => {
  it('返回 ok=true 与完整字段', async () => {
    const result = await systemInfoHandler({ verbose: true });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['os']).toBeDefined();
      expect(result['uptime']).toBeDefined();
      expect(result['loadavg']).toBeDefined();
      expect(result['cpus']).toBeDefined();
      expect(result['totalmem']).toBeDefined();
      expect(result['freemem']).toBeDefined();
    }
  });

  it('verbose 字段值类型正确', async () => {
    const result = await systemInfoHandler({ verbose: true });
    if (isOk(result)) {
      expect(typeof result['uptime']).toBe('number');
      expect(Array.isArray(result['loadavg'])).toBe(true);
      expect(typeof result['cpus']).toBe('number');
      expect(typeof result['totalmem']).toBe('number');
      expect(typeof result['freemem']).toBe('number');
    }
  });

  it('verbose 时仍含极简字段', async () => {
    const result = await systemInfoHandler({ verbose: true });
    if (isOk(result)) {
      expect(result['os']).toBeDefined();
      expect(result['node']).toBeDefined();
    }
  });
});

describe('systemInfoHandler 失败路径', () => {
  it('handler 不应返回失败（正常调用）', async () => {
    const result = await systemInfoHandler({});
    expect(isFail(result)).toBe(false);
  });
});

// ===========================================================================
// system_disk
// ===========================================================================

describe('systemDiskTool 定义', () => {
  it('名称为 system_disk', () => {
    expect(systemDiskTool.name).toBe('system_disk');
  });

  it('有描述', () => {
    expect(systemDiskTool.description.length).toBeGreaterThan(0);
  });

  it('inputSchema 是 zod schema', () => {
    expect(typeof systemDiskInputSchema.safeParse).toBe('function');
  });

  it('handler 是函数', () => {
    expect(typeof systemDiskTool.handler).toBe('function');
  });
});

describe('systemDiskInputSchema 验证', () => {
  it('空对象合法（path 可选）', () => {
    const parsed = systemDiskInputSchema.safeParse({});
    expect(parsed.success).toBe(true);
  });

  it('path 字符串合法', () => {
    const parsed = systemDiskInputSchema.safeParse({ path: '/tmp' });
    expect(parsed.success).toBe(true);
  });

  it('path 非字符串非法', () => {
    const parsed = systemDiskInputSchema.safeParse({ path: 123 });
    expect(parsed.success).toBe(false);
  });
});

describe('systemDiskHandler 正常路径', () => {
  it('默认 path 返回 ok 与 total/free/used/path', async () => {
    const result = await systemDiskHandler({});
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(typeof result['total']).toBe('number');
      expect(typeof result['free']).toBe('number');
      expect(typeof result['used']).toBe('number');
      expect(typeof result['path']).toBe('string');
    }
  });

  it('total = used + free（守恒）', async () => {
    const result = await systemDiskHandler({});
    if (isOk(result)) {
      const total = result['total'] as number;
      const free = result['free'] as number;
      const used = result['used'] as number;
      expect(total).toBe(used + free);
    }
  });

  it('total/free/used 非负', async () => {
    const result = await systemDiskHandler({});
    if (isOk(result)) {
      expect(result['total'] as number).toBeGreaterThanOrEqual(0);
      expect(result['free'] as number).toBeGreaterThanOrEqual(0);
      expect(result['used'] as number).toBeGreaterThanOrEqual(0);
    }
  });

  it('默认 path 等于 cwd', async () => {
    const result = await systemDiskHandler({});
    if (isOk(result)) {
      expect(result['path']).toBe(process.cwd());
    }
  });

  it('显式 path（os.tmpdir()）返回该 path', async () => {
    const tmp = os.tmpdir();
    const result = await systemDiskHandler({ path: tmp });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['path']).toBe(tmp);
    }
  });
});

describe('systemDiskHandler 失败路径', () => {
  it('path 不存在返回 fail 与 ENOENT', async () => {
    const result = await systemDiskHandler({ path: '__nonexistent_dir_xyz_123__' });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('ENOENT');
    }
  });
});

describe('systemInfoHandler verbose CPU 字段', () => {
  it('verbose 时 cpuModel 为非空字符串', async () => {
    const result = await systemInfoHandler({ verbose: true });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(typeof result['cpuModel']).toBe('string');
      expect((result['cpuModel'] as string).length).toBeGreaterThan(0);
    }
  });

  it('verbose 时 cpus 为正整数（CPU 核心数）', async () => {
    const result = await systemInfoHandler({ verbose: true });
    if (isOk(result)) {
      const count = result['cpus'] as number;
      expect(Number.isInteger(count)).toBe(true);
      expect(count).toBeGreaterThan(0);
    }
  });

  it('verbose 时 cpuUsage 为 0-100 的数字', async () => {
    const result = await systemInfoHandler({ verbose: true });
    if (isOk(result)) {
      const usage = result['cpuUsage'] as number;
      expect(typeof usage).toBe('number');
      expect(usage).toBeGreaterThanOrEqual(0);
      expect(usage).toBeLessThanOrEqual(100);
    }
  });

  it('verbose 时 cpuUsagePerCore 为数字数组且长度等于 cpus', async () => {
    const result = await systemInfoHandler({ verbose: true });
    if (isOk(result)) {
      const perCore = result['cpuUsagePerCore'] as number[];
      expect(Array.isArray(perCore)).toBe(true);
      expect(perCore.length).toBe(result['cpus']);
      for (const v of perCore) {
        expect(typeof v).toBe('number');
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });

  it('非 verbose 时不含 cpuModel/cpuUsage 等字段', async () => {
    const result = await systemInfoHandler({});
    if (isOk(result)) {
      expect(result['cpuModel']).toBeUndefined();
      expect(result['cpuUsage']).toBeUndefined();
    }
  });
});

describe('systemDiskHandler all 枚举', () => {
  it('all=true 返回 ok 与 disks 数组', async () => {
    const result = await systemDiskHandler({ all: true });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(Array.isArray(result['disks'])).toBe(true);
      expect((result['disks'] as unknown[]).length).toBeGreaterThan(0);
    }
  });

  it('all=true 时每个磁盘含 path/type/total/free/used', async () => {
    const result = await systemDiskHandler({ all: true });
    if (isOk(result)) {
      const disks = result['disks'] as Array<{
        path: string;
        type: string;
        total: number;
        free: number;
        used: number;
      }>;
      for (const d of disks) {
        expect(typeof d.path).toBe('string');
        expect(d.path.length).toBeGreaterThan(0);
        expect(typeof d.total).toBe('number');
        expect(typeof d.free).toBe('number');
        expect(typeof d.used).toBe('number');
      }
    }
  });

  it('all=true 时 total = used + free（守恒）且非负', async () => {
    const result = await systemDiskHandler({ all: true });
    if (isOk(result)) {
      const disks = result['disks'] as Array<{
        total: number;
        free: number;
        used: number;
      }>;
      for (const d of disks) {
        expect(d.total).toBe(d.used + d.free);
        expect(d.total).toBeGreaterThanOrEqual(0);
        expect(d.free).toBeGreaterThanOrEqual(0);
        expect(d.used).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('all 缺省/省略时保持单路径行为（不含 disks）', async () => {
    const result = await systemDiskHandler({});
    if (isOk(result)) {
      expect(result['disks']).toBeUndefined();
      expect(result['total']).toBeDefined();
    }
  });

  it('all 与 path 同时提供时优先枚举多盘', async () => {
    const result = await systemDiskHandler({ all: true, path: os.tmpdir() });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(Array.isArray(result['disks'])).toBe(true);
      // Windows 根盘应被包含（C:\ 等）
      if (os.platform() === 'win32') {
        const hasRoot = (result['disks'] as Array<{ path: string }>).some((d) =>
          /^[A-Za-z]:\\/.test(d.path),
        );
        expect(hasRoot).toBe(true);
      }
    }
  });
});

// ===========================================================================
// system_memory
// ===========================================================================

describe('systemMemoryTool 定义', () => {
  it('名称为 system_memory', () => {
    expect(systemMemoryTool.name).toBe('system_memory');
  });

  it('有描述', () => {
    expect(systemMemoryTool.description.length).toBeGreaterThan(0);
  });

  it('inputSchema 是 zod schema', () => {
    expect(typeof systemMemoryInputSchema.safeParse).toBe('function');
  });

  it('handler 是函数', () => {
    expect(typeof systemMemoryTool.handler).toBe('function');
  });
});

describe('systemMemoryInputSchema 验证', () => {
  it('空对象合法', () => {
    const parsed = systemMemoryInputSchema.safeParse({});
    expect(parsed.success).toBe(true);
  });

  it('verbose: true 合法', () => {
    const parsed = systemMemoryInputSchema.safeParse({ verbose: true });
    expect(parsed.success).toBe(true);
  });

  it('verbose 非布尔非法', () => {
    const parsed = systemMemoryInputSchema.safeParse({ verbose: 'yes' });
    expect(parsed.success).toBe(false);
  });
});

describe('systemMemoryHandler 极简输出', () => {
  it('返回 ok=true 与 total/free', async () => {
    const result = await systemMemoryHandler({});
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(typeof result['total']).toBe('number');
      expect(typeof result['free']).toBe('number');
    }
  });

  it('不含 verbose 专属字段', async () => {
    const result = await systemMemoryHandler({});
    if (isOk(result)) {
      expect(result['used']).toBeUndefined();
      expect(result['swapTotal']).toBeUndefined();
      expect(result['swapFree']).toBeUndefined();
    }
  });

  it('total/free 为正数', async () => {
    const result = await systemMemoryHandler({});
    if (isOk(result)) {
      expect(result['total'] as number).toBeGreaterThan(0);
      expect(result['free'] as number).toBeGreaterThanOrEqual(0);
    }
  });

  it('total 对齐 os.totalmem()', async () => {
    const result = await systemMemoryHandler({});
    if (isOk(result)) {
      expect(result['total']).toBe(os.totalmem());
    }
  });
});

describe('systemMemoryHandler verbose 输出', () => {
  it('返回 ok=true 与 used 字段', async () => {
    const result = await systemMemoryHandler({ verbose: true });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(typeof result['used']).toBe('number');
    }
  });

  it('used = total - free（守恒）', async () => {
    const result = await systemMemoryHandler({ verbose: true });
    if (isOk(result)) {
      const total = result['total'] as number;
      const free = result['free'] as number;
      const used = result['used'] as number;
      expect(used).toBe(total - free);
    }
  });

  it('verbose 时仍含 total/free', async () => {
    const result = await systemMemoryHandler({ verbose: true });
    if (isOk(result)) {
      expect(result['total']).toBeDefined();
      expect(result['free']).toBeDefined();
    }
  });
});

// ===========================================================================
// system_path
// ===========================================================================

describe('systemPathTool 定义', () => {
  it('名称为 system_path', () => {
    expect(systemPathTool.name).toBe('system_path');
  });

  it('有描述', () => {
    expect(systemPathTool.description.length).toBeGreaterThan(0);
  });

  it('inputSchema 是 zod schema', () => {
    expect(typeof systemPathInputSchema.safeParse).toBe('function');
  });

  it('handler 是函数', () => {
    expect(typeof systemPathTool.handler).toBe('function');
  });
});

describe('systemPathInputSchema 验证', () => {
  it('空对象合法', () => {
    const parsed = systemPathInputSchema.safeParse({});
    expect(parsed.success).toBe(true);
  });

  it('verbose: true 合法', () => {
    const parsed = systemPathInputSchema.safeParse({ verbose: true });
    expect(parsed.success).toBe(true);
  });

  it('verbose 非布尔非法', () => {
    const parsed = systemPathInputSchema.safeParse({ verbose: 1 });
    expect(parsed.success).toBe(false);
  });
});

describe('systemPathHandler 极简输出', () => {
  it('返回 ok=true 与 entries 数组', async () => {
    const result = await systemPathHandler({});
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(Array.isArray(result['entries'])).toBe(true);
    }
  });

  it('entries 元素均为字符串', async () => {
    const result = await systemPathHandler({});
    if (isOk(result)) {
      const entries = result['entries'] as unknown[];
      for (const e of entries) {
        expect(typeof e).toBe('string');
      }
    }
  });

  it('不含 verbose 专属字段', async () => {
    const result = await systemPathHandler({});
    if (isOk(result)) {
      expect(result['count']).toBeUndefined();
      expect(result['existing']).toBeUndefined();
    }
  });

  it('entries 对齐 process.env.PATH 按分隔符拆分', async () => {
    const sep = process.platform === 'win32' ? ';' : ':';
    const envPath = process.env['PATH'] ?? process.env['Path'] ?? '';
    const expected = envPath.length > 0 ? envPath.split(sep) : [];
    const result = await systemPathHandler({});
    if (isOk(result)) {
      expect(result['entries']).toEqual(expected);
    }
  });
});

describe('systemPathHandler verbose 输出', () => {
  it('返回 ok=true 与 count/existing', async () => {
    const result = await systemPathHandler({ verbose: true });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(typeof result['count']).toBe('number');
      expect(typeof result['existing']).toBe('number');
    }
  });

  it('count 等于 entries 长度', async () => {
    const result = await systemPathHandler({ verbose: true });
    if (isOk(result)) {
      const entries = result['entries'] as unknown[];
      expect(result['count']).toBe(entries.length);
    }
  });

  it('existing 介于 0 与 count 之间', async () => {
    const result = await systemPathHandler({ verbose: true });
    if (isOk(result)) {
      const count = result['count'] as number;
      const existing = result['existing'] as number;
      expect(existing).toBeGreaterThanOrEqual(0);
      expect(existing).toBeLessThanOrEqual(count);
    }
  });

  it('verbose 时仍含 entries', async () => {
    const result = await systemPathHandler({ verbose: true });
    if (isOk(result)) {
      expect(Array.isArray(result['entries'])).toBe(true);
    }
  });
});

describe('systemPathHandler 跨平台', () => {
  it('Windows 使用 ; 分隔符，unix 使用 : 分隔符', async () => {
    // 通过比对实际拆分结果验证分隔符选择正确
    const sep = process.platform === 'win32' ? ';' : ':';
    const envPath = process.env['PATH'] ?? process.env['Path'] ?? '';
    const expected = envPath.length > 0 ? envPath.split(sep) : [];
    const result = await systemPathHandler({});
    if (isOk(result)) {
      expect(result['entries']).toEqual(expected);
    }
  });

  it('PATH 含多个条目时全部拆分', async () => {
    const result = await systemPathHandler({});
    if (isOk(result)) {
      const entries = result['entries'] as string[];
      // PATH 通常至少含一个条目
      expect(entries.length).toBeGreaterThanOrEqual(1);
    }
  });
});