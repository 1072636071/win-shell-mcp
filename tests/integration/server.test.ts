/**
 * 集成测试：用 Client + InMemoryTransport 连接 createServer()，
 * 验证全部 61 个工具已注册、可列出、代表性工具可调用、未知工具失败、工具名唯一。
 *
 * 不启动真实 stdio，仅内存传输。
 */

import { describe, it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  ToolListChangedNotificationSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  createServer,
  listTools,
  callTool,
  type CreateServerOptions,
} from '../../src/server.js';
import {
  resolveListedTools,
  composeLazyDispatchTable,
} from '../../src/deploy.js';
import { builtinTools, getAllTools, findTool, type Tool } from '../../src/registry.js';
import { isOk, isFail } from '../../src/contract/output.js';

/** 期望的工具总数（工单 11-03：58 域 + 3 meta = 61，PRD 测试决策 4）。 */
const EXPECTED_TOOL_COUNT = 61;

/** 期望的工具名（按域分组，共 61 个）。 */
const EXPECTED_TOOL_NAMES = [
  // system
  'system_info',
  'system_disk',
  'system_memory',
  'system_path',
  // fs_read
  'fs_list',
  'fs_read',
  'fs_stat',
  // fs_write
  'fs_write',
  'fs_mkdir',
  'fs_rm',
  'fs_cp',
  'fs_mv',
  'fs_touch',
  // text
  'text_grep',
  'text_head',
  'text_tail',
  'text_wc',
  'text_diff',
  'text_replace',
  // search
  'search_glob',
  'search_content',
  'search_which',
  // process
  'process_list',
  'process_kill',
  // shell_exec
  'shell_exec',
  // env
  'env_get',
  'env_set',
  'env_unset',
  // net
  'net_get',
  'net_post',
  'net_dns',
  'net_tcp',
  // pkg
  'pkg_detect',
  'pkg_run',
  // git
  'git_status',
  'git_log',
  'git_branch',
  'git_diff',
  'git_add',
  'git_commit',
  'git_checkout',
  'git_push',
  'git_pull',
  'git_clone',
  'git_stash',
  // core / shell / 各域新增（工单 02/03 + 各域新增）
  'pwd',
  'echo',
  'run_command',
  'find',
  'cat',
  'ping',
  // 工单 02 新增命令
  'fs_du',
  'hash_file',
  'json_get',
  'net_listen',
  'net_download',
  'archive_create',
  'archive_extract',
  // batch_run（工单 01-04）
  'batch_run',
  // 域导航 meta（工单 11-03）
  'tool_groups',
  'list_domain_tools',
] as const;

/** Client callTool 返回类型（content 退化为 unknown，统一断言）。 */
type CallResult = {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
};

/** 用 InMemoryTransport 建立一对连接的 client/server。 */
async function setupClient(): Promise<{
  client: Client;
  close: () => Promise<void>;
}> {
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const server = createServer();
  const client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} });
  await server.connect(serverT);
  await client.connect(clientT);
  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

