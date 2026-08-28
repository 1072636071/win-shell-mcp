/**
 * 相对路径基准的运行期状态（config 锥体内的叶子，与 truncate.ts 同形）。
 *
 * 工具收到的相对路径需要一个绝对基准才能解析。基准默认取宿主进程的
 * `process.cwd()`；部署可显式注入一个基准（DSH 经插件 `Config.cwd`、
 * MCP stdio 经 `WIN_SHELL_CWD`），使基准成为**提示词里可陈述的事实**：
 * 模型不必先调一次 `pwd` 探路，也不会把相对路径落到意料外的目录。
 *
 * 未注入时每次读取实时取 `process.cwd()`，因此 MCP/测试里 `process.chdir()`
 * 的既有语义不受本模块影响（零破坏，与 truncate 的默认值策略一致）。
 *
 * 进程级约束：基准是进程内唯一值。多 agent preset 在同一宿主进程挂载时，
 * 各 preset 必须注入同一个值（同一 `DSH_CWD` 推导即自然同值）；注入不同值
 * 直接抛错，因为静默取其一会让另一会话把文件写到意料外的目录。
 * 测试需在 afterEach 调 {@link resetDefaultCwd} 复原，避免跨用例污染。
 */

/** 当前生效的相对路径基准；undefined = 未注入，实时读 `process.cwd()`。 */
let configuredCwd: string | undefined;

/**
 * 读取相对路径基准（供 `pathNormalize` 默认参数与工具 cwd 兜底调用）。
 * @returns 注入过的基准，或实时的 `process.cwd()`
 */
export function getDefaultCwd(): string {
  return configuredCwd ?? process.cwd();
}

/**
 * 解析工具入参里的 `cwd`：给了非空字符串就用它，否则回落到部署基准。
 * @param raw - 工具参数原值（未经校验，可能是任意类型）
 * @returns 生效的绝对或相对基准目录
 */
export function resolveCwd(raw: unknown): string {
  return typeof raw === 'string' && raw.length > 0 ? raw : getDefaultCwd();
}

/**
 * 注入相对路径基准（启动时由 stdio 入口或 DSH 插件 apply 调用）。
 * @param cwd - 绝对路径基准；空串视为非法
 * @throws Error 当 `cwd` 为空串，或与已注入基准不一致时
 */
export function setDefaultCwd(cwd: string): void {
  if (cwd === '') {
    throw new Error('默认工作目录不能为空串');
  }
  if (configuredCwd !== undefined && configuredCwd !== cwd) {
    throw new Error(
      `默认工作目录已注入为 ${configuredCwd}，拒绝改为 ${cwd}（基准是进程级唯一值）`,
    );
  }
  configuredCwd = cwd;
}

/** 复原为未注入状态（测试用）。 */
export function resetDefaultCwd(): void {
  configuredCwd = undefined;
}
