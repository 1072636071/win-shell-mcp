# net-listen

**Status:** ready-for-agent

**构建内容：** AI 可排查本机端口占用（`net_listen`）。

**验收标准：**

- [ ] `callTool("net_listen", {})` 返回本机监听端口列表及占用进程信息
- [ ] 返回字段至少含：port、protocol、pid、name
- [ ] 错误场景：权限不足（某些端口需管理员）
- [ ] 测试覆盖 ≥ 仓库阈值（lines/functions/statements ≥ 85%，branches ≥ 84%）

## 评论

（评论与对话历史追加于此，新内容置于最前。）
