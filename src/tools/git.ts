/**
 * git 工具集：git_status / git_log / git_branch / git_diff / git_add / git_commit。
 *
 * 设计原则（见 CONTEXT.md / ADR-0003）：
 * - 极简输出：默认只含 AI 决策所需最小字段
 * - verbose：需要完整数据时开启
 * - 统一错误码：GIT_FAIL（git 命令失败）/ EINVAL（参数非法）
 * - 所有 git 操作通过 git 命令执行（node:child_process execFile）
 * - 非 git 仓库与 git 命令失败时返回 GIT_FAIL 并附 stderr 摘要
 */

import { z } from 'zod';
import {
  ok,
  fail,
  truncate,
  withVerbose,
  DEFAULT_TRUNCATE_LIMIT,
  type AnyToolResult,
} from '../contract/output.js';
import { ErrorCode } from '../contract/errors.js';
import { runCommand } from '../exec/run.js';
import type { Tool } from '../registry.js';

/** git 执行结果。 */
interface GitExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * 执行 git 命令并返回结构化结果（不抛异常）。
 *
 * 子进程机器委托给命令执行深模块（src/exec/run.ts）。
 *
 * @param args git 参数数组
 * @param cwd 工作目录
 * @returns { exitCode, stdout, stderr }
 */
async function runGit(args: string[], cwd: string): Promise<GitExecResult> {
  const outcome = await runCommand('git', args, { cwd });
  if (outcome.spawnError !== undefined) {
    if (outcome.spawnError.code === 'ENOENT') {
      return {
        exitCode: -1,
        stdout: '',
        stderr: 'git 命令未找到（请确认 git 已安装并在 PATH 中）',
      };
    }
    return { exitCode: -1, stdout: '', stderr: outcome.spawnError.message };
  }
  return { exitCode: outcome.exitCode, stdout: outcome.stdout, stderr: outcome.stderr };
}

/**
 * 构造 git 错误消息（含 stderr 摘要）。
 *
 * @param stderr git 的标准错误输出
 * @param subcommand git 子命令名（如 'status'）
 * @returns 人类可读的错误消息
 */
function gitError(stderr: string, subcommand: string): string {
  const trimmed = stderr.trim();
  if (trimmed.length === 0) return `git ${subcommand} 执行失败`;
  // 截断 stderr 摘要，避免过长
  const maxLen = 500;
  const summary =
    trimmed.length > maxLen ? `${trimmed.slice(0, maxLen)}...[truncated]` : trimmed;
  return `git ${subcommand} 失败: ${summary}`;
}

/**
 * 从参数中提取 cwd，默认 process.cwd()。
 *
 * @param args 工具参数
 * @returns 工作目录
 */
function getCwd(args: Record<string, unknown>): string {
  const raw = args['cwd'];
  return typeof raw === 'string' && raw.length > 0 ? raw : process.cwd();
}

/**
 * 解析 git status --porcelain=v1 -b 的分支行。
 *
 * 行格式：
 * - "## main"
 * - "## main...origin/main"
 * - "## main...origin/main [ahead 2]"
 * - "## HEAD (no branch)"
 *
 * @param line 分支行（以 "## " 开头）
 * @returns 分支名（detached HEAD 时为 "HEAD"）
 */
function parseBranchLine(line: string): string {
  const rest = line.slice(3); // 去掉 "## "
  const spaceIdx = rest.search(/\s/);
  const token = spaceIdx === -1 ? rest : rest.slice(0, spaceIdx);
  // token 形如 "main" / "main...origin/main" / "HEAD"
  const dotIdx = token.indexOf('...');
  return dotIdx === -1 ? token : token.slice(0, dotIdx);
}

/**
 * 解析 git status --porcelain=v1 的文件行。
 *
 * 行格式：XY path（X/Y 为状态字符，path 可能被引号包围）
 *
 * @param line 文件行
 * @returns { path, x, y } 或 null
 */
function parseStatusLine(line: string): { path: string; x: string; y: string } | null {
  if (line.length < 3) return null;
  const x = line[0]!;
  const y = line[1]!;
  let path = line.slice(3);
  // 去引号（porcelain v1 对含空格路径加引号）
  if (path.startsWith('"') && path.endsWith('"')) {
    path = path.slice(1, -1);
  }
  return { path, x, y };
}

