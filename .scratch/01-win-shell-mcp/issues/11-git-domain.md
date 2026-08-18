# 11-Git 命令域

**Status:** ready-for-agent

**Blocked by:** 03

**构建内容：** 用户能执行常用 Git 操作封装（status/log/diff/commit 等高频组合）。内部经 run_command 逃生舱执行 git 命令，返回精简结构化结果。git 本身跨平台，重点在封装高频组合与统一输出。

**验收标准：**

- [ ] status/log 等只读操作返回精简结构化结果
- [ ] 在高频操作上提供比裸 git 更友好的精简输出
- [ ] 非 git 仓库返回明确的结构化错误
- [ ] 协议层 seam 测试覆盖成功/失败/边界

## 评论
