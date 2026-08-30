/**
 * 相对路径基准（config/cwd）的单测。
 *
 * 契约面：未注入时实时取 `process.cwd()`（MCP 与测试里 chdir 的既有语义不破）；
 * 注入后 `pwd` 与 `pathNormalize` 默认参数都反映注入值；同值重复注入为 no-op
 * （多 preset 挂载同进程时的常态）；异值注入抛错——静默取其一会让另一个会话
 * 把文件写到意料外的目录。
 */
import { describe, it, expect, afterEach } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  getDefaultCwd,
  resetDefaultCwd,
  resolveCwd,
  setDefaultCwd,
} from "../../src/config/cwd.js";
import { pathNormalize, toDisplay } from "../../src/utils/path.js";
import { callTool } from "../../src/server.js";

afterEach(() => {
  resetDefaultCwd();
});

describe("getDefaultCwd", () => {
  it("未注入时实时取进程工作目录", () => {
    expect(getDefaultCwd()).toBe(process.cwd());
  });

  it("注入后返回注入值", () => {
    setDefaultCwd("/tmp/injected-base");
    expect(getDefaultCwd()).toBe("/tmp/injected-base");
  });
});

describe("resolveCwd", () => {
  it("非空字符串入参优先于部署基准", () => {
    setDefaultCwd("/tmp/injected-base");
    expect(resolveCwd("/explicit/dir")).toBe("/explicit/dir");
  });

  it.each([
    ["undefined", undefined],
    ["空串", ""],
    ["非字符串", 42],
  ])("%s 入参回落到部署基准", (_label, raw) => {
    setDefaultCwd("/tmp/injected-base");
    expect(resolveCwd(raw)).toBe("/tmp/injected-base");
  });

  it("未注入时回落到进程工作目录", () => {
    expect(resolveCwd(undefined)).toBe(process.cwd());
  });
});

describe("setDefaultCwd", () => {
  it("同值重复注入为 no-op（多 preset 挂载同一进程）", () => {
    setDefaultCwd("/tmp/shared-base");
    expect(() => setDefaultCwd("/tmp/shared-base")).not.toThrow();
    expect(getDefaultCwd()).toBe("/tmp/shared-base");
  });

  it("异值注入抛错并点名两个目录", () => {
    setDefaultCwd("/tmp/first");
    expect(() => setDefaultCwd("/tmp/second")).toThrow(/\/tmp\/first[\s\S]*\/tmp\/second/);
  });

  it("空串是非法基准", () => {
    expect(() => setDefaultCwd("")).toThrow(/空串/);
  });
});

describe("注入值的模型可见落点", () => {
  // 基准取真实临时目录：path.resolve 在 win32 下会给相对路径补盘符，
  // 用 POSIX 字面量断言会写出只在 Linux 成立的用例。
  const BASE = join(tmpdir(), "wsm-cwd-base");

  it("pwd 返回注入的基准（persona 里的 {{cwd}} 与模型探路结果必须一致）", async () => {
    setDefaultCwd(BASE);
    const result = await callTool("pwd", {});
    expect(result.ok).toBe(true);
    expect((result as { cwd?: string }).cwd).toBe(toDisplay(BASE));
  });

  it("pathNormalize 缺省基准跟随注入值", () => {
    setDefaultCwd(BASE);
    expect(pathNormalize("nested/file.txt")).toBe(join(BASE, "nested", "file.txt"));
  });
});
