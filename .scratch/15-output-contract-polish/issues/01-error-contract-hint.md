# 错误契约增加可选 hint 字段（克制清单首轮应用）

**Status:** ready-for-agent

**Blocked by:** 无——可立即开始

**构建内容：** 当一次工具调用失败且确实有可操作信息可给时，AI 会在失败结果里收到一句短提示（`hint`）指明下一步动作——例如参数互斥越界时给出合法组合、调用被白名单裁掉的工具时说明如何查看当前暴露范围。没有真实增量信息时 `hint` 字段整体不出现，错误体量与现状完全一致。

**验收标准：**

- [ ] 错误契约的失败形态扩展为 `{ ok: false, error: { code, message, hint? } }`，`hint` 为可选字段；不带 `hint` 时输出与现状逐字节一致（既有用例不破坏即为回归）
- [ ] 契约构造函数增加可选第三参数（`fail(code, message, hint?)`）；不传时构造结果与现状逐字节一致
- [ ] `hint` 生成标准写成明确规则并落地为可复用判定：(a) 仅当存在当前错误专属的可操作信息（合法范围、期望格式、冲突位置）；(b) 不重复 message 已含内容；(c) 不教通用常识；(d) 长度 ≤ 50 字符；(e) 无规则触发则字段整体缺省，不出现空串占位
- [ ] 超长 `hint`（>50 字符）在构造层有确定行为（截断或报错，实施时二选一），测试钉死所选行为
- [ ] 首批应用点按克制清单落地：
  - 参数越界类 `EINVAL`（行/字节范围互斥规则违反）：`hint` 给出合法组合
  - 调用被白名单裁掉的工具（12 号工单的错误区分）：`hint` 说明如何查看当前暴露范围
- [ ] 其余错误码（`ENOENT`/`GIT_FAIL` 等）默认不加 `hint`——路径不存在时 AI 自己知道下一步，加了就是噪音
- [ ] 白名单错误的 `hint` 用例与 12 号工单用例合并维护，不产生两处重复测试
- [ ] 契约层测试：带 `hint` 的失败形态正确；不带时与现状逐字节一致；`hint` 超长行为被钉死；测试只锁"存在性 + 长度 + 缺省行为"，不锁具体措辞

## 评论

### 实施记录（2026-08-26）

**改动文件**：

- `src/contract/output.ts`：`ToolError` 增加 `hint?: string`；新增 `HINT_MAX_LENGTH = 50` 常量；`fail(code, message, hint?)` 增加可选第三参数，不传或空串时 error 不含 hint 字段（逐字节一致），超长截断到 50 字符。
- `src/server.ts`：白名单裁剪错误（`callTool`）附 hint `"调 tool_groups 查看当前暴露工具"`。
- `src/tools/git.ts`：`git_checkout` 三条互斥规则违反各附 hint（合法组合提示）。
- `src/tools/batch.ts`：`StepResult.error` 类型与 `batchStepOutputSchema` 增加 `hint?`；白名单裁剪错误附同一 hint。
- `tests/contract/output.test.ts`：新增 `fail hint` describe，锁存在性+长度+缺省行为+超长截断，不锁措辞。
- `tests/whitelist-enforcement.test.ts`：在既有白名单裁剪用例中追加 hint 断言（合并 12 号工单用例，不产生重复测试）。
- `tests/tools/new_commands.test.ts`：在既有 git_checkout EINVAL 用例中追加 hint 断言。
- `tests/tools/guard-metadata-budget.test.ts`：预算常量 52607 → 52657（batch outputSchema 增加 hint 字段）。

**设计决策**：

- 超长 hint 选择截断方案（slice 到 50 字符，不加标记），测试钉死。
- net port 越界（`port 必须是 0-65535 的整数`）不加 hint——message 已含合法范围，hint 会重复内容，违反规则 (b)。
- 其余错误码（ENOENT/GIT_FAIL 等）默认不加 hint。

**验收**：`pnpm test` 全绿（1897 passed）、`pnpm typecheck` 通过。

（评论与对话历史追加于此，新内容置于最前。）
