import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { isOk, isFail } from '../../src/contract/output.js';
import { ErrorCode } from '../../src/contract/errors.js';
import {
  gitStatusHandler,
  gitStatusTool,
  gitStatusInputSchema,
  gitLogHandler,
  gitLogTool,
  gitLogInputSchema,
  gitBranchHandler,
  gitBranchTool,
  gitBranchInputSchema,
  gitDiffHandler,
  gitDiffTool,
  gitDiffInputSchema,
  gitAddHandler,
  gitAddTool,
  gitAddInputSchema,
  gitCommitHandler,
  gitCommitTool,
  gitCommitInputSchema,
} from '../../src/tools/git.js';

const execFileAsync = promisify(execFile);

/** 临时目录根，每个用例独立一份。 */
let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wsmcp-git-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

/**
 * 执行 git 命令（测试辅助）。
 *
 * @param args git 参数
 * @param cwd 工作目录
 */
async function git(args: string[], cwd: string): Promise<void> {
  await execFileAsync('git', args, { cwd, windowsHide: true });
}

/**
 * 初始化一个临时 git 仓库并做一次初始提交。
 *
 * 用 `git symbolic-ref HEAD refs/heads/main` 确保默认分支为 main（兼容所有 git 版本）。
 *
 * @param dir 临时目录
 */
async function initRepo(dir: string): Promise<void> {
  await git(['init'], dir);
  await git(['symbolic-ref', 'HEAD', 'refs/heads/main'], dir);
  await git(['config', 'user.name', 'TestUser'], dir);
  await git(['config', 'user.email', 'test@example.com'], dir);
  await fs.writeFile(path.join(dir, 'README.md'), '# Test\n', 'utf8');
  await git(['add', 'README.md'], dir);
  await git(['commit', '-m', 'initial commit'], dir);
}

/**
 * 初始化一个空 git 仓库（无提交）。
 *
 * @param dir 临时目录
 */
async function initEmptyRepo(dir: string): Promise<void> {
  await git(['init'], dir);
  await git(['symbolic-ref', 'HEAD', 'refs/heads/main'], dir);
  await git(['config', 'user.name', 'TestUser'], dir);
  await git(['config', 'user.email', 'test@example.com'], dir);
}

/**
 * 创建一个提交（写文件 + add + commit）。
 *
 * @param dir 仓库目录
 * @param filename 文件名
 * @param content 文件内容
 * @param message 提交信息
 */
async function makeCommit(
  dir: string,
  filename: string,
  content: string,
  message: string,
): Promise<void> {
  await fs.writeFile(path.join(dir, filename), content, 'utf8');
  await git(['add', filename], dir);
  await git(['commit', '-m', message], dir);
}

// ---------------------------------------------------------------------------
// 工具定义
// ---------------------------------------------------------------------------

describe('git 工具集定义', () => {
  const tools = [
    { tool: gitStatusTool, name: 'git_status', schema: gitStatusInputSchema },
    { tool: gitLogTool, name: 'git_log', schema: gitLogInputSchema },
    { tool: gitBranchTool, name: 'git_branch', schema: gitBranchInputSchema },
    { tool: gitDiffTool, name: 'git_diff', schema: gitDiffInputSchema },
    { tool: gitAddTool, name: 'git_add', schema: gitAddInputSchema },
    { tool: gitCommitTool, name: 'git_commit', schema: gitCommitInputSchema },
  ];

  for (const { tool, name, schema } of tools) {
    it(`${name} 有正确名称与非空描述`, () => {
      expect(tool.name).toBe(name);
      expect(tool.description.length).toBeGreaterThan(0);
      expect(typeof tool.handler).toBe('function');
      expect(typeof schema.safeParse).toBe('function');
    });
  }
});

// ===========================================================================
// git_status
// ===========================================================================

