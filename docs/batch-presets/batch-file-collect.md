# 预设：批量文件采集

`fs_list`（glob 过滤）→ 逐文件 `fs_read`，演示 `{{stepId.output.path}}` 整串单引用保类型的引用写法。

## 场景

**何时用**

- 要读取当前工作目录下符合条件的一组文件内容（如采集所有 `.json` 配置、所有 `.md` 文档）。
- 文件清单由 `fs_list` 动态产出，后续读取路径经引用喂给 `fs_read`，避免 AI 自己拼路径。
- 文件数量已知且较少（`batch_run` 不支持循环，逐文件展开为独立步骤）。

**何时不用**

- 文件数量未知或很多：`batch_run` 无循环，无法动态展开 N 步。改用 `search_content` 跨文件搜内容，或 AI 分批编排。
- 只需文件清单不需内容：直接 `fs_list`，不必走 batch。
- 需要文件元信息（type/size/mtime）：`fs_list` 加 `verbose: true`，引用 `entries` 为对象数组。
- 采集子目录且要保留整串单引用：把 `fs_list` 的 `path` 设为该子目录时，`entries` 是相对该目录的路径，`fs_read` 需拼接目录前缀（混合拼接，转字符串）；若想保持整串单引用，改用 `path: "."` + `glob: "子目录/*.json"` + `recursive: true`，`entries` 即为相对 cwd 的完整路径。
- 步骤间任一失败即短路：若某文件读取失败要跳过继续，不要用本预设。

## `batch_run` 入参

以下示例列出当前目录下所有 `.json` 文件并逐个读取，假定恰好 2 个文件。粘进 `batch_run` 的 `args` 前替换 `glob` / 步骤数。

```json
{
  "steps": [
    {
      "id": "list",
      "tool": "fs_list",
      "args": { "path": ".", "glob": "*.json" },
      "assert": [{ "path": "entries", "op": "truthy" }]
    },
    {
      "id": "read0",
      "tool": "fs_read",
      "args": { "path": "{{list.output.entries.0}}" },
      "assert": [{ "path": "lines", "op": "gte", "value": 1 }]
    },
    {
      "id": "read1",
      "tool": "fs_read",
      "args": { "path": "{{list.output.entries.1}}" },
      "assert": [{ "path": "lines", "op": "gte", "value": 1 }]
    },
    {
      "id": "checkCount",
      "tool": "fs_list",
      "args": { "path": ".", "glob": "*.json" },
      "assert": [{ "path": "entries", "op": "truthy" }]
    }
  ]
}
```

## 断言与引用要点

- **`list` 步（fs_list）**：默认极简返回 `{ entries: string[] }`（相对 `path` 的路径数组，按名字升序）。`path: "."` 时 `entries` 即相对 cwd 的路径，可直接喂给 `fs_read`。`glob: "*.json"` 过滤文件名。断言 `entries truthy` 确认非空。若需确数，用 `entries.length` 路径断言（`getPath` 支持 `array.length`）：`{ "path": "entries.length", "op": "eq", "value": 2 }`。
- **`read0` / `read1` 步（fs_read）**：`path` 用 **整串单引用** `{{list.output.entries.0}}` / `{{list.output.entries.1}}`。
  - **保类型要点**：整个字符串恰好等于一个 `{{…}}` 时，引用解析保留原类型——此处 `entries.0` 是 string，解析后 `path` 仍是 string，`fs_read` 的 `path` schema 校验通过。
  - **反例（勿写）**：`"prefix-{{list.output.entries.0}}"` 是混合拼接，引用部分转字符串拼接，最终 `path` 为 `"prefix-<文件名>"`，通常非你所需。
  - **number 保类型**：若某工具参数期望 number（如 `text_grep` 的 `maxResults`），整串单引用一个 number 字段（如 `{{list.output.entries.length}}`）会保 number 类型；混合拼接则转字符串导致 schema 拒绝。
  - **array 保类型**：整串单引用一个数组字段（如 `{{list.output.entries}}`）保 array 类型，可喂给期望数组的参数（如 `git_add` 的 `paths`）。
- **`checkCount` 步**：复读 `fs_list` 确认清单稳定（演示同工具多次调用；可在此断言 `entries.length` 与预期一致）。
- **短路语义**：`list` 失败（目录不存在）即短路；`read0` 引用 `entries.0` 不存在（空数组）即短路并归因"引用了不存在的路径"。

## 适用版本与维护状态

- 适用：`batch_run` 默认极简输出（09 号工单后）；`fs_list` / `fs_read` 当前实现。
- 维护状态：当前适用。`batch_run` 语法或 `fs_list` / `fs_read` 输出字段变更的工单须同批检查本预设是否过时；过时则改本状态行而非悄悄留存。
