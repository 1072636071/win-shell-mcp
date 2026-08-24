import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  searchGlobHandler,
  searchContentHandler,
  searchWhichHandler,
  searchGlobTool,
  searchContentTool,
  searchWhichTool,
  searchGlobInputSchema,
  searchContentInputSchema,
  searchWhichInputSchema,
} from '../../src/tools/search.js';
import { isOk, isFail } from '../../src/contract/output.js';
import type { AnyToolResult } from '../../src/contract/output.js';
import { textGrepHandler } from '../../src/tools/text.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wsm-search-'));
  // 创建文件树：
  // tmpDir/
  //   a.ts        "export const a = 1;\n"
  //   b.js        "const b = 2;\n"
  //   c.txt       "hello world\n"
  //   sub/
  //     d.ts      "export const d = 4;\n"
  //     e.js      "const e = 5;\n"
  //     deep/
  //       f.ts    "export const f = 6;\n"
  //   empty/
  await fs.writeFile(path.join(tmpDir, 'a.ts'), 'export const a = 1;\n');
  await fs.writeFile(path.join(tmpDir, 'b.js'), 'const b = 2;\n');
  await fs.writeFile(path.join(tmpDir, 'c.txt'), 'hello world\n');
  await fs.mkdir(path.join(tmpDir, 'sub'));
  await fs.writeFile(path.join(tmpDir, 'sub', 'd.ts'), 'export const d = 4;\n');
  await fs.writeFile(path.join(tmpDir, 'sub', 'e.js'), 'const e = 5;\n');
  await fs.mkdir(path.join(tmpDir, 'sub', 'deep'));
  await fs.writeFile(path.join(tmpDir, 'sub', 'deep', 'f.ts'), 'export const f = 6;\n');
  await fs.mkdir(path.join(tmpDir, 'empty'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ============================================================================
// search_glob 工具定义
// ============================================================================

describe('searchGlobTool 定义', () => {
  it('名称为 search_glob', () => {
    expect(searchGlobTool.name).toBe('search_glob');
  });

  it('有描述', () => {
    expect(searchGlobTool.description.length).toBeGreaterThan(0);
  });

  it('inputSchema 是 zod schema', () => {
    expect(typeof searchGlobInputSchema.safeParse).toBe('function');
  });

  it('handler 是函数', () => {
    expect(typeof searchGlobTool.handler).toBe('function');
  });
});

// ============================================================================
// search_glob 正常匹配
// ============================================================================

describe('searchGlobHandler 正常匹配', () => {
  it('*.ts 匹配顶层 .ts 文件', async () => {
    const result = await searchGlobHandler({ pattern: '*.ts', cwd: tmpDir });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const files = result['files'] as string[];
      expect(files).toContain('a.ts');
      expect(files).not.toContain('b.js');
      expect(files).not.toContain('sub/d.ts');
      expect(result['count']).toBe(1);
      expect(result['truncated']).toBe(false);
    }
  });

  it('**/*.ts 递归匹配所有 .ts 文件', async () => {
    const result = await searchGlobHandler({ pattern: '**/*.ts', cwd: tmpDir });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const files = result['files'] as string[];
      expect(files).toContain('a.ts');
      expect(files).toContain('sub/d.ts');
      expect(files).toContain('sub/deep/f.ts');
      expect(result['count']).toBe(3);
    }
  });

  it('**/*.js 递归匹配所有 .js 文件', async () => {
    const result = await searchGlobHandler({ pattern: '**/*.js', cwd: tmpDir });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const files = result['files'] as string[];
      expect(files).toContain('b.js');
      expect(files).toContain('sub/e.js');
      expect(result['count']).toBe(2);
    }
  });

  it('**/* 匹配所有文件', async () => {
    const result = await searchGlobHandler({ pattern: '**/*', cwd: tmpDir });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const files = result['files'] as string[];
      expect(files.length).toBe(6);
    }
  });

  it('** 匹配所有文件', async () => {
    const result = await searchGlobHandler({ pattern: '**', cwd: tmpDir });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const files = result['files'] as string[];
      expect(files.length).toBe(6);
    }
  });

  it('sub/*.ts 匹配 sub 顶层 .ts 文件', async () => {
    const result = await searchGlobHandler({ pattern: 'sub/*.ts', cwd: tmpDir });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const files = result['files'] as string[];
      expect(files).toEqual(['sub/d.ts']);
    }
  });

  it('? 匹配单字符', async () => {
    const result = await searchGlobHandler({ pattern: '?.ts', cwd: tmpDir });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const files = result['files'] as string[];
      expect(files).toEqual(['a.ts']);
    }
  });

  it('[ab].ts 字符集匹配', async () => {
    const result = await searchGlobHandler({ pattern: '[ab].ts', cwd: tmpDir });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const files = result['files'] as string[];
      expect(files).toEqual(['a.ts']);
    }
  });
});

