import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { encode as iconvEncode, decode as iconvDecode } from 'iconv-lite';
import { isOk, isFail } from '../../src/contract/output.js';
import { ErrorCode } from '../../src/contract/errors.js';
import {
  fsWriteHandler,
  fsMkdirHandler,
  fsRmHandler,
  fsCpHandler,
  fsMvHandler,
  fsTouchHandler,
  fsWriteTool,
  fsMkdirTool,
  fsRmTool,
  fsCpTool,
  fsMvTool,
  fsTouchTool,
} from '../../src/tools/fs_write.js';

/** 临时目录根，每个用例独立一份。 */
let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wsmcp-fsw-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

/** 拼接临时目录下的子路径。 */
function p(...segments: string[]): string {
  return path.join(tmpDir, ...segments);
}

/** 断言路径存在。 */
async function assertExists(file: string): Promise<void> {
  await fs.access(file);
}

/** 断言路径不存在。 */
async function assertNotExists(file: string): Promise<void> {
  try {
    await fs.access(file);
    throw new Error(`期望不存在但已存在: ${file}`);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw e;
    }
  }
}

// ---------------------------------------------------------------------------
// 工具定义
// ---------------------------------------------------------------------------

describe('fs 写工具集定义', () => {
  const tools = [
    { tool: fsWriteTool, name: 'fs_write' },
    { tool: fsMkdirTool, name: 'fs_mkdir' },
    { tool: fsRmTool, name: 'fs_rm' },
    { tool: fsCpTool, name: 'fs_cp' },
    { tool: fsMvTool, name: 'fs_mv' },
    { tool: fsTouchTool, name: 'fs_touch' },
  ];

  for (const { tool, name } of tools) {
    it(`${name} 有正确名称与非空描述`, () => {
      expect(tool.name).toBe(name);
      expect(tool.description.length).toBeGreaterThan(0);
      expect(typeof tool.handler).toBe('function');
      expect(typeof tool.inputSchema.safeParse).toBe('function');
    });
  }
});

// ---------------------------------------------------------------------------
// fs_write
// ---------------------------------------------------------------------------

describe('fs_write', () => {
  it('utf-8 覆盖写入并返回字节数', async () => {
    const file = p('a.txt');
    const result = await fsWriteHandler({ path: file, content: 'hello 你好' });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['written']).toBe(Buffer.byteLength('hello 你好', 'utf8'));
    }
    const text = await fs.readFile(file, 'utf8');
    expect(text).toBe('hello 你好');
  });

  it('gbk 编码写入', async () => {
    const file = p('gbk.txt');
    const result = await fsWriteHandler({
      path: file,
      content: '你好世界',
      encoding: 'gbk',
    });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['written']).toBe(iconvEncode('你好世界', 'gbk').length);
    }
    const buf = await fs.readFile(file);
    expect(iconvDecode(buf, 'gbk')).toBe('你好世界');
  });

  it('append=true 追加到现有文件', async () => {
    const file = p('log.txt');
    await fs.writeFile(file, 'line1\n', 'utf8');

    const result = await fsWriteHandler({
      path: file,
      content: 'line2\n',
      append: true,
    });

    expect(isOk(result)).toBe(true);
    const text = await fs.readFile(file, 'utf8');
    expect(text).toBe('line1\nline2\n');
  });

  it('append=false（默认）覆盖现有文件', async () => {
    const file = p('over.txt');
    await fs.writeFile(file, 'old', 'utf8');

    await fsWriteHandler({ path: file, content: 'new' });
    const text = await fs.readFile(file, 'utf8');
    expect(text).toBe('new');
  });

  it('父目录不存在且 mkdirParents: false → ENOENT', async () => {
    const file = p('missing', 'a.txt');
    const result = await fsWriteHandler({ path: file, content: 'x', mkdirParents: false });

    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe(ErrorCode.ENOENT);
    }
  });

  it('父目录不存在且默认（mkdirParents: true）自动创建', async () => {
    const file = p('auto-parent', 'sub', 'a.txt');
    const result = await fsWriteHandler({ path: file, content: 'x' });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const text = await fs.readFile(file, 'utf8');
      expect(text).toBe('x');
    }
  });

  it('父路径是文件 → ENOTDIR', async () => {
    const blocker = p('blocker.txt');
    await fs.writeFile(blocker, 'x', 'utf8');
    const file = p('blocker.txt', 'child.txt');

    const result = await fsWriteHandler({ path: file, content: 'y' });

    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe(ErrorCode.ENOTDIR);
    }
  });

  it('写入空内容返回 written=0', async () => {
    const file = p('empty.txt');
    const result = await fsWriteHandler({ path: file, content: '' });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['written']).toBe(0);
    }
    const stat = await fs.stat(file);
    expect(stat.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// fs_mkdir
// ---------------------------------------------------------------------------

describe('fs_mkdir', () => {
  it('新建目录返回 created=true', async () => {
    const dir = p('newdir');
    const result = await fsMkdirHandler({ path: dir });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['created']).toBe(true);
    }
    const stat = await fs.stat(dir);
    expect(stat.isDirectory()).toBe(true);
  });

  it('recursive=true（默认）递归创建多级目录', async () => {
    const dir = p('a', 'b', 'c');
    const result = await fsMkdirHandler({ path: dir });

    expect(isOk(result)).toBe(true);
    const stat = await fs.stat(dir);
    expect(stat.isDirectory()).toBe(true);
  });

  it('recursive=false 单级创建', async () => {
    const dir = p('single');
    const result = await fsMkdirHandler({ path: dir, recursive: false });

    expect(isOk(result)).toBe(true);
    const stat = await fs.stat(dir);
    expect(stat.isDirectory()).toBe(true);
  });

  it('recursive=false 父目录缺失 → 失败', async () => {
    const dir = p('no-parent', 'child');
    const result = await fsMkdirHandler({ path: dir, recursive: false });

    expect(isFail(result)).toBe(true);
  });

  it('已存在目录返回 created=false', async () => {
    const dir = p('exists');
    await fs.mkdir(dir);

    const result = await fsMkdirHandler({ path: dir });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['created']).toBe(false);
    }
  });

  it('已存在且非目录 → ENOTDIR', async () => {
    const blocker = p('file.txt');
    await fs.writeFile(blocker, 'x', 'utf8');

    const result = await fsMkdirHandler({ path: blocker });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe(ErrorCode.ENOTDIR);
    }
  });
});

