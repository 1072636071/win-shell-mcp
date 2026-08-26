# CHANGELOG ⚠️ Changed（破坏性）条目：batch_run 默认极简输出

**Status:** resolved

**Blocked by:** 01

**构建内容：** 下游升级者在 CHANGELOG 看到 `batch_run` 输出形态变化的破坏性条目，含新旧输出对照与迁移方式（需要每步详情时加 `verbose: true`），据此调整既有提示词与解析逻辑。

**验收标准：**

- [x] Unreleased 段新增 ⚠️ Changed（破坏性）条目，体例对齐既有 `text_replace` 双模变更写法（含语义变化一览表与新旧对照示例）
- [x] 条目给出迁移方式：默认形态不再返回 `steps`；需要每步完整详情时显式传 `verbose: true`
- [x] 说明 `allOk` 聚合字段名不变、失败路径新增 `failedStep` 诊断字段
- [x] 不承担 `batch_run` description 改写（由 08/10 号工单统一负责）；仅在其落地时确认其中提到"默认极简、详情用 verbose"

## 评论

（评论与对话历史追加于此，新内容置于最前。）

**实施记录（2026-08-26）**：

- 条目「`batch_run` 输出默认极简 + 新增 `verbose` 开关」落在 Unreleased 段 text_replace 条目之后，含语义变化一览表、新增输入说明、新旧对照 jsonc 示例与迁移指引。
- Added 段补记 `verbose` 可选参数。
- description 已确认包含"默认极简、详情 verbose"（10 号工单改写文本：「默认{allOk,summary}，失败附failedStep，详情verbose:true」）。