describe('git_status', () => {
  it('干净仓库返回全 0 计数', async () => {
    await initRepo(tmpDir);
    const result = await gitStatusHandler({ cwd: tmpDir });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['branch']).toBe('main');
      expect(result['changed']).toBe(0);
      expect(result['staged']).toBe(0);
      expect(result['untracked']).toBe(0);
    }
  });

  it('有工作区修改时 changed=1', async () => {
    await initRepo(tmpDir);
    await fs.writeFile(path.join(tmpDir, 'README.md'), '# Modified\n', 'utf8');
    const result = await gitStatusHandler({ cwd: tmpDir });
    if (isOk(result)) {
      expect(result['changed']).toBe(1);
      expect(result['staged']).toBe(0);
      expect(result['untracked']).toBe(0);
    }
  });

  it('有暂存变更时 staged=1', async () => {
    await initRepo(tmpDir);
    await fs.writeFile(path.join(tmpDir, 'README.md'), '# Staged\n', 'utf8');
    await git(['add', 'README.md'], tmpDir);
    const result = await gitStatusHandler({ cwd: tmpDir });
    if (isOk(result)) {
      expect(result['staged']).toBe(1);
      expect(result['changed']).toBe(0);
    }
  });

  it('有未跟踪文件时 untracked=1', async () => {
    await initRepo(tmpDir);
    await fs.writeFile(path.join(tmpDir, 'new.txt'), 'new', 'utf8');
    const result = await gitStatusHandler({ cwd: tmpDir });
    if (isOk(result)) {
      expect(result['untracked']).toBe(1);
      expect(result['changed']).toBe(0);
      expect(result['staged']).toBe(0);
    }
  });

  it('verbose 时返回 files 列表', async () => {
    await initRepo(tmpDir);
    await fs.writeFile(path.join(tmpDir, 'README.md'), '# Modified\n', 'utf8');
    await fs.writeFile(path.join(tmpDir, 'new.txt'), 'new', 'utf8');
    const result = await gitStatusHandler({ cwd: tmpDir, verbose: true });
    if (isOk(result)) {
      const files = result['files'] as Array<{
        path: string;
        status: string;
        staged: boolean;
      }>;
      expect(Array.isArray(files)).toBe(true);
      expect(files.length).toBe(2);
      // 每个条目含 path/status/staged
      for (const f of files) {
        expect(typeof f.path).toBe('string');
        expect(typeof f.status).toBe('string');
        expect(typeof f.staged).toBe('boolean');
      }
    }
  });

  it('非 git 仓库返回 GIT_FAIL', async () => {
    const result = await gitStatusHandler({ cwd: tmpDir });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe(ErrorCode.GIT_FAIL);
      expect(result.error.message.length).toBeGreaterThan(0);
    }
  });

  it('cwd 默认 process.cwd()', async () => {
    // 不传 cwd，应使用 process.cwd()（本项目是 git 仓库）
    const result = await gitStatusHandler({});
    // 本项目是 git 仓库，应返回 ok
    expect(isOk(result)).toBe(true);
  });
});

// ===========================================================================
// git_log
// ===========================================================================

describe('git_log', () => {
  it('返回提交历史', async () => {
    await initRepo(tmpDir);
    const result = await gitLogHandler({ cwd: tmpDir });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const commits = result['commits'] as Array<{
        hash: string;
        author: string;
        date: string;
        subject: string;
      }>;
      const count = result['count'] as number;
      expect(count).toBe(1);
      expect(commits.length).toBe(1);
      expect(commits[0]!.subject).toBe('initial commit');
      expect(commits[0]!.author).toBe('TestUser');
      expect(commits[0]!.date.length).toBeGreaterThan(0);
      expect(commits[0]!.hash.length).toBeGreaterThan(0);
    }
  });

  it('多个提交按时间倒序返回', async () => {
    await initRepo(tmpDir);
    await makeCommit(tmpDir, 'a.txt', 'a', 'add a');
    await makeCommit(tmpDir, 'b.txt', 'b', 'add b');
    const result = await gitLogHandler({ cwd: tmpDir });
    if (isOk(result)) {
      const commits = result['commits'] as Array<{ subject: string }>;
      expect(commits.length).toBe(3);
      expect(commits[0]!.subject).toBe('add b');
      expect(commits[1]!.subject).toBe('add a');
      expect(commits[2]!.subject).toBe('initial commit');
    }
  });

  it('limit 限制返回数量', async () => {
    await initRepo(tmpDir);
    await makeCommit(tmpDir, 'a.txt', 'a', 'add a');
    await makeCommit(tmpDir, 'b.txt', 'b', 'add b');
    const result = await gitLogHandler({ cwd: tmpDir, limit: 2 });
    if (isOk(result)) {
      expect(result['count']).toBe(2);
    }
  });

  it('limit 默认 10', async () => {
    await initRepo(tmpDir);
    const result = await gitLogHandler({ cwd: tmpDir });
    if (isOk(result)) {
      expect(result['count']).toBe(1);
    }
  });

  it('verbose 时返回完整 40 字符 hash', async () => {
    await initRepo(tmpDir);
    const result = await gitLogHandler({ cwd: tmpDir, verbose: true });
    if (isOk(result)) {
      const commits = result['commits'] as Array<{ hash: string }>;
      expect(commits[0]!.hash.length).toBe(40);
    }
  });

  it('非 verbose 时返回短 hash', async () => {
    await initRepo(tmpDir);
    const result = await gitLogHandler({ cwd: tmpDir });
    if (isOk(result)) {
      const commits = result['commits'] as Array<{ hash: string }>;
      // 短 hash 通常 7-12 字符
      expect(commits[0]!.hash.length).toBeLessThan(40);
      expect(commits[0]!.hash.length).toBeGreaterThanOrEqual(7);
    }
  });

  it('空仓库返回空数组', async () => {
    await initEmptyRepo(tmpDir);
    const result = await gitLogHandler({ cwd: tmpDir });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['commits']).toEqual([]);
      expect(result['count']).toBe(0);
    }
  });

  it('非 git 仓库返回 GIT_FAIL', async () => {
    const result = await gitLogHandler({ cwd: tmpDir });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe(ErrorCode.GIT_FAIL);
    }
  });
});

