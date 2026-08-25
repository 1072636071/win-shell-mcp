/**
 * 构建产物验证（工单 01）。
 *
 * beforeAll 触发 `npm run build`，验证 tsup 多入口产出：
 * - dist/index.js（带 shebang）
 * - dist/plugin.js（不带 shebang）
 * - dist/core.js（不带 shebang）
 * 且三者均可动态 import 加载。
 */

import { describe, it, expect, beforeAll } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { execSync } from "node:child_process";

/** 项目根。 */
const root = process.cwd();
/** dist 目录。 */
const dist = join(root, "dist");

/** 动态 import 绝对路径。 */
async function dynamicImport(p: string): Promise<unknown> {
  return import(pathToFileURL(p).href);
}

describe("构建产物", () => {
  beforeAll(() => {
    // 触发构建；execSync 走 shell 以兼容 Windows（npm.cmd）
    execSync("npm run build", { cwd: root, stdio: "pipe" });
  }, 120000);

  it("dist/index.js 存在", () => {
    expect(existsSync(join(dist, "index.js"))).toBe(true);
  });

  it("dist/plugin.js 存在", () => {
    expect(existsSync(join(dist, "plugin.js"))).toBe(true);
  });

  it("dist/core.js 存在", () => {
    expect(existsSync(join(dist, "core.js"))).toBe(true);
  });

  it("dist/index.js 以 shebang 开头", async () => {
    const { readFile } = await import("node:fs/promises");
    const content = await readFile(join(dist, "index.js"), "utf8");
    expect(content.startsWith("#!/usr/bin/env node")).toBe(true);
  });

  it("dist/plugin.js 不以 shebang 开头", async () => {
    const { readFile } = await import("node:fs/promises");
    const content = await readFile(join(dist, "plugin.js"), "utf8");
    expect(content.startsWith("#!")).toBe(false);
  });

  it("dist/core.js 不以 shebang 开头", async () => {
    const { readFile } = await import("node:fs/promises");
    const content = await readFile(join(dist, "core.js"), "utf8");
    expect(content.startsWith("#!")).toBe(false);
  });

  it("dist/core.js 可动态 import 且导出 builtinTools/callTool/listTools", async () => {
    const mod = (await dynamicImport(join(dist, "core.js"))) as Record<
      string,
      unknown
    >;
    expect(mod["builtinTools"]).toBeDefined();
    expect(typeof mod["callTool"]).toBe("function");
    expect(typeof mod["listTools"]).toBe("function");
    expect(typeof mod["ok"]).toBe("function");
    expect(typeof mod["fail"]).toBe("function");
  });

  it("dist/plugin.js 可动态 import 且导出 name/apply/ToolCallError", async () => {
    const mod = (await dynamicImport(join(dist, "plugin.js"))) as Record<
      string,
      unknown
    >;
    expect(mod["name"]).toBe("tool-win-shell");
    expect(typeof mod["apply"]).toBe("function");
    expect(typeof mod["ToolCallError"]).toBe("function");
  });
});
