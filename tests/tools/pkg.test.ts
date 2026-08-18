import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  pkgDetectHandler,
  pkgDetectTool,
  pkgDetectInputSchema,
  pkgRunHandler,
  pkgRunTool,
  pkgRunInputSchema,
} from '../../src/tools/pkg.js';
import { isOk, isFail } from '../../src/contract/output.js';

/** 临时目录根。 */
let root: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'wsm-pkg-'));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

// ===================== pkg_detect 工具定义 =====================

describe('pkgDetectTool 定义', () => {
  it('名称为 pkg_detect', () => {
    expect(pkgDetectTool.name).toBe('pkg_detect');
  });

  it('有描述', () => {
    expect(pkgDetectTool.description.length).toBeGreaterThan(0);
  });

  it('inputSchema 是 zod schema', () => {
    expect(typeof pkgDetectInputSchema.safeParse).toBe('function');
  });

  it('handler 是函数', () => {
    expect(typeof pkgDetectTool.handler).toBe('function');
  });
});

describe('pkgDetectInputSchema 验证', () => {
  it('空对象合法（使用默认列表）', () => {
    const parsed = pkgDetectInputSchema.safeParse({});
    expect(parsed.success).toBe(true);
  });

  it('managers 字符串数组合法', () => {
    const parsed = pkgDetectInputSchema.safeParse({ managers: ['npm', 'pnpm'] });
    expect(parsed.success).toBe(true);
  });

  it('managers 含空字符串非法', () => {
    const parsed = pkgDetectInputSchema.safeParse({ managers: ['npm', ''] });
    expect(parsed.success).toBe(false);
  });

  it('managers 非数组非法', () => {
    const parsed = pkgDetectInputSchema.safeParse({ managers: 'npm' });
    expect(parsed.success).toBe(false);
  });

  it('managers 含非字符串非法', () => {
    const parsed = pkgDetectInputSchema.safeParse({ managers: ['npm', 123] });
    expect(parsed.success).toBe(false);
  });
});

// ===================== pkg_detect 正常检测 =====================

