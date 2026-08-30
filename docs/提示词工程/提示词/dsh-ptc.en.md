# DSH PTC 模式 · 英文生效版

来源：`deepseek-harness/packages/preset/agent-presets/presets/ptc/agent.cordis.yml` 的 `persona` 行（`text: >-`）。
与标准模式 persona 逐字相同；差异在工具呈现方式：原生工具目录坍缩为单一 `run_code`，
其余工具改为 SDK 声明。该 preset 未开 `complete: true`，同样拼 harness 固定 opener。

```text
You are a coding agent powered by the {{model}} model. Your working directory is {{cwd}}.
```

## 装配后的完整系统提示

骨架与 [dsh-standard.en.md](dsh-standard.en.md) 的实测全文相同，仅两处不同：

1. **在 file-reference 段之前**（order 800，`tools:ptc-only`）插入坍缩声明，
   文本来自 `packages/core/tools/src/index.ts:58`：

```text
`run_code` is the only tool you can call directly — a tool call naming any other tool fails. Reach every tool the SDK declares below from inside the program.
```

2. **末尾**（order 5000，`tools:sdk`）追加一段**生成的** SDK 声明：`tools:sdk`
   不是固定文本，而是按当前会话可见工具目录由 `renderToolsSdk` 实时渲染出的
   TypeScript 函数签名清单（每个可用工具一个函数声明），并动态跟随目录变化。
   其内容形状：

```text
// generated; each visible tool becomes a typed function declaration
declare function bash(command: string, ...): BashResult
declare function read(path: string, ...): ReadResult
// ...
```

其余段落（opener、`harness:source`、`web:surface`、persona、`plan:policy`
条件段、file-reference、工具 guidance 带、`ui:deliverable-file-references`）
与标准模式逐字相同，见 [dsh-standard.en.md](dsh-standard.en.md)。
注意：guidance 段仍然渲染（这正是需要 `ptc:only` 的原因——工具已不能直接调，
但它们的说明书还在）；原生工具本身从目录中隐藏，目录里只剩 `run_code`。
