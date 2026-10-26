import { moment } from '../../core/time';
import { parseTaskLine, squash } from '../../core/task-line';
import { en } from '../../i18n/locales/en';
import { ar } from '../../i18n/locales/ar';
import { fr } from '../../i18n/locales/fr';
import { es } from '../../i18n/locales/es';
import { tr } from '../../i18n/locales/tr';
import type { TTTask } from './types';

/** The comparable state of one task, on either side. */
export interface MirrorRecord {
  t: string;
  /** 0 open, 2 done (TickTick's status values) */
  s: 0 | 2;
  d: string;
  h: string;
  p: number;
  g: string[];
  rep: boolean;
  i: { id?: string | null; t: string; s: 0 | 1 }[];
  cd: string;
}

export interface MirrorBlock {
  start: number;
  end: number;
  id: string | null;
  line: string;
  rec: MirrorRecord;
  /** the line had explicit date/priority markers, so quick-add parsing is skipped */
  formatted: boolean;
  inDone: boolean;
}

export const FIELDS = ['t', 's', 'd', 'h', 'p', 'g', 'i'] as const;

// a mirror note keeps working if the user switches language, so the section
// headings of every locale are recognised
const OPEN = [en, ar, fr, es, tr].map((l) => l.ticktick.mirror.openHeading);
const DONE = [en, ar, fr, es, tr].map((l) => l.ticktick.mirror.doneHeading);
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const OPEN_RE = new RegExp(`^##\\s*(?:${OPEN.map(esc).join('|')})\\s*$`);
export const DONE_RE = new RegExp(`^##\\s*(?:${DONE.map(esc).join('|')}|أُ?نجزت)\\s*$`);

export const safeName = (s: string, fallback: string) => squash(s).replace(/[\\/:*?"<>|#^[\]]/g, '-').slice(0, 120) || fallback;

export function fromTickTick(x: TTTask): MirrorRecord {
  const due = x.dueDate || x.startDate;
  let d = '';
  let h = '';
  if (due) {
    const mm = moment(due).locale('en');
    d = mm.format('YYYY-MM-DD');
    if (x.isAllDay === false) h = mm.format('HH:mm');
  }
  return {
    t: squash(x.title),
    s: x.status === 2 ? 2 : 0,
    d, h,
    p: x.priority || 0,
    g: (x.tags ?? []).map(String).sort(),
    rep: !!x.repeatFlag,
    i: (x.items ?? []).map((it) => ({ id: it.id, t: squash(it.title), s: it.status === 1 || it.status === 2 ? 1 : 0 })),
    cd: x.completedTime ? moment(x.completedTime).locale('en').format('YYYY-MM-DD') : '',
  };
}

export function fieldValue(r: MirrorRecord, f: (typeof FIELDS)[number]): unknown {
  if (f === 'g') return [...(r.g ?? [])].sort().join(' ');
  if (f === 'i') return (r.i ?? []).map((x) => [x.t, x.s]);
  return r[f] ?? '';
}

export function render(id: string, r: MirrorRecord): string[] {
  const pri = ({ 5: ' ⏫', 3: ' 🔼', 1: ' 🔽' } as Record<number, string>)[r.p] ?? '';
  const line = `- [${r.s === 2 ? 'x' : ' '}] ${r.t}`
    + (r.d ? ` 📅 ${r.d}` : '')
    + (r.d && r.h ? ` ⏰ ${r.h}` : '')
    + pri
    + (r.rep ? ' 🔁' : '')
    + (r.g ?? []).map((x) => ' #' + String(x).replace(/\s+/g, '_')).join('')
    + (r.s === 2 && r.cd ? ` ✅ ${r.cd}` : '')
    + ` %%tt:${id}%%`;
  return [line, ...(r.i ?? []).map((x) => `    - [${x.s ? 'x' : ' '}] ${x.t}` + (x.id ? ` %%tti:${x.id}%%` : ''))];
}

/** Split a mirror note into task blocks: a top-level task plus its indented checklist. */
export function parseNote(text: string): { pid: string | null; blocks: MirrorBlock[]; doneAt: number; openAt: number } {
  const L = text.split('\n');
  const out = { pid: null as string | null, blocks: [] as MirrorBlock[], doneAt: -1, openAt: -1 };
  const fm = text.match(/^---\n([\s\S]*?)\n---/);
  if (fm) {
    const pid = fm[1].match(/^tt_project:\s*["']?([^"'\s]+)/m);
    if (pid) out.pid = pid[1];
  }
  const fmEnd = fm ? fm[0].split('\n').length - 1 : -1;
  for (let i = 0; i < L.length; i++) {
    if (i <= fmEnd) continue;
    if (DONE_RE.test(L[i])) out.doneAt = i;
    if (OPEN_RE.test(L[i])) out.openAt = i;
    const r = parseTaskLine(L[i]);
    if (!r || r.indent >= 2) continue;
    if (!r.title && !r.id) continue;
    const b: MirrorBlock = {
      start: i, end: i, id: r.id, line: L[i],
      rec: { t: r.title, s: r.status !== ' ' ? 2 : 0, d: r.due ?? '', h: r.due ? r.time ?? '' : '', p: r.priority, g: r.tags.sort(), rep: r.repeat, i: [], cd: r.completed ?? '' },
      formatted: r.formatted,
      inDone: out.doneAt >= 0 && i > out.doneAt,
    };
    let j = i + 1;
    while (j < L.length) {
      const c = parseTaskLine(L[j]);
      if (c && c.indent >= 2) {
        if (c.title) b.rec.i.push({ id: c.itemId, t: c.title, s: c.status !== ' ' ? 1 : 0 });
        b.end = j++;
      } else if (/^\s{2,}\S/.test(L[j]) && !c) {
        b.end = j++;
      } else break;
    }
    out.blocks.push(b);
    i = b.end;
  }
  return out;
}
