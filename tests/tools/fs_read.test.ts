import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm, symlink, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encode as iconvEncode } from 'iconv-lite';
import {
  fsListHandler,
  fsListTool,
  fsListInputSchema,
  fsReadHandler,
  fsReadTool,
  fsReadInputSchema,
  fsStatHandler,
  fsStatTool,
  fsStatInputSchema,
} from '../../src/tools/fs_read.js';
import { isOk, isFail } from '../../src/contract/output.js';

/** 临时目录根。 */
let root: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'wsm-fsread-'));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

// ===================== 工具定义 =====================

describe('工具定义', () => {
  it('fs_list 名称与 schema', () => {
    expect(fsListTool.name).toBe('fs_list');
    expect(typeof fsListInputSchema.safeParse).toBe('function');
    expect(typeof fsListTool.handler).toBe('function');
  });

  it('fs_read 名称与 schema', () => {
    expect(fsReadTool.name).toBe('fs_read');
    expect(typeof fsReadInputSchema.safeParse).toBe('function');
    expect(typeof fsReadTool.handler).toBe('function');
  });

  it('fs_stat 名称与 schema', () => {
    expect(fsStatTool.name).toBe('fs_stat');
    expect(typeof fsStatInputSchema.safeParse).toBe('function');
    expect(typeof fsStatTool.handler).toBe('function');
  });
});

// ===================== fs_list =====================

describe('fs_list 极简列目录', () => {
  it('返回相对路径列表', async () => {
    const dir = join(root, 'list-simple');
    await mkdir(dir);
    await writeFile(join(dir, 'a.txt'), 'aaa');
    await writeFile(join(dir, 'b.txt'), 'bbb');
    await mkdir(join(dir, 'sub'));

    const result = await fsListHandler({ path: dir });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const entries = result['entries'] as string[];
      expect(entries).toContain('a.txt');
      expect(entries).toContain('b.txt');
      expect(entries).toContain('sub');
      expect(entries.length).toBe(3);
    }
  });

  it('空目录返回空数组', async () => {
    const dir = join(root, 'list-empty');
    await mkdir(dir);

    const result = await fsListHandler({ path: dir });
    if (isOk(result)) {
      const entries = result['entries'] as string[];
      expect(entries).toEqual([]);
    }
  });
});

describe('fs_list verbose 列目录', () => {
  it('返回含 type 与 size 的条目', async () => {
    const dir = join(root, 'list-verbose');
    await mkdir(dir);
    await writeFile(join(dir, 'a.txt'), 'hello');
    await mkdir(join(dir, 'sub'));

    const result = await fsListHandler({ path: dir, verbose: true });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const entries = result['entries'] as Array<{
        name: string;
        type: string;
        size: number;
      }>;
      const aEntry = entries.find((e) => e.name === 'a.txt');
      const subEntry = entries.find((e) => e.name === 'sub');
      expect(aEntry).toBeDefined();
      expect(aEntry?.type).toBe('file');
      expect(aEntry?.size).toBe(5);
      expect(subEntry).toBeDefined();
      expect(subEntry?.type).toBe('dir');
    }
  });
});

describe('fs_list recursive 列目录', () => {
  it('极简递归列出子目录内容', async () => {
    const dir = join(root, 'list-recursive');
    await mkdir(dir);
    await writeFile(join(dir, 'top.txt'), 'top');
    await mkdir(join(dir, 'sub'));
    await writeFile(join(dir, 'sub', 'deep.txt'), 'deep');

    const result = await fsListHandler({ path: dir, recursive: true });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const entries = result['entries'] as string[];
      expect(entries).toContain('top.txt');
      expect(entries).toContain('sub');
      // 递归条目使用相对路径（含分隔符）
      expect(entries.some((e) => e.includes('deep.txt'))).toBe(true);
    }
  });

  it('verbose 递归列出含类型与大小', async () => {
    const dir = join(root, 'list-recursive-verbose');
    await mkdir(dir);
    await writeFile(join(dir, 'top.txt'), 'top');
    await mkdir(join(dir, 'sub'));
    await writeFile(join(dir, 'sub', 'deep.txt'), 'deep-content');

    const result = await fsListHandler({
      path: dir,
      verbose: true,
      recursive: true,
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const entries = result['entries'] as Array<{
        name: string;
        type: string;
        size: number;
      }>;
      const deepEntry = entries.find((e) => e.name.includes('deep.txt'));
      expect(deepEntry).toBeDefined();
      expect(deepEntry?.type).toBe('file');
      expect(deepEntry?.size).toBe(12); // 'deep-content'.length
    }
  });
});