/**
 * 从 diff 输出中解析涉及的文件列表。
 *
 * diff 行格式：diff --git a/path b/path（路径可能被引号包围）
 *
 * @param diff diff 原始输出
 * @returns 文件路径数组
 */
function parseDiffFiles(diff: string): string[] {
  const files: string[] = [];
  for (const line of diff.split(/\r?\n/)) {
    const m = /^diff --git a\/(.*) b\/(.*)$/.exec(line);
    if (m) {
      let file = m[2]!;
      if (file.startsWith('"') && file.endsWith('"')) {
        file = file.slice(1, -1);
      }
      files.push(file);
    }
  }
  return files;
}

// ===================== git_status =====================

/** git_status 输入 schema。 */
export const gitStatusInputSchema = z.object({
  cwd: z.string().optional().describe('git 仓库路径，默认当前工作目录'),
  verbose: z.boolean().optional().describe('若为 true，额外返回 files 列表'),
});

/** git_status 文件条目（verbose）。 */
interface StatusFile {
  path: string;
  status: string;
  staged: boolean;
}

/** git_status 极简输出。 */
interface GitStatusMinimal {
  branch: string;
  changed: number;
  staged: number;
  untracked: number;
}

/** git_status verbose 输出。 */
interface GitStatusFull extends GitStatusMinimal {
  files: StatusFile[];
}

/**
 * git_status handler：返回结构化的分支与变更分类。
 *
 * 极简返回 `{ branch, changed, staged, untracked }`。
 * verbose 时额外返回 `{ files: [{ path, status, staged }] }`。
 * 用 `git status --porcelain=v1 -b` 解析。
 *
 * @param args 已验证的参数
 * @returns 统一输出契约
 */
export async function gitStatusHandler(args: Record<string, unknown>): Promise<AnyToolResult> {
  const cwd = getCwd(args);
  const verbose = args['verbose'] === true;

  const result = await runGit(['status', '--porcelain=v1', '-b'], cwd);
  if (result.exitCode !== 0) {
    return fail(ErrorCode.GIT_FAIL, gitError(result.stderr, 'status'));
  }

  const lines = result.stdout.split(/\r?\n/);
  const branchLine = lines[0] ?? '';
  let branch = '';
  if (branchLine.startsWith('## ')) {
    branch = parseBranchLine(branchLine);
  }

  let changed = 0;
  let staged = 0;
  let untracked = 0;
  const files: StatusFile[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.length === 0) continue;
    const parsed = parseStatusLine(line);
    if (!parsed) continue;
    const { path, x, y } = parsed;
    const isUntracked = x === '?' && y === '?';
    const isStaged = x !== ' ' && x !== '?';
    const isChanged = y !== ' ' && y !== '?';
    if (isUntracked) {
      untracked++;
    } else {
      if (isStaged) staged++;
      if (isChanged) changed++;
    }
    files.push({ path, status: x + y, staged: isStaged });
  }

  const minimal: GitStatusMinimal = { branch, changed, staged, untracked };
  const full: GitStatusFull = { ...minimal, files };
  const verboseResult = withVerbose(minimal, full, verbose);
  return ok(verboseResult);
}

/** git_status 工具定义。 */
export const gitStatusTool: Tool = {
  name: 'git_status',
  description:
    '获取 git 仓库状态。返回 { branch, changed, staged, untracked }。verbose 时额外返回 files 列表。',
  inputSchema: gitStatusInputSchema,
  handler: gitStatusHandler,
};

// ===================== git_log =====================

/** git_log 输入 schema。 */
export const gitLogInputSchema = z.object({
  cwd: z.string().optional().describe('git 仓库路径，默认当前工作目录'),
  limit: z.number().int().positive().optional().describe('返回提交数上限，默认 10'),
  verbose: z.boolean().optional().describe('若为 true，返回完整 40 字符 hash（默认短 hash）'),
});

/** git_log 提交条目。 */
interface LogCommit {
  hash: string;
  author: string;
  date: string;
  subject: string;
}

/** git_log 输出。 */
interface GitLogResult {
  commits: LogCommit[];
  count: number;
}

/** 日志字段分隔符（\x1f = 单元分隔符，避免与提交信息中的 | 冲突）。 */
const LOG_SEP = '\x1f';

