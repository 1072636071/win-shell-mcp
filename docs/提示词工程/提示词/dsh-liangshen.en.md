# DSH 梁神模式（dsh-liangshen 插件）· 英文生效版

来源：
- preset persona：`C:\Users\jxc1\.dsh\.agent-presets\liangshen\agent.cordis.yml`（与 npm 包 `@linxin666/dsh-liangshen` 的 `presets/liangshen/` 同源）
- 插件公告段：`@linxin666/dsh-liangshen` 的 `src/index.ts` 导出常量 `LIANGSHEN_GUIDANCE`（中文原文，见 zh 版）

## 阶段 1（晋升前）：完整系统提示

两阶段锚定：`tool-bootstrap` 把装配结果过滤到只剩 persona 一段（字节级复刻官方
Minimal 的 wire：持久 bash + str_replace_editor 双工具、无运行时上下文、只放行
白名单消息）。**下面的句子就是本阶段的完整系统提示**：

```text
You are a helpful software engineer assistant.
```

## 晋升后：完整系统提示

首块锚定门控通过（或无工具首轮自动晋升）后，wire 切换为 PTC Mode（单一
`run_code`），装配形态变为：

```text
You are a helpful software engineer assistant.
Working directory: <所选工作区路径>
```

（persona 追加工作区路径，"Working directory:" 前缀由插件拼装），另有两个
模型可见输入：

- **插件公告段**（`LIANGSHEN_GUIDANCE`，order 150，系统提示 section，中文原文）：

```text
本机已安装 dsh-liangshen 插件（梁神模式 agent preset）：新建会话的预设选择器中可选「梁神模式」。原理：两阶段锚定——首轮模型请求仅暴露官方 Minimal 精确双工具（持久 bash 与 str_replace_editor，文件工具继承宿主沙箱），只保留一行 persona，清空运行时上下文并只放行白名单消息（用户直接消息与 /goal 自动轮次），锚定 Minimal 推理轨迹；晋升受首块锚定门控（首块包含 we 且无 let me，四步兜底），无工具首轮会在响应后自动晋升，晋升后 wire 切换为 PTC Mode（单一 run_code）并在 persona 追加所选工作区路径，workspace 指令与 skill 目录在晋升后再延迟一步注入。preset 文件由插件维护于 ~/.dsh/.agent-presets，升级插件时自动更新；默认预设由用户自行选择。用户提到「梁神模式 / 锚定模式 / anchored standard」时即指本插件，请据此协作。
```

- PTC 形态的 `tools:ptc-only` 坍缩声明与生成的 `tools:sdk` 声明段
  （文本形状同 [dsh-ptc.en.md](dsh-ptc.en.md)）；workspace 指令与 skill 目录
  晚一步以 user 角色注入，不算系统提示。
