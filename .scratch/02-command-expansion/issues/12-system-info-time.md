# system-info-time

**Status:** ready-for-agent

**构建内容：** AI 可获取当前时间（`system_info` 扩展）。

**验收标准：**

- [ ] `callTool("system_info", {verbose})` 返回字段含当前时间（ISO 8601）
- [ ] 时间字段命名稳定（如 `time`），格式统一为 ISO 8601
- [ ] 测试覆盖 ≥ 仓库阈值（lines/functions/statements ≥ 85%，branches ≥ 84%）

## 评论

（评论与对话历史追加于此，新内容置于最前。）