/**
 * git_log handler：返回提交历史。
 *
 * 返回 `{ commits: [{ hash, author, date, subject }], count }`。
 * limit 默认 10。verbose 时 hash 为完整 40 字符，否则短 hash。
 * 空仓库返回 `{ commits: [], count: 0 }`。
 * 用 `git log -n <limit> --format=%H%x1f%an%x1f%ad%x1f%s --date=iso`。
 *
 * @param args 已验证的参数
 * @returns 统一输出契约
 */
export async function gitLogHandler(args: Record<string, unknown>): Promise<AnyToolResult> {
  const cwd = getCwd(args);
  const verbose = args['verbose'] === true;
  const rawLimit = args['limit'];
  const limit =
    typeof rawLimit === 'number' && Number.isInteger(rawLimit) && rawLimit > 0 ? rawLimit : 10;

  // verbose 控制 hash 格式（%H 完整 vs %h 短 hash），这是 git 命令参数层面的差异，
  // 而非输出结构差异，因此不适合用 withVerbose（withVerbose 适用于极简/完整两种输出结构）。
  const hashFormat = verbose ? '%H' : '%h';
  const format = `${hashFormat}${LOG_SEP}%an${LOG_SEP}%ad${LOG_SEP}%s`;
  const result = await runGit(
    ['log', '-n', String(limit), `--format=${format}`, '--date=iso'],
    cwd,
  );
  if (result.exitCode !== 0) {
    // 空仓库：无提交
    const stderr = result.stderr.toLowerCase();
    if (
      stderr.includes('does not have any commits') ||
      stderr.includes("bad default revision 'head'") ||
      stderr.includes('unknown revision')
    ) {
      const empty: GitLogResult = { commits: [], count: 0 };
      return ok(empty);
    }
    return fail(ErrorCode.GIT_FAIL, gitError(result.stderr, 'log'));
  }

  const commits: LogCommit[] = [];
  for (const line of result.stdout.split(/\r?\n/)) {
    if (line.length === 0) continue;
    const parts = line.split(LOG_SEP);
    if (parts.length < 4) continue;
    commits.push({
      hash: parts[0]!,
      author: parts[1]!,
      date: parts[2]!,
      subject: parts.slice(3).join(LOG_SEP),
    });
  }

  const out: GitLogResult = { commits, count: commits.length };
  return ok(out);
}

/** git_log 工具定义。 */
export const gitLogTool: Tool = {
  name: 'git_log',
  description:
    '获取 git 提交历史。返回 { commits: [{ hash, author, date, subject }], count }。limit 默认 10。',
  inputSchema: gitLogInputSchema,
  handler: gitLogHandler,
};

// ===================== git_branch =====================

/** git_branch 输入 schema。 */
export const gitBranchInputSchema = z.object({
  cwd: z.string().optional().describe('git 仓库路径，默认当前工作目录'),
  verbose: z.boolean().optional().describe('若为 true，额外返回 all 列表（含 remote 上游）'),
});

/** git_branch 分支条目（verbose）。 */
interface BranchEntry {
  name: string;
  current: boolean;
  remote: string;
}

/** git_branch 极简输出。 */
interface GitBranchMinimal {
  branches: string[];
  current: string;
}

/** git_branch verbose 输出。 */
interface GitBranchFull extends GitBranchMinimal {
  all: BranchEntry[];
}

/**
 * git_branch handler：返回分支列表。
 *
 * 极简返回 `{ branches: string[], current }`。
 * verbose 时额外返回 `{ all: [{ name, current, remote }] }`。
 *
 * @param args 已验证的参数
 * @returns 统一输出契约
 */
