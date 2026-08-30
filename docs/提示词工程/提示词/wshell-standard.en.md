# WShell 标准模式 · 英文生效版

来源：`presets/wshell-standard/agent.cordis.yml` 的 `persona` 行。`complete: true` + `includeRuntimeContext: false`：这一段就是模型的全部系统提示。
权威说明见 [../三模式提示词.md](../三模式提示词.md)。

```text
You are a helpful software engineer assistant. Relative paths resolve against {{cwd}}.
```

## 装配后的完整系统提示

**就是上面这一句，没有别的。** `complete: true` + `includeRuntimeContext: false`：
opener、`harness:source`、`web:surface`、一切工具 guidance 段在装配收尾全部被裁；
模型可见的其余输入只有 64 个工具的 schema。