// ===========================================================================
// git_branch
// ===========================================================================

describe('git_branch', () => {
  it('单分支返回 branches 与 current', async () => {
    await initRepo(tmpDir);
    const result = await gitBranchHandler({ cwd: tmpDir });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const branches = result['branches'] as string[];
      expect(branches).toContain('main');
      expect(result['current']).toBe('main');
    }
  });

  it('多分支返回所有分支', async () => {
    await initRepo(tmpDir);
    await git(['branch', 'feature'], tmpDir);
    await git(['branch', 'develop'], tmpDir);
    const result = await gitBranchHandler({ cwd: tmpDir });
    if (isOk(result)) {
      const branches = result['branches'] as string[];
      expect(branches).toContain('main');
      expect(branches).toContain('feature');
      expect(branches).toContain('develop');
      expect(branches.length).toBe(3);
    }
  });

  it('切换分支后 current 更新', async () => {
    await initRepo(tmpDir);
    await git(['checkout', '-b', 'feature'], tmpDir);
    const result = await gitBranchHandler({ cwd: tmpDir });
    if (isOk(result)) {
      expect(result['current']).toBe('feature');
    }
  });

  it('verbose 时返回 all 列表', async () => {
    await initRepo(tmpDir);
    await git(['branch', 'feature'], tmpDir);
    const result = await gitBranchHandler({ cwd: tmpDir, verbose: true });
    if (isOk(result)) {
      const all = result['all'] as Array<{
        name: string;
        current: boolean;
        remote: string;
      }>;
      expect(Array.isArray(all)).toBe(true);
      expect(all.length).toBe(2);
      for (const b of all) {
        expect(typeof b.name).toBe('string');
        expect(typeof b.current).toBe('boolean');
        expect(typeof b.remote).toBe('string');
      }
      // main 是当前分支
      const mainEntry = all.find((b) => b.name === 'main');
      expect(mainEntry!.current).toBe(true);
    }
  });

  it('verbose 时含上游 remote 信息', async () => {
    await initRepo(tmpDir);
    // 创建远程仓库引用并设置上游（需要先 remote add 再 update-ref 再 set-upstream）
    await git(['remote', 'add', 'origin', 'https://example.com/repo.git'], tmpDir);
    await git(['update-ref', 'refs/remotes/origin/main', 'refs/heads/main'], tmpDir);
    await git(['branch', '--set-upstream-to=origin/main', 'main'], tmpDir);
    const result = await gitBranchHandler({ cwd: tmpDir, verbose: true });
    if (isOk(result)) {
      const all = result['all'] as Array<{ name: string; remote: string }>;
      const mainEntry = all.find((b) => b.name === 'main');
      expect(mainEntry!.remote).toBe('origin/main');
    }
  });

  it('非 git 仓库返回 GIT_FAIL', async () => {
    const result = await gitBranchHandler({ cwd: tmpDir });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe(ErrorCode.GIT_FAIL);
    }
  });
});

// ===========================================================================
// git_diff
// ===========================================================================

