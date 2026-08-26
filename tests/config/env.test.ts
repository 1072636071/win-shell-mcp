import { describe, it, expect } from "vitest";
import {
  ENV_WIN_SHELL_TOOLS,
  ENV_WIN_SHELL_LAZY,
  ENV_WIN_SHELL_TRUNCATE,
  parseToolsWhitelist,
  parseLazyMode,
  parseTruncateLimit,
} from "../../src/config/env.js";

/**
 * 测试用正名表：固定假想集合，不依赖真实注册表（伪造环境源注入）。
 * `ls` 刻意不在表内，用于验证"别名视为未知条目"。
 */
const CANONICAL = ["fs_list", "git_status", "shell_exec", "batch_run"];

describe("ENV 变量名常量收敛", () => {
  it("两个变量名的常量值与字面量一致", () => {
    expect(ENV_WIN_SHELL_TOOLS).toBe("WIN_SHELL_TOOLS");
    expect(ENV_WIN_SHELL_LAZY).toBe("WIN_SHELL_LAZY");
    expect(ENV_WIN_SHELL_TRUNCATE).toBe("WIN_SHELL_TRUNCATE");
  });
});

describe("parseToolsWhitelist", () => {
  it.each([
    ["undefined 视作未配置（全量）", undefined],
    ["空串视作未配置（全量）", ""],
    ["纯空白视作未配置（全量）", "   "],
    ["制表/换行空白视作未配置（全量）", " \t\n "],
    ["仅逗号空段视作未配置（全量）", ",,,"],
  ] as ReadonlyArray<[string, string | undefined]>)("%s", (_label, raw) => {
    expect(parseToolsWhitelist(raw, CANONICAL)).toEqual({
      ok: true,
      names: new Set(),
    });
  });

  it("正常名单返回去重后的正名集合", () => {
    expect(parseToolsWhitelist("fs_list,git_status", CANONICAL)).toEqual({
      ok: true,
      names: new Set(["fs_list", "git_status"]),
    });
  });

  it("逐项 trim 并忽略空段", () => {
    expect(
      parseToolsWhitelist(" fs_list ,,\tgit_status\t, shell_exec ,", CANONICAL),
    ).toEqual({
      ok: true,
      names: new Set(["fs_list", "git_status", "shell_exec"]),
    });
  });

  it("重复项去重且保留首次出现顺序", () => {
    const result = parseToolsWhitelist(
      "git_status,fs_list, fs_list ,git_status",
      CANONICAL,
    );
    expect(result).toEqual({
      ok: true,
      names: new Set(["git_status", "fs_list"]),
    });
    expect([...(result.ok ? result.names : [])]).toEqual([
      "git_status",
      "fs_list",
    ]);
  });

  it("未知条目报错并携带全部非法条目原文", () => {
    expect(parseToolsWhitelist("bogus_one,bogus_two", CANONICAL)).toEqual({
      ok: false,
      unknown: ["bogus_one", "bogus_two"],
    });
  });

  it("非法条目重复时报错仍去重", () => {
    expect(
      parseToolsWhitelist("bogus_one, bogus_one ,fs_list,bogus_two", CANONICAL),
    ).toEqual({
      ok: false,
      unknown: ["bogus_one", "bogus_two"],
    });
  });

  it("混合已知与未知时整体失败，不返回部分合法集合", () => {
    const result = parseToolsWhitelist(
      "fs_list,bogus_one,git_status",
      CANONICAL,
    );
    expect(result).toEqual({ ok: false, unknown: ["bogus_one"] });
  });

  it("别名视为未知条目并含该条原文", () => {
    // ls 是 fs_list 的别名，但别名不在白名单语法中：必须按未知条目报错
    expect(parseToolsWhitelist("fs_list,ls", CANONICAL)).toEqual({
      ok: false,
      unknown: ["ls"],
    });
  });

  it("大小写敏感：大写变体视为未知条目", () => {
    expect(parseToolsWhitelist("FS_LIST", CANONICAL)).toEqual({
      ok: false,
      unknown: ["FS_LIST"],
    });
  });

  it("接受任意可迭代正名源（Set 注入）", () => {
    expect(parseToolsWhitelist("a,b,a", new Set(["a", "b"]))).toEqual({
      ok: true,
      names: new Set(["a", "b"]),
    });
  });
});

describe("parseLazyMode", () => {
  it.each([
    ["缺省（undefined）为全量模式", undefined, false],
    ["空串为全量模式", "", false],
    ["纯空白为全量模式", "   ", false],
    ['恰为 "1" 为懒模式', "1", true],
    ['"0" 明确落在全量模式', "0", false],
    ['"true" 明确落在全量模式', "true", false],
    ['"false" 为全量模式', "false", false],
    ['"yes" 为全量模式', "yes", false],
    ['"01" 为全量模式', "01", false],
    ['"2" 为全量模式', "2", false],
    ['带空白的 " 1 " 不宽容、为全量模式', " 1 ", false],
  ] as ReadonlyArray<[string, string | undefined, boolean]>)(
    "%s",
    (_label, raw, expected) => {
      expect(parseLazyMode(raw)).toBe(expected);
    },
  );
});

describe("parseTruncateLimit（工单 15-02）", () => {
  it.each([
    ["undefined 视作缺省 2000", undefined],
    ["空串视作缺省 2000", ""],
    ["纯空白视作缺省 2000", "   "],
  ] as ReadonlyArray<[string, string | undefined]>)("%s", (_label, raw) => {
    expect(parseTruncateLimit(raw)).toEqual({ ok: true, limit: 2000 });
  });

  it("正整数返回该值", () => {
    expect(parseTruncateLimit("800")).toEqual({ ok: true, limit: 800 });
    expect(parseTruncateLimit("1")).toEqual({ ok: true, limit: 1 });
    expect(parseTruncateLimit("5000")).toEqual({ ok: true, limit: 5000 });
  });

  it.each([
    ["0 非正整数", "0"],
    ["负数", "-100"],
    ["非整数", "200.5"],
    ["非数字", "abc"],
    ["空带空白的非数字", "  abc  "],
  ])("%s → 失败并点名变量与非法值", (_label, raw) => {
    const result = parseTruncateLimit(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("WIN_SHELL_TRUNCATE");
      expect(result.reason).toContain(raw.trim());
    }
  });
});
