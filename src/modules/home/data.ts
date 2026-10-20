import { TFile, type App, type FrontMatterCache } from 'obsidian';
import type { Moment } from 'moment';
import type { VaultPaths } from '../../core/vault-paths';
import { m } from '../../i18n';
import type { Habit } from '../../settings/types';

const DIAGRAM = /\.excalidraw\.md$/;

/** One snapshot of the vault for a single render of the dashboard. */
export class HomeData {
  readonly files: TFile[];
  readonly notes: TFile[];
  readonly diagrams: TFile[];
  readonly resolved: Record<string, Record<string, number>>;
  readonly backlinks: Record<string, number> = {};
  readonly links: number;

  constructor(private app: App, readonly paths: VaultPaths) {
    this.files = app.vault.getMarkdownFiles().filter((f) => !paths.isExcluded(f.path));
    this.diagrams = this.files.filter((f) => DIAGRAM.test(f.path));
    this.notes = this.files.filter((f) => !DIAGRAM.test(f.path));
    this.resolved = app.metadataCache.resolvedLinks ?? {};
    let links = 0;
    for (const targets of Object.values(this.resolved)) {
      for (const [dst, n] of Object.entries(targets)) {
        this.backlinks[dst] = (this.backlinks[dst] ?? 0) + n;
        links += n;
      }
    }
    this.links = links;
  }

  fm(f: TFile): FrontMatterCache { return this.app.metadataCache.getFileCache(f)?.frontmatter ?? {}; }

  /** A note's own date if its properties carry one, else the file's creation time. */
  created(f: TFile): Moment {
    const fm = this.fm(f);
    const d: unknown = fm.date ?? fm.created ?? fm.date_created ?? fm.date_started ?? fm.date_enrolled;
    const raw = typeof d === 'string' ? d : typeof d === 'number' ? String(d) : '';
    const parsed = raw ? m(raw, 'YYYY-MM-DD', true) : null;
    return parsed?.isValid() ? parsed : m(f.stat.ctime);
  }

  inFolder(path: string | null): TFile[] {
    return path ? this.notes.filter((f) => f.path.startsWith(path + '/')) : [];
  }

  daily(day: Moment): TFile | null { return this.paths.dailyFile(day); }

  journalStreak(): number {
    let d = m().startOf('day');
    if (!this.daily(d)) d = d.subtract(1, 'day');
    let n = 0;
    while (this.daily(d) && n < 3650) { n++; d = d.subtract(1, 'day'); }
    return n;
  }

  /** Edits and creations per day. */
  activity(): Record<string, number> {
    const map: Record<string, number> = {};
    const add = (time: number) => {
      const k = m(time).locale('en').format('YYYY-MM-DD');
      map[k] = (map[k] ?? 0) + 1;
    };
    for (const f of this.files) { add(f.stat.mtime); add(this.created(f).valueOf()); }
    return map;
  }

  weekly(weeks: number): number[] {
    const out = new Array<number>(weeks).fill(0);
    const end = m().endOf('week');
    for (const f of this.notes) {
      const w = end.diff(this.created(f), 'weeks');
      if (w >= 0 && w < weeks) out[weeks - 1 - w]++;
    }
    return out;
  }

  monthlyCumulative(months: number): { cum: number[]; counts: number[]; labels: string[] } {
    const end = m().endOf('month');
    const counts = new Array<number>(months).fill(0);
    let before = 0;
    for (const f of this.notes) {
      const i = end.diff(this.created(f), 'months');
      if (i >= months) before++;
      else if (i >= 0) counts[months - 1 - i]++;
    }
    const cum: number[] = [];
    let acc = before;
    for (const c of counts) { acc += c; cum.push(acc); }
    const labels = Array.from({ length: months }, (_, i) => m().subtract(months - 1 - i, 'months').format('MMM'));
    return { cum, counts, labels };
  }

  folders(rootLabel: string): [string, number][] {
    const c: Record<string, number> = {};
    for (const f of this.notes) {
      const top = f.path.includes('/') ? f.path.split('/')[0] : rootLabel;
      c[top] = (c[top] ?? 0) + 1;
    }
    return Object.entries(c).sort((a, b) => b[1] - a[1]);
  }

  tags(n: number): [string, number][] {
    const all = (this.app.metadataCache as unknown as { getTags?: () => Record<string, number> }).getTags?.() ?? {};
    return Object.entries(all).sort((a, b) => b[1] - a[1]).slice(0, n);
  }

  /** Per habit, one value per day (oldest first); null where nothing was logged. */
  habits(defs: Habit[], days: number): Record<string, (number | null)[]> {
    const rows: Record<string, (number | null)[]> = {};
    for (const h of defs) rows[h.key] = [];
    for (let i = days - 1; i >= 0; i--) {
      const f = this.daily(m().startOf('day').subtract(i, 'day'));
      const fm = f ? this.fm(f) : ({} as FrontMatterCache);
      for (const h of defs) {
        const v: unknown = fm[h.key];
        if (h.bool) rows[h.key].push(v === true || v === 'true' ? 1 : v === false || v === 'false' ? 0 : null);
        else rows[h.key].push(v === '' || v == null || isNaN(Number(v)) ? null : Number(v));
      }
    }
    return rows;
  }

  byType(type: string): TFile[] { return this.notes.filter((f) => this.fm(f).type === type); }

  orphans(): TFile[] {
    return this.notes.filter((f) => !this.backlinks[f.path] && !Object.keys(this.resolved[f.path] ?? {}).length && !this.paths.isDaily(f.path));
  }

  unresolvedCount(): number {
    return Object.values(this.app.metadataCache.unresolvedLinks ?? {}).reduce((a, x) => a + Object.keys(x).length, 0);
  }

  bases(): TFile[] {
    return this.app.vault.getFiles().filter((f) => f.extension === 'base' && !this.paths.isExcluded(f.path)).sort((a, b) => a.basename.localeCompare(b.basename));
  }
}
