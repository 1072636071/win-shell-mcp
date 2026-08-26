# 预设：环境自检

`system_disk` + `env_get` + `system_info` 组合快照，断言磁盘余量等阈值（`gt` 操作符示范）。

## 场景

**何时用**

- 部署/启动前自检：磁盘余量充足、关键环境变量已设置、运行时版本符合预期。
- 想在一步内拿到磁盘+环境变量+系统信息三合一快照，避免三轮往返。

**何时不用**

- 需要枚举所有盘：`system_disk` 加 `all: true` 返回 `{ disks: [...] }`，结构不同，断言路径要改。
- 需要全部环境变量：`env_get` 省略 `name` 返回 `{ vars, count }`，结构不同。
- 需要 CPU/内存详情：`system_info` 加 `verbose: true` 才返回 `uptime`/`cpus`/`totalmem`/`freemem` 等。
- 涉及外部系统状态：本预设只读取快照，不修改任何状态；但断言阈值依赖运行环境，照抄后务必按目标环境调阈值。

## `batch_run` 入参

以下示例断言：当前盘可用空间 > 1 GiB、`PATH` 环境变量已设置、Node 版本以 `v` 开头。粘进 `batch_run` 的 `args` 前替换 `path` / `name` / 阈值。

```json
{
  "steps": [
    {
      "id": "disk",
      "tool": "system_disk",
      "args": { "path": "." },
      "assert": [{ "path": "free", "op": "gt", "value": 1073741824 }]
    },
    {
      "id": "envPath",
      "tool": "env_get",
      "args": { "name": "PATH" },
      "assert": [{ "path": "value", "op": "truthy" }]
    },
    {
      "id": "sys",
      "tool": "system_info",
      "args": {},
      "assert": [{ "path": "node", "op": "re", "value": "^v" }]
    }
  ]
}
```

## 断言与引用要点

- **`disk` 步（system_disk）**：单盘模式返回 `{ total, free, used, path }`（字节）。断言 `free gt 1073741824`（1 GiB = 2^30 字节）演示 `gt` 操作符——数值比较，要求 actual 与 value 均为 number，否则断言失败并归因"要求数值类型"。
  - 阈值按目标环境调：开发机可宽松（如 1 GiB），生产机宜严格（如 10 GiB）。
  - 若用 `all: true`，输出变 `{ disks: [...] }`，断言路径改为 `disks.0.free` 之类。
- **`envPath` 步（env_get）**：`name` 指定返回 `{ name, value }`，`value` 为 `string | null`（未设置时 null）。断言 `value truthy` 演示 `truthy` 操作符——非空字符串通过，null/空串失败。
  - 若变量在目标环境可能未设置且属正常，改用 `falsy` 或删断言。
  - Windows 下 `PATH` 与 `Path` 大小写：`env_get` 直接读 `process.env[name]`，Node.js 在 Windows 下 `process.env` 大小写不敏感，`"PATH"` 可取到值。
- **`sys` 步（system_info）**：默认极简返回 `{ os, arch, platform, hostname, cwd, node, time }`。断言 `node re "^v"` 演示 `re` 操作符——正则匹配，`value` 为正则模式字符串，`new RegExp(value).test(actual)`。
  - `re` 的 `value` 是正则源串（非 `/…/` 包裹形式），如 `"^v18\\."` 匹配 v18.x。
  - 需要 `totalmem`/`freemem` 等需 `verbose: true`。
- **短路语义**：`disk` 断言失败（磁盘将满）即短路，后续不执行——这正是"部署前闸门"。

## 适用版本与维护状态

- 适用：`batch_run` 默认极简输出（09 号工单后）；`system_disk` / `env_get` / `system_info` 当前实现。
- 维护状态：当前适用。`batch_run` 语法或 `system_disk` / `env_get` / `system_info` 输出字段变更的工单须同批检查本预设是否过时；过时则改本状态行而非悄悄留存。