export async function gitBranchHandler(args: Record<string, unknown>): Promise<AnyToolResult> {
  const cwd = getCwd(args);
  const verbose = args['verbose'] === true;

  // 获取当前分支
  const currentResult = await runGit(['branch', '--show-current'], cwd);
  if (currentResult.exitCode !== 0) {
    return fail(ErrorCode.GIT_FAIL, gitError(currentResult.stderr, 'branch'));
  }
  let current = currentResult.stdout.trim();

  // detached HEAD 时 current 为空，用短 hash 作为标识
  if (current.length === 0) {
    const hashResult = await runGit(['rev-parse', '--short', 'HEAD'], cwd);
    if (hashResult.exitCode === 0) {
      current = hashResult.stdout.trim();
    }
  }

  // 获取所有本地分支（带 upstream，tab 分隔；直接用 tab 字符避免 %x09 兼容问题）
  const listResult = await runGit(
    ['branch', '--list', `--format=%(refname:short)\t%(upstream:short)`],
    cwd,
  );
  if (listResult.exitCode !== 0) {
    return fail(ErrorCode.GIT_FAIL, gitError(listResult.stderr, 'branch'));
  }

  const branches: string[] = [];
  const all: BranchEntry[] = [];
  for (const line of listResult.stdout.split(/\r?\n/)) {
    if (line.length === 0) continue;
    const tabIdx = line.indexOf('\t');
    const name = tabIdx === -1 ? line : line.slice(0, tabIdx);
    const remote = tabIdx === -1 ? '' : line.slice(tabIdx + 1);
    branches.push(name);
    all.push({ name, current: name === current, remote });
  }

  const minimal: GitBranchMinimal = { branches, current };
  const full: GitBranchFull = { ...minimal, all };
  const result = withVerbose(minimal, full, verbose);
  return ok(result);
}

/** git_branch 工具定义。 */
export const gitBranchTool: Tool = {
  name: 'git_branch',
  description:
    '获取 git 分支列表。返回 { branches, current }。verbose 时额外返回 all 列表（含 remote 上游）。',
  inputSchema: gitBranchInputSchema,
  handler: gitBranchHandler,
};

// ===================== git_diff =====================

/** git_diff 输入 schema。 */
export const gitDiffInputSchema = z.object({
  cwd: z.string().optional().describe('git 仓库路径，默认当前工作目录'),
  staged: z.boolean().optional().describe('若为 true，显示暂存区差异（git diff --cached）'),
  against: z
    .string()
    .optional()
    .describe('目标 ref（commit/分支/HEAD~1），比较工作区或暂存区与之的差异'),
  path: z.string().optional().describe('限制差异范围的文件路径'),
  verbose: z.boolean().optional().describe('若为 true，不截断 diff 输出'),
});

/** git_diff 输出。 */
interface GitDiffResult {
  diff: string;
  truncated: boolean;
  files: string[];
}

/**
 * git_diff handler：返回差异内容（截断）。
 *
 * 返回 `{ diff, truncated, files }`。
 * staged 为 true 时用 `git diff --cached`，否则 `git diff`。
 * path 限制差异范围。
 * diff 输出默认截断到 2000 字符，verbose 时不截断。
 *
 * @param args 已验证的参数
 * @returns 统一输出契约
 */
export async function gitDiffHandler(args: Record<string, unknown>): Promise<AnyToolResult> {
  const cwd = getCwd(args);
  const staged = args['staged'] === true;
  const verbose = args['verbose'] === true;
  const rawPath = args['path'];
  const rawAgainst = args['against'];

  const diffArgs = ['diff'];
  if (staged) diffArgs.push('--cached');
  if (typeof rawAgainst === 'string' && rawAgainst.length > 0) {
    diffArgs.push(rawAgainst);
  }
  if (typeof rawPath === 'string' && rawPath.length > 0) {
    diffArgs.push('--', rawPath);
  }

  const result = await runGit(diffArgs, cwd);
  if (result.exitCode !== 0) {
    return fail(ErrorCode.GIT_FAIL, gitError(result.stderr, 'diff'));
  }

  const rawDiff = result.stdout;
  const files = parseDiffFiles(rawDiff);

  // verbose 时不截断 diff 输出；非 verbose 时截断并标记 truncated
  const truncated = rawDiff.length > DEFAULT_TRUNCATE_LIMIT;
  const diff = truncate(rawDiff);
  const minimal: GitDiffResult = { diff, truncated, files };
  const full: GitDiffResult = { diff: rawDiff, truncated: false, files };
  const out = withVerbose(minimal, full, verbose);
  return ok(out);
}

/** git_diff 工具定义。 */
export const gitDiffTool: Tool = {
  name: 'git_diff',
  description:
    '获取 git 差异内容。返回 { diff, truncated, files }。staged 显示暂存区差异，against 指定目标 ref（如 HEAD~1、main），path 限制范围，输出默认截断。',
  inputSchema: gitDiffInputSchema,
  handler: gitDiffHandler,
};

