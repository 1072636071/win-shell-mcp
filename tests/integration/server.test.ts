/**
 * 集成测试：用 Client + InMemoryTransport 连接 createServer()，
 * 验证全部 58 个工具已注册、可列出、代表性工具可调用、未知工具失败、工具名唯一。
 *
 * 不启动真实 stdio，仅内存传输。
 */

import { describe, it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer, listTools, callTool } from '../../src/server.js';
import { builtinTools, getAllTools, findTool } from '../../src/registry.js';
import { isOk, isFail } from '../../src/contract/output.js';

/** 期望的工具总数。 */
const EXPECTED_TOOL_COUNT = 58;

/** 期望的工具名（按域分组，共 58 个）。 */
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
  it('builtinTools 含 58 个工具', () => {
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
  it('Client listTools 返回 40 个工具', async () => {
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