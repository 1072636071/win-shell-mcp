import { defineConfig } from "tsup";

/**
 * 多入口构建配置。
 *
 * 第一个 config：src/index.ts（MCP stdio 入口），带 shebang banner。
 * 第二个 config：src/plugin.ts + src/core.ts（库入口），不带 shebang。
 *
 * 注意：仅第一个 config 设 clean: true，第二个 clean: false 以保留前者产物。
 * tsup 数组配置按顺序执行。
 */
export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm"],
    target: "node18",
    platform: "node",
    sourcemap: true,
    clean: true,
    banner: { js: "#!/usr/bin/env node" },
  },
  {
    entry: ["src/plugin.ts", "src/core.ts"],
    format: ["esm"],
    target: "node18",
    platform: "node",
    sourcemap: true,
    clean: false,
  },
]);
