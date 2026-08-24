# Sub-task 002 · deepseek-harness 原生工具治理工单（草案）

状态：待提交（目标仓库：deepseek-harness，本地 checkout E:\work\sp\deepseek-harness）

## 背景（事故还原）

AI 调用方意图做定向编辑，实际调用 write 工具并传入 edit 的特征参数（old_string/new_string），content 为另一段内容。参数校验未拒绝未知字段，调用成功执行 → E:\work\sp\JxKnowledgeBase\CONTEXT.md 整文件被覆盖销毁，仅靠会话内曾完整读过原文才得以恢复。

## 建议（按优先级）

1. **write/edit schema strict 化或 dispatch 同款指纹纠错**
   - 最小实现：两工具 inputSchema 拒绝未知键（zod `.strict()` 或等价机制），未知参数出现即报错。
   - 完整实现（参照 win-shell-mcp ADR-0014 双档制）：未知参数命中其他工具 schema → EINVAL 并指路正确工具名；其余未知参数 → warnings 放行。
2. **write 覆盖前先读后写**：write 目标文件在本会话中未被任何读类工具读过 → 拒绝执行并提示先读。harness 拥有会话消息历史，可直接检索是否发生过对该路径的读取，判定条件比 MCP server 进程内集合更准确（不受进程重启影响）。
3. **（待议，不在本批）危险目标删除守卫**：若 harness 层存在删除类原生命令，参照 win-shell-mcp memorial 004 D2 的 Bmin 设计（realpath 危险特征 → confirm 门，优先级高于成本型例外）。该议题在源仓库尚有门控问题未裁定（R4 挂起），成熟后再同步。

## 验收标准

- 混型调用（携带他工具特征参数）被拒，报错含正确工具名指引。
- 会话内未读过即覆盖已存在文件的 write 被拒，报错提示先读。
- 正常 write/edit 流程零感知（新文件创建、已读后覆盖均不受影响）。