// ===================== git_add =====================

/** git_add 输入 schema。 */
export const gitAddInputSchema = z.object({
  cwd: z.string().optional().describe('git 仓库路径，默认当前工作目录'),
  paths: z.array(z.string()).min(1).describe('要暂存的文件路径数组（至少一个）'),
});

/** git_add 输出。 */
interface GitAddResult {
  added: string[];
}

/**
 * git_add handler：暂存文件。
 *
 * 返回 `{ added: string[] }`。
 * 路径不存在时 git add 失败，返回 GIT_FAIL。
 *
 * @param args 已验证的参数
 * @returns 统一输出契约
 */
export async function gitAddHandler(args: Record<string, unknown>): Promise<AnyToolResult> {
  const cwd = getCwd(args);
  const rawPaths = args['paths'];

  if (!Array.isArray(rawPaths) || rawPaths.length === 0) {
    return fail(ErrorCode.EINVAL, 'paths 不能为空');
  }
  const paths = rawPaths.filter((p): p is string => typeof p === 'string' && p.length > 0);
  if (paths.length === 0) {
    return fail(ErrorCode.EINVAL, 'paths 不能为空');
  }

  const result = await runGit(['add', '--', ...paths], cwd);
  if (result.exitCode !== 0) {
    return fail(ErrorCode.GIT_FAIL, gitError(result.stderr, 'add'));
  }

  const out: GitAddResult = { added: paths };
  return ok(out);
}

/** git_add 工具定义。 */
export const gitAddTool: Tool = {
  name: 'git_add',
  description: '暂存文件到 git 索引。返回 { added: string[] }。paths 指定文件路径数组。',
  inputSchema: gitAddInputSchema,
  handler: gitAddHandler,
};

// ===================== git_commit =====================

/** git_commit 输入 schema。 */
export const gitCommitInputSchema = z.object({
  cwd: z.string().optional().describe('git 仓库路径，默认当前工作目录'),
  message: z.string().min(1).describe('提交信息'),
  amend: z.boolean().optional().describe('若为 true，修改上一个提交（--amend）'),
});

/** git_commit 输出。 */
interface GitCommitResult {
  committed: boolean;
  hash: string;
  message: string;
}

/**
 * git_commit handler：提交暂存的变更。
 *
 * 返回 `{ committed, hash, message }`。
 * amend 为 true 时用 `git commit --amend -m <message>`。
 * 无变更时 git commit 失败，返回 GIT_FAIL。
 * 不推送。
 *
 * @param args 已验证的参数
 * @returns 统一输出契约
 */
export async function gitCommitHandler(args: Record<string, unknown>): Promise<AnyToolResult> {
  const cwd = getCwd(args);
  const amend = args['amend'] === true;
  const rawMessage = args['message'];

  if (typeof rawMessage !== 'string' || rawMessage.length === 0) {
    return fail(ErrorCode.EINVAL, 'message 不能为空');
  }
  const message = rawMessage;

  const commitArgs = ['commit', '-m', message];
  if (amend) commitArgs.push('--amend');

  const result = await runGit(commitArgs, cwd);
  if (result.exitCode !== 0) {
    return fail(ErrorCode.GIT_FAIL, gitError(result.stderr, 'commit'));
  }

  // 获取新提交 hash
  const hashResult = await runGit(['rev-parse', 'HEAD'], cwd);
  const hash = hashResult.exitCode === 0 ? hashResult.stdout.trim() : '';

  const out: GitCommitResult = { committed: true, hash, message };
  return ok(out);
}

/** git_commit 工具定义。 */
export const gitCommitTool: Tool = {
  name: 'git_commit',
  description: '提交暂存的变更。返回 { committed, hash, message }。amend 修改上一个提交。不推送。',
  inputSchema: gitCommitInputSchema,
  handler: gitCommitHandler,
};

// ===================== git_checkout =====================

