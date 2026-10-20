import { moment, Notice, requestUrl, TFile } from 'obsidian';
import type { Moment } from 'moment';
import type DamasceneStudio from '../../main';
import { readLocal, writeLocal } from '../../core/storage';
import { t } from '../../i18n';
import { emptyCache, type TTCache, type TTHabit, type TTProject, type TTTask } from './types';

export const TICKTICK = 'TickTick';
const BASE = 'https://api.ticktick.com/open/v1';
const KEYS = { token: 'dm-tt-token', cache: 'dm-tt-cache' };

const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));
export const ttTime = (d: Moment): string => d.clone().locale('en').format('YYYY-MM-DDTHH:mm:ssZZ');
export const ttStamp = (d: Moment): number => Number(d.clone().locale('en').format('YYYYMMDD'));
export const timeZone = (): string => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'UTC'; }
};

// TickTick colors never reach the screen as-is: each list color maps onto the
// theme's chart series so lists still look like they belong to the palette.
const FAMILY: Record<string, number> = {
  '#054239': 1, '#002623': 1, '#428177': 4, '#7ea69c': 4, '#b9a779': 2, '#988561': 2, '#edebe0': 2,
  '#6b1f2a': 3, '#4a151e': 3, '#260f14': 3, '#a67b7c': 3, '#3d3a3b': 5, '#161616': 5,
};
export const series = (i: number) => `var(--qh-c${((i < 0 ? 0 : i) % 5) + 1})`;
export const themedColor = (hex: string | undefined, i: number) => {
  const f = FAMILY[String(hex ?? '').toLowerCase()];
  return f ? `var(--qh-c${f})` : series(i);
};

/**
 * Thin client over the TickTick Open API with an optimistic local cache.
 * The token and cache live in device storage, never in vault files, because
 * vaults are usually synced to some cloud drive.
 */
export class TickTickClient {
  cache: TTCache;
  busy = false;
  error: string | null = null;
  private listeners = new Set<() => void>();

  constructor(private plugin: DamasceneStudio) {
    this.cache = { ...emptyCache(), ...(readLocal<TTCache>(plugin.app, KEYS.cache) ?? {}) };
  }

  get app() { return this.plugin.app; }
  get token(): string { return readLocal<{ t?: string }>(this.app, KEYS.token)?.t ?? ''; }
  set token(v: string) { writeLocal(this.app, KEYS.token, v ? { t: v } : null); }
  /** connected AND switched on in the control panel */
  get active(): boolean { return this.plugin.settings.integrations.ticktick && !!this.token; }

