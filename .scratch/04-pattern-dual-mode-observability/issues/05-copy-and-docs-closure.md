# 文案与文档收口

**Status:** resolved

**Blocked by:** 02, 03, 04

**构建内容：** 行为定稿后的文案防线：三个 pattern 类工具的描述以「含反斜杠路径字面量免转义」为首例，附字面量与正则的正反例对照及已知残余洞说明（形如首尾斜杠的短字面量会被判为正则，由异常命中提示兜底）；README 工具表摘要修正为「文本搜索（默认字面量，斜杠包裹启用正则）」；dsh 技能文档中对搜索工具的指引同步复查。文案即先验——让调用方填参当下就建立正确预期。

**验收标准：**

- [x] 三个工具描述更新完毕，均含首例策略要求的正反例与残余洞说明
- [x] README 工具表摘要与实际语义一致，不再单独标注「正则」
- [x] dsh 技能文档提及处复查并同步
- [x] 描述文案相关的既有断言/快照测试全部更新通过

## 评论

（评论与对话历史追加于此，新内容置于最前。）

### 完成纪要（docs-eng · 工单05）

**文案与最终实现逐字核对后落盘。** 动工前通读 t1–t4 定稿代码：`src/utils/pattern.ts` 严格判定解析器（含 flags 段三级分类终版裁定：`/usr/bin`、`/etc/hosts` 类多字母路径词组安全收敛为字面量）、`src/utils/hints.ts` 四行双向提示引擎、text/search 两工具 handler 的 `patternMode`/`hint` 输出契约。

**改动清单：**

1. **三工具 description 重写**（src/tools/text.ts `text_grep`、`text_replace`；src/tools/search.ts `search_content`）——均含：
   - 首例策略：`C:\Users\alice` 反斜杠原样免转义直接可搜可换；
   - 正反例对照：字面量 `"a|b"` 只匹配三个字符本身 vs 正则 `"/a|b/"` 匹配 a 或 b，另附 `/\d{3}/` 式样与体内斜杠须写作 `\/`；
   - 收敛示例：`/usr/bin`、`/api/v1/` 整体按字面量处理；
   - 残余洞说明：形如 `/tmp/` 的恰好首尾斜杠短字面量会被判为正则 tmp，由命中异常偏多时的 hint 兜底提醒。
   - text_replace 另写明：三分支表态语义（0 命中报错 / 恰 1 命中自动替换+回显上下文 / 多命中须 `all:true` 或 `maxReplace:N` 显式表态，正则尾部 g 等价全量表态）；字面量模式 replacement 纯字面插入、`$1/$&/$$` 不展开，正则模式才启用 JS 风格回引用；write 写回沿用源编码。
   - 与实现逐项核对过的事实点：表态优先级（all > 尾部 g > maxReplace）、单命中回显 position/context 字段、patternMode 取值 literal/regex。
2. **README.md 工具表**：`text_grep` → 「文本搜索（默认字面量，/正则/ 形式启用正则）」；`text_replace` → 「文本替换（默认字面量，/正则/ 形式启用正则；多命中需显式表态）」；`search_content` → 「跨文件内容搜索（默认字面量，/正则/ 形式启用正则）」。误导源「正则搜索文本」「正则替换文本」清除。
3. **docs/dsh/skills/jx-mode/SKILL.md 第18行**：「正则 + `$1` 回引用」→「pattern 默认字面量、`/正则/` 启用正则；字面量模式 `$1` 原样插入，正则模式才 `$1` 回引用」。第20行提及处无误导表述，复查通过不改。该文件不受根 AGENTS.md/CODEBUDDY.md 一致性约束（约束对象是根目录两文件本身）。
4. **参数级 schema 描述未动**：t3/t4 已同步更新 pattern/replacement/all/maxReplace 的 `.describe()` 为双模表述，与本工单文案口径一致，无需重复修改。

**测试**：既有套件对 description 仅断言 `length > 0`，无内容快照冲突，无需改断言。`npm run typecheck` 通过；完整 `npm test` 907 passed / 2 skipped（skip 为 fs_write 既有用例）全绿。ADR/memorial 中对旧文案的引用属历史记录（描述问题本身），按规保留。

**纪律遵守**：仅动三处 description 字符串 + README + SKILL.md + 本工单文件，零 handler 行为改动，未 commit。
