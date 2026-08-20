# git-branch-ops

**Status:** ready-for-agent

**构建内容：** AI 可在仓库内切换/创建分支（`git_checkout`）与暂存/恢复改动（`git_stash`）。

**验收标准：**

- [ ] `callTool("git_checkout", {branch, create?})` 切换或创建分支
- [ ] `callTool("git_stash", {action, message?})` 暂存/恢复/清空
- [ ] 错误场景：未初始化的 git 仓库、无效分支名
- [ ] 测试覆盖 ≥ 仓库阈值（lines/functions/statements ≥ 85%，branches ≥ 84%）

## 评论

（评论与对话历史追加于此，新内容置于最前。）
