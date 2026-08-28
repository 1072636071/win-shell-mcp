/**
 * 读文件深模块机器级测试（工单 20-03）。
 *
 * fs_read 与 cat 共用 readTextFile；此处钉死统一后的字节/行范围语义
 * （行范围按 splitLines 掐结尾换行）。
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readTextFile } from '../../src/utils/readText.js';

function tmp() {
  return mkdtempSync(join(tmpdir(), 'ws-readtext-'));
}

describe('readTextFile', () => {
  it('全量读取保留结尾换行（无行范围不切片）', async () => {
    const dir = tmp();
    const f = join(dir, 'a.txt');
    writeFileSync(f, 'a\nb\n', 'utf8');
    try {
      expect(await readTextFile(f)).toBe('a\nb\n');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('行范围统一 splitLines 语义：掐结尾换行', async () => {
    const dir = tmp();
    const f = join(dir, 'a.txt');
    writeFileSync(f, 'a\nb\n', 'utf8');
    try {
      expect(await readTextFile(f, { lineRange: { start: 1, end: 2 } })).toBe('a\nb');
      expect(await readTextFile(f, { lineRange: { start: 2 } })).toBe('b');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('字节范围在解码前切片原始 buffer', async () => {
    const dir = tmp();
    const f = join(dir, 'a.txt');
    writeFileSync(f, 'abcdef', 'utf8');
    try {
      expect(await readTextFile(f, { byteRange: { start: 1, end: 3 } })).toBe('bcd');
      expect(await readTextFile(f, { byteRange: { start: 2 } })).toBe('cdef');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('编码提示生效', async () => {
    const dir = tmp();
    const f = join(dir, 'a.txt');
    // GBK 编码的「中」字（0xD6 0xD0）
    writeFileSync(f, Buffer.from([0xd6, 0xd0]));
    try {
      expect(await readTextFile(f, { encoding: 'gbk' })).toBe('中');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('目录抛 EISDIR，不存在抛 ENOENT', async () => {
    const dir = tmp();
    const sub = join(dir, 'sub');
    mkdirSync(sub);
    try {
      await expect(readTextFile(sub)).rejects.toMatchObject({ code: 'EISDIR' });
      await expect(readTextFile(join(dir, 'nope.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
