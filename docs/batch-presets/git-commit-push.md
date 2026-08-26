# 预设：git 提交推送

`git_status`（断言变更集符合预期）→ `git_add` → `git_commit` → `git_push`，每步断言要点给出。把"提交前无意外变更"这类校验前置到 server 侧。

## 场景

**何时用**

- 已完成一组改动，要提交并推送，且想在 `add` 前确认工作区状态符合预期（变更文件数受控、无未跟踪垃圾文件、无意外大改动）。
- 想在一步内串起 status→add→commit→push，避免四轮往返。

**何时不用**

- 变更集需要逐文件审查内容：先 `git_diff` 看差异，本预设不嵌 diff（会撑爆 token）。
- 需要选择性地 `git_add` 部分文件：把 `git_add` 的 `paths` 改成具体清单，但仍建议先 `git_status` 确认。
- 推送可能触发远程拒绝（需先 pull/rebase）：本预设不处理冲突，失败即短路。
- 涉及强制推送：`force: true` 是破坏性操作，务必单独评估，不要照抄预设。
- 步骤间任一失败即短路：`git_push` 失败时 `git_commit` 已落地（本地提交存在），需 AI 自行后续处理。

## `batch_run` 入参

以下示例在当前目录提交全部变更并推送到 `origin` 当前分支，假定变更文件数 ≤ 5 且无未跟踪文件。粘进 `batch_run` 的 `args` 前替换 `cwd` / `message` / 阈值。

```json
{
  "steps": [
    {
      "id": "status",
      "tool": "git_status",
      "args": { "cwd": "." },
      "assert": [
        { "path": "changed", "op": "lte", "value": 5 },
        { "path": "staged", "op": "eq", "value": 0 },
        { "path": "untracked", "op": "eq", "value": 0 }
      ]
    },
    {
      "id": "add",
      "tool": "git_add",
      "args": { "cwd": ".", "paths": ["."] },
      "assert": [{ "path": "added", "op": "truthy" }]
    },
    {
      "id": "commit",
      "tool": "git_commit",
      "args": { "cwd": ".", "message": "feat: update config" },
      "assert": [{ "path": "committed", "op": "eq", "value": true }]
    },
    {
      "id": "push",
      "tool": "git_push",
      "args": { "cwd": "." },
      "assert": [{ "path": "pushed", "op": "eq", "value": true }]
    }
  ]
}
```

## 断言与引用要点

- **`status` 步（git_status）**：默认极简返回 `{ branch, changed, staged, untracked }`（无 `files`，需 `verbose: true` 才附文件清单）。断言逐项：
  - `changed lte 5`：未暂存变更不超过 5 个文件，防止意外大批改动混入提交。
  - `staged eq 0`：提交前期望暂存区为空（由本预设的 `add` 步统一暂存）；若你已手动 `git add` 部分文件，改成期望值或删此断言。
  - `untracked eq 0`：无未跟踪文件，确保新文件都已纳入版本管理或加入 `.gitignore`；若有合理的新文件，改成 `gte` 期望值。
- **`add` 步（git_add）**：`paths: ["."]` 暂存全部变更（含新增/修改/删除）。断言 `added truthy` 确认非空（无变更时 `git add` 仍成功但 `added` 为 `["."]`，故此断言恒真；若要确认确有变更，依赖 `status` 步的 `changed`/`untracked` 断言）。
- **`commit` 步（git_commit）**：`message` 必填。断言 `committed eq true`。`hash` 字段为新提交哈希（未断言，需时可在 `verbose: true` 下取 `{{commit.output.hash}}`）。
- **`push` 步（git_push）**：`remote` 默认 `origin`，`branch` 默认当前分支。断言 `pushed eq true`。失败常见原因：远程有新提交（需先 pull）、无权限、分支不存在。
- **短路语义**：`status` 断言失败即短路，`add`/`commit`/`push` 不执行——这是"提交前闸门"。若 `push` 失败，`commit` 已成功（本地有新提交），需 AI 决定 pull/rebase 或回退。

## 适用版本与维护状态

- 适用：`batch_run` 默认极简输出（09 号工单后）；`git_status` / `git_add` / `git_commit` / `git_push` 当前实现。
- 维护状态：当前适用。`batch_run` 语法或 `git_status` / `git_add` / `git_commit` / `git_push` 输出字段变更的工单须同批检查本预设是否过时；过时则改本状态行而非悄悄留存。
