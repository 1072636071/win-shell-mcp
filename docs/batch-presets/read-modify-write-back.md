# 预设：读改写回

读文件 → `text_grep` 定位确认 → `text_replace` 替换 → 复读校验。最常见的"改一处配置/代码"形态。

## 场景

**何时用**

- 已知目标文件，要把其中某段文本替换成新值，并想在一步内完成"读→确认命中→替换→校验"全链。
- 替换前想先确认命中数量（避免 0 命中或意外多命中）。
- 替换后想复读确认结果（旧值已消失/新值已就位）。

**何时不用**

- 替换范围跨多文件：用 `search_content` 先定位文件，再逐文件替换，或拆成多个 batch。
- 替换条件依赖运行时动态计算：`batch_run` 不支持循环/条件分支，需 AI 自行编排。
- 只读不改：直接用 `cat` / `fs_read`，不必走 batch。
- 步骤间任一失败即短路：若想"尽力而为、忽略单步失败"，不要用本预设（`batch_run` 语义是短路）。

## `batch_run` 入参

以下示例把 `config.json` 里的字面量 `"old-name"` 替换为 `"new-name"`，假定恰好 1 处命中。粘进 `batch_run` 的 `args` 前替换 `path` / `pattern` / `replacement` 三处占位。

```json
{
  "steps": [
    {
      "id": "read",
      "tool": "cat",
      "args": { "path": "config.json" }
    },
    {
      "id": "locate",
      "tool": "text_grep",
      "args": { "path": "config.json", "pattern": "\"old-name\"" },
      "assert": [{ "path": "count", "op": "eq", "value": 1 }]
    },
    {
      "id": "replace",
      "tool": "text_replace",
      "args": {
        "path": "config.json",
        "pattern": "\"old-name\"",
        "replacement": "\"new-name\"",
        "write": true
      },
      "assert": [
        { "path": "replaced", "op": "eq", "value": 1 },
        { "path": "written", "op": "eq", "value": true }
      ]
    },
    {
      "id": "verify",
      "tool": "text_grep",
      "args": { "path": "config.json", "pattern": "\"new-name\"" },
      "assert": [{ "path": "count", "op": "eq", "value": 1 }]
    }
  ]
}
```

## 断言与引用要点

- **`read` 步（cat）**：先读一次建立基线，未断言。`cat` 返回 `{ content, lines, truncated }`；若文件可能超 2000 字符且需全文核验，加 `assert: [{ path: "truncated", op: "eq", value: false }]` 防止截断误导。
- **`locate` 步（text_grep）**：`pattern` 默认字面量子串（反斜杠免转义），此处匹配 `"old-name"` 含引号字面量。断言 `count eq 1` 确保恰好 1 处命中——这是后续 `text_replace` 1 命中自动替换的前提；若期望多处，改成期望值并给 `text_replace` 加 `all: true`。
- **`replace` 步（text_replace）**：1 命中时无需 `all` / `maxReplace` 即自动替换；多命中须显式 `all: true` 或 `maxReplace: N`，否则工具拒绝执行（防止哑错误）。`write: true` 原地写回（沿用源编码）。断言 `replaced eq 1` 确认替换计数符合预期，`written eq true` 确认落盘。
- **`verify` 步（text_grep）**：复读新值确认就位，断言 `count eq 1`。若想同时确认旧值已消失，再加一个 `text_grep` 步搜 `"old-name"` 断言 `count eq 0`。
- **短路语义**：`locate` 断言失败（命中数不符）即短路，`replace` 不执行——这正是"提交前确认变更集符合预期"的前置闸门。

## 适用版本与维护状态

- 适用：`batch_run` 默认极简输出（09 号工单后）；`cat` / `text_grep` / `text_replace` 当前实现。
- 维护状态：当前适用。`batch_run` 语法或 `cat` / `text_grep` / `text_replace` 输出字段变更的工单须同批检查本预设是否过时；过时则改本状态行而非悄悄留存。
