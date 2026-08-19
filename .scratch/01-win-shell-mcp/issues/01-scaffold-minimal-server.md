# 01-项目脚手架与最小 MCP 服务器

**Status:** ready-for-agent

**Blocked by:** 无——可立即开始

**构建内容：** 用户能启动一个 MCP server（stdio），并可通过任意 MCP 客户端接入：完成 initialize 握手，`tools/list` 列出至少 1 个工具并可调用，收到极简 JSON 输出（`{"ok":true,...}` 形式）。同时建立构建（tsup）、类型检查、测试（Vitest）与覆盖率基线的测试缝（client↔server 经 in-memory transport），成为后续所有工单的测试基础；全部命令一键全绿。

**验收标准：**

- [ ] npm 项目初始化完成，TypeScript 构建配置可编译，`npm run build` 产出可执行产物
- [ ] 依赖安装完成（注意 Windows shell 不支持 `&&`，用 `;` 或分步执行）
- [ ] server 能启动并完成 MCP 初始化握手（initialize）
- [ ] 测试缝：MCP Client 经 in-memory transport 连上 server，`tools/list` 列出工具、`tools/call` 调用至少 1 个工具并收到 `{"ok":true,...}` 形式输出
- [ ] `npm run typecheck` 与 `npm test` 全绿，覆盖率阈值生效（Vitest 冒烟测试跑通）

## 评论
