# 项目脚手架与最小 MCP 服务器

**Status:** ready-for-agent

**Blocked by:** 无——可立即开始

**构建内容：** 用户执行启动命令后，一个 stdio MCP Server 可被任何 AI 客户端接入；客户端能列出至少 1 个工具并调用它，收到极简 JSON 输出。同时建立构建（tsup）、类型检查、测试（vitest）与覆盖率基线，全部命令一键全绿。

**验收标准：**

- [ ] 包可 `npm install` 并 `npm run build` 产出可执行产物
- [ ] 启动后 MCP 客户端可连接、列出工具、调用至少 1 个工具并收到 `{"ok":true,...}` 形式输出
- [ ] `npm run typecheck` 与 `npm test` 全绿，覆盖率阈值生效
- [ ] 输出契约（极简 + verbose 开关）与编码/路径工具已建立并有单测

## 评论
