# shell-and-process-enhancements

**Status:** ready-for-agent

**构建内容：** AI 可选 PowerShell/喂 stdin、看进程命令行、杀进程树、过滤环境变量。

**验收标准：**

- [ ] `callTool("shell_exec", {command, shell: "powershell"})` 在 PowerShell 下执行
- [ ] `callTool("shell_exec", {command, stdin})` 向命令喂 stdin 数据
- [ ] `callTool("process_list", {verbose})` 返回含 cmdline 的进程列表
- [ ] `callTool("process_list", {filter})` 大小写不敏感过滤进程名
- [ ] `callTool("process_kill", {pid, tree})` 终止进程树（Windows /T，unix 进程组）
- [ ] `callTool("env_get", {filter})` 支持过滤与截断，对齐极简输出原则
- [ ] 测试覆盖 ≥ 仓库阈值（lines/functions/statements ≥ 85%，branches ≥ 84%）

## 评论

（评论与对话历史追加于此，新内容置于最前。）
