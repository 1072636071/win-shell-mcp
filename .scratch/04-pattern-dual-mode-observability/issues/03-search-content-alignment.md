# search_content 全量对齐

**Status:** resolved

**Blocked by:** 01, 02

**构建内容：** 跨文件搜索与单文件搜索行为完全一致：复用同一套严格判定解析器，输出同样的模式标识字段与四行双向提示；glob 过滤、目录递归等既有能力不受影响。一次学会、处处适用——调用方在单文件与跨文件之间切换时心智模型零迁移。

**验收标准：**

- [x] 同一组 pattern 在两个搜索工具上解释一致（一致性对照用例表入套件防回归）
- [x] 模式标识字段与提示行为逐行一致
- [x] glob 过滤与目录递归场景下提示照常工作
- [x] 既有跨文件搜索用例全部通过

## 评论

**完成纪要（search-eng · t4）**

改动范围：`src/tools/search.ts`、`tests/tools/search.test.ts`（未触碰 text.ts / docs，无 git commit）。

1. **解析器统一**：删除 search.ts 本地 `parseSearchPattern` 与 `SearchPatternResult` 类型（宽松判定 `/\/(.*)\/([gimsuy]*)$/`），`searchContentHandler` 改用共享 `parsePattern(pattern, ignoreCase, SEARCH_PATTERN_FLAGS)`（src/utils/pattern.ts）。同一 pattern 的解释结果与错误消息与 text_grep 逐字一致。本地 `escapeRegex` 保留——它被 `globToRegExp` 共用，非 parseSearchPattern 专属。
2. **输出对齐**：成功结果恒附 `patternMode: 'literal' | 'regex'`；`hint` 字段经共享 `buildSearchHint`（src/utils/hints.ts）生成、无规则触发不占位。matchCount/totalLines 口径与 text_grep 对齐（截断后命中数；行统计改用共享 `splitLines`，消除末尾换行幻影空行导致的行号/占比口径漂移）。
3. **既有能力不受影响**：glob 过滤、exclude、目录递归、跳过二进制、maxResults/truncated 全部保留；提示在显式 glob 过滤与默认递归场景均验证照常触发。
4. **一致性对照用例表**（tests/tools/search.test.ts，it.each 防回归）：10 组代表性 pattern——多斜杠路径 `/usr/bin/env`（字面量）、恰好首尾斜杠 `/tmp/`（残余洞判正则 + 提示③兜底）、元字符字面量 `a|b`（0 命中提示①）、合法 flags `/foo\d+bar/`（正则）、非法单字母 flags `/foo/q`（EINVAL）、搜索场景 g 标志 `/foo/ig`（EINVAL）、反斜杠路径字面量 `C:\Users\alice`（免转义命中）、反斜杠路径样正则 `/C:\Users\alice/`（0 命中提示④）、空体 `//`（字面量收敛）、末段非纯字母 `/api/v1/`（字面量收敛）。断言双工具成败一致、错误码与错误消息逐字一致、patternMode 相同、hint 触发与文案逐字一致、命中数相同；另附 ignoreCase 跨工具语义一致用例。
5. **验证**：TDD 红→绿（红：17 新用例失败定位缺口；绿：实现后全过）。`npm run typecheck` 通过；定向 96/96；完整 `npm test` 23 文件 880 通过 / 2 跳过（既有跳过）；`npm run coverage` 达标（全仓行 91.52%、分支 86.17%，search.ts 行 93.23%/分支 85.91%，阈值 85/84）。
6. **文案**：inputSchema.pattern 描述与工具 description 同步改为双模表述（字面量默认 + 反斜杠免转义首例 + /…/ 正则 i/m/s），与 text_grep 口径一致。

（评论与对话历史追加于此，新内容置于最前。）
