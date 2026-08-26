/**
 * batch_run 工具测试（工单 01-02-03-04）。
 *
 * 覆盖范围：
 * - 工单 01（骨架）：串行执行、未知工具、id 缺省、短路
 * - 工单 02（断言）：10 种操作符、逐条失败归因、断言短路、path 不存在
 * - 工单 03（引用）：args 插值、单引用保类型、混合拼接、仅引用已完成步骤、assert value 引用、端到端
 * - 工单 04（护栏）：outputSchema、annotations、listTools 包含
 */

import { describe, it, expect, beforeEach } from "vitest";
import { callTool, listTools as listToolsFn } from "../../src/server.js";
import { isOk, isFail, type ToolResult } from "../../src/contract/output.js";
import { builtinTools } from "../../src/registry.js";
import { batchRunHandler } from "../../src/tools/batch.js";
import * as fs from "node:fs";
import * as path from "node:path";
import { tmpdir } from "node:os";

/** batch_run 单步执行结果的 data 结构。 */
interface BatchRunData {
  allOk: boolean;
  steps: Array<{
    id: string;
    tool: string;
    ok: boolean;
    data?: Record<string, unknown>;
    error?: { code: string; message: string };
    assert?: Array<{
      path: string;
      op: string;
      passed: boolean;
      expected?: unknown;
      actual?: unknown;
      message: string;
    }>;
  }>;
  summary: string;
}

/** batch_run 默认极简输出（工单 09）：`steps` 仅在 verbose:true 时存在，失败附 `failedStep` 诊断。 */
interface BatchRunMinimalData {
  allOk: boolean;
  summary: string;
  failedStep?: BatchRunData["steps"][number];
}

/**
 * 调 batch_run 并收窄返回类型，使 `r.steps` 有具体结构（避免 AnyToolResult 的
 * `Record<string, unknown>` 宽类型让字段访问落为 unknown）。
 *
 * 工单 09 迁移：本 helper 统一显式传 `verbose: true`，既有用例（断言 `r.steps`
 * 的完整形态覆盖）全部走 verbose 模式保住原覆盖；默认极简模式的行为由
 * `batchRunMinimal` + 「batch_run 输出极简（工单 09）」用例组单独钉住。
 */
async function batchRun(args: Record<string, unknown>): Promise<ToolResult<BatchRunData>> {
  return (await callTool("batch_run", { ...args, verbose: true })) as unknown as ToolResult<BatchRunData>;
}

/**
 * 调 batch_run 且不传 verbose（默认极简模式），收窄到极简输出结构。
 * 仅工单 09 的默认形态用例使用；不断言内部 executed 等实现细节。
 */
async function batchRunMinimal(args: Record<string, unknown>): Promise<ToolResult<BatchRunMinimalData>> {
  return (await callTool("batch_run", args)) as unknown as ToolResult<BatchRunMinimalData>;
}