// ---------------------------------------------------------------------------
// fs_rm
// ---------------------------------------------------------------------------

describe('fs_rm', () => {
  it('删除文件返回 removed=true', async () => {
    const file = p('to-remove.txt');
    await fs.writeFile(file, 'x', 'utf8');

    const result = await fsRmHandler({ path: file });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['removed']).toBe(true);
    }
    await assertNotExists(file);
  });

  it('删除空目录（非 recursive）', async () => {
    const dir = p('empty-dir');
    await fs.mkdir(dir);

    const result = await fsRmHandler({ path: dir });
    expect(isOk(result)).toBe(true);
    await assertNotExists(dir);
  });

  it('recursive=true 删除非空目录树', async () => {
    const dir = p('tree');
    await fs.mkdir(path.join(dir, 'sub'), { recursive: true });
    await fs.writeFile(path.join(dir, 'a.txt'), 'a', 'utf8');
    await fs.writeFile(path.join(dir, 'sub', 'b.txt'), 'b', 'utf8');

    const result = await fsRmHandler({ path: dir, recursive: true });
    expect(isOk(result)).toBe(true);
    await assertNotExists(dir);
  });

  it('非空目录且非 recursive → EACCES', async () => {
    const dir = p('nonempty');
    await fs.mkdir(dir);
    await fs.writeFile(path.join(dir, 'x.txt'), 'x', 'utf8');

    const result = await fsRmHandler({ path: dir });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe(ErrorCode.EACCES);
    }
    // 目录应仍存在
    const stat = await fs.stat(dir);
    expect(stat.isDirectory()).toBe(true);
  });

  it('不存在且非 force → ENOENT', async () => {
    const result = await fsRmHandler({ path: p('no-such') });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe(ErrorCode.ENOENT);
    }
  });

  it('不存在且 force=true → removed=false（不报错）', async () => {
    const result = await fsRmHandler({ path: p('no-such'), force: true });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['removed']).toBe(false);
    }
  });

  it('force=true 删除存在的文件仍返回 removed=true', async () => {
    const file = p('force.txt');
    await fs.writeFile(file, 'x', 'utf8');

    const result = await fsRmHandler({ path: file, force: true });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['removed']).toBe(true);
    }
    await assertNotExists(file);
  });
});

