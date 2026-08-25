/**
 * 并发分类测试（工单 04）：验证变更工具在 DSH 投影中默认独占。
 *
 * 实现说明（同 concurrency-readonly-a/b.test.ts 的模式）：
 * - src/plugin.ts 的 projectTool 是模块私有函数未导出。故复刻 projectTool 的
 *   isConcurrencySafe 派生逻辑（readOnlyHint===true → ()=>true；否则命中参数级
 *   覆盖表按 action 判定，未命中 → undefined），逐工具断言。
 * - 复刻仅 isConcurrencySafe 一行判定，不复刻 schema 转换与 execute。
 *
 * 变更工具的并发分类契约：readOnlyHint === false → 默认独占（isConcurrencySafe 省略，
 * DSH 视为 exclusive），除非命中参数级覆盖表按调用参数放行（见 git_stash 逃生舱）。
 *
 * git_stash 逃生舱：
 * - 参数级并发例外：plugin.ts 的 PARAM_LEVEL_CONCURRENT 覆盖表将 `action:'list'`
 *   判为并发，其余 action（push/pop/apply…）保持独占。用真实 apply 锚定 +
 *   projectConcurrency 复刻双向验证。
 * - 只读语义：在临时 git 仓库中连续两次调用 gitStashHandler({ action: 'list' })，
 *   第二次结果与第一次相同（list 不改仓库状态），为覆盖表放行的安全依据。
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { builtinTools, type Tool } from "../../src/registry.js";
import {
  apply,
  type DshToolDefinition,
  type CordisPluginContext,
} from "../../src/plugin.js";
import { isOk } from "../../src/contract/output.js";
import { gitStashHandler } from "../../src/tools/git.js";

const execFileAsync = promisify(execFile);

/**
 * 变更工具清单（readOnlyHint === false，24 个）。
 *
 * 与 guard-mutating.test.ts 的 MUTATING_TOOLS 一致。
 */
const MUTATING_TOOLS: readonly string[] = [
  "fs_write",
  "fs_mkdir",
  "fs_rm",
  "fs_cp",
  "fs_mv",
  "fs_touch",
  "text_replace",
  "archive_create",
  "archive_extract",
  "net_post",
  "net_download",
  "env_set",
  "env_unset",
  "process_kill",
  "pkg_run",
  "git_add",
  "git_commit",
  "git_checkout",
  "git_push",
  "git_pull",
  "git_clone",
  "git_stash",
  "shell_exec",
  "run_command",
];

/**
 * 参数级并发例外覆盖表（与 src/plugin.ts 的 PARAM_LEVEL_CONCURRENT 逐字一致，
 * 仅复刻并发分类契约）。新增例外时须同步 plugin.ts 与下方逃生舱测试，防漂移。
 */
const PARAM_LEVEL_CONCURRENT: Record<
  string,
  (args: Record<string, unknown>) => boolean
> = {
  git_stash: (args) => args.action === "list",
};

/**
 * 复刻 plugin.ts projectTool / projectConcurrencySafe 的 isConcurrencySafe 派生逻辑。
 *
 * 与 src/plugin.ts 逐字一致，仅取并发分类契约，省略 schema 转换与 execute。
 */
function projectConcurrency(
  tool: Tool,
): Pick<DshToolDefinition, "name" | "isConcurrencySafe"> {
  const derive =
    tool.annotations?.readOnlyHint === true
      ? () => true
      : PARAM_LEVEL_CONCURRENT[tool.name];
  return { name: tool.name, isConcurrencySafe: derive };
}

/** 捕获 defineTool 调用的 fake ctx（同 concurrency-readonly-a.test.ts 的 mock 模式）。 */
function makeFakeCtx(): {
  ctx: CordisPluginContext;
  defined: Map<string, DshToolDefinition>;
} {
  const defined = new Map<string, DshToolDefinition>();
  const ctx: CordisPluginContext = {
    tools: {
      defineTool(def: DshToolDefinition) {
        defined.set(def.name, def);
      },
    },
  };
  return { ctx, defined };
}

describe("工单 04：变更工具 DSH 投影并发分类（默认独占）", () => {
  // 锚点：fs_read 经真实 apply/projectTool 投影后 isConcurrencySafe()===true，
  // 证明 projectConcurrency 复刻逻辑与 plugin.ts 实际透传一致
  it("锚点：fs_read 经 apply 投影后 isConcurrencySafe()===true（复刻逻辑与 plugin.ts 一致）", () => {
    const { ctx, defined } = makeFakeCtx();
    apply(ctx);
    const def = defined.get("fs_read");
    expect(def?.isConcurrencySafe).toBeDefined();
    expect(def?.isConcurrencySafe?.({})).toBe(true);
  });

  // 逐变更工具：除命中参数级覆盖表的 git_stash 外，投影后 isConcurrencySafe 为 undefined（独占）
  const STATIC_EXCLUSIVE = MUTATING_TOOLS.filter((n) => n !== "git_stash");
  for (const name of STATIC_EXCLUSIVE) {
    it(`${name} 投影后 isConcurrencySafe 为 undefined（独占）`, () => {
      const tool = builtinTools.find((t) => t.name === name);
      expect(tool, `工具应存在: ${name}`).toBeDefined();
      if (!tool) return;
      const projected = projectConcurrency(tool);
      expect(
        projected.isConcurrencySafe,
        `${name} 应无 isConcurrencySafe（readOnlyHint !== true 且未命中覆盖表 → 独占）`,
      ).toBeUndefined();
    });
  }

  // git_stash：命中参数级覆盖表，isConcurrencySafe 应按 action 判定
  it("git_stash 命中参数级覆盖表 → isConcurrencySafe 按 action 判定（list 并发，其余独占）", () => {
    const stash = builtinTools.find((t) => t.name === "git_stash");
    expect(stash, "git_stash 应存在").toBeDefined();
    if (!stash) return;
    const projected = projectConcurrency(stash);
    expect(
      projected.isConcurrencySafe,
      "git_stash 应有 isConcurrencySafe（覆盖表命中）",
    ).toBeDefined();
    expect(projected.isConcurrencySafe?.({ action: "list" })).toBe(true);
    expect(projected.isConcurrencySafe?.({ action: "push" })).toBe(false);
    expect(projected.isConcurrencySafe?.({ action: "pop" })).toBe(false);
  });

  // 汇总：变更工具数为 24
  it("变更工具数为 24", () => {
    expect(MUTATING_TOOLS.length).toBe(24);
  });
});

