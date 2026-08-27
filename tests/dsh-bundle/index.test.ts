/**
 * dsh-bundle 插件 apply 冒烟测试。
 *
 * 用临时 DSH_HOME 验证：apply 把 bundled presets 同步进
 * `<DSH_HOME>/.agent-presets/`；mountOnce 保证重复 apply 只生效一次。
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { apply, name, bundledPresetsRoot } from "../../src/dsh-bundle/index.js";

/** mountOnce 的全局单实例注册表键（Symbol.for 与 src 一致，测试间重置）。 */
const MOUNTED = Symbol.for("win-shell-mcp.dsh-bundle.mounted");

const DSH_HOME_BAK = process.env["DSH_HOME"];
let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "wshell-home-"));
  process.env["DSH_HOME"] = home;
  // 清空全局 mount 态，保证每个用例独立触发一次 apply
  delete (globalThis as Record<symbol, unknown>)[MOUNTED];
});

afterEach(() => {
  if (DSH_HOME_BAK === undefined) delete process.env["DSH_HOME"];
  else process.env["DSH_HOME"] = DSH_HOME_BAK;
  rmSync(home, { recursive: true, force: true });
});

describe("dsh-bundle apply", () => {
  it("插件名与默认导出稳定", () => {
    expect(name).toBe("wshell-bundle");
  });

  it("bundledPresetsRoot 指向包内 presets 树（含全部 WShell preset）", () => {
    expect(existsSync(bundledPresetsRoot())).toBe(true);
    expect(existsSync(join(bundledPresetsRoot(), "wshell-standard", "agent.cordis.yml"))).toBe(true);
    expect(existsSync(join(bundledPresetsRoot(), "wshell-batch", "agent.cordis.yml"))).toBe(true);
  });

  it("apply 同步 preset 到 <DSH_HOME>/.agent-presets", () => {
    const calls: string[] = [];
    const ctx = {
      logger: { info: (m: string) => calls.push(m), warn: (m: string) => calls.push(m) },
    };
    apply(ctx as never);
    const target = join(home, ".agent-presets", "wshell-standard");
    expect(existsSync(join(target, "agent.cordis.yml"))).toBe(true);
    expect(existsSync(join(target, "tool-win-shell.mjs"))).toBe(true);
    const synced = readdirSync(join(home, ".agent-presets"));
    expect(synced).toContain("wshell-standard");
    // 批量模式随 bundle 一并同步进 agent-presets 发现根
    expect(synced).toContain("wshell-batch");
  });

  it("enabled: false 时不同步", () => {
    apply({ logger: {} } as never, { enabled: false });
    expect(existsSync(join(home, ".agent-presets"))).toBe(false);
  });

  it("mountOnce：重复 apply 不重复写日志", () => {
    const info: string[] = [];
    const ctx = { logger: { info: (m: string) => info.push(m), warn: (m: string) => info.push(m) } };
    apply(ctx as never);
    apply(ctx as never);
    const syncLogs = info.filter((m) => m.includes("presets synced"));
    expect(syncLogs.length).toBe(1);
    expect(readFileSync(join(home, ".agent-presets", "wshell-standard", "agent.cordis.yml"), "utf8")).toContain("persona");
  });
});
