/**
 * tasklist 解析深模块表驱动测试（工单 20-02）。
 *
 * process_list 与 net_listen 共用 parseTasklistCsv；此处钉死解析行为。
 */

import { describe, it, expect } from 'vitest';
import { parseTasklistCsv } from '../../src/utils/tasklist.js';

describe('parseTasklistCsv', () => {
  it('解析标准引号行（含内存列）', () => {
    expect(parseTasklistCsv('"cmd.exe","1234","Console","1","5,120 KBytes"')).toEqual({
      name: 'cmd.exe',
      pid: 1234,
      memory: 5120 * 1024,
    });
  });

  it('解析含空格/逗号的映像名（引号包裹）', () => {
    expect(parseTasklistCsv('"System Idle Process","0","Services","0","8 KBytes"')).toEqual({
      name: 'System Idle Process',
      pid: 0,
      memory: 8 * 1024,
    });
  });

  it('解析无引号行（仅两列）', () => {
    expect(parseTasklistCsv('node.exe,5678')).toEqual({ name: 'node.exe', pid: 5678 });
  });

  it('无内存列时不带 memory 字段', () => {
    const entry = parseTasklistCsv('"node.exe","5678","Console","1"');
    expect(entry).toEqual({ name: 'node.exe', pid: 5678 });
    expect(entry).not.toHaveProperty('memory');
  });

  it('非法 PID 返回 null', () => {
    expect(parseTasklistCsv('"cmd.exe","abc"')).toBeNull();
    expect(parseTasklistCsv('"cmd.exe","-5"')).toBeNull();
  });

  it('畸形行返回 null（未闭合引号 / 空行 / 单列）', () => {
    expect(parseTasklistCsv('')).toBeNull();
    expect(parseTasklistCsv('"cmd.exe"')).toBeNull();
    expect(parseTasklistCsv('"cmd.exe","1234","Console"')).not.toBeNull();
  });
});