// ---------------------------------------------------------------------------
// fs_cp
// ---------------------------------------------------------------------------

describe('fs_cp', () => {
  it('复制文件', async () => {
    const src = p('src.txt');
    const dest = p('dest.txt');
    await fs.writeFile(src, 'content 你好', 'utf8');

    const result = await fsCpHandler({ src, dest });
    expect(isOk(result)).toBe(true);
    const text = await fs.readFile(dest, 'utf8');
    expect(text).toBe('content 你好');
    // 源仍存在
    await assertExists(src);
  });

  it('recursive=true 复制目录树', async () => {
    const src = p('src-dir');
    const dest = p('dest-dir');
    await fs.mkdir(path.join(src, 'sub'), { recursive: true });
    await fs.writeFile(path.join(src, 'a.txt'), 'a', 'utf8');
    await fs.writeFile(path.join(src, 'sub', 'b.txt'), 'b', 'utf8');

    const result = await fsCpHandler({ src, dest, recursive: true });
    expect(isOk(result)).toBe(true);

    const aText = await fs.readFile(path.join(dest, 'a.txt'), 'utf8');
    const bText = await fs.readFile(path.join(dest, 'sub', 'b.txt'), 'utf8');
    expect(aText).toBe('a');
    expect(bText).toBe('b');
  });

  it('复制目录但非 recursive → EINVAL', async () => {
    const src = p('src-dir2');
    const dest = p('dest-dir2');
    await fs.mkdir(src);

    const result = await fsCpHandler({ src, dest });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe(ErrorCode.EINVAL);
    }
  });

  it('src 不存在 → ENOENT', async () => {
    const result = await fsCpHandler({ src: p('no-such'), dest: p('out') });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe(ErrorCode.ENOENT);
    }
  });
});

// ---------------------------------------------------------------------------
// fs_mv
// ---------------------------------------------------------------------------

describe('fs_mv', () => {
  it('移动文件', async () => {
    const src = p('m.txt');
    const dest = p('moved.txt');
    await fs.writeFile(src, 'payload', 'utf8');

    const result = await fsMvHandler({ src, dest });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['moved']).toBe(true);
    }
    await assertNotExists(src);
    const text = await fs.readFile(dest, 'utf8');
    expect(text).toBe('payload');
  });

  it('重命名（同目录内）', async () => {
    const src = p('old-name.txt');
    const dest = p('new-name.txt');
    await fs.writeFile(src, 'rename-me', 'utf8');

    const result = await fsMvHandler({ src, dest });
    expect(isOk(result)).toBe(true);
    await assertNotExists(src);
    await assertExists(dest);
  });

  it('移动目录', async () => {
    const src = p('mv-dir');
    const dest = p('mv-dir-dest');
    await fs.mkdir(src);
    await fs.writeFile(path.join(src, 'inner.txt'), 'x', 'utf8');

    const result = await fsMvHandler({ src, dest });
    expect(isOk(result)).toBe(true);
    await assertNotExists(src);
    const text = await fs.readFile(path.join(dest, 'inner.txt'), 'utf8');
    expect(text).toBe('x');
  });

  it('src 不存在 → ENOENT', async () => {
    const result = await fsMvHandler({ src: p('no-such'), dest: p('out') });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe(ErrorCode.ENOENT);
    }
  });

  it('dest 已存在 → EINVAL', async () => {
    const src = p('src-exists.txt');
    const dest = p('dest-exists.txt');
    await fs.writeFile(src, 'a', 'utf8');
    await fs.writeFile(dest, 'b', 'utf8');

    const result = await fsMvHandler({ src, dest });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe(ErrorCode.EINVAL);
    }
    // 源未被破坏
    const text = await fs.readFile(src, 'utf8');
    expect(text).toBe('a');
  });

  it('overwrite: true 覆盖已存在的目标', async () => {
    const src = p('ow-src.txt');
    const dest = p('ow-dest.txt');
    await fs.writeFile(src, 'new', 'utf8');
    await fs.writeFile(dest, 'old', 'utf8');

    const result = await fsMvHandler({ src, dest, overwrite: true });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['moved']).toBe(true);
      expect(result['dest']).toBe(dest);
    }
    await assertNotExists(src);
    const text = await fs.readFile(dest, 'utf8');
    expect(text).toBe('new');
  });

  it('dest 是目录时移入该目录', async () => {
    const src = p('movein-src.txt');
    const destDir = p('movein-dest');
    await fs.writeFile(src, 'x', 'utf8');
    await fs.mkdir(destDir);

    const result = await fsMvHandler({ src, dest: destDir });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['moved']).toBe(true);
      expect(result['dest']).toBe(path.join(destDir, 'movein-src.txt'));
    }
    await assertNotExists(src);
    await assertExists(path.join(destDir, 'movein-src.txt'));
  });

  it('dest 是目录且目标已存在且 overwrite: true 覆盖', async () => {
    const src = p('movein-ow-src.txt');
    const destDir = p('movein-ow-dest');
    await fs.writeFile(src, 'new', 'utf8');
    await fs.mkdir(destDir);
    await fs.writeFile(path.join(destDir, 'movein-ow-src.txt'), 'old', 'utf8');

    const result = await fsMvHandler({ src, dest: destDir, overwrite: true });
    expect(isOk(result)).toBe(true);
    await assertNotExists(src);
    const text = await fs.readFile(path.join(destDir, 'movein-ow-src.txt'), 'utf8');
    expect(text).toBe('new');
  });
});

