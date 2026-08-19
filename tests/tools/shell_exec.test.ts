import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  shellExecHandler,
  shellExecTool,
  shellExecInputSchema,
} from '../../src/tools/shell_exec.js';
import { isOk, isFail } from '../../src/contract/output.js';

/** Windows 平台判断。 */
const IS_WIN = process.platform === 'win32';

/** 临时目录根。 */
let root: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'wsm-shellexec-'));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

// ===================== 工具定义 =====================

describe('shellExecTool 定义', () => {
  it('名称为 shell_exec', () => {
    expect(shellExecTool.name).toBe('shell_exec');
  });

  it('有描述', () => {
    expect(shellExecTool.description.length).toBeGreaterThan(0);
  });

  it('inputSchema 是 zod schema', () => {
    expect(typeof shellExecInputSchema.safeParse).toBe('function');
  });

  it('handler 是函数', () => {
    expect(typeof shellExecTool.handler).toBe('function');
  });
});

describe('shellExecInputSchema 验证', () => {
  it('command 字符串合法', () => {
    const parsed = shellExecInputSchema.safeParse({ command: 'echo hello' });
    expect(parsed.success).toBe(true);
  });

  it('command 空字符串非法', () => {
    const parsed = shellExecInputSchema.safeParse({ command: '' });
    expect(parsed.success).toBe(false);
  });

  it('command 缺失非法', () => {
    const parsed = shellExecInputSchema.safeParse({});
    expect(parsed.success).toBe(false);
  });

  it('timeout 正整数合法', () => {
    const parsed = shellExecInputSchema.safeParse({ command: 'echo', timeout: 1000 });
    expect(parsed.success).toBe(true);
  });

  it('timeout 非正非法', () => {
    const parsed = shellExecInputSchema.safeParse({ command: 'echo', timeout: 0 });
    expect(parsed.success).toBe(false);
  });

  it('env record 合法', () => {
    const parsed = shellExecInputSchema.safeParse({
      command: 'echo',
      env: { FOO: 'bar' },
    });
    expect(parsed.success).toBe(true);
  });

  it('verbose 布尔合法', () => {
    const parsed = shellExecInputSchema.safeParse({ command: 'echo', verbose: true });
    expect(parsed.success).toBe(true);
  });
});

// ===================== 正常执行 =====================

describe('shellExecHandler 正常执行', () => {
  it('执行 echo hello 返回 exitCode=0 且 stdout 含 hello', async () => {
    const result = await shellExecHandler({ command: 'echo hello' });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['exitCode']).toBe(0);
      const stdout = result['stdout'] as string;
      expect(stdout).toContain('hello');
    }
  });

  it('极简输出只含 exitCode/stdout/stderr', async () => {
    const result = await shellExecHandler({ command: 'echo hi' });
    if (isOk(result)) {
      expect(result['exitCode']).toBeDefined();
      expect(result['stdout']).toBeDefined();
      expect(result['stderr']).toBeDefined();
      expect(result['pid']).toBeUndefined();
      expect(result['duration']).toBeUndefined();
      expect(result['truncated']).toBeUndefined();
    }
  });

  it('stdout/stderr 为字符串', async () => {
    const result = await shellExecHandler({ command: 'echo str-check' });
    if (isOk(result)) {
      expect(typeof result['stdout']).toBe('string');
      expect(typeof result['stderr']).toBe('string');
    }
  });
});

// ===================== 非零退出码 =====================

describe('shellExecHandler 非零退出码', () => {
  it('exit 1 返回 exitCode=1（正常结果非失败）', async () => {
    // Windows: cmd.exe 内置 exit 命令；unix: sh 内置 exit
    const result = await shellExecHandler({ command: 'exit 1' });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['exitCode']).toBe(1);
    }
  });

  it('exit 42 返回 exitCode=42', async () => {
    const result = await shellExecHandler({ command: 'exit 42' });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['exitCode']).toBe(42);
    }
  });

  it('非零退出码不是工具失败', async () => {
    const result = await shellExecHandler({ command: 'exit 2' });
    expect(isFail(result)).toBe(false);
  });
});

// ===================== 超时 =====================

describe('shellExecHandler 超时', () => {
  it('超时返回 fail 与 EXEC_TIMEOUT', async () => {
    // 跨平台长时命令：Windows ping 多次，unix sleep
    const longCmd = IS_WIN ? 'ping -n 10 127.0.0.1 > nul' : 'sleep 5';
    const result = await shellExecHandler({ command: longCmd, timeout: 500 });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('EXEC_TIMEOUT');
    }
  });

  it('超时消息含超时毫秒', async () => {
    const longCmd = IS_WIN ? 'ping -n 10 127.0.0.1 > nul' : 'sleep 5';
    const result = await shellExecHandler({ command: longCmd, timeout: 300 });
    if (isFail(result)) {
      expect(result.error.message).toContain('300');
    }
  });

  it('未超时正常完成', async () => {
    const result = await shellExecHandler({ command: 'echo fast', timeout: 5000 });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['exitCode']).toBe(0);
    }
  });
});

// ===================== 命令不存在 =====================