  on(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit(): void {
    writeLocal(this.app, KEYS.cache, this.cache);
    for (const fn of [...this.listeners]) {
      try { fn(); } catch (e) { console.error(e); }
    }
  }

  disconnect(): void {
    this.token = '';
    this.cache = emptyCache();
    this.emit();
  }

  private async req<T>(method: string, path: string, body?: unknown, attempt = 0): Promise<T | null> {
    const res = await requestUrl({
      url: BASE + path, method, throw: false,
      headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' },
      body: body != null ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429 && attempt < 3) {
      await sleep(1500 * (attempt + 1));
      return this.req<T>(method, path, body, attempt + 1);
    }
    if (res.status === 401 || res.status === 403) throw new Error(t('ticktick.errors.badToken'));
    if (res.status >= 400) throw new Error(`TickTick ${res.status}: ${path}`);
    try { return res.text ? (JSON.parse(res.text) as T) : null; } catch { return null; }
  }
  get<T>(path: string) { return this.req<T>('GET', path); }
  post<T>(path: string, body: unknown = {}) { return this.req<T>('POST', path, body); }
  del<T>(path: string) { return this.req<T>('DELETE', path); }

  /** Checks a token; keeps it on success. Returns the number of lists. */
  async test(token: string): Promise<number> {
    const old = this.token;
    this.token = token;
    try {
      const p = await this.get<TTProject[]>('/project');
      return Array.isArray(p) ? p.length : 0;
    } catch (e) {
      this.token = old;
      throw e;
    }
  }

  async sync(opts: { full?: boolean } = {}): Promise<void> {
    if (!this.active || this.busy) return;
    this.busy = true;
    this.error = null;
    this.emit();
    const full = opts.full || Date.now() - (this.cache.fullAt || 0) > 6 * 3600e3;
    const M = moment;
    try {
      const projects = (await this.get<TTProject[]>('/project')) ?? [];
      const tasks: TTTask[] = [];
      const fetchOk: string[] = [];
      const inbox = await this.get<{ project?: TTProject; tasks?: TTTask[] }>('/project/inbox/data').catch(() => null);
      if (inbox?.tasks) {
        fetchOk.push('__inbox');
        if (inbox.project?.id) {
          fetchOk.push(inbox.project.id);
          if (!projects.find((p) => p.id === inbox.project!.id)) projects.unshift({ ...inbox.project, name: t('ticktick.inbox'), inbox: true });
        }
        tasks.push(...inbox.tasks);
      }
      for (const pr of projects) {
        if (pr.closed || pr.inbox || (pr.kind && pr.kind !== 'TASK')) continue;
        const d = await this.get<{ tasks?: TTTask[] }>(`/project/${pr.id}/data`).catch(() => null);
        if (d?.tasks) { fetchOk.push(pr.id); tasks.push(...d.tasks); }
        await sleep(80);
      }
      // the inbox id is only discoverable through its tasks
      const inboxId = tasks.find((x) => !projects.find((p) => p.id === x.projectId))?.projectId;
      if (inboxId && !projects.find((p) => p.id === inboxId)) projects.unshift({ id: inboxId, name: t('ticktick.inbox'), inbox: true, color: '#b9a779' });
      if (inboxId && fetchOk.includes('__inbox')) fetchOk.push(inboxId);
      Object.assign(this.cache, { projects, tasks, fetchOk });

      // completed history: 180 days on a full sync, else the last 10 merged in
      const days = full ? 180 : 10;
      const fresh = await this.completedRange(M().subtract(days, 'days').startOf('day'), M().endOf('day'));
      const keep = full ? [] : this.cache.completed.filter((x) => M(x.completedTime).isBefore(M().subtract(days, 'days')));
      const byKey = new Map<string, TTTask>();
      for (const x of [...keep, ...fresh]) byKey.set(`${x.id}|${x.completedTime}`, x);
      this.cache.completed = [...byKey.values()].sort((a, b) => ((a.completedTime ?? '') < (b.completedTime ?? '') ? 1 : -1));

      // focus records, pomodoro (0) and stopwatch (1): 90 days on full sync else 7
      const fd = full ? 90 : 7;
      const focus: TTCache['focus'] = [];
      for (const type of [0, 1] as const) {
        for (let end = M(); end.isAfter(M().subtract(fd, 'days')); end = end.clone().subtract(30, 'days')) {
          const from = M.max(end.clone().subtract(30, 'days'), M().subtract(fd, 'days'));
          const r = await this.get<TTCache['focus']>(`/focus?from=${encodeURIComponent(ttTime(from))}&to=${encodeURIComponent(ttTime(end))}&type=${type}`).catch(() => []);
          for (const f of r ?? []) focus.push({ ...f, type });
          await sleep(80);
        }
      }
      if (full) this.cache.focus = focus;
      else {
        const fm = new Map(this.cache.focus.map((f) => [`${f.id}|${f.type}`, f]));
        for (const f of focus) fm.set(`${f.id}|${f.type}`, f);
        this.cache.focus = [...fm.values()];
      }
      const cutoff = M().subtract(120, 'days');
      this.cache.focus = this.cache.focus.filter((f) => M(f.startTime).isAfter(cutoff));

      let habitsOk = true;
      const habits = (await this.get<TTHabit[]>('/habit').catch(() => { habitsOk = false; return []; })) ?? [];
      this.cache.habitsOk = habitsOk;
      this.cache.habits = habits.filter((h) => h.status !== 1 && h.status !== 2);
      if (this.cache.habits.length) {
        const ids = this.cache.habits.map((h) => h.id).join(',');
        const r = await this.get<{ habitId: string; checkins?: { stamp: number }[] }[]>(`/habit/checkins?habitIds=${encodeURIComponent(ids)}&from=${ttStamp(M().subtract(120, 'days'))}&to=${ttStamp(M())}`).catch(() => []);
        const ci: TTCache['checkins'] = {};
        for (const row of r ?? []) {
          ci[row.habitId] = ci[row.habitId] ?? {};
          for (const c of row.checkins ?? []) ci[row.habitId][c.stamp] = c;
        }
        this.cache.checkins = ci;
      }
      this.cache.tags = (await this.get<TTCache['tags']>('/tag').catch(() => [])) ?? [];
      this.cache.groups = (await this.get<TTCache['groups']>('/project/group').catch(() => [])) ?? [];
      this.cache.countdowns = (await this.get<TTCache['countdowns']>('/countdown').catch(() => [])) ?? [];
      this.cache.syncedAt = Date.now();
      if (full) this.cache.fullAt = Date.now();
      await this.writeDoneTasks();
    } catch (e) {
      console.error('[Damascene] TickTick sync', e);
      this.error = (e as Error).message;
    }
    this.busy = false;
    this.emit();
    if (!this.error) await this.plugin.ticktickMirror?.run('full');
  }

  private async completedRange(from: Moment, to: Moment, depth = 0): Promise<TTTask[]> {
    const r = (await this.post<TTTask[]>('/task/completed', { startDate: ttTime(from), endDate: ttTime(to) }).catch(() => [])) ?? [];
    // the endpoint caps at 200; split the range until it doesn't
    if (r.length >= 200 && depth < 6 && to.diff(from, 'hours') > 12) {
      const mid = from.clone().add(to.diff(from) / 2, 'ms');
      return [...(await this.completedRange(from, mid, depth + 1)), ...(await this.completedRange(mid, to, depth + 1))];
    }
    return r;
  }

  project(id: string | undefined): TTProject | undefined { return this.cache.projects.find((p) => p.id === id); }
  projectColor(p: TTProject | undefined, i = 0): string {
    return p ? themedColor(p.color, this.cache.projects.indexOf(p)) : series(i);
  }
  openProjects(): TTProject[] { return this.cache.projects.filter((p) => !p.closed && (!p.kind || p.kind === 'TASK')); }
  defaultProjectId(): string { return this.plugin.settings.ticktick.defaultProject || this.cache.projects[0]?.id || ''; }
  due(x: TTTask): Moment | null { const d = x.dueDate || x.startDate; return d ? moment(d) : null; }

  /* writes are optimistic: the cache changes first and rolls back on failure */

  async create(x: Partial<TTTask>): Promise<void> {
    const body = { timeZone: timeZone(), ...x };
    const temp = { id: 'tmp' + Date.now(), status: 0, _pending: true, projectId: '', title: '', ...body } as TTTask;
    this.cache.tasks.push(temp);
    this.emit();
    try {
      const r = await this.post<TTTask>('/task', body);
      Object.assign(temp, r ?? {}, { _pending: false });
      new Notice(t('ticktick.notices.added'));
    } catch (e) {
      this.cache.tasks = this.cache.tasks.filter((y) => y !== temp);
      new Notice(t('ticktick.notices.addFailed', { error: (e as Error).message }));
    }
    this.emit();
  }

  async complete(x: TTTask): Promise<void> {
    const i = this.cache.tasks.indexOf(x);
    if (i < 0) return;
    this.cache.tasks.splice(i, 1);
    this.cache.completed.unshift({ ...x, status: 2, completedTime: ttTime(moment()) });
    this.emit();
    try {
      await this.post(`/project/${x.projectId}/task/${x.id}/complete`);
      await this.writeDoneTasks();
      if (x.repeatFlag) window.setTimeout(() => void this.sync(), 1500);
    } catch (e) {
      this.cache.tasks.splice(i, 0, x);
      this.cache.completed.shift();
      new Notice(t('ticktick.notices.completeFailed', { error: (e as Error).message }));
    }
    this.emit();
  }

  async completeMany(list: TTTask[]): Promise<void> {
    const byProject: Record<string, TTTask[]> = {};
    for (const x of list) (byProject[x.projectId] = byProject[x.projectId] ?? []).push(x);
    for (const [pid, ts] of Object.entries(byProject)) {
      for (const x of ts) {
        const i = this.cache.tasks.indexOf(x);
        if (i >= 0) this.cache.tasks.splice(i, 1);
        this.cache.completed.unshift({ ...x, status: 2, completedTime: ttTime(moment()) });
      }
      this.emit();
      try {
        await this.post('/task/completeTasks', { projectId: pid, taskIds: ts.map((x) => x.id).slice(0, 50) });
      } catch (e) {
        new Notice(t('ticktick.notices.completeFailed', { error: (e as Error).message }));
      }
    }
    await this.writeDoneTasks();
    this.emit();
  }

  async update(x: TTTask, patch: Partial<TTTask>): Promise<void> {
    const old = { ...x };
    Object.assign(x, patch);
    this.emit();
    try {
      const r = await this.post<TTTask>('/task/' + x.id, { id: x.id, projectId: x.projectId, ...patch });
      if (r) Object.assign(x, r);
    } catch (e) {
      Object.assign(x, old);
      new Notice(t('ticktick.notices.updateFailed', { error: (e as Error).message }));
    }
    this.emit();
  }

  setDay(x: TTTask, day: Moment | null): Promise<void> {
    if (!day) return this.update(x, { dueDate: null, startDate: null });
    const d = ttTime(day.clone().startOf('day'));
    return this.update(x, { dueDate: d, startDate: d, isAllDay: true, timeZone: x.timeZone || timeZone() });
  }

  postpone(x: TTTask, days: number): Promise<void> {
    const base = x.dueDate ? moment.max(moment(x.dueDate), moment().startOf('day')) : moment().startOf('day');
    const nd = base.clone().add(days, 'days');
    const patch: Partial<TTTask> = { dueDate: ttTime(nd), timeZone: x.timeZone || timeZone(), isAllDay: x.isAllDay !== false };
    if (x.startDate) patch.startDate = ttTime(nd);
    return this.update(x, patch);
  }

  async remove(x: TTTask): Promise<void> {
    const i = this.cache.tasks.indexOf(x);
    if (i < 0) return;
    this.cache.tasks.splice(i, 1);
    this.emit();
    try {
      await this.del(`/project/${x.projectId}/task/${x.id}`);
      this.plugin.ticktickMirror?.removed.add(x.id);
      new Notice(t('ticktick.notices.deleted'));
    } catch (e) {
      this.cache.tasks.splice(i, 0, x);
      new Notice(t('ticktick.notices.deleteFailed', { error: (e as Error).message }));
      this.emit();
    }
  }

  async moveTask(x: TTTask, toProjectId: string): Promise<void> {
    if (x.projectId === toProjectId) return;
    const from = x.projectId;
    x.projectId = toProjectId;
    this.emit();
    try {
      await this.post('/task/move', [{ fromProjectId: from, toProjectId, taskId: x.id }]);
    } catch (e) {
      x.projectId = from;
      new Notice(t('ticktick.notices.moveFailed', { error: (e as Error).message }));
    }
    this.emit();
  }

  async createProject(p: Partial<TTProject>): Promise<void> {
    try {
      const r = await this.post<TTProject>('/project', { kind: 'TASK', viewMode: 'list', ...p });
      if (r) this.cache.projects.push(r);
      new Notice(t('ticktick.notices.listCreated'));
    } catch (e) {
      new Notice(t('ticktick.notices.listFailed', { error: (e as Error).message }));
    }
    this.emit();
  }

  async updateProject(p: TTProject, patch: Partial<TTProject>): Promise<void> {
    const old = { ...p };
    Object.assign(p, patch);
    this.emit();
    try {
      const r = await this.post<TTProject>('/project/' + p.id, patch);
      if (r) Object.assign(p, r);
    } catch (e) {
      Object.assign(p, old);
      new Notice(t('ticktick.notices.updateFailed', { error: (e as Error).message }));
    }
    this.emit();
  }

  async deleteProject(p: TTProject): Promise<void> {
    const i = this.cache.projects.indexOf(p);
    const tasks = this.cache.tasks;
    this.cache.projects.splice(i, 1);
    this.cache.tasks = tasks.filter((x) => x.projectId !== p.id);
    this.emit();
    try {
      await this.del('/project/' + p.id);
      new Notice(t('ticktick.notices.listDeleted'));
    } catch (e) {
      this.cache.projects.splice(i, 0, p);
      this.cache.tasks = tasks;
      new Notice(t('ticktick.notices.deleteFailed', { error: (e as Error).message }));
      this.emit();
    }
  }

  async comments(x: TTTask): Promise<{ id: string; title: string; createdTime?: string }[]> {
    return (await this.get<{ id: string; title: string; createdTime?: string }[]>(`/project/${x.projectId}/task/${x.id}/comments`).catch(() => [])) ?? [];
  }
  addComment(x: TTTask, text: string) { return this.post(`/project/${x.projectId}/task/${x.id}/comment`, { title: text }); }
  deleteComment(x: TTTask, id: string) { return this.del(`/project/${x.projectId}/task/${x.id}/comment/${id}`); }

  async createFocus(f: Omit<TTCache['focus'][number], 'id'>): Promise<void> {
    const temp = { id: 'tmp' + Date.now(), ...f };
    this.cache.focus.push(temp);
    this.emit();
    try {
      const r = await this.post<TTCache['focus'][number]>('/focus', f);
      if (r) Object.assign(temp, r);
    } catch (e) {
      new Notice(t('ticktick.notices.focusFailed', { error: (e as Error).message }));
    }
    this.emit();
  }

  async createHabit(h: Partial<TTHabit>): Promise<TTHabit | null> {
    try {
      const r = await this.post<TTHabit>('/habit', { type: 'Boolean', goal: 1, step: 1, unit: 'Count', repeatRule: 'RRULE:FREQ=DAILY;INTERVAL=1', recordEnable: false, ...h });
      if (r) this.cache.habits.push(r);
      this.emit();
      return r;
    } catch (e) {
      new Notice(t('ticktick.notices.habitFailed', { error: (e as Error).message }));
      return null;
    }
  }

  async updateHabit(h: TTHabit, patch: Partial<TTHabit>): Promise<void> {
    Object.assign(h, patch);
    this.emit();
    try { await this.post('/habit/' + h.id, patch); } catch (e) {
      new Notice(t('ticktick.notices.habitFailed', { error: (e as Error).message }));
    }
  }

  async checkin(h: TTHabit, day: Moment, on: boolean): Promise<void> {
    const stamp = ttStamp(day);
    const ci = (this.cache.checkins[h.id] = this.cache.checkins[h.id] ?? {});
    const goal = h.goal || 1;
    const prev = ci[stamp];
    ci[stamp] = { stamp, value: on ? goal : 0, goal, status: on ? 2 : 0 };
    this.emit();
    try {
      await this.post(`/habit/${h.id}/checkin`, { stamp, value: on ? goal : 0, goal, status: on ? 2 : 0, opTime: ttTime(moment()) });
    } catch (e) {
      if (prev) ci[stamp] = prev;
      else delete ci[stamp];
      new Notice(t('ticktick.notices.habitFailed', { error: (e as Error).message }));
      this.emit();
    }
  }

  /** Mirror today's completions into a "Done Tasks" section of the daily note. */
  async writeDoneTasks(): Promise<void> {
    if (!this.plugin.settings.ticktick.doneToDaily) return;
    const now = moment();
    const f = this.plugin.paths.dailyFile(now);
    if (!(f instanceof TFile)) return;
    const today = this.cache.completed.filter((x) => moment(x.completedTime).isSame(now, 'day'));
    if (!today.length) return;
    const heading = t('ticktick.doneHeading');
    await this.app.vault.process(f, (data) => {
      const L = data.split('\n');
      // older notes used the English heading; recognise both
      const h = L.findIndex((l) => /^#{1,6}\s/.test(l) && (/Done Tasks/i.test(l) || l.includes(heading)));
      const lines = today.map((x) => `- [x] ${x.title} <!--tt:${x.id}-->`);
      if (h < 0) return data.replace(/\s*$/, '') + `\n\n## ${heading}\n` + lines.join('\n') + '\n';
      let end = h + 1;
      while (end < L.length && !/^#{1,6}\s/.test(L[end]) && !/^---\s*$/.test(L[end])) end++;
      const kept = L.slice(h + 1, end).filter((l) => !/^\s*-\s\[ \]\s*$/.test(l));
      for (const ln of lines) {
        const id = ln.match(/tt:([^>]+)-->/)![1];
        if (kept.some((k) => k.includes('tt:' + id))) continue;
        let at = kept.length;
        while (at > 0 && !kept[at - 1].trim()) at--;
        kept.splice(at, 0, ln);
      }
      return [...L.slice(0, h + 1), ...kept, ...L.slice(end)].join('\n');
    });
  }
}
