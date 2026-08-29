# DSH 极简模式 · 中文阅读版

中文对照只供人阅读，不进入任何运行时；生效文本见 [dsh-minimal.en.md](dsh-minimal.en.md)。

persona（即完整系统提示，无其他任何段落）：

```text
你是一名乐于助人的软件工程师助手。
```

装配后形态：`complete: true` 裁掉 opener 与一切 guidance 段，
`includeRuntimeContext: false` 清空运行时上下文——系统提示只剩上框这一句，
其余模型输入只有双工具（持久 bash + str_replace_editor）的 schema。
