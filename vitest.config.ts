import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 15000, // git/process 实时子进程在慢 CI 机器并行下偶发超限，放宽默认超时
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
