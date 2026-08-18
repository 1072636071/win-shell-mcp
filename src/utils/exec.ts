/**
 * 子进程执行共享工具。
 *
 * 抽取自各工具模块以消除 `execFileAsync = promisify(execFile)` 的重复定义
 * （见 ADR-0003 / Duplicated Code 消除）。
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

/** promisified execFile。 */
export const execFileAsync = promisify(execFile);