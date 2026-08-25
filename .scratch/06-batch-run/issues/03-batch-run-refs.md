# batch_run 步骤间引用

**Status:** resolved

> 2026-08-25：已实现（插值/保类型/混合拼接/仅已完成步骤），review 修复混合拼接 `replace` 只替换第一处缺陷并补回归单测后闭环。

**Blocked by:** 01

**构建内容：** LLM 可在后续步骤的 args 与 assert 值里引用前面步骤的输出，实现一轮内"先产生、后消费"。引用写法为模板串 `{{stepId.output.path}}`。**类型规则：整个值恰好等于一个引用时保持原类型**（bool/number/object），与其他文本拼接时转字符串。

**验收标准：**

- [ ] args 内字符串值支持 `{{stepId.path}}` 插值（含嵌套路径，如 `{{step1.dest}}`）
- [ ] 整串单引用保持原类型：`{{step1.ok}}` 传入 bool、`{{step1.written}}` 传入 number，不经字符串化
- [ ] 混合拼接转字符串：`"前缀{{step1.dest}}"` → 字符串
- [ ] 仅允许引用已完成步骤：自引用、前向引用、不存在的 stepId/路径均按该步参数解析失败处理（返回语义错误，不抛异常）
- [ ] assert 的 `value` 同样支持引用（如断言 step2 输出等于 step1 输出）
- [ ] 端到端：step1 `fs_write` 写文件，step2 `text_replace` 用 `{{step1.path}}`（或等价输出字段）定位并替换成功

## 评论
