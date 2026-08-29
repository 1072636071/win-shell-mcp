# DSH 梁神模式（dsh-liangshen 插件）· 中文阅读版

persona 生效文本见 [dsh-liangshen.en.md](dsh-liangshen.en.md)。

## 阶段 1（晋升前）：完整系统提示

即官方 Minimal 的字节级复刻 wire：只有 persona 一段，双工具（持久 bash +
str_replace_editor），无运行时上下文。

persona（英文原文逐字）：

```text
You are a helpful software engineer assistant.
```

中文对照：

```text
你是一名乐于助人的软件工程师助手。
```

## 晋升后：完整系统提示

persona 追加工作区路径（`Working directory: <路径>`），并加两个模型可见输入：

1. 插件公告段（`LIANGSHEN_GUIDANCE` 原文，本身即中文，order 150）：

```text
本机已安装 dsh-liangshen 插件（梁神模式 agent preset）：新建会话的预设选择器中可选「梁神模式」。原理：两阶段锚定——首轮模型请求仅暴露官方 Minimal 精确双工具（持久 bash 与 str_replace_editor，文件工具继承宿主沙箱），只保留一行 persona，清空运行时上下文并只放行白名单消息（用户直接消息与 /goal 自动轮次），锚定 Minimal 推理轨迹；晋升受首块锚定门控（首块包含 we 且无 let me，四步兜底），无工具首轮会在响应后自动晋升，晋升后 wire 切换为 PTC Mode（单一 run_code）并在 persona 追加所选工作区路径，workspace 指令与 skill 目录在晋升后再延迟一步注入。preset 文件由插件维护于 ~/.dsh/.agent-presets，升级插件时自动更新；默认预设由用户自行选择。用户提到「梁神模式 / 锚定模式 / anchored standard」时即指本插件，请据此协作。
```

2. PTC 形态的 `tools:ptc-only` 坍缩声明（run_code 是唯一可直接调用的工具）与
   生成的 `tools:sdk` 声明段，文本形状同 [dsh-ptc.zh.md](dsh-ptc.zh.md)。
   workspace 指令与 skill 目录晚一步以 user 角色注入，不算系统提示。