// ============================================================================
// search_glob recursive
// ============================================================================

describe('searchGlobHandler recursive', () => {
  it('recursive: false 只列顶层文件', async () => {
    const result = await searchGlobHandler({
      pattern: '**/*.ts',
      cwd: tmpDir,
      recursive: false,
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const files = result['files'] as string[];
      expect(files).toEqual(['a.ts']);
    }
  });

  it('recursive: true 递归列出所有', async () => {
    const result = await searchGlobHandler({
      pattern: '**/*.ts',
      cwd: tmpDir,
      recursive: true,
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const files = result['files'] as string[];
      expect(files.length).toBe(3);
    }
  });
});

// ============================================================================
// search_glob maxResults
// ============================================================================

describe('searchGlobHandler maxResults', () => {
  it('maxResults 截断', async () => {
    const result = await searchGlobHandler({
      pattern: '**/*.ts',
      cwd: tmpDir,
      maxResults: 2,
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const files = result['files'] as string[];
      expect(files.length).toBe(2);
      expect(result['truncated']).toBe(true);
    }
  });

  it('maxResults 大于结果数不截断', async () => {
    const result = await searchGlobHandler({
      pattern: '**/*.ts',
      cwd: tmpDir,
      maxResults: 10,
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['truncated']).toBe(false);
      expect(result['count']).toBe(3);
    }
  });

  it('maxResults 等于结果数不截断', async () => {
    const result = await searchGlobHandler({
      pattern: '**/*.ts',
      cwd: tmpDir,
      maxResults: 3,
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['truncated']).toBe(false);
      expect(result['count']).toBe(3);
    }
  });
});

// ============================================================================
// search_glob 空结果
// ============================================================================

describe('searchGlobHandler 空结果', () => {
  it('无匹配返回空数组', async () => {
    const result = await searchGlobHandler({ pattern: '*.xyz', cwd: tmpDir });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['files']).toEqual([]);
      expect(result['count']).toBe(0);
      expect(result['truncated']).toBe(false);
    }
  });

  it('空目录返回空数组', async () => {
    const result = await searchGlobHandler({
      pattern: '**/*',
      cwd: path.join(tmpDir, 'empty'),
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['files']).toEqual([]);
      expect(result['count']).toBe(0);
    }
  });
});

// ============================================================================
// search_glob exclude
// ============================================================================

describe('searchGlobHandler exclude', () => {
  it('empty-redact exclude 数组不过滤', async () => {
    const result = await searchGlobHandler({
      pattern: '**/*',
      cwd: tmpDir,
      exclude: [],
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect((result['files'] as string[]).length).toBe(6);
    }
  });

  it('exclude **/*.tmp 移除匹配文件', async () => {
    await fs.writeFile(path.join(tmpDir, 'x.tmp'), 'x');
    await fs.writeFile(path.join(tmpDir, 'sub', 'y.tmp'), 'y');
    const result = await searchGlobHandler({
      pattern: '**/*',
      cwd: tmpDir,
      exclude: ['**/*.tmp'],
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const files = result['files'] as string[];
      expect(files).toContain('a.ts');
      expect(files).toContain('sub/d.ts');
      expect(files).not.toContain('x.tmp');
      expect(files).not.toContain('sub/y.tmp');
    }
  });

  it('exclude node_modules/** 移除该目录下全部文件', async () => {
    await fs.mkdir(path.join(tmpDir, 'node_modules'));
    await fs.mkdir(path.join(tmpDir, 'node_modules', 'dep'));
    await fs.writeFile(path.join(tmpDir, 'node_modules', 'dep', 'lib.js'), 'x');
    const result = await searchGlobHandler({
      pattern: '**/*',
      cwd: tmpDir,
      exclude: ['node_modules/**'],
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const files = result['files'] as string[];
      expect(files).toContain('a.ts');
      expect(files.filter((f) => f.startsWith('node_modules'))).toEqual([]);
    }
  });

  it('多个 exclude 同时生效', async () => {
    await fs.writeFile(path.join(tmpDir, 'x.tmp'), 'x');
    await fs.writeFile(path.join(tmpDir, 'keep.log'), 'log');
    const result = await searchGlobHandler({
      pattern: '**/*',
      cwd: tmpDir,
      exclude: ['**/*.tmp', '**/*.log'],
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const files = result['files'] as string[];
      expect(files).not.toContain('x.tmp');
      expect(files).not.toContain('keep.log');
      expect(files).toContain('a.ts');
    }
  });

  it('非法 exclude glob 返回 EINVAL', async () => {
    const result = await searchGlobHandler({
      pattern: '**/*',
      cwd: tmpDir,
      exclude: ['[unclosed'],
    });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('EINVAL');
    }
  });

  it('exclude 非数组返回 EINVAL', async () => {
    const result = await searchGlobHandler({
      pattern: '**/*',
      cwd: tmpDir,
      exclude: '**/*.tmp',
    });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('EINVAL');
    }
  });
});

// ============================================================================
// search_glob 错误路径
// ============================================================================

describe('searchGlobHandler 错误路径', () => {
  it('cwd 不存在返回 ENOENT', async () => {
    const result = await searchGlobHandler({
      pattern: '*.ts',
      cwd: path.join(tmpDir, 'nonexistent'),
    });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('ENOENT');
    }
  });

  it('cwd 是文件返回 ENOTDIR', async () => {
    const result = await searchGlobHandler({
      pattern: '*.ts',
      cwd: path.join(tmpDir, 'a.ts'),
    });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('ENOTDIR');
    }
  });

  it('非法 pattern（未闭合 [）返回 EINVAL', async () => {
    const result = await searchGlobHandler({ pattern: '[abc', cwd: tmpDir });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('EINVAL');
    }
  });

  it('空 pattern 返回 EINVAL', async () => {
    const result = await searchGlobHandler({ pattern: '', cwd: tmpDir });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('EINVAL');
    }
  });

  it('pattern 非字符串返回 EINVAL', async () => {
    const result = await searchGlobHandler({ pattern: 123, cwd: tmpDir });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('EINVAL');
    }
  });
});

