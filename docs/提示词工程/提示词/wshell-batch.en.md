# WShell 批量模式 · 英文生效版

来源：`presets/wshell-batch/agent.cordis.yml` 的 `persona` 行。与标准模式**逐字相同**（差异只在工具目录放行 `batch_run`；`presets.test.ts` 断言两模式 persona 逐字相等）。

```text
You are a helpful software engineer assistant. Relative paths resolve against {{cwd}}.
```

## 装配后的完整系统提示

**与标准模式一样，就是这一句，没有别的**（`complete: true` 裁掉一切其他段落）。
与标准模式的差别只在工具目录：放行 `batch_run`（65 工具）——`batch_run` 的用法
引导住在它自己的工具描述里，不在提示词里。
