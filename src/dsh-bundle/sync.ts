/**
 * 把插件自带的 `presets/` 树同步进 dsh agent-presets 发现根
 * （harness-home 的 `.agent-presets`）。
 *
 * 一个 preset = 一个含 `agent.cordis.yml` 的目录，目录名即 preset id。
 * 同步按目录幂等：目标树与源树字节一致则跳过；否则整树复制并清掉源不包含的
 * 目标文件。插件不拥有的目录（用户自建的其他 preset）绝不触碰。
 *
 * 注意：不用 `fs.cpSync(recursive)` —— Node 22 上源路径含非 ASCII（如 CJK
 * 主目录）时它会以致命错误崩溃进程（nodejs/node#54476），因此复制走
 * per-entry 原语，与模块其余部分一致。
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
} from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { validateAgentCordis } from "./schema.js";

/** mtime 快速路径容差：超出此差值的文件对不可能字节相同，跳过读取。 */
const MTIME_TOLERANCE_MS = 1000;

/** 一次同步的结果，按诊断用途分组。 */
export interface SyncResult {
  /** 本次被（重）写入的 preset id。 */
  synced: string[];
  /** 已是最新、未复制的 preset id。 */
  current: string[];
  /** 失败的 preset id 与错误消息。 */
  failed: { id: string; error: string }[];
  /** 本 bundle 曾拥有、本次从目标根移除的 preset id。 */
  retired: string[];
}

/** 递归列出目录下所有文件路径。 */
function filesUnder(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else out.push(path);
    }
  };
  walk(root);
  return out;
}

/**
 * 文件同一性 = 字节。size/mtime 只是快速否定检查：不等或超出容差证明不可能
 * 字节相同，但相等仍落到字节比较，内容差异永不被漏过。
 */
function sameFile(a: string, b: string): boolean {
  const sa = statSync(a);
  const sb = statSync(b);
  if (sa.size !== sb.size) return false;
  if (Math.abs(sa.mtimeMs - sb.mtimeMs) > MTIME_TOLERANCE_MS) return false;
  return readFileSync(a).equals(readFileSync(b));
}

/** 删除 `keep`（相对路径）之外的目录内容，再清掉因此空出的目录——严格限
 *  在 `root` 内，兄弟 preset 永不被碰。 */
function pruneExtras(root: string, keep: ReadonlySet<string>): void {
  const parents = new Set<string>();
  for (const file of filesUnder(root)) {
    if (!keep.has(relative(root, file))) {
      parents.add(dirname(file));
      rmSync(file, { force: true });
    }
  }
  for (const start of parents) {
    let dir: string | undefined = start;
    while (dir !== undefined && relative(root, dir) !== "") {
      if (existsSync(dir) && readdirSync(dir).length === 0) {
        rmSync(dir, { recursive: true, force: true });
        dir = dirname(dir);
      } else {
        dir = undefined;
      }
    }
  }
}

/** 校验磁盘上已同步 preset 的 `agent.cordis.yml`。 */
function validatePresetAgentFile(presetDir: string): string[] {
  const agent = join(presetDir, "agent.cordis.yml");
  if (!existsSync(agent)) return ["agent.cordis.yml is missing from the preset tree"];
  return validateAgentCordis(readFileSync(agent, "utf8"));
}

/** 整树复制 `sourceDir` → `targetDir`（创建目标目录）。保留源 mtime。 */
function copyTreeSync(sourceDir: string, targetDir: string): void {
  mkdirSync(targetDir, { recursive: true });
  for (const entry of readdirSync(sourceDir)) {
    const source = join(sourceDir, entry);
    const target = join(targetDir, entry);
    const stat = statSync(source);
    if (stat.isDirectory()) {
      copyTreeSync(source, target);
    } else {
      copyFileSync(source, target);
      utimesSync(target, stat.atime, stat.mtime);
    }
  }
}

/** 幂等复制 `sourceDir` 到 `targetDir`。 */
export function syncOnePreset(sourceDir: string, targetDir: string): "synced" | "current" {
  const sourceFiles = filesUnder(sourceDir);
  const sourceSet = new Set(sourceFiles.map((file) => relative(sourceDir, file)));

  if (existsSync(targetDir) && !statSync(targetDir).isDirectory()) {
    rmSync(targetDir, { recursive: true, force: true });
  }
  if (!existsSync(targetDir)) {
    copyTreeSync(sourceDir, targetDir);
    pruneExtras(targetDir, sourceSet);
    return "synced";
  }

  let dirty = false;
  for (const file of sourceFiles) {
    const dest = join(targetDir, relative(sourceDir, file));
    if (!existsSync(dest) || !sameFile(file, dest)) {
      dirty = true;
      break;
    }
  }
  if (!dirty) {
    for (const file of filesUnder(targetDir)) {
      if (!sourceSet.has(relative(targetDir, file))) {
        dirty = true;
        break;
      }
    }
  }
  if (!dirty) return "current";

  // 先清目标独有条目避免 file/dir 类型冲突，再复制并按复制后契约再剪一次。
  pruneExtras(targetDir, sourceSet);
  copyTreeSync(sourceDir, targetDir);
  pruneExtras(targetDir, sourceSet);
  return "synced";
}

/**
 * 把 `sourceRoot` 下每个 preset 同步进 `targetRoot`，再移除 `retire` 中
 * 已不再随 bundle 发布的 target 目录（只删这些精确 id，其他目录不碰）。
 *
 * @param sourceRoot - 插件自带的 preset 树。
 * @param targetRoot - dsh agent-presets 发现根。
 * @param retire - 源中已消失、需从目标根移除的 preset id。
 */
export function syncPresetTrees(
  sourceRoot: string,
  targetRoot: string,
  retire: string[] = [],
): SyncResult {
  const result: SyncResult = { synced: [], current: [], failed: [], retired: [] };
  mkdirSync(targetRoot, { recursive: true });
  if (existsSync(sourceRoot)) {
    for (const entry of readdirSync(sourceRoot)) {
      const source = join(sourceRoot, entry);
      if (!statSync(source).isDirectory()) continue;
      const id = basename(source);
      const targetDir = join(targetRoot, id);
      let outcome: "synced" | "current";
      try {
        outcome = syncOnePreset(source, targetDir);
      } catch (error) {
        result.failed.push({ id, error: error instanceof Error ? error.message : String(error) });
        continue;
      }
      try {
        const problems = validatePresetAgentFile(targetDir);
        if (problems.length > 0) {
          result.failed.push({ id, error: `agent.cordis.yml failed validation: ${problems.join("; ")}` });
        } else if (outcome === "synced") {
          result.synced.push(id);
        } else {
          result.current.push(id);
        }
      } catch (error) {
        result.failed.push({ id, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  for (const id of retire) {
    if (existsSync(join(sourceRoot, id))) continue;
    const stale = join(targetRoot, id);
    if (existsSync(stale) && statSync(stale).isDirectory()) {
      rmSync(stale, { recursive: true, force: true });
      result.retired.push(id);
    }
  }
  return result;
}
