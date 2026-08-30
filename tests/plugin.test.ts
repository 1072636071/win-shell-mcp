/**
 * DSH 插件投影测试（工单 01/05）。
 *
 * 用 fake ctx 捕获 defineTool 调用，验证：
 * - apply 全量注册 59 个工具（工单 05 移除白名单后）
 * - fs_read 投影含正确 output.schema + isConcurrencySafe()===true
 * - execute 解包：ok→return data，fail→throw ToolCallError
 * - config.exclude 过滤
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  apply,
  ToolCallError,
  type DshToolDefinition,
  type CordisPluginContext,
} from "../src/plugin.js";
import { builtinTools } from "../src/registry.js";
import { getDefaultCwd, resetDefaultCwd } from "../src/config/cwd.js";

/** 内置工具总数（工单 12 起 59 个）。 */
const EXPECTED_TOOL_COUNT = builtinTools.length;

/** 捕获 defineTool 调用的 fake ctx。 */
function makeFakeCtx(): {
  ctx: CordisPluginContext;
  defined: Map<string, DshToolDefinition>;
} {
  const defined = new Map<string, DshToolDefinition>();
  const ctx: CordisPluginContext = {
    tools: {
      defineTool(def: DshToolDefinition) {
        defined.set(def.name, def);
      },
    },
  };
  return { ctx, defined };
}

/** 临时目录。 */
let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "wsm-plugin-"));
});

describe("apply 全量注册", () => {
  it("注册全部内置工具", () => {
    const { ctx, defined } = makeFakeCtx();
    apply(ctx);
    expect(defined.size).toBe(EXPECTED_TOOL_COUNT);
    expect(defined.has("fs_read")).toBe(true);
  });

  it("注册集合等于 builtinTools 工具名集合", () => {
    const { ctx, defined } = makeFakeCtx();
    apply(ctx);
    const builtinNames = new Set(builtinTools.map((t) => t.name));
    expect(defined.size).toBe(builtinNames.size);
    for (const name of builtinNames) {
      expect(defined.has(name)).toBe(true);
    }
  });

  it("config.exclude 过滤指定工具", () => {
    const { ctx, defined } = makeFakeCtx();
    apply(ctx, { exclude: ["fs_read"] });
    expect(defined.has("fs_read")).toBe(false);
    expect(defined.size).toBe(EXPECTED_TOOL_COUNT - 1);
  });
});

describe("fs_read DSH 投影字段", () => {
  it("name 与 description 正确", () => {
    const { ctx, defined } = makeFakeCtx();
    apply(ctx);
    const def = defined.get("fs_read");
    expect(def?.name).toBe("fs_read");
    expect(def?.description.length).toBeGreaterThan(0);
  });

  it("input.schema 是 JSON schema 对象", () => {
    const { ctx, defined } = makeFakeCtx();
    apply(ctx);
    const def = defined.get("fs_read");
    const schema = def?.input.schema as Record<string, unknown>;
    expect(schema["type"]).toBe("object");
    expect(schema["properties"]).toBeDefined();
  });

  it("output.schema 含 content/truncated/lines 属性", () => {
    const { ctx, defined } = makeFakeCtx();
    apply(ctx);
    const def = defined.get("fs_read");
    const schema = def?.output.schema as Record<string, unknown>;
    expect(schema["type"]).toBe("object");
    const props = schema["properties"] as Record<string, unknown>;
    expect(props["content"]).toBeDefined();
    expect(props["truncated"]).toBeDefined();
    expect(props["lines"]).toBeDefined();
  });

  it("isConcurrencySafe()===true（readOnlyHint 透传）", () => {
    const { ctx, defined } = makeFakeCtx();
    apply(ctx);
    const def = defined.get("fs_read");
    expect(def?.isConcurrencySafe).toBeDefined();
    expect(def?.isConcurrencySafe?.({})).toBe(true);
  });
});

describe("execute 解包适配器", () => {
  it("成功结果返回纯 data（剥离 ok 标志）", async () => {
    const { ctx, defined } = makeFakeCtx();
    apply(ctx);
    const def = defined.get("fs_read");
    // 准备一个真实文件供 fs_read 读取
    const file = join(root, "hello.txt");
    await writeFile(file, "hello world");
    const result = (await def?.execute({ path: file })) as Record<
      string,
      unknown
    >;
    expect(result["content"]).toBe("hello world");
    expect(result["truncated"]).toBe(false);
    expect(result["lines"]).toBe(1);
    // 不应含 ok 字段
    expect(result["ok"]).toBeUndefined();
  });

  it("失败结果抛 ToolCallError", async () => {
    const { ctx, defined } = makeFakeCtx();
    apply(ctx);
    const def = defined.get("fs_read");
    // 读取不存在的文件 → ENOENT
    await expect(
      def?.execute({ path: join(root, "nope.txt") }),
    ).rejects.toThrow(ToolCallError);
  });

  it("ToolCallError 携带 toolName 与 code", async () => {
    const { ctx, defined } = makeFakeCtx();
    apply(ctx);
    const def = defined.get("fs_read");
    try {
      await def?.execute({ path: join(root, "nope.txt") });
      expect.unreachable("应抛 ToolCallError");
    } catch (err) {
      expect(err).toBeInstanceOf(ToolCallError);
      const e = err as ToolCallError;
      expect(e.toolName).toBe("fs_read");
      expect(e.code).toBe("ENOENT");
      expect(e.message).toContain("fs_read");
    }
  });

  it("参数非法抛 ToolCallError（EINVAL）", async () => {
    const { ctx, defined } = makeFakeCtx();
    apply(ctx);
    const def = defined.get("fs_read");
    try {
      await def?.execute({ path: 123 as unknown as string });
      expect.unreachable("应抛 ToolCallError");
    } catch (err) {
      expect(err).toBeInstanceOf(ToolCallError);
      const e = err as ToolCallError;
      expect(e.code).toBe("EINVAL");
    }
  });
});

describe("ToolCallError", () => {
  it("是 Error 子类", () => {
    const err = new ToolCallError("fs_read", {
      code: "ENOENT",
      message: "not found",
    });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ToolCallError");
  });

  it("message 格式为 toolName: message", () => {
    const err = new ToolCallError("fs_read", {
      code: "ENOENT",
      message: "not found",
    });
    expect(err.message).toBe("fs_read: not found");
  });
});

describe("Config.cwd（相对路径基准注入）", () => {
  afterEach(() => {
    resetDefaultCwd();
  });

  const pwdHandler = () => {
    const tool = builtinTools.find((entry) => entry.name === "pwd");
    if (tool === undefined) throw new Error("pwd 工具缺失");
    return tool.handler;
  };

  it("不注入时基准沿用进程工作目录", async () => {
    const { ctx } = makeFakeCtx();
    apply(ctx, {});
    expect(getDefaultCwd()).toBe(process.cwd());
  });

  it("注入后 pwd 报出的就是该基准", async () => {
    const base = join(tmpdir(), "wsm-plugin-cwd-base");
    const { ctx } = makeFakeCtx();
    apply(ctx, { cwd: base });
    const result = await pwdHandler()({});
    expect((result as { cwd?: string }).cwd).toBe(base.replace(/\\/g, "/"));
  });

  it("两个 preset 注入不同基准时挂载失败（基准是进程级唯一值）", () => {
    const { ctx } = makeFakeCtx();
    apply(ctx, { cwd: "/session/a" });
    expect(() => apply(ctx, { cwd: "/session/b" })).toThrow(/进程级唯一值/);
    expect(getDefaultCwd()).toBe("/session/a");
  });
});