describe('shellExecHandler 命令不存在', () => {
  it('不存在的命令返回 EXEC_FAIL 或非零退出码', async () => {
    const result = await shellExecHandler({ command: 'this_cmd_does_not_exist_xyz_123' });
    // shell 包装下命令不存在通常返回非零退出码（Windows 9009/1，unix 127）
    if (isFail(result)) {
      expect(result.error.code).toBe('EXEC_FAIL');
    } else {
      expect(result['exitCode']).not.toBe(0);
    }
  });

  it('不存在的命令 stderr 含错误信息或退出码非零', async () => {
    const result = await shellExecHandler({ command: 'no_such_program_abc_xyz' });
    if (isOk(result)) {
      expect(result['exitCode']).not.toBe(0);
    }
  });
});

// ===================== cwd 工作目录 =====================

describe('shellExecHandler cwd', () => {
  it('指定 cwd 在该目录下执行命令', async () => {
    // 在临时目录下创建标记文件，用列目录验证 cwd 生效
    await writeFile(join(root, 'cwd-marker.txt'), 'marker');

    // Windows: cd（无参数）显示当前目录；unix: pwd
    const cmd = IS_WIN ? 'cd' : 'pwd';
    const result = await shellExecHandler({ command: cmd, cwd: root });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const stdout = result['stdout'] as string;
      // 输出应含临时目录路径（Windows cd 输出带换行，unix pwd 也是）
      expect(stdout).toContain(root);
    }
  });

  it('cwd 不存在时返回失败或非零退出码', async () => {
    const badCwd = join(root, 'no-such-dir-xyz');
    const result = await shellExecHandler({ command: 'echo x', cwd: badCwd });
    // spawn ENOENT 或 shell 报错
    if (isFail(result)) {
      expect(['EXEC_FAIL', 'ENOENT', 'EUNKNOWN']).toContain(result.error.code);
    } else {
      expect(result['exitCode']).not.toBe(0);
    }
  });
});

// ===================== env 环境变量 =====================

describe('shellExecHandler env', () => {
  it('传入 env 子进程能读取', async () => {
    // Windows: echo %VAR%；unix: echo $VAR
    const cmd = IS_WIN ? 'echo %WSM_SHELL_TEST_VAR%' : 'echo $WSM_SHELL_TEST_VAR';
    const result = await shellExecHandler({
      command: cmd,
      env: { WSM_SHELL_TEST_VAR: 'test-value-123' },
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const stdout = result['stdout'] as string;
      expect(stdout).toContain('test-value-123');
    }
  });

  it('env 不覆盖父进程全部环境（仅叠加）', async () => {
    // PATH 应仍可用（echo 命令依赖 shell 内置或 PATH 查找）
    const result = await shellExecHandler({
      command: 'echo path-ok',
      env: { WSM_EXTRA_VAR: 'extra' },
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['exitCode']).toBe(0);
    }
  });
});

// ===================== verbose =====================

describe('shellExecHandler verbose', () => {
  it('verbose 返回 pid/duration/truncated', async () => {
    const result = await shellExecHandler({ command: 'echo verbose-test', verbose: true });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['pid']).toBeDefined();
      expect(result['duration']).toBeDefined();
      expect(result['truncated']).toBeDefined();
      expect(typeof result['pid']).toBe('number');
      expect(typeof result['duration']).toBe('number');
      expect(typeof result['truncated']).toBe('boolean');
    }
  });

  it('verbose pid 为正数', async () => {
    const result = await shellExecHandler({ command: 'echo pid-check', verbose: true });
    if (isOk(result)) {
      expect(result['pid'] as number).toBeGreaterThan(0);
    }
  });

  it('verbose duration 非负', async () => {
    const result = await shellExecHandler({ command: 'echo dur-check', verbose: true });
    if (isOk(result)) {
      expect(result['duration'] as number).toBeGreaterThanOrEqual(0);
    }
  });

  it('verbose 短输出 truncated=false', async () => {
    const result = await shellExecHandler({ command: 'echo short', verbose: true });
    if (isOk(result)) {
      expect(result['truncated']).toBe(false);
    }
  });

  it('verbose 仍含 exitCode/stdout/stderr', async () => {
    const result = await shellExecHandler({ command: 'echo all-fields', verbose: true });
    if (isOk(result)) {
      expect(result['exitCode']).toBeDefined();
      expect(result['stdout']).toBeDefined();
      expect(result['stderr']).toBeDefined();
    }
  });
});

// ===================== encoding =====================

describe('shellExecHandler encoding', () => {
  it('显式 encoding=utf-8 正常解码', async () => {
    const result = await shellExecHandler({
      command: 'echo encoding-test',
      encoding: 'utf-8',
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['stdout']).toContain('encoding-test');
    }
  });
});

// ===================== 参数校验 =====================

describe('shellExecHandler 参数校验', () => {
  it('command 非字符串返回 EINVAL', async () => {
    const result = await shellExecHandler({ command: 123 });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('EINVAL');
    }
  });

  it('command 空字符串返回 EINVAL', async () => {
    const result = await shellExecHandler({ command: '' });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('EINVAL');
    }
  });
});