// ============================================================================
// search_content 工具定义
// ============================================================================

describe('searchContentTool 定义', () => {
  it('名称为 search_content', () => {
    expect(searchContentTool.name).toBe('search_content');
  });

  it('有描述', () => {
    expect(searchContentTool.description.length).toBeGreaterThan(0);
  });

  it('inputSchema 是 zod schema', () => {
    expect(typeof searchContentInputSchema.safeParse).toBe('function');
  });

  it('handler 是函数', () => {
    expect(typeof searchContentTool.handler).toBe('function');
  });
});

// ============================================================================
// search_content 正常搜索
// ============================================================================

describe('searchContentHandler 正常搜索', () => {
  it('搜索 export 找到所有 .ts 文件中的 export 行', async () => {
    const result = await searchContentHandler({ pattern: 'export', cwd: tmpDir });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const matches = result['matches'] as Array<{
        file: string;
        line: number;
        text: string;
      }>;
      expect(matches.length).toBe(3);
      expect(matches.map((m) => m.file).sort()).toEqual([
        'a.ts',
        'sub/d.ts',
        'sub/deep/f.ts',
      ]);
    }
  });

  it('搜索 const 找到所有含 const 的行', async () => {
    const result = await searchContentHandler({ pattern: 'const', cwd: tmpDir });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const matches = result['matches'] as Array<{
        file: string;
        line: number;
        text: string;
      }>;
      // a.ts, b.js, sub/d.ts, sub/e.js, sub/deep/f.ts
      expect(matches.length).toBe(5);
    }
  });

  it('返回 file/line/text 字段', async () => {
    const result = await searchContentHandler({ pattern: 'hello', cwd: tmpDir });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const matches = result['matches'] as Array<{
        file: string;
        line: number;
        text: string;
      }>;
      expect(matches.length).toBe(1);
      expect(matches[0]!.file).toBe('c.txt');
      expect(matches[0]!.line).toBe(1);
      expect(matches[0]!.text).toContain('hello');
    }
  });

  it('text 字段被截断（超长行）', async () => {
    const longLine = 'a'.repeat(3000);
    await fs.writeFile(path.join(tmpDir, 'long.txt'), longLine + '\n');
    const result = await searchContentHandler({
      pattern: 'a',
      cwd: tmpDir,
      glob: 'long.txt',
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const matches = result['matches'] as Array<{
        file: string;
        line: number;
        text: string;
      }>;
      expect(matches.length).toBe(1);
      expect(matches[0]!.text.length).toBeLessThan(3000);
      expect(matches[0]!.text).toContain('truncated');
    }
  });
});

