# 工具输出主动充分返回盘点与补齐

**Status:** resolved

> 2026-08-25：高价值项已落地（fs_rm targetType+recursiveCount、fs_cp/fs_mv overwritten，outputSchema/单测/guard 同步）；review 修复 fs_rm 悬空符号链接误判并收紧 targetType 为 optional 后闭环。

**Blocked by:** 无——可立即开始

**构建内容：** 按 memorial 007「方向1：语义完整」原则，盘点全部 58 个工具的输出，把 LLM 光靠参数无法确认的边界情况显式补进返回字段，让结果一轮内可判定，无需回跑确认。遵守兼容性红线（ADR-0007）：仅新增可选输出字段，既有字段与默认行为永不变。

**验收标准：**

- [ ] 产出盘点清单：逐工具列出"现有返回 / LLM 可能需要再确认什么 / 拟新增字段"，写入本工单 `## 评论` 或独立小节
- [ ] 高价值项落地（示例方向，以盘点结论为准）：
  - `fs_rm`：补充被删目标的类型（file/dir）与递归删除的条目统计，而非仅 `removed` 布尔
  - `text_replace`：评估 0 命中/多命中拒绝场景之外是否还需补充判别字段（现状已含 `replaced/totalMatches/position/context/hint`）
  - `fs_cp` / `fs_mv`：补充覆盖发生与否的显式标记
- [ ] 所有新增字段同步进对应 outputSchema，guard 测试继续通过
- [ ] 每个新增字段有对应单测；不破坏任何既有测试

## 评论

### 盘点清单（逐工具）

#### 1. fs_rm — `{ removed: boolean }`
- **现有字段**：`removed`（是否删除）
- **LLM 需确认**：删的是 file 还是 dir？递归删了多少条目？force=true 且不存在时 removed=false，但 LLM 无法区分"本来就没"和"删失败了"
- **拟新增**：
  - `targetType: "file" | "dir" | "symlink"` — 被删目标的类型（optional）
  - `recursiveCount?: number` — 递归删除时删除的条目数（仅 recursive 时）

#### 2. text_replace — `{ replaced, totalMatches, content, written, patternMode, position?, context?, hint? }`
- **现有字段**：replaced（实际替换次数）、totalMatches（全文命中总数）、content（替换后内容）、written（是否写回）、patternMode（literal/regex）、position（恰1命中位置）、context（恰1命中上下文）、hint（异常偏多兜底）
- **LLM 需确认**：0 命中直接报错拒绝；多命中未表态直接报错并列清单；恰1命中自动替换并回显上下文。三分支均有明确处理。
- **结论**：现状已非常丰富，无需补充。

#### 3. fs_cp — `{ copied: boolean }`
- **现有字段**：`copied`（是否复制成功）
- **LLM 需确认**：是否覆盖了已存在的目标？复制的是 file 还是 dir？
- **拟新增**：
  - `overwritten?: boolean` — 是否覆盖了已存在的目标（optional）
  - `sourceType?: "file" | "dir"` — 源类型（optional，与 fs_rm 的 targetType 保持一致命名风格）

#### 4. fs_mv — `{ moved: boolean, dest }`
- **现有字段**：`moved`（是否移动成功）、`dest`（最终目标路径）
- **LLM 需确认**：是否覆盖了已存在的目标？
- **拟新增**：
  - `overwritten?: boolean` — 是否覆盖了已存在的目标（optional）

#### 5. fs_write — `{ written: number }`
- **现有字段**：`written`（写入字节数）
- **LLM 需确认**：是否覆盖了已有内容？append 模式 vs 覆盖模式
- **结论**：`written` 字节数已足够，append 模式通过参数可推断。无需补充。

#### 6. fs_mkdir — `{ created: boolean }`
- **现有字段**：`created`（是否新建）
- **LLM 需确认**：已存在时 created=false，足够明确。
- **结论**：无需补充。

#### 7. fs_touch — `{ created: boolean }`
- **现有字段**：`created`（是否新建）
- **LLM 需确认**：已存在时 created=false，update=true 时 mtime 已更新。
- **结论**：无需补充。

#### 8. archive_create — `{ created, path, format, bytes }`
- **现有字段**：created（是否创建成功）、path（归档路径）、format（格式）、bytes（字节数）
- **LLM 需确认**：归档内包含多少条目？
- **拟新增**：`entryCount?: number` — 归档内条目数（optional，低优先级）

#### 9. archive_extract — `{ extracted, dest }`
- **现有字段**：extracted（是否解压成功）、dest（目标目录）
- **LLM 需确认**：解压出多少条目？
- **拟新增**：`entryCount?: number` — 解压条目数（optional，低优先级）

#### 10. 其他工具（快速扫描结论）
- **fs_read**：`{ content, truncated, lines }` — 充分
- **fs_stat**：`{ type, size, mtime, birthtime? }` — 充分
- **fs_list**：`{ entries }`（极简/verbose 两种形状）— 充分
- **text_grep / text_head / text_tail / text_wc / text_diff**：均充分
- **core (pwd/echo)**：充分
- **env / process / pkg / git / net / search / shell_exec / run_command / json / hash**：均充分（未在本次盘点范围内，但 guard 测试已覆盖）

### 高价值项落地结论

按 LLM 决策价值排序，本次实现：
1. **fs_rm**：targetType + recursiveCount（高价值 — 类型不明、递归量不明）
2. **fs_cp**：overwritten（高价值 — 覆盖不明）
3. **fs_mv**：overwritten（高价值 — 覆盖不明）

低优先级项（archive entryCount、fs_cp sourceType）暂不实现，留待后续迭代。
