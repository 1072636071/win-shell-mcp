/**
 * archive 工具测试：archive_create / archive_extract round-trip。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { archiveCreateHandler, archiveExtractHandler } from '../../src/tools/archive.js';
import { isOk, isFail } from '../../src/contract/output.js';

let workDir: string;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'archive-test-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

async function createSourceFiles(): Promise<string> {
  const src = join(workDir, 'src');
  await mkdir(src);
  await writeFile(join(src, 'a.txt'), 'content-a');
  await writeFile(join(src, 'b.txt'), 'content-b');
  await mkdir(join(src, 'sub'));
  await writeFile(join(src, 'sub', 'c.txt'), 'content-c');
  return src;
}

async function verifyExtracted(dest: string): Promise<void> {
  expect((await readFile(join(dest, 'a.txt'))).toString()).toBe('content-a');
  expect((await readFile(join(dest, 'b.txt'))).toString()).toBe('content-b');
  expect((await readFile(join(dest, 'sub', 'c.txt'))).toString()).toBe('content-c');
}

describe('archive_create + archive_extract tar round-trip', () => {
  it('tar 格式创建后解压还原文件', async () => {
    const src = await createSourceFiles();
    const archivePath = join(workDir, 'test.tar');

    const createResult = await archiveCreateHandler({
      path: archivePath,
      sources: [src],
      format: 'tar',
    });
    expect(isOk(createResult)).toBe(true);
    if (isOk(createResult)) {
      expect(createResult['created']).toBe(true);
      expect(createResult['format']).toBe('tar');
      expect(createResult['bytes']).toBeGreaterThan(0);
    }

    const dest = join(workDir, 'extracted-tar');
    const extractResult = await archiveExtractHandler({
      path: archivePath,
      dest,
    });
    expect(isOk(extractResult)).toBe(true);
    if (isOk(extractResult)) {
      expect(extractResult['extracted']).toBe(true);
    }
    await verifyExtracted(dest);
  });
});

describe('archive_create + archive_extract tar.gz round-trip', () => {
  it('tar.gz 格式创建后解压还原文件', async () => {
    const src = await createSourceFiles();
    const archivePath = join(workDir, 'test.tar.gz');

    const createResult = await archiveCreateHandler({
      path: archivePath,
      sources: [src],
      format: 'tar.gz',
    });
    expect(isOk(createResult)).toBe(true);

    const dest = join(workDir, 'extracted-targz');
    const extractResult = await archiveExtractHandler({
      path: archivePath,
      dest,
    });
    expect(isOk(extractResult)).toBe(true);
    await verifyExtracted(dest);
  });
});

describe('archive_create + archive_extract zip round-trip', () => {
  it('zip 格式创建后解压还原文件', async () => {
    const src = await createSourceFiles();
    const archivePath = join(workDir, 'test.zip');

    const createResult = await archiveCreateHandler({
      path: archivePath,
      sources: [src],
      format: 'zip',
    });
    expect(isOk(createResult)).toBe(true);

    const dest = join(workDir, 'extracted-zip');
    const extractResult = await archiveExtractHandler({
      path: archivePath,
      dest,
    });
    expect(isOk(extractResult)).toBe(true);
    await verifyExtracted(dest);
  });
});

describe('archive_create 格式推断', () => {
  it('按 .tar.gz 扩展名推断 tar.gz', async () => {
    const src = await createSourceFiles();
    const archivePath = join(workDir, 'auto.tar.gz');

    const result = await archiveCreateHandler({ path: archivePath, sources: [src] });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['format']).toBe('tar.gz');
    }
  });

  it('按 .zip 扩展名推断 zip', async () => {
    const src = await createSourceFiles();
    const archivePath = join(workDir, 'auto.zip');

    const result = await archiveCreateHandler({ path: archivePath, sources: [src] });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['format']).toBe('zip');
    }
  });
});

describe('archive_create 错误路径', () => {
  it('源不存在返回 ENOENT', async () => {
    const result = await archiveCreateHandler({
      path: join(workDir, 'out.tar'),
      sources: [join(workDir, 'no-such')],
    });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('ENOENT');
    }
  });

  it('path 为空返回 EINVAL', async () => {
    const result = await archiveCreateHandler({ path: '', sources: ['x'] });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('EINVAL');
    }
  });
});
