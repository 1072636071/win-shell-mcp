# 收缩与最终验证

**Status:** ready-for-agent

**Blocked by:** 05

**构建内容：** 代码库清理临时兼容逻辑，TypeScript 契约收紧，版本标记 0.2.0，CI 全绿。

**验收标准：**

- [ ] 将 `Tool` 接口的 `outputSchema` 与 `annotations` 从可选改为必填（或确认 guard test 已足够强制，保留可选但删除默认值回退）
- [ ] 删除 `server.ts` 与 `plugin.ts` 中的临时条件回退逻辑（如「无 outputSchema 则跳过」的兼容分支）
- [ ] 删除构建配置中的临时 shim 或 banner 调整
- [ ] `package.json` version 更新为 `0.2.0`
- [ ] 全量测试通过（vitest run 全绿）
- [ ] 构建通过（tsup 无警告，三入口产物完整）
- [ ] 类型检查通过（tsc --noEmit 无错误）
- [ ] 覆盖率不下降（lines/functions/statements ≥ 85%，branches ≥ 84%）

## 评论

- 本工单为「收缩」阶段：删除扩展-收缩模式中的旧形式兼容代码。
- 若将 outputSchema/annotations 改为必填导致大量类型错误，可保留可选 + guard test 强制模式，仅删除临时回退逻辑即可。
