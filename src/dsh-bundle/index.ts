/**
 * win-shell-mcp DSH bundle 插件（`./dsh-bundle` 子路径导出）。
 *
 * Host 半区：启动时把包内 `presets/` 树同步进 harness-home 的 agent-presets
 * 根（`~/.dsh/.agent-presets`），使 WShell 系列 preset 出现在 DSH 模式选择器，
 * 无需手动拷贝文件。工具本身不在这里注册——WShell 各 preset 的
 * `agent.cordis.yml` 通过 `./tool-win-shell.mjs`（re-export `win-shell-mcp/plugin`）
 * 把 win-shell-mcp 工具注册进 agent-plane，另挂 DSH 原生 fs/web/lsp 组。
 *
 * 本模块只声明最小宿主契约类型，不硬依赖 `@deepseek-ai/cordis`。
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dshHome } from "./dsh-home.js";
import { mountOnce } from "./mount-once.js";
import { syncPresetTrees } from "./sync.js";

/** 稳定插件名。 */
export const name = "wshell-bundle";

/** 插件配置。 */
export interface Config {
  /** 总开关：false 时既不 sync 也不做任何事。 */
  enabled?: boolean;
}

/** Cordis 宿主最小契约（仅声明本插件使用的字段）。 */
export interface CordisContext {
  effect?: (cb: () => () => void) => void;
  logger?: {
    info?: (message: string) => void;
    warn?: (message: string) => void;
  };
}

/** 包内 bundled `presets/` 树的绝对路径（源 `src/dsh-bundle/` 与构建产物
 *  `dist/dsh-bundle/` 同为二级子目录，`../../presets/` 对两者都解析到包根）。 */
export function bundledPresetsRoot(): string {
  return fileURLToPath(new URL("../../presets/", import.meta.url));
}

/** 本 bundle 拥有、sync 时从目标根移除的 preset id（曾发布后废弃时使用）。 */
export const RETIRED_PRESETS: string[] = [];

/**
 * 挂载插件：把 bundled presets 同步进 harness-home agent-presets 根。
 *
 * @param ctx - host 插件上下文（最小契约）。
 * @param config - 插件配置（enabled 默认 true）。
 */
export const apply = mountOnce("win-shell-mcp/dsh-bundle", (ctx: CordisContext, config: Config = {}) => {
  const enabled = config.enabled ?? true;
  if (!enabled) return;
  const targetRoot = join(dshHome(), ".agent-presets");
  try {
    mkdirSync(targetRoot, { recursive: true });
    const result = syncPresetTrees(bundledPresetsRoot(), targetRoot, RETIRED_PRESETS);
    for (const { id, error } of result.failed) {
      ctx.logger?.warn?.(`win-shell-mcp dsh-bundle: preset ${id} sync failed: ${error}`);
    }
    if (result.synced.length > 0) {
      ctx.logger?.info?.(`win-shell-mcp dsh-bundle: presets synced into ${targetRoot}: ${result.synced.join(", ")}`);
    }
    if (result.retired.length > 0) {
      ctx.logger?.info?.(`win-shell-mcp dsh-bundle: retired stale presets from ${targetRoot}: ${result.retired.join(", ")}`);
    }
  } catch (error) {
    ctx.logger?.warn?.(
      `win-shell-mcp dsh-bundle: preset sync failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
});

/** Cordis 插件对象（默认导出）。 */
export default { name, apply };
