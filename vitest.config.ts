import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // git/pkg/process 等用例大量 spawn 子进程，并行负载下单次启动可能超过默认 5s
    testTimeout: 15000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      reporter: ["text", "html"],
      thresholds: {
        lines: 85,
        functions: 85,
        statements: 85,
        branches: 84, // 跨平台工具含平台专属分支，单平台无法全覆盖
      },
    },
  },
});
