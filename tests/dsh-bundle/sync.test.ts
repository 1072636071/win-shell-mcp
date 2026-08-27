/**
 * syncPresetTrees 同步逻辑测试（临时目录，不触碰真实 DSH_HOME）。
 *
 * 覆盖：全新同步、幂等跳过、内容变更重写、多余文件清理、retire 淘汰、
 * 用户自建目录不被碰、缺 agent.cordis.yml 报 failed。
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { syncPresetTrees, syncOnePreset } from "../../src/dsh-bundle/sync.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "wshell-sync-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function writePreset(base: string, id: string, agentText: string): string {
  const dir = join(base, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "agent.cordis.yml"), agentText);
  return dir;
}

const AGENT_OK = "- id: persona\n  name: '@deepseek-ai/dsh-persona'\n";

describe("syncPresetTrees", () => {
  it("全新同步 source → target", () => {
    const source = join(root, "src");
    writePreset(source, "wshell-standard", AGENT_OK);
    const target = join(root, "dst");
    const result = syncPresetTrees(source, target);
    expect(result.synced).toEqual(["wshell-standard"]);
    expect(existsSync(join(target, "wshell-standard", "agent.cordis.yml"))).toBe(true);
  });

  it("内容不变时幂等跳过", () => {
    const source = join(root, "src");
    writePreset(source, "wshell-standard", AGENT_OK);
    const target = join(root, "dst");
    syncPresetTrees(source, target);
    const second = syncPresetTrees(source, target);
    expect(second.current).toEqual(["wshell-standard"]);
    expect(second.synced).toEqual([]);
  });

  it("内容变更时重写", () => {
    const source = join(root, "src");
    writePreset(source, "wshell-standard", AGENT_OK);
    const target = join(root, "dst");
    syncPresetTrees(source, target);
    writeFileSync(join(source, "wshell-standard", "agent.cordis.yml"), "- id: other\n  name: '@x/y'\n");
    const second = syncPresetTrees(source, target);
    expect(second.synced).toEqual(["wshell-standard"]);
  });

  it("目标多余文件被清理", () => {
    const source = join(root, "src");
    const dir = writePreset(source, "wshell-standard", AGENT_OK);
    writeFileSync(join(dir, "extra.txt"), "stale");
    const target = join(root, "dst");
    syncPresetTrees(source, target);
    // 移除源里的 extra.txt 后重同步，目标里应被清掉
    rmSync(join(dir, "extra.txt"));
    syncPresetTrees(source, target);
    expect(existsSync(join(target, "wshell-standard", "extra.txt"))).toBe(false);
  });

  it("用户自建 preset 目录不被触碰", () => {
    const source = join(root, "src");
    writePreset(source, "wshell-standard", AGENT_OK);
    const target = join(root, "dst");
    writePreset(target, "my-own-preset", "- id: p\n  name: '@x/p'\n");
    syncPresetTrees(source, target);
    expect(existsSync(join(target, "my-own-preset", "agent.cordis.yml"))).toBe(true);
  });

  it("retire 淘汰本 bundle 曾拥有的 preset", () => {
    const source = join(root, "src");
    const target = join(root, "dst");
    writePreset(target, "wshell-old", "- id: p\n  name: '@x/p'\n");
    const result = syncPresetTrees(source, target, ["wshell-old"]);
    expect(result.retired).toEqual(["wshell-old"]);
    expect(existsSync(join(target, "wshell-old"))).toBe(false);
  });

  it("缺 agent.cordis.yml 报 failed", () => {
    const source = join(root, "src");
    mkdirSync(join(source, "broken"), { recursive: true });
    writeFileSync(join(source, "broken", "readme.txt"), "no agent file");
    const result = syncPresetTrees(source, join(root, "dst"));
    expect(result.failed.some((f) => f.id === "broken")).toBe(true);
  });

  it("syncOnePreset 对已存在同内容返回 current", () => {
    const source = join(root, "src");
    const dir = writePreset(source, "p", AGENT_OK);
    const target = join(root, "dst");
    expect(syncOnePreset(dir, target)).toBe("synced");
    expect(syncOnePreset(dir, target)).toBe("current");
    expect(readFileSync(join(target, "agent.cordis.yml"), "utf8")).toBe(AGENT_OK);
  });
});
