/**
 * tasklist CSV 解析深模块（Windows 进程信息）。
 *
 * tasklist /FO CSV /NH 输出的列顺序：映像名,PID,会话名,会话#,内存使用。
 * 内存字段形如 "5,120 KBytes"（千分位逗号 + 单位）。
 *
 * process_list 与 net_listen 均消费此模块，保证对同一数据的解析行为永不漂移。
 */

export interface TasklistEntry {
  /** 映像名（进程名）。 */
  name: string;
  /** 进程 PID。 */
  pid: number;
  /** 内存使用字节（第 5 列存在时；KBytes→字节）。 */
  memory?: number;
}

/**
 * 解析 tasklist CSV 行（Windows）。
 *
 * 输入形如：
 *   "System Idle Process","0","Services","0","8 KBytes"
 *   "cmd.exe","1234","Console","1","5,120 KBytes"
 *
 * @param line CSV 行
 * @returns 解析后的进程条目（含可选 memory）；解析失败返回 null
 */
export function parseTasklistCsv(line: string): TasklistEntry | null {
  if (line.length === 0) return null;
  // 简易 CSV 解析：字段以逗号分隔，每个字段可能被双引号包围
  const fields: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      // 引号字段
      const end = line.indexOf('"', i + 1);
      if (end === -1) return null;
      fields.push(line.slice(i + 1, end));
      i = end + 1;
      // 跳过逗号
      if (line[i] === ",") i++;
    } else {
      // 无引号字段
      const end = line.indexOf(",", i);
      if (end === -1) {
        fields.push(line.slice(i));
        i = line.length;
      } else {
        fields.push(line.slice(i, end));
        i = end + 1;
      }
    }
  }

  // 至少需要映像名与 PID
  if (fields.length < 2) return null;
  const name = fields[0]!;
  const pid = Number(fields[1]);
  if (!Number.isInteger(pid) || pid < 0) return null;

  const entry: TasklistEntry = { pid, name };

  // 第 5 列为内存使用（"5,120 KBytes"）
  if (fields.length >= 5) {
    const memStr = fields[4]!;
    // 提取数字部分（去掉逗号与单位）
    const memMatch = /([\d,]+)/.exec(memStr);
    if (memMatch) {
      const memNum = Number(memMatch[1]!.replace(/,/g, ""));
      if (Number.isFinite(memNum)) {
        // tasklist 单位为 KBytes，转换为字节
        entry.memory = memNum * 1024;
      }
    }
  }

  return entry;
}
