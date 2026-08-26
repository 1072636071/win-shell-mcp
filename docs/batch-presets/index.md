# batch_run 常见预设

`batch_run`（ADR-0015）的常见编排模板。每个预设一个文件，含场景说明 + 可直接粘进 `batch_run` 的 `args` 的入参 JSON + 断言与引用要点 + 适用版本与维护状态。

## 语法基线（09 号工单后）

- **默认极简输出**：`{ allOk, summary }`，失败附 `failedStep` 诊断；`verbose: true` 才返回每步完整 `steps`。预设入参一律以默认形态为基准，不默认带 `verbose`。
- **断言操作符**：严格 10 种——`eq` / `neq` / `gt` / `gte` / `lt` / `lte` / `in` / `re` / `truthy` / `falsy`。不出现枚举外的操作符。
- **引用形式**：仅 `{{stepId.output.path}}`。整串单引用保原类型（bool/number/array/object），混合拼接转字符串。步骤 `id` 全部显式命名。
- **短路**：任一步失败或断言不满足即短路，后续步骤不执行。

## 预设清单

| 名称         | 适用场景                          | 维护状态 | 文件                                                   |
| ------------ | --------------------------------- | -------- | ------------------------------------------------------ |
| 读改写回     | 读文件→定位确认→替换→复读校验     | 当前适用 | [read-modify-write-back.md](read-modify-write-back.md) |
| git 提交推送 | 提交前确认变更集→add→commit→push  | 当前适用 | [git-commit-push.md](git-commit-push.md)               |
| 批量文件采集 | 列目录→逐文件读取，演示引用保类型 | 当前适用 | [batch-file-collect.md](batch-file-collect.md)         |
| 环境自检     | 磁盘+环境变量+系统信息组合快照    | 当前适用 | [env-self-check.md](env-self-check.md)                 |

## 维护约定

`batch_run` 语法或相关工具输出变更的工单，须同批检查本目录是否过时；过时预设改对应文件的维护状态行（标注"已过时"并说明原因）而非悄悄留存。