/** git_checkout 输入 schema。 */
export const gitCheckoutInputSchema = z.object({
  branch: z.string().min(1).optional().describe('分支名或提交 ref；与 paths 同时提供时作为还原源'),
  create: z.boolean().optional().describe('true 时创建新分支（git checkout -b），仅 branch 单独使用时有效'),
  paths: z.array(z.string().min(1)).optional().describe('要还原的文件路径数组；提供时执行 git checkout [branch] -- paths'),
  cwd: z.string().optional().describe('工作目录，默认 process.cwd()'),
});

/** git_checkout handler：切换/创建分支或还原文件。 */
export async function gitCheckoutHandler(args: Record<string, unknown>): Promise<AnyToolResult> {
  const cwd = getCwd(args);
  const branch = args['branch'];
  const create = args['create'] === true;
  const paths = args['paths'];

  const hasBranch = typeof branch === 'string' && branch.length > 0;
  const hasPaths = Array.isArray(paths) && paths.length > 0;

  if (!hasBranch && !hasPaths) {
    return fail(ErrorCode.EINVAL, 'branch 与 paths 至少提供其一');
  }

  if (create && !hasBranch) {
    return fail(ErrorCode.EINVAL, 'create=true 时必须提供 branch');
  }

  if (create && hasPaths) {
    return fail(ErrorCode.EINVAL, 'create=true 时不能同时提供 paths');
  }

  const gitArgs = ['checkout'];
  if (create) {
    gitArgs.push('-b', branch as string);
  } else if (hasBranch && !hasPaths) {
    gitArgs.push(branch as string);
  } else if (hasBranch && hasPaths) {
    gitArgs.push(branch as string, '--', ...(paths as string[]));
  } else {
    gitArgs.push('--', ...(paths as string[]));
  }

  const result = await runGit(gitArgs, cwd);
  if (result.exitCode !== 0) {
    return fail(ErrorCode.GIT_FAIL, gitError(result.stderr, 'checkout'));
  }

  return ok({ checkedOut: true, ...(hasBranch ? { branch } : {}), ...(hasPaths ? { paths } : {}) }) as unknown as AnyToolResult;
}

/** git_checkout 工具定义。 */
export const gitCheckoutTool: Tool = {
  name: 'git_checkout',
  description: '切换/创建分支或还原文件（≈ git checkout）。branch 单独提供时切换分支；create=true 创建分支；paths 提供时还原文件，可配合 branch 指定源 ref。返回 { checkedOut, branch?, paths? }。',
  inputSchema: gitCheckoutInputSchema,
  handler: gitCheckoutHandler,
  aliases: ['checkout'],
};

// ===================== git_push =====================

/** git_push 输入 schema。 */
export const gitPushInputSchema = z.object({
  remote: z.string().optional().describe('远程名，默认 origin'),
  branch: z.string().optional().describe('分支名，默认当前分支'),
  force: z.boolean().optional().describe('true 时强制推送（--force）'),
  cwd: z.string().optional().describe('工作目录，默认 process.cwd()'),
});

/** git_push handler：推送提交到远程。 */
export async function gitPushHandler(args: Record<string, unknown>): Promise<AnyToolResult> {
  const cwd = getCwd(args);
  const remote = (args['remote'] as string | undefined) ?? 'origin';
  const branch = args['branch'] as string | undefined;
  const force = args['force'] === true;

  const gitArgs = ['push'];
  if (force) gitArgs.push('--force');
  gitArgs.push(remote);
  if (typeof branch === 'string' && branch.length > 0) gitArgs.push(branch);

  const result = await runGit(gitArgs, cwd);
  if (result.exitCode !== 0) {
    return fail(ErrorCode.GIT_FAIL, gitError(result.stderr, 'push'));
  }

  return ok({ pushed: true, remote, branch: branch ?? '' }) as unknown as AnyToolResult;
}

/** git_push 工具定义。 */
export const gitPushTool: Tool = {
  name: 'git_push',
  description: '推送提交到远程（≈ git push）。remote 默认 origin；force 强制推送。返回 { pushed, remote, branch }。',
  inputSchema: gitPushInputSchema,
  handler: gitPushHandler,
  aliases: ['push'],
};

// ===================== git_pull =====================

/** git_pull 输入 schema。 */
export const gitPullInputSchema = z.object({
  remote: z.string().optional().describe('远程名，默认 origin'),
  branch: z.string().optional().describe('分支名，默认当前分支'),
  cwd: z.string().optional().describe('工作目录，默认 process.cwd()'),
});

