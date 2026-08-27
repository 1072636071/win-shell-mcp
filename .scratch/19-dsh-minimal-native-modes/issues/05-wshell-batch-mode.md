# WShell 批量模式

**Status:** ready-for-agent

**Blocked by:** 04

**构建内容：** 在 DSH 模式选择器新增「WShell 批量模式」：目录与 WShell 标准模式一致（65 工具），persona 追加"多步操作优先用 batch_run 一次完成"规则，引导模型将读→改→写、批量改多文件等序列合并为单次 batch_run 调用，减少多轮往返。

**验收标准：**

- [ ] 模式选择器出现「WShell 批量模式」
- [ ] 目录构成与标准模式一致（65 工具）
- [ ] persona 包含批量规则（多步优先 batch_run、单步直接调用工具）
- [ ] 验证场景：多步文件操作会话中模型实际使用 batch_run 合并步骤
- [ ] 测试绿：preset 解析/目录构成/persona 规则断言

## 评论
