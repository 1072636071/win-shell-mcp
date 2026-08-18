# git 工具集

**Status:** ready-for-agent

**Blocked by:** 01

**构建内容：** AI 可完成常用 git 操作——查看状态（分支/暂存/未暂存/未跟踪）、最近提交、分支列表、差异（工作区/暂存区）、暂存文件、提交（不推送）。

**验收标准：**

- [ ] status 返回结构化的分支与变更分类
- [ ] log 返回 `[{hash, author, date, subject}]`，branch 返回分支列表
- [ ] diff 输出截断，add 可指定文件，commit 提交成功
- [ ] 非 git 仓库与 git 命令失败时返回明确错误并附 stderr 摘要

## 评论