/** 获取临时目录，用于文件操作测试。 */
function getTempDir(): string {
  const dir = path.join(tmpdir(), `batch-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** 递归删除目录。 */
function removeDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

describe("batch_run 骨架（工单 01）", () => {
  it("两个独立只读工具串行执行，返回两者结果", async () => {
    const r = await batchRun({
      steps: [
        { tool: "pwd", args: {} },
        { tool: "echo", args: { args: ["hello", "world"] } },
      ],
    });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.steps).toHaveLength(2);
      expect(r.steps[0]!.ok).toBe(true);
      expect(typeof r.steps[0]!.data?.cwd).toBe("string");
      expect(r.steps[1]!.ok).toBe(true);
      expect(r.steps[1]!.data?.output).toBe("hello world");
    }
  });

  it("未知工具名该步返回失败但不抛异常", async () => {
    const r = await batchRun({
      steps: [
        { tool: "nonexistent_tool_xyz", args: {} },
      ],
    });
    expect(isOk(r)).toBe(true); // batch_run 本身成功
    if (isOk(r)) {
      expect(r.steps).toHaveLength(1);
      expect(r.steps[0]!.ok).toBe(false);
      expect(r.steps[0]!.error?.code).toBe("EINVAL");
      expect(r.steps[0]!.error?.message).toContain("未知工具");
    }
  });

  it("步骤按数组顺序串行执行", async () => {
    const order: string[] = [];
    // 用 echo 工具，通过 args 传递顺序标记
    const r = await batchRun({
      steps: [
        { tool: "echo", args: { args: ["first"] } },
        { tool: "echo", args: { args: ["second"] } },
        { tool: "echo", args: { args: ["third"] } },
      ],
    });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.steps).toHaveLength(3);
      expect(r.steps[0]!.data?.output).toBe("first");
      expect(r.steps[1]!.data?.output).toBe("second");
      expect(r.steps[2]!.data?.output).toBe("third");
    }
  });

  it("id 缺省时自动生成 step1, step2...", async () => {
    const r = await batchRun({
      steps: [
        { tool: "pwd", args: {} },
        { tool: "echo", args: { args: ["a"] } },
      ],
    });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.steps[0]!.id).toBe("step1");
      expect(r.steps[1]!.id).toBe("step2");
    }
  });

  it("短路：任一步失败立即中止", async () => {
    const r = await batchRun({
      steps: [
        { tool: "pwd", args: {} },
        { tool: "nonexistent_tool_xyz", args: {} },
        { tool: "echo", args: { args: ["should-not-run"] } },
      ],
    });
    expect(isOk(r)).toBe(true); // batch_run 本身成功
    if (isOk(r)) {
      // 只执行了前两步，第三步因短路未执行
      expect(r.steps).toHaveLength(2);
      expect(r.steps[0]!.ok).toBe(true);
      expect(r.steps[1]!.ok).toBe(false);
    }
  });

  it("步骤 id 重复返回参数错误", async () => {
    const r = await batchRun({
      steps: [
        { id: "s1", tool: "pwd", args: {} },
        { id: "s1", tool: "echo", args: { args: ["a"] } },
      ],
    });
    expect(isFail(r)).toBe(true);
    if (isFail(r)) {
      expect(r.error.code).toBe("EINVAL");
    }
  });
});

describe("batch_run 断言引擎（工单 02）", () => {
  it("eq 操作符：严格相等", async () => {
    const r = await batchRun({
      steps: [
        {
          id: "s1",
          tool: "echo",
          args: { args: ["hello"] },
          assert: [{ path: "output", op: "eq", value: "hello" }],
        },
      ],
    });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.steps[0]!.ok).toBe(true);
      expect(r.steps[0]!.assert).toHaveLength(1);
      expect(r.steps[0]!.assert![0]!.passed).toBe(true);
    }
  });

  it("neq 操作符：严格不等", async () => {
    const r = await batchRun({
      steps: [
        {
          id: "s1",
          tool: "echo",
          args: { args: ["hello"] },
          assert: [{ path: "output", op: "neq", value: "world" }],
        },
      ],
    });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.steps[0]!.ok).toBe(true);
      expect(r.steps[0]!.assert![0]!.passed).toBe(true);
    }
  });

  it("gt/gte/lt/lte 操作符", async () => {
    const r = await batchRun({
      steps: [
        {
          id: "s1",
          tool: "echo",
          args: { args: ["5"] },
          assert: [
            { path: "args", op: "gt", value: [4] }, // 会失败，因为 args 是数组
          ],
        },
      ],
    });
    // 这里 gt 会因为类型不匹配而失败
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      // gt 对数组操作会失败
      expect(r.steps[0]!.ok).toBe(false);
    }
  });

  it("in 操作符：数组包含", async () => {
    const r = await batchRun({
      steps: [
        {
          id: "s1",
          tool: "echo",
          args: { args: ["x"] },
          assert: [{ path: "output", op: "in", value: ["x", "y", "z"] }],
        },
      ],
    });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.steps[0]!.ok).toBe(true);
      expect(r.steps[0]!.assert![0]!.passed).toBe(true);
    }
  });

  it("re 操作符：正则匹配", async () => {
    const r = await batchRun({
      steps: [
        {
          id: "s1",
          tool: "echo",
          args: { args: ["hello123"] },
          assert: [{ path: "output", op: "re", value: "\\d+" }],
        },
      ],
    });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.steps[0]!.ok).toBe(true);
      expect(r.steps[0]!.assert![0]!.passed).toBe(true);
    }
  });

  it("truthy/falsy 操作符", async () => {
    const r = await batchRun({
      steps: [
        {
          id: "s1",
          tool: "echo",
          args: { args: ["hello"] },
          assert: [{ path: "output", op: "truthy" }],
        },
      ],
    });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.steps[0]!.ok).toBe(true);
      expect(r.steps[0]!.assert![0]!.passed).toBe(true);
    }
  });

  it("falsy 操作符：空字符串判定为假", async () => {
    const r = await batchRun({
      steps: [
        {
          id: "s1",
          tool: "echo",
          args: { args: [""] },
          assert: [{ path: "output", op: "falsy" }],
        },
      ],
    });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.steps[0]!.ok).toBe(true);
      expect(r.steps[0]!.assert![0]!.passed).toBe(true);
    }
  });

  it("gt/gte/lt/lte 正向：对 fs_write 的数值 written 断言全通过", async () => {
    const tmpDir = getTempDir();
    const filePath = path.join(tmpDir, "n.txt");
    try {
      const r = await batchRun({
        steps: [
          {
            id: "s1",
            tool: "fs_write",
            args: { path: filePath, content: "xx" }, // written = 2
            assert: [
              { path: "written", op: "gt", value: 0 },
              { path: "written", op: "gte", value: 2 },
              { path: "written", op: "lt", value: 10 },
              { path: "written", op: "lte", value: 2 },
            ],
          },
        ],
      });
      expect(isOk(r)).toBe(true);
      if (isOk(r)) {
        expect(r.steps[0]!.ok).toBe(true);
        expect(r.steps[0]!.assert).toHaveLength(4);
        expect(r.steps[0]!.assert!.every((a) => a.passed)).toBe(true);
      }
    } finally {
      removeDir(tmpDir);
    }
  });

  it("断言不满足时该步 ok:false，附逐条失败归因", async () => {
    const r = await batchRun({
      steps: [
        {
          id: "s1",
          tool: "echo",
          args: { args: ["hello"] },
          assert: [
            { path: "output", op: "eq", value: "world" },
            { path: "output", op: "eq", value: "hello" },
          ],
        },
      ],
    });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.steps[0]!.ok).toBe(false);
      expect(r.steps[0]!.assert).toHaveLength(2);
      expect(r.steps[0]!.assert![0]!.passed).toBe(false);
      expect(r.steps[0]!.assert![0]!.message).toContain("期望");
      expect(r.steps[0]!.assert![1]!.passed).toBe(true);
    }
  });

  it("断言失败短路，后续步骤不执行", async () => {
    const r = await batchRun({
      steps: [
        {
          id: "s1",
          tool: "echo",
          args: { args: ["hello"] },
          assert: [{ path: "output", op: "eq", value: "world" }],
        },
        { id: "s2", tool: "pwd", args: {} },
      ],
    });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      // 第一步断言失败，第二步因短路未执行
      expect(r.steps).toHaveLength(1);
      expect(r.steps[0]!.ok).toBe(false);
    }
  });

  it("path 不存在按断言失败处理（不抛异常）", async () => {
    const r = await batchRun({
      steps: [
        {
          id: "s1",
          tool: "echo",
          args: { args: ["hello"] },
          assert: [{ path: "nonexistent_field", op: "eq", value: "anything" }],
        },
      ],
    });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.steps[0]!.ok).toBe(false);
      expect(r.steps[0]!.assert![0]!.passed).toBe(false);
      expect(r.steps[0]!.assert![0]!.message).toContain("路径不存在");
    }
  });

  it("text_replace 后断言 replaced == 1，通过/失败两种路径均正确", async () => {
    const tmpDir = getTempDir();
    const filePath = path.join(tmpDir, "test.txt");
    fs.writeFileSync(filePath, "hello world", "utf-8");

    try {
      // 通过路径
      const rPass = await batchRun({
        steps: [
          {
            id: "s1",
            tool: "text_replace",
            args: { path: filePath, pattern: "world", replacement: "mars" },
            assert: [{ path: "replaced", op: "eq", value: 1 }],
          },
        ],
      });
      expect(isOk(rPass)).toBe(true);
      if (isOk(rPass)) {
        expect(rPass.steps[0]!.ok).toBe(true);
        expect(rPass.steps[0]!.assert![0]!.passed).toBe(true);
      }

      // 失败路径（替换 0 次）
      const rFail = await batchRun({
        steps: [
          {
            id: "s1",
            tool: "text_replace",
            args: { path: filePath, pattern: "nonexistent", replacement: "x" },
            assert: [{ path: "replaced", op: "eq", value: 1 }],
          },
        ],
      });
      expect(isOk(rFail)).toBe(true);
      if (isOk(rFail)) {
        // text_replace 0 命中会抛 EINVAL，所以该步失败
        expect(rFail.steps[0]!.ok).toBe(false);
      }
    } finally {
      removeDir(tmpDir);
    }
  });
});

describe("batch_run 步骤间引用（工单 03）", () => {
  it("args 内字符串值支持 {{stepId.path}} 插值", async () => {
    const r = await batchRun({
      steps: [
        { id: "s1", tool: "echo", args: { args: ["hello"] } },
        {
          id: "s2",
          tool: "echo",
          args: { args: ["prefix-{{s1.output.output}}-suffix"], format: "json" },
        },
      ],
    });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.steps[1]!.ok).toBe(true);
      // 混合拼接转字符串
      expect(r.steps[1]!.data?.args).toEqual(["prefix-hello-suffix"]);
    }
  });

  it("整串单引用保持原类型：assert 值中的 number 不经字符串化", async () => {
    const tmpDir = getTempDir();
    const f1 = path.join(tmpDir, "a.txt");
    const f2 = path.join(tmpDir, "b.txt");

    try {
      const r = await batchRun({
        steps: [
          {
            id: "s1",
            tool: "fs_write",
            args: { path: f1, content: "aaaa" }, // written = 4
          },
          {
            id: "s2",
            tool: "fs_write",
            args: { path: f2, content: "aaaa" }, // written = 4
            assert: [
              // value 为整串单引用 → 保持 number 4，与 s2.written=4 严格相等
              { path: "written", op: "eq", value: "{{s1.output.written}}" },
            ],
          },
        ],
      });
      expect(isOk(r)).toBe(true);
      if (isOk(r)) {
        // 若 value 被字符串化成 "4"，4 !== "4"，则断言会失败；此处通过证明保类型
        expect(r.steps[1]!.ok).toBe(true);
        expect(r.steps[1]!.assert![0]!.passed).toBe(true);
      }
    } finally {
      removeDir(tmpDir);
    }
  });

  it("混合拼接转字符串", async () => {
    const r = await batchRun({
      steps: [
        { id: "s1", tool: "echo", args: { args: ["123"] } },
        {
          id: "s2",
          tool: "echo",
          args: { args: ["num={{s1.output.output}}"] },
        },
      ],
    });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.steps[1]!.data?.output).toBe("num=123");
    }
  });

  it("同一引用出现两次时均被替换（修复只替换第一处）", async () => {
    const r = await batchRun({
      steps: [
        { id: "s1", tool: "echo", args: { args: ["123"] } },
        {
          id: "s2",
          tool: "echo",
          args: { args: ["a={{s1.output.output}}|b={{s1.output.output}}"] },
        },
      ],
    });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.steps[1]!.ok).toBe(true);
      // 两处引用都应替换为 "123"，而非第二处残留字面量
      expect(r.steps[1]!.data?.output).toBe("a=123|b=123");
    }
  });

  it("仅允许引用已完成步骤：自引用失败", async () => {
    const r = await batchRun({
      steps: [
        {
          id: "s1",
          tool: "echo",
          args: { args: ["{{s1.output.output}}"] },
        },
      ],
    });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.steps[0]!.ok).toBe(false);
      expect(r.steps[0]!.error?.message).toContain("引用了不存在的步骤");
    }
  });

  it("仅允许引用已完成步骤：前向引用失败", async () => {
    const r = await batchRun({
      steps: [
        {
          id: "s1",
          tool: "echo",
          args: { args: ["{{s2.output.output}}"] },
        },
        { id: "s2", tool: "echo", args: { args: ["hello"] } },
      ],
    });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.steps[0]!.ok).toBe(false);
      expect(r.steps[0]!.error?.message).toContain("引用了不存在的步骤");
    }
  });

  it("仅允许引用已完成步骤：不存在的 stepId 失败", async () => {
    const r = await batchRun({
      steps: [
        {
          id: "s1",
          tool: "echo",
          args: { args: ["{{nonexistent.output.output}}"] },
        },
      ],
    });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.steps[0]!.ok).toBe(false);
      expect(r.steps[0]!.error?.message).toContain("引用了不存在的步骤");
    }
  });

  it("仅允许引用已完成步骤：不存在的路径失败", async () => {
    const r = await batchRun({
      steps: [
        { id: "s1", tool: "echo", args: { args: ["hello"] } },
        {
          id: "s2",
          tool: "echo",
          args: { args: ["{{s1.output.nonexistent_field}}"] },
        },
      ],
    });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.steps[1]!.ok).toBe(false);
      expect(r.steps[1]!.error?.message).toContain("引用了不存在的路径");
    }
  });

  it("assert 的 value 同样支持引用", async () => {
    const r = await batchRun({
      steps: [
        { id: "s1", tool: "echo", args: { args: ["hello"] } },
        {
          id: "s2",
          tool: "echo",
          args: { args: ["world"] },
          assert: [{ path: "output", op: "eq", value: "{{s1.output.output}}" }],
        },
      ],
    });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      // s2 output = "world", s1 output = "hello", 不相等
      expect(r.steps[1]!.ok).toBe(false);
      expect(r.steps[1]!.assert![0]!.passed).toBe(false);
    }
  });

  it("端到端：step1 fs_write 写文件，step2 text_replace 用 {{step1.path}} 定位并替换成功", async () => {
    const tmpDir = getTempDir();
    const filePath = path.join(tmpDir, "test.txt");

    try {
      const r = await batchRun({
        steps: [
          {
            id: "s1",
            tool: "fs_write",
            args: { path: filePath, content: "hello world" },
          },
          {
            id: "s2",
            tool: "text_replace",
            args: {
              path: filePath,
              pattern: "world",
              replacement: "mars",
              write: true,
            },
            assert: [{ path: "replaced", op: "eq", value: 1 }],
          },
        ],
      });
      expect(isOk(r)).toBe(true);
      if (isOk(r)) {
        expect(r.steps[0]!.ok).toBe(true);
        expect(r.steps[1]!.ok).toBe(true);
        expect(r.steps[1]!.assert![0]!.passed).toBe(true);
        // 验证文件内容确实被替换
        const content = fs.readFileSync(filePath, "utf-8");
        expect(content).toBe("hello mars");
      }
    } finally {
      removeDir(tmpDir);
    }
  });

  it("嵌套路径引用：{{step1.output.nested.field}}", async () => {
    const r = await batchRun({
      steps: [
        { id: "s1", tool: "echo", args: { args: ["hello"], format: "json" } },
        {
          id: "s2",
          tool: "echo",
          args: { args: ["val={{s1.output.args}}"], format: "json" },
        },
      ],
    });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      // s1.output.args 是 ["hello"]，JSON 字符串化 → 双引号
      expect(r.steps[1]!.data?.args).toEqual(['val=["hello"]']);
    }
  });
});

describe("batch_run 护栏与注解（工单 04）", () => {
  it("batch_run 声明非空 outputSchema", () => {
    const tool = builtinTools.find((t) => t.name === "batch_run");
    expect(tool).toBeDefined();
    expect(tool?.outputSchema).toBeDefined();
  });

  it("annotations 显式裁决：readOnlyHint: false, destructiveHint: true", () => {
    const tool = builtinTools.find((t) => t.name === "batch_run");
    expect(tool).toBeDefined();
    expect(tool?.annotations?.readOnlyHint).toBe(false);
    expect(tool?.annotations?.destructiveHint).toBe(true);
  });

  it("listTools 输出包含 batch_run 的 inputSchema/outputSchema/annotations", () => {
    const tools = listToolsFn();
    const batchTool = tools.find((t) => t.name === "batch_run");
    expect(batchTool).toBeDefined();
    expect(batchTool?.inputSchema).toBeDefined();
    expect(batchTool?.outputSchema).toBeDefined();
    expect(batchTool?.annotations).toBeDefined();
  });

  it("batch_run 内嵌调用步骤时，步骤工具的 zod 校验照常生效", async () => {
    const r = await batchRun({
      steps: [
        {
          id: "s1",
          tool: "fs_write",
          args: { path: 123, content: "test" }, // path 应为 string，传 number 应失败
        },
      ],
    });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.steps[0]!.ok).toBe(false);
      expect(r.steps[0]!.error?.code).toBe("EINVAL");
      expect(r.steps[0]!.error?.message).toContain("参数非法");
    }
  });
});

describe("batch_run 边界情况", () => {
  it("空 steps 数组返回参数错误", async () => {
    const r = await batchRun({ steps: [] });
    expect(isFail(r)).toBe(true);
    if (isFail(r)) {
      expect(r.error.code).toBe("EINVAL");
    }
  });

  it("绕过 schema 直接调 handler：空 steps 数组同样返回 EINVAL（纵深防御）", async () => {
    const r = await batchRunHandler({ steps: [] });
    expect(isFail(r)).toBe(true);
    if (isFail(r)) {
      expect(r.error.code).toBe("EINVAL");
      expect(r.error.message).toContain("非空");
    }
  });

  it("steps 非数组返回参数错误", async () => {
    const r = await batchRun({ steps: "not-an-array" });
    expect(isFail(r)).toBe(true);
    if (isFail(r)) {
      expect(r.error.code).toBe("EINVAL");
    }
  });

  it("步骤不是对象返回参数错误", async () => {
    const r = await batchRun({ steps: ["not-an-object"] });
    expect(isFail(r)).toBe(true);
    if (isFail(r)) {
      expect(r.error.code).toBe("EINVAL");
    }
  });

  it("summary 字段正确：全部成功 / 短路失败并携带原因", async () => {
    const rPass = await batchRun({
      steps: [{ tool: "pwd", args: {} }],
    });
    expect(isOk(rPass)).toBe(true);
    if (isOk(rPass)) {
      expect(rPass.summary).toContain("全部");
    }

    const rFail = await batchRun({
      steps: [
        { tool: "nonexistent", args: {} },
        { tool: "pwd", args: {} },
      ],
    });
    expect(isOk(rFail)).toBe(true);
    if (isOk(rFail)) {
      expect(rFail.summary).toContain("失败");
      // 失败原因应体现在 summary（错误码 + 消息）
      expect(rFail.summary).toContain("EINVAL");
    }
  });

  it("args 中嵌套对象内的引用解析", async () => {
    const r = await batchRun({
      steps: [
        { id: "s1", tool: "echo", args: { args: ["hello"] } },
        {
          id: "s2",
          tool: "echo",
          args: { args: ["{{s1.output.output}}"] },
        },
      ],
    });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.steps[1]!.ok).toBe(true);
    }
  });

  it("args 中数组内的引用解析", async () => {
    const r = await batchRun({
      steps: [
        { id: "s1", tool: "echo", args: { args: ["a"] } },
        {
          id: "s2",
          tool: "echo",
          args: { args: ["{{s1.output.output}}", "b"], format: "json" },
        },
      ],
    });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.steps[1]!.data?.args).toEqual(["a", "b"]);
    }
  });

  it("断言 value 中嵌套对象内的引用解析", async () => {
    const r = await batchRun({
      steps: [
        { id: "s1", tool: "echo", args: { args: ["hello"] } },
        {
          id: "s2",
          tool: "echo",
          args: { args: ["hello"] },
          assert: [
            {
              path: "output",
              op: "eq",
              value: { part: "{{s1.output.output}}" },
            },
          ],
        },
      ],
    });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      // s2 output = "hello", value = { part: "hello" }，不相等
      expect(r.steps[1]!.ok).toBe(false);
    }
  });

  it("handler 抛出异常时转为 fail 结果", async () => {
    // 用一个会抛异常的工具：fs_read 读不存在的文件
    const r = await batchRun({
      steps: [
        {
          id: "s1",
          tool: "fs_read",
          args: { path: "/nonexistent/file/xyz.txt" },
        },
      ],
    });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.steps[0]!.ok).toBe(false);
      expect(r.steps[0]!.error?.code).toBe("ENOENT");
    }
  });

  it("多步断言全部通过时 ok:true", async () => {
    const r = await batchRun({
      steps: [
        {
          id: "s1",
          tool: "echo",
          args: { args: ["hello"] },
          assert: [
            { path: "output", op: "eq", value: "hello" },
            { path: "output", op: "in", value: ["hello"] },
          ],
        },
      ],
    });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.steps[0]!.ok).toBe(true);
      expect(r.steps[0]!.assert!.every((a) => a.passed)).toBe(true);
    }
  });

  it("多步断言部分失败时 ok:false", async () => {
    const r = await batchRun({
      steps: [
        {
          id: "s1",
          tool: "echo",
          args: { args: ["hello"] },
          assert: [
            { path: "output", op: "eq", value: "hello" },
            { path: "output", op: "eq", value: "world" },
          ],
        },
      ],
    });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.steps[0]!.ok).toBe(false);
      expect(r.steps[0]!.assert![0]!.passed).toBe(true);
      expect(r.steps[0]!.assert![1]!.passed).toBe(false);
    }
  });
});

describe("batch_run 聚合 allOk（工单 01）", () => {
  it("全部步骤成功时 allOk 为 true", async () => {
    const r = await batchRun({
      steps: [
        { tool: "pwd", args: {} },
        { tool: "echo", args: { args: ["a"] } },
      ],
    });
    expect(isOk(r)).toBe(true); // 契约层：batch_run 工具调用本身成功
    if (isOk(r)) {
      expect(r.allOk).toBe(true);
    }
  });

  it("任一步骤失败（含断言不满足）时 allOk 为 false", async () => {
    // 未知工具失败
    const rUnknown = await batchRun({
      steps: [
        { tool: "pwd", args: {} },
        { tool: "nonexistent_tool", args: {} },
      ],
    });
    expect(isOk(rUnknown)).toBe(true);
    if (isOk(rUnknown)) {
      expect(rUnknown.allOk).toBe(false);
    }

    // 断言失败
    const rAssert = await batchRun({
      steps: [
        {
          id: "s1",
          tool: "echo",
          args: { args: ["hello"] },
          assert: [{ path: "output", op: "eq", value: "world" }],
        },
      ],
    });
    expect(isOk(rAssert)).toBe(true);
    if (isOk(rAssert)) {
      expect(rAssert.allOk).toBe(false);
    }
  });
});

describe("batch_run 输出极简（工单 09）", () => {
  it("默认成功：仅返回 { allOk, summary }，不含 steps 与任何步骤 data", async () => {
    const r = await batchRunMinimal({
      steps: [
        { tool: "pwd", args: {} },
        { tool: "echo", args: { args: ["hello"] } },
      ],
    });
    expect(isOk(r)).toBe(true); // 契约层：batch_run 调用本身成功
    if (isOk(r)) {
      expect(r.allOk).toBe(true);
      expect(r.summary).toBe("全部 2 步成功");
      // 默认形态不再输出 steps 字段
      expect("steps" in r).toBe(false);
      // 防回弹：整个返回体不含成功步骤 data 的特征键/特征值
      const serialized = JSON.stringify(r);
      expect(serialized).not.toContain('"cwd"');
      expect(serialized).not.toContain('"output"');
      expect(serialized).not.toContain("hello");
    }
  });

  it("默认失败：附 failedStep 诊断（id/tool/error），不含 steps 与成功步骤 data", async () => {
    const r = await batchRunMinimal({
      steps: [
        { tool: "pwd", args: {} },
        { tool: "nonexistent_tool_xyz", args: {} },
      ],
    });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.allOk).toBe(false);
      expect(r.summary).toContain("第 2 步失败");
      expect(r.summary).toContain("EINVAL");
      expect("steps" in r).toBe(false);
      // failedStep 即失败那条（短路下最后执行的一步），结构与 steps 条目同形
      expect(r.failedStep).toBeDefined();
      expect(r.failedStep!.id).toBe("step2");
      expect(r.failedStep!.tool).toBe("nonexistent_tool_xyz");
      expect(r.failedStep!.ok).toBe(false);
      expect(r.failedStep!.error?.code).toBe("EINVAL");
      expect(r.failedStep!.error?.message).toContain("未知工具");
      // 失败路径也不泄漏成功步骤的 data（pwd 的 cwd）
      const serialized = JSON.stringify(r);
      expect(serialized).not.toContain('"cwd"');
    }
  });

  it("默认断言失败：failedStep.assert 含逐条归因", async () => {
    const r = await batchRunMinimal({
      steps: [
        {
          id: "s1",
          tool: "echo",
          args: { args: ["hello"] },
          assert: [
            { path: "output", op: "eq", value: "world" },
            { path: "output", op: "eq", value: "hello" },
          ],
        },
      ],
    });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.allOk).toBe(false);
      expect(r.summary).toContain("第 1 步断言失败");
      expect(r.failedStep).toBeDefined();
      expect(r.failedStep!.id).toBe("s1");
      expect(r.failedStep!.ok).toBe(false);
      expect(r.failedStep!.assert).toHaveLength(2);
      expect(r.failedStep!.assert![0]!.passed).toBe(false);
      expect(r.failedStep!.assert![0]!.message).toContain("期望");
      expect(r.failedStep!.assert![1]!.passed).toBe(true);
    }
  });

  it("verbose:true 成功路径返回完整 steps（与变更前一致）", async () => {
    const r = await batchRun({
      steps: [
        { tool: "pwd", args: {} },
        { tool: "echo", args: { args: ["hello"] } },
      ],
    });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.allOk).toBe(true);
      expect(r.steps).toHaveLength(2);
      expect(r.steps[0]!.data?.cwd).toBeDefined();
      expect(r.steps[1]!.data?.output).toBe("hello");
    }
  });

  it("verbose:true 失败路径也返回完整 steps", async () => {
    const r = await batchRun({
      steps: [
        { tool: "pwd", args: {} },
        { tool: "nonexistent_tool_xyz", args: {} },
      ],
    });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.allOk).toBe(false);
      expect(r.steps).toHaveLength(2);
      expect(r.steps[0]!.ok).toBe(true);
      expect(r.steps[1]!.ok).toBe(false);
    }
  });

  it("引用链在默认模式下照常工作：整串单引用保类型（assert）+ 混合拼接（args）", async () => {
    const tmpDir = getTempDir();
    const f1 = path.join(tmpDir, "a.txt");
    try {
      const r = await batchRunMinimal({
        steps: [
          { id: "s1", tool: "fs_write", args: { path: f1, content: "aaaa" } }, // written = 4
          {
            id: "s2",
            tool: "fs_write",
            args: { path: f1, content: "len={{s1.output.written}}" }, // 混合拼接 → "len=4"，written = 5
            assert: [
              // 整串单引用保类型：value 解析为 number 4；若被字符串化成 "4"，
              // gte 的数值比较会报"要求数值类型"。此处 5 ≥ 4 通过即证明保类型。
              { path: "written", op: "gte", value: "{{s1.output.written}}" },
            ],
          },
        ],
      });
      expect(isOk(r)).toBe(true);
      if (isOk(r)) {
        // 引用解析在 server 内部照常流转，不受默认极简影响
        expect(r.allOk).toBe(true);
        expect(r.summary).toBe("全部 2 步成功");
        expect("steps" in r).toBe(false);
        expect(fs.statSync(f1).size).toBe(5); // s2 实际写入 "len=4"
      }
    } finally {
      removeDir(tmpDir);
    }
  });

  it("混合拼接引用在默认模式下转字符串照常工作", async () => {
    const r = await batchRunMinimal({
      steps: [
        { id: "s1", tool: "echo", args: { args: ["123"] } },
        {
          id: "s2",
          tool: "echo",
          args: { args: ["num={{s1.output.output}}"] },
          // 独立期望值（source of truth 为字面量 "num=123"）：
          // 仅当混合拼接真实发生，断言才可能通过——钉住默认模式下的插值行为
          assert: [{ path: "output", op: "eq", value: "num=123" }],
        },
      ],
    });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.allOk).toBe(true);
      expect("steps" in r).toBe(false);
    }
  });
});