// ─── git_stash 逃生舱测试 ───────────────────────────────────

/** 临时目录根，每个用例独立一份。 */
let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "wsmcp-stash-"));
});

afterEach(async () => {
  try {
    await fs.rm(tmpDir, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  } catch {
    // Windows 下 git 子进程可能仍短暂占用目录句柄（EBUSY），忽略清理失败。
  }
});

/** 执行 git 命令（测试辅助）。 */
async function git(args: string[], cwd: string): Promise<void> {
  await execFileAsync("git", args, { cwd, windowsHide: true });
}

/**
 * 初始化一个临时 git 仓库并做一次初始提交。
 *
 * 用 `git symbolic-ref HEAD refs/heads/main` 确保默认分支为 main（兼容所有 git 版本）。
 */
async function initRepo(dir: string): Promise<void> {
  await git(["init"], dir);
  await git(["symbolic-ref", "HEAD", "refs/heads/main"], dir);
  await git(["config", "user.name", "TestUser"], dir);
  await git(["config", "user.email", "test@example.com"], dir);
  await fs.writeFile(path.join(dir, "README.md"), "# Test\n", "utf8");
  await git(["add", "README.md"], dir);
  await git(["commit", "-m", "initial commit"], dir);
}

describe("工单 04：git_stash 逃生舱", () => {
  it("git_stash base readOnlyHint === false（默认独占，仅 action:'list' 经覆盖表放行）", () => {
    const tool = builtinTools.find((t) => t.name === "git_stash");
    expect(tool, "git_stash 应存在").toBeDefined();
    expect(tool?.annotations?.readOnlyHint).toBe(false);
  });

  it("git_stash 经 apply 真实投影：isConcurrencySafe({action:'list'})()===true（params 判定）", () => {
    // 用真实 apply/plugin.ts 派生逻辑验证覆盖表生效，锚定 projectConcurrency 复刻
    const { ctx, defined } = makeFakeCtx();
    apply(ctx);
    const def = defined.get("git_stash");
    expect(def, "git_stash 应被 apply 注册").toBeDefined();
    expect(def?.isConcurrencySafe, "覆盖表命中应有 isConcurrencySafe").toBeDefined();
    expect(def?.isConcurrencySafe?.({ action: "list" })).toBe(true);
    expect(def?.isConcurrencySafe?.({ action: "push" })).toBe(false);
  });

  // 逃生舱语义测试：action='list' 的 handler 只读（不修改仓库状态）
  it('逃生舱：action="list" 的 handler 只读——连续两次 list 结果一致（不修改仓库状态）', async () => {
    await initRepo(tmpDir);

    // 修改已跟踪文件 README.md，stash push（stash 默认只收纳已跟踪文件的变更）
    await fs.writeFile(path.join(tmpDir, "README.md"), "# Modified\n", "utf8");
    const pushResult = await gitStashHandler({ action: "push", cwd: tmpDir });
    expect(isOk(pushResult), "stash push 应成功").toBe(true);

    // 第一次 list
    const list1 = await gitStashHandler({ action: "list", cwd: tmpDir });
    expect(isOk(list1), "stash list 应成功").toBe(true);
    const list1Data = list1 as { ok: true; action: string; stashes: string[] };
    expect(list1Data.action).toBe("list");
    expect(
      list1Data.stashes.length,
      "应至少有 1 个 stash",
    ).toBeGreaterThanOrEqual(1);

    // 第二次 list（紧接第一次，中间无变更操作）
    const list2 = await gitStashHandler({ action: "list", cwd: tmpDir });
    expect(isOk(list2), "第二次 stash list 应成功").toBe(true);
    const list2Data = list2 as { ok: true; stashes: string[] };

    // 两次 list 结果一致 → list 不改仓库状态（只读语义）
    expect(list2Data.stashes, "连续两次 list 结果应一致（list 只读）").toEqual(
      list1Data.stashes,
    );
  });

  it('逃生舱：action="list" 在空仓库返回空 stash 列表（只读，不创建 stash）', async () => {
    await initRepo(tmpDir);

    const listResult = await gitStashHandler({ action: "list", cwd: tmpDir });
    expect(isOk(listResult), "stash list 应成功").toBe(true);
    const data = listResult as { ok: true; action: string; stashes: string[] };
    expect(data.action).toBe("list");
    expect(data.stashes, "空仓库 stash 列表应为空").toEqual([]);

    // 验证 list 未创建 stash：再次 list 仍为空
    const listResult2 = await gitStashHandler({ action: "list", cwd: tmpDir });
    const data2 = listResult2 as { ok: true; stashes: string[] };
    expect(data2.stashes, "再次 list 仍应为空（list 不创建 stash）").toEqual(
      [],
    );
  });
});