describe('git_diff', () => {
  it('工作区有修改时返回差异', async () => {
    await initRepo(tmpDir);
    await fs.writeFile(path.join(tmpDir, 'README.md'), '# Modified\n', 'utf8');
    const result = await gitDiffHandler({ cwd: tmpDir });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const diff = result['diff'] as string;
      const files = result['files'] as string[];
      expect(diff.length).toBeGreaterThan(0);
      expect(diff).toContain('diff --git');
      expect(files).toContain('README.md');
    }
  });

  it('暂存区差异（staged=true）', async () => {
    await initRepo(tmpDir);
    await fs.writeFile(path.join(tmpDir, 'README.md'), '# Staged\n', 'utf8');
    await git(['add', 'README.md'], tmpDir);
    const result = await gitDiffHandler({ cwd: tmpDir, staged: true });
    if (isOk(result)) {
      const diff = result['diff'] as string;
      expect(diff).toContain('# Staged');
    }
  });

  it('暂存后工作区差异为空', async () => {
    await initRepo(tmpDir);
    await fs.writeFile(path.join(tmpDir, 'README.md'), '# Staged\n', 'utf8');
    await git(['add', 'README.md'], tmpDir);
    const result = await gitDiffHandler({ cwd: tmpDir });
    if (isOk(result)) {
      expect(result['diff']).toBe('');
      expect(result['files']).toEqual([]);
    }
  });

  it('指定文件路径（path）', async () => {
    await initRepo(tmpDir);
    await fs.writeFile(path.join(tmpDir, 'README.md'), '# Modified\n', 'utf8');
    await fs.writeFile(path.join(tmpDir, 'other.txt'), 'other', 'utf8');
    // 暂存两个文件
    await git(['add', 'README.md', 'other.txt'], tmpDir);
    // 用 path 限制只看 README.md 的差异
    const result = await gitDiffHandler({ cwd: tmpDir, staged: true, path: 'README.md' });
    if (isOk(result)) {
      const files = result['files'] as string[];
      expect(files).toContain('README.md');
      expect(files).not.toContain('other.txt');
    }
  });

  it('无差异时返回空', async () => {
    await initRepo(tmpDir);
    const result = await gitDiffHandler({ cwd: tmpDir });
    if (isOk(result)) {
      expect(result['diff']).toBe('');
      expect(result['truncated']).toBe(false);
      expect(result['files']).toEqual([]);
    }
  });

  it('大差异默认截断并标记 truncated=true', async () => {
    await initRepo(tmpDir);
    // 创建超过 2000 字符的差异
    const bigContent = 'x'.repeat(3000);
    await fs.writeFile(path.join(tmpDir, 'README.md'), bigContent, 'utf8');
    const result = await gitDiffHandler({ cwd: tmpDir });
    if (isOk(result)) {
      expect(result['truncated']).toBe(true);
      const diff = result['diff'] as string;
      expect(diff.length).toBeLessThan(bigContent.length);
      expect(diff).toContain('truncated');
    }
  });

  it('verbose 时不截断', async () => {
    await initRepo(tmpDir);
    const bigContent = 'x'.repeat(3000);
    await fs.writeFile(path.join(tmpDir, 'README.md'), bigContent, 'utf8');
    const result = await gitDiffHandler({ cwd: tmpDir, verbose: true });
    if (isOk(result)) {
      expect(result['truncated']).toBe(false);
      const diff = result['diff'] as string;
      expect(diff.length).toBeGreaterThan(3000);
    }
  });

  it('非 git 仓库返回 GIT_FAIL', async () => {
    const result = await gitDiffHandler({ cwd: tmpDir });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe(ErrorCode.GIT_FAIL);
    }
  });
});

// ===========================================================================
// git_add
// ===========================================================================

describe('git_add', () => {
  it('暂存文件返回 added 列表', async () => {
    await initRepo(tmpDir);
    await fs.writeFile(path.join(tmpDir, 'new.txt'), 'new', 'utf8');
    const result = await gitAddHandler({ cwd: tmpDir, paths: ['new.txt'] });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['added']).toEqual(['new.txt']);
    }
    // 确认已暂存
    const status = await gitStatusHandler({ cwd: tmpDir });
    if (isOk(status)) {
      expect(status['staged']).toBe(1);
    }
  });

  it('暂存多个文件', async () => {
    await initRepo(tmpDir);
    await fs.writeFile(path.join(tmpDir, 'a.txt'), 'a', 'utf8');
    await fs.writeFile(path.join(tmpDir, 'b.txt'), 'b', 'utf8');
    const result = await gitAddHandler({ cwd: tmpDir, paths: ['a.txt', 'b.txt'] });
    if (isOk(result)) {
      expect(result['added']).toEqual(['a.txt', 'b.txt']);
    }
  });

  it('路径不存在返回 GIT_FAIL', async () => {
    await initRepo(tmpDir);
    const result = await gitAddHandler({ cwd: tmpDir, paths: ['nonexistent.txt'] });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe(ErrorCode.GIT_FAIL);
    }
  });

  it('paths 为空数组返回 EINVAL', async () => {
    await initRepo(tmpDir);
    const result = await gitAddHandler({ cwd: tmpDir, paths: [] });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe(ErrorCode.EINVAL);
    }
  });

  it('非 git 仓库返回 GIT_FAIL', async () => {
    const result = await gitAddHandler({ cwd: tmpDir, paths: ['any.txt'] });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe(ErrorCode.GIT_FAIL);
    }
  });
});

