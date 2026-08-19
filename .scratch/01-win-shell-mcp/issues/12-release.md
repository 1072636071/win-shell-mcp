# 12-集成验证与发布

**Status:** ready-for-agent

**Blocked by:** 02, 03, 04, 05, 06, 07, 08, 09, 10, 11

**构建内容：** 全部命令域工具在 MCP Server 中完成注册并经集成测试验证；CI 在 Windows/Linux/macOS 三平台跑完整测试矩阵；README 指引任意 AI 客户端一键接入（TRAE/Claude Desktop 等）；npm 发布准备就绪。

**验收标准：**

- [ ] 启动后客户端可列出并调用全部工具，集成测试覆盖代表性工具
- [ ] 覆盖率 ≥ 85% 阈值达成；全量测试通过（Vitest 全绿，覆盖所有命令域）
- [ ] GitHub Actions 三平台矩阵全绿
- [ ] README 含安装、启动、客户端配置示例、工具清单（与 PRD 一致）与安全说明（无沙箱全权限）
- [ ] npm 发布配置可用（bin 入口、files 白名单）
- [ ] 所有 ADR 与词汇表术语在实现中得到遵守（抽查）

## 评论
