# 17-dev-experience-tokens — map

> 工单拆解上下文指针与已做决策。对应 PRD：`.scratch/17-dev-experience-tokens/PRD.md`（来源 07 源点 P3-1，开发会话 token 降噪）。

## 裁决依据

ADR-0016（四层优先级链）：本工单三项改动均落链第 2/3 项（请求与输出 token 最少），且不损害链第 1 项（轮速/请求不变）——产品行为零变化、关键失败信息不丢失是硬约束。

## 目标

优化"AI 开发本项目"的 token 消耗，产品行为零变化。三个浪费点：反复手写一次性分析脚本、vitest 失败/覆盖率输出噪音大、CHANGELOG 维护依赖全量 diff 回顾。对应三项轻量改动：沉淀首批分析脚本、调整 vitest 输出形态、写明文 CHANGELOG 约定。

## 关键决策

- **三项改动均为开发设施与流程，不碰 `src/`、不改测试断言、不改覆盖率门槛（边界）**——"全量 `npm test` 保持绿"即最强验收；不新增入库测试文件（避免为"测试测试配置"引入维护负担，参见 `tests/build.test.ts` 先例）。
- **脚本沉淀遵循 AGENTS.md `.temp/` 约定**：放 `.temp/scripts/`（临时但可复用），头部注释写用途/运行方式/输出说明。元数据脚本读 `listTools()` 投影（`src/server.ts:40-66` 返回 `{ name, description, inputSchema, outputSchema?, annotations? }`）；覆盖率脚本解析 `coverage/` 的 v8 产物，门槛与 `vitest.config.ts` 一致（lines 85 / branches 84）。冒烟产物入 `.temp/output|logs/` 分类目录，不入测试管线。本工单只保证首批两个脚本落地。
- **覆盖率 reporter 改 `["text-summary", "html"]`**（现为 `["text", "html"]`，`vitest.config.ts:12`）：终端只留总表，逐文件明细看 `coverage/index.html`。阈值与 include 不变。**可观测性取舍**（ADR-0016 链 3）：逐文件明细从终端移入 html；`text-summary` 下阈值未达标仍会列出不足文件与指标，关键失败信息不丢失。改后实测记录（总表 + html 明细都在、门槛失败仍列不足文件）入 issue 02 评论区。
- **测试 reporter 以实测对比定夺**：在真实失败场景对比 default 与内置精简型（以实施时 vitest 版本实际提供选项为准），比较输出行数 + 关键断言信息完整度；选"保留断言差异、去装饰"的款并在配置注释理由；若无更优则保持 default 并记录实测结论，不为改动而改动。结论入评论区。
- **CHANGELOG 约定写成 README 开发章节明文**：条目从 `git log`（自上个版本起）commit message 汇总、按 Added/Changed/Fixed 分类、补 ADR 交叉引用、不读全量 diff；配套要求 commit message 自带主题与引用（现有风格已满足，固化现状）。不做自动生成脚本。

## 涉及文件

- `.temp/scripts/`（新增两个分析脚本；该目录已有 `debug-batch.js`、`measure-baseline.mjs`，约定已确立）
- `vitest.config.ts`：`coverage.reporter`（12 行，`["text","html"]` → `["text-summary","html"]`）；按实测结论可能加测试 reporter 配置与注释
- `README.md`：开发章节（约 252-277 行）追加 CHANGELOG 维护流程约定
- 变更本身不触 `src/`；CHANGELOG 不要求改条目（约定写入 README 即可）

## 实施顺序

01（脚本沉淀）→ 02（vitest 输出降噪）→ 03（CHANGELOG 约定）。三者垂直独立、互不阻塞，可并行实施；02 的覆盖率 reporter 改动需在改后全量跑一次 `npm test` 与 `npm run coverage` 验证数值与门槛判定不变。

## 超出范围

- 不引入 CI（仓库现状无 CI，漂移防线保持在本地测试）
- 不做 CHANGELOG 自动生成脚本（约定先于工具；真出现重复劳动再另立工单）
- 不沉淀首批两个之外的脚本（避免 `.temp/` 一次变垃圾场，按需积累）
- 不改覆盖率门槛与 include 范围
- 不升格脚本入 `docs/` 或工具链（若某脚本被证明高频再用，后续工单讨论）

## 评论

（对话历史与补充追加于此，新内容置于最前。）
