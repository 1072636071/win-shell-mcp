# ADR-0017: 装配与投影接缝收敛——deploy 深模块 + 工具条目投影叶子

状态：Accepted

日期：2026-08-26

关联：ADR-0003（极简输出）、ADR-0014（MCP 注解/输出面）、ADR-0016（优先级链）

## 背景

架构审查（`jxx-improve-codebase-architecture`，2026-08-26）发现两处「装配/投影」浅模块化摩擦：

1. **部署与列出工具表的装配语义碎片化。**「分发表」「列出表」的产出规则拆在 `server.ts` 的 `scopeMetaToolsToDeployment` / `resolveDeployedTools` / `resolveListedTools` / `composeLazyDispatchTable` 四个纯函数 + `config/env.ts` 的两个解析函数里，懒 × 白名单组合语义需要跨模块跳读才拼得全景，无单点可测试。
2. **工具→条目的投影双实现。**`server.listTools` 与 `list_domain_tools.projectEntry` 各维护一份逐字段相同的投影（`toJsonSchemaCompat` 转换 + outputSchema/annotations 条件透传）。该双实现是历史性的断环措施——`list_domain_tools` 为避 `registry → 本模块 → server → registry` 回环而本地重写；同形性靠 `meta-tools.test` 的深度相等断言钉住，漂移靠测试兜底（无局部性）。

## 决策

1. **硬化「部署工具表」装配接缝**——新增深模块 `src/deploy.ts`，吞进部署裁剪、懒 × 白名单组合（三件套豁免）、列出面投影，对外只暴露两个接口：
   - `assembleDeployment({ rawWhitelist, lazy }) → { dispatchTable, listedTools }`：单入口，一次产出双表，组合语义集中一处；
   - `scopeMetaToolsToDeployment(tools)`：把工具表里的 meta 三件套替换为口径限于该表的受限副本，`createServer` 注入部署子表时复用。
   - `server.ts` 退化为纯 MCP 壳，`startStdioServer` 改为调用 `assembleDeployment`；`createServer` 仍消费 `scopeMetaToolsToDeployment`。

2. **收敛「工具→条目」投影**——新增零业务依赖的叶子模块 `src/project.ts`，提供唯一投影 `projectToolEntry(tool)`；`server.listTools` 与 `list_domain_tools` 共用它，删除本地 `projectEntry` 重写。断环关键：投影是叶子，两个调用点经它共用实现、彼此不互相依赖，`registry → … → server → registry` 回环被切断。同形性由共享实现天然保证。

3. **截断阈值归位**（顺带收编）——运行期截断状态移入 config 锥体 `src/config/truncate.ts`，`contract/output.ts` 纯化（`ok/fail/withVerbose` 零隐藏可变状态），`truncate` 调用期经 `getTruncateLimit` 读取策略，常量 re-export 保持公共面零破坏。

## 理由（权衡）

- **局部性**：装配规则与投影实现各集中一个模块，改动收敛；投影的漂移 bug 不再需要测试兜底（「删钉死测试」——原深度相等断言退化为对端到端契约的有效校验，非防漂移护栏）。
- **杠杆**：`assembleDeployment` 一个接口喂给 stdio 入口，测试命中一个接缝即可覆盖组合语义。
- **断环不改依赖方向**：投影叶子与配置锥体都是入边叶子，调用点共享它们，不引入新回环。

## 后果

- 新增 `src/deploy.ts`、`src/project.ts`、`src/config/truncate.ts`；`server.ts` 收敛为 MCP 壳。
- 测试 import 相应调整：`resolveDeployedTools` / `resolveListedTools` / `composeLazyDispatchTable` 由部署测试/集成测试改从 `deploy` 导入。
- `contract/output.ts` 对外仍 re-export `DEFAULT_TRUNCATE_LIMIT` 与 get/set/reset，prepublish 与既有消费方零破坏（0.x 纠错窗口内属纯重构，不触 ADR-0007 红线）。
- 行为逐字节不变：白名单/懒/组合语义、工具列表投影、截断默认 2000 均保持。

## 替代方案

- **保持双投影 + 深度相等测试钉住**：维持现状成本低但无局部性，漂移靠测试兜底，被否决（本次即深化的对象）。
- **把装配各步骤留在 `server.ts` 仅新增一个调度函数**：拼图仍然跨模块，未消除「概念拆在多处」的摩擦，被否决。
- **把截断阈值线程化穿透各工具调用点（`truncate(maxLen)` 显式传参）**：会扩大接口面、拉浅调用点，风险反升，被否决（改归 config 锥体）。