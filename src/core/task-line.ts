// Markdown task lines in the Tasks-plugin emoji format, which is also what the
// TickTick mirror writes:
//   - [ ] title 📅 2026-10-20 ⏰ 17:00 ⏫ 🔁 #tag ✅ 2026-10-21 %%tt:ID%%

export const TASK_LINE = /^(\s*)[-*+] \[(.)\] ?(.*)$/;

export interface ParsedTaskLine {
  indent: number;
  done: boolean;
  /** the raw status character, e.g. ' ', 'x', '-', '/' */
  status: string;
  title: string;
  due?: string;
  time?: string;
  completed?: string;
  repeat: boolean;
  /** TickTick scale: 0 none, 1 low, 3 medium, 5 high */
  priority: 0 | 1 | 3 | 5;
  tags: string[];
  id: string | null;
  itemId: string | null;
  /** true when the line carried any date/priority markers */
  formatted: boolean;
}

export const squash = (s: string | number | null | undefined): string => String(s ?? '').replace(/\s+/g, ' ').trim();

export function parseTaskLine(line: string): ParsedTaskLine | null {
  const m = line.match(TASK_LINE);
  if (!m) return null;
  let body = m[3];
  const r: ParsedTaskLine = {
    indent: m[1].replace(/\t/g, '    ').length,
    status: m[2],
    done: m[2] !== ' ' && m[2] !== '/',
    title: '', repeat: false, priority: 0, tags: [], id: null, itemId: null, formatted: false,
  };
  body = body.replace(/%%tt:([A-Za-z0-9_-]+)%%/, (_, x: string) => { r.id = x; return ''; });
  body = body.replace(/%%tti:([A-Za-z0-9_-]+)%%/, (_, x: string) => { r.itemId = x; return ''; });
  body = body.replace(/📅\s*(\d{4}-\d{2}-\d{2})/, (_, d: string) => { r.due = d; r.formatted = true; return ''; });
  body = body.replace(/⏰\s*(\d{1,2}:\d{2})/, (_, h: string) => { r.time = h.padStart(5, '0'); r.formatted = true; return ''; });
  body = body.replace(/✅\s*(\d{4}-\d{2}-\d{2})/, (_, d: string) => { r.completed = d; r.formatted = true; return ''; });
  body = body.replace(/🔁[^📅⏰✅⏫🔺🔼🔽#%]*/u, () => { r.repeat = true; return ''; });
  body = body.replace(/(⏫|🔺|🔼|🔽)/u, (_, e: string) => {
    r.priority = e === '🔽' ? 1 : e === '🔼' ? 3 : 5;
    r.formatted = true;
    return '';
  });
  // the Tasks plugin also writes ➕ created, 🛫 start and ⏳ scheduled dates; they are not titles
  body = body.replace(/[➕🛫⏳]\s*\d{4}-\d{2}-\d{2}/gu, '');
  body = body.replace(/(^|\s)#([^\s#]+)/g, (_, s: string, tag: string) => { r.tags.push(tag); return s; });
  r.title = squash(body);
  return r;
}
