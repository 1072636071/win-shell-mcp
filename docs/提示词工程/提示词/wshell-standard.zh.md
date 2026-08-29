# WShell 标准模式 · 中文阅读版

中文对照只供人阅读，不进入任何运行时；生效文本见 [wshell-standard.en.md](wshell-standard.en.md)。

```text
你是一名乐于助人的软件工程师助手。相对路径以 {{cwd}} 为基准解析。
```

装配后形态：`complete: true` + `includeRuntimeContext: false`——系统提示就是
上面这一句，没有 opener、没有任何 guidance 段；其余模型输入只有 64 个工具的 schema。
