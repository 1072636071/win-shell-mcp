# batch_run 注册护栏与注解

**Status:** ready-for-agent

**Blocked by:** 01, 02, 03

**构建内容：** `batch_run` 作为正式工具被完整纳入仓库既有契约体系，而非裸 handler。含 outputSchema、annotations 显式声明与护栏测试，防止未来漂移。

**验收标准：**

- [ ] `batch_run` 声明非空 outputSchema（zod），描述 `{ ok, steps, summary }` 结构
- [ ] annotations 显式裁决：`readOnlyHint: false`、`destructiveHint: true`（步骤可含任意破坏性工具）
- [ ] 通过 `guard-mutating.test.ts` 类护栏测试（全部工具含 batch_run 均有 outputSchema 与 readOnlyHint）
- [ ] `listTools` 输出包含 `batch_run` 的 inputSchema/outputSchema/annotations
- [ ] batch_run 内嵌调用步骤时，步骤工具的 zod 校验照常生效（非法参数返回 EINVAL）
- [ ] 全量测试套件通过（vitest）

## 评论
