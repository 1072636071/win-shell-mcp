/**
 * bundled `agent.cordis.yml` 的结构校验。
 *
 * 故意零依赖：只解析 sync 与 dsh agent-presets loader 依赖的扁平行元数据。
 * 每行顶层行写成列 0 的 `- id: <id>`，`name`/`group`/`disabled` 键缩进两格。
 * 嵌套的 `config:`/`isolate:` 体对本校验不透明——语义由 dsh loader 校验。
 *
 * `name` 允许的形式对齐 dsh loader 的 import 解析：相对路径（`./`）、
 * scope 包（`@`）、内置（`cordis:`），以及无 scope 的 Node 包名（含 exports
 * 子路径，如 `win-shell-mcp/plugin`）。返回问题列表；空数组 = 结构合法。
 */

/** 顶层行起始：`- id: <id>`（id 可为空以作诊断）。 */
export const ROW_RE = /^-\s+id:\s*(.*)$/;
/** 任意顶层列表项，用于缺 id 的行。 */
const ITEM_RE = /^-\s/;
/** 两格缩进的扁平元数据键：`  name: <value>`。 */
export const META_RE = /^ {2}([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/;
/** dsh loader 可挂载的行 name 形式：相对、scope 包、内置、无 scope 包名/子路径。 */
export const NAME_RE = /^(\.\/|@|cordis:)|^[^/\\\s]+(\/[^/\\\s]+)*$/;

/** 去掉标量的一对包裹引号。 */
export function unquote(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    if ((first === "'" || first === '"') && value.endsWith(first)) {
      return value.slice(1, -1);
    }
  }
  return value;
}

/**
 * 校验 `agent.cordis.yml` 文档的结构契约。
 *
 * @param text - 原始 YAML 文档文本。
 * @returns 人类可读问题列表；空 = 合法。
 */
export function validateAgentCordis(text: string): string[] {
  const errors: string[] = [];
  const normalized = text.replace(/\r\n/g, "\n");
  if (normalized.trim() === "") {
    return ["document is empty"];
  }

  const seenIds = new Set<string>();
  const current: { id: string | null; name: string | null; group: string | null } = {
    id: null,
    name: null,
    group: null,
  };

  const closeRow = (): void => {
    if (current.id === null) return;
    if (current.name === null) {
      errors.push(`row "${current.id}": missing "name" key`);
    } else if (!NAME_RE.test(current.name)) {
      errors.push(
        `row "${current.id}": name "${current.name}" must be a relative path (./), a scoped/unscoped package (with optional exports subpath), or a cordis: builtin`,
      );
    }
    if (current.group === "true" && current.name !== "cordis:group") {
      errors.push(`row "${current.id}": "group: true" requires name "cordis:group"`);
    }
    current.name = null;
    current.group = null;
    current.id = null;
  };

  const lines = normalized.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const lineNo = index + 1;
    const line = lines[index]!;
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    const row = ROW_RE.exec(line);
    if (row !== null) {
      closeRow();
      const id = row[1]!.trim();
      if (id === "") {
        errors.push(`line ${lineNo}: empty row id`);
        current.id = null;
      } else {
        if (seenIds.has(id)) errors.push(`line ${lineNo}: duplicate row id "${id}"`);
        seenIds.add(id);
        current.id = id;
      }
      current.name = null;
      current.group = null;
      continue;
    }

    if (current.id === null) {
      if (ITEM_RE.test(line)) {
        errors.push(`line ${lineNo}: list item does not declare an "id:"`);
      } else if (/^\S/.test(line)) {
        errors.push(`line ${lineNo}: content outside a "- id:" row`);
      }
      continue;
    }

    const meta = META_RE.exec(line);
    if (meta !== null) {
      const value = unquote(meta[2]!.trim());
      if (meta[1] === "name") current.name = value;
      else if (meta[1] === "group") current.group = value;
      continue;
    }
    if (/^ {2}/.test(line)) continue;
    errors.push(`line ${lineNo}: unexpected content in row "${current.id}"`);
  }
  closeRow();
  return errors;
}
