/**
 * Harness-home 解析：`DSH_HOME` 环境变量优先，回退 `~/.dsh`。
 *
 * DSH 约定：`DSH_HOME`（若设置）是绝对路径；相对值按进程 CWD 解析为绝对。
 * 未设置时使用平台用户主目录下的 `.dsh`。本模块只做路径解析，不访问文件系统。
 */

import { homedir } from "node:os";
import { resolve } from "node:path";

/**
 * 解析 DSH harness 主目录。
 *
 * @returns `DSH_HOME` 的绝对形式，或 `~/.dsh` 的绝对形式。
 */
export function dshHome(): string {
  const env = process.env["DSH_HOME"];
  if (env !== undefined && env !== "") {
    return resolve(env);
  }
  return resolve(homedir(), ".dsh");
}
