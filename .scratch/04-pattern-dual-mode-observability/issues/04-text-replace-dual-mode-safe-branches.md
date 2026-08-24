# text_replace 双模化 + 安全三分支

**Status:** resolved

**Blocked by:** 01

**构建内容：** 替换工具从纯正则改为与其他搜索工具一致的「字面量默认、斜杠包裹正则」双模，并补上替换数量防护：字面量 pattern 时 replacement 按纯字面插入（回引用记号原样保留、不再触发组替换），含反斜杠的 Windows 路径可直接替换；正则 pattern 时沿用现有 JS 风格回引用约定。命中数为 0 → 报错并附提示而非静默成功；恰为 1 → 自动替换并返回命中处上下文片段供核验；多于 1 命中且未显式提供全量开关或次数上限 → 拒绝执行并列出命中总数与各命中位置。此为破坏性变更，需 changelog 说明。

**验收标准：**

- [x] 含反斜杠路径的字面量替换直接成功，无需双重转义
- [x] 字面量模式下回引用记号按原样插入文本
- [x] 正则模式下现有回引用行为不回归（既有用例迁移通过）
- [x] 三分支各有正反断言：0 命中报错、1 命中自动替换+上下文回显、多命中未表态拒绝+命中清单、全量开关与次数上限各自放行
- [x] 写回沿用源文件编码的既有保障不回归（GBK 不被静默改写）
- [x] changelog 记录破坏性变更与新语义示例

## 评论

### 完成纪要（replace-eng · 2026-08-24）

**实现**（src/tools/text.ts 的 text_replace 段）：

- 双模接入共享解析器 `parsePattern(pattern, false, REPLACE_PATTERN_FLAGS)`；`REPLACE_PATTERN_FLAGS = ['i','m','s','g']`（搜索三标志 + g）。判定契约与 text_grep 完全同源，含队长终版三级分类裁定（单字母 flag 手误 EINVAL；多字母词组如 `/usr/bin` 收敛字面量）。
- **语义联动**：字面量 pattern → `applyReplacement` 纯字面插入（不调 `substituteBackrefs`，`$1/$&/$$` 原样落盘）；正则 pattern → 沿用既有回引用实现。
- **安全三分支**（预扫描全部命中后判定，与 write 取值无关）：0 命中 → EINVAL + hint（复用工单02 引擎导出的 `hasRegexMetacharacters`/`looksLikeBackslashPath` 谓词，文案动词适配替换语境，覆盖双向表①②④方向）；恰 1 命中 → 自动替换并附 `position`（原文行:列，均 1-based）与 `context`（替换后所在行片段）；>1 命中且无表态 → EINVAL + 总数 + 位置清单（增量行进算法，最多列 20 处防消息膨胀，超出注明），异常偏多且形似正则时附「疑似被当作正则」兜底 hint（③方向）。
- **表态优先级**：`all:true` > 正则尾部 g > `maxReplace`（队长特别批准 g=显式全量表态，与 ADR-0013「g=全量语义开关」一致）；已写入 schema description 与工具 description。
- 零长度正则匹配防死循环保留（扫描与替换双层防护）；编码写回链路（`readTextWithEncoding`/`encodeWithEncoding`）原样未动。
- 成功响应新增 `patternMode`、`totalMatches`，恰 1 命中另附 `position`/`context`——均为增量输出。

**测试**（tests/tools/text.test.ts 的 replace 部分）：

- 既有用例全部迁移通过：裸正则 pattern 改 `/…/` 包裹、多命中场景补 `all`/`maxReplace` 表态、0 命中用例改断言 EINVAL+hint。
- 新增断言：三分支正反（0 报错+三类 hint、单命中自动+位置+上下文回显、多命中拒绝+清单、write=true 一致生效）、all/g/maxReplace 三种表态及两两优先级、双模判定表 10 行经 handler 外部行为断言、字面量模式回引用记号原样插入、反斜杠路径免双重转义、零长匹配有界完成、GBK/UTF-8 编码保障回归、inputSchema 对 all/maxReplace 的接受与拒绝。
- TDD 红→绿：先写测试确认 33 失败（红），实现后定向全绿，再全量验证。

**验证**：`npm run typecheck` 通过；`npm test` 全量 23 文件 / 907 passed + 2 skipped，零失败。

**产物**：`src/tools/text.ts`（replace 段重写）、`tests/tools/text.test.ts`（replace 测试重写+迁移）、`CHANGELOG.md`（新建，记录破坏性变更、表态语义、判定要点、新语义示例与迁移指引）。

**协作备注**：期间 pattern.ts 经历两次修订（一律 EINVAL → 终版三级分类），已跟随终版口径对齐本工单判定表（`/usr/bin` 归字面量），与 core-eng 的 grep 判定表保持同源一致。
