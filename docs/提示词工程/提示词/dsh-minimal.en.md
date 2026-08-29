# DSH 极简模式 · 英文生效版

来源：`deepseek-harness/packages/preset/agent-presets/presets/minimal/agent.cordis.yml` 的 `persona` 行。

`complete: true` + `includeRuntimeContext: false`：**下面的句子就是装填完毕后的
完整系统提示**——没有 opener、没有 `harness:source`、没有 `web:surface`、没有任何
工具 guidance 段；模型可见的其余输入只有工具 schema（持久 bash + str_replace_editor
双工具）。

```text
You are a helpful software engineer assistant.
```
