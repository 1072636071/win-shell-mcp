import { describe, it, expect } from "vitest";
import { z } from "zod";
import { Server } from "@modelcontextprotocol/sdk/server";
import { Client } from "@modelcontextprotocol/sdk/client";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { listTools, callTool, createServer } from "../src/server.js";
import { builtinTools, type Tool } from "../src/registry.js";
import { systemInfoTool } from "../src/tools/system.js";
import { fsReadTool } from "../src/tools/fs_read.js";

import { isOk, isFail } from "../src/contract/output.js";

// 测试直接传入工具列表子集——无全局注册状态，无需 beforeEach 重置

/** 仅含 system_info 的基线工具列表。 */
const baseline = [systemInfoTool];

describe("listTools", () => {
  it("返回 system_info 工具", () => {
    const tools = listTools(baseline);
    const names = tools.map((t) => t.name);
    expect(names).toContain("system_info");
  });

  it("工具项含 name、description、inputSchema", () => {
    const tools = listTools(baseline);
    const sys = tools.find((t) => t.name === "system_info");
    expect(sys).toBeDefined();
    expect(sys?.description.length).toBeGreaterThan(0);
    expect(sys?.inputSchema).toBeDefined();
  });

  it("inputSchema 是 JSON schema 对象（type=object）", () => {
    const tools = listTools(baseline);
    const sys = tools.find((t) => t.name === "system_info");
    expect(sys?.inputSchema["type"]).toBe("object");
    expect(sys?.inputSchema["properties"]).toBeDefined();
  });

  it("inputSchema 含 verbose 属性", () => {
    const tools = listTools(baseline);
    const sys = tools.find((t) => t.name === "system_info");
    const props = sys?.inputSchema["properties"] as Record<string, unknown>;
    expect(props["verbose"]).toBeDefined();
  });

  it("默认参数列出全部内置工具", () => {
    const tools = listTools();
    expect(tools.length).toBe(builtinTools.length);
  });
});

describe("callTool 正常路径", () => {
  it("调用 system_info 返回 ok", async () => {
    const result = await callTool("system_info", {}, baseline);
    expect(isOk(result)).toBe(true);
  });

  it("system_info verbose=true 返回完整字段", async () => {
    const result = await callTool("system_info", { verbose: true }, baseline);
    if (isOk(result)) {
      expect(result["uptime"]).toBeDefined();
      expect(result["os"]).toBeDefined();
    }
  });

  it("system_info verbose=false 返回极简", async () => {
    const result = await callTool("system_info", { verbose: false }, baseline);
    if (isOk(result)) {
      expect(result["uptime"]).toBeUndefined();
    }
  });
});

describe("callTool 错误路径", () => {
  it("未知工具返回 fail EINVAL", async () => {
    const result = await callTool("nonexistent", {}, baseline);
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe("EINVAL");
      expect(result.error.message).toContain("Unknown tool");
    }
  });

  it("参数类型非法返回 fail EINVAL", async () => {
    const result = await callTool(
      "system_info",
      { verbose: "not-a-boolean" },
      baseline,
    );
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe("EINVAL");
      expect(result.error.message).toContain("Invalid arguments");
    }
  });

  it("handler 抛普通错误返回 EUNKNOWN", async () => {
    const throwingTool: Tool = {
      name: "throwing",
      description: "test throwing",
      inputSchema: z.object({}),
      handler: () => {
        throw new Error("boom");
      },
    };
    const result = await callTool("throwing", {}, [throwingTool]);
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe("EUNKNOWN");
      expect(result.error.message).toBe("boom");
    }
  });

  it("handler 抛带 code 的错误返回对应码", async () => {
    const err = new Error("not found") as NodeJS.ErrnoException;
    err.code = "ENOENT";
    const codedTool: Tool = {
      name: "coded",
      description: "test coded error",
      inputSchema: z.object({}),
      handler: () => {
        throw err;
      },
    };
    const result = await callTool("coded", {}, [codedTool]);
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe("ENOENT");
    }
  });

  it("handler 抛非 Error 值返回 EUNKNOWN", async () => {
    const stringThrowTool: Tool = {
      name: "string_throw",
      description: "throws string",
      inputSchema: z.object({}),
      handler: () => {
        // eslint-disable-next-line no-throw-literal
        throw "string error";
      },
    };
    const result = await callTool("string_throw", {}, [stringThrowTool]);
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe("EUNKNOWN");
      expect(result.error.message).toBe("string error");
    }
  });
});

describe("createServer", () => {
  it("返回 Server 实例", () => {
    const server = createServer(baseline);
    expect(server).toBeInstanceOf(Server);
  });

  it("多次调用返回不同实例", () => {
    const a = createServer(baseline);
    const b = createServer(baseline);
    expect(a).not.toBe(b);
  });
});

