import { TFile, type App } from 'obsidian';
import { parseTaskLine } from '../core/task-line';
import type { VaultPaths } from '../core/vault-paths';
import { m } from '../i18n';
import type { FocusItem, FocusSource, TaskItem, TaskSource } from './types';
import type { FocusSession } from '../settings/types';

const SERIES = (i: number) => `var(--qh-c${(i % 5) + 1})`;

interface FileTasks { mtime: number; tasks: TaskItem[] }

/**
 * Tasks written as `- [ ]` lines anywhere in the vault.
 *
 * Daily notes need care: they often repeat a checklist every day, and an
 * unticked item from last month is a routine that was skipped, not an open
 * task. So in a daily note only today's items, or items with an explicit due
 * date, count as open. Completion dates come from the Tasks plugin's ✅
 * marker, or from the daily note's own date; a done task with neither counts
 * in totals but stays out of the charts (file times lie after a cloud sync).
 */
export class VaultTaskSource implements TaskSource {
  readonly id = 'vault' as const;
  private cache = new Map<string, FileTasks>();

  constructor(private app: App, private paths: VaultPaths, private skip: () => string | null) {}

  private topFolders(): string[] {
    return this.app.vault.getRoot().children.filter((f) => !(f instanceof TFile)).map((f) => f.name).sort();
  }

  private async scan(): Promise<TaskItem[]> {
    const tops = this.topFolders();
    const skip = this.skip();
    const all: TaskItem[] = [];
    const seen = new Set<string>();
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (this.paths.isExcluded(f.path) || (skip && f.path.startsWith(skip + '/'))) continue;
      const items = this.app.metadataCache.getFileCache(f)?.listItems;
      if (!items?.some((i) => i.task != null)) continue;
      seen.add(f.path);
      const hit = this.cache.get(f.path);
      if (hit && hit.mtime === f.stat.mtime) { all.push(...hit.tasks); continue; }
      const lines = (await this.app.vault.cachedRead(f)).split('\n');
      const top = f.path.includes('/') ? f.path.split('/')[0] : '';
      const list = { id: top || '/', name: top.replace(/^\d+\s*/, '') || f.basename, color: SERIES(Math.max(0, tops.indexOf(top))) };
      const tasks: TaskItem[] = [];
      const day = this.paths.dailyDate(f.path);
      const isToday = !!day && day.isSame(m(), 'day');
      for (const it of items) {
        if (it.task == null || it.task === '-') continue; // cancelled tasks are neither open nor done
        const ln = it.position.start.line;
        const p = parseTaskLine(lines[ln] ?? '');
        if (!p || !p.title) continue;
        if (day && !p.done && !isToday && !p.due) continue;
        const due = p.due ? m(p.due + (p.time ? ' ' + p.time : ''), p.time ? 'YYYY-MM-DD HH:mm' : 'YYYY-MM-DD').valueOf() : undefined;
        tasks.push({
          id: `${f.path}#${ln}`,
          title: p.title.replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (_, a: string, b: string) => b || a),
          done: p.done,
          completedAt: !p.done ? undefined : p.completed ? m(p.completed, 'YYYY-MM-DD').hour(12).valueOf() : day ? day.clone().hour(12).valueOf() : undefined,
          due,
          allDay: !p.time,
          priority: p.priority,
          tags: p.tags,
          list,
          path: f.path,
          line: ln,
        });
      }
      this.cache.set(f.path, { mtime: f.stat.mtime, tasks });
      all.push(...tasks);
    }
    for (const k of [...this.cache.keys()]) if (!seen.has(k)) this.cache.delete(k);
    return all;
  }

  async open(): Promise<TaskItem[]> {
    return (await this.scan()).filter((t) => !t.done);
  }

  async completed(): Promise<TaskItem[]> {
    return (await this.scan()).filter((t) => t.done).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
  }

  /** Tick a task in its note. */
  async complete(task: TaskItem): Promise<void> {
    if (!task.path || task.line == null) return;
    const f = this.app.vault.getAbstractFileByPath(task.path);
    if (!(f instanceof TFile)) return;
    const stamp = m().locale('en').format('YYYY-MM-DD');
    await this.app.vault.process(f, (data) => {
      const L = data.split('\n');
      const line = L[task.line!];
      if (line == null || !/\[ \]/.test(line)) return data;
      L[task.line!] = line.replace('[ ]', '[x]').replace(/\s*(%%tt:|$)/, ` ✅ ${stamp}$1`);
      return L.join('\n');
    });
  }
}

/** Pomodoro sessions recorded on this vault by the built-in timer. */
export class LocalFocusSource implements FocusSource {
  readonly id = 'local' as const;
  constructor(private log: () => FocusSession[]) {}
  sessions(): FocusItem[] {
    return this.log().map((s) => ({ start: s.start, minutes: Math.max(0, s.duration / 60), kind: s.kind, task: s.task }));
  }
}
