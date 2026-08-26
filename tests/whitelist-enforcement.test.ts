import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { callTool, createServer, resolveDeployedTools } from "../src/server.js";
import { builtinTools, type Tool } from "../src/registry.js";
import { systemInfoTool } from "../src/tools/system.js";
import { fsListTool } from "../src/tools/fs_read.js";
import { pwdTool, echoTool } from "../src/tools/core.js";
import { batchRunTool } from "../src/tools/batch.js";
import { isFail } from "../src/contract/output.js";

/**
 * 工单 12-02：白名单生效 + 错误区分。
 *
 * 只测外部可观察面（listTools 结果集、callTool 错误文案、batch_run 返回），
 * 经 createServer(过滤表)/callTool(name, args, 过滤表) 参数注入断言，
 * 不测进程级启动路径。
 */

/** 部署子表：裁掉 git_status 与 fs_list（连带其别名 ls/list_directory）。 */
const subsetCore: readonly Tool[] = [
  systemInfoTool,
  pwdTool,
  echoTool,
  batchRunTool,
];

/** 含 fs_list 的子表：别名随正名保留（共进退的保留侧）。 */
const subsetWithFs: readonly Tool[] = [
  systemInfoTool,
  pwdTool,
  echoTool,
  fsListTool,
  batchRunTool,
];

/** 被裁工具的统一归因文案关键串。 */
const NOT_EXPOSED = "未在当前部署暴露（WIN_SHELL_TOOLS）";

/** MCP 客户端调用结果的最小断言面。 */
type CallResult = {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
};

/** 建立与注入工具表 server 相连的客户端，用毕自动关闭。 */
async function withClient<T>(
  tools: readonly Tool[],
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const server = createServer(tools);
  const client = new Client(
    { name: "test-client", version: "1.0.0" },
    { capabilities: {} },
  );
  await server.connect(serverT);
  await client.connect(clientT);
  try {
    return await fn(client);
  } finally {
    await client.close();
    await server.close();
  }
}

/** 解析统一输出契约的首个 text content 为 JSON 对象。 */
function parseFirstText(result: CallResult): Record<string, unknown> {
  const first = result.content[0];
  if (!first || first.type !== "text") {
    throw new Error("预期首个 content 为 text");
  }
  return JSON.parse(first.text ?? "") as Record<string, unknown>;
}

describe("listTools 列表裁剪（经 createServer 注入）", () => {
  it("子表注入后 listTools 只含子表内工具，被裁正名不在列", async () => {
    await withClient(subsetCore, async (client) => {
      const result = await client.listTools();
      const names = result.tools.map((t) => t.name);
      expect(names).toEqual(["system_info", "pwd", "echo", "batch_run"]);
      expect(names).not.toContain("git_status");
      expect(names).not.toContain("fs_list");
    });
  });

  it("被裁工具的别名同样不在列（别名本就不列出，行为不变）", async () => {
    await withClient(subsetCore, async (client) => {
      const result = await client.listTools();
      const names = result.tools.map((t) => t.name);
      expect(names).not.toContain("ls");
      expect(names).not.toContain("list_directory");
    });
  });

  it("全量注入时 listTools 数量与内置表一致（零破坏）", async () => {
    await withClient(builtinTools, async (client) => {
      const result = await client.listTools();
      expect(result.tools.length).toBe(builtinTools.length);
    });
  });

  it("batch_run 以受限副本参与列表：名称与描述不变", async () => {
    await withClient(subsetCore, async (client) => {
      const result = await client.listTools();
      const batch = result.tools.find((t) => t.name === "batch_run");
      expect(batch).toBeDefined();
      expect(batch?.description).toBe(batchRunTool.description);
      expect(batch?.inputSchema).toBeDefined();
    });
  });
});

describe("callTool 错误区分（参数注入子表）", () => {
  it("调用被裁正名：失败并归因未在当前部署暴露", async () => {
    const result = await callTool("git_status", {}, subsetCore);
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe("EINVAL");
      expect(result.error.message).toContain(NOT_EXPOSED);
    }
  });

  it("被裁工具的别名同归因（别名随正名共进退）", async () => {
    for (const alias of ["ls", "list_directory"]) {
      const result = await callTool(alias, {}, subsetCore);
      expect(isFail(result)).toBe(true);
      if (isFail(result)) {
        expect(result.error.message).toContain(NOT_EXPOSED);
      }
    }
  });

  it("调用内置表中不存在的工具：维持 Unknown tool 归因", async () => {
    const result = await callTool("no_such_tool_xyz", {}, subsetCore);
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.message).toContain(`Unknown tool: no_such_tool_xyz`);
      expect(result.error.message).not.toContain(NOT_EXPOSED);
    }
  });

  it("白名单内工具正常执行", async () => {
    const result = await callTool("pwd", {}, subsetCore);
    expect(result.ok).toBe(true);
  });

  it("全量注入零破坏：真实工具照常可用、缺失名仍 Unknown tool", async () => {
    const okResult = await callTool("git_status", { cwd: process.cwd() }, builtinTools);
    expect(okResult.ok).toBe(true);

    const unknownResult = await callTool("nonexistent", {}, builtinTools);
    expect(isFail(unknownResult)).toBe(true);
    if (isFail(unknownResult)) {
      expect(unknownResult.error.message).toContain("Unknown tool: nonexistent");
    }
  });

  it("现状钉住（14 号工单前）：全量表下别名不经 callTool 解析，报 Unknown tool 而非误报未暴露", async () => {
    const result = await callTool("ls", {}, builtinTools);
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.message).toContain("Unknown tool: ls");
      expect(result.error.message).not.toContain(NOT_EXPOSED);
    }
  });
});

