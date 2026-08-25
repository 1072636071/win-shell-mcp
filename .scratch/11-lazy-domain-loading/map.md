# 11-lazy-domain-loading — map

> 工单拆解上下文指针与已做决策。对应 PRD：`.scratch/11-lazy-domain-loading/PRD.md`（来源 07 源点 P1-1）。联动：12-tool-whitelist-env（配置模块 + 白名单）。

## 目标

MCP server 面提供可选的懒加载模式：`ListTools` 只返回 3 个 meta 工具（`tool_groups`、`list_domain_tools`、`batch_run`），AI 先看 15 命令域概览、按需取回目标域明细、照常调用——调用不设门禁，加载只是信息获取。默认关闭、环境变量显式开启，既有客户端零影响；dsh 插件面不受影响。

## 关键决策

- **开关**：`WIN_SHELL_LAZY=1` 启用，缺省/其他值为全量模式；解析收敛在配置模块（02 工单），接口与 12 号对齐（纯函数、入参原始字符串、模块内不读 `process.env`）。
- **域元数据**：`Tool` 接口新增必填 `domain`（15 域枚举之一）；`batch_run` 与两个新 meta 标记 meta 不占名额；全部 59 工具按 CONTEXT.md 归域；registry 注释分组退役/改写为与字段一致。**现状注释把 fs 拆成 `fs_read`/`fs_write` 且与 15 域枚举不一致，需归并到 `fs`**。
- **两个 meta 工具**：`tool_groups`（15 域概览 `{ domain, summary, toolCount, examples }`）、`list_domain_tools(domain)`（该域工具与 `listTools()` 同形的数组）；均带 outputSchema 与 `readOnlyHint: true`。
- **懒模式 ListTools**：返回 `tool_groups`/`list_domain_tools`/`batch_run` 三个条目；全量模式返回集不变。实现为 server 创建时工具列表裁剪（`createServer` 工具表参数注入，无全局态）。
- **调用不设门禁**：`CallTool` 分发针对全部已注册工具（含懒模式下未列出的），不做前置检查——兼容性基石。
- **不发 `listChanged`**：运行期注册集不变，不依赖客户端动态发现；动态重注册列为未来演化。
- **与白名单组合**：白名单（12 号）先过滤工具集，懒模式域概览基于过滤后集合，空域不显示。
- **发布门槛**：真实客户端验证三点（懒连接可用/未列出工具可调/`list_domain_tools` 可被 AI 消费）；若客户端禁止调未列出工具则降级为受限特性并记录降级路径。
- **配置模块创建方协调**：11 与 12 的 PRD 都指向"只存在一个配置模块"。无论谁先落地，不得新建第二个；见 02 工单评论的落地规则。

## 涉及文件

- `src/registry.ts`：`Tool` 接口加 `domain`（01）；59 工具归域（01）；注释分组改写（01）；注册 `tool_groups`/`list_domain_tools`（03）
- `src/tools/`（新文件）`tool_groups.ts`、`list_domain_tools.ts`：两个 meta 工具实现（03）
- `src/config.ts`（新建，与 12 号共用）：配置模块，`WIN_SHELL_LAZY` 解析（02）；12 号并入白名单解析
- `src/server.ts`：`createServer`/`listTools` 的懒模式裁剪（04）；`CallTool` 确认不设门禁（04）；白名单+懒叠加的过滤接入（05）
- `src/plugin.ts`：**不修改**（dsh 面维持全量注册，ADR-0011）
- `tests/tools/guard-mutating.test.ts`（或新 guard 文件）：域字段/15 域覆盖/计数护栏（01）
- `tests/tools/config.test.ts`（新）：`WIN_SHELL_LAZY` 解析纯函数测试（02）
- `tests/tools/meta-tools.test.ts`（新）：`tool_groups`/`list_domain_tools` 行为测试（03）
- `tests/integration/server.test.ts`：懒模式 `listTools`/`callTool` 端到端（04）、白名单+懒叠加（05）；复用其 InMemoryTransport harness
- `CONTEXT.md`：15 域术语表为 `summary`/`toolCount` 文案源（03）；**现状基线"58 个工具"与 registry 实测 59 矛盾，建议同步修正**（01）
- `CHANGELOG.md`：Unreleased ⚠️ 条目（各工单收尾时追加）

## 实施顺序

01（域元数据，地基）→ 02（配置模块 seam）→ 03（meta 工具）→ 04（懒模式 ListTools）→ 06（客户端验证，可在 04 后即启动）→ 05（白名单组合，阻塞于 12）。

依赖：
- 01 阻塞 03、04（meta 工具与懒模式需要 `domain` 字段）。
- 02 独立可先行，但需与 12 协调模块创建方（见评论）。
- 03 阻塞 04（懒模式返回的 3 个 meta 需存在）。
- 04 阻塞 06（验证的是懒模式行为）；06 结论反向可能影响 04（若客户端禁止调未列出工具 → 降级）。
- 05 阻塞于 04 与 12（需白名单先落地）。

## 超出范围

- dsh 插件面不做懒加载（ADR-0011 全量注册维持）。
- 不做运行时 `listChanged` 动态重注册（列为未来演化，降级路径另立工单）。
- 不做比域更细的按需粒度（单工具级加载）。
- 不做 `ListTools` 的 cursor/分页。
- 不新建域概览的独立文档承载（概览即 `tool_groups` 输出）。
- 不实现 `WIN_SHELL_TOOLS` 白名单本身（属 12 号工单）。

## 评论

（对话历史与补充追加于此，新内容置于最前。）
