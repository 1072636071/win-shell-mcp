# 修复 callTool 别名解析：复用 findTool 消除双实现

**Status:** ready-for-agent

**Blocked by:** 无——可立即开始

**构建内容：** AI 通过 MCP `tools/call` 调用工具时，从此可以直接用别名（如 `ls`、`cat`、`jq`）发起调用并成功执行，不再收到 `Unknown tool: ls`。此前别名只在 `batch_run` 内部步骤（`findTool`）生效，MCP `CallTool` 按正名精确匹配，导致"文档承诺了别名可用、实际调用却失败"的名不副实现象。修复后 `callTool` 与 `batch_run` 共用同一套别名解析语义，两条路径结果一致。

**验收标准：**

- [ ] `callTool` 的工具查找从正名精确匹配（`tools.find(t => t.name === name)`）改为复用 `findTool`——正名精确优先、失败回退别名匹配，移除双实现
- [ ] 修复后经别名调用到达正名工具：`callTool("ls", {…})`、`callTool("cat", {…})`、`callTool("jq", {…})` 均成功，且结果与正名调用（`fs_list`/`cat`/`json_get`）完全一致
- [ ] 未知名（既非正名也非别名）仍返回 `Unknown tool: <name>` 失败结果，行为不回归
- [ ] `batch_run` 的解析路径不变（本就用 `findTool`），修复后 `callTool` 与 `batch_run` 语义一致，无行为回弹
- [ ] registry 中"别名可用于 tools/call"的注释从虚假声明改为事实陈述，与实现一致
- [ ] `CHANGELOG.md` Unreleased 段 ⚠️ 变更（或 FIX）条目记录该行为修复

**测试 seam：** `callTool()`（既有最高层 seam），先例见 `tests/server.test.ts`。

**评论：**

- 本工单只修行为与注释，不新增别名、不改任何工具输入/输出行为。
- 依赖前置：registry 中既有的 16 组别名（`ls`/`list_directory`→`fs_list` 等）本工单不改，仅验证代表性 3 个（`ls`/`text_cat`/`jq`）。
- 新增别名的调用断言在 02 号工单补齐。
