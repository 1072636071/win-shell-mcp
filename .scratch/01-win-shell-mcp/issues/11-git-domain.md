# 11-Git 命令域

**Status:** ready-for-agent

**Blocked by:** 03

**构建内容：** 用户能执行常用 Git 操作封装：`status`（分支/暂存/未暂存/未跟踪）、`log`（最近提交）、`branch`（分支列表）、`diff`（工作区/暂存区）、`add`（暂存指定文件）、`commit`（提交，不推送）。内部经 run_command 逃生舱执行 git 命令，返回精简结构化结果。git 本身跨平台，重点在封装高频组合与统一输出。

**验收标准：**

- [ ] status 返回结构化的分支与变更分类
- [ ] log 返回 `[{hash, author, date, subject}]`，branch 返回分支列表
- [ ] diff 输出截断，add 可指定文件，commit 提交成功
- [ ] 非 git 仓库返回明确的结构化错误，git 命令失败附 stderr 摘要
- [ ] 协议层 seam 测试覆盖成功/失败/边界

## 评论