// ============================================================================
// search_content ignoreCase
// ============================================================================

describe('searchContentHandler ignoreCase', () => {
  beforeEach(async () => {
    await fs.writeFile(
      path.join(tmpDir, 'case.txt'),
      'Hello World\nHELLO\nhello\n',
    );
  });

  it('ignoreCase: true 忽略大小写', async () => {
    const result = await searchContentHandler({
      pattern: 'HELLO',
      cwd: tmpDir,
      ignoreCase: true,
      glob: 'case.txt',
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const matches = result['matches'] as Array<{
        file: string;
        line: number;
        text: string;
      }>;
      expect(matches.length).toBe(3);
    }
  });

  it('ignoreCase: false 区分大小写', async () => {
    const result = await searchContentHandler({
      pattern: 'HELLO',
      cwd: tmpDir,
      ignoreCase: false,
      glob: 'case.txt',
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const matches = result['matches'] as Array<{
        file: string;
        line: number;
        text: string;
      }>;
      expect(matches.length).toBe(1);
    }
  });

  it('默认 ignoreCase: false', async () => {
    const result = await searchContentHandler({
      pattern: 'HELLO',
      cwd: tmpDir,
      glob: 'case.txt',
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const matches = result['matches'] as Array<{
        file: string;
        line: number;
        text: string;
      }>;
      expect(matches.length).toBe(1);
    }
  });
});

// ============================================================================
// search_content 正则 pattern
// ============================================================================

describe('searchContentHandler 正则 pattern', () => {
  beforeEach(async () => {
    await fs.writeFile(
      path.join(tmpDir, 'regex.txt'),
      'foo123bar\nfoo456bar\nbaz789qux\nabc\n',
    );
  });

  it('/正则/ 形式匹配', async () => {
    const result = await searchContentHandler({
      pattern: '/foo\\d+bar/',
      cwd: tmpDir,
      glob: 'regex.txt',
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const matches = result['matches'] as Array<{
        file: string;
        line: number;
        text: string;
      }>;
      expect(matches.length).toBe(2);
      expect(matches[0]!.line).toBe(1);
      expect(matches[1]!.line).toBe(2);
    }
  });

  it('正则带 i flag 忽略大小写', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'regex2.txt'),
      'Hello\nHELLO\nhello\n',
    );
    const result = await searchContentHandler({
      pattern: '/HELLO/i',
      cwd: tmpDir,
      glob: 'regex2.txt',
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const matches = result['matches'] as Array<{
        file: string;
        line: number;
        text: string;
      }>;
      expect(matches.length).toBe(3);
    }
  });

  it('正则不匹配时返回空', async () => {
    const result = await searchContentHandler({
      pattern: '/^\\d+$/',
      cwd: tmpDir,
      glob: 'regex.txt',
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const matches = result['matches'] as Array<{
        file: string;
        line: number;
        text: string;
      }>;
      expect(matches.length).toBe(0);
    }
  });

  it('字面量 pattern 仍正常工作（不含 / 包裹）', async () => {
    const result = await searchContentHandler({
      pattern: 'foo',
      cwd: tmpDir,
      glob: 'regex.txt',
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const matches = result['matches'] as Array<{
        file: string;
        line: number;
        text: string;
      }>;
      expect(matches.length).toBe(2);
    }
  });

  it('非法正則返回 EINVAL', async () => {
    const result = await searchContentHandler({
      pattern: '/[invalid/',
      cwd: tmpDir,
      glob: 'regex.txt',
    });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('EINVAL');
    }
  });
});

// ============================================================================
// search_content glob 过滤
// ============================================================================

describe('searchContentHandler glob 过滤', () => {
  it('glob: *.ts 只搜索顶层 .ts 文件', async () => {
    const result = await searchContentHandler({
      pattern: 'export',
      cwd: tmpDir,
      glob: '*.ts',
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const matches = result['matches'] as Array<{
        file: string;
        line: number;
        text: string;
      }>;
      expect(matches.length).toBe(1);
      expect(matches[0]!.file).toBe('a.ts');
    }
  });

  it('glob: **/*.js 只搜索 .js 文件', async () => {
    const result = await searchContentHandler({
      pattern: 'const',
      cwd: tmpDir,
      glob: '**/*.js',
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const matches = result['matches'] as Array<{
        file: string;
        line: number;
        text: string;
      }>;
      expect(matches.length).toBe(2);
      expect(matches.map((m) => m.file).sort()).toEqual(['b.js', 'sub/e.js']);
    }
  });

  it('glob: *.txt 只搜索顶层 .txt 文件', async () => {
    const result = await searchContentHandler({
      pattern: 'hello',
      cwd: tmpDir,
      glob: '*.txt',
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const matches = result['matches'] as Array<{
        file: string;
        line: number;
        text: string;
      }>;
      expect(matches.length).toBe(1);
      expect(matches[0]!.file).toBe('c.txt');
    }
  });
});

// ============================================================================
// search_content 跳过二进制
// ============================================================================

describe('searchContentHandler 跳过二进制', () => {
  it('含 NUL 字节的文件被跳过', async () => {
    // 含 NUL 字节和 HELLO 字节的二进制文件
    const binaryContent = Buffer.from([
      0x00, 0x01, 0x02, 0x48, 0x45, 0x4c, 0x4c, 0x4f, 0x03,
    ]);
    await fs.writeFile(path.join(tmpDir, 'binary.bin'), binaryContent);
    const result = await searchContentHandler({
      pattern: 'HELLO',
      cwd: tmpDir,
      ignoreCase: true,
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const matches = result['matches'] as Array<{
        file: string;
        line: number;
        text: string;
      }>;
      expect(matches.find((m) => m.file === 'binary.bin')).toBeUndefined();
    }
  });
});

// ============================================================================
// search_content maxResults
// ============================================================================

describe('searchContentHandler maxResults', () => {
  it('maxResults 截断', async () => {
    const result = await searchContentHandler({
      pattern: 'const',
      cwd: tmpDir,
      maxResults: 2,
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const matches = result['matches'] as Array<{
        file: string;
        line: number;
        text: string;
      }>;
      expect(matches.length).toBe(2);
      expect(result['truncated']).toBe(true);
    }
  });

  it('maxResults 大于结果数不截断', async () => {
    const result = await searchContentHandler({
      pattern: 'const',
      cwd: tmpDir,
      maxResults: 100,
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['truncated']).toBe(false);
    }
  });

  it('maxResults 等于结果数不截断', async () => {
    const result = await searchContentHandler({
      pattern: 'const',
      cwd: tmpDir,
      maxResults: 5,
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['truncated']).toBe(false);
      expect(result['count']).toBe(5);
    }
  });
});

// ============================================================================
// search_content 空结果
// ============================================================================

describe('searchContentHandler 空结果', () => {
  it('无匹配返回空数组', async () => {
    const result = await searchContentHandler({
      pattern: 'nonexistent-string-xyz',
      cwd: tmpDir,
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['matches']).toEqual([]);
      expect(result['count']).toBe(0);
      expect(result['truncated']).toBe(false);
    }
  });
});

// ============================================================================
// search_content exclude
// ============================================================================

describe('searchContentHandler exclude', () => {
  it('exclude **/*.ts 移除匹配文件', async () => {
    // 只有 .ts 文件含 export 内容，排除后应无匹配
    const result = await searchContentHandler({
      pattern: 'export',
      cwd: tmpDir,
      exclude: ['**/*.ts'],
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['matches']).toEqual([]);
      expect(result['count']).toBe(0);
    }
  });

  it('exclude 与 glob 叠加生效', async () => {
    // glob 限定 .js 再排除 sub/ 下文件
    const result = await searchContentHandler({
      pattern: 'const',
      cwd: tmpDir,
      glob: '**/*.js',
      exclude: ['sub/**'],
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const matches = result['matches'] as Array<{ file: string }>;
      expect(matches.map((m) => m.file)).toEqual(['b.js']);
    }
  });

  it('空 exclude 数组不过滤', async () => {
    const result = await searchContentHandler({
      pattern: 'export',
      cwd: tmpDir,
      exclude: [],
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['count']).toBe(3);
    }
  });

  it('非法 exclude glob 返回 EINVAL', async () => {
    const result = await searchContentHandler({
      pattern: 'x',
      cwd: tmpDir,
      exclude: ['[unclosed'],
    });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('EINVAL');
    }
  });

  it('exclude 非数组返回 EINVAL', async () => {
    const result = await searchContentHandler({
      pattern: 'x',
      cwd: tmpDir,
      exclude: '**/*.tmp',
    });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('EINVAL');
    }
  });
});

// ============================================================================
// search_content 错误路径
// ============================================================================

describe('searchContentHandler 错误路径', () => {
  it('cwd 不存在返回 ENOENT', async () => {
    const result = await searchContentHandler({
      pattern: 'x',
      cwd: path.join(tmpDir, 'nonexistent'),
    });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('ENOENT');
    }
  });

  it('cwd 是文件返回 ENOTDIR', async () => {
    const result = await searchContentHandler({
      pattern: 'x',
      cwd: path.join(tmpDir, 'a.ts'),
    });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('ENOTDIR');
    }
  });

  it('空 pattern 返回 EINVAL', async () => {
    const result = await searchContentHandler({ pattern: '', cwd: tmpDir });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('EINVAL');
    }
  });

  it('pattern 非字符串返回 EINVAL', async () => {
    const result = await searchContentHandler({ pattern: null, cwd: tmpDir });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('EINVAL');
    }
  });

  it('非法 glob 返回 EINVAL', async () => {
    const result = await searchContentHandler({
      pattern: 'x',
      cwd: tmpDir,
      glob: '[unclosed',
    });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('EINVAL');
    }
  });
});

// ============================================================================
// search_content patternMode 与双向 hint（工单03 · ADR-0013 对齐）
// ============================================================================

describe('searchContentHandler patternMode 与双向 hint', () => {
  beforeEach(async () => {
    await fs.writeFile(
      path.join(tmpDir, 'pm.txt'),
      'foo123bar\n/usr/bin/env node\npath C:\\Users\\alice home\nplain filler line\n',
    );
  });

  it('字面量命中：patternMode=literal 且不占位 hint', async () => {
    const result = await searchContentHandler({ pattern: 'foo123bar', cwd: tmpDir, glob: 'pm.txt' });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['patternMode']).toBe('literal');
      expect(result['hint']).toBeUndefined();
    }
  });

  it('正则命中：patternMode=regex 且不占位 hint', async () => {
    const result = await searchContentHandler({ pattern: '/foo\\d+bar/', cwd: tmpDir, glob: 'pm.txt' });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['patternMode']).toBe('regex');
      expect(result['hint']).toBeUndefined();
    }
  });

  it('多斜杠路径按字面量解释并命中', async () => {
    const result = await searchContentHandler({ pattern: '/usr/bin/env', cwd: tmpDir, glob: 'pm.txt' });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['patternMode']).toBe('literal');
      const matches = result['matches'] as Array<{ file: string }>;
      expect(matches.length).toBe(1);
      expect(matches[0]!.file).toBe('pm.txt');
    }
  });

  it('字面量 0 命中且含元字符 → 提示①（像正则但按字面量搜了）', async () => {
    const result = await searchContentHandler({ pattern: 'a|b', cwd: tmpDir, glob: 'pm.txt' });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['patternMode']).toBe('literal');
      expect(result['count']).toBe(0);
      const hint = result['hint'] as string;
      expect(hint).toContain('已按【字面量】');
      expect(hint).toContain('/a|b/');
      expect(hint).toContain('ims');
    }
  });

  it('字面量 0 命中普通词 → 提示②（拼写/大小写方向）', async () => {
    const result = await searchContentHandler({
      pattern: 'zznomatch',
      cwd: tmpDir,
      glob: 'pm.txt',
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const hint = result['hint'] as string;
      expect(hint).toContain('拼写与大小写');
    }
  });

  it('结构似正则但 flags 单字母非法 → EINVAL 列明合法标志', async () => {
    const result = await searchContentHandler({ pattern: '/foo/q', cwd: tmpDir, glob: 'pm.txt' });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('EINVAL');
      expect(result.error.message).toContain('非法 flags "q"');
      expect(result.error.message).toContain('合法标志为 ims');
    }
  });

  it('搜索场景出现 g 标志 → EINVAL（/foo/g 与 /foo/ig）', async () => {
    for (const pattern of ['/foo/g', '/foo/ig']) {
      const result = await searchContentHandler({ pattern, cwd: tmpDir, glob: 'pm.txt' });
      expect(isFail(result)).toBe(true);
      if (isFail(result)) {
        expect(result.error.code).toBe('EINVAL');
        expect(result.error.message).toContain('g');
      }
    }
  });

  it('目录递归场景（默认 glob **/*）提示照常工作', async () => {
    // 不传 glob：递归扫描含 sub/deep 的整棵树，hint 引擎照常触发
    const result = await searchContentHandler({ pattern: 'zznomatch', cwd: tmpDir });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['patternMode']).toBe('literal');
      expect(result['count']).toBe(0);
      expect(result['hint'] as string).toContain('拼写与大小写');
    }
  });

  it('正则模式反斜杠路径样 0 命中 → 提示④（转义吃反斜杠，改字面量）', async () => {
    // 原始串 /C:\Users\alice/：体内单反斜杠 \U \a 被当转义，无法命中含真实反斜杠的行
    const result = await searchContentHandler({
      pattern: '/C:\\Users\\alice/',
      cwd: tmpDir,
      glob: 'pm.txt',
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['patternMode']).toBe('regex');
      expect(result['count']).toBe(0);
      const hint = result['hint'] as string;
      expect(hint).toContain('转义');
      expect(hint).toContain('【字面量】');
    }
  });

  it('hint③ 防回归：maxResults 截断后仍按截断前真实命中数判异常偏多', async () => {
    // 300 行匹配但 maxResults=5：hint③ 判据必须吃截断前的真实总数，否则截断调用永远漏提示
    const big = Array.from({ length: 300 }, (_, i) => `under tmp dir ${i + 1}`).join('\n') + '\n';
    await fs.writeFile(path.join(tmpDir, 'big.txt'), big);
    const result = await searchContentHandler({
      pattern: '/tmp/',
      cwd: tmpDir,
      glob: 'big.txt',
      maxResults: 5,
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['count']).toBe(5);
      expect(result['truncated']).toBe(true);
      expect(result['patternMode']).toBe('regex');
      const hint = result['hint'] as string | undefined;
      expect(hint).toBeDefined();
      expect(hint).toContain('疑似');
    }
  });
});