// ===========================================================================
// git_commit
// ===========================================================================

describe('git_commit', () => {
  it('正常提交返回 committed=true 与 hash', async () => {
    await initRepo(tmpDir);
    await fs.writeFile(path.join(tmpDir, 'new.txt'), 'new', 'utf8');
    await git(['add', 'new.txt'], tmpDir);
    const result = await gitCommitHandler({ cwd: tmpDir, message: 'add new file' });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['committed']).toBe(true);
      expect(typeof result['hash']).toBe('string');
      expect((result['hash'] as string).length).toBe(40); // 完整 hash
      expect(result['message']).toBe('add new file');
    }
  });

  it('无变更时返回 GIT_FAIL', async () => {
    await initRepo(tmpDir);
    const result = await gitCommitHandler({ cwd: tmpDir, message: 'no change' });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe(ErrorCode.GIT_FAIL);
      // 错误消息应含 stderr 摘要
      expect(result.error.message.length).toBeGreaterThan(0);
    }
  });

  it('amend 修改上一个提交', async () => {
    await initRepo(tmpDir);
    // 修改文件并暂存
    await fs.writeFile(path.join(tmpDir, 'README.md'), '# Amended\n', 'utf8');
    await git(['add', 'README.md'], tmpDir);
    // amend
    const result = await gitCommitHandler({
      cwd: tmpDir,
      message: 'amended commit',
      amend: true,
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['committed']).toBe(true);
      expect(result['message']).toBe('amended commit');
    }
    // 验证只有一个提交（amend 修改而非新增）
    const log = await gitLogHandler({ cwd: tmpDir });
    if (isOk(log)) {
      expect(log['count']).toBe(1);
      const commits = log['commits'] as Array<{ subject: string }>;
      expect(commits[0]!.subject).toBe('amended commit');
    }
  });

  it('message 为空返回 EINVAL', async () => {
    await initRepo(tmpDir);
    const result = await gitCommitHandler({ cwd: tmpDir, message: '' });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe(ErrorCode.EINVAL);
    }
  });

  it('非 git 仓库返回 GIT_FAIL', async () => {
    const result = await gitCommitHandler({ cwd: tmpDir, message: 'test' });
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe(ErrorCode.GIT_FAIL);
    }
  });
});

// ===========================================================================
// schema 验证
// ===========================================================================

describe('schema 验证', () => {
  it('git_status 空对象合法', () => {
    expect(gitStatusInputSchema.safeParse({}).success).toBe(true);
  });

  it('git_log limit 正整数合法', () => {
    expect(gitLogInputSchema.safeParse({ limit: 5 }).success).toBe(true);
  });

  it('git_log limit 非正整数非法', () => {
    expect(gitLogInputSchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(gitLogInputSchema.safeParse({ limit: -1 }).success).toBe(false);
    expect(gitLogInputSchema.safeParse({ limit: 1.5 }).success).toBe(false);
  });

  it('git_add paths 非空数组合法', () => {
    expect(gitAddInputSchema.safeParse({ paths: ['a.txt'] }).success).toBe(true);
  });

  it('git_add paths 空数组非法', () => {
    expect(gitAddInputSchema.safeParse({ paths: [] }).success).toBe(false);
  });

  it('git_commit message 非空字符串合法', () => {
    expect(gitCommitInputSchema.safeParse({ message: 'test' }).success).toBe(true);
  });

  it('git_commit message 空字符串非法', () => {
    expect(gitCommitInputSchema.safeParse({ message: '' }).success).toBe(false);
  });

  it('git_diff staged/path/verbose 合法', () => {
    expect(
      gitDiffInputSchema.safeParse({ staged: true, path: 'a.txt', verbose: true }).success,
    ).toBe(true);
  });

  it('git_branch verbose 合法', () => {
    expect(gitBranchInputSchema.safeParse({ verbose: true }).success).toBe(true);
  });
});