describe('fs_list 错误路径', () => {
  it('路径不存在返回 ENOENT', async () => {
    const result = await fsListHandler({ path: join(root, 'no-such-dir') });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('ENOENT');
    }
  });

  it('路径是文件返回 ENOTDIR', async () => {
    const file = join(root, 'not-a-dir.txt');
    await writeFile(file, 'x');
    const result = await fsListHandler({ path: file });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('ENOTDIR');
    }
  });
});

// ===================== fs_read =====================

describe('fs_read 读 UTF-8 文件', () => {
  it('正确读取 UTF-8 内容', async () => {
    const file = join(root, 'read-utf8.txt');
    await writeFile(file, 'Hello, 世界!');

    const result = await fsReadHandler({ path: file });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['content']).toBe('Hello, 世界!');
      expect(result['truncated']).toBe(false);
    }
  });

  it('返回行数', async () => {
    const file = join(root, 'read-lines.txt');
    await writeFile(file, 'line1\nline2\nline3');

    const result = await fsReadHandler({ path: file });
    if (isOk(result)) {
      expect(result['lines']).toBe(3);
    }
  });
});

describe('fs_read 读 GBK 文件', () => {
  it('自动检测并正确解码 GBK', async () => {
    const file = join(root, 'read-gbk.txt');
    // 用 iconv-lite 以 gbk 编码写入
    const gbkBuf = iconvEncode('你好，世界！', 'gbk');
    await writeFile(file, gbkBuf);

    const result = await fsReadHandler({ path: file });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['content']).toBe('你好，世界！');
    }
  });

  it('显式指定 encoding=gbk', async () => {
    const file = join(root, 'read-gbk-explicit.txt');
    const gbkBuf = iconvEncode('中文内容', 'gbk');
    await writeFile(file, gbkBuf);

    const result = await fsReadHandler({ path: file, encoding: 'gbk' });
    if (isOk(result)) {
      expect(result['content']).toBe('中文内容');
    }
  });
});

describe('fs_read 行范围', () => {
  it('start/end 提取行切片（含 start 不含 end）', async () => {
    const file = join(root, 'read-range.txt');
    await writeFile(file, 'L1\nL2\nL3\nL4\nL5');

    const result = await fsReadHandler({ path: file, start: 2, end: 4 });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['content']).toBe('L2\nL3');
      expect(result['lines']).toBe(2);
    }
  });

  it('仅 start 从指定行到末尾', async () => {
    const file = join(root, 'read-start-only.txt');
    await writeFile(file, 'L1\nL2\nL3');

    const result = await fsReadHandler({ path: file, start: 2 });
    if (isOk(result)) {
      expect(result['content']).toBe('L2\nL3');
    }
  });

  it('仅 end 从开头到指定行', async () => {
    const file = join(root, 'read-end-only.txt');
    await writeFile(file, 'L1\nL2\nL3\nL4');

    const result = await fsReadHandler({ path: file, end: 2 });
    if (isOk(result)) {
      expect(result['content']).toBe('L1');
    }
  });
});

describe('fs_read 截断', () => {
  it('超长内容被截断并标记 truncated=true', async () => {
    const file = join(root, 'read-truncate.txt');
    const longText = 'A'.repeat(3000);
    await writeFile(file, longText);

    const result = await fsReadHandler({ path: file });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['truncated']).toBe(true);
      const content = result['content'] as string;
      expect(content.length).toBeLessThan(longText.length);
      expect(content).toContain('truncated');
    }
  });

  it('自定义 maxLen', async () => {
    const file = join(root, 'read-maxlen.txt');
    await writeFile(file, 'ABCDEFGHIJ');

    const result = await fsReadHandler({ path: file, maxLen: 5 });
    if (isOk(result)) {
      expect(result['truncated']).toBe(true);
      expect(result['content']).toBe('ABCDE...[truncated, 5 more chars]');
    }
  });

  it('短内容不截断', async () => {
    const file = join(root, 'read-short.txt');
    await writeFile(file, 'short');

    const result = await fsReadHandler({ path: file });
    if (isOk(result)) {
      expect(result['truncated']).toBe(false);
      expect(result['content']).toBe('short');
    }
  });
});

