# DSH PTC 模式 · 中文阅读版

中文对照只供人阅读，不进入任何运行时；生效文本见 [dsh-ptc.en.md](dsh-ptc.en.md)。

persona：

```text
你是由 {{model}} 模型驱动的编码 agent。你的工作目录是 {{cwd}}。
```

## 装配后的完整系统提示（段落清单）

与标准模式的完整装配（见 [dsh-standard.zh.md](dsh-standard.zh.md) 的段落表）
相同的底座、persona、guidance 带与条件段，仅两处不同：

1. order 800 插入 `tools:ptc-only` 坍缩声明：

```text
run_code 是你唯一能直接调用的工具——点名任何其他工具的调用都会失败。
SDK 在下文声明的所有工具，都要在程序内部使用。
```

2. 末尾 order 5000 追加 `tools:sdk`：**生成段**，按当前会话可见工具目录实时渲染出
   TypeScript 函数签名清单（每个可用工具一个声明），不是固定文本。

原生工具从目录里隐藏，工具目录只剩 `run_code`；但各工具的 guidance 段仍照常渲染，
`ptc:only` 的职责就是在这些说明书之前声明"它们只能经程序内部使用"。
