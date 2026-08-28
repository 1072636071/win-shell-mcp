# 07 · git 域样板收敛

**Status:** done

**Blocked by:** 无——可立即开始

**构建内容：** 11 个 git 工具的 handler 不再重复 getCwd + 执行 + 失败映射三段样板；工作目录解析、执行结果检查与错误文案（含 git 未安装的专属提示）一处定义，handler 只保留参数构造与输出映射。

**验收标准：**

- [ ] 11 个 git handler 全部收敛到共享助手，样板删除
- [ ] 失败文案与现状逐字一致（含 "git 命令未找到" 专属提示与 stderr 摘要截断）
- [ ] git 工具行为回归全绿（status/log/branch/diff/add/commit/checkout/push/pull/clone/stash）
- [ ] 非 git 仓库等失败路径错误码不变（GIT_FAIL/EINVAL）

## 评论

来源：PRD 决策 7（P2）。spec 审查发现 git_log 未收敛（空仓库特殊分支），已通过 `runGitTool` 的失败语义谓词参数收敛——11 个 handler 全部走共享助手，空仓库语义保留。