// ============================================================================
// search_content 与 text_grep 一致性对照用例表（工单03 防回归核心）
// ============================================================================

describe('searchContentHandler 与 textGrepHandler 一致性对照', () => {
  beforeEach(async () => {
    // 同一份内容分别供两个工具检索：text_grep 直接读文件；search_content 以 glob 圈定同一文件
    const lines = [
      'foo123bar',
      '/usr/bin/env node',
      'path C:\\Users\\alice home',
      ...Array.from({ length: 30 }, (_, i) => `tmp entry ${i}`),
    ];
    await fs.writeFile(path.join(tmpDir, 'consistency.txt'), lines.join('\n') + '\n');
  });

  /**
   * 一致性断言：同一 pattern 在两个搜索工具上解释完全一致——
   * 成败一致、错误码与错误消息逐字一致、patternMode 相同、
   * hint 触发与否及文案逐字一致、命中数相同。
   */
  async function expectConsistent(
    pattern: string,
  ): Promise<{ grep: AnyToolResult; search: AnyToolResult }> {
    const grep = await textGrepHandler({ path: path.join(tmpDir, 'consistency.txt'), pattern });
    const search = await searchContentHandler({ cwd: tmpDir, glob: 'consistency.txt', pattern });
    expect(isOk(search)).toBe(isOk(grep));
    if (isFail(grep) && isFail(search)) {
      expect(search.error.code).toBe(grep.error.code);
      expect(search.error.message).toBe(grep.error.message);
    }
    if (isOk(grep) && isOk(search)) {
      expect(search['patternMode']).toBe(grep['patternMode']);
      expect(search['hint'] === undefined).toBe(grep['hint'] === undefined);
      if (grep['hint'] !== undefined) {
        expect(search['hint']).toBe(grep['hint']);
      }
      expect(search['count']).toBe(grep['count']);
    }
    return { grep, search };
  }

  it.each([
    [
      '多斜杠路径收敛字面量',
      '/usr/bin/env',
      { mode: 'literal', count: 1, hint: false },
    ],
    [
      '恰好首尾斜杠短字面量判正则（残余洞 + 提示③兜底）',
      '/tmp/',
      { mode: 'regex', count: 30, hint: true },
    ],
    [
      '元字符字面量 0 命中触发提示①',
      'a|b',
      { mode: 'literal', count: 0, hint: true },
    ],
    ['合法 flags 正则', '/foo\\d+bar/', { mode: 'regex', count: 1, hint: false }],
    ['非法单字母 flags 报 EINVAL', '/foo/q', { mode: 'EINVAL' }],
    ['搜索场景 g 标志报 EINVAL', '/foo/ig', { mode: 'EINVAL' }],
    [
      '反斜杠路径字面量免转义',
      'C:\\Users\\alice',
      { mode: 'literal', count: 1, hint: false },
    ],
    [
      '反斜杠路径样正则 0 命中触发提示④',
      '/C:\\Users\\alice/',
      { mode: 'regex', count: 0, hint: true },
    ],
    [
      '空体 // 收敛字面量',
      '//',
      { mode: 'literal', count: 0, hint: true },
    ],
    [
      '末段非纯字母 /api/v1/ 收敛字面量',
      '/api/v1/',
      { mode: 'literal', count: 0, hint: true },
    ],
  ] as Array<[string, string, { mode?: string; count?: number; hint?: boolean }]>)(
    '%s',
    async (_name, pattern, expected) => {
      const { grep, search } = await expectConsistent(pattern);
      if (expected.mode === 'EINVAL') {
        expect(isFail(grep)).toBe(true);
        return;
      }
      expect(isOk(grep)).toBe(true);
      if (isOk(grep) && isOk(search)) {
        expect(grep['patternMode']).toBe(expected.mode);
        if (expected.count !== undefined) {
          expect(grep['count']).toBe(expected.count);
        }
        expect(grep['hint'] !== undefined).toBe(expected.hint ?? false);
      }
    },
  );

  it('一致性表之外：ignoreCase 参数在两工具间语义一致（对两种模式均生效）', async () => {
    const grep = await textGrepHandler({
      path: path.join(tmpDir, 'consistency.txt'),
      pattern: 'FOO123BAR',
      ignoreCase: true,
    });
    const search = await searchContentHandler({
      cwd: tmpDir,
      glob: 'consistency.txt',
      pattern: 'FOO123BAR',
      ignoreCase: true,
    });
    expect(isOk(grep)).toBe(true);
    expect(isOk(search)).toBe(true);
    if (isOk(grep) && isOk(search)) {
      expect(grep['count']).toBe(search['count']);
      expect(grep['count']).toBe(1);
      expect(grep['patternMode']).toBe(search['patternMode']);
    }
  });
});

