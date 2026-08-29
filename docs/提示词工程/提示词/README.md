# 提示词文本库

8 个模式的提示词，每个一份英文生效版（`.en.md`）+ 一份中文阅读版（`.zh.md`）。
中文只供人阅读，不进入任何运行时。每个文件同时记录该模式**装填完毕后的完整
系统提示**：standard / cordis 为实测全文与全文骨架，minimal / 梁神阶段 1 /
wshell 三模式即 persona 本身（`complete: true` 裁掉一切），ptc / 梁神晋升后为
骨架 + 独有段原文。装配规则与设计取舍见 [../README.md](../README.md)
与 [../三模式提示词.md](../三模式提示词.md)；装填流水线与各模式装填完毕后的
形态见 [../装配原理与形态.md](../装配原理与形态.md)。

## DeepSeek Harness 官方 4 模式

源码在 `deepseek-harness/packages/preset/agent-presets/presets/<id>/agent.cordis.yml` 的 `persona` 行。
standard / ptc / cordis 未开 `complete: true`，模型还会看到 harness 固定 opener
`You are an AI agent powered by DeepSeek Harness.`；minimal 独占系统提示。

| 模式 | 英文生效版 | 中文阅读版 |
| --- | --- | --- |
| 标准模式 | [dsh-standard.en.md](dsh-standard.en.md) | [dsh-standard.zh.md](dsh-standard.zh.md) |
| PTC 模式 | [dsh-ptc.en.md](dsh-ptc.en.md) | [dsh-ptc.zh.md](dsh-ptc.zh.md) |
| 极简模式 | [dsh-minimal.en.md](dsh-minimal.en.md) | [dsh-minimal.zh.md](dsh-minimal.zh.md) |
| 创造模式 | [dsh-cordis.en.md](dsh-cordis.en.md) | [dsh-cordis.zh.md](dsh-cordis.zh.md) |

## DSH 插件模式

| 模式 | 英文生效版 | 中文阅读版 |
| --- | --- | --- |
| 梁神模式（`@linxin666/dsh-liangshen`） | [dsh-liangshen.en.md](dsh-liangshen.en.md) | [dsh-liangshen.zh.md](dsh-liangshen.zh.md) |

两阶段锚定：晋升前 persona 只有一行（同极简模式），插件另有中文公告段
`LIANGSHEN_GUIDANCE`，两份文件都收录。

## 本项目（win-shell-mcp）3 模式

权威源是 `presets/wshell-*/agent.cordis.yml`；`complete: true`，persona 即全部系统提示。

| 模式 | 英文生效版 | 中文阅读版 |
| --- | --- | --- |
| WShell 标准模式 | [wshell-standard.en.md](wshell-standard.en.md) | [wshell-standard.zh.md](wshell-standard.zh.md) |
| WShell 批量模式 | [wshell-batch.en.md](wshell-batch.en.md) | [wshell-batch.zh.md](wshell-batch.zh.md) |
| WShell 全量模式 | [wshell-full.en.md](wshell-full.en.md) | [wshell-full.zh.md](wshell-full.zh.md) |
