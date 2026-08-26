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
      // 工单 17-02：覆盖率 reporter 由 "text" 改为 "text-summary"——终端只留总表，
      // 逐文件明细移到 coverage/index.html（本就生成）。关键失败信息不丢失：
      // text-summary 在阈值未达标时仍会列出不足文件与指标。
      reporter: ["text-summary", "html"],
      thresholds: {
        lines: 85,
        functions: 85,
        statements: 85,
        branches: 84, // 跨平台工具含平台专属分支，单平台无法全覆盖
      },
    },
  },
});