describe('集成测试 - 工具注册', () => {
  it('builtinTools 含 61 个工具', () => {
    expect(builtinTools.length).toBe(EXPECTED_TOOL_COUNT);
  });

  it('工具名唯一（无重复）', () => {
    const names = builtinTools.map((t) => t.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it('包含全部期望的工具名', () => {
    const names = new Set(builtinTools.map((t) => t.name));
    for (const expected of EXPECTED_TOOL_NAMES) {
      expect(names.has(expected)).toBe(true);
    }
  });

  it('短名/别名可解析到正名工具', () => {
    expect(findTool('ls')?.name).toBe('fs_list');
    expect(findTool('list_directory')?.name).toBe('fs_list');
    expect(findTool('fs_find')?.name).toBe('find');
  });
});

describe('集成测试 - listTools 端到端', () => {
  it('Client listTools 返回 61 个工具', async () => {
    const { client, close } = await setupClient();
    try {
      const result = await client.listTools();
      expect(result.tools.length).toBe(EXPECTED_TOOL_COUNT);
    } finally {
      await close();
    }
  });

  it('Client listTools 工具名唯一', async () => {
    const { client, close } = await setupClient();
    try {
      const result = await client.listTools();
      const names = result.tools.map((t) => t.name);
      const unique = new Set(names);
      expect(unique.size).toBe(names.length);
    } finally {
      await close();
    }
  });

  it('Client listTools 每个工具含 name/description/inputSchema', async () => {
    const { client, close } = await setupClient();
    try {
      const result = await client.listTools();
      for (const tool of result.tools) {
        expect(typeof tool.name).toBe('string');
        expect(tool.name.length).toBeGreaterThan(0);
        expect(tool.description).toBeDefined();
        expect(tool.description!.length).toBeGreaterThan(0);
        expect(tool.inputSchema).toBeDefined();
      }
    } finally {
      await close();
    }
  });
});

describe('集成测试 - callTool 代表性工具', () => {
  it('system_info 返回 ok', async () => {
    const result = await callTool('system_info', {});
    expect(isOk(result)).toBe(true);
  });

  it('fs_stat 对 cwd 返回 ok', async () => {
    const result = await callTool('fs_stat', { path: process.cwd() });
    expect(isOk(result)).toBe(true);
  });

  it('env_get 指定变量返回 ok', async () => {
    // PATH 在所有平台都存在（Node 在 Windows 下也暴露 PATH）
    const result = await callTool('env_get', { name: 'PATH' });
    expect(isOk(result)).toBe(true);
  });

  it('system_info verbose=true 返回完整字段', async () => {
    const result = await callTool('system_info', { verbose: true });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result['uptime']).toBeDefined();
      expect(result['totalmem']).toBeDefined();
    }
  });
});

describe('集成测试 - callTool 错误路径', () => {
  it('未知工具返回 fail EINVAL', async () => {
    const result = await callTool('nonexistent_tool_xyz', {});
    expect(isFail(result)).toBe(true);
    if (isFail(result)) {
      expect(result.error.code).toBe('EINVAL');
      expect(result.error.message).toContain('Unknown tool');
    }
  });

  it('fs_stat 缺少 path 参数返回 fail', async () => {
    const result = await callTool('fs_stat', {});
    expect(isFail(result)).toBe(true);
  });
});

describe('集成测试 - Client 端到端 callTool', () => {
  it('Client 调用 system_info 返回 ok', async () => {
    const { client, close } = await setupClient();
    try {
      const result = (await client.callTool({ name: 'system_info', arguments: {} })) as CallResult;
      expect(result.isError).toBeFalsy();
      expect(result.content.length).toBeGreaterThan(0);
      const first = result.content[0];
      expect(first).toBeDefined();
      if (first && first.type === 'text') {
        const parsed = JSON.parse(first.text ?? '') as { ok: boolean };
        expect(parsed.ok).toBe(true);
      }
    } finally {
      await close();
    }
  });

  it('Client 调用 fs_stat 对 cwd 返回 ok', async () => {
    const { client, close } = await setupClient();
    try {
      const result = (await client.callTool({
        name: 'fs_stat',
        arguments: { path: process.cwd() },
      })) as CallResult;
      expect(result.isError).toBeFalsy();
      const first = result.content[0];
      if (first && first.type === 'text') {
        const parsed = JSON.parse(first.text ?? '') as { ok: boolean; type?: string };
        expect(parsed.ok).toBe(true);
        expect(parsed.type).toBeDefined();
      }
    } finally {
      await close();
    }
  });

  it('Client 调用 env_get 返回 ok', async () => {
    const { client, close } = await setupClient();
    try {
      const result = (await client.callTool({
        name: 'env_get',
        arguments: { name: 'PATH' },
      })) as CallResult;
      expect(result.isError).toBeFalsy();
      const first = result.content[0];
      if (first && first.type === 'text') {
        const parsed = JSON.parse(first.text ?? '') as { ok: boolean };
        expect(parsed.ok).toBe(true);
      }
    } finally {
      await close();
    }
  });

  it('Client 调用未知工具返回 isError', async () => {
    const { client, close } = await setupClient();
    try {
      const result = (await client.callTool({
        name: 'nonexistent_tool_xyz',
        arguments: {},
      })) as CallResult;
      expect(result.isError).toBe(true);
    } finally {
      await close();
    }
  });
});

describe('集成测试 - listTools 与 builtinTools 一致性', () => {
  it('listTools 与 builtinTools 返回相同工具名集合', () => {
    const allNames = new Set(builtinTools.map((t) => t.name));
    const listNames = new Set(listTools().map((t) => t.name));
    expect(allNames.size).toBe(listNames.size);
    for (const name of allNames) {
      expect(listNames.has(name)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 工单 11-04：懒模式 ListTools（列出面/分发面分离）
// 只测外部可观察行为（listTools/callTool 输出与通知），不测内部裁剪实现。
// ---------------------------------------------------------------------------

/** 懒模式期望的列出面名单（与 server.ts 三件套一致，钉住外部契约）。 */
const LAZY_EXPECTED_NAMES = ['batch_run', 'tool_groups', 'list_domain_tools'];

/** 建立双表注入的 client/server 对；notifications 收集运行期 listChanged 通知。 */
async function setupDualTableClient(options: CreateServerOptions): Promise<{
  client: Client;
  notifications: string[];
  close: () => Promise<void>;
}> {
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const server = createServer(options);
  const client = new Client(
    { name: 'test-client', version: '1.0.0' },
    { capabilities: {} },
  );
  const notifications: string[] = [];
  client.setNotificationHandler(ToolListChangedNotificationSchema, () => {
    notifications.push('tools/list_changed');
  });
  await server.connect(serverT);
  await client.connect(clientT);
  return {
    client,
    notifications,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

describe('集成测试 - 懒模式 ListTools（工单 11-04）', () => {
  it('懒模式下列出面恰为 3 个 meta 工具', async () => {
    const { client, close } = await setupDualTableClient({
      tools: builtinTools,
      listedTools: resolveListedTools(true, builtinTools),
    });
    try {
      const result = await client.listTools();
      expect(result.tools.map((t) => t.name).sort()).toEqual(
        [...LAZY_EXPECTED_NAMES].sort(),
      );
    } finally {
      await close();
    }
  });

  it('懒模式下未列出的工具照常可调用（调用不设门禁）', async () => {
    const { client, close } = await setupDualTableClient({
      tools: builtinTools,
      listedTools: resolveListedTools(true, builtinTools),
    });
    try {
      // fs_stat 不在懒模式列出面，但必须照常执行成功——兼容性基石
      const result = (await client.callTool({
        name: 'fs_stat',
        arguments: { path: process.cwd() },
      })) as CallResult;
      expect(result.isError).toBeFalsy();
      const first = result.content[0];
      if (first && first.type === 'text') {
        const parsed = JSON.parse(first.text ?? '') as { ok: boolean };
        expect(parsed.ok).toBe(true);
      }
    } finally {
      await close();
    }
  });

  it('懒模式下列出的 meta 工具自身可调用', async () => {
    const { client, close } = await setupDualTableClient({
      tools: builtinTools,
      listedTools: resolveListedTools(true, builtinTools),
    });
    try {
      const result = (await client.callTool({
        name: 'tool_groups',
        arguments: {},
      })) as CallResult;
      expect(result.isError).toBeFalsy();
    } finally {
      await close();
    }
  });

  it('懒模式下未知工具仍返回 Unknown tool（分发表语义不变）', async () => {
    const { client, close } = await setupDualTableClient({
      tools: builtinTools,
      listedTools: resolveListedTools(true, builtinTools),
    });
    try {
      const result = (await client.callTool({
        name: 'nonexistent_tool_xyz',
        arguments: {},
      })) as CallResult;
      expect(result.isError).toBe(true);
      const first = result.content[0];
      if (first && first.type === 'text') {
        const parsed = JSON.parse(first.text ?? '') as {
          error?: { message?: string };
        };
        expect(parsed.error?.message).toContain('Unknown tool');
      }
    } finally {
      await close();
    }
  });

  it('运行期不发 listChanged 通知', async () => {
    const { client, notifications, close } = await setupDualTableClient({
      tools: builtinTools,
      listedTools: resolveListedTools(true, builtinTools),
    });
    try {
      await client.listTools();
      await client.callTool({ name: 'system_info', arguments: {} });
      await client.listTools();
      await client.callTool({ name: 'fs_stat', arguments: { path: process.cwd() } });
      expect(notifications).toEqual([]);
    } finally {
      await close();
    }
  });

  it('resolveListedTools(false) 原样返回分发表（全量逐字节不变）', () => {
    const listed = resolveListedTools(false, builtinTools);
    expect(listed).toBe(builtinTools); // 引用相等：零拷贝、顺序内容完全一致
  });

  it('resolveListedTools(true) 恰为三件套且保持注册顺序', () => {
    const names = resolveListedTools(true, builtinTools).map((t) => t.name);
    expect(names).toEqual(LAZY_EXPECTED_NAMES);
  });

  it('resolveListedTools 与部署子表求交：被裁 meta 自然不出现在列出面', () => {
    const deployed = builtinTools.filter((t) => t.name !== 'batch_run');
    const names = resolveListedTools(true, deployed).map((t) => t.name);
    expect(names).toEqual(['tool_groups', 'list_domain_tools']);
  });
});

describe('集成测试 - createServer 双表 API 兼容形态（工单 11-04）', () => {
  it('对象形态仅传 tools 时与历史数组形态行为一致', async () => {
    const { client, close } = await setupDualTableClient({ tools: builtinTools });
    try {
      const result = await client.listTools();
      expect(result.tools.length).toBe(EXPECTED_TOOL_COUNT);
      expect(result.tools[0]?.name).toBe(builtinTools[0]?.name);
    } finally {
      await close();
    }
  });

  it('listedTools 子集只收窄列出面，不影响分发面', async () => {
    const { client, close } = await setupDualTableClient({
      tools: builtinTools,
      listedTools: [builtinTools[0]!],
    });
    try {
      const listed = await client.listTools();
      expect(listed.tools).toHaveLength(1);
      expect(listed.tools[0]?.name).toBe(builtinTools[0]?.name);
      // 列出面只有 1 个，但其余工具照常可调用
      const result = (await client.callTool({
        name: 'env_get',
        arguments: { name: 'PATH' },
      })) as CallResult;
      expect(result.isError).toBeFalsy();
    } finally {
      await close();
    }
  });
});

// ---------------------------------------------------------------------------
// 工单 11-05：白名单 × 懒加载组合语义（meta 三件套豁免 + 正交退化）
// ---------------------------------------------------------------------------

/** 模拟一份不含任何 meta 的白名单部署：fs/git/system/env/core 各留代表工具。 */
const COMPOSE_WHITELIST = [
  'fs_read',
  'fs_write',
  'git_status',
  'system_info',
  'env_get',
  'pwd',
  'echo',
];

/** 按 startStdioServer 的装配规则合成双表（纯函数、不读 env）。 */
function composeTables(options: {
  whitelist?: readonly string[];
  lazy: boolean;
}): { tools: readonly Tool[]; listedTools?: readonly Tool[] } {
  const deployed = options.whitelist
    ? builtinTools.filter((t) => options.whitelist!.includes(t.name))
    : builtinTools;
  const dispatchTable = options.lazy ? composeLazyDispatchTable(deployed) : deployed;
  return {
    tools: dispatchTable,
    ...(options.lazy ? { listedTools: resolveListedTools(true, dispatchTable) } : {}),
  };
}

/** 解析 CallTool text content 为统一输出契约对象。 */
function parseCall(result: CallResult): Record<string, unknown> {
  const first = result.content[0];
  if (first && first.type === 'text') {
    return JSON.parse(first.text ?? '{}') as Record<string, unknown>;
  }
  throw new Error('callTool 未返回 text content');
}

describe('工单 11-05：composeLazyDispatchTable 豁免装配', () => {
  it('被裁的三件套按注册序补回分发表', () => {
    const composed = composeLazyDispatchTable(
      builtinTools.filter((t) => COMPOSE_WHITELIST.includes(t.name)),
    );
    // 结果恒为 builtinTools 的注册序子序列（补集插位不乱序）
    const composedNames = new Set(composed.map((t) => t.name));
    expect(composedNames).toEqual(
      new Set([...COMPOSE_WHITELIST, 'batch_run', 'tool_groups', 'list_domain_tools']),
    );
    let cursor = -1;
    for (const t of composed) {
      const idx = builtinTools.findIndex((b) => b.name === t.name);
      expect(idx).toBeGreaterThan(cursor);
      cursor = idx;
    }
  });

  it('全量表输入时结果与全量注册表同名同长（零破坏）', () => {
    const composed = composeLazyDispatchTable(builtinTools);
    expect(composed.map((t) => t.name)).toEqual(builtinTools.map((t) => t.name));
  });
});

describe('工单 11-05：组合模式（白名单 + 懒）端到端', () => {
  async function setupCombined() {
    return setupDualTableClient(composeTables({ whitelist: COMPOSE_WHITELIST, lazy: true }) as CreateServerOptions);
  }

  it('ListTools 恒返回 3 个 meta（三件套豁免白名单，未点名也列入）', async () => {
    const { client, close } = await setupCombined();
    try {
      const result = await client.listTools();
      expect(result.tools.map((t) => t.name).sort()).toEqual([
        'batch_run',
        'list_domain_tools',
        'tool_groups',
      ]);
    } finally {
      await close();
    }
  });

  it('tool_groups 域集合与 toolCount 反映过滤后集合；空域不出现', async () => {
    const { client, close } = await setupCombined();
    try {
      const result = (await client.callTool({ name: 'tool_groups' })) as CallResult;
      expect(result.isError).toBeFalsy();
      const data = parseCall(result) as { groups: Array<{ domain: string; toolCount: number; examples: string[] }> };
      expect(data.groups.map((g) => g.domain)).toEqual(['system', 'fs', 'env', 'git', 'core']);
      expect(data.groups.reduce((sum, g) => sum + g.toolCount, 0)).toBe(COMPOSE_WHITELIST.length);
      for (const g of data.groups) {
        for (const example of g.examples) {
          expect(COMPOSE_WHITELIST).toContain(example);
        }
      }
    } finally {
      await close();
    }
  });

  it('list_domain_tools 只返回可见工具；整域被裁返回空数组', async () => {
    const { client, close } = await setupCombined();
    try {
      const git = (await client.callTool({
        name: 'list_domain_tools',
        arguments: { domain: 'git' },
      })) as CallResult;
      const gitData = parseCall(git) as { tools: Array<{ name: string }> };
      expect(gitData.tools.map((t) => t.name)).toEqual(['git_status']);

      const net = (await client.callTool({
        name: 'list_domain_tools',
        arguments: { domain: 'net' },
      })) as CallResult;
      const netData = parseCall(net) as { tools: unknown[] };
      expect(netData.tools).toEqual([]);
    } finally {
      await close();
    }
  });

  it('被裁工具调用走「未在当前部署暴露」文案（非懒列表歧义文案）', async () => {
    const { client, close } = await setupCombined();
    try {
      const result = (await client.callTool({
        name: 'fs_rm',
        arguments: { path: process.cwd() },
      })) as CallResult;
      expect(result.isError).toBe(true);
      const data = parseCall(result) as { error?: { message?: string; code?: string } };
      expect(data.error?.code).toBe('EINVAL');
      expect(data.error?.message).toContain('未在当前部署暴露');
      expect(data.error?.message).not.toContain('懒');
    } finally {
      await close();
    }
  });

  it('豁免的 batch_run 在组合模式可正常编排（步骤引用可见工具成功）', async () => {
    const { client, close } = await setupCombined();
    try {
      const result = (await client.callTool({
        name: 'batch_run',
        arguments: { steps: [{ tool: 'echo', args: { args: ['hi'] } }] },
      })) as CallResult;
      expect(result.isError).toBeFalsy();
      const data = parseCall(result) as { allOk?: boolean };
      expect(data.allOk).toBe(true);
    } finally {
      await close();
    }
  });
});

describe('工单 11-05：单开退化路径（正交性）', () => {
  it('纯白名单模式（懒关闭）：meta 作为普通工具受约束——不在列出面且调用被拒', async () => {
    const tables = composeTables({ whitelist: COMPOSE_WHITELIST, lazy: false });
    const { client, close } = await setupDualTableClient(tables as CreateServerOptions);
    try {
      const listed = await client.listTools();
      expect(listed.tools).toHaveLength(COMPOSE_WHITELIST.length);
      expect(listed.tools.some((t) => t.name === 'tool_groups')).toBe(false);

      const result = (await client.callTool({ name: 'tool_groups' })) as CallResult;
      expect(result.isError).toBe(true);
      const data = parseCall(result) as { error?: { message?: string } };
      expect(data.error?.message).toContain('未在当前部署暴露');
    } finally {
      await close();
    }
  });

  it('纯懒模式（无白名单）：分发表仍为全量 61（豁免合成为恒等变换）', () => {
    const tables = composeTables({ lazy: true });
    expect((tables.tools as readonly Tool[]).map((t) => t.name)).toEqual(
      builtinTools.map((t) => t.name),
    );
  });
});

describe('工单 18：先列后调 structuredContent 回填（协议级回归）', () => {
  /**
   * 本组用例即 11-06 门槛发现的缺陷漏网形态：Client 先 listTools() 缓存
   * outputSchema 再 tools/call，严格客户端强制校验成功响应必须携带
   * structuredContent，缺失即 -32600 整包拒绝。
   */
  type StructuredCallResult = CallResult & {
    structuredContent?: Record<string, unknown>;
  };

  it('只读工具（system_info）：先列后调无 -32600，structuredContent 与 text JSON 深度相等', async () => {
    const { client, close } = await setupClient();
    try {
      await client.listTools();
      const result = (await client.callTool({
        name: 'system_info',
        arguments: {},
      })) as StructuredCallResult;
      expect(result.isError).toBeFalsy();
      expect(result.structuredContent).toEqual(parseCall(result));
    } finally {
      await close();
    }
  });

  it('复杂 schema 工具（batch_run 嵌套 steps）：先列后调同样回填且形状正确', async () => {
    const { client, close } = await setupClient();
    try {
      await client.listTools();
      const result = (await client.callTool({
        name: 'batch_run',
        arguments: { steps: [{ tool: 'echo', args: { args: ['hello'] } }] },
      })) as StructuredCallResult;
      expect(result.isError).toBeFalsy();
      const data = parseCall(result) as { allOk?: boolean };
      expect(data.allOk).toBe(true);
      expect(result.structuredContent).toEqual(parseCall(result));
      expect(
        (result.structuredContent as { allOk?: boolean }).allOk,
      ).toBe(true);
    } finally {
      await close();
    }
  });

  it('失败路径回归：错误响应无 structuredContent、text 仍为错误 JSON、isError=true', async () => {
    const { client, close } = await setupClient();
    try {
      await client.listTools();
      const result = (await client.callTool({
        name: 'fs_stat',
        arguments: { path: './definitely_no_such_path__ticket18' },
      })) as StructuredCallResult;
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toBeUndefined();
      const data = parseCall(result);
      expect(data.ok).toBe(false);
      expect((data.error as { code?: string })?.code).toBe('ENOENT');
    } finally {
      await close();
    }
  });
});