/** git_pull handler：从远程拉取并合并。 */
export async function gitPullHandler(args: Record<string, unknown>): Promise<AnyToolResult> {
  const cwd = getCwd(args);
  const remote = (args['remote'] as string | undefined) ?? 'origin';
  const branch = args['branch'] as string | undefined;

  const gitArgs = ['pull', remote];
  if (typeof branch === 'string' && branch.length > 0) gitArgs.push(branch);

  const result = await runGit(gitArgs, cwd);
  if (result.exitCode !== 0) {
    return fail(ErrorCode.GIT_FAIL, gitError(result.stderr, 'pull'));
  }

  return ok({ pulled: true, remote, branch: branch ?? '' }) as unknown as AnyToolResult;
}

/** git_pull 工具定义。 */
export const gitPullTool: Tool = {
  name: 'git_pull',
  description: '从远程拉取并合并（≈ git pull）。remote 默认 origin。返回 { pulled, remote, branch }。',
  inputSchema: gitPullInputSchema,
  handler: gitPullHandler,
  aliases: ['pull'],
};

// ===================== git_clone =====================

/** git_clone 输入 schema。 */
export const gitCloneInputSchema = z.object({
  url: z.string().min(1).describe('仓库 URL'),
  path: z.string().optional().describe('目标目录'),
  cwd: z.string().optional().describe('工作目录，默认 process.cwd()'),
});

/** git_clone handler：克隆仓库。 */
export async function gitCloneHandler(args: Record<string, unknown>): Promise<AnyToolResult> {
  const cwd = getCwd(args);
  const url = args['url'];
  const targetPath = args['path'] as string | undefined;

  if (typeof url !== 'string' || url.length === 0) {
    return fail(ErrorCode.EINVAL, 'url 不能为空');
  }

  const gitArgs = ['clone', url];
  if (typeof targetPath === 'string' && targetPath.length > 0) gitArgs.push(targetPath);

  const result = await runGit(gitArgs, cwd);
  if (result.exitCode !== 0) {
    return fail(ErrorCode.GIT_FAIL, gitError(result.stderr, 'clone'));
  }

  return ok({ cloned: true, path: targetPath ?? '' }) as unknown as AnyToolResult;
}

/** git_clone 工具定义。 */
export const gitCloneTool: Tool = {
  name: 'git_clone',
  description: '克隆仓库（≈ git clone）。返回 { cloned, path }。',
  inputSchema: gitCloneInputSchema,
  handler: gitCloneHandler,
  aliases: ['clone'],
};

// ===================== git_stash =====================

/** git_stash 输入 schema。 */
export const gitStashInputSchema = z.object({
  action: z
    .enum(['push', 'pop', 'list', 'drop'])
    .optional()
    .describe('操作，默认 push'),
  cwd: z.string().optional().describe('工作目录，默认 process.cwd()'),
});

/** git_stash handler：暂存/恢复工作区变更。 */
export async function gitStashHandler(args: Record<string, unknown>): Promise<AnyToolResult> {
  const cwd = getCwd(args);
  const action = (args['action'] as string | undefined) ?? 'push';

  let gitArgs: string[];
  switch (action) {
    case 'pop':
      gitArgs = ['stash', 'pop'];
      break;
    case 'list':
      gitArgs = ['stash', 'list'];
      break;
    case 'drop':
      gitArgs = ['stash', 'drop'];
      break;
    default:
      gitArgs = ['stash', 'push'];
      break;
  }

  const result = await runGit(gitArgs, cwd);
  if (result.exitCode !== 0) {
    return fail(ErrorCode.GIT_FAIL, gitError(result.stderr, 'stash'));
  }

  if (action === 'list') {
    const stashes = result.stdout
      .trim()
      .split('\n')
      .filter((l) => l.length > 0);
    return ok({ action, stashes }) as unknown as AnyToolResult;
  }

  return ok({ action, success: true }) as unknown as AnyToolResult;
}

/** git_stash 工具定义。 */
export const gitStashTool: Tool = {
  name: 'git_stash',
  description: '暂存/恢复工作区变更（≈ git stash）。action 支持 push/pop/list/drop，默认 push。',
  inputSchema: gitStashInputSchema,
  handler: gitStashHandler,
  aliases: ['stash'],
};