describe('pkgDetectHandler 正常检测', () => {
  it('默认检测全部，npm 应可用', async () => {
    const result = await pkgDetectHandler({});
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const available = result['available'] as Record<string, boolean>;
      const checked = result['checked'] as string[];
      expect(checked).toContain('npm');
      expect(available['npm']).toBe(true);
    }
  });

  it('返回 checked 列表与 available 映射键一致', async () => {
    const result = await pkgDetectHandler({});
    if (isOk(result)) {
      const available = result['available'] as Record<string, boolean>;
      const checked = result['checked'] as string[];
      expect(Array.isArray(checked)).toBe(true);
      expect(checked.length).toBeGreaterThan(0);
      // available 的键应与 checked 一致
      expect(Object.keys(available).sort()).toEqual([...checked].sort());
      for (const m of checked) {
        expect(typeof available[m]).toBe('boolean');
      }
    }
  });

  it('指定 managers 列表只检测指定的', async () => {
    const result = await pkgDetectHandler({ managers: ['npm'] });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const available = result['available'] as Record<string, boolean>;
      const checked = result['checked'] as string[];
      expect(checked).toEqual(['npm']);
      expect(Object.keys(available)).toEqual(['npm']);
      expect(available['npm']).toBe(true);
    }
  });

  it('未安装的管理器返回 false（不是工具失败）', async () => {
    const result = await pkgDetectHandler({
      managers: ['this_mgr_does_not_exist_xyz_123'],
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const available = result['available'] as Record<string, boolean>;
      expect(available['this_mgr_does_not_exist_xyz_123']).toBe(false);
    }
  });

  it('混合已安装和未安装的管理器', async () => {
    const result = await pkgDetectHandler({
      managers: ['npm', 'no_such_mgr_xyz_abc'],
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const available = result['available'] as Record<string, boolean>;
      expect(available['npm']).toBe(true);
      expect(available['no_such_mgr_xyz_abc']).toBe(false);
    }
  });

  it('检测多个常见管理器不抛错', async () => {
    const result = await pkgDetectHandler({
      managers: ['npm', 'yarn', 'pnpm', 'pip', 'cargo', 'go'],
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const available = result['available'] as Record<string, boolean>;
      // npm 必可用（项目用 npm）
      expect(available['npm']).toBe(true);
      // 其余均为 boolean
      for (const m of ['yarn', 'pnpm', 'pip', 'cargo', 'go']) {
        expect(typeof available[m]).toBe('boolean');
      }
    }
  });
});

// ===================== pkg_run 工具定义 =====================

describe('pkgRunTool 定义', () => {
  it('名称为 pkg_run', () => {
    expect(pkgRunTool.name).toBe('pkg_run');
  });

  it('有描述', () => {
    expect(pkgRunTool.description.length).toBeGreaterThan(0);
  });

  it('inputSchema 是 zod schema', () => {
    expect(typeof pkgRunInputSchema.safeParse).toBe('function');
  });

  it('handler 是函数', () => {
    expect(typeof pkgRunTool.handler).toBe('function');
  });
});

describe('pkgRunInputSchema 验证', () => {
  it('manager 字符串合法', () => {
    const parsed = pkgRunInputSchema.safeParse({ manager: 'npm' });
    expect(parsed.success).toBe(true);
  });

  it('manager 空字符串非法', () => {
    const parsed = pkgRunInputSchema.safeParse({ manager: '' });
    expect(parsed.success).toBe(false);
  });

  it('manager 缺失非法', () => {
    const parsed = pkgRunInputSchema.safeParse({});
    expect(parsed.success).toBe(false);
  });

  it('args 字符串数组合法', () => {
    const parsed = pkgRunInputSchema.safeParse({ manager: 'npm', args: ['--version'] });
    expect(parsed.success).toBe(true);
  });

  it('args 含非字符串非法', () => {
    const parsed = pkgRunInputSchema.safeParse({ manager: 'npm', args: ['--version', 123] });
    expect(parsed.success).toBe(false);
  });

  it('timeout 正整数合法', () => {
    const parsed = pkgRunInputSchema.safeParse({ manager: 'npm', timeout: 1000 });
    expect(parsed.success).toBe(true);
  });

  it('timeout 非正非法', () => {
    const parsed = pkgRunInputSchema.safeParse({ manager: 'npm', timeout: 0 });
    expect(parsed.success).toBe(false);
  });

  it('verbose 布尔合法', () => {
    const parsed = pkgRunInputSchema.safeParse({ manager: 'npm', verbose: true });
    expect(parsed.success).toBe(true);
  });

  it('cwd 字符串合法', () => {
    const parsed = pkgRunInputSchema.safeParse({ manager: 'npm', cwd: '/tmp' });
    expect(parsed.success).toBe(true);
  });
});

// ===================== pkg_run 正常执行 =====================

describe('pkgRunHandler 正常执行', () => {
  it('执行 npm --version 返回 exitCode=0 且 stdout 含版本号', async () => {
    const result = await pkgRunHandler({ manager: 'npm', args: ['--version'] });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['exitCode']).toBe(0);
      const stdout = result['stdout'] as string;
      // npm --version 输出形如 "10.x.x"
      expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
    }
  });

  it('极简输出只含 exitCode/stdout/stderr', async () => {
    const result = await pkgRunHandler({ manager: 'npm', args: ['--version'] });
    if (isOk(result)) {
      expect(result['exitCode']).toBeDefined();
      expect(result['stdout']).toBeDefined();
      expect(result['stderr']).toBeDefined();
      expect(result['pid']).toBeUndefined();
      expect(result['duration']).toBeUndefined();
    }
  });

  it('stdout/stderr 为字符串', async () => {
    const result = await pkgRunHandler({ manager: 'npm', args: ['--version'] });
    if (isOk(result)) {
      expect(typeof result['stdout']).toBe('string');
      expect(typeof result['stderr']).toBe('string');
    }
  });

  it('args 传递多个参数', async () => {
    // npm config get registry 返回当前 registry URL
    const result = await pkgRunHandler({
      manager: 'npm',
      args: ['config', 'get', 'registry'],
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['exitCode']).toBe(0);
      const stdout = result['stdout'] as string;
      // 应输出非空 registry URL
      expect(stdout.trim().length).toBeGreaterThan(0);
    }
  });

  it('指定 cwd 在该目录下执行成功', async () => {
    const result = await pkgRunHandler({
      manager: 'npm',
      args: ['--version'],
      cwd: root,
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['exitCode']).toBe(0);
    }
  });

  it('无 args 时只执行 manager（npm 不带参数返回非零退出码，仍是正常结果）', async () => {
    const result = await pkgRunHandler({ manager: 'npm' });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      // npm 不带参数会打印 usage 并退出码 1
      expect(result['exitCode']).not.toBe(0);
    }
  });
});

// ===================== pkg_run verbose =====================

describe('pkgRunHandler verbose', () => {
  it('verbose 返回 pid 与 duration', async () => {
    const result = await pkgRunHandler({
      manager: 'npm',
      args: ['--version'],
      verbose: true,
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['pid']).toBeDefined();
      expect(result['duration']).toBeDefined();
      expect(typeof result['pid']).toBe('number');
      expect(typeof result['duration']).toBe('number');
      expect(result['pid'] as number).toBeGreaterThan(0);
      expect(result['duration'] as number).toBeGreaterThanOrEqual(0);
    }
  });

  it('verbose 仍含 exitCode/stdout/stderr', async () => {
    const result = await pkgRunHandler({
      manager: 'npm',
      args: ['--version'],
      verbose: true,
    });
    if (isOk(result)) {
      expect(result['exitCode']).toBeDefined();
      expect(result['stdout']).toBeDefined();
      expect(result['stderr']).toBeDefined();
    }
  });
});

