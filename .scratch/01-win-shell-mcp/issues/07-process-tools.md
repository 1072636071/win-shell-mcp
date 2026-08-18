# process 工具集

**Status:** ready-for-agent

**Blocked by:** 01

**构建内容：** AI 可列出运行中的进程（Windows tasklist / unix ps 统一为 `{pid, name}`）并按 PID 终止进程。

**验收标准：**

- [ ] 进程列表可过滤、输出统一结构
- [ ] 按 PID 终止进程成功返回；不存在的 PID 返回明确错误码
- [ ] Windows 与 unix 分支实现均有测试

## 评论
