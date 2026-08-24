# Sub-task 001 · ADR-0013 实施移交清单

状态：待实施（并入 0.x 发布前破坏性修改批次，与 memorial 001 D8 清单同批执行；具体排期归实施工单）

## 改动项

1. **parseGrepPattern 重写为严格版**（src/tools/text.ts:83）：整串仅允许首尾两个未转义 `/`，体内 `/` 必须 `\/`，末段 flags 白名单（i/m/s；replace 场景另收 g），体非空；任一不满足 → 整串字面量；结构合格但 flags 非法 → EINVAL。
2. **search_content 对齐同一解析**（src/tools/search.ts:249、270 注释处）。
3. **text_replace 改双模**（src/tools/text.ts:484-541）：字面量 pattern → replacement 纯字面（禁组替换）；正则 pattern → JS 风格 `$1/$&/$$`（沿用 substituteBackrefs）；0 命中报错+hint；1 命中自动替换+回显上下文；>1 命中须 `all:true` 或 `maxReplace:N`，否则 EINVAL+命中清单。
4. **输出增加 `patternMode` 字段 + 双向 hint 表**（text_grep / search_content / text_replace 三处）。
5. **description 文案**：以「`C:\Users\alice` 字面量免转义」为首例，附正反例（`"a|b"` 字面量 vs `"/a|b/"` 正则）、残余洞说明（形如 `/tmp/` 的字面量会被判为正则）。
6. **文档修正**：README.md:116 摘要改「文本搜索（默认字面量，/正则/ 形式启用正则）」；docs/dsh/skills/jx-mode/SKILL.md 提及处复查。

## 测试清单（表驱动，至少覆盖）

- `/usr/bin`、`/api/v1/`、`/a/b/`、`/tmp/`、`//` → 字面量或相应处理（严格规则断言）
- `/foo/i`、`/d{3}/`、`/a\/b/` → 正则
- `/foo/q` → EINVAL（非法 flags）
- `\d{3}`（无包裹）→ 字面量 + 含元字符 0 命中时触发 hint
- `C:\Users` 字面量路径搜索/替换 → 反斜杠原样命中
- replace：0 命中报错、1 命中替换+上下文、>1 命中未表态报错、`all:true`/`maxReplace:N` 各分支
- `patternMode` 字段在两种模式下均正确上报

## 验收参照

- docs/adr/0013-pattern-dual-mode-and-observability.md（决策全文）
- docs/memorial/003-ai-tool-misunderstanding/context.md（决策过程与理由）