describe('fs_read 错误路径', () => {
  it('文件不存在返回 ENOENT', async () => {
    const result = await fsReadHandler({ path: join(root, 'no-such-file.txt') });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('ENOENT');
    }
  });

  it('路径是目录返回 EISDIR', async () => {
    const dir = join(root, 'read-is-dir');
    await mkdir(dir);
    const result = await fsReadHandler({ path: dir });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('EISDIR');
    }
  });
});

// ===================== fs_stat =====================

describe('fs_stat 正常路径', () => {
  it('文件信息含 type/size/mtime/birthtime', async () => {
    const file = join(root, 'stat-file.txt');
    await writeFile(file, 'stat-content');

    const result = await fsStatHandler({ path: file });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['type']).toBe('file');
      expect(result['size']).toBe(12); // 'stat-content'.length
      expect(typeof result['mtime']).toBe('number');
      expect(typeof result['birthtime']).toBe('number');
    }
  });

  it('目录信息 type=dir', async () => {
    const dir = join(root, 'stat-dir');
    await mkdir(dir);

    const result = await fsStatHandler({ path: dir });
    if (isOk(result)) {
      expect(result['type']).toBe('dir');
      expect(typeof result['size']).toBe('number');
      expect(typeof result['mtime']).toBe('number');
    }
  });
});

describe('fs_stat symlink', () => {
  it('symlink 类型识别为 symlink', async () => {
    const target = join(root, 'stat-target.txt');
    await writeFile(target, 'target');
    const link = join(root, 'stat-link.txt');
    try {
      await symlink(target, link);
    } catch {
      // 某些环境（如 Windows 无权限）创建 symlink 可能失败，跳过
      return;
    }

    const result = await fsStatHandler({ path: link });
    if (isOk(result)) {
      expect(result['type']).toBe('symlink');
    }
  });
});

describe('fs_stat 错误路径', () => {
  it('路径不存在返回 ENOENT', async () => {
    const result = await fsStatHandler({ path: join(root, 'no-such-path') });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('ENOENT');
    }
  });
});

// ===================== 权限错误（Windows 兼容） =====================

describe('权限错误路径', () => {
  it('fs_list 无权限目录返回 EACCES 或跳过（Windows）', async () => {
    const dir = join(root, 'no-perm-list');
    await mkdir(dir);
    await writeFile(join(dir, 'secret.txt'), 'secret');

    let skip = false;
    try {
      // chmod 0o000 移除所有权限（Windows 上可能不生效）
      await chmod(dir, 0o000);
    } catch {
      skip = true;
    }

    if (skip) return;

    const result = await fsListHandler({ path: dir });
    // Windows 上 chmod 可能不生效，result 可能成功；Linux 上应为 EACCES
    if (isFail(result)) {
      expect(['EACCES', 'ENOENT', 'EUNKNOWN']).toContain(result.error.code);
    }

    // 恢复权限以便清理
    try {
      await chmod(dir, 0o755);
    } catch {
      // 忽略
    }
  });

  it('fs_read 无权限文件返回 EACCES 或跳过（Windows）', async () => {
    const file = join(root, 'no-perm-read.txt');
    await writeFile(file, 'secret');

    let skip = false;
    try {
      await chmod(file, 0o000);
    } catch {
      skip = true;
    }

    if (skip) return;

    const result = await fsReadHandler({ path: file });
    if (isFail(result)) {
      expect(['EACCES', 'ENOENT', 'EUNKNOWN']).toContain(result.error.code);
    }

    try {
      await chmod(file, 0o644);
    } catch {
      // 忽略
    }
  });
});