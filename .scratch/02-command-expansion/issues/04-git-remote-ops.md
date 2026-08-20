# git-remote-ops

**Status:** ready-for-agent

**构建内容：** AI 可推送（`git_push`）、拉取（`git_pull`）、克隆（`git_clone`）仓库。

**验收标准：**

- [ ] `callTool("git_clone", {url, dest})` 克隆仓库到本地
- [ ] `callTool("git_push", {remote, branch})` 推送提交
- [ ] `callTool("git_pull", {remote, branch})` 拉取并合并
- [ ] 错误场景：认证失败、远端不存在、合并冲突
- [ ] 测试覆盖 ≥ 仓库阈值（lines/functions/statements ≥ 85%，branches ≥ 84%）

## 评论

（评论与对话历史追加于此，新内容置于最前。）
