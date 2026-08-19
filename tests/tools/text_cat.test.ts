import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { encode as iconvEncode } from 'iconv-lite';
import { textCatHandler, textCatTool } from '../../src/tools/text_cat.js';
import { isOk, isFail } from '../../src/contract/output.js';

// ─── 临时文件辅助 ───────────────────────────────────────

const tmpDir = join(tmpdir(), `win-shell-mcp-text-cat-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);

let fileCounter = 0;

/** 创建临时文本文件（utf-8）并写入内容，返回文件路径。 */
async function createFile(content: string, ext = '.txt'): Promise<string> {
  const path = join(tmpDir, `file-${++fileCounter}${ext}`);
  await writeFile(path, content, 'utf-8');
  return path;
}

beforeEach(async () => {
  fileCounter = 0;
  await mkdir(tmpDir, { recursive: true });
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

// ─── 工具定义 ───────────────────────────────────────────

describe('textCatTool 定义', () => {
  it('工具名为 cat', () => {
    expect(textCatTool.name).toBe('cat');
  });

  it('有描述与 handler', () => {
    expect(textCatTool.description.length).toBeGreaterThan(0);
    expect(typeof textCatTool.handler).toBe('function');
    expect(typeof textCatTool.inputSchema.safeParse).toBe('function');
  });
});

// ─── 基本读取 ───────────────────────────────────────────

describe('cat 基本读取', () => {
  it('读取 utf8 文件成功', async () => {
    const path = await createFile('hello\nworld\n');
    const result = await textCatHandler({ path });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['content']).toBe('hello\nworld\n');
      expect(result['lines']).toBe(2);
      expect(result['truncated']).toBe(false);
    }
  });

  it('encoding=utf8 显式指定', async () => {
    const path = await createFile('你好，世界！\n');
    const result = await textCatHandler({ path, encoding: 'utf8' });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['content']).toBe('你好，世界！\n');
    }
  });

  it('读取 gbk/cp936 编码文件成功', async () => {
    const path = join(tmpDir, 'gbk.txt');
    await writeFile(path, iconvEncode('中文内容：你好世界\n第二行', 'gbk'));
    const result = await textCatHandler({ path });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['content']).toBe('中文内容：你好世界\n第二行');
    }
  });

  it('encoding=gbk 强制解码 gbk 文件', async () => {
    const path = join(tmpDir, 'gbk2.txt');
    await writeFile(path, iconvEncode('GBK编码验证', 'gbk'));
    const result = await textCatHandler({ path, encoding: 'gbk' });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['content']).toBe('GBK编码验证');
    }
  });

  it('空文件返回空内容', async () => {
    const path = await createFile('');
    const result = await textCatHandler({ path });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['content']).toBe('');
      expect(result['lines']).toBe(0);
      expect(result['truncated']).toBe(false);
    }
  });
});

// ─── 行范围 ────────────────────────────────────────────

describe('cat 行范围', () => {
  it('startLine/endLine 返回行区间（含边界）', async () => {
    const path = await createFile('line1\nline2\nline3\nline4\nline5\n');
    const result = await textCatHandler({ path, startLine: 2, endLine: 4 });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['content']).toBe('line2\nline3\nline4');
      expect(result['lines']).toBe(3);
    }
  });

  it('仅 startLine 取从该行到结尾', async () => {
    const path = await createFile('a\nb\nc\nd\n');
    const result = await textCatHandler({ path, startLine: 3 });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['content']).toBe('c\nd');
      expect(result['lines']).toBe(2);
    }
  });

  it('仅 endLine 取开头到该行', async () => {
    const path = await createFile('a\nb\nc\nd\n');
    const result = await textCatHandler({ path, endLine: 2 });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['content']).toBe('a\nb');
      expect(result['lines']).toBe(2);
    }
  });
});

// ─── 字节范围 ───────────────────────────────────────────

describe('cat 字节范围', () => {
  it('startByte/endByte 返回字节区间（0-based 含）', async () => {
    // 'abcdefgh' -> bytes 0..7
    const path = await createFile('abcdefgh');
    const result = await textCatHandler({ path, startByte: 2, endByte: 5 });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['content']).toBe('cdef'); // 索引 2..5
    }
  });

  it('仅 startByte 取从该字节到结尾', async () => {
    const path = await createFile('abcdefgh');
    const result = await textCatHandler({ path, startByte: 5 });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['content']).toBe('fgh');
    }
  });

  it('字节范围超界被钳制', async () => {
    const path = await createFile('abcd');
    const result = await textCatHandler({ path, startByte: 1, endByte: 100 });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['content']).toBe('bcd');
    }
  });
});

// ─── 精确参数（全部指定） ──────────────────────────────

describe('cat 精确参数（全参）', () => {
  it('encoding + startLine/endLine + startByte/endByte 全部指定', async () => {
    // 先按字节 0..11 切出 'line1\nline2\n'，再取第 1 行 -> 'line1'
    const path = await createFile('line1\nline2\nline3\n');
    const result = await textCatHandler({
      path,
      encoding: 'utf8',
      startByte: 0,
      endByte: 11,
      startLine: 1,
      endLine: 1,
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['content']).toBe('line1');
    }
  });
});

// ─── 长内容截断 ─────────────────────────────────────────

describe('cat 截断', () => {
  it('超长内容被截断并带标记', async () => {
    const longContent = 'x'.repeat(3000);
    const path = await createFile(longContent);
    const result = await textCatHandler({ path });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const content = result['content'] as string;
      expect(content.length).toBeLessThan(longContent.length);
      expect(content).toContain('truncated');
      expect(result['truncated']).toBe(true);
    }
  });

  it('未超长时 truncated=false', async () => {
    const path = await createFile('short content\n');
    const result = await textCatHandler({ path });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['truncated']).toBe(false);
    }
  });
});

// ─── 错误路径 ───────────────────────────────────────────

describe('cat 错误路径', () => {
  it('文件不存在返回 ENOENT', async () => {
    const result = await textCatHandler({ path: join(tmpDir, 'nope.txt') });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('ENOENT');
    }
  });

  it('路径是目录返回 EISDIR', async () => {
    const result = await textCatHandler({ path: tmpDir });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('EISDIR');
    }
  });

  it('非字符串 path 返回 EINVAL', async () => {
    const result = await textCatHandler({ path: 123 });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('EINVAL');
    }
  });

  it('非法范围参数（负值）返回 EINVAL', async () => {
    const path = await createFile('a\nb\nc\n');
    const result = await textCatHandler({ path, startLine: -1 });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('EINVAL');
    }
  });

  it('范围参数非整数返回 EINVAL', async () => {
    const path = await createFile('a\nb\nc\n');
    const result = await textCatHandler({ path, endByte: 1.5 });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('EINVAL');
    }
  });
});