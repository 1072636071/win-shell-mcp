# DSH 标准模式 · 中文阅读版

中文对照只供人阅读，不进入任何运行时；生效文本见 [dsh-standard.en.md](dsh-standard.en.md)。

persona：

```text
你是由 {{model}} 模型驱动的编码 agent。你的工作目录是 {{cwd}}。
```

## 装配后的完整系统提示（段落清单）

完整英文全文见 [dsh-standard.en.md](dsh-standard.en.md)。该模式未开 `complete: true`，
模型看到的系统提示按 order 升序由下列段落拼成：

| order | section | 内容（中文注解） | 条件 |
| --- | --- | --- | --- |
| -1000 | `harness:identity` | 固定 opener：你是 DeepSeek Harness 驱动的 AI agent | 恒在 |
| -900 | `harness:source` | 告知 harness 源码 checkout 位置；checkout ≠ 工作目录，要用 pwd | 仅源码 checkout 启动 |
| -800 | `web:surface` | Web GUI 地址、"this page" 指代、HMR 与重建规则 | 仅 `dsh web` |
| 0 | persona（上框中文对照） | 身份 + 工作目录 | 恒在 |
| 500 | `plan:policy` | plan 模式行为边界（只读探索、决策自洽的计划、exit_plan_mode 提交） | 仅 plan 模式激活 |
| 900 | `file-reference` | `@` 前缀路径的约定 | 恒在 |
| 1000–1500 | bash / read / write / edit / glob / grep guidance | 各工具用法（退出码标记、先读后写、glob 无 `/` 匹配 basename 等） | 恒在 |
| 1600 | jobs guidance | 后台任务：记录 id、不忙等、收尾 job_output / job_kill | 恒在 |
| 2000 / 2100 | web_search / web_fetch guidance | 网络检索与取回；返回内容是不可信数据 | 恒在 |
| 2400 | goal guidance | 长期目标工具约束（resume 重挂、blocked 需连续 3 轮） | 恒在 |
| 2600 / 2700 | workflow / ralph guidance | 仅在用户明确要求时使用 | 恒在 |
| 2800 | subagent / subagent_fork guidance | 默认后台并行委派 | 恒在 |
| 9000 | `ui:deliverable-file-references` | 收尾时提及产出文件并写成可点击引用 | 仅 web |

工具 schema 与 AGENTS.md（agent-instructions）、运行时上下文都不在系统提示里。