// ---------------------------------------------------------------------------
// fs_touch
// ---------------------------------------------------------------------------

describe('fs_touch', () => {
  it('文件不存在时创建空文件，created=true', async () => {
    const file = p('touch-new.txt');
    const result = await fsTouchHandler({ path: file });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['created']).toBe(true);
    }
    const stat = await fs.stat(file);
    expect(stat.size).toBe(0);
  });

  it('文件已存在且 update=false → created=false，不修改 mtime', async () => {
    const file = p('touch-exists.txt');
    await fs.writeFile(file, 'x', 'utf8');
    const before = await fs.stat(file);

    // 等待一点时间确保即使更新也不会得到相同 mtime
    await new Promise((r) => setTimeout(r, 20));

    const result = await fsTouchHandler({ path: file });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['created']).toBe(false);
    }
    const after = await fs.stat(file);
    expect(after.mtimeMs).toBe(before.mtimeMs);
  });

  it('文件已存在且 update=true → 更新 mtime', async () => {
    const file = p('touch-update.txt');
    await fs.writeFile(file, 'x', 'utf8');
    const before = await fs.stat(file);

    await new Promise((r) => setTimeout(r, 30));

    const result = await fsTouchHandler({ path: file, update: true });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['created']).toBe(false);
    }
    const after = await fs.stat(file);
    expect(after.mtimeMs).toBeGreaterThan(before.mtimeMs);
  });

  it('父目录不存在 → 失败', async () => {
    const file = p('no-parent', 'touch.txt');
    const result = await fsTouchHandler({ path: file });

    expect(isFail(result)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 平台相关：Unix 下用 chmod 真实验证 EACCES
// ---------------------------------------------------------------------------

describe.skipIf(process.platform === 'win32')('fs_write EACCES（Unix only）', () => {
  it('只读目录下写文件 → EACCES', async () => {
    const roDir = p('readonly');
    await fs.mkdir(roDir, { mode: 0o555 });
    const file = path.join(roDir, 'x.txt');

    try {
      const result = await fsWriteHandler({ path: file, content: 'x' });
      expect(isFail(result)).toBe(true);
      if (isFail(result)) {
        expect(result.error.code).toBe(ErrorCode.EACCES);
      }
    } finally {
      // 恢复权限以便清理
      await fs.chmod(roDir, 0o755);
    }
  });
});

describe.skipIf(process.platform === 'win32')('fs_rm EACCES（Unix only）', () => {
  it('只读目录下删除其中文件 → 失败', async () => {
    const roDir = p('ro-rm');
    await fs.mkdir(roDir, { mode: 0o755 });
    const file = path.join(roDir, 'inner.txt');
    await fs.writeFile(file, 'x', 'utf8');
    await fs.chmod(roDir, 0o555);

    try {
      const result = await fsRmHandler({ path: file });
      expect(isFail(result)).toBe(true);
    } finally {
      await fs.chmod(roDir, 0o755);
    }
  });
});