/**
 * 平台相关共享常量。
 *
 * 抽取自各工具模块以消除 `IS_WIN = process.platform === 'win32'` 的重复定义
 * （见 ADR-0003 / Duplicated Code 消除）。
 */

/** 是否为 Windows 平台。模块加载时固定，避免重复调用。 */
export const IS_WIN = process.platform === 'win32';