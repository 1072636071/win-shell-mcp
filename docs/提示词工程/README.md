# 提示词工程

本目录记录 WShell 三模式（标准 / 批量 / 全量）的提示词构成、每条事实的唯一归属地、
目录成本的实测口径，以及把守这些归属的门禁。它是给人看的说明，不是运行时输入。

三模式的**生效英文全文与中文对照**见 [三模式提示词.md](三模式提示词.md)。

## 一条系统提示由什么组成

DSH（DeepSeek Harness）侧的规则，摘自 `@deepseek-ai/dsh-system-prompt`：

1. 系统提示不是常量，是**注册表装配**：各插件用 `ctx.systemPrompt.section()` 贡献
   带 `order` 的片段，按 order 升序以空行拼接。工具用 `ctx.systemPrompt.tools()`
   贡献 schema，变量用 `.variable()` 贡献 `{{名字}}`。
2. persona 是名为 `deployment:persona`、order 0 的普通片段。`@deepseek-ai/dsh-persona`
   行只能挂在 agent scope 里（挂全局会和注册表自带的那一份撞名并 hard-fail），挂进
   preset 就**影子替换**部署级 persona。
3. `complete: true` 是权威开关：装配收尾会把除该段以外的**所有片段丢弃**，所以
   harness 固定 opener、各工具 guidance 段、其他 preset 片段都不再渲染。多个
   complete 片段并存直接抛错。
4. `includeRuntimeContext: false` 清空动态上下文（`ctx.systemPrompt.context()` 那一
   类，DSH 渲染成 user 角色快照而非系统提示）。
5. `{{变量}}` 是严格插值：未知变量名即抛错。插值只作用于片段与上下文，**不作用于
   工具描述**——所以 `batch_run` 描述里的 `{{stepId.output.path}}` 不会被吃掉。
6. agent 的名字/id 不进入提示词；`AgentOptions` 没有 `systemPrompt` 字段。仓库
   `AGENTS.md`（`dsh-agent-instructions`）与运行时上下文一样是 user 角色输入，
   不算系统提示。

三模式都取 1–4 的极简组合：`complete: true` + `includeRuntimeContext: false`，
提示词正文 = persona 那一段；模型可见的其余输入是工具目录。

## 每条事实只有一个归属地

| 事实 | 归属 | 承载位置 | 把守门禁 |
| --- | --- | --- | --- |
| 身份 | persona | `presets/wshell-*/agent.cordis.yml` 的 `text` | `presets.test.ts` |
| 相对路径基准 | persona 陈述 + preset 行决定 | persona 的 `{{cwd}}` + `tool-win-shell.cwd`（`src/config/cwd.ts`） | `presets.test.ts`（注入行）、`config/cwd.test.ts`、`plugin.test.ts` |
| pattern 字面量/正则双模 | `pattern` 参数说明 | `src/utils/pattern.ts` 的 `patternConvention(flags)` | `guard-pattern-convention.test.ts` |
| 多步操作优先一次完成 | `batch_run` 描述 | `src/tools/batch.ts` | `guard-metadata-budget.test.ts`（工单 10 护栏） |
| plan 模式行为边界 | 全量 persona | `presets/wshell-full`（`plan-mode` 的 `section` 为同源死配置） | `presets.test.ts`（同源断言） |
| 委派默认后台并行 | 全量 persona | `presets/wshell-full` | `presets.test.ts` |
| 单个工具怎么用 | 各工具 description + 参数 describe | `src/tools/*` | 150 字符软上限 + 元数据总预算 |
| harness opener、DSH 原生 guidance | 被 `complete: true` 排除在渲染之外 | — | — |

两条容易踩反的取向，写在这里以免被"顺手改回来"：

- **批量规则不住 persona。** 它是跨工具的取舍建议，但 MCP 形态没有 persona，
  两种交付形态共用的只有工具描述；描述里已经有工单 10 护栏钉住，persona 再写就是双写。
- **pattern 约定住在参数说明，不住 persona。** 同一工具内描述与参数说明曾经各写一遍
  且措辞不同，现在由 `patternConvention()` 出一份文本、按 flags 白名单派生，
  白名单变了说明跟着变，不留过期副本。

`{{cwd}}` 与 `tool-win-shell` 的 `cwd` 是同一事实的两面，必须同源于
`DSH_CWD ?? process.cwd()`：只写 persona 就是假话，只注入不陈述就白给一轮 `pwd`。

- **`{{cwd}}` 成立的前提**：DSH 的 `cwd` 变量取的是**会话头**里的 cwd
  （`agent-loop` 注册 `context.agent?.session.header.cwd`），而 preset 注入给
  win-shell 的基准取 `DSH_CWD ?? process.cwd()`。部署若给会话另设 cwd，必须把
  `DSH_CWD` 同步成同一值，否则 persona 这句失真（官方 `standard` preset 的
  `fs-local` 行有完全相同的前提）。
- **对不齐时的回退写法**：把该句换成
  `Relative paths resolve against the working directory reported by pwd.`
  —— 恒为真（`pwd` 与工具共用同一基准），代价是每会话一次 `pwd`，但仍挡住乱猜。

## 目录成本实测口径

按 DSH 实际发给模型的形状（`{name, description, parameters}` 序列化）实测：

| 范围 | 字符 | 构成 |
| --- | --- | --- |
| 58 域工具目录 | 24,716 | description 3,808（15%）+ input schema 17,971（73%）+ 名字/结构开销 |
| 59（放行 `batch_run`） | 25,646 | 同上 + batch_run 930 |
| 61 条全量 MCP 元数据 | 52,836 | 含 outputSchema 与 annotations（模型侧不收 output） |

三点必须纠正的历史口径：

1. **只数描述会低估 4–5 倍。** 旧口径（`docs/dsh/wshell-modes.md` 曾记 5,037 字符）
   完全没算 input schema，而 schema 才是目录成本的大头（73%）。描述继续抠字，
   收益远小于砍参数。
2. **按"3.5 字符/token"统一折算对中英混排不成立。** 描述与参数说明里 CJK 占约
   34%（1,936/5,779），CJK 接近 1 字符/token。58 域目录 24,716 字符按
   CJK/ASCII 分权重重估约 6.5–7.5K token，而不是旧表推算出的 1.4K。
3. 上表是**字符实测**，token 区间是估算。校准办法：发一个只含目录的请求，读
   `usage.prompt_tokens` 回填本表，替代折算常数。

## 已知待办

- token 列按真实 `usage.prompt_tokens` 校准（含 DSH 官方 standard 侧目录）。
- 目录降本的真杠杆在 schema：58 工具共 188 个参数、其中 137 个可选。是否裁剪
  低频可选参数、合并近义工具（`text_grep` / `search_content` 只差一个范围维度）
  属能力面变更，另立工单，不在提示词工程范围内做。
- 若日后去掉 `complete: true`，全量 persona 里那两条 guidance 应交回 DSH 官方
  section 承载，本目录归属表同步重写（见 三模式提示词.md 末节）。

## 改提示词的正确姿势

1. 改权威源 `presets/wshell-*/agent.cordis.yml`（部署副本
   `~/.dsh/.agent-presets/wshell-*` 由 bundle sync 刷新，别手改）。
2. `npm run build && npx vitest run tests/dsh-bundle`，再跑全量测试。
3. 发布 bundle → 升级 → 重启 `dsh web` → **新开会话**验证（进行中的会话不中途切换）。
4. 描述类改动看 `guard-metadata-budget.test.ts`：150 软上限、总预算 52,836、
   豁免清单不留死豁免。
