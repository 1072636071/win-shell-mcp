# batch_run 断言引擎

**Status:** ready-for-agent

**Blocked by:** 01

**构建内容：** LLM 可在 `batch_run` 每步附 `assert`，由 server 侧确定性校验，无需 LLM 再跑一轮确认。断言为纯数据（无 eval）：`assert: [{ path, op, value? }]`，`op ∈ eq|neq|gt|gte|lt|lte|in|re|truthy|falsy`；`path` 为点路径，访问该步 OK 结果展开后的顶层字段（如 `replaced`、`removed`）。省略 assert = 只要求该步成功。

**验收标准：**

- [ ] 九种操作符全部实现且行为正确（含 `in` 集合成员、`re` 正则匹配、`truthy/falsy` 布尔判定）
- [ ] 断言不满足时该步 `ok:false`，附逐条失败归因（哪条 path/op/期望值/实际值）
- [ ] 短路：断言失败立即中止，后续步骤不执行，返回仅含已执行步骤
- [ ] `path` 不存在或类型不匹配按断言失败处理（不抛异常）
- [ ] 端到端：`text_replace` 后断言 `replaced == 1`，通过/失败两种路径均正确

## 评论