describe("createServer 协议面错误区分（Client ↔ InMemoryTransport）", () => {
  it("协议层调用被裁工具返回 isError 且文案含未暴露归因", async () => {
    await withClient(subsetCore, async (client) => {
      const result = (await client.callTool({
        name: "git_status",
        arguments: {},
      })) as CallResult;
      expect(result.isError).toBe(true);
      const parsed = parseFirstText(result);
      expect(parsed.ok).toBe(false);
      const error = parsed.error as { message: string };
      expect(error.message).toContain(NOT_EXPOSED);
    });
  });

  it("协议层调用未知工具维持 Unknown tool 文案", async () => {
    await withClient(subsetCore, async (client) => {
      const result = (await client.callTool({
        name: "no_such_tool_xyz",
        arguments: {},
      })) as CallResult;
      expect(result.isError).toBe(true);
      const parsed = parseFirstText(result);
      const error = parsed.error as { message: string };
      expect(error.message).toContain("Unknown tool: no_such_tool_xyz");
    });
  });
});

describe("batch_run 受白名单约束（经 createServer 子表注入）", () => {
  interface StepFailure {
    tool: string;
    ok: boolean;
    error?: { code: string; message: string };
  }

  async function runBatch(
    tools: readonly Tool[],
    steps: Array<Record<string, unknown>>,
  ): Promise<Record<string, unknown>> {
    return withClient(tools, async (client) => {
      const result = (await client.callTool({
        name: "batch_run",
        arguments: { steps, verbose: true },
      })) as CallResult;
      const parsed = parseFirstText(result);
      expect(parsed.ok).toBe(true);
      return parsed;
    });
  }

  it("步骤引用被裁工具：该步失败并归因未暴露，短路后续步骤", async () => {
    const parsed = await runBatch(subsetCore, [
      { tool: "git_status" },
      { tool: "pwd" },
    ]);
    expect(parsed.allOk).toBe(false);
    const steps = parsed.steps as StepFailure[];
    expect(steps.length).toBe(1);
    expect(steps[0]?.error?.message).toContain(NOT_EXPOSED);
  });

  it("步骤引用被裁工具的别名同归因（共进退在 batch 内成立）", async () => {
    const parsed = await runBatch(subsetCore, [{ tool: "ls" }]);
    expect(parsed.allOk).toBe(false);
    const steps = parsed.steps as StepFailure[];
    expect(steps[0]?.error?.message).toContain(NOT_EXPOSED);
  });

  it("步骤引用不存在工具：维持未知工具归因", async () => {
    const parsed = await runBatch(subsetCore, [{ tool: "no_such_tool_xyz" }]);
    expect(parsed.allOk).toBe(false);
    const steps = parsed.steps as StepFailure[];
    expect(steps[0]?.error?.message).toContain("未知工具: no_such_tool_xyz");
    expect(steps[0]?.error?.message).not.toContain(NOT_EXPOSED);
  });

  it("步骤引用白名单内工具（含别名 ls）正常执行", async () => {
    const parsed = await runBatch(subsetWithFs, [
      { tool: "echo", args: { args: ["hello"] } },
      { tool: "ls", args: { path: process.cwd() } },
    ]);
    expect(parsed.allOk).toBe(true);
    const steps = parsed.steps as Array<{ ok: boolean }>;
    expect(steps.length).toBe(2);
    expect(steps.every((s) => s.ok)).toBe(true);
  });

  it("全量注入下 batch_run 不受约束逻辑影响", async () => {
    const parsed = await runBatch(builtinTools, [
      { tool: "echo", args: { args: ["x"] } },
      { tool: "pwd" },
    ]);
    expect(parsed.allOk).toBe(true);
  });
});

describe("resolveDeployedTools 启动校验（纯函数等价覆盖，不启动进程）", () => {
  it("含未知条目时抛错并列出全部非法条目原文（非仅第一个）", () => {
    expect(() => resolveDeployedTools("git_status,bogus_one,bogus_two")).toThrow(
      /WIN_SHELL_TOOLS 含未知工具条目.*bogus_one.*bogus_two/,
    );
  });

  it("误写别名视为未知条目并点名（别名不在白名单语法内）", () => {
    expect(() => resolveDeployedTools("ls")).toThrow(/ls/);
  });

  it("存在未知项即失败：不做忽略宽容、不降级为残缺白名单或全量", () => {
    expect(() => resolveDeployedTools("pwd,echo,no_such_tool")).toThrow();
  });

  it.each([
    ["undefined 等价全量注入", undefined],
    ["空串等价全量注入", ""],
    ["纯空白等价全量注入", "   "],
  ] as ReadonlyArray<[string, string | undefined]>)(
    "%s：返回内置表原引用（零破坏）",
    (_label, raw) => {
      expect(resolveDeployedTools(raw)).toBe(builtinTools);
    },
  );

  it("合法子集按正名过滤且保持注册顺序", () => {
    const deployed = resolveDeployedTools("system_info, batch_run ,system_info");
    expect(deployed.map((t) => t.name)).toEqual(["system_info", "batch_run"]);
  });

  it("第二参数可注入伪造工具表（不依赖真实注册表）", () => {
    const fake = [pwdTool, echoTool];
    expect(resolveDeployedTools("echo", fake)).toEqual([echoTool]);
    expect(() => resolveDeployedTools("not_in_fake", fake)).toThrow(
      /not_in_fake/,
    );
  });
});