describe("builtinTools", () => {
  it("是包含全部内置工具的常量列表", () => {
    expect(builtinTools.length).toBeGreaterThan(0);
    expect(builtinTools.some((t) => t.name === "system_info")).toBe(true);
  });

  it("工具名唯一", () => {
    const names = builtinTools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

/** 端到端测试：用 Client + InMemoryTransport 连接 createServer()，覆盖 ListTools/CallTool handler。 */
describe("createServer 端到端", () => {
  // callTool 返回类型含索引签名导致 content 退化为 unknown，统一断言
  type CallResult = {
    content: Array<{ type: string; text?: string }>;
    isError?: boolean;
  };

  it("Client listTools 含 system_info", async () => {
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    const server = createServer(baseline);
    const client = new Client(
      { name: "test-client", version: "1.0.0" },
      { capabilities: {} },
    );
    await server.connect(serverT);
    await client.connect(clientT);
    try {
      const result = await client.listTools();
      expect(result.tools.some((t) => t.name === "system_info")).toBe(true);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("Client callTool system_info 返回 ok", async () => {
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    const server = createServer(baseline);
    const client = new Client(
      { name: "test-client", version: "1.0.0" },
      { capabilities: {} },
    );
    await server.connect(serverT);
    await client.connect(clientT);
    try {
      const result = (await client.callTool({
        name: "system_info",
        arguments: {},
      })) as CallResult;
      expect(result.isError).toBeFalsy();
      expect(result.content.length).toBeGreaterThan(0);
      const first = result.content[0];
      expect(first).toBeDefined();
      if (first && first.type === "text") {
        const parsed = JSON.parse(first.text ?? "") as { ok: boolean };
        expect(parsed.ok).toBe(true);
      }
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("Client callTool 未知工具返回 isError", async () => {
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    const server = createServer(baseline);
    const client = new Client(
      { name: "test-client", version: "1.0.0" },
      { capabilities: {} },
    );
    await server.connect(serverT);
    await client.connect(clientT);
    try {
      const result = (await client.callTool({
        name: "nonexistent",
        arguments: {},
      })) as CallResult;
      expect(result.isError).toBe(true);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("Client callTool system_info verbose 返回完整字段", async () => {
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    const server = createServer(baseline);
    const client = new Client(
      { name: "test-client", version: "1.0.0" },
      { capabilities: {} },
    );
    await server.connect(serverT);
    await client.connect(clientT);
    try {
      const result = (await client.callTool({
        name: "system_info",
        arguments: { verbose: true },
      })) as CallResult;
      expect(result.isError).toBeFalsy();
      const first = result.content[0];
      if (first && first.type === "text") {
        const parsed = JSON.parse(first.text ?? "") as {
          ok: boolean;
          uptime?: number;
        };
        expect(parsed.ok).toBe(true);
        expect(parsed.uptime).toBeDefined();
      }
    } finally {
      await client.close();
      await server.close();
    }
  });
});

// ===================== fs_read MCP 投影（工单 01） =====================

describe("listTools fs_read 投影", () => {
  it("fs_read 项含 outputSchema（JSON schema 对象）", () => {
    const tools = listTools([fsReadTool]);
    const item = tools.find((t) => t.name === "fs_read");
    expect(item).toBeDefined();
    expect(item?.outputSchema).toBeDefined();
    const outSchema = item?.outputSchema as Record<string, unknown>;
    expect(outSchema["type"]).toBe("object");
    const props = outSchema["properties"] as Record<string, unknown>;
    expect(props["content"]).toBeDefined();
    expect(props["truncated"]).toBeDefined();
    expect(props["lines"]).toBeDefined();
  });

  it("fs_read 项含 annotations.readOnlyHint===true", () => {
    const tools = listTools([fsReadTool]);
    const item = tools.find((t) => t.name === "fs_read");
    expect(item?.annotations).toBeDefined();
    expect(item?.annotations?.readOnlyHint).toBe(true);
  });

  it("无 outputSchema 的工具不附 outputSchema 字段", () => {
    // 工单 04 后全部 59 工具都已补 outputSchema/annotations，此处构造一个临时无元数据工具，
    // 验证 listTools 条件透传（不附 outputSchema/annotations 字段）。
    const bareTool: Tool = {
      name: "bare_test_tool",
      description: "临时无元数据工具",
      inputSchema: z.object({}),
      handler: async () => ({ ok: true as const }),
    };
    const tools = listTools([bareTool]);
    const item = tools.find((t) => t.name === "bare_test_tool");
    expect(item?.outputSchema).toBeUndefined();
    expect(item?.annotations).toBeUndefined();
  });

  it("builtinTools 中 fs_read 投影含 outputSchema + annotations", () => {
    const tools = listTools();
    const item = tools.find((t) => t.name === "fs_read");
    expect(item?.outputSchema).toBeDefined();
    expect(item?.annotations?.readOnlyHint).toBe(true);
  });
});