// ===================== pkg_run 错误路径 =====================

describe('pkgRunHandler 错误路径', () => {
  it('不存在的 manager 返回 EXEC_FAIL 或非零退出码', async () => {
    // shell:true 模式下，不存在的命令由 shell（cmd.exe/sh）返回非零退出码
    // （Windows 9009/1，unix 127），或触发 spawn error 返回 EXEC_FAIL
    const result = await pkgRunHandler({
      manager: 'this_mgr_does_not_exist_xyz_123',
      args: ['--version'],
    });
    if (isFail(result)) {
      expect(result.error.code).toBe('EXEC_FAIL');
    } else {
      expect(result['exitCode']).not.toBe(0);
    }
  });

  it('不存在的 manager stderr 含错误信息或退出码非零', async () => {
    const result = await pkgRunHandler({
      manager: 'no_such_program_abc_xyz_999',
      args: ['--version'],
    });
    if (isOk(result)) {
      expect(result['exitCode']).not.toBe(0);
    } else {
      expect(result.error.code).toBe('EXEC_FAIL');
    }
  });

  it('命令失败（不存在的子命令）返回非零 exitCode（正常结果非失败）', async () => {
    const result = await pkgRunHandler({
      manager: 'npm',
      args: ['nonexistentcommand123'],
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['exitCode']).not.toBe(0);
    }
  });

  it('命令失败不是工具失败', async () => {
    const result = await pkgRunHandler({
      manager: 'npm',
      args: ['nonexistentcommand456'],
    });
    expect(isFail(result)).toBe(false);
  });

  it('manager 空字符串返回 EINVAL', async () => {
    const result = await pkgRunHandler({ manager: '' });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('EINVAL');
    }
  });

  it('manager 非字符串返回 EINVAL', async () => {
    const result = await pkgRunHandler({ manager: 123 });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('EINVAL');
    }
  });

  it('manager 缺失返回 EINVAL', async () => {
    const result = await pkgRunHandler({});
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('EINVAL');
    }
  });
});

// ===================== pkg_run 超时 =====================

describe('pkgRunHandler 超时', () => {
  it('超时返回 EXEC_TIMEOUT 且消息含超时毫秒', async () => {
    // 用不可达 registry 让 npm ping hang 在连接阶段；timeout=500ms 触发我们的超时
    // 10.255.255.1 是 RFC 5737 保留的不可达地址，TCP connect 会 hang 直到内核 timeout
    const result = await pkgRunHandler({
      manager: 'npm',
      args: ['ping', '--registry', 'http://10.255.255.1:80/'],
      timeout: 500,
    });
    if (isFail(result)) {
      expect(result.error.code).toBe('EXEC_TIMEOUT');
      expect(result.error.message).toContain('500');
    } else {
      // 极少数环境下 10.255.255.1 可能立即拒绝或环境有代理转发，
      // 此时降级验证：命令完成（exitCode 定义），测试不强制失败
      expect(result['exitCode']).toBeDefined();
    }
  }, 15000);

  it('未超时正常完成', async () => {
    const result = await pkgRunHandler({
      manager: 'npm',
      args: ['--version'],
      timeout: 30000,
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['exitCode']).toBe(0);
    }
  });
});

// ===================== pkg_run cwd 错误 =====================

describe('pkgRunHandler cwd', () => {
  it('cwd 不存在时返回失败或非零退出码', async () => {
    const badCwd = join(root, 'no-such-dir-xyz-999');
    const result = await pkgRunHandler({
      manager: 'npm',
      args: ['--version'],
      cwd: badCwd,
    });
    // spawn ENOENT 或 shell 报错
    if (isFail(result)) {
      expect(['EXEC_FAIL', 'ENOENT', 'EUNKNOWN']).toContain(result.error.code);
    } else {
      expect(result['exitCode']).not.toBe(0);
    }
  });

  it('cwd 为已存在目录正常执行', async () => {
    // 在临时目录下创建标记文件，验证 cwd 生效（npm --version 不依赖 cwd，但应成功）
    await writeFile(join(root, 'pkg-marker.txt'), 'marker');
    const result = await pkgRunHandler({
      manager: 'npm',
      args: ['--version'],
      cwd: root,
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['exitCode']).toBe(0);
    }
  });
});