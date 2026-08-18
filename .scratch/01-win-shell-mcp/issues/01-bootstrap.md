# 01-项目骨架与空 MCP server

**Status:** ready-for-agent

**Blocked by:** 无——可立即开始

**构建内容：** 用户能启动一个 MCP server（stdio），并通过内存传输的 MCP 客户端连接它，`tools/list` 返回空工具列表。协议层测试缝（client↔server）就位，成为后续所有工单的测试基础。

**验收标准：**

- [ ] npm 项目初始化完成，TypeScript 构建配置可编译
- [ ] 依赖安装完成（注意 Windows shell 不支持 `&&`，用 `;` 或分步执行）
- [ ] server 能启动并完成 MCP 初始化握手（initialize）
- [ ] 测试缝：MCP Client 经 in-memory transport 连上 server，`tools/list` 返回空列表
- [ ] 测试命令可运行（Vitest 跑通一条冒烟测试）

## 评论