// ============================================================================
// search_which 工具定义
// ============================================================================

describe('searchWhichTool 定义', () => {
  it('名称为 search_which', () => {
    expect(searchWhichTool.name).toBe('search_which');
  });

  it('有描述', () => {
    expect(searchWhichTool.description.length).toBeGreaterThan(0);
  });

  it('inputSchema 是 zod schema', () => {
    expect(typeof searchWhichInputSchema.safeParse).toBe('function');
  });

  it('handler 是函数', () => {
    expect(typeof searchWhichTool.handler).toBe('function');
  });
});

// ============================================================================
// search_which 正常查找
// ============================================================================

describe('searchWhichHandler 正常查找', () => {
  it('找到已知命令（cmd 或 node）', async () => {
    const command = process.platform === 'win32' ? 'cmd' : 'node';
    const result = await searchWhichHandler({ command });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['found']).toBe(true);
      expect(typeof result['path']).toBe('string');
      expect((result['path'] as string).length).toBeGreaterThan(0);
    }
  });

  it('找到 node 命令', async () => {
    // node 在 Windows 和 unix 上通常都在 PATH 中
    const result = await searchWhichHandler({ command: 'node' });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['found']).toBe(true);
      expect(typeof result['path']).toBe('string');
    }
  });

  it('verbose 返回 all 字段', async () => {
    const command = process.platform === 'win32' ? 'cmd' : 'node';
    const result = await searchWhichHandler({ command, verbose: true });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['found']).toBe(true);
      expect(Array.isArray(result['all'])).toBe(true);
      expect((result['all'] as string[]).length).toBeGreaterThan(0);
    }
  });

  it('非 verbose 不返回 all 字段', async () => {
    const command = process.platform === 'win32' ? 'cmd' : 'node';
    const result = await searchWhichHandler({ command });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['all']).toBeUndefined();
    }
  });
});

// ============================================================================
// search_which 未找到
// ============================================================================

describe('searchWhichHandler 未找到', () => {
  it('不存在的命令返回 found: false', async () => {
    const result = await searchWhichHandler({
      command: 'nonexistent-command-xyz-12345',
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['found']).toBe(false);
      expect(result['path']).toBeUndefined();
    }
  });

  it('不存在的命令 verbose 也返回 found: false', async () => {
    const result = await searchWhichHandler({
      command: 'nonexistent-command-xyz-12345',
      verbose: true,
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['found']).toBe(false);
      expect(result['path']).toBeUndefined();
      expect(result['all']).toBeUndefined();
    }
  });
});

// ============================================================================
// search_which 错误路径
// ============================================================================

describe('searchWhichHandler 错误路径', () => {
  it('空 command 返回 EINVAL', async () => {
    const result = await searchWhichHandler({ command: '' });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('EINVAL');
    }
  });

  it('command 非字符串返回 EINVAL', async () => {
    const result = await searchWhichHandler({ command: undefined });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('EINVAL');
    }
  });
});