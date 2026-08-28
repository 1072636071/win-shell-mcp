/**
 * 父目录预检助手测试（工单 20-06）。
 *
 * fs_write 与 net_download 共用 prepareParentDir；此处钉死四态语义。
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareParentDir } from '../../src/utils/fs.js';
import { isFail } from '../../src/contract/output.js';

describe('prepareParentDir', () => {
  it('父目录存在且为目录 → 返回 null', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ws-ppd-'));
    try {
      const target = join(root, 'sub', 'a.txt');
      mkdirSync(join(root, 'sub'));
      expect(await prepareParentDir(target, true)).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('父路径存在但非目录 → ENOTDIR', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ws-ppd-'));
    try {
      const file = join(root, 'a.txt');
      writeFileSync(file, 'x');
      const result = await prepareParentDir(join(file, 'child.txt'), true);
      expect(result).not.toBeNull();
      if (result !== null && isFail(result)) expect(result.error.code).toBe('ENOTDIR');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('父目录不存在且 mkdirParents=true → 递归创建并返回 null', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ws-ppd-'));
    try {
      const target = join(root, 'a', 'b', 'c.txt');
      expect(await prepareParentDir(target, true)).toBeNull();
      expect(statSync(join(root, 'a', 'b')).isDirectory()).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('父目录不存在且 mkdirParents=false → ENOENT 且不创建', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ws-ppd-'));
    try {
      const target = join(root, 'a', 'c.txt');
      const result = await prepareParentDir(target, false);
      expect(result).not.toBeNull();
      if (result !== null && isFail(result)) expect(result.error.code).toBe('ENOENT');
      expect(existsSync(join(root, 'a'))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
