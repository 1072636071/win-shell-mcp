# ADR-0014 MCP 标准注解作为工具并发分类的单一事实源

日期：2026-08-25
状态：已接受（memorial 006 内草稿，待确认后同步全局 `docs/adr/`）
关联：ADR-0010 / 0011 / 0012（双入口薄壳）、memorial 006

## 背景

win-shell-mcp 将以原生 Cordis 插件进入 dsh（002 决策）。dsh 对未声明 `isConcurrencySafe(args)` 的工具一律按独占处理（fail-closed），该分类器同时决定原生并行分发与 Code Mode 子调用重叠池的调度——若不加标注，58 个工具在 dsh 侧全量串行，插件化的结构性收益≈0。与此同时，本仓库的通用 MCP 面面向没有这一概念的协议与宿主（Claude/Cursor 等）。

## 决策

核心注册表为每个工具声明 MCP 协议标准 `ToolAnnotations`（`readOnlyHint` 为必填裁决，适用处加 `destructiveHint` / `idempotentHint`），作为唯一标注事实源：

- **MCP 面**：server.ts 原样透传，标准字段对任何符合协议的客户端可见。
- **dsh 插件面**：保守派生——`readOnlyHint === true ⇒ isConcurrencySafe(() => true)`；其余一律独占。参数级例外（如 `git_stash action:'list'`）走插件层小覆盖表，逐例注释论证。
- **防漂移护栏**：单测强制每个注册工具显式声明 annotations，缺失即测试失败，杜绝静默默认。

## 论证（readOnlyHint ⇒ 可并发）

dsh 并发契约要求并发主体不改变父级拥有的状态且竞态可交换。只读工具不产生本地可变状态变更；其 spawn 的短命子进程（git status/log/diff、pkg --version、网络探测）各自独立、结果与提交顺序无关，竞态天然可交换。故「只读」是「并发安全」的充分条件，且推导方向保守：拿不准就 false。

## 被否决的替代方案

1. **核心注册表自定义 `concurrency` 字段**（`'safe' | 'exclusive' | fn`）：表达力最强，但属自造的单宿主词汇，MCP 面零收益，未来其他元数据需求会重复建设。
2. **插件层 name→classifier 映射表**：核心库绝对纯净，但 58 行平行清单与 handler 分离易漂移——新工具忘标则静默降级为独占（安全但无声），且 MCP 面依旧零收益。

## 后果

- 两宿主从一份声明各自受益；新增工具时在定义处顺手声明，护栏测试兜底。
- `readOnlyHint` 一经发布即成为对 MCP 客户端可见的行为契约：事后收紧（true→false）容易，放宽需重新审计——首次盘点必须诚实。
- 派生关系（hint ⇒ 调度行为）对未来读者不直观，本文档即为其解释。
