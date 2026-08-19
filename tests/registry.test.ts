/**
 * registry 别名机制测试（工单 02）。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import { registerTool, resetRegistry, findTool, type Tool } from '../src/registry.js';

beforeEach(() => resetRegistry());

const stub = (name: string, aliases?: string[]): Tool => ({
  name,
  description: 'stub',
  inputSchema: z.object({}),
  handler: async () => ({ ok: true }) as never,
  ...(aliases ? { aliases } : {}),
});

describe('findTool 别名解析', () => {
  it('通过别名解析到正名工具', () => {
    registerTool(stub('fs_list', ['ls', 'list_directory']));
    expect(findTool('ls')?.name).toBe('fs_list');
    expect(findTool('list_directory')?.name).toBe('fs_list');
    expect(findTool('fs_list')?.name).toBe('fs_list');
    expect(findTool('unknown')).toBeUndefined();
  });

  it('正名优先于别名', () => {
    registerTool(stub('ls'));
    registerTool(stub('fs_list', ['ls']));
    expect(findTool('ls')?.name).toBe('ls');
    expect(findTool('fs_list')?.name).toBe('fs_list');
  });

  it('多个工具无别名时互不影响', () => {
    registerTool(stub('a', ['x']));
    registerTool(stub('b', ['y']));
    expect(findTool('x')?.name).toBe('a');
    expect(findTool('y')?.name).toBe('b');
  });
});
