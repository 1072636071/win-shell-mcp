/**
 * Host 单实例守卫：同一 bundle 插件在一个进程中只 apply 一次。
 *
 * 同一 npm 包的多个模块实例（npm 副本 vs 仓库 link）共享同一判定——注册表挂
 * 在全局 Symbol 上。第二次 apply 直接 no-op，避免重复注册 settings/tools 导致
 * 启动失败。ctx.effect 立即执行回调并把回调返回值当 disposer，故反注册函数
 * 以返回形式给出而非直接执行。
 */

const MOUNTED = Symbol.for("win-shell-mcp.dsh-bundle.mounted");

interface MountRegistry {
  [MOUNTED]?: Set<string>;
}

function mountedSet(): Set<string> {
  const registry = globalThis as MountRegistry;
  return (registry[MOUNTED] ??= new Set());
}

type EffectCtx = { effect?: (cb: () => () => void) => void };

/**
 * 包装 Cordis 插件 apply：每个进程对同一 packageName 至多生效一次。
 *
 * @param packageName - 包标识（不同安装来源共享）。
 * @param fn - 原始 apply。
 * @returns 同形状的 apply。
 */
export function mountOnce<T extends (...args: any[]) => unknown>(
  packageName: string,
  fn: T,
): T {
  return ((...args: any[]) => {
    const mounted = mountedSet();
    if (mounted.has(packageName)) return;
    mounted.add(packageName);
    const ctx = args[0] as EffectCtx | undefined;
    ctx?.effect?.(() => () => {
      mounted.delete(packageName);
    });
    return fn(...args);
  }) as T;
}
