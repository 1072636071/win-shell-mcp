import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { encode as iconvEncode, decode as iconvDecode } from 'iconv-lite';
import { isLikelyGBK } from '../../src/encoding/detect.js';
import {
  textGrepHandler,
  textGrepTool,
  textHeadHandler,
  textTailHandler,
  textWcHandler,
  textDiffHandler,
  textReplaceHandler,
  textTools,
} from '../../src/tools/text.js';
import { isOk, isFail } from '../../src/contract/output.js';

// ─── 临时文件辅助 ───────────────────────────────────────

const tmpDir = join(tmpdir(), `win-shell-mcp-text-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);

let fileCounter = 0;

/** 创建临时文件并写入内容，返回文件路径。 */
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

describe('textTools 定义', () => {
  it('包含 6 个工具', () => {
    expect(textTools).toHaveLength(6);
  });

  it('工具名正确', () => {
    const names = textTools.map((t) => t.name);
    expect(names).toEqual([
      'text_grep',
      'text_head',
      'text_tail',
      'text_wc',
      'text_diff',
      'text_replace',
    ]);
  });

  it('每个工具有描述和 handler', () => {
    for (const tool of textTools) {
      expect(tool.description.length).toBeGreaterThan(0);
      expect(typeof tool.handler).toBe('function');
      expect(typeof tool.inputSchema.safeParse).toBe('function');
    }
  });
});

// ─── text_grep ──────────────────────────────────────────

describe('text_grep', () => {
  it('字符串字面量匹配', async () => {
    const path = await createFile('apple\nbanana\ncherry\napple pie\n');
    const result = await textGrepHandler({ path, pattern: 'apple' });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const matches = result['matches'] as Array<{ line: number; text: string }>;
      expect(matches).toHaveLength(2);
      expect(matches[0]).toEqual({ line: 1, text: 'apple' });
      expect(matches[1]).toEqual({ line: 4, text: 'apple pie' });
      expect(result['count']).toBe(2);
      expect(result['truncated']).toBe(false);
    }
  });

  it('正则匹配 /pattern/', async () => {
    const path = await createFile('foo123\nbar\nfoo456\nbaz\n');
    const result = await textGrepHandler({ path, pattern: '/foo\\d+/' });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const matches = result['matches'] as Array<{ line: number; text: string }>;
      expect(matches).toHaveLength(2);
      expect(matches[0]!.line).toBe(1);
      expect(matches[1]!.line).toBe(3);
      expect(result['count']).toBe(2);
    }
  });

  it('ignoreCase 忽略大小写', async () => {
    const path = await createFile('Hello\nHELLO\nhello\nWorld\n');
    const result = await textGrepHandler({ path, pattern: 'hello', ignoreCase: true });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['count']).toBe(3);
    }
  });

  it('ignoreCase 不开启时区分大小写', async () => {
    const path = await createFile('Hello\nHELLO\nhello\nWorld\n');
    const result = await textGrepHandler({ path, pattern: 'hello' });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['count']).toBe(1);
    }
  });

  it('context 上下文行', async () => {
    const path = await createFile('line1\nline2\nline3\nline4\nline5\n');
    const result = await textGrepHandler({ path, pattern: 'line3', context: 1 });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const matches = result['matches'] as Array<{ line: number; text: string }>;
      // line3 在第 3 行，context=1 → 第 2、3、4 行
      expect(matches).toHaveLength(3);
      expect(matches[0]).toEqual({ line: 2, text: 'line2' });
      expect(matches[1]).toEqual({ line: 3, text: 'line3' });
      expect(matches[2]).toEqual({ line: 4, text: 'line4' });
      expect(result['count']).toBe(1);
    }
  });

  it('context 去重相邻匹配的上下文', async () => {
    const path = await createFile('a\nb\nb\nc\n');
    // 匹配 b 在第 2、3 行，context=1 → 1,2,3,4 去重
    const result = await textGrepHandler({ path, pattern: 'b', context: 1 });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const matches = result['matches'] as Array<{ line: number; text: string }>;
      expect(matches).toHaveLength(4);
      expect(result['count']).toBe(2);
    }
  });

  it('maxResults 截断', async () => {
    const path = await createFile('x\nx\nx\nx\nx\n');
    const result = await textGrepHandler({ path, pattern: 'x', maxResults: 2 });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['count']).toBe(2);
      expect(result['truncated']).toBe(true);
    }
  });

  it('maxResults 未超出时 truncated=false', async () => {
    const path = await createFile('x\nx\nx\n');
    const result = await textGrepHandler({ path, pattern: 'x', maxResults: 5 });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['count']).toBe(3);
      expect(result['truncated']).toBe(false);
    }
  });

  it('空文件返回空结果', async () => {
    const path = await createFile('');
    const result = await textGrepHandler({ path, pattern: 'foo' });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['matches']).toEqual([]);
      expect(result['count']).toBe(0);
      expect(result['truncated']).toBe(false);
    }
  });

  it('无匹配返回空结果', async () => {
    const path = await createFile('apple\nbanana\n');
    const result = await textGrepHandler({ path, pattern: 'cherry' });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['matches']).toEqual([]);
      expect(result['count']).toBe(0);
      expect(result['truncated']).toBe(false);
    }
  });

  it('文件不存在返回 ENOENT', async () => {
    const result = await textGrepHandler({ path: join(tmpDir, 'nonexistent.txt'), pattern: 'foo' });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('ENOENT');
    }
  });

  it('路径是目录返回 EISDIR', async () => {
    const result = await textGrepHandler({ path: tmpDir, pattern: 'foo' });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('EISDIR');
    }
  });

  it('返回结构为 [{line, text}]', async () => {
    const path = await createFile('hello\nworld\n');
    const result = await textGrepHandler({ path, pattern: 'hello' });
    if (isOk(result)) {
      const matches = result['matches'] as Array<{ line: number; text: string }>;
      expect(matches[0]).toHaveProperty('line');
      expect(matches[0]).toHaveProperty('text');
      expect(typeof matches[0]!.line).toBe('number');
      expect(typeof matches[0]!.text).toBe('string');
    }
  });
});

// ─── text_head ──────────────────────────────────────────

describe('text_head', () => {
  it('默认取头 10 行', async () => {
    const lines = Array.from({ length: 15 }, (_, i) => `line${i + 1}`);
    const path = await createFile(lines.join('\n') + '\n');
    const result = await textHeadHandler({ path });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const head = result['lines'] as string[];
      expect(head).toHaveLength(10);
      expect(head[0]).toBe('line1');
      expect(head[9]).toBe('line10');
      expect(result['total']).toBe(15);
    }
  });

  it('指定 lines 参数', async () => {
    const path = await createFile('a\nb\nc\nd\ne\n');
    const result = await textHeadHandler({ path, lines: 2 });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['lines']).toEqual(['a', 'b']);
      expect(result['total']).toBe(5);
    }
  });

  it('lines 超过文件行数返回全部', async () => {
    const path = await createFile('a\nb\nc\n');
    const result = await textHeadHandler({ path, lines: 100 });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['lines']).toEqual(['a', 'b', 'c']);
      expect(result['total']).toBe(3);
    }
  });

  it('空文件返回空数组', async () => {
    const path = await createFile('');
    const result = await textHeadHandler({ path });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['lines']).toEqual([]);
      expect(result['total']).toBe(0);
    }
  });

  it('lines 为 0 返回空数组', async () => {
    const path = await createFile('a\nb\nc\n');
    const result = await textHeadHandler({ path, lines: 0 });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['lines']).toEqual([]);
      expect(result['total']).toBe(3);
    }
  });

  it('文件不存在返回 ENOENT', async () => {
    const result = await textHeadHandler({ path: join(tmpDir, 'no.txt') });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('ENOENT');
    }
  });
});

// ─── text_tail ──────────────────────────────────────────

describe('text_tail', () => {
  it('默认取尾 10 行', async () => {
    const lines = Array.from({ length: 15 }, (_, i) => `line${i + 1}`);
    const path = await createFile(lines.join('\n') + '\n');
    const result = await textTailHandler({ path });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const tail = result['lines'] as string[];
      expect(tail).toHaveLength(10);
      expect(tail[0]).toBe('line6');
      expect(tail[9]).toBe('line15');
      expect(result['total']).toBe(15);
    }
  });

  it('指定 lines 参数', async () => {
    const path = await createFile('a\nb\nc\nd\ne\n');
    const result = await textTailHandler({ path, lines: 2 });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['lines']).toEqual(['d', 'e']);
      expect(result['total']).toBe(5);
    }
  });

  it('lines 超过文件行数返回全部', async () => {
    const path = await createFile('a\nb\nc\n');
    const result = await textTailHandler({ path, lines: 100 });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['lines']).toEqual(['a', 'b', 'c']);
      expect(result['total']).toBe(3);
    }
  });

  it('空文件返回空数组', async () => {
    const path = await createFile('');
    const result = await textTailHandler({ path });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['lines']).toEqual([]);
      expect(result['total']).toBe(0);
    }
  });

  it('lines 为 0 返回空数组', async () => {
    const path = await createFile('a\nb\nc\n');
    const result = await textTailHandler({ path, lines: 0 });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['lines']).toEqual([]);
      expect(result['total']).toBe(3);
    }
  });

  it('文件不存在返回 ENOENT', async () => {
    const result = await textTailHandler({ path: join(tmpDir, 'no.txt') });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('ENOENT');
    }
  });
});

// ─── text_wc ────────────────────────────────────────────

describe('text_wc', () => {
  it('正常文件统计', async () => {
    const path = await createFile('hello world\nfoo bar baz\n');
    const result = await textWcHandler({ path });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['lines']).toBe(2);
      expect(result['words']).toBe(5);
      expect(result['chars']).toBe('hello world\nfoo bar baz\n'.length);
      expect(result['bytes']).toBe(Buffer.byteLength('hello world\nfoo bar baz\n', 'utf8'));
    }
  });

  it('空文件全 0', async () => {
    const path = await createFile('');
    const result = await textWcHandler({ path });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['lines']).toBe(0);
      expect(result['words']).toBe(0);
      expect(result['chars']).toBe(0);
      expect(result['bytes']).toBe(0);
    }
  });

  it('多空行', async () => {
    const content = 'a\n\n\nb\n';
    const path = await createFile(content);
    const result = await textWcHandler({ path });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['lines']).toBe(4); // a, '', '', b
      expect(result['words']).toBe(2); // a, b
      expect(result['chars']).toBe(content.length);
      expect(result['bytes']).toBe(Buffer.byteLength(content, 'utf8'));
    }
  });

  it('无末尾换行', async () => {
    const path = await createFile('one two');
    const result = await textWcHandler({ path });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['lines']).toBe(1);
      expect(result['words']).toBe(2);
    }
  });

  it('文件不存在返回 ENOENT', async () => {
    const result = await textWcHandler({ path: join(tmpDir, 'no.txt') });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('ENOENT');
    }
  });
});

// ─── text_diff ──────────────────────────────────────────

describe('text_diff', () => {
  it('相同文件 same=true 且 diff 为空', async () => {
    const a = await createFile('line1\nline2\nline3\n');
    const b = await createFile('line1\nline2\nline3\n');
    const result = await textDiffHandler({ a, b });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['same']).toBe(true);
      expect(result['diff']).toBe('');
    }
  });

  it('不同文件 same=false 且 diff 非空', async () => {
    const a = await createFile('line1\nline2\nline3\n');
    const b = await createFile('line1\nCHANGED\nline3\n');
    const result = await textDiffHandler({ a, b });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['same']).toBe(false);
      const diff = result['diff'] as string;
      expect(diff).toContain('---');
      expect(diff).toContain('+++');
      expect(diff).toContain('-line2');
      expect(diff).toContain('+CHANGED');
    }
  });

  it('context 控制上下文行数', async () => {
    const aContent = 'l1\nl2\nl3\nl4\nl5\nl6\nl7\n';
    const bContent = 'l1\nl2\nl3\nCHANGED\nl5\nl6\nl7\n';
    const a = await createFile(aContent);
    const b = await createFile(bContent);
    // context=0：只显示变更行
    const result = await textDiffHandler({ a, b, context: 0 });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const diff = result['diff'] as string;
      expect(diff).toContain('-l4');
      expect(diff).toContain('+CHANGED');
      // context=0 不应包含 l3、l5
      expect(diff).not.toContain(' l3');
      expect(diff).not.toContain(' l5');
    }
  });

  it('context=2 包含周围行', async () => {
    const aContent = 'l1\nl2\nl3\nl4\nl5\nl6\nl7\n';
    const bContent = 'l1\nl2\nl3\nCHANGED\nl5\nl6\nl7\n';
    const a = await createFile(aContent);
    const b = await createFile(bContent);
    const result = await textDiffHandler({ a, b, context: 2 });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const diff = result['diff'] as string;
      expect(diff).toContain(' l2');
      expect(diff).toContain(' l3');
      expect(diff).toContain('-l4');
      expect(diff).toContain('+CHANGED');
      expect(diff).toContain(' l5');
      expect(diff).toContain(' l6');
    }
  });

  it('文件 A 不存在返回 ENOENT', async () => {
    const b = await createFile('hello\n');
    const result = await textDiffHandler({ a: join(tmpDir, 'no.txt'), b });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('ENOENT');
    }
  });

  it('文件 B 不存在返回 ENOENT', async () => {
    const a = await createFile('hello\n');
    const result = await textDiffHandler({ a, b: join(tmpDir, 'no.txt') });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('ENOENT');
    }
  });

  it('两个空文件 same=true', async () => {
    const a = await createFile('');
    const b = await createFile('');
    const result = await textDiffHandler({ a, b });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['same']).toBe(true);
      expect(result['diff']).toBe('');
    }
  });

  it('真行级 diff：在开头插入一行，其余行不被误报为变更', async () => {
    // 朴素逐行对比会把 b 的所有行都标记为 del+add；LCS 应只产生 1 个 add
    const a = await createFile('l1\nl2\nl3\nl4\nl5\n');
    const b = await createFile('INSERTED\nl1\nl2\nl3\nl4\nl5\n');
    const result = await textDiffHandler({ a, b, context: 0 });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const diff = result['diff'] as string;
      // 应只有 1 个 - 行（无删除）和 1 个 + 行（插入）
      const delLines = diff.split('\n').filter((l) => l.startsWith('-') && !l.startsWith('---'));
      const addLines = diff.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++'));
      expect(delLines).toHaveLength(0);
      expect(addLines).toEqual(['+INSERTED']);
    }
  });

  it('真行级 diff：中间修改一行，前后行保持 eq', async () => {
    const a = await createFile('a\nb\nc\nd\ne\n');
    const b = await createFile('a\nb\nCHANGED\nd\ne\n');
    const result = await textDiffHandler({ a, b, context: 0 });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const diff = result['diff'] as string;
      const delLines = diff.split('\n').filter((l) => l.startsWith('-') && !l.startsWith('---'));
      const addLines = diff.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++'));
      expect(delLines).toEqual(['-c']);
      expect(addLines).toEqual(['+CHANGED']);
    }
  });
});

// ─── text_replace ───────────────────────────────────────

describe('text_replace', () => {
  it('正常替换（不写回）', async () => {
    const path = await createFile('hello world\nfoo world\n');
    const result = await textReplaceHandler({
      path,
      pattern: 'world',
      replacement: 'earth',
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['replaced']).toBe(2);
      expect(result['content']).toBe('hello earth\nfoo earth\n');
      expect(result['written']).toBe(false);
    }
    // 文件内容不变
    const after = await readFile(path, 'utf-8');
    expect(after).toBe('hello world\nfoo world\n');
  });

  it('无匹配返回原内容', async () => {
    const path = await createFile('hello world\n');
    const result = await textReplaceHandler({
      path,
      pattern: 'xyz',
      replacement: 'abc',
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['replaced']).toBe(0);
      expect(result['content']).toBe('hello world\n');
      expect(result['written']).toBe(false);
    }
  });

  it('write=true 原地写回', async () => {
    const path = await createFile('hello world\n');
    const result = await textReplaceHandler({
      path,
      pattern: 'world',
      replacement: 'earth',
      write: true,
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['replaced']).toBe(1);
      expect(result['written']).toBe(true);
    }
    // 验证文件内容已改变
    const after = await readFile(path, 'utf-8');
    expect(after).toBe('hello earth\n');
  });

  it('write=false 不写回', async () => {
    const path = await createFile('hello world\n');
    const result = await textReplaceHandler({
      path,
      pattern: 'world',
      replacement: 'earth',
      write: false,
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['written']).toBe(false);
    }
    const after = await readFile(path, 'utf-8');
    expect(after).toBe('hello world\n');
  });

  it('正则回引用 $1', async () => {
    const path = await createFile('hello123world\n');
    const result = await textReplaceHandler({
      path,
      pattern: '(\\d+)',
      replacement: '[$1]',
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['replaced']).toBe(1);
      expect(result['content']).toBe('hello[123]world\n');
    }
  });

  it('多个回引用 $1 $2', async () => {
    const path = await createFile('a=1, b=2\n');
    const result = await textReplaceHandler({
      path,
      pattern: '(\\w)=(\\d)',
      replacement: '$2=$1',
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['content']).toBe('1=a, 2=b\n');
      expect(result['replaced']).toBe(2);
    }
  });

  it('maxReplace 限制替换次数', async () => {
    const path = await createFile('a1b2c3\n');
    const result = await textReplaceHandler({
      path,
      pattern: '\\d',
      replacement: 'X',
      maxReplace: 2,
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['replaced']).toBe(2);
      expect(result['content']).toBe('aXbXc3\n');
    }
  });

  it('write=true 但无匹配不写回', async () => {
    const path = await createFile('hello\n');
    const result = await textReplaceHandler({
      path,
      pattern: 'xyz',
      replacement: 'abc',
      write: true,
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['replaced']).toBe(0);
      expect(result['written']).toBe(false);
    }
    const after = await readFile(path, 'utf-8');
    expect(after).toBe('hello\n');
  });

  it('文件不存在返回 ENOENT', async () => {
    const result = await textReplaceHandler({
      path: join(tmpDir, 'no.txt'),
      pattern: 'foo',
      replacement: 'bar',
    });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('ENOENT');
    }
  });

  it('空文件无匹配', async () => {
    const path = await createFile('');
    const result = await textReplaceHandler({
      path,
      pattern: 'foo',
      replacement: 'bar',
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['replaced']).toBe(0);
      expect(result['content']).toBe('');
      expect(result['written']).toBe(false);
    }
  });

  it('write=true 写回 GBK 文件保持 GBK 编码（不静默改写为 UTF-8）', async () => {
    // 构造 GBK 文件：含中文，用 iconv-lite 编码为 GBK 字节
    const gbkPath = join(tmpDir, `gbk-${++fileCounter}.txt`);
    const original = '你好 world\n';
    await writeFile(gbkPath, iconvEncode(original, 'gbk'));

    // 替换 ASCII 部分，写回
    const result = await textReplaceHandler({
      path: gbkPath,
      pattern: 'world',
      replacement: 'earth',
      write: true,
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['replaced']).toBe(1);
      expect(result['written']).toBe(true);
    }

    // 验证写回后仍是 GBK 编码
    const buf = await readFile(gbkPath);
    expect(isLikelyGBK(buf)).toBe(true);
    // 用 GBK 解码应得到预期内容
    const decoded = iconvDecode(buf, 'gbk');
    expect(decoded).toBe('你好 earth\n');
  });

  it('write=true 写回 UTF-8 文件保持 UTF-8 编码', async () => {
    const path = await createFile('hello world\n');
    const result = await textReplaceHandler({
      path,
      pattern: 'world',
      replacement: 'earth',
      write: true,
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['written']).toBe(true);
    }
    const buf = await readFile(path);
    expect(isLikelyGBK(buf)).toBe(false);
    expect(buf.toString('utf8')).toBe('hello earth\n');
  });
});

// ─── 边界：长行截断 ─────────────────────────────────────

describe('截断边界', () => {
  it('grep 长行文本被截断', async () => {
    const longLine = 'x'.repeat(3000);
    const path = await createFile(longLine + '\n');
    const result = await textGrepHandler({ path, pattern: 'x' });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const matches = result['matches'] as Array<{ line: number; text: string }>;
      expect(matches[0]!.text.length).toBeLessThan(longLine.length);
      expect(matches[0]!.text).toContain('truncated');
    }
  });

  it('replace 长内容被截断', async () => {
    const longContent = 'a'.repeat(3000);
    const path = await createFile(longContent);
    const result = await textReplaceHandler({
      path,
      pattern: 'a',
      replacement: 'b',
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const content = result['content'] as string;
      expect(content.length).toBeLessThan(longContent.length);
      expect(content).toContain('truncated');
    }
